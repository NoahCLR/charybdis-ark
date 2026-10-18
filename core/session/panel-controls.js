// @ts-check
"use strict";

// What the panel's controls do, in order: reading the keyboard, the draft's
// own controls (review, undo, discard, rebase, apply) and the portable flows
// (import review, layer editing, restore).
//
// This used to live in extension.js. It is sequencing and session state, not
// VS Code, so it sits here with a test; core/session/panel-loop.js runs it with
// the host's own functions as `host`, of which these use three,
//
//   host.progress(title, run)      runs `run` behind a progress indicator
//   host.saveRecovery(document)    writes a recovery copy, resolves to where it went
//   host.chooseProfile()           resolves to a chosen file's text, or undefined
//
// and `host.words.noneFound`, when a host says "no keyboard found" its own way.

/**
 * @typedef {import("./types.js").RunningPanelSession} Session
 * @typedef {import("./types.js").ControlHost} Host
 */
const {panelControl} = require("./panel-control-registry");
const {canEdit, hasCurrentLayers} = require("./firmware-support");
const {validateSnapshot, FILE_MAX_BYTES} = require("../model/portable-profile");
const {DEMO_WORDS, panelCapabilities, panelState} = require("./demo-session");
const {applyLayerEdit, discardDraftForDevice, layerEditDocument, observePortable, startLayerEdit} = require("./panel-session");
const {closeEditors, whileApplying} = require("./panel-session-state");
const {IDENTITY} = require("../model/layer-order");
const {RECONNECT_WORDS, expectReconnect, renamedTo} = require("./keyboard-reconnect");

// Ark reads only current firmware; the compatibility diagnostics say what
// this keyboard's firmware lacks.
const FIRMWARE_UPDATE = "This keyboard's firmware is not the current firmware, which is the only one Ark supports. Update both halves, then read the keyboard again. The keyboard has not been changed.";

/** @template T @param {Host} host @param {string} title @param {() => Promise<T>} work */
const run = (host, title, work) => host.progress ? host.progress(title, work) : work();
// The slave half confirmed its copy before the keyboard switched, but the
// cable between the halves may have come out since; say so instead of
// claiming a readback of both halves that did not happen.
/** @param {{peerUnseen?: boolean} | undefined} result @param {string} verb */
const savedNotice = (result, verb) => result?.peerUnseen
    ? `Complete profile ${verb} both halves and active. The slave half confirmed its copy but is not connected now; plug the cable between the halves back in.`
    : `Complete profile ${verb} both halves and verified.`;
// The profile is saved whatever the read after it does, so a failed read is
// said after the save rather than in place of it.
/** @param {unknown} error */
const rereadFailure = (error) => `Reading the keyboard again failed: ${(error instanceof Error ? error.message : String(error)).replace(/\.$/, "")}. `;

// A save that renamed the keyboard is followed by the keyboard reconnecting
// under its new name. Its readback may be cut short by that: the keyboard is
// read again once it is back, so that is said instead of a failure.
/** @param {Session} session @param {import("../model/types.js").ProfileSnapshot | null | undefined} before @param {import("../model/types.js").ProfileSnapshot} after */
const reconnectAfter = (session, before, after) => expectReconnect(session, renamedTo(before, after));
/** @param {Session} session @param {ReturnType<typeof reconnectAfter>} expected @param {unknown} error */
const rereadOutcome = (session, expected, error) => expected && session.reconnect === expected && !session.service.snapshot().connected ? "" : rereadFailure(error);
/** @param {ReturnType<typeof reconnectAfter>} expected @param {string} notice */
function reconnectNotice(expected, notice) {
    if (!expected) return notice;
    expected.saved = notice;
    return `${notice} ${RECONNECT_WORDS.waiting}`;
}

// After the keyboard stores a new profile, everything the panel shows about
// it is read again, in the order the reads depend on. Like every device read,
// it rejects with what failed.
/** @param {import("./types.js").ControlService} service @param {(step: import("../../contracts/messages.js").ReadStep) => void} [onStep] */
async function rereadKeyboard(service, onStep = () => {}) {
    onStep("layout");
    await service.readLayout();
    onStep("profile");
    await service.readCommittedProfile();
    onStep("combos");
    await service.readCombos();
    onStep("baseRgb");
    await service.readBaseRgb();
}

// Connect if needed, then read what the keyboard runs. Each device read
// rejects with what failed (and leaves it in the keyboard's state), which
// fails the read and becomes the panel's notice. The notice says what was
// read and what could not be: a keyboard not on current firmware is read no
// further, a failed complete capture falls back to the independent reads, and
// a failed committed-profile read keeps the layout and the optional reads.
/** @param {Session} session @param {string | undefined} selectedDeviceId @param {Host} [host] */
async function readKeyboard(session, selectedDeviceId, host = {}) {
    const service = session.service;
    await service.enumerate();
    const devices = service.snapshot().devices;
    if (!devices.length) {
        session.notice = host.words?.noneFound || "No Charybdis Raw HID interface found. Connect the keyboard and choose Read keyboard again.";
        return false;
    }
    if (selectedDeviceId && !devices.some((device) => device.id === selectedDeviceId)) {
        throw new Error("The selected keyboard is no longer available. Read the device list again.");
    }
    // A keyboard that left the list is let go: on the web page, choosing
    // another keyboard lists only that one, and reading connects it.
    const current = service.snapshot();
    if (!current.connected || !devices.some((device) => device.id === current.selectedDeviceId)
        || (selectedDeviceId && current.selectedDeviceId !== selectedDeviceId)) {
        const deviceId = selectedDeviceId || devices[0].id;
        await service.connect(deviceId);
    }
    await service.refresh();
    if (!canEdit(service.capabilities)) {
        session.notice = FIRMWARE_UPDATE;
        return false;
    }
    let macroFailure = "", portable;
    try {portable = await run(host, "Reading the complete keyboard configuration", () => service.readKeyboardProfile());}
    catch (error) {
        if (/** @type {Error & {code?: string}} */ (error).code === "FIRMWARE_UPDATE_REQUIRED") {
            session.notice = /** @type {Error} */ (error).message;
            return false;
        }
        macroFailure = " Macros and global settings could not be read: " + /** @type {Error} */ (error).message;
    }
    if (!portable) {
        // A partly readable keyboard still gets its independent diagnostics.
        // A failed complete capture never opens an editable draft.
        await run(host, "Reading layout from the keyboard", () => service.readLayout());
        // A failure stays in the keyboard's state, said below.
        await run(host, "Reading keyboard profile", () => service.readCommittedProfile()).catch(() => {});
        await service.readBaseRgb();
        await service.readCombos();
    }
    const state = service.snapshot();
    if (state.error || state.committed?.state !== "read") {
        session.notice = `The keyboard profile could not be read: ${state.error?.message || "no verified profile was returned"}.`;
    } else {
        const description = state.committed.source === "compiled"
            ? "the keyboard's compiled defaults"
            : `committed profile generation ${state.committed.generation}`;
        const failures = state.committed.failures?.length || 0;
        session.notice = `Read the layout and ${description}.` + (failures ? ` ${failures} domain(s) could not be decoded; see diagnostics.` : "");
    }
    if (macroFailure) session.notice += macroFailure;
    return Boolean(!state.error && state.committed?.state === "read" && state.layout?.state === "read"
        && hasCurrentLayers(state.capabilities) && portable && !portable.incomplete);
}

// The draft's own controls. Each leaves the session's outbox (notice, form
// reset) saying what happened; the caller publishes.
/** @typedef {import('../../contracts/messages.js').DraftControl & {draftRevision: number}} DraftMessage */
/** @typedef {{session: Session, draft: NonNullable<Session['draft']>, service: Session['service'], revision: number, message: DraftMessage, host: Host}} DraftContext */
/** @type {Readonly<Record<string, (context: DraftContext) => void | Promise<void>>>} */
const DRAFT_ACTIONS = Object.freeze({
    review: ({draft, revision}) => {draft.review(revision);},
    closeReview: ({draft, revision}) => {draft.closeReview(revision);},
    undo: ({draft, revision, session}) => {draft.undo(revision); session.resetDraftForms = true;},
    redo: ({draft, revision, session}) => {draft.redo(revision); session.resetDraftForms = true;},
    jump: ({draft, revision, message, session}) => {
        draft.jump(revision, /** @type {Extract<DraftMessage, {type: 'jumpProfileDraft'}>} */ (message).step);
        session.resetDraftForms = true;
    },
    discardChanges: ({draft, revision, message, session}) => {
        draft.discard(revision, /** @type {Extract<DraftMessage, {type: 'discardProfileDraftChanges'}>} */ (message).group);
        session.resetDraftForms = true;
    },
    discard: async ({draft, revision, session, service}) => {
        // The draft's own keyboard, unchanged: discarding is an undoable
        // step. Otherwise the keyboard is read again and the draft starts
        // over from it.
        if (!draft.stale && !draft.base.incomplete && panelState(session).selectedDeviceId === draft.deviceId) {
            draft.discardAll(revision);
            session.resetDraftForms = true;
            session.notice = "Draft discarded. Undo (⌘Z) brings it back.";
            return;
        }
        draft.assertRevision(revision, {allowStale: true});
        const state = service.snapshot();
        if (!state.connected) throw new Error("Reconnect and read the keyboard before discarding its draft.");
        const complete = hasCurrentLayers(state.capabilities);
        discardDraftForDevice(session, state, complete ? await service.readPortableProfile() : undefined);
        session.notice = complete ? "Draft discarded. Showing the saved keyboard configuration." : "Draft discarded. This keyboard remains read-only.";
        return;
    },
    rebase: async ({draft, revision, session, service}) => {
        draft.assertRevision(revision, {allowStale: true});
        if (service.snapshot().selectedDeviceId !== draft.deviceId) throw new Error("Reconnect the keyboard this draft belongs to.");
        const snapshot = await service.readPortableProfile({forRestore: true});
        observePortable(session, service.snapshot(), snapshot);
        draft.rebase(revision);
        session.resetDraftForms = true;
        session.notice = "Review now compares your draft with the latest keyboard state. Apply will replace the differences shown.";
        return;
    },
    // The success state's way back: the copy saved before the last Apply
    // becomes the draft, one undoable step, reviewed and applied as any edit.
    putBack: ({draft, revision, session}) => {
        const before = session.beforeApply;
        if (!before || before.deviceId !== draft.deviceId) throw new Error("There is no copy from before an Apply on this keyboard to put back.");
        draft.replace(before.document, revision, "edit", "Put back what the keyboard had before Apply", IDENTITY);
        session.resetDraftForms = true;
    },
    apply: async ({draft, revision, message, session, service, host}) => {
        // The interface asks about active traps and warnings; the host
        // enforces that decision before writing a recovery copy or HID.
        if (draft.hasBlockers()) throw new Error("Resolve the blockers in Checks before applying this profile.");
        if (draft.hasChecksToConfirm() && /** @type {Extract<DraftMessage, {type: 'applyProfileDraft'}>} */ (message).confirmChecks !== true) throw new Error("This draft has warnings or traps. Confirm them in the review before applying.");
        // A finished Apply is shown only while this control still runs:
        // a later read or export is not its readback.
        await whileApplying(session, async (readStep) => {
            /** @type {string | undefined} */
            let recovery = "";
            /** @type {import("../model/types.js").PortableDocument | undefined} */
            let saved;
            const before = draft.base;
            const result = await run(host, "Applying the complete profile to both halves",
                () => draft.apply(service, revision, async (document) => {if (document.format === "charybdis-profile") saved = /** @type {import("../model/types.js").PortableDocument} */ (document); return (recovery = await saveRecovery(host, document));}));
            session.resetDraftForms = true;
            // What the keyboard held before, for "Put back what it had".
            session.beforeApply = saved ? {document: saved, deviceId: draft.deviceId, savedAt: new Date().toISOString()} : undefined;
            const expected = reconnectAfter(session, before, result);
            let reread = "";
            await rereadKeyboard(service, (step) => {
                readStep(step);
                service.emitChange?.();
            }).catch((error) => {reread = rereadOutcome(session, expected, error);});
            session.notice = reconnectNotice(expected, `${savedNotice(result, "applied to")} ${reread}Previous profile saved at ${recovery}`);
        });
        return;
    },
});

/** @param {Session} session @param {DraftMessage} message @param {Host} [host] */
async function draftControl(session, message, host = {}) {
    const draft = session.draft, service = session.service;
    if (!draft) throw new Error("Read a complete keyboard profile before editing.");
    const control = panelControl(message.type);
    if (session.demo && control?.demo === "refuse") {
        throw Object.assign(new Error(DEMO_WORDS.applyNeedsKeyboard), {code: "DEMO_REFUSED"});
    }
    const action = control?.route === "draft" ? DRAFT_ACTIONS[control.action] : undefined;
    if (!action) throw new Error("Unsupported draft control.");
    await action({draft, service, session, message, revision: message.draftRevision, host});
}

// The portable flows that are not just file dialogs: reviewing an import,
// editing layer names and order, and keeping either in the draft — or, on a
// keyboard with no draft, restoring it to the keyboard.
/** @typedef {import('../../contracts/messages.js').PortableControl} PortableMessage */
/** @typedef {{session: Session, message: PortableMessage, host: Host, service: Session['service']}} PortableContext */
/** @type {Readonly<Record<string, (context: PortableContext) => void | Promise<void>>>} */
const PORTABLE_ACTIONS = Object.freeze({
    cancel: ({session}) => {closeEditors(session);},
    choose: context => PORTABLE_ACTIONS.reviewImport(context),
    editLayer: ({session, message}) => {applyLayerEdit(session.portableLayers, /** @type {import('../../contracts/messages.js').LayerEditControl} */ (message));},
    saveLayers: context => PORTABLE_ACTIONS.restore(context),
    reviewImport: async ({session, message, host, service}) => {
        // The host answers with the file's text, and its name when it has one.
        // A drop carries those same values directly from the panel.
        const chosen = message.type === "reviewPortableProfile" ? message : await host.chooseProfile?.();
        if (chosen === undefined) return;
        const text = typeof chosen === "string" ? chosen : chosen.text;
        if (typeof text !== "string") throw new Error("This profile file could not be read.");
        if (Buffer.byteLength(text, "utf8") > FILE_MAX_BYTES) throw new Error("This profile file is too large.");
        const value = validateSnapshot(text, panelCapabilities(session) || undefined);
        session.portableReview = {document: value.document, fileName: typeof chosen === "string" ? null : chosen.name || null,
            before: session.draft?.current || await service.readPortableProfile({forRestore: true}), revision: session.draft?.revision,
            deviceId: panelState(session).selectedDeviceId, draftId: session.draft?.id};
        session.portableLayers = undefined;
        return;
    },
    manageLayers: async ({session, service}) => {
        const before = session.draft?.current || await service.readPortableProfile();
        session.portableReview = undefined;
        session.portableLayers = startLayerEdit(before, session.draft?.revision);
        session.portableLayers.deviceId = panelState(session).selectedDeviceId;
        session.portableLayers.draftId = session.draft?.id;
        return;
    },
    restore: async ({session, message, host, service}) => {
        const layers = message.type === "savePortableLayers";
        const entry = layers
            ? {kind: /** @type {const} */ ("layers"), editor: requireReview(session.portableLayers)}
            : {kind: /** @type {const} */ ("profile"), editor: requireReview(session.portableReview)};
        const editor = entry.editor, before = editor.before;
        if (!before) throw new Error("Review the profile before restoring it.");
        const editorDeviceId = editor.deviceId;
        const selectedDeviceId = panelState(session).selectedDeviceId;
        if (editorDeviceId !== undefined && editorDeviceId !== selectedDeviceId) {
            throw new Error("This profile review belongs to another keyboard. Open it again on the selected keyboard.");
        }
        if (session.draft && (editor.revision !== session.draft.revision ||
            editor.draftId !== session.draft.id)) {
            throw new Error("This profile review belongs to an older draft. Open it again on the selected keyboard.");
        }
        if (session.draft && selectedDeviceId !== session.draft.deviceId) {
            throw new Error("This profile review belongs to another keyboard. Open it again on the selected keyboard.");
        }
        const document = entry.kind === "layers" ? layerEditDocument(entry.editor) : entry.editor.document;
        if (session.draft) {
            // An import has no layer order to keep: its layers are
            // compared slot by slot with the keyboard's.
            if (entry.kind === "layers") session.draft.editLayers(document, session.draft.revision, entry.editor.order);
            else session.draft.replace(document, session.draft.revision, "edit", "Imported a profile", IDENTITY);
            closeEditors(session, {resetForms: true});
            return;
        }
        /** @type {string | undefined} */
        let recovery = "";
        const result = await service.restorePortableProfile(document, {expectedFingerprint: before.fingerprint,
            saveRecovery: async (copy) => (recovery = await saveRecovery(host, copy))});
        closeEditors(session);
        const expected = reconnectAfter(session, before, result);
        let reread = "";
        await rereadKeyboard(service).catch((error) => {reread = rereadOutcome(session, expected, error);});
        session.notice = reconnectNotice(expected, savedNotice(result, "saved to") + " " + reread + (before.incomplete ? "Interrupted data retained for diagnosis: " : "Previous profile saved at ") + recovery);
        return;
    },
});

/** @param {Session} session @param {PortableMessage} message @param {Host} [host] */
async function portableControl(session, message, host = {}) {
    if (message.type === "savePortableLayers" && message.names !== undefined) applyLayerEdit(session.portableLayers, message);
    const control = panelControl(message.type);
    const action = control?.route === "portable" ? PORTABLE_ACTIONS[control.action] : undefined;
    if (!action) throw new Error("Unsupported portable control.");
    await action({session, message, host, service: session.service});
}

/** @template T @param {T | null | undefined} value @returns {T} */
function requireReview(value) {
    if (!value) throw new Error("Review the profile before restoring it.");
    return value;
}

/** @param {Host} host @param {Parameters<import("./types.js").SaveRecovery>[0]} document */
function saveRecovery(host, document) {
    if (typeof host.saveRecovery !== "function") throw new TypeError("host.saveRecovery is not a function");
    return host.saveRecovery(document);
}

module.exports = {readKeyboard, draftControl, portableControl, rereadKeyboard, DRAFT_ACTIONS, PORTABLE_ACTIONS};
