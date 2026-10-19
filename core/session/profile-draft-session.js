// @ts-check
"use strict";

const {LAYERS, validateSnapshot, fingerprint, fingerprintOf, summaryOf} = require("../model/portable-profile");
const {layerOrderReview, profileReview} = require("../model/profile-review");
const {IDENTITY, compose, inverse, isIdentity, layerUnit, rearranged} = require("../model/layer-order");
const {layerName: layerCalled} = require("../model/vocabulary");
const {revertUnits} = require("../model/profile-revert");
const {keyPlacementProblem} = require("../model/profile-placement");
const {LEVELS: CHECK_LEVELS} = require("../model/layer-reach");
const {draftProfileChecks} = require("../model/profile-checks");
const {editSettings} = require("../model/settings-editor");
const {editMacro} = require("../model/macro-editor");
const {editCustomKey} = require("../model/custom-key-editor");
const {editKeyboardName} = require("../model/keyboard-name");
const {editDeviceProfile} = require("../model/device-profile-edits");
const {DRAFT_EDITS, editedBy, draftEditLabel} = require("../model/draft-edits");
const {actionName, knownActionAbi, layerOfRef, nativeCode} = require("../schema/actions");
const {effectiveComboTerm} = require("../schema/combo-domain-v1");
const {SETTING} = require("../schema/settings-domain-v1");
const {resolveNativeQmkExpression} = require("../schema/compiled-profile-v1");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, matrixPosition} = require("../data/charybdis-layout");
const keycodes = require("../data/keycode-catalog");
/**
 * @typedef {import("../model/types.js").PortableDocument} Document
 * @typedef {import("../model/types.js").ProfileSnapshot} Snapshot
 * @typedef {import("../model/types.js").CompleteSnapshot} Complete
 * @typedef {import("../model/types.js").DecodedProfile} Decoded
 * @typedef {import("../../contracts/model.js").ReviewChange} Review
 * @typedef {import("../model/types.js").ModelReviewChange} ModelReview
 * @typedef {import("./types.js").DraftEdit} Edit
 * @typedef {readonly number[]} Order
 * @typedef {{readonly document: Document, readonly origin: string | null, readonly label: string | null, readonly at: number, readonly order: Order}} HistoryEntry
 * @typedef {{decoded: Decoded, fingerprint: string, summary: import("../model/types.js").ProfileSummary}} DecodeEntry
 * @typedef {{snapshot: Complete, order: Order | null}} Reference
 */
/** @template T @param {T} value @returns {T} */
const copy = value => JSON.parse(JSON.stringify(value));
// History entries are frozen: they are handed out by reference, decoded once
// and kept, so nothing may edit one in place.
/** @template T @param {T} value @returns {T} */
const freeze = value => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.values(value).forEach(child => freeze(child));
        Object.freeze(value);
    }
    return value;
};
/** @param {string} text */
const fail = text => Object.assign(new Error(text), {code: "PROFILE_DRAFT_CONFLICT"});

// What one Rename & Reorder save did: the order it changed and the names it
// changed, each named as the layers were called before it.
/** @param {Order} step @param {string[]} before @param {string[]} after */
function layersLabel(step, before, after) {
    const moved = step.map((from, slot) => slot).filter(slot => step[slot] !== slot);
    const renamed = step.map((from, slot) => [from, slot]).filter(([from, slot]) => layerCalled(before, from) !== layerCalled(after, slot));
    const parts = [];
    if (moved.length === 2) parts.push(`Swapped ${layerCalled(before, moved[0])} and ${layerCalled(before, moved[1])}`);
    else if (moved.length) parts.push("Reordered layers");
    if (renamed.length === 1) parts.push(`Renamed ${layerCalled(before, renamed[0][0])} to ${layerCalled(after, renamed[0][1])}`);
    else if (renamed.length) parts.push(`Renamed ${renamed.length} layers`);
    return parts.map((part, index) => index ? part[0].toLowerCase() + part.slice(1) : part).join(", ") || "Edited layers";
}

// Review items name what the model cannot: the keycode a behaviour is listed
// under, the name its edit messages use, so the review can go there.
/** @param {ModelReview} item @returns {Review} */
function placed(item) {
    const {place, ...review} = item;
    if (place?.kind === "behaviour") return {...review, place: {kind: "behaviour", keycode: actionName(place.target)}};
    return {...review, place};
}

class ProfileDraftSession {
    /** @param {Snapshot} snapshot @param {string | null | undefined} deviceId @param {import("../model/types.js").ProfileDestination} capabilities @param {import("./types.js").ConnectionToken} [connectionToken] */
    constructor(snapshot, deviceId, capabilities, connectionToken = null) {
        if (!deviceId || snapshot.incomplete || capabilities.compiledLayerCount !== LAYERS) throw fail(`Read a complete ${LAYERS}-layer profile before editing.`);
        // Every edit reads or writes keycodes, which only firmware numbering its
        // keys as this app does can be trusted with.
        if (!knownActionAbi(capabilities.actionAbiDigest ?? 0)) throw fail("This keyboard's firmware numbers its keys differently from this app. Update both halves before editing.");
        validateSnapshot(snapshot.document, capabilities);
        this.deviceId = deviceId;
        this.connectionToken = connectionToken ?? null;
        this.latestConnectionToken = this.connectionToken;
        this.connectionChanged = false;
        // Web Crypto, which Node and the browser both have, so one line serves both hosts.
        this.id = globalThis.crypto.randomUUID();
        this.capabilities = copy(capabilities);
        this.latestCapabilities = copy(capabilities);
        /** @type {Snapshot} */
        this.base = copy(snapshot);
        /** @type {Snapshot} */
        this.latest = copy(snapshot);
        this.hostOs = copy(snapshot.hostOs ?? null);
        this.history = [this.historyEntry(snapshot.document)];
        this.cursor = 0;
        this.revision = 1;
        /** @type {number | null} */
        this.reviewedRevision = null;
    }
    /** @type {WeakMap<Document, DecodeEntry> | undefined} */
    decodeCache;
    /** @type {WeakMap<Order, {base: Snapshot, reference: Reference}> | undefined} */
    referenceCache;
    /** @type {WeakMap<Document, {previous: Document, before: Order, after: Order, rows: Review[]}> | undefined} */
    reviewCache;
    /** @type {WeakMap<Document, {previous: Document, units: string[]}> | undefined} */
    stepCache;
    /** @type {WeakMap<Decoded, {keyboard: Decoded | null | undefined, order: Order, checks: import("../../contracts/model.js").Check[]}> | undefined} */
    checksCache;
    /** @type {boolean | undefined} */
    needsRead;
    now() {return Date.now();}
    // A step keeps its document, edit grouping, words, time and layer order
    // together. All of them stay fixed as undo, branching and trimming move it.
    /** @param {Document} document @param {string | null} [origin] @param {string | null} [label] @param {Order} [order] @returns {HistoryEntry} */
    historyEntry(document, origin = null, label = null, order = IDENTITY) {
        return freeze({document: copy(document), origin, label, at: this.now(), order: [...order]});
    }
    get document() {return copy(this.history[this.cursor].document);}
    get order() {return this.history[this.cursor].order;}
    // A history entry decoded once: its validated form (read-only), its
    // fingerprint and summary. Entries are never edited in place, so the
    // answer is kept with the entry for as long as the entry exists.
    /** @param {Document} document @returns {DecodeEntry} */
    decode(document) {
        this.decodeCache ??= new WeakMap();
        let known = this.decodeCache.get(document);
        if (!known) {
            const decoded = validateSnapshot(document, this.capabilities);
            known = {decoded, fingerprint: fingerprintOf(decoded), summary: summaryOf(decoded)};
            this.decodeCache.set(document, known);
        }
        return known;
    }
    // Detection is volatile readback, never a document edit or history entry.
    // Both Review sides use the latest detection and their own saved override.
    get snapshotFacts() {return {...this.base, hostOs: this.hostOs};}
    // The draft's revision as a snapshot: the base's keyboard facts with this
    // revision's document, plus its decoded form for read-only consumers.
    /** @returns {Complete & {decoded: Decoded}} */
    get current() {
        const {decoded, fingerprint: print, summary: brief} = this.decode(this.history[this.cursor].document);
        return {...this.snapshotFacts, incomplete: false, document: this.history[this.cursor].document, fingerprint: print, summary: brief, decoded};
    }
    // The keyboard's side as a snapshot, decoded once too.
    get baseSnapshot() {
        const base = this.base;
        return base.incomplete ? base : {...base, hostOs: this.hostOs, decoded: this.decode(base.document).decoded};
    }
    // The keyboard's side when it is complete, for a comparison with the draft.
    // Review and discard turn a recovery base away before they compare, so
    // reaching this with one is a mistake, not a state to show.
    /** @returns {Complete & {decoded: Decoded}} */
    get completeBase() {
        const base = this.baseSnapshot;
        if (base.incomplete) throw fail("Read a complete profile before comparing it with the draft.");
        return base;
    }
    get dirty() {return this.decode(this.history[this.cursor].document).fingerprint !== this.base.fingerprint;}
    get stale() {return Boolean(this.needsRead || this.connectionChanged || this.latest.fingerprint !== this.base.fingerprint);}
    /** @param {import("./types.js").ConnectionToken} connectionToken */
    noteConnection(connectionToken) {
        const token = connectionToken ?? null;
        if (token !== this.connectionToken && token !== this.latestConnectionToken) {
            this.connectionChanged = true;
            this.needsRead = true;
        }
    }
    // Whether this draft belongs to the keyboard `state` describes: the one it
    // was read from, connected through the connection it was read over. ""
    // when it does, otherwise why not. Apply asks it of the device service;
    // the panel adds what it knows besides (panel-session-state.js draftBinding).
    /** @param {import("./types.js").DraftDeviceContext} state @returns {"" | "other-keyboard" | "disconnected" | "connection-changed"} */
    bindingTo(state) {
        if (state.selectedDeviceId !== this.deviceId) return "other-keyboard";
        if (!state.connected) return "disconnected";
        if ((state.connectionToken ?? null) !== this.connectionToken) return "connection-changed";
        return "";
    }
    /** @param {Snapshot | null | undefined} snapshot @param {string | null | undefined} deviceId @param {import("./types.js").ConnectionToken} [connectionToken] @param {import("../model/types.js").ProfileDestination} [capabilities] */
    observe(snapshot, deviceId, connectionToken = null, capabilities = this.capabilities) {
        if (!snapshot || deviceId !== this.deviceId) return;
        this.latestCapabilities = copy(capabilities);
        const dirty = this.dirty;
        if (!dirty && !snapshot.incomplete && JSON.stringify(capabilities) !== JSON.stringify(this.capabilities)) {
            validateSnapshot(snapshot.document, capabilities);
            this.acceptCapabilities(capabilities);
            this.reset(snapshot);
        }
        const token = connectionToken ?? null;
        this.latestConnectionToken = token;
        if (token !== this.connectionToken) {
            if (dirty) this.connectionChanged = true;
            else {this.connectionToken = token; this.connectionChanged = false;}
        }
        this.needsRead = false;
        if (snapshot.incomplete) {this.latest = copy(snapshot); return;}
        const hostOs = copy(snapshot.hostOs ?? null);
        if (JSON.stringify(hostOs) !== JSON.stringify(this.hostOs)) {
            this.hostOs = hostOs;
            this.referenceCache = new WeakMap();
            this.reviewCache = new WeakMap();
            this.checksCache = new WeakMap();
        }
        if (!dirty) {
            if (snapshot.fingerprint !== this.base.fingerprint) this.reset(snapshot);
            else {this.base = copy(snapshot); this.latest = copy(snapshot);}
        } else this.latest = copy(snapshot);
    }
    /** @param {number | undefined} revision @param {{allowStale?: boolean}} [options] */
    assertRevision(revision, {allowStale = false} = {}) {
        if (revision !== this.revision) throw fail("The draft changed. Review the current changes before continuing.");
        if (this.stale && !allowStale) throw fail("The keyboard changed. Review your draft against the latest keyboard state before continuing.");
    }
    /** @param {Complete} snapshot */
    reset(snapshot) {
        this.base = copy(snapshot); this.latest = copy(snapshot);
        this.hostOs = copy(snapshot.hostOs ?? null);
        this.referenceCache = new WeakMap();
        this.reviewCache = new WeakMap();
        this.history = [this.historyEntry(snapshot.document)]; this.cursor = 0;
        this.revision++; this.reviewedRevision = null;
        this.needsRead = false;
        this.connectionChanged = false;
    }
    // A retained dirty draft keeps its original interpretation until rebase.
    // Once the current keyboard is accepted, no cached decode or review may
    // retain the old keyboard's capacities.
    /** @param {import("../model/types.js").ProfileDestination} capabilities */
    acceptCapabilities(capabilities) {
        if (JSON.stringify(capabilities) === JSON.stringify(this.capabilities)) return;
        this.capabilities = copy(capabilities);
        this.decodeCache = new WeakMap();
        this.referenceCache = new WeakMap();
        this.reviewCache = new WeakMap();
        this.stepCache = new WeakMap();
        this.checksCache = new WeakMap();
    }
    // A new entry keeps the entry's layer order unless it says otherwise.
    /** @param {Document} document @param {number} revision @param {string} [origin] @param {string | null} [label] @param {Order} [order] */
    replace(document, revision, origin = "edit", label = null, order = this.order) {
        this.assertRevision(revision);
        const valid = validateSnapshot(document, this.capabilities).document;
        if (fingerprint(valid) === this.decode(this.history[this.cursor].document).fingerprint) return;
        this.history = this.history.slice(0, this.cursor + 1);
        this.history.push(this.historyEntry(valid, origin, label, order));
        if (this.history.length > 101) this.history.shift();
        this.cursor = this.history.length - 1;
        this.revision++; this.reviewedRevision = null;
    }
    // Each edit goes to the editor model/draft-edits.js names for its type.
    // The whole-document editors check the form against the draft it was
    // drawn from, this revision when it names none; the profile's domain
    // editors check the identity the form was read with.
    /** @param {Edit} message */
    stage(message) {
        this.assertRevision(message.draftRevision);
        const current = this.current, before = current.fingerprint;
        let document;
        if (editedBy(message, "settings")) document = editSettings(current, {...message, expectedFingerprint: message.expectedFingerprint || before}, this.capabilities);
        else if (editedBy(message, "macro")) document = editMacro(current, {...message, expectedFingerprint: message.expectedFingerprint || before}, this.capabilities);
        else if (editedBy(message, "customKey")) {
            document = editCustomKey(current, {...message, expectedFingerprint: message.expectedFingerprint || before}, this.capabilities);
            // A custom key made for a shortcut is put to use in the same step
            // (a layout key, a behaviour cell), so one undo takes both back
            // (D-L63).
            const then = "then" in message ? message.then : undefined;
            if (then) document = this.editFollowing(then, document);
        }
        else if (editedBy(message, "keyboardName")) document = editKeyboardName(current, {...message, expectedFingerprint: message.expectedFingerprint || before}, this.capabilities);
        else if (editedBy(message, "layout")) document = this.editLayout(message);
        else if (editedBy(message, "profile")) document = this.editProfile(message, current.document);
        else throw fail("Unsupported draft edit.");
        this.replace(document, message.draftRevision, "edit", draftEditLabel(message, current.document));
        return {message: copy(message), previousFingerprint: before, fingerprint: this.decode(this.history[this.cursor].document).fingerprint};
    }
    // One profile-domain edit, checked against the draft's base, on `base`.
    /** @param {import("../model/device-profile-edits.js").ProfileEdit} message @param {Document} base @returns {Document} */
    editProfile(message, base) {
        const expected = "expectedBase" in message ? message.expectedBase : undefined;
        if (expected && (/** @type {const} */ (["source", "generation", "digest", "originHalf"])).some(key => expected[key] !== this.identity()[key])) throw fail("This form belongs to an older draft. Reload it before keeping changes.");
        return {...base, profile: editDeviceProfile(Buffer.from(base.profile, "base64"), message, {
            capabilities: this.capabilities,
            combos: this.combos(), maximumBrightness: this.current.limits?.brightnessMax,
        }).toString("base64")};
    }
    // The edit a custom key made for a shortcut carries: a layout key or a
    // behaviour, staged on the document that already holds the key (D-L63).
    /** @param {{type: string}} message @param {Document} base @returns {Document} */
    editFollowing(message, base) {
        if (message.type === "updateLayoutKeys") return this.editLayout(/** @type {import("../../contracts/edits.js").EditOf<"updateLayoutKeys">} */ (message), base);
        if (message.type === "saveBehavior") return this.editProfile(/** @type {import("../../contracts/edits.js").EditOf<"saveBehavior">} */ (message), base);
        throw fail("A custom key made for a shortcut goes on a key or in a behaviour.");
    }
    // A Rename & Reorder save: its document, and the order it saved, which
    // rearranges this revision. An order and each name are separate
    // decisions, so the step links nothing in the review.
    /** @param {Document} document @param {number} revision @param {Order} step */
    editLayers(document, revision, step) {
        const before = this.current.decoded.settings.names, after = validateSnapshot(document, this.capabilities).settings.names;
        this.replace(document, revision, "layers", layersLabel(step, before, after), compose(this.order, step));
    }
    // A layout message is untrusted like any other: its layer and every key
    // are checked before anything is written.
    /** @param {Pick<import("../../contracts/edits.js").EditOf<"updateLayoutKeys">, "layer" | "changes">} message @param {Document} [base] */
    editLayout({layer: reference, changes}, base = this.document) {
        const layer = layerOfRef(reference);
        if (layer === undefined || !(layer < LAYERS) || !Array.isArray(changes)) throw fail("Choose a layer reported by this keyboard.");
        const document = copy(base);
        const layers = validateSnapshot(base).layers;
        for (const change of changes) {
            const position = Number.isInteger(change.layoutIndex) && CHARYBDIS_4X6_LAYOUT_MATRIX[change.layoutIndex];
            const code = keycodes.encode(change.keycode) ?? (knownActionAbi(this.capabilities.actionAbiDigest ?? 0) ? resolveNativeQmkExpression(change.keycode, {}) : undefined);
            if (!position || code === undefined || !Number.isInteger(code)) throw fail(`Cannot represent the key ${change.keycode} on this keyboard.`);
            const misplaced = keyPlacementProblem(code, {layerCount: this.capabilities.compiledLayerCount ?? LAYERS});
            if (misplaced) throw fail(misplaced);
            layers[layer][matrixPosition(change.layoutIndex)] = code;
        }
        document.profile = require("../schema/profile-domains").replaceDomain(Buffer.from(base.profile, "base64"), 0x60, () => require("../schema/keymap-domain-v1").encodeKeymapDomain(layers)).toString("base64");
        return document;
    }
    // The keyboard's profile rearranged into an order, with the order it
    // stands for; the keyboard's own profile, and no order, when the order
    // moves nothing, including a reorder nothing can tell apart.
    /** @param {Order} order @returns {Reference} */
    referenceFor(order) {
        const base = this.completeBase;
        if (isIdentity(order)) return {snapshot: base, order: null};
        this.referenceCache ??= new WeakMap();
        const known = this.referenceCache.get(order);
        if (known?.base === this.base) return known.reference;
        const decoded = validateSnapshot(rearranged(base.document, order), this.capabilities), print = fingerprintOf(decoded);
        /** @type {Reference} */
        const reference = print === this.base.fingerprint ? {snapshot: base, order: null}
            : {snapshot: {...base, document: decoded.document, decoded, fingerprint: print, summary: summaryOf(decoded)}, order};
        this.referenceCache.set(order, {base: this.base, reference});
        return reference;
    }
    // What a document in an order differs from the keyboard by: the order,
    // then everything else compared with the reference.
    /** @param {Document} document @param {Order} order @returns {ModelReview[]} */
    describe(document, order) {
        const {snapshot, order: moved} = this.referenceFor(order);
        /** @type {Complete} */
        const after = {...this.snapshotFacts, incomplete: false, document, ...this.decode(document)};
        return [...(moved ? [layerOrderReview(after, moved)] : []), ...profileReview(snapshot, after, this.capabilities)];
    }
    // The review rows, each with the group it belongs to. Rows are grouped by
    // the edits that made them: the units one staged message changed belong
    // together (a swap, a moved behaviour), and so does
    // anything linked to them through a later edit. Only units the review
    // still shows link; a unit edited back to the keyboard's value no longer
    // ties anything. Steps from a rebase, a discard, Rename & Reorder, or before
    // the bounded history leave their units on their own. Units link by the
    // layer they belong to, not the slot, so a reorder between two edits
    // never ties two different layers' keys.
    /** @returns {Review[]} */
    changes() {
        if (!this.dirty) return [];
        const current = this.current;
        if (this.base.incomplete) return [{area: "Recovery", unit: null, title: "Complete profile", status: "changed", group: null, place: null,
            fields: [{label: "", before: "Interrupted configuration; a full comparison is unavailable", after: `${current.summary.layers} layers, ${current.summary.behaviors} behaviours, ${current.summary.combos} combos, ${current.summary.macros} macros with content, lighting and settings`}]}];
        const rows = this.describe(current.document, this.order), shown = new Set(rows.map(row => layerUnit(row.unit, this.order)));
        const parent = new Map([...shown].map(unit => [unit, unit]));
        /** @param {string} unit @returns {string} */
        const find = unit => {while (parent.get(unit) !== unit) unit = /** @type {string} */ (parent.get(unit)); return unit;};
        const steps = [];
        for (let step = 1; step <= this.cursor; step++) {
            if (this.history[step].origin !== "edit") continue;
            const touched = this.stepUnits(step).map(unit => layerUnit(unit, this.history[step].order)).filter(unit => shown.has(unit));
            for (const unit of touched.slice(1)) parent.set(find(unit), find(touched[0]));
            if (touched.length) steps.push({label: this.history[step].label, unit: touched[0]});
        }
        // A group is titled by the edits that made it, in the order they were
        // made: one edit by its own words, several by the first and a count.
        /** @type {Map<string, string[]>} */
        const titles = new Map();
        for (const {label, unit} of steps) {
            const root = find(unit), list = titles.get(root) || [];
            if (label && !list.includes(label)) list.push(label);
            titles.set(root, list);
        }
        /** @param {string[] | undefined} list */
        const title = list => !list?.length ? null : list.length === 1 ? list[0] : `${list[0]} and ${list.length - 1} more edit${list.length === 2 ? "" : "s"}`;
        const groups = new Map();
        return rows.map(row => {
            const root = find(layerUnit(row.unit, this.order));
            if (!groups.has(root)) groups.set(root, groups.size);
            return placed({...row, group: groups.get(root), groupTitle: title(titles.get(root))});
        });
    }
    // The units one history step changed, remembered with the entry: history
    // entries are never edited in place, so the answer never goes stale.
    /** @param {number} step @returns {string[]} */
    stepUnits(step) {
        this.stepCache ??= new WeakMap();
        const entry = this.history[step].document, previous = this.history[step - 1].document, cached = this.stepCache.get(entry);
        if (cached?.previous === previous) return cached.units;
        /** @param {Document} document @returns {Complete} */
        const snapshot = document => ({...this.snapshotFacts, incomplete: false, document, ...this.decode(document)});
        const units = [...new Set(profileReview(snapshot(previous), snapshot(entry), this.capabilities).map(row => row.unit))];
        this.stepCache.set(entry, {previous, units});
        return units;
    }
    // The draft history, oldest first: every entry with when it was made, in
    // the words it was recorded with, and what it changed from the entry
    // before it (not from the keyboard). A step that moved layers compares
    // against the entry before it moved the same way, so a reorder is one
    // item and everything else is compared layer with layer. The first
    // entry has nothing before it: where the draft began, or the oldest one
    // the bounded history still keeps.
    steps() {
        return this.history.map((entry, step) => ({
            step, at: entry.at, origin: entry.origin,
            label: entry.label || (step ? "Reviewed against the keyboard" : "Read from the keyboard"),
            current: step === this.cursor, undone: step > this.cursor,
            changes: step ? this.stepReview(step) : null,
        }));
    }
    /** @param {number} step @returns {Review[]} */
    stepReview(step) {
        this.reviewCache ??= new WeakMap();
        const entry = this.history[step].document, previous = this.history[step - 1].document, cached = this.reviewCache.get(entry);
        const before = this.history[step - 1].order, after = this.history[step].order;
        if (cached?.previous === previous && cached.before === before && cached.after === after) return cached.rows;
        /** @param {Document} document @returns {Complete} */
        const snapshot = document => ({...this.snapshotFacts, incomplete: false, document, ...this.decode(document)});
        const back = inverse(before), moved = Object.freeze(after.map(layer => back[layer]));
        const now = snapshot(entry);
        const rows = isIdentity(moved) ? profileReview(snapshot(previous), now, this.capabilities)
            : [layerOrderReview(now, moved), ...profileReview(snapshot(validateSnapshot(rearranged(previous, moved), this.capabilities).document), now, this.capabilities)];
        const shown = rows.map(placed);
        this.reviewCache.set(entry, {previous, before, after, rows: shown});
        return shown;
    }
    // Discard one group of review rows: its units go back to what the keyboard
    // holds, as one more undoable step. A review that was current stays
    // current, since what is left is part of what was reviewed.
    /** @param {number} revision @param {number} group */
    discard(revision, group) {
        this.assertRevision(revision);
        if (this.base.incomplete) throw fail("Review this recovery as a whole; its changes cannot be discarded one by one.");
        const items = this.changes().filter(row => row.group === group), units = new Set(items.map(row => /** @type {string} */ (row.unit)));
        if (!units.size) throw fail("That change is no longer in the draft.");
        const reviewed = this.reviewedRevision === revision;
        // The order goes back by moving the layers back, so everything else
        // moves with its layer and stays; anything else goes back to the
        // reference, so the order stays.
        let document, order = this.order;
        if (units.has("layerOrder")) {
            if (units.size > 1) throw fail("Discard the layer order on its own.");
            document = rearranged(this.current.document, inverse(order));
            order = IDENTITY;
        } else document = revertUnits(this.referenceFor(order).snapshot, this.current, units, this.capabilities);
        // Some bytes carry no row of their own, such as reserved macro-bank padding. Once nothing described is left, the draft is
        // the keyboard's profile again, not an indescribable difference.
        const left = this.describe(validateSnapshot(document, this.capabilities).document, order);
        if (left.every(row => row.unit === "profile")) {document = copy(validateSnapshot(this.base.document, this.capabilities).document); order = IDENTITY;}
        const label = units.has("layerOrder") ? "Put the layer order back" : items.length === 1 ? `Discarded ${items[0].title}` : `Discarded ${items.length} changes made together`;
        this.replace(document, revision, "discard", label, order);
        if (reviewed) this.reviewedRevision = this.revision;
    }
    // Discard the whole draft as one more step, so undo brings it back: the
    // keyboard is not read again, since nothing about it changed.
    /** @param {number} revision */
    discardAll(revision) {
        this.assertRevision(revision);
        if (this.base.incomplete) throw fail("Read the keyboard again to discard a recovery draft.");
        if (!this.dirty) return;
        const count = this.changes().length;
        this.replace(validateSnapshot(this.base.document, this.capabilities).document, revision, "discard", `Discarded the draft (${count} change${count === 1 ? "" : "s"})`, IDENTITY);
    }
    /** @param {number} revision */
    undo(revision) {this.assertRevision(revision); if (this.cursor) {this.cursor--; this.revision++; this.reviewedRevision = null;}}
    /** @param {number} revision */
    redo(revision) {this.assertRevision(revision); if (this.cursor + 1 < this.history.length) {this.cursor++; this.revision++; this.reviewedRevision = null;}}
    // Several undos or redos at once: straight to one entry of the history.
    /** @param {number} revision @param {number} step */
    jump(revision, step) {
        this.assertRevision(revision);
        if (!Number.isInteger(step) || step < 0 || step >= this.history.length) throw fail("That step is no longer in the draft history.");
        if (step !== this.cursor) {this.cursor = step; this.revision++; this.reviewedRevision = null;}
    }
    /** @param {number} revision */
    review(revision) {this.assertRevision(revision); this.reviewedRevision = this.revision;}
    // Leaving the review un-reviews the draft, even one gone stale meanwhile.
    /** @param {number} revision */
    closeReview(revision) {this.assertRevision(revision, {allowStale: true}); this.reviewedRevision = null;}
    /** @param {number} revision */
    rebase(revision) {
        this.assertRevision(revision, {allowStale: true});
        if (this.needsRead) throw fail("Read the latest keyboard state before reviewing this draft again.");
        const target = this.document, order = this.order;
        // Check before changing the draft, so a smaller destination preserves
        // the retained edits and their original interpretation on refusal.
        validateSnapshot(target, this.latestCapabilities);
        this.acceptCapabilities(this.latestCapabilities);
        if (this.latest.incomplete) {
            this.base = copy(this.latest); this.history = [this.historyEntry(target)]; this.cursor = 0;
            this.connectionToken = this.latestConnectionToken; this.connectionChanged = false;
            this.revision++; this.reviewedRevision = this.revision; return;
        }
        this.reset(this.latest);
        this.connectionToken = this.latestConnectionToken;
        // The order carries over: the reference and the items still describe
        // the whole difference to the keyboard read now.
        this.replace(target, this.revision, "rebase", null, order);
        this.reviewedRevision = this.revision;
    }
    /** @param {import("./types.js").DraftApplyService} service @param {number} revision @param {import("./types.js").SaveRecovery} saveRecovery */
    async apply(service, revision, saveRecovery) {
        this.assertRevision(revision);
        if (!this.dirty || this.reviewedRevision !== revision) throw fail("Review the current draft before applying it.");
        if (this.hasBlockers()) throw fail("Resolve the review's blockers before applying this profile.");
        const bound = this.bindingTo(service.snapshot());
        if (bound === "connection-changed") throw fail("Review this draft against the connected keyboard before applying it.");
        if (bound) throw fail("Reconnect the keyboard this draft belongs to.");
        try {
            const result = await service.restorePortableProfile(this.document, {expectedFingerprint: this.base.fingerprint, saveRecovery});
            if (result.fingerprint !== this.current.fingerprint) {this.needsRead = true; throw fail("The saved profile did not match the draft. Keep the recovery copy and read the keyboard again.");}
            this.reset(result);
            return result;
        } catch (error) {
            if (["RESTORE_INCOMPLETE", "RESTORE_NOT_SAVED", "PROFILE_CHANGED", "RESTORE_VERIFY_FAILED"].includes(/** @type {Error & {code: string}} */ (error).code)) this.needsRead = true;
            throw error;
        }
    }
    // What the layer walk finds in this revision beside the keyboard as it is,
    // matched layer with layer through this revision's order
    // (model/layer-reach.js), kept with the entry and the keyboard it was
    // compared with.
    checks() {
        const draft = this.current.decoded, order = this.order;
        const keyboard = this.base.incomplete ? undefined : this.baseSnapshot.decoded;
        this.checksCache ??= new WeakMap();
        const known = this.checksCache.get(draft);
        if (known && known.keyboard === keyboard && known.order === order) return known.checks;
        const checks = draftProfileChecks(keyboard ?? null, draft, order, {brightnessMax: this.current.limits?.brightnessMax,
            detectedHostOs: this.current.hostOs?.detected,
            effects: this.current.options?.effects});
        this.checksCache.set(draft, {keyboard, order, checks});
        return checks;
    }
    // Whether Apply has to be confirmed: active traps and warnings matter
    // whether the draft introduced them or the keyboard already has them.
    hasChecksToConfirm() {return this.checks().some(check => check.status !== "fixed" && (/** @type {string[]} */ ([CHECK_LEVELS.TRAP, CHECK_LEVELS.WARNING])).includes(check.level));}
    hasBlockers() {return this.checks().some(check => check.status !== "fixed" && check.level === "blocker");}
    identity() {return {source: "draft", generation: this.revision, digest: this.decode(this.history[this.cursor].document).fingerprint, originHalf: this.deviceId};}
    // The draft's combos as the keyboard would report them: every window as
    // it resolves, and whether it follows the default.
    /** @returns {Extract<import("./types.js").ComboRead, {state: "read"}>} */
    combos() {
        const {combos, settings} = this.decode(this.history[this.cursor].document).decoded;
        // The constructor gates the action ABI, and all stored actions have native codes.
        /** @param {import("../schema/types.js").SemanticAction} action */
        const native = action => /** @type {number} */ (nativeCode(action));
        return {state: "read", enabled: Boolean(settings.values[SETTING.COMBOS_ENABLED]), layerReferences: settings.layers.map(record => record.reference),
            version: combos.version, defaultTermMs: combos.defaultTermMs, holdTermMs: combos.holdTermMs,
            rows: combos.rows.map(row => ({...row, termMs: effectiveComboTerm(combos, row), followsDefault: row.termMs === null, inputs: row.inputs.map(native), output: native(row.output)}))};
    }
    /** @param {import("./types.js").DraftDeviceContext} state */
    view(state) {
        const matching = state.selectedDeviceId === this.deviceId, connected = matching && state.connected;
        return {id: this.id, revision: this.revision, dirty: this.dirty, stale: this.stale, connectionChanged: this.connectionChanged, connected, matching,
            canUndo: this.cursor > 0, canRedo: this.cursor + 1 < this.history.length,
            // What undo and redo would take back or bring back, in the words
            // the step was recorded with.
            undoLabel: this.cursor > 0 ? this.history[this.cursor].label : null,
            redoLabel: this.cursor + 1 < this.history.length ? this.history[this.cursor + 1].label : null,
            // How many steps the history holds; the steps themselves come
            // only while the history sheet is open (steps()).
            historyLength: this.history.length,
            reviewed: this.reviewedRevision === this.revision,
            changes: this.changes(),
            checks: this.checks()};
    }
}
// The router (panel-session.js) and the web build take the registry's list from here.
module.exports = {ProfileDraftSession, DRAFT_EDITS};
