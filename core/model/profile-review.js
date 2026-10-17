// @ts-check
"use strict";

const {CHARYBDIS_4X6_LAYOUT_MATRIX, matrixPosition} = require("../data/charybdis-layout");
const {layerOfRef, nativeCode} = require("../schema/actions");
const {hostKeyLabel, keyLabel, keyLabelWithName, profileKeyNames, shortcutLabel} = require("./key-names");
const {hostSettings, HOST_SETTING} = require("../schema/host-settings");
const {SETTING} = require("../schema/settings-domain-v1");
const {decodedOf} = require("./portable-profile");
const {settingsEditorView} = require("./settings-editor");
const {macroEditorView} = require("./macro-editor");
const {inspectMacroPlayback} = require("./macro-input");
const {hostLayout} = require("../data/host-layouts");
const rgbEnums = require("../schema/rgb-domain-v1");
const {KEY_BEHAVIOR_HOLD_MODES} = require("../schema/key-behavior-domain-v1");
const {effectiveTimings} = require("./gesture-timing");
const {VOCABULARY, word, layerName: layerCalled, slotName, modifierNames} = require("./vocabulary");

/**
 * @typedef {import("../schema/types.js").SemanticAction} Action
 * @typedef {import("./types.js").DecodedProfile} Decoded
 * @typedef {import("./types.js").CompleteSnapshot} Snapshot
 * @typedef {import("./types.js").ModelReviewChange} Change
 * @typedef {import("../../contracts/model.js").ReviewMark} Mark
 * @typedef {import("../../contracts/edits.js").Scalar} Scalar
 * @typedef {{layers: string[], keys: import("../../contracts/model.js").ProfileKeyNames}} Names
 * @typedef {Scalar | {text: Scalar, key: Scalar | boolean | undefined, detail?: Scalar, label?: string, labelMark?: Mark, mark?: Mark, colour?: import("../schema/types.js").Hsv}} Field
 * @typedef {Map<string, Field>} Fields
 * @typedef {NonNullable<ReturnType<typeof macroEditorView>>} Macros
 * @typedef {ReturnType<typeof decodedOf>['combos']} Combos
 * @typedef {Combos['rows'][number]} Combo
 * @typedef {{title: string, stage: string | null, where: {layer?: number, slot?: number}, titleMark?: Mark, fields: Fields}} LightingRecord
 */
/** @param {unknown} text */
const words = text => String(text).replace(/^(RGB_|KEY_FEEDBACK_|PD_MODE_)/, "").replace(/_/g, " ").toLowerCase();
/** @param {Record<string, number>} values @param {number} value */
const named = (values, value) => words(Object.entries(values).find(([, id]) => id === value)?.[0] ?? value);
// An action named as the editors name what it reaches: a layer, a pointing
// mode or a macro by its own name in that snapshot, when it has one.
// A key, a layer key, a pointing mode and a macro read by the one name the
// screens give their keycode (model/key-names.js); `withName` adds the stored
// name, for a row whose two sides would otherwise read alike.
/** @param {Action | undefined} value @param {Partial<Names>} [names] @param {boolean} [withName] */
function action(value, names = {}, withName = false) {
    if (!value || value.kind === 0) return "None";
    const id = value.operand;
    const code = nativeCode(value);
    if (code !== undefined) return (withName ? keyLabelWithName : keyLabel)(names.keys, code);
    return `Action ${id}`;
}
// An action as a field: shown by its name, compared by what is stored.
/** @param {Action} value @param {Names} names @param {{mark?: Mark}} [extra] @returns {Field} */
const actionField = (value, names, extra = {}) => ({text: action(value, names), detail: action(value, names, true), key: JSON.stringify(value), ...extra});
// The names an action can be read by in one snapshot.
/** @param {Decoded} value @param {Macros} macros @param {number} [detected] @returns {Names} */
const namesIn = (value, macros, detected) => {
    const host = hostSettings(value.settings.values, detected);
    return {layers: value.settings.names,
        keys: profileKeyNames({hostOs: host.effective, hostLayout: host.layout, macosIso: host.macosIso, actionsKnown: true, layers: value.settings.names, macros: macros?.viaMacros, behaviors: value.behaviors.rows, pdModes: value.pdModes,
            customKeys: value.settings.customKeyNames.map((name, slot) => ({slot, name}))})};
};
// The mark an action carries: what it reaches, when that has a colour of its
// own — a pointing mode's light, a layer's colour.
/** @param {Action | undefined} value @returns {Mark | undefined} */
const actionMark = value => !value ? undefined
    : value.kind === 4 || value.kind === 5 ? {kind: "pointing", slot: value.operand}
    : value.kind === 2 || value.kind === 3 ? {kind: "layer", layer: value.operand} : undefined;
// A pointing slot as fields, in the Pointing modes editor's words.
/** @param {import("../schema/types.js").PdSlot | undefined} slot @param {Names} names @returns {Fields} */
function pointingFields(slot, names) {
    const P = VOCABULARY.pointing;
    /** @type {Fields} */
    const result = new Map([["Movement", word(P.kinds, slot?.kind || 0)], ["Name", slot?.name || "Empty"]]);
    if (!slot?.kind) return result;
    /** @param {number} mask */
    const mods = mask => modifierNames(mask).map(label => hostKeyLabel(label, names.keys?.hostOs)).join(" + ") || "None";
    /** @param {import("../schema/types.js").PdTap | undefined} output */
    const tap = output => !output?.keycode ? "None"
        : `${keyLabel(names.keys, output.keycode)} · ${output.modifierPolicy === 1 ? `${word(P.modifierPolicy, 1)} ${mods(output.mask)}` : word(P.modifierPolicy, output.modifierPolicy)}`;
    result.set("DPI", slot.dpi || "Normal pointer speed");
    result.set("Pointer layer", word(P.pointerLayer, slot.pointerLayer));
    if (slot.kind === 1) {
        result.set("Axes", word(P.axes, slot.axis));
        result.set("Horizontal movement per tap", slot.thresholdX);
        result.set("Vertical movement per tap", slot.thresholdY);
        for (const direction of ["left", "right", "up", "down"]) result.set(direction[0].toUpperCase() + direction.slice(1), tap(slot.directions[direction]));
        if (slot.axis === 3) for (const [diagonal, name] of [["upLeft", "Up-left"], ["upRight", "Up-right"], ["downLeft", "Down-left"], ["downRight", "Down-right"]]) {
            result.set(name, tap(slot.diagonals?.[diagonal]));
        }
        result.set("When a direction is empty", word(P.emptyDirection, slot.emptyDirection ?? 0));
        result.set("How often it sends", word(P.directionOutput, slot.directionOutput ?? 0));
    } else {
        result.set("Scrolls", word(P.scrollAxes, slot.axis ?? 0));
        result.set(P.heldModifiers, mods(slot.heldModifiers));
        for (const [field, label] of P.scrollFields) result.set(label, slot.scroll[field]);
        result.set("Reverse scrolling", word(P.invert, slot.scroll.invert));
    }
    slot.buttons.forEach((button, index) => result.set(`Button ${index + 1}`,
        button.kind === 3 ? `Hold ${mods(button.modifiers)}` : button.kind === 2 ? tap(button.tap) : word(P.buttons, button.kind)));
    return result;
}

/** @param {import("../schema/types.js").Hsv} c */
const hsv = c => `HSV(${c.h}, ${c.s}, ${c.v})`;

// A matrix slot as a person finds it on the board: the half, then its row and
// its column counted from the outer edge, or its place in the thumb cluster.
const LAYOUT_INDEX = new Map(CHARYBDIS_4X6_LAYOUT_MATRIX.map((position, layoutIndex) => [matrixPosition(layoutIndex), layoutIndex]));
const THUMBS = (() => {
    /** @type {Map<number, string>} */
    const names = new Map();
    /** @type {Partial<Record<"Left" | "Right", number>>} */
    const counts = {};
    for (const [layoutIndex, [row]] of CHARYBDIS_4X6_LAYOUT_MATRIX.entries()) {
        if (row % 5 !== 4) continue;
        const half = row < 5 ? "Left" : "Right";
        names.set(matrixPosition(layoutIndex), `${half} thumb ${counts[half] = (counts[half] || 0) + 1}`);
    }
    return names;
})();
/** @param {number} slot */
const positionName = slot => THUMBS.get(slot) || `${slot < 30 ? "Left" : "Right"} · row ${Math.floor(slot / 6) % 5 + 1}, column ${slot % 6 + 1}`;

// ── what a review item is ───────────────────────────────────────────────
//
// The review lists items, one per thing a person edits: a key on a layer, a
// layer's name, a behaviour, a combo, a macro, a settings section, a pointing
// slot, one lighting record. An item is also the unit a discard puts back
// (profile-revert.js), so it is the smallest part that is valid on its own.
// Each carries whether it was added, changed or removed, only the fields that
// differ (everything it holds, for an added or removed item), and where it
// is edited, so the review can go there.

// Tiers by the field that stores them, named in the vocabulary's words.
const TIERS = /** @type {const} */ ([["tap", "tap"], ["hold", "hold"], ["longHold", "long"]]);

// A behaviour as fields: its timing, the anchor, then every tier the grid
// shows, named as the grid names it (1× tap, 2× hold).
/** @param {import("../schema/types.js").BehaviorRow | undefined} row @param {number[]} defaults @param {Names} names @returns {Fields} */
function behaviourFields(row, defaults, names) {
    if (!row) return new Map();
    // Stored row edits stay here. Inherited effects appear under the settings
    // change that caused them, so discarding a default does not discard an
    // unrelated branch or anchor edit on one of its followers.
    // Each timing is marked with what it decides, as Settings marks its default.
    /** @param {number} value @param {number} fallback @param {Mark} labelMark @returns {Field} */
    const timing = (value, fallback, labelMark) => ({text: value ? `${value} ms` : `default · ${fallback} ms`, key: value, labelMark});
    const inherited = effectiveTimings({...row, tapHoldTerm: 0, longerHoldTerm: 0, multiTapTerm: 0}, defaults);
    /** @type {Fields} */
    const fields = new Map([
        ["Multi tap window", timing(row.multiTapTerm, defaults[3], {kind: "branch", count: 2})],
        ["Tap / hold threshold", timing(row.tapHoldTerm, inherited.hold, {kind: "tier", tier: "hold"})],
        ["Long hold threshold", timing(row.longerHoldTerm, defaults[2], {kind: "tier", tier: "long"})],
        ["Keeps auto-mouse anchored", row.keepsAutoMouseAnchored ? "yes" : "no"],
        ["Enabled", row.enabled ? "on" : "off"],
        ["Allowed layers", {text: names.layers.filter((_, i) => row.allowedLayers & 2 ** i).join(", ") || "none", key: row.allowedLayers}],
    ]);
    for (const step of row.steps) for (const [tier, name] of TIERS) {
        const branch = step[tier];
        if (!branch) continue;
        const hold = tier === "tap" ? undefined : /** @type {import("../schema/types.js").HoldBranch} */ (branch);
        const reaches = hold ? hold.action : /** @type {Action} */ (branch);
        if (tier === "tap" && !reaches.kind) continue;
        const how = tier === "tap" ? "" : ` · ${word(VOCABULARY.holdHelpers[name], Object.entries(KEY_BEHAVIOR_HOLD_MODES).find(([, id]) => id === hold?.mode)?.[0])}${hold?.repeatHz ? ` · ${hold?.repeatHz} Hz` : ""}`;
        // A tier is named as the grid names it, and carries which branch and
        // tier it is, so the review can colour it as the grid does.
        // Compared by what is stored, so a renamed or cleared pointing mode
        // or layer is a change where it was made, not to every behaviour
        // that reaches it.
        fields.set(`${step.tapIndex + 1}× ${VOCABULARY.tiers[name].toLowerCase()}`, {text: `${action(reaches, names)}${how}`, detail: `${action(reaches, names, true)}${how}`, key: JSON.stringify([reaches, hold?.mode, hold?.repeatHz]),
            labelMark: {kind: "tier", tier: name, branch: step.tapIndex + 1}, mark: actionMark(reaches)});
    }
    return fields;
}
// Fields an added or removed thing is described by: what it holds, leaving
// out values that only restate a default.
/** @type {Set<Scalar>} */
const EMPTY = new Set(["no", "none", "no name", "empty"]);
/** @param {string} label @param {Scalar | undefined} value */
const holds = (label, value) => value !== undefined && !EMPTY.has(value) && !/^default · /.test(String(value)) && !(label === "Movement" && value === "Empty");

// A field is shown by its text and compared by its key; most fields are plain
// text and are both. A field may also carry its own label, when the map key is
// an id rather than words.
/** @param {Field | undefined} value */
const text = value => typeof value === "object" && value !== null ? value.text : value;
/** @param {Field | undefined} value */
const detail = value => typeof value === "object" && value !== null ? value.detail ?? value.text : value;
/** @param {Field | undefined} value */
const compared = value => typeof value === "object" && value !== null ? value.key : value;
/** @param {string} id @param {(Field | undefined)[]} values */
const labelOf = (id, ...values) => {
    const field = values.find(value => typeof value === "object" && value?.label);
    return typeof field === "object" ? field.label ?? id : id;
};

// A combo that follows the default window is compared as following it, so a
// changed default is one Combo timing change rather than one per combo.
/** @param {Combo | undefined} row @param {Combos} table @param {Names} names @returns {Fields} */
function comboFields(row, table, names) {
    if (!row) return new Map();
    const options = (/** @type {const} */ (["mustHold", "mustTap", "ordered"])).filter(flag => row[flag]).map(flag => VOCABULARY.comboOptions[flag]).join(", ");
    const window = row.termMs === null ? {text: `default · ${table.defaultTermMs} ms`, key: "default"} : {text: `${row.termMs} ms`, key: row.termMs};
    return new Map(/** @type {[string, Field][]} */ ([["Keys", {text: row.inputs.map(input => action(input, names)).join(" + "),
        detail: row.inputs.map(input => action(input, names, true)).join(" + "), key: JSON.stringify(row.inputs)}],
        ["Sends", actionField(row.output, names, {mark: actionMark(row.output)})], ["Window", window], ["Conditions", options || "none"],
        ["Enabled", row.enabled ? "on" : "off"], ["Use output behaviour", row.useOutputBehavior ? "on" : "off"],
        ["Allowed layers", {text: names.layers.filter((_, i) => row.allowedLayers & 2 ** i).join(", ") || "none", key: row.allowedLayers}]]));
}
// The two values every combo shares. A version 1 table has no default window,
// and without combos no hold threshold either.
/** @param {Combos} table @returns {Fields} */
const comboTimingFields = table => new Map([["Default window", table.defaultTermMs === null ? "none" : `${table.defaultTermMs} ms`],
    ["Hold threshold", table.holdTermMs === null ? "none" : `${table.holdTermMs} ms`]]);

// Combo IDs are packed positions, not stable identities. Recognize a single
// removed row by its stored contents so the shifted suffix is not presented as
// a series of edits. Ambiguous identical rows keep the positional review.
/** @param {Combo[]} before @param {Combo[]} after */
function singleComboRemovalIndex(before, after) {
    if (before.length !== after.length + 1) return null;
    /** @param {Combo} row */
    const contents = row => {
        const {id, ...stored} = row;
        return JSON.stringify(stored);
    };
    const old = before.map(contents), next = after.map(contents);
    const matches = [];
    for (let removed = 0; removed < old.length; removed++) {
        if (old.every((value, index) => index === removed || value === next[index < removed ? index : index - 1])) matches.push(removed);
    }
    return matches.length === 1 ? matches[0] : null;
}

// Lighting in the words the Lighting screen uses, and every colour as a
// colour: the review draws it as a swatch, and says what an off colour means
// where it means something (a group row inherits its stage's colour).
// An enum value by its word in one of the vocabulary's lists.
/** @param {import("../../contracts/model.js").WordList} list @param {Record<string, number>} values @param {number} value */
const nameIn = (list, values, value) => word(list, Object.entries(values).find(([, id]) => id === value)?.[0] ?? value);
const V = VOCABULARY;
/** @param {import("../schema/types.js").Hsv} value @param {string} [off] */
const colour = (value, off = "off") => ({text: value.v ? hsv(value) : off, key: hsv(value), colour: {h: value.h, s: value.s, v: value.v}});

/** @param {Decoded} value @returns {Map<string, LightingRecord>} */
function lightingRecords(value) {
    const r = value.rgb;
    /** @type {Map<string, LightingRecord>} */
    const records = new Map();
    /** @param {number} id */
    const layerName = id => layerCalled(value.settings.names, id);
    /** @param {number} id */
    const slotCalled = id => slotName(value.pdModes?.[id], id);
    /** @param {string} unit @param {string} title @param {string | null} stage @param {[string, Field][]} fields @param {{layer?: number, slot?: number}} [where] @param {Mark} [titleMark] */
    const record = (unit, title, stage, fields, where = {}, titleMark) => records.set(unit, {title, stage, where, titleMark, fields: new Map(fields)});
    // Each stage's switch sits on its own tab, so the stages record belongs
    // to no single one.
    record("rgb:stages", "Feedback stages", null, V.stages.filter(stage => stage.bit).map(stage => {
        const on = Boolean(r.stageEnableMask & (stage.bit || 0));
        return [stage.label, {text: on ? "on" : "off", key: on, mark: {kind: "stage", on}}];
    }));
    for (const row of r.layerColors) record(`rgb:layer:${row.layerId}`, `${layerName(row.layerId)} colour`, "layers",
        [["Colour", colour(row.color, row.layerId === 0 ? "off · the base effect shows" : "off")], ["Paints", nameIn(V.paintModes, rgbEnums.RGB_LAYER_MODES, row.mode)]], {layer: row.layerId}, {kind: "layer", layer: row.layerId});
    for (const row of r.pdModeColors) record(`rgb:pd:${row.pdModeId}`, `Pointing mode colour · ${slotCalled(row.pdModeId)}`, "pd",
        [["Colour", colour(row.color)], ["Where", nameIn(V.localities, rgbEnums.RGB_LOCALITIES, row.locality)]], {slot: row.pdModeId}, {kind: "pointing", slot: row.pdModeId});
    record("rgb:automouse", "Auto-mouse fade", "auto", [["Fade", nameIn(V.fadeModes, rgbEnums.RGB_AUTOMOUSE_MODES, r.automouseFade.mode)], ["End colour", colour(r.automouseFade.endColor)]]);
    record("rgb:combo", "Combo feedback", "combo", [["Colour", colour(r.comboFeedback.color)], ["Where", nameIn(V.localities, rgbEnums.RGB_LOCALITIES, r.comboFeedback.locality)]]);
    const k = r.keyFeedback;
    record("rgb:key", "Key feedback", "key", [...k.tapBranchColors.map(/** @returns {[string, Field]} */ (value, i) => [`${i + 2}× branch`, colour(value)]),
        ["Tap committed", colour(k.tapCommittedColor)], ["Hold active", colour(k.holdActiveColor)], ["Long hold active", colour(k.longHoldActiveColor)],
        ["Tap commit", nameIn(V.tapCommit, rgbEnums.RGB_TAP_COMMIT_MODES, k.tapCommitMode)], ["Where", nameIn(V.localities, rgbEnums.RGB_LOCALITIES, k.locality)]]);
    // LED groups are one record with every row that paints them: rows name
    // groups by id, so a row put back without its group could point at a
    // group that no longer exists. Groups read as the Lighting screen shows
    // them, "Group 1 · 3 LEDs", and each row as who it paints for.
    const groups = new Map(r.groups.map(group => [group.id, group]));
    /** @type {[string, Field][]} */
    const fields = r.groups.map(group => [`group:${group.id}`, {label: `Group ${group.id}`, text: `LEDs ${group.leds.join(", ")}`, key: group.leds.join(",")}]);
    /** @type {Record<string, string>} */
    const TIER_SEMANTICS = {KEY_FEEDBACK_GROUP_TAP_COMMITTED: "tap", KEY_FEEDBACK_GROUP_HOLD_ACTIVE: "hold", KEY_FEEDBACK_GROUP_LONG_HOLD_ACTIVE: "long"};
    /** @template {{color: import("../schema/types.js").Hsv, groupId: number}} T @param {string} table @param {T[]} rows @param {(row: T) => string} owner @param {(row: T) => Mark | undefined} ownerMark */
    const overrides = (table, rows, owner, ownerMark) => rows.forEach((row, i) => {
        const group = groups.get(row.groupId), leds = group ? `Group ${group.id} · ${group.leds.length} LED${group.leds.length === 1 ? "" : "s"}` : `Group ${row.groupId}`;
        const paint = colour(row.color, "inherits the stage colour");
        fields.push([`${table}:${i}`, {label: `Override · ${owner(row)}`, labelMark: ownerMark(row) || undefined, text: `${leds} · ${paint.text}`,
            key: `${group?.leds.join(",")}|${paint.key}|${owner(row)}`, colour: paint.colour}]);
    });
    overrides("layerGroupRows", r.layerGroupRows, row => row.selector === 255 ? "all layers" : layerName(row.selector), row => row.selector === 255 ? undefined : {kind: "layer", layer: row.selector});
    overrides("pdModeGroupRows", r.pdModeGroupRows, row => row.selector === 255 ? "all pointing modes" : slotCalled(row.selector), row => row.selector === 255 ? undefined : {kind: "pointing", slot: row.selector});
    overrides("comboGroupRows", r.comboGroupRows, () => "combos", () => ({kind: "combo"}));
    overrides("keyGroupRows", r.keyGroupRows, row => nameIn(V.feedbackOwners, rgbEnums.RGB_KEY_SEMANTICS, row.semantic), row => {
        const name = Object.entries(rgbEnums.RGB_KEY_SEMANTICS).find(([, id]) => id === row.semantic)?.[0];
        const tier = name === undefined ? undefined : TIER_SEMANTICS[name];
        return tier ? {kind: "tier", tier} : undefined;
    });
    record("rgb:groups", "LED overrides", "groups", fields);
    return records;
}

// Compare complete validated snapshots. The review describes final differences,
// rather than a log that would still show edits the user has already undone.
/** @param {Snapshot} before @param {Snapshot} after @param {import("./types.js").ProfileDestination} [capabilities] @returns {Change[]} */
function profileReview(before, after, capabilities) {
    // A snapshot may carry its decoded form (`decoded`, read-only); the draft
    // decodes each revision once and hands it on.
    const a = decodedOf(before), b = decodedOf(after);
    /** @type {Change[]} */
    const items = [];
    // One item from its fields on each side; `exists` says whether the thing is
    // there at all, which decides added and removed.
    /** @param {string} area @param {string} unit @param {string} title @param {Fields} old @param {Fields} next @param {import("./types.js").ModelReviewPlace} place @param {boolean[]} [exists] @param {Mark} [titleMark] */
    const item = (area, unit, title, old, next, place, exists = [old.size > 0, next.size > 0], titleMark) => {
        const [was, is] = exists;
        if (!was && !is) return;
        const status = was && is ? "changed" : is ? "added" : "removed";
        const ids = [...new Set([...old.keys(), ...next.keys()])];
        const fields = ids.filter(id => status === "changed" ? compared(old.get(id)) !== compared(next.get(id))
            : holds(id, text(status === "added" ? next.get(id) : old.get(id))))
            .map(/** @returns {import("../../contracts/model.js").ReviewField} */ id => {
                // A field has its own status: inside a changed behaviour a
                // tier can be added or removed while the behaviour stays. A
                // side a field is absent from is null, never a word that
                // could read as a value.
                const was = status !== "added" && old.has(id), is = status !== "removed" && next.has(id);
                // Two stored values can share a name (KC_1 and KC_KP_1 are
                // both "1"); then both sides add what they are stored as.
                const alike = was && is && text(old.get(id)) === text(next.get(id));
                const shown = alike ? detail : text;
                /** @type {import("../../contracts/model.js").ReviewField} */
                const entry = {label: labelOf(id, next.get(id), old.get(id)), status: was && is ? "changed" : is ? "added" : "removed",
                    before: was ? /** @type {Scalar} */ (shown(old.get(id))) : null, after: is ? /** @type {Scalar} */ (shown(next.get(id))) : null};
                // A field carries its colour and the marks of what it is about,
                // on the side that shows them.
                /** @template {"labelMark" | "colour" | "mark"} K @param {Field | undefined} value @param {K} name */
                const side = (value, name) => value && typeof value === "object" ? value[name] : undefined;
                const extra = {labelMark: side(next.get(id), "labelMark") || side(old.get(id), "labelMark"),
                    beforeColour: status === "added" ? undefined : side(old.get(id), "colour"), afterColour: status === "removed" ? undefined : side(next.get(id), "colour"),
                    beforeMark: status === "added" ? undefined : side(old.get(id), "mark"), afterMark: status === "removed" ? undefined : side(next.get(id), "mark")};
                return {...entry, ...Object.fromEntries(Object.entries(extra).filter(([, value]) => value !== undefined))};
            });
        if (status === "changed" && !fields.length) return;
        items.push({area, unit, title, status, fields, place, ...(titleMark ? {titleMark} : {})});
    };
    /** @param {Decoded} value @param {number} i */
    const layerName = (value, i) => layerCalled(value.settings.names, i);
    const macrosA = /** @type {Macros} */ (macroEditorView(before, capabilities)), macrosB = /** @type {Macros} */ (macroEditorView(after, capabilities));
    const namesA = namesIn(a, macrosA, before.hostOs?.detected), namesB = namesIn(b, macrosB, after.hostOs?.detected);
    a.document.layers.forEach((keys, l) => keys.forEach((code, p) => {
        if (code === b.document.layers[l][p]) return;
        // Each side reads by its own snapshot's names: a renamed macro is
        // its old name on the keyboard and its new one in the draft.
        /** @param {number} code @param {Names} names */
        const values = (code, names) => ({text: keyLabel(names.keys, code), detail: keyLabelWithName(names.keys, code), key: code});
        item("Layout", `layout:${l}:${p}`, `${layerName(b, l)} · ${positionName(p)}`, new Map([["", values(code, namesA)]]), new Map([["", values(b.document.layers[l][p], namesB)]]),
            {kind: "key", layer: l, layoutIndex: LAYOUT_INDEX.get(p)}, undefined, {kind: "layer", layer: l});
    }));
    a.settings.names.forEach((name, i) => {
        // A stored name can equal the fallback name. Clearing it still
        // changes the document and must have its own discardable item.
        /** @param {string[]} names @returns {Fields} */
        const fields = names => new Map([["Name", {text: layerCalled(names, i), key: names[i],
            detail: `${layerCalled(names, i)} · ${names[i] ? `stored name ${JSON.stringify(names[i])}` : "no stored name"}`}]]);
        item("Layers", `layerName:${i}`, `Layer ${i}`, fields(a.settings.names), fields(b.settings.names), {kind: "layers"}, undefined, {kind: "layer", layer: i});
    });
    a.settings.layers.forEach((record, layer) => {
        for (const layoutIndex of CHARYBDIS_4X6_LAYOUT_MATRIX.keys()) {
            const position = matrixPosition(layoutIndex);
            /** @param {import("../schema/types.js").LayerRecord} entry @returns {Fields} */
            const fields = entry => new Map([["Use shared behaviour", entry.bypass.includes(position) ? "off" : "on"], ["Join combos", entry.exclude.includes(position) ? "off" : "on"]]);
            item("Layout", `placement:${layer}:${position}`, `Participation · ${layerCalled(b.settings.names, layer)} · key ${LAYOUT_INDEX.get(position)}`, fields(record), fields(b.settings.layers[layer]),
                {kind: "key", layer, layoutIndex: LAYOUT_INDEX.get(position)}, [true, true]);
        }
    });
    const targets = new Map([...a.behaviors.rows, ...b.behaviors.rows].map(row => [JSON.stringify(row.target), row.target]));
    for (const [id, target] of targets) {
        const old = a.behaviors.rows.find(row => JSON.stringify(row.target) === id), next = b.behaviors.rows.find(row => JSON.stringify(row.target) === id);
        item("Behaviours", `behavior:${id}`, action(target, next ? namesB : namesA), behaviourFields(old, a.settings.values, namesA), behaviourFields(next, b.settings.values, namesB),
            {kind: "behaviour", target}, [Boolean(old), Boolean(next)]);
    }
    const combosA = a.combos.rows, combosB = b.combos.rows;
    const removedCombo = singleComboRemovalIndex(combosA, combosB);
    if (removedCombo !== null) {
        const i = removedCombo;
        item("Combos", `combo:${i}`, `Combo ${i}`, comboFields(combosA[i], a.combos, namesA), new Map(), {kind: "combo", index: i}, undefined,
            {kind: "combo", badge: `C${i}`});
        if (i < combosB.length) /** @type {Change} */ (items.at(-1)).note = "Later combos move up one number.";
    } else {
        for (let i = 0; i < Math.max(combosA.length, combosB.length); i++) {
            item("Combos", `combo:${i}`, `Combo ${i}`, comboFields(combosA[i], a.combos, namesA), comboFields(combosB[i], b.combos, namesB), {kind: "combo", index: i}, undefined,
                {kind: "combo", badge: `C${i}`});
        }
    }
    item("Settings", "comboTiming", "Combo timing", comboTimingFields(a.combos), comboTimingFields(b.combos), {kind: "settings", section: "comboSettings", area: "Settings"}, [true, true]);
    macrosA.viaMacros.forEach((slot, i) => {
        const protectionShown = macrosB.protectionSupported || slot.protection !== "auto" || macrosB.viaMacros[i].protection !== "auto";
        /** @param {Macros["viaMacros"][number]} macro @returns {Fields} */
        const fields = (macro) => new Map(/** @type {[string, Field][]} */ ([["Steps", macro.payload || "empty"], ["Name", macro.name || "no name"],
            ...(protectionShown ? [["Uninterruptible playback", {key: macro.protection,
                text: macro.protection === "auto" && macrosB.protectionSupported ? `${word(VOCABULARY.macroProtection, macro.protection)} · ${macro.uninterruptible ? "on" : "off"}` : word(VOCABULARY.macroProtection, macro.protection)}]] : [])]));
        const old = macrosA.viaMacros[i], next = macrosB.viaMacros[i], has = /** @param {Macros["viaMacros"][number]} macro */ (macro) => Boolean(macro.payload || macro.name || macro.protection !== "auto");
        item("Macros", `macro:${i}`, `Macro ${i}${(next.name || old.name) ? ` · ${next.name || old.name}` : ""}`, fields(old), fields(next), {kind: "macro", index: i}, [has(old), has(next)]);
    });
    if (a.settings.values[HOST_SETTING] !== b.settings.values[HOST_SETTING]) {
        const oldHost = hostSettings(a.settings.values, before.hostOs?.detected), nextHost = hostSettings(b.settings.values, after.hostOs?.detected);
        macrosB.viaMacros.forEach((macro, index) => {
            if (!macro.payload) return;
            // Compare the current authored text under each host setup. An
            // independent text edit belongs to its own macro change above.
            const old = inspectMacroPlayback(macro.payload, oldHost, true, macrosB.macroBank.programMax), next = inspectMacroPlayback(macro.payload, nextHost, true, macrosB.macroBank.programMax);
            const affected = new Set(next.typing.filter((route, i) => JSON.stringify(route) !== JSON.stringify(old.typing[i])).map(route => route.character));
            if (!affected.size && old.error === next.error) return;
            /** @param {ReturnType<typeof inspectMacroPlayback>} playback @param {ReturnType<typeof hostSettings>} host @returns {Fields} */
            const fields = (playback, host) => {
                /** @type {Map<import("../../contracts/model.js").MacroTypingRoute["method"], string[]>} */
                const types = new Map();
                for (const route of playback.typing.filter(route => affected.has(route.character))) {
                    const characters = types.get(route.method) || [];
                    characters.push(route.character); types.set(route.method, characters);
                }
                const labels = {layout: "layout keys", unicode: `Unicode entry (${word(VOCABULARY.hostOs, host.unicodeMode)})`, unavailable: "cannot type"};
                const typing = [...types].map(([method, characters]) => `${labels[method]}: ${JSON.stringify(characters.slice(0, 16).join(""))}${characters.length > 16 ? ` (+${characters.length - 16} more)` : ""}`).join("; ");
                // hostSettings always selects a supported layout.
                const layout = /** @type {NonNullable<ReturnType<typeof hostLayout>>} */ (hostLayout(host.layout));
                return new Map(/** @type {[string, Field][]} */ ([
                    ...(affected.size ? [["Text entry", {text: `${layout.name} · ${typing}`,
                        key: JSON.stringify(playback.typing.filter(route => affected.has(route.character))),
                        detail: `${layout.name} · ${typing}${host.macosIso ? " · ISO" : " · ANSI"}`}]] : []),
                    ["Playback", playback.error || "Ready to play"],
                    ...(macrosB.protectionSupported && macro.protection === "auto"
                        ? [["Uninterruptible playback", playback.typing.some(route => route.method !== "layout") ? "Automatic · on" : "Automatic · off"]] : []),
                ]));
            };
            // The effect belongs to Host, so discarding it restores Host and
            // preserves independently edited macro text and names.
            item("Macros", "settings:host", `Macro ${index}${macro.name ? ` · ${macro.name}` : ""} · host setup`, fields(old, oldHost), fields(next, nextHost), {kind: "macro", index}, [true, true]);
            /** @type {Change} */ (items.at(-1)).note = "Playback changes because of Settings → Host. Discard together with the Host change.";
        });
    }
    // A custom key is its name and shortcut here; what its behaviour adds is
    // the behaviour's item.
    const keyNamesA = a.settings.customKeyNames, keyNamesB = b.settings.customKeyNames;
    keyNamesA.forEach((old, i) => {
        const next = keyNamesB[i];
        const shortcutA = a.settings.customKeyShortcuts[i], shortcutB = b.settings.customKeyShortcuts[i];
        /** @param {{mods: number, key: number}} shortcut @param {Names} names @returns {Field} */
        const shortcutField = (shortcut, names) => ({text: shortcutLabel(names.keys, shortcut) || "none", key: `${shortcut.mods}:${shortcut.key}`});
        /** @param {string} name @param {{mods: number, key: number}} shortcut @param {Names} names @returns {Fields} */
        const fields = (name, shortcut, names) => new Map([["Name", name || "no name"], ["Shortcut", shortcutField(shortcut, names)]]);
        /** @param {string} name @param {{mods: number, key: number}} shortcut */
        const exists = (name, shortcut) => Boolean(name || shortcut.mods || shortcut.key);
        item("Custom keys", `customKey:${i}`, `Custom key ${i}${(next || old) ? ` · ${next || old}` : ""}`, fields(old, shortcutA, namesA), fields(next, shortcutB, namesB), {kind: "customKey", index: i},
            [exists(old, shortcutA), exists(next, shortcutB)]);
    });
    // The keyboard's own name, edited on Settings' Keyboard card. Empty is the
    // firmware's built-in name, which the keyboard then reports over USB.
    /** @param {string} name @returns {Fields} */
    const keyboardFields = name => new Map([["Name", name || "built-in name"]]);
    item("Settings", "keyboardName", "Keyboard name", keyboardFields(a.settings.keyboardName), keyboardFields(b.settings.keyboardName),
        {kind: "settings", section: "keyboard", area: "Settings"}, [true, true]);
    // Settings are saved a section at a time, so a section is one item.
    /** @param {Snapshot} snapshot @param {import("../schema/types.js").SettingsDomain} settings */
    const sections = (snapshot, settings) => /** @type {NonNullable<ReturnType<typeof settingsEditorView>>} */ (settingsEditorView(snapshot)).sections.map(section => ({id: section.id, label: section.label, area: section.area, stage: section.stage,
        fields: new Map(section.fields.map(/** @returns {[string, Field]} */ field => {
            let value = field.value;
            if (field.presentation === "duration") {
                const ms = Number(value);
                const minutes = ms >= 60000 && ms % 60000 === 0;
                const amount = ms / (minutes ? 60000 : 1000);
                const unit = minutes ? "minute" : "second";
                return [field.macro, {label: field.label, text: ms === 0 ? "Always on" : `${amount} ${unit}${amount === 1 ? "" : "s"}`,
                    key: field.value, labelMark: field.governs}];
            }
            // A share is compared by the milliseconds stored, so a timeout
            // that rescales it shows here too, and read as both.
            if (field.kind === "share") return [field.macro, {label: field.label, text: `${value}% · ${field.ms} ms`, key: field.ms, labelMark: field.governs}];
            if (field.kind === "toggle") value = field.enabled ? "on" : "off";
            else if (field.kind === "layer") {
                // The settings editor renders validated layer references as Layer n.
                const layer = /** @type {number} */ (layerOfRef(value));
                return [field.macro, {label: field.label, text: settings.names[layer] || value, key: field.value,
                    labelMark: field.governs, mark: {kind: "layer", layer}}];
            } else if (field.choices) {
                const choice = field.choices.find(choice => typeof choice === "object" && String(choice.value) === field.value);
                if (typeof choice === "object") value = choice.label || value;
            }
            const ms = /ms\b/.test(field.hint || "") || /\(ms\)/.test(field.label);
            return [field.macro, {label: field.label.replace(/\s*\(ms\)$/, ""), text: ms && /^\d+$/.test(String(value)) ? `${value} ms` : value, key: field.value, labelMark: field.governs}];
        }))}));
    const sectionsA = sections(before, a.settings);
    for (const section of sections(after, b.settings)) {
        const old = sectionsA.find(entry => entry.id === section.id);
        item(/** @type {string} */ (section.area), `settings:${section.id}`, section.label, old?.fields || new Map(), section.fields, {kind: "settings", section: section.id, area: section.area, ...(section.stage ? {stage: section.stage} : {})}, [true, true]);
    }
    const timingChange = items.find(entry => entry.unit === "settings:keyTiming");
    if (timingChange) {
        const affected = new Set();
        for (const next of b.behaviors.rows) {
            const old = a.behaviors.rows.find(row => JSON.stringify(row.target) === JSON.stringify(next.target));
            if (!old) continue;
            const oldTimes = effectiveTimings(old, a.settings.values), nextTimes = effectiveTimings(next, b.settings.values);
            for (const [field, term, label] of /** @type {const} */ ([["multiTapTerm", "repeat", "Multi tap window"], ["tapHoldTerm", "hold", "Tap / hold threshold"], ["longerHoldTerm", "long", "Long hold threshold"]])) {
                // Normalized explicit matches already have a stored behaviour
                // change above; include inherited-only effects here.
                if (old[field] !== 0 || next[field] !== 0 || oldTimes[term] === nextTimes[term]) continue;
                affected.add(JSON.stringify(next.target));
                timingChange.fields.push({label: `${action(next.target, namesB)} · ${label}`, status: "changed",
                    before: `default · ${oldTimes[term]} ms`, after: `default · ${nextTimes[term]} ms`});
            }
        }
        if (affected.size) timingChange.note = `${affected.size} behaviour${affected.size === 1 ? " follows" : "s follow"} the changed defaults; effective times are listed below.`;
    }
    const masks = after.options?.keymapMasks.reduce((mask, value) => mask | value, 0) || 0;
    item("Settings", "settings:otherKeyOptions", "Other key options", new Map([["Stored bits", `0x${(a.settings.values[SETTING.KEYMAP_OPTIONS] & ~masks).toString(16)}`]]),
        new Map([["Stored bits", `0x${(b.settings.values[SETTING.KEYMAP_OPTIONS] & ~masks).toString(16)}`]]), {kind: "settings"}, [true, true]);
    for (let id = 0; id < Math.max(a.pdModes?.length || 0, b.pdModes?.length || 0); id++) {
        const old = a.pdModes?.[id], next = b.pdModes?.[id];
        item("Pointing modes", `pd:${id}`, `Slot ${id}${(next?.name || old?.name) ? ` · ${next?.kind ? next.name : old?.name}` : ""}`,
            pointingFields(old, namesA), pointingFields(next, namesB), {kind: "pointing", slot: id}, [Boolean(old?.kind || old?.name), Boolean(next?.kind || next?.name)], {kind: "pointing", slot: id});
    }
    const lightA = lightingRecords(a), lightB = lightingRecords(b);
    for (const [unit, record] of lightB) {
        const old = lightA.get(unit);
        item("Lighting", unit, record.title, old?.fields || new Map(), record.fields, {kind: "lighting", stage: record.stage, ...record.where}, [Boolean(old), true], record.titleMark);
    }
    for (const [unit, record] of lightA) if (!lightB.has(unit)) item("Lighting", unit, record.title, record.fields, new Map(), {kind: "lighting", stage: record.stage, ...record.where});
    // The items above describe the profile in words. If the stored bytes
    // differ and none of them caught it, the review still must not read as
    // empty: an apply always shows that something will change.
    if (!items.length && before.fingerprint !== after.fingerprint) {
        items.push({area: "Profile", unit: "profile", title: "Stored profile", status: "changed", fields: [{label: "", before: `fingerprint ${before.fingerprint}`,
            after: `fingerprint ${after.fingerprint} · a change this review cannot describe`}], place: null});
    }
    return items;
}
// A reorder as one item: which layers now win over which. Each layer that
// moved is one field, named as the draft names it, in its light, with where it
// sat on the keyboard and where it sits now, highest first as Rename & Reorder
// lists them. A rename made with it is its own item, so the layer is called
// what it is called now; the rename says what it was. A new base is said
// first, since it changes what every transparent key falls through to.
/** @param {Snapshot} after @param {readonly number[]} order @returns {Change} */
function layerOrderReview(after, order) {
    const names = decodedOf(after).settings.names;
    const moved = order.map((layer, slot) => slot).filter(slot => order[slot] !== slot).reverse();
    /** @param {number} slot */
    const where = slot => (slot === 0 ? "0 · the base" : order[slot] === 0 ? `${slot} · no longer the base` : `${slot} · ${slot > order[slot] ? "higher" : "lower"}`);
    /** @type {import("../../contracts/model.js").ReviewField[]} */
    const fields = [
        ...(order[0] !== 0 ? [{label: "Base layer", status: /** @type {const} */ ("changed"), before: layerCalled(names, order.indexOf(0)), after: layerCalled(names, 0)}] : []),
        ...moved.map(/** @returns {import("../../contracts/model.js").ReviewField} */ slot => ({label: layerCalled(names, slot), labelMark: {kind: "layer", layer: slot}, status: "changed", before: String(order[slot]), after: where(slot)})),
    ];
    return {area: "Layers", unit: "layerOrder", title: "Layer priority", note: "Higher layers win", status: "changed", fields,
        place: {kind: "layers", layers: moved}};
}
module.exports = {layerOrderReview, profileReview, singleComboRemovalIndex};
