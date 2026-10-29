// @ts-check
"use strict";

// The live modes in the panel (firmware D-F32, plan answers 1–3): every edit
// the panel posts, every undo, redo, discard, import and layer change, goes
// to the keyboard's working copy through one path, and the draft moves only
// once the keyboard confirms it. Save and Revert are the keyboard's; in Live
// edit the keyboard saves by itself and Ark only says so (live-watch.js). The
// mode switch asks what to do with work in progress before it changes.
//
//   proposeLive   the trap check, then the edit: asks first when the edit
//                 would add a trap or warning, as review does (answer 2)
//   LIVE_ACTIONS  the draft controls a live draft runs instead of local ones
//   setEditMode   between Review and save, Live edit and Live preview +
//                 save: Save/Revert or Send/Discard first where work would be
//                 lost; leaving Live edit has the keyboard save first, with
//                 no question
//   closingLoses  whether closing Ark now loses edits
//   saveCutShortResult  after a Save the connection cut short, what the next
//                 read shows became of the edits

/**
 * @typedef {import("./types.js").RunningPanelSession} Session
 * @typedef {import("./types.js").ControlShell} Shell
 * @typedef {NonNullable<Session["draft"]>} Draft
 * @typedef {import("./profile-draft-session.js").LiveTarget} Target
 */
const {fingerprint} = require("../model/portable-profile");
const {EDIT_MODE, isEditMode} = require("../protocol/profile-edit-v1");
const {EDIT_MODE_WORDS, INTERRUPTION_REASONS, PHASE, SAVE_WORDS, arkCode, failureSentence, quietWords} = require("../model/vocabulary");
const {LAYER_IDENTITY} = require("../data/charybdis-layout");
const {ProfileDraftSession} = require("./profile-draft-session");
const {replaceDraft} = require("./panel-session-state");
const {expectReconnect, renamedTo} = require("./keyboard-reconnect");
const {interruption, saveResult} = require("./interruption");

/** @param {string} message @param {string} [code] */
const refusal = (message, code = "LIVE_EDIT_REFUSED") => Object.assign(new Error(message), {code});

// What a read says when the working copy moved under the same session.
const CHANGED_ELSEWHERE = "The keyboard's unsaved edits are not what Ark last saw (another app, a lost answer, or an edit that did not land as sent): the draft shows what it runs now, and its history starts again here.";
// Cancel edit ended an edit the keyboard held for released keys.
const CANCELLED = "Edit cancelled: the keyboard runs what it ran before.";
// Refusals Ark makes before the keyboard's working copy could change: no
// read is needed to know what it runs.
const LOCAL_REFUSALS = new Set(["LIVE_EDIT_TOO_LARGE", "LIVE_HALVES_APART"]);
/** @param {unknown} error */
const codeOf = error => /** @type {{code?: string}} */ (error)?.code || "";

// The halves are apart: the slave half refused the working copy, so only a
// Revert brings them together. The draft says so without reading again.
/** @param {Draft} draft */
function markApart(draft) {
    if (draft.live) draft.live = {...draft.live, slaveRefused: true, converged: false};
}

/** @param {Session} session */
function liveDraft(session) {
    const draft = session.draft;
    if (!draft?.live) throw refusal("Read the keyboard again before editing it live.");
    return draft;
}

// Sends `target` to the keyboard, unless it adds a trap or warning the person
// has not confirmed: then it waits as the panel's proposal. On any failure
// the keyboard is read again, so the draft shows what it actually runs.
/** @param {Session} session @param {Target} target @param {{confirmed?: boolean, accepted?: Session["acceptedEdit"], replaceWhenLarge?: boolean}} [options] */
async function proposeLive(session, target, {confirmed = false, accepted, replaceWhenLarge = false} = {}) {
    const draft = liveDraft(session);
    session.liveProposal = undefined;
    const added = draft.checksAdded(target.document, target.order ?? draft.order);
    if (added.some(check => check.level === "blocker")) {
        session.resetDraftForms = true;
        throw refusal(`Not sent: ${added.find(check => check.level === "blocker")?.title || "the keyboard would refuse it"}.`, "LIVE_EDIT_BLOCKED");
    }
    if (added.length && !confirmed) {
        session.liveProposal = {id: draft.revision, draftId: draft.id, revision: draft.revision, target, checks: added, accepted, replaceWhenLarge};
        return false;
    }
    return sendLive(session, draft, target, {accepted, replaceWhenLarge});
}

/** @param {Session} session @param {Draft} draft @param {Target} target @param {{accepted?: Session["acceptedEdit"], replaceWhenLarge?: boolean}} options */
async function sendLive(session, draft, target, {accepted, replaceWhenLarge = false}) {
    const live = /** @type {import("./types.js").LiveState} */ (draft.live);
    const before = draft.current;
    // A step that lands on exactly the saved profile (an undo, a redo of a
    // Revert, an edit put back by hand) is a Revert: sent as an edit it would
    // leave the keyboard a working copy identical to what it saved, still
    // "unsaved", which Live edit would save again as a new generation of the
    // same bytes.
    if (live.unsaved && !draft.base.incomplete && fingerprint(target.document) === draft.base.fingerprint) {
        await revertTo(session, draft, target);
        session.acceptedEdit = accepted;
        return true;
    }
    // Once the keyboard has the edit whole, a read after a failure can tell
    // whether it landed (ProfileDraftSession.expectLive).
    /** @type {import("./profile-draft-session.js").LiveExpectation | undefined} */
    let expected;
    try {
        const result = await session.service.postLiveEdit({from: live.working, to: Buffer.from(target.document.profile, "base64"), defaults: live.defaults,
            identity: {session: live.session, revision: live.revision}, replaceWhenLarge: replaceWhenLarge && !live.unsaved},
        {onCommitted: transactionId => {expected = draft.expectLive(target, transactionId);}});
        if (result.cancelled) {
            draft.expectedLive = undefined;
            session.resetDraftForms = true;
            session.notice = CANCELLED;
            return false;
        }
        draft.confirmLive(target, result);
        landed(session, before, target, result, accepted);
        if (result.cancelTooLate) session.notice = "The keyboard took the edit just before Cancel edit reached it: it runs now. Undo sends it back.";
        return true;
    } catch (error) {
        session.resetDraftForms = true;
        if (codeOf(error) === "LIVE_HALVES_APART") markApart(draft);
        if (!LOCAL_REFUSALS.has(codeOf(error))) await reread(session);
        // The read shows exactly the edit Ark sent, published: whatever went
        // wrong on the way, it landed, and the draft has confirmed it.
        if (expected?.confirmed && session.draft === draft && draft.live) {
            landed(session, before, target, draft.live, accepted);
            return true;
        }
        // The keyboard moved by itself first (an adjustment key, another
        // app): nothing failed, the edit was simply made against an older
        // state. The draft now shows the keyboard's; the person makes it again.
        if (codeOf(error) === "LIVE_EDIT_STALE") {
            session.notice = "Not sent: the keyboard changed by itself just before (a DPI or lighting key, or another app). Ark read it again; make the edit again.";
            return false;
        }
        throw error;
    }
}

// What a live edit the keyboard took leaves behind: the form learns its edit
// was accepted, a rename's USB restart is expected, and the halves are said.
/** @param {Session} session @param {Draft["current"]} before @param {Target} target @param {{converged: boolean, slaveRefused?: boolean}} result @param {Session["acceptedEdit"]} accepted */
function landed(session, before, target, result, accepted) {
    session.acceptedEdit = accepted;
    // A new keyboard name is taken by one USB restart once the keyboard
    // is quiet (firmware D-F25): that loss is expected, as after a save.
    if (!result.slaveRefused) expectReconnect(session, renamedTo(before, {...before, document: target.document, fingerprint: fingerprint(target.document)}));
    if (result.slaveRefused) session.notice = "The slave half refused this edit, so the halves run different profiles. Revert puts both back on the saved profile.";
    else if (!result.converged) session.notice = "The edit runs on the master half; the slave half is catching up. The next edit waits for it.";
}

// Revert on the keyboard, recorded as `target` (a Revert step, or the history
// step that is the saved profile). False when the saved profile had moved on:
// Ark read the keyboard again and said so.
/** @param {Session} session @param {Draft} draft @param {Target} target */
async function revertTo(session, draft, target) {
    const live = /** @type {import("./types.js").LiveState} */ (draft.live);
    const result = await session.service.revertWorkingCopy({session: live.session, revision: live.revision}).catch(async error => {await reread(session); throw error;});
    // Save elsewhere can advance the saved profile without changing the
    // working revision. Revert confirms that saved generation, not ours.
    if (result.savedGeneration !== live.savedGeneration || result.savedOrigin !== live.savedOrigin) {
        await reread(session);
        session.resetDraftForms = true;
        if (session.draft?.stale) throw refusal("Reverted on the keyboard, but its saved profile could not be read. Read the keyboard again.");
        session.notice = "Reverted: the keyboard runs its saved profile again. It was saved elsewhere; Ark read that profile again.";
        return false;
    }
    const before = draft.current;
    draft.confirmLive(target, {session: result.session, revision: result.revision, bytes: live.saved, converged: result.converged, slaveRefused: result.slaveRefused, unsaved: false});
    expectReconnect(session, renamedTo(before, draft.completeBase));
    session.resetDraftForms = true;
    return true;
}

// A Save the connection cut short: the keyboard may have saved, or may have
// restarted and lost the edits with its RAM. Ark can't tell, so it says so,
// keeps the edits (what the keyboard ran) as a recovery copy, and says what
// became of them once a read shows it (`saveCutShortResult`). The returned
// error starts with that verdict; the transport's own is its cause.
/** @param {Session} session @param {Draft} draft @param {unknown} error @param {LiveContext["saveRecovery"]} saveRecovery */
async function saveCutShort(session, draft, error, saveRecovery) {
    /** @type {string | undefined} */
    let recovery;
    try {recovery = await saveRecovery(draft.current.document);} catch {}
    const state = session.service.snapshot();
    const serialNumber = (state.devices || []).find(device => device.id === draft.deviceId)?.serialNumber || "";
    session.saveCutShort = {deviceId: draft.deviceId, serialNumber, edits: draft.current.fingerprint, recovery};
    await reread(session);
    const reason = INTERRUPTION_REASONS[/** @type {"lost" | "unanswered"} */ (interruption(error))];
    const read = session.service.snapshot().connected ? saveCutShortResult(session, session.observedPortable) : "";
    return Object.assign(new Error([SAVE_WORDS.cutShort, reason, read || SAVE_WORDS.later(recovery)].join(" ")),
        {code: arkCode(error, "LIVE_SAVE_CUT_SHORT"), cause: error, verdict: SAVE_WORDS.cutShort});
}

// After a Save cut short, what `read` (a live read of the same keyboard)
// shows became of the edits, said once; "" until there is one. A restarted
// keyboard may come back under a new device id: it is the same one by its
// serial number, or because Ark followed it back (keyboard-reconnect.js).
// A read of another keyboard forgets the Save, which it cannot tell about.
/** @param {Session} session @param {import("../model/types.js").ProfileSnapshot | undefined} read */
function saveCutShortResult(session, read) {
    const cut = session.saveCutShort;
    if (!cut || !read) return "";
    const state = session.service.snapshot();
    const serialNumber = (state.devices || []).find(device => device.id === state.selectedDeviceId)?.serialNumber || "";
    const same = state.selectedDeviceId === cut.deviceId || (Boolean(cut.serialNumber) && serialNumber === cut.serialNumber)
        || session.reconnect?.lost !== undefined;
    if (!same) {session.saveCutShort = undefined; return "";}
    const said = saveResult(cut, /** @type {Parameters<typeof saveResult>[1]} */ (read));
    if (said) session.saveCutShort = undefined;
    return said;
}

// The keyboard as it is now, after a refusal or a lost answer. A failed read
// leaves the draft stale, which says to read again.
/** @param {Session} session */
async function reread(session) {
    const draft = session.draft;
    if (draft) draft.needsRead = true;
    if (!session.service.snapshot().connected) return;
    try {
        const read = await session.service.readKeyboardProfile();
        session.draft?.observe(read, session.service.snapshot().selectedDeviceId, session.service.snapshot().connectionToken, session.service.snapshot().capabilities || undefined);
        session.observedPortable = read;
        session.liveReadRetry = undefined;
        if (session.draft?.changedElsewhere) {session.notice = CHANGED_ELSEWHERE; session.draft.changedElsewhere = false;}
    } catch (error) {retryRead(session, error);}
}

// Only a read that moved underneath us is automatically retried. Three
// failed reads in this cycle leave Read keyboard to the person; unrelated
// stale Review and save drafts and persistent device failures are never polled
// away.
/** @param {Session} session @param {unknown} error */
function retryRead(session, error) {
    const draft = session.draft;
    if (!draft || codeOf(error) !== "PROFILE_CHANGED") {session.liveReadRetry = undefined; return;}
    const attempts = session.liveReadRetry?.draftId === draft.id ? session.liveReadRetry.attempts : 0;
    session.liveReadRetry = {draftId: draft.id, attempts: attempts + 1};
}

// A posted edit, in Live preview + save: the same editors stage it, the
// keyboard takes it.
/** @param {Session} session @param {import("./types.js").DraftEdit} message */
async function liveEdit(session, message) {
    const draft = liveDraft(session);
    const {document, label, previousFingerprint} = draft.propose(message);
    const accepted = {message: JSON.parse(JSON.stringify(message)), previousFingerprint, fingerprint: fingerprint(document)};
    return proposeLive(session, {document, label, origin: "edit", order: draft.order}, {accepted});
}

/** @typedef {{session: Session, draft: Draft, service: Session["service"], revision: number, message: import("../../contracts/messages.js").DraftControl & {draftRevision: number}, shell: Shell, saveRecovery: (document: import("../model/types.js").PortableDocument) => Promise<string | undefined>}} LiveContext */
/** @type {Readonly<Record<string, (context: LiveContext) => Promise<unknown>>>} */
const LIVE_ACTIONS = Object.freeze({
    undo: ({draft, revision, session}) => proposeLive(session, draft.stepTarget(revision, Math.max(0, draft.cursor - 1))),
    redo: ({draft, revision, session}) => proposeLive(session, draft.stepTarget(revision, Math.min(draft.history.length - 1, draft.cursor + 1))),
    jump: ({draft, revision, session, message}) => proposeLive(session, draft.stepTarget(revision, /** @type {{step: number}} */ (/** @type {unknown} */ (message)).step)),
    discardChanges: ({draft, revision, session, message}) => {
        const {document, label, order, reviewed} = draft.discardTarget(revision, /** @type {{group: number}} */ (/** @type {unknown} */ (message)).group);
        return proposeLive(session, {document, label, order, origin: "discard", keepReviewed: reviewed});
    },
    putBack: ({draft, revision, session}) => {
        draft.assertRevision(revision);
        const before = session.beforeApply;
        if (!before || before.deviceId !== draft.deviceId) throw new Error("There is no copy from before a save on this keyboard to put back.");
        return proposeLive(session, {document: before.document, label: "Put back what the keyboard had before the save", origin: "edit", order: LAYER_IDENTITY}, {replaceWhenLarge: true});
    },
    // Discard all is Revert: the keyboard runs its saved profile again, and
    // the history keeps a step for it, so undo sends the edits back.
    discard: context => LIVE_ACTIONS.revert(context),
    revert: async ({draft, revision, session}) => {
        draft.assertRevision(revision, {allowStale: false});
        if (await revertTo(session, draft, {document: draft.completeBase.document, label: "Reverted to the saved profile", origin: "revert", order: LAYER_IDENTITY})) {
            session.notice = "Reverted: the keyboard runs its saved profile again. Undo sends the edits back.";
        }
    },
    // Save: a recovery copy of what is saved, then the keyboard writes what it
    // runs as its new saved profile on both halves.
    // In Live edit the keyboard saves by itself; Ark's Save is only its way to
    // try again after the keyboard's own save failed, and asks for no review:
    // every edit was checked before it was sent.
    save: async ({draft, revision, session, service, message, saveRecovery}) => {
        draft.assertRevision(revision);
        const live = /** @type {import("./types.js").LiveState} */ (draft.live);
        const keyboardSaves = live.mode === EDIT_MODE.LIVE;
        if (keyboardSaves && !live.keyboard?.saveFailed && live.unsaved) throw new Error(`In Live edit the keyboard saves by itself after ${quietWords(live.keyboard?.quietMs)} with no edit and no key held.`);
        if (!keyboardSaves && draft.hasBlockers()) throw new Error("Resolve the blockers in Checks before saving.");
        if (!keyboardSaves && draft.reviewedRevision !== revision) throw new Error("Review the keyboard's unsaved edits before saving them.");
        if (!live.unsaved) {session.notice = "Nothing to save: the keyboard runs its saved profile."; return;}
        if (!keyboardSaves && draft.hasChecksToConfirm() && /** @type {{confirmChecks?: boolean}} */ (message).confirmChecks !== true) throw new Error("These edits have warnings or traps. Confirm them in the review before saving.");
        const recovery = await saveRecovery(draft.completeBase.document);
        if (!recovery) throw refusal("A recovery copy could not be saved. Nothing was saved on the keyboard.", "RECOVERY_REQUIRED");
        try {
            const status = await service.saveWorkingCopy({session: live.session, revision: live.revision});
            draft.confirmSaved(status);
            session.notice = `Saved on both halves. Recovery copy of what was saved before: ${recovery}`;
        } catch (error) {
            if (codeOf(error) === "LIVE_HALVES_APART") markApart(draft);
            else if (interruption(error)) throw await saveCutShort(session, draft, error, saveRecovery);
            else await reread(session);
            throw error;
        }
    },
    // A live draft out of step with the keyboard (a reconnect, a refused
    // read) is brought back by reading it: what it runs is the draft.
    rebase: async ({session}) => {
        await reread(session);
        session.resetDraftForms = true;
        if (session.draft?.stale) throw new Error("Read the keyboard again; it could not be read just now.");
        session.notice = "Read the keyboard again: the draft shows what it runs now.";
    },
    confirmLive: async ({session, draft, message}) => {
        const proposal = session.liveProposal;
        const id = /** @type {{proposal?: number}} */ (/** @type {unknown} */ (message)).proposal;
        if (!proposal || proposal.id !== id || proposal.draftId !== draft.id || proposal.revision !== draft.revision) {
            session.liveProposal = undefined;
            session.resetDraftForms = true;
            throw new Error("That edit belongs to an older draft. Make it again.");
        }
        await proposeLive(session, proposal.target, {confirmed: true, accepted: proposal.accepted, replaceWhenLarge: proposal.replaceWhenLarge});
    },
});

// Between the three modes (plan answer 3). The keyboard refuses a mode change
// while it has unsaved edits (firmware D-F32), so they are settled first:
// outside Live edit a live draft with unsaved edits needs Save or Revert,
// whichever way it goes (choosing the same mode again settles halves that
// stored different modes), and entering a live mode from Review and save with
// a draft needs Send or Discard; the question shows the checks it confirms,
// and Cancel posts nothing. Leaving Live edit needs no question: the keyboard
// saves what it has not saved yet, as it would have a moment later, then
// switches. A failure leaves the mode as it was.
/** @param {Session} session @param {{mode: number, pending?: string, draftRevision: number, confirmChecks?: boolean}} message @param {(cause: import("../../contracts/model.js").RecoveryCause) => LiveContext["saveRecovery"]} recoveryFor @param {Shell} shell */
async function setEditMode(session, message, recoveryFor, shell) {
    const draft = session.draft, service = session.service;
    if (!draft) throw new Error("Read the keyboard before changing how edits reach it.");
    const mode = message.mode;
    if (!isEditMode(mode)) throw new Error(`Ark offers ${[EDIT_MODE.LIVE, EDIT_MODE.LIVE_REVIEW, EDIT_MODE.APPLY].map(value => EDIT_MODE_WORDS[value].label).join(", ")}.`);
    draft.assertRevision(message.draftRevision);
    const known = service.snapshot().editMode;
    if (known?.mode === mode && !known.conflict && Boolean(draft.live) === (mode !== EDIT_MODE.APPLY)) return;
    const confirmChecks = message.confirmChecks === true;
    /** @type {Draft | undefined} */
    let send;
    if (draft.live && known?.mode === EDIT_MODE.LIVE) {
        const flushed = await service.flushWorkingCopy(recoveryFor("leave-live"));
        if (flushed.saved) draft.confirmKeyboardSaved(flushed);
    } else if (draft.live) {
        if (draft.live.unsaved) {
            if (message.pending === "save") {
                if (draft.reviewedRevision !== draft.revision) draft.review(draft.revision);
                await LIVE_ACTIONS.save(/** @type {LiveContext} */ ({session, draft, service, revision: draft.revision, message: {...message, type: "saveProfileDraft", confirmChecks}, shell, saveRecovery: recoveryFor("save")}));
            } else if (message.pending === "revert") {
                await LIVE_ACTIONS.revert(/** @type {LiveContext} */ ({session, draft, service, revision: draft.revision, message, shell, saveRecovery: recoveryFor("save")}));
            } else throw refusal(`Save or Revert the keyboard's unsaved edits before switching to ${EDIT_MODE_WORDS[mode].label}.`, "LIVE_EDIT_NOT_CLEAN");
        }
    } else if (draft.dirty && mode !== EDIT_MODE.APPLY) {
        if (message.pending === "send") {
            if (draft.hasBlockers()) throw refusal("Resolve the blockers in Checks before sending your draft live.", "LIVE_EDIT_BLOCKED");
            if (draft.hasChecksToConfirm() && !confirmChecks) throw refusal("Your draft has warnings or traps. Confirm them before sending it live.", "LIVE_EDIT_BLOCKED");
            send = draft;
        } else if (message.pending !== "discard") throw refusal(`Send your draft to the keyboard or discard it before switching to ${EDIT_MODE_WORDS[mode].label}.`, "DRAFT_PENDING");
    }
    await service.setEditMode(mode);
    // The draft starts again from the keyboard in its new mode.
    const read = await service.readKeyboardProfile();
    const state = service.snapshot();
    replaceDraft(session, new ProfileDraftSession(read, state.selectedDeviceId, /** @type {import("../model/types.js").ProfileDestination} */ (state.capabilities), state.connectionToken));
    session.observedPortable = read;
    session.liveProposal = undefined;
    const words = {
        [EDIT_MODE.APPLY]: "edits wait in Ark's draft until you review and save them.",
        [EDIT_MODE.LIVE]: `edits take effect on the keyboard at once, and it saves them by itself after ${quietWords(session.draft?.live?.keyboard?.quietMs)} with no edit and no key held.`,
        [EDIT_MODE.LIVE_REVIEW]: "edits take effect on the keyboard at once; review and Save make them permanent.",
    }[mode];
    let notice = known?.mode === mode ? "Both halves now store the same edit mode." : `Now in ${EDIT_MODE_WORDS[mode].label}: ${words}`;
    if (state.editMode?.notStored) notice += " The keyboard has not stored the new mode yet; a replug now may lose it.";
    // Sending publishes the model on its way, which takes any notice set
    // before it: the draft's words are said with the mode's, once it is sent.
    if (send && session.draft) await sendApplyDraft(session, send, mode, notice);
    else session.notice = notice;
}

// The Review and save draft goes live as one edit, its checks confirmed by
// the question. Until the keyboard takes it, the draft is kept: refused, the
// keyboard goes back to Review and save and the draft is there as it was.
/** @param {Session} session @param {Draft} kept @param {number} mode @param {string} notice what the mode change says */
async function sendApplyDraft(session, kept, mode, notice) {
    const draft = /** @type {Draft} */ (session.draft), service = session.service;
    try {
        const published = await proposeLive(session, {document: kept.document, label: "Sent the draft live", origin: "edit", order: draft.order}, {confirmed: true, replaceWhenLarge: true});
        if (!published) throw refusal("The keyboard changed before it took the draft. Read it again before sending.", "LIVE_EDIT_STALE");
        session.notice = `${notice} ${mode === EDIT_MODE.LIVE ? "Your draft is running on the keyboard, which saves it in a moment." : "Your draft is running on the keyboard, unsaved."}`;
    } catch (error) {
        // The Review and save draft belongs to the person until publication
        // succeeds, even if the keyboard refuses the return to Review and
        // save.
        replaceDraft(session, kept);
        kept.needsRead = true;
        session.observedPortable = service.portable || undefined;
        let back = false;
        try {
            await service.setEditMode(EDIT_MODE.APPLY);
            const read = await service.readKeyboardProfile();
            const state = service.snapshot();
            replaceDraft(session, kept);
            kept.observe(read, state.selectedDeviceId, state.connectionToken, state.capabilities || undefined);
            session.observedPortable = read;
            back = true;
        } catch {}
        const review = EDIT_MODE_WORDS[EDIT_MODE.APPLY].label;
        throw Object.assign(new Error(`Your draft was not sent: ${failureSentence(error)} ${back
            ? `The keyboard is back in ${review}, and your draft is kept.`
            : `Ark could not switch back to ${review}; your draft is kept. Return the keyboard to ${review} before continuing.`}`, {cause: error}), {code: arkCode(error, "LIVE_EDIT_REFUSED")});
    }
}

// Whether closing Ark now loses edits: a Review and save draft not applied,
// or edits in Live preview + save not saved (a replug puts back what is
// saved). In Live edit the keyboard keeps and saves them without Ark, so only
// an edit still on its way to the keyboard is at stake.
/** @param {Pick<Session, "draft"> & {service?: {phase?: string, busy?: boolean}}} session */
function closingLoses(session) {
    const draft = session.draft;
    if (!draft) return false;
    if (!draft.live) return draft.dirty;
    // The service keeps the last operation's phase; only a running one counts.
    if (draft.live.mode === EDIT_MODE.LIVE) return Boolean(session.service?.busy) && session.service?.phase === PHASE.LIVE_EDIT;
    return draft.live.unsaved || draft.dirty;
}

module.exports = {LIVE_ACTIONS, CHANGED_ELSEWHERE, closingLoses, liveEdit, proposeLive, reread, retryRead, saveCutShortResult, setEditMode};
