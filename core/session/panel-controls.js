// @ts-check
"use strict";

// What the panel's controls do, in order: reading the keyboard, the draft's
// own controls (review, undo, discard, rebase, apply) and the portable flows
// (import review, layer editing, restore).
//
// It is sequencing and session state, not the page, so it sits here with a
// test; core/session/panel-loop.js runs it with the shell's own functions as
// `shell`, of which these use three,
//
//   shell.progress(title, run)     runs `run` behind a progress indicator
//   shell.saveRecovery(document, about)
//                                  writes a recovery copy with what made it and
//                                  the keyboard's name, resolves to where it went
//   shell.chooseProfile()          resolves to a chosen file's text, or undefined
//
// and `shell.words.noneFound`, when a shell says "no keyboard found" its own
// way (the page's words otherwise, SHELL_WORDS in panel-session.js).

/**
 * @typedef {import("./types.js").RunningPanelSession} Session
 * @typedef {import("./types.js").ControlShell} Shell
 */
const {panelControl} = require("./panel-control-registry");
const {canEdit, hasCurrentLayers} = require("./firmware-support");
const {validateSnapshot, FILE_MAX_BYTES, FILE_TOO_LARGE} = require("../model/portable-profile");
const {failureSentence} = require("../model/vocabulary");
const {DEMO_WORDS, panelCapabilities, panelState} = require("./demo-session");
const {SHELL_WORDS, applyLayerEdit, discardDraftForDevice, layerEditDocument, observePortable, startLayerEdit} = require("./panel-session");
const {closeEditors, whileApplying} = require("./panel-session-state");
const {compose} = require("../model/layer-order");
const {LAYER_IDENTITY} = require("../data/charybdis-layout");
const {RECONNECT_WORDS, expectReconnect, renamedTo} = require("./keyboard-reconnect");
const {LIVE_ACTIONS, CHANGED_ELSEWHERE, proposeLive, retryRead, saveCutShortResult, setEditMode} = require("./live-edits");
const {restartKeyboard, putBackAfterRestart} = require("./keyboard-restart");
const {isStartingTimeout, readOnceStarted, startingTimeout} = require("./keyboard-starting");
const {EDIT_MODE} = require("../protocol/profile-edit-v1");
const {keyboardLabel} = require("./device-model");

// Ark reads only current firmware; the compatibility diagnostics say what
// this keyboard's firmware lacks.
const FIRMWARE_UPDATE = "This keyboard's firmware is not the current firmware, which is the only one Ark supports. Update both halves, then read the keyboard again. The keyboard has not been changed.";

/** @template T @param {Shell} shell @param {string} title @param {() => Promise<T>} work */
const run = (shell, title, work) => shell.progress ? shell.progress(title, work) : work();
// The slave half confirmed its copy before the keyboard switched, but the
// cable between the halves may have come out since; say so instead of
// claiming a readback of both halves that did not happen.
/** @param {{slaveUnseen?: boolean} | undefined} result @param {string} verb */
const savedNotice = (result, verb) => result?.slaveUnseen
    ? `Complete profile ${verb} both halves and active. The slave half confirmed its copy but is not connected now; plug the cable between the halves back in.`
    : `Complete profile ${verb} both halves and verified.`;
// The profile is saved whatever the read after it does, so a failed read is
// said after the save rather than in place of it.
/** @param {unknown} error */
const rereadFailure = (error) => `Reading the keyboard again failed. ${failureSentence(error)} `;

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
    // The layout comes from the saved profile, downloaded and checked here:
    // the fresh read of what the keyboard stored. The profile step takes
    // those bytes again while the keyboard still names exactly them.
    await service.readLayout();
    onStep("profile");
    await service.readCommittedProfile({reuse: true});
    onStep("combos");
    await service.readCombos();
    onStep("baseRgb");
    await service.readBaseRgb();
}

// Connect if needed, then read what the keyboard runs. Each device read
// rejects with what failed (and leaves it in the keyboard's state), which
// fails the read and becomes the panel's notice. The notice says what was
// read and what could not be: a keyboard not on current firmware is read no
// further, a failed complete read falls back to the independent reads, and
// a failed committed-profile read keeps the layout and the optional reads.
/** @param {Session} session @param {string | undefined} selectedDeviceId @param {Shell} [shell] */
async function readKeyboard(session, selectedDeviceId, shell = {}) {
    const service = session.service;
    await service.enumerate();
    const devices = service.snapshot().devices;
    if (!devices.length) {
        session.notice = shell.words?.noneFound || SHELL_WORDS.noneFound;
        return false;
    }
    if (selectedDeviceId && !devices.some((device) => device.id === selectedDeviceId)) {
        throw new Error("The selected keyboard is no longer available. Choose a keyboard from the keyboard menu.");
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
    // A keyboard that has just come back is read once it has finished
    // starting, and read again while it changes under the read
    // (keyboard-starting.js); one that never finishes says so.
    const timedOut = () => {
        session.notice = startingTimeout(session);
        return false;
    };
    let started;
    try {started = await service.awaitStarted?.();}
    catch (error) {
        if (isStartingTimeout(error)) return timedOut();
        throw error;
    }
    let macroFailure = "", portable;
    try {portable = await run(shell, "Reading the keyboard's complete profile", () => readOnceStarted(service, started, () => service.readKeyboardProfile()));}
    catch (error) {
        if (isStartingTimeout(error)) return timedOut();
        if (/** @type {Error & {code?: string}} */ (error).code === "FIRMWARE_UPDATE_REQUIRED") {
            session.notice = /** @type {Error} */ (error).message;
            return false;
        }
        macroFailure = ` Macros and global settings could not be read. ${failureSentence(error)}`;
        // A follow-back's read the keyboard moved under is the live watch's
        // to read again (live-watch.js), within its bound.
        if (session.reconnect && session.draft?.live) {
            session.draft.needsRead = true;
            retryRead(session, error);
        }
    }
    if (!portable) {
        // A partly readable keyboard still gets its independent diagnostics.
        // A failed complete read never opens an editable draft.
        await run(shell, "Reading keys and layers", () => service.readLayout());
        // A failure stays in the keyboard's state, said below.
        await run(shell, "Reading the keyboard's saved profile", () => service.readCommittedProfile()).catch(() => {});
        await service.readBaseRgb();
        await service.readCombos();
    }
    const state = service.snapshot();
    if (state.error || state.committed?.state !== "read") {
        // Each failure says itself in words (model/vocabulary.js
        // failureSentence); the decoder's own text stays in the diagnostics,
        // where the device service put it.
        session.notice = `The keyboard profile could not be read. ${state.error ? failureSentence(state.error) : "The keyboard returned no verified profile."}`;
    } else {
        const description = state.committed.source === "compiled"
            ? "compiled defaults"
            : `saved profile, generation ${state.committed.generation}`;
        const failures = state.committed.failures?.length || 0;
        session.notice = `Read the keyboard's ${description}.` + (failures ? ` ${failures} part${failures === 1 ? "" : "s"} of it could not be read; see Diagnostics on the Keyboard screen.` : "");
    }
    if (macroFailure) session.notice += macroFailure;
    // A live keyboard that restarted (a replug, a lost connection) since Ark
    // knew of unsaved edits: in Live edit it may have saved them first.
    const restarted = session.draft?.restartedWithUnsaved;
    // A Save cut short says what became of its edits, which also tells the restart.
    const saveResult = saveCutShortResult(session, portable);
    if (saveResult) {
        session.notice += ` ${saveResult}`;
        // A keyboard Ark followed back says so after this read: the result
        // goes with what it says.
        if (session.reconnect) session.reconnect.after = [session.reconnect.after, saveResult].filter(Boolean).join(" ");
    }
    // A restart Ark asked for kept the edits itself and says what became of them.
    else if (restarted && session.draft && !session.restart) {
        session.notice += restarted.kept ? " The keyboard restarted since Ark last read it and kept your edits: it saved them first."
            : restarted.mode === EDIT_MODE.LIVE ? " The keyboard restarted before it saved your last edits, so those are gone: it runs what it saved."
            : " The keyboard restarted since Ark last read it, so its unsaved edits are gone: it runs its saved profile again.";
    }
    if (session.draft) session.draft.restartedWithUnsaved = undefined;
    if (session.draft?.changedElsewhere) {
        session.notice += ` ${CHANGED_ELSEWHERE}`;
        session.draft.changedElsewhere = false;
    }
    const ready = Boolean(!state.error && state.committed?.state === "read" && state.layout?.state === "read"
        && hasCurrentLayers(state.capabilities) && portable && !portable.incomplete);
    // After a restart Ark asked for, the edits it kept go back to the keyboard.
    if (ready && session.restart) await putBackAfterRestart(session);
    return ready;
}

// The draft's own controls. Each leaves the session's outbox (notice, form
// reset) saying what happened; the caller publishes.
/** @typedef {import('../../contracts/messages.js').DraftControl & {draftRevision: number}} DraftMessage */
/** @typedef {{session: Session, draft: NonNullable<Session['draft']>, service: Session['service'], revision: number, message: DraftMessage, shell: Shell}} DraftContext */
// In Live preview + save the history, discards, Save and Revert go through
// the keyboard (live-edits.js); `local` is what a Review and save draft does.
/** @param {string} name @param {(context: DraftContext) => void | Promise<void>} [local] @returns {(context: DraftContext) => Promise<void>} */
const liveOr = (name, local) => async (context) => {
    if (context.draft.live) {
        await LIVE_ACTIONS[name]({...context, saveRecovery: recoveryFor(context.shell, context.session, "save")});
        if (["undo", "redo", "jump", "discardChanges", "putBack"].includes(name)) context.session.resetDraftForms = true;
        return;
    }
    if (!local) throw new Error("Save, Revert and live edits are for a keyboard in a live edit mode.");
    await local(context);
};
/** @type {Readonly<Record<string, (context: DraftContext) => void | Promise<void>>>} */
const DRAFT_ACTIONS = Object.freeze({
    review: ({draft, revision}) => {draft.review(revision);},
    closeReview: ({draft, revision}) => {draft.closeReview(revision);},
    undo: liveOr("undo", ({draft, revision, session}) => {draft.undo(revision); session.resetDraftForms = true;}),
    redo: liveOr("redo", ({draft, revision, session}) => {draft.redo(revision); session.resetDraftForms = true;}),
    jump: liveOr("jump", ({draft, revision, message, session}) => {
        draft.jump(revision, /** @type {Extract<DraftMessage, {type: 'jumpProfileDraft'}>} */ (message).step);
        session.resetDraftForms = true;
    }),
    discardChanges: liveOr("discardChanges", ({draft, revision, message, session}) => {
        draft.discard(revision, /** @type {Extract<DraftMessage, {type: 'discardProfileDraftChanges'}>} */ (message).group);
        session.resetDraftForms = true;
    }),
    save: liveOr("save"),
    revert: liveOr("revert"),
    confirmLive: liveOr("confirmLive"),
    cancelLive: async ({session}) => {session.liveProposal = undefined; session.resetDraftForms = true;},
    // Taken while the edit runs (registry phase `within`): the edit's own
    // path says how it ended (live-edits.js).
    abortLive: async ({session, service}) => {
        if (!service.cancelLiveEdit?.()) session.notice = "Nothing to cancel: the keyboard is not holding an edit of Ark's.";
    },
    setMode: ({session, message, shell}) => setEditMode(session, /** @type {{mode: number, pending?: string, draftRevision: number}} */ (/** @type {unknown} */ (message)),
        (cause) => recoveryFor(shell, session, cause), shell),
    // A keyboard that stopped saving (firmware D-F34), in any edit mode.
    restart: ({session, draft, shell}) => restartKeyboard({session, draft, saveRecovery: recoveryFor(shell, session, "restart")}),
    discard: liveOr("discard", async ({draft, revision, session, service}) => {
        // The draft's own keyboard, unchanged: discarding is an undoable
        // step. Otherwise the keyboard is read again and the draft starts
        // over from it.
        if (!draft.stale && !draft.base.incomplete && panelState(session).selectedDeviceId === draft.deviceId) {
            draft.discardAll(revision);
            session.resetDraftForms = true;
            session.notice = "Draft discarded. Undo brings it back.";
            return;
        }
        draft.assertRevision(revision, {allowStale: true});
        const state = service.snapshot();
        if (!state.connected) throw new Error("Reconnect and read the keyboard before discarding its draft.");
        const complete = hasCurrentLayers(state.capabilities);
        discardDraftForDevice(session, state, complete ? await service.readPortableProfile() : undefined);
        session.notice = complete ? "Draft discarded. Showing the keyboard's saved profile." : "Draft discarded. This keyboard remains read-only.";
        return;
    }),
    rebase: liveOr("rebase", async ({draft, revision, session, service}) => {
        draft.assertRevision(revision, {allowStale: true});
        if (service.snapshot().selectedDeviceId !== draft.deviceId) throw new Error("Reconnect the keyboard this draft belongs to.");
        const snapshot = await service.readPortableProfile({forRestore: true});
        observePortable(session, service.snapshot(), snapshot);
        draft.rebase(revision);
        session.resetDraftForms = true;
        session.notice = "Review now compares your draft with the latest keyboard state. Save will replace the differences shown.";
        return;
    }),
    // The success state's way back: the copy saved before the last Apply
    // becomes the draft, one undoable step, reviewed and applied as any edit.
    putBack: liveOr("putBack", ({draft, revision, session}) => {
        const before = session.beforeApply;
        if (!before || before.deviceId !== draft.deviceId) throw new Error("There is no copy from before a save on this keyboard to put back.");
        draft.replace(before.document, revision, "edit", "Put back what the keyboard had before the save", LAYER_IDENTITY);
        session.resetDraftForms = true;
    }),
    apply: async ({draft, revision, message, session, service, shell}) => {
        // The interface asks about active traps and warnings; the shell
        // enforces that decision before writing a recovery copy or HID.
        if (draft.hasBlockers()) throw new Error("Resolve the blockers in Checks before saving this profile.");
        if (draft.hasChecksToConfirm() && /** @type {Extract<DraftMessage, {type: 'applyProfileDraft'}>} */ (message).confirmChecks !== true) throw new Error("This draft has warnings or traps. Confirm them in the review before saving.");
        // A finished Apply is shown only while this control still runs:
        // a later read or export is not its readback.
        await whileApplying(session, async (readStep) => {
            /** @type {string | undefined} */
            let recovery = "";
            /** @type {import("../model/types.js").PortableDocument | undefined} */
            let saved;
            const before = draft.base;
            const result = await run(shell, "Saving the complete profile to both halves",
                () => draft.apply(service, revision, async (document) => {if (document.format === "charybdis-profile") saved = /** @type {import("../model/types.js").PortableDocument} */ (document); return (recovery = await recoveryFor(shell, session, "apply")(document));}));
            session.resetDraftForms = true;
            // What the keyboard held before, for "Put back what it had".
            session.beforeApply = saved ? {document: saved, deviceId: draft.deviceId, savedAt: new Date().toISOString()} : undefined;
            const expected = reconnectAfter(session, before, result);
            let reread = "";
            await rereadKeyboard(service, (step) => {
                readStep(step);
                service.emitChange?.();
            }).catch((error) => {reread = rereadOutcome(session, expected, error);});
            session.notice = reconnectNotice(expected, `${savedNotice(result, "saved to")} ${reread}Recovery copy: ${recovery}`);
        });
        return;
    },
});

/** @param {Session} session @param {DraftMessage} message @param {Shell} [shell] */
async function draftControl(session, message, shell = {}) {
    const draft = session.draft, service = session.service;
    if (!draft) throw new Error("Read a complete keyboard profile before editing.");
    const control = panelControl(message.type);
    if (session.demo && control?.demo === "refuse") {
        throw Object.assign(new Error(DEMO_WORDS.applyNeedsKeyboard), {code: "DEMO_REFUSED"});
    }
    const action = control?.route === "draft" ? DRAFT_ACTIONS[control.action] : undefined;
    if (!action) throw new Error("Unsupported draft control.");
    await action({draft, service, session, message, revision: message.draftRevision, shell});
}

// The portable flows that are not just file dialogs: reviewing an import,
// editing layer names and order, and keeping either in the draft — or, on a
// keyboard with no draft, restoring it to the keyboard.
/** @typedef {import('../../contracts/messages.js').PortableControl} PortableMessage */
/** @typedef {{session: Session, message: PortableMessage, shell: Shell, service: Session['service']}} PortableContext */
/** @type {Readonly<Record<string, (context: PortableContext) => void | Promise<void>>>} */
const PORTABLE_ACTIONS = Object.freeze({
    cancel: ({session}) => {closeEditors(session);},
    choose: context => PORTABLE_ACTIONS.reviewImport(context),
    editLayer: ({session, message}) => {applyLayerEdit(session.portableLayers, /** @type {import('../../contracts/messages.js').LayerEditControl} */ (message));},
    saveLayers: context => PORTABLE_ACTIONS.restore(context),
    reviewImport: async ({session, message, shell, service}) => {
        // The shell answers with the file's text, and its name when it has one.
        // A drop carries those same values directly from the panel.
        const chosen = message.type === "reviewPortableProfile" ? message : await shell.chooseProfile?.();
        if (chosen === undefined) return;
        const text = typeof chosen === "string" ? chosen : chosen.text;
        if (typeof text !== "string") throw new Error("This file could not be read.");
        if (Buffer.byteLength(text, "utf8") > FILE_MAX_BYTES) throw new Error(FILE_TOO_LARGE);
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
    restore: async ({session, message, shell, service}) => {
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
        if (session.draft?.live) {
            // Live preview + save: the import or the layer change goes to the
            // keyboard as one edit; an import too large for one is a whole
            // replacement, which needs nothing unsaved (firmware D-F32).
            const draft = session.draft;
            closeEditors(session, {resetForms: true});
            if (entry.kind === "layers") await proposeLive(session, {document, origin: "layers", label: "Edited layers", order: compose(draft.order, entry.editor.order)});
            else await proposeLive(session, {document, origin: "edit", label: "Imported a profile", order: LAYER_IDENTITY}, {replaceWhenLarge: true});
            return;
        }
        if (session.draft) {
            // An import has no layer order to keep: its layers are
            // compared slot by slot with the keyboard's.
            if (entry.kind === "layers") session.draft.editLayers(document, session.draft.revision, entry.editor.order);
            else session.draft.replace(document, session.draft.revision, "edit", "Imported a profile", LAYER_IDENTITY);
            closeEditors(session, {resetForms: true});
            return;
        }
        /** @type {string | undefined} */
        let recovery = "";
        const result = await service.restorePortableProfile(document, {expectedFingerprint: before.fingerprint,
            saveRecovery: async (copy) => (recovery = await recoveryFor(shell, session, "restore")(copy))});
        closeEditors(session);
        const expected = reconnectAfter(session, before, result);
        let reread = "";
        await rereadKeyboard(service).catch((error) => {reread = rereadOutcome(session, expected, error);});
        session.notice = reconnectNotice(expected, savedNotice(result, "saved to") + " " + reread + (before.incomplete ? "Interrupted data retained for diagnosis: " : "Recovery copy: ") + recovery);
        return;
    },
});

/** @param {Session} session @param {PortableMessage} message @param {Shell} [shell] */
async function portableControl(session, message, shell = {}) {
    if (message.type === "savePortableLayers" && message.names !== undefined) applyLayerEdit(session.portableLayers, message);
    const control = panelControl(message.type);
    const action = control?.route === "portable" ? PORTABLE_ACTIONS[control.action] : undefined;
    if (!action) throw new Error("Unsupported portable control.");
    await action({session, message, shell, service: session.service});
}

/** @template T @param {T | null | undefined} value @returns {T} */
function requireReview(value) {
    if (!value) throw new Error("Review the profile before restoring it.");
    return value;
}

// The shell's recovery copy, saying what made it and the keyboard it comes
// from, named as the Keyboard screen's title names it at that moment.
/** @param {Shell} shell @param {Session} session @param {import("../../contracts/model.js").RecoveryCause} cause @returns {import("./types.js").SaveRecovery} */
const recoveryFor = (shell, session, cause) => (document) => {
    if (typeof shell.saveRecovery !== "function") throw new TypeError("shell.saveRecovery is not a function");
    const state = session.service.snapshot();
    const device = state.devices?.find((entry) => entry.id === state.selectedDeviceId);
    return shell.saveRecovery(document, {cause, keyboard: keyboardLabel({...state, device})});
};

module.exports = {readKeyboard, draftControl, portableControl, rereadKeyboard, DRAFT_ACTIONS, PORTABLE_ACTIONS};
