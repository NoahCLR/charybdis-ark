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
//                                  the keyboard's name, resolves to its name as
//                                  Backups lists it (the sentences say where)
//   shell.chooseProfile()          resolves to a chosen file's text, or undefined
//
// and `shell.words.noneFound`, when a shell says "no keyboard found" its own
// way (the page's words otherwise, SHELL_WORDS in panel-session.js).

/**
 * @typedef {import("./types.js").RunningPanelSession} Session
 * @typedef {import("./types.js").ControlShell} Shell
 */
const {panelControl} = require("./panel-control-registry");
const {hasCurrentLayers} = require("./firmware-support");
const {validateSnapshot, FILE_MAX_BYTES, FILE_TOO_LARGE} = require("../model/portable-profile");
const {BLANK_SLATE, VIA_IMPORT_LABEL, importViaLayout, viaClearable, viaLayoutOf} = require("../model/via-layout");
const {firmwareUpdateRequired} = require("../schema/profile-blob-v1");
const {failureSentence} = require("../model/vocabulary");
const {exportedList} = require("../model/autocorrect-editor");
const {DEMO_WORDS, panelCapabilities, panelState} = require("./demo-session");
const {SHELL_WORDS, applyLayerEdit, discardDraftForDevice, layerEditDocument, startLayerEdit} = require("./panel-session");
const {followRead, readFailed} = require("./draft-follow");
const {closeEditors, say, sayAfter, takeBack, whileApplying} = require("./panel-session-state");
const {IDENTITY, compose} = require("../model/draft-order");
const {RECONNECT_WORDS, expectReconnect, renamedTo} = require("./keyboard-reconnect");
const {LIVE_ACTIONS, proposeLive, readNews, setEditMode} = require("./live-edits");
const {restartKeyboard, putBackAfterRestart} = require("./keyboard-restart");
const {startingTimeout} = require("./keyboard-starting");
const {keyboardLabel, selectedDevice} = require("./device-model");
const {recoveryStorageFailure} = require("./recovery-copy");
const {forget, keptFor, remember} = require("./kept");

/** @template T @param {Shell} shell @param {string} title @param {() => Promise<T>} work */
const run = (shell, title, work) => shell.progress ? shell.progress(title, work) : work();
// The slave half confirmed its copy before the keyboard switched, but the
// cable between the halves may have come out since; say so instead of
// claiming a readback of both halves that did not happen.
/** @param {{slaveUnseen?: boolean} | undefined} result */
const savedNotice = (result) => result?.slaveUnseen
    ? "Complete profile saved to both halves and active. The slave half confirmed its copy but is not connected now; plug the cable between the halves back in."
    : "Complete profile saved to both halves and verified.";
// The profile is saved whatever the read after it does, so a failed read is
// said after the save rather than in place of it.
/** @param {unknown} error */
const rereadFailure = (error) => `Reading the keyboard again failed. ${failureSentence(error)} `;

// After the keyboard stored a profile, everything the panel shows of it is
// read again (the service's `readBack`) and the notice says the save, then a
// read after it that failed, then `copy`: what was kept before it, and where.
// A save that renamed the keyboard is followed by the keyboard reconnecting
// under its new name. Its readback may be cut short by that: the keyboard is
// read again once it is back, so that is said instead of a failure, and the
// notice holds until the reconnect says how it went.
/** @param {Session} session @param {{before: import("../model/types.js").ProfileSnapshot | null | undefined, result: import("../model/types.js").ProfileSnapshot & {slaveUnseen?: boolean}, copy: string, onStep?: (step: import("../../contracts/messages.js").ReadStep) => void}} stored */
async function storedProfile(session, {before, result, copy, onStep}) {
    const service = session.service;
    const expected = expectReconnect(session, renamedTo(before, result));
    let reread = "";
    await service.readBack(onStep).catch((error) => {
        if (!(expected && session.reconnect === expected && !service.snapshot().connected)) reread = rereadFailure(error);
    });
    const notice = `${savedNotice(result)} ${reread}${copy}`;
    if (!expected) {say(session, notice, reread ? "failed" : undefined); return;}
    expected.saved = notice;
    expected.waiting = `${notice} ${RECONNECT_WORDS.waiting}`;
    // A failed read after the save is said as the failure it is, and stays.
    say(session, expected.waiting, reread ? "failed" : "lasting");
}

// The shell's progress words for the editor read's slow steps.
/** @type {Readonly<Record<import("./types.js").EditorReadStep, string>>} */
const READ_TITLES = Object.freeze({
    complete: "Reading the keyboard's complete profile",
    layout: "Reading keys and layers",
    profile: "Reading the keyboard's saved profile",
});

// Connect if needed, then read what the keyboard runs (the service's
// `readForEditor`), and say what was read and what could not be: a keyboard
// not on current firmware is read no further, a failed complete read falls
// back to the independent reads, and a failed committed-profile read keeps
// the layout and the optional reads. A device read that rejects fails the
// read and becomes the panel's notice.
/** @param {Session} session @param {string | undefined} selectedDeviceId @param {Shell} [shell] */
async function readKeyboard(session, selectedDeviceId, shell = {}) {
    const service = session.service;
    // "No keyboard found" holds only while the page has none it may open: a
    // read of one it lists takes it back, as soon as the read publishes.
    const noneFound = shell.words?.noneFound || SHELL_WORDS.noneFound;
    if (service.snapshot().devices?.length) takeBack(session, noneFound);
    const read = await service.readForEditor(selectedDeviceId, {
        progress: (step, work) => run(shell, READ_TITLES[step], work),
        // A follow-back's read the keyboard moved under is the live watch's
        // to read again (live-watch.js), within its bound.
        failed: (error) => {if (session.reconnect && session.draft?.live) readFailed(session, error);},
    });
    // It holds until a keyboard is listed (above).
    if (read.kind === "none") {
        say(session, noneFound, "lasting");
        return false;
    }
    if (read.kind === "firmware") {
        // Ark reads only current firmware; the compatibility diagnostics say what
        // this keyboard's firmware lacks.
        say(session, (read.failure || firmwareUpdateRequired()).message, "failed");
        return false;
    }
    // A keyboard that has just come back is read once it has finished
    // starting (keyboard-starting.js); one that never finishes says so.
    if (read.kind === "starting") {
        say(session, startingTimeout(session), "failed");
        return false;
    }
    const portable = read.portable;
    const macroFailure = read.failure ? ` Macros and global settings could not be read. ${failureSentence(read.failure)}` : "";
    const state = service.snapshot();
    if (state.error || state.committed?.state !== "read") {
        // Each failure says itself in words (model/vocabulary.js
        // failureSentence); the decoder's own text stays in the diagnostics,
        // where the device service put it.
        say(session, `The keyboard profile could not be read. ${state.error ? failureSentence(state.error) : "The keyboard returned no verified profile."}`, "failed");
    } else {
        const description = state.committed.source === "compiled"
            ? "compiled defaults"
            : `saved profile, generation ${state.committed.generation}`;
        const failures = state.committed.failures?.length || 0;
        say(session, `Read the keyboard's ${description}.` + (failures ? ` ${failures} part${failures === 1 ? "" : "s"} of it could not be read.` : ""), failures ? "failed" : undefined);
    }
    // What could not be read stays said, as the failure it is.
    if (macroFailure) sayAfter(session, macroFailure.trim(), "failed");
    // A live keyboard that restarted (a replug, a lost connection) since Ark
    // knew of unsaved edits: in Live edit it may have saved them first. Or
    // its working copy changed without Ark.
    const told = readNews(session, portable);
    if (told.words) sayAfter(session, told.words);
    // A keyboard Ark followed back says so after this read: what became of a
    // Save cut short goes with what it says.
    if (told.cutShort && session.reconnect) session.reconnect.after = [session.reconnect.after, told.restart].filter(Boolean).join(" ");
    const ready = Boolean(!state.error && state.committed?.state === "read" && state.layout?.state === "read"
        && hasCurrentLayers(state.capabilities) && portable && !portable.incomplete);
    // After a restart Ark asked for, the edits it kept go back to the keyboard.
    if (ready) await putBackAfterRestart(session);
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
        if (!service.cancelLiveEdit?.()) say(session, "Nothing to cancel: the keyboard is not holding an edit of Ark's.");
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
            say(session, "Draft discarded. Undo brings it back.");
            return;
        }
        draft.assertRevision(revision, {allowStale: true});
        const state = service.snapshot();
        if (!state.connected) throw new Error("Reconnect and read the keyboard before discarding its draft.");
        const complete = hasCurrentLayers(state.capabilities);
        discardDraftForDevice(session, state, complete ? await service.readPortableProfile() : undefined);
        say(session, complete ? "Draft discarded. Showing the keyboard's saved profile." : "Draft discarded. This keyboard remains read-only.");
        return;
    }),
    rebase: liveOr("rebase", async ({draft, revision, session, service}) => {
        draft.assertRevision(revision, {allowStale: true});
        if (service.snapshot().selectedDeviceId !== draft.deviceId) throw new Error("Reconnect the keyboard this draft belongs to.");
        const snapshot = await service.readPortableProfile({forRestore: true});
        followRead(session, snapshot, service.snapshot());
        draft.rebase(revision);
        session.resetDraftForms = true;
        say(session, "Review now compares your draft with the latest keyboard state. Save will replace the differences shown.");
        return;
    }),
    // The success state's way back: the copy saved before the last Apply
    // becomes the draft, one undoable step, reviewed and applied as any edit.
    putBack: liveOr("putBack", ({draft, revision, session}) => {
        const before = keptFor(session, "beforeApply", session.service.snapshot(), draft.deviceId);
        if (!before) throw new Error("There is no copy from before a save on this keyboard to put back.");
        draft.replace(before.document, revision, "edit", "Put back what the keyboard had before the save", IDENTITY);
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
            if (saved) remember(session, "beforeApply", {document: saved, savedAt: new Date().toISOString()}, service.snapshot(), draft.deviceId);
            else forget(session, "beforeApply");
            await storedProfile(session, {before, result, copy: `Recovery copy on Backups: ${recovery}`, onStep: (step) => {
                readStep(step);
                service.emitChange?.();
            }});
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
        const capabilities = panelCapabilities(session) || undefined;
        const fileName = typeof chosen === "string" ? null : chosen.name || null;
        const origin = {revision: session.draft?.revision, deviceId: panelState(session).selectedDeviceId, draftId: session.draft?.id};
        // A VIA layout holds keys and macros only, so it comes into the
        // draft's own profile (D-L97); with no draft there is none to keep.
        const via = viaLayoutOf(text);
        if (via) {
            if (!session.draft) throw new Error("Read the keyboard's whole profile before importing a VIA layout: it changes keys and macros only, and keeps the rest.");
            session.portableReview = viaReview(session.draft.current, {via, clear: BLANK_SLATE}, capabilities, {fileName, ...origin});
        } else {
            const value = validateSnapshot(text, capabilities);
            session.portableReview = {document: value.document, fileName,
                before: session.draft?.current || await service.readPortableProfile({forRestore: true}), ...origin};
        }
        session.portableLayers = undefined;
        return;
    },
    // A blank slate for a VIA layout's import (D-L97): the draft's behaviours,
    // combos or custom keys go too, or stay, and the review is made again.
    viaClears: ({session, message}) => {
        const review = requireReview(session.portableReview);
        if (!review.viaSource) throw new Error("Only a VIA layout's import removes behaviours, combos or custom keys.");
        const {clear} = /** @type {Extract<PortableMessage, {type: "setViaImportClears"}>} */ (message);
        const chosen = {behaviors: clear?.behaviors === true, combos: clear?.combos === true, customKeys: clear?.customKeys === true};
        const {document, via, differences, viaSource, ...origin} = review;
        session.portableReview = viaReview(review.before, {via: viaSource.via, clear: chosen}, panelCapabilities(session) || undefined, origin);
    },
    // The draft's autocorrect list as a file (D-L85): what is on screen, the
    // edits not yet saved included. Saving the file is the shell's.
    exportAutocorrect: async ({session, message, shell}) => {
        if (!session.draft) throw new Error("Read the keyboard before exporting its text replacement list.");
        const {format} = /** @type {Extract<PortableMessage, {type: "exportAutocorrect"}>} */ (message);
        const where = await shell.saveExport?.(exportedList(session.draft.current, format));
        if (where) say(session, `Text replacement list exported to ${where}`);
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
            if (entry.kind === "layers") await proposeLive(session, {document, origin: "layers", label: "Edited layers", order: compose(draft.order, {layers: entry.editor.order})});
            else await proposeLive(session, {document, origin: "edit", label: importLabel(entry.editor), order: IDENTITY}, {replaceWhenLarge: true});
            return;
        }
        if (session.draft) {
            // An import has no layer order to keep: its layers are
            // compared slot by slot with the keyboard's.
            if (entry.kind === "layers") session.draft.editLayers(document, session.draft.revision, entry.editor.order);
            else session.draft.replace(document, session.draft.revision, "edit", importLabel(entry.editor), IDENTITY);
            closeEditors(session, {resetForms: true});
            return;
        }
        /** @type {string | undefined} */
        let recovery = "";
        const result = await service.restorePortableProfile(document, {expectedFingerprint: before.fingerprint,
            saveRecovery: async (copy) => (recovery = await recoveryFor(shell, session, "restore")(copy))});
        closeEditors(session);
        await storedProfile(session, {before, result, copy: (before.incomplete ? "Interrupted data retained for diagnosis on Backups: " : "Recovery copy on Backups: ") + recovery});
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

// A VIA layout's review: the file read into the draft's profile, with the
// blank slate chosen, kept with the file so another choice reads it again.
// `origin` is the file's name and the keyboard and draft it was opened on.
/** @param {import("../model/types.js").ProfileSnapshot} before @param {import("./types.js").PortableReview["viaSource"] & {}} source @param {import("../model/types.js").ProfileDestination | undefined} capabilities @param {Omit<import("./types.js").PortableReview, "document" | "before" | "via" | "viaSource">} origin @returns {import("./types.js").PortableReview} */
function viaReview(before, source, capabilities, origin) {
    if (before.incomplete || !before.document) throw new Error("Read the keyboard's whole profile before importing a VIA layout.");
    // A complete snapshot holds a complete document.
    const base = /** @type {import("../model/types.js").PortableDocument} */ (before.document);
    const imported = importViaLayout(base, source.via, {capabilities, hostOs: before.hostOs, clear: source.clear});
    return {...origin, document: imported.document, before, viaSource: source,
        via: {layers: imported.layers, macros: imported.macros, pointer: imported.pointer, left: imported.left, kept: imported.kept, clearable: viaClearable(base, capabilities), clear: source.clear}};
}

// What the draft's history calls an import.
/** @param {import("./types.js").PortableReview | import("./types.js").LayerEditState} review */
const importLabel = review => "via" in review && review.via ? VIA_IMPORT_LABEL : "Imported a profile";

/** @template T @param {T | null | undefined} value @returns {T} */
function requireReview(value) {
    if (!value) throw new Error("Review the profile before restoring it.");
    return value;
}

// The shell's recovery copy, saying what made it and the keyboard it comes
// from, named as the Keyboard screen's title names it at that moment. Storage
// that would not keep it is said as its cause (recovery-copy.js).
/** @param {Shell} shell @param {Session} session @param {import("../../contracts/model.js").RecoveryCause} cause @returns {import("./types.js").SaveRecovery} */
const recoveryFor = (shell, session, cause) => async (document) => {
    if (typeof shell.saveRecovery !== "function") throw new TypeError("shell.saveRecovery is not a function");
    const state = session.service.snapshot();
    const device = selectedDevice(state);
    try {return await shell.saveRecovery(document, {cause, keyboard: keyboardLabel({...state, device})});}
    catch (error) {throw recoveryStorageFailure(error);}
};

module.exports = {readKeyboard, draftControl, portableControl, DRAFT_ACTIONS, PORTABLE_ACTIONS};
