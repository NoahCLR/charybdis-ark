// @ts-check
"use strict";

// The panel session's state where a rule reads several of its fields, or a
// change has to move several together. A panel session (types.d.ts
// PanelSession) is a plain object that panel-session.js, panel-loop.js,
// panel-controls.js and demo-session.js all hold; what they would otherwise
// each restate is decided here, once:
//
//   draftBinding     whether the open draft takes an edit now, and if not, why;
//                    the model publishes it as `draft.editable` and `draft.reason`
//   assertBound      refuses a request the binding does not allow
//   boundDraft       the draft a posted message may change, or its refusal
//   setDraft         a draft opens or closes under the forms
//   replaceDraft     …and the import review and layer editor made against the old one close
//   closeEditors     the import review and the layer editor close together
//   beginRead        a keyboard read starts: the panel shows it loading
//   endRead          …and ends, ready to edit or not
//   whilePanelBusy   a draft, backup or demo control runs; the panel takes nothing else
//   whileApplying    an Apply and its readback run, step by step
//   takeOutbox       what the next model carries once: a notice (and whether
//                    it is a failure), the accepted edit, and whether the
//                    forms start again from the model

/**
 * @typedef {import("./types.js").PanelSession} Session
 * @typedef {import("./types.js").DemoSession} DemoSession
 * @typedef {import("./types.js").DraftBlock} DraftBlock
 * @typedef {NonNullable<DemoSession["draft"]>} Draft
 * @typedef {Pick<import("./types.js").PanelDeviceState, "connected" | "selectedDeviceId" | "connectionToken" | "busy" | "capabilities">} BindingState
 * @typedef {string | ((reason: DraftBlock) => string)} Refusal
 */
const {canEdit} = require("./firmware-support");

/**
 * Whether the open draft may be edited against what the panel answers to now
 * (the keyboard's state, or the demo's): it is this keyboard's, over the
 * connection it was read through, on current firmware, current with the
 * keyboard, and nothing is running. The demo's draft is the
 * demo device's, so it holds there with no keyboard (demo-session.js).
 *
 * The reasons come in this order, so "busy" says that only an operation in
 * progress stands in the way.
 * @param {Pick<Session, "draft" | "portableBusy" | "readBusy">} session
 * @param {BindingState} state
 * @returns {{editable: boolean, reason: DraftBlock}}
 */
function draftBinding(session, state) {
    const draft = session.draft;
    /** @type {DraftBlock} */
    const reason = !draft ? "no-draft"
        : draft.bindingTo(state) || (!canEdit(state.capabilities) ? "unsupported"
            : draft.stale ? "stale"
            : state.busy || session.portableBusy || session.readBusy ? "busy" : "");
    return {editable: !reason, reason};
}

/**
 * Refuses a request against the open draft unless the binding allows it, with
 * `refusal` (or what it says for the reason). A stale draft is let through:
 * the draft refuses it itself, in its own words (assertRevision), since that
 * asks for a review rather than a reconnect.
 * @param {Pick<Session, "draft" | "portableBusy" | "readBusy">} session
 * @param {BindingState} state
 * @param {Refusal} refusal
 */
function assertBound(session, state, refusal) {
    const {reason} = draftBinding(session, state);
    if (reason && reason !== "stale") throw new Error(typeof refusal === "string" ? refusal : refusal(reason));
}

/**
 * The draft a message from the panel may change, or a refusal saying what
 * could not be done. A stale draft and an older revision are refused by the
 * draft itself (assertRevision).
 * @param {Pick<Session, "draft" | "portableBusy" | "readBusy">} session
 * @param {BindingState} state
 * @param {{draftId?: unknown, draftRevision?: unknown}} message
 * @param {Refusal} refusal
 * @returns {Draft}
 */
function boundDraft(session, state, message, refusal) {
    const draft = session.draft;
    if (!draft || message.draftId !== draft.id) throw new Error(typeof refusal === "string" ? refusal : refusal("no-draft"));
    assertBound(session, state, refusal);
    draft.assertRevision(/** @type {number | undefined} */ (message.draftRevision));
    return draft;
}

// The import review and Rename & Reorder are each made against one draft and
// keyboard, and close together. With `resetForms`, the forms start again from
// the model too, as when the keyboard or the draft under them changes.
/** @param {Pick<DemoSession, "portableReview" | "portableLayers" | "resetDraftForms">} session @param {{resetForms?: boolean}} [options] */
function closeEditors(session, {resetForms = false} = {}) {
    session.portableReview = undefined;
    session.portableLayers = undefined;
    if (resetForms) session.resetDraftForms = true;
}

// A draft opens (or the one open closes) under the forms: each starts again
// from the model, so none shows text the new draft does not have.
/** @param {Pick<DemoSession, "draft" | "resetDraftForms">} session @param {Draft | undefined} draft */
function setDraft(session, draft) {
    session.draft = draft;
    session.resetDraftForms = true;
}

// A draft takes the place of the one open, and what was opened against the
// old one closes with it.
/** @param {Pick<DemoSession, "draft" | "resetDraftForms" | "portableReview" | "portableLayers">} session @param {Draft | undefined} draft */
function replaceDraft(session, draft) {
    setDraft(session, draft);
    closeEditors(session);
}

// A read of the keyboard starts: the panel shows it loading and is not ready
// until the read says so.
/** @param {Pick<Session, "readBusy" | "readReady">} session */
function beginRead(session) {
    session.readBusy = true;
    session.readReady = false;
}

// The read ends. `ready` is whether it left an editable keyboard; a read that
// failed leaves that as it was (not ready, since it began).
/** @param {Pick<Session, "readBusy" | "readReady">} session @param {boolean} [ready] */
function endRead(session, ready) {
    if (ready !== undefined) session.readReady = ready;
    session.readBusy = false;
}

/**
 * Runs one of the panel's own operations (a draft control, a backup, the
 * demo's controls). While it runs the router takes no other request and no
 * draft is editable.
 * @template T @param {Pick<Session, "portableBusy">} session @param {() => Promise<T>} work @returns {Promise<T>}
 */
async function whilePanelBusy(session, work) {
    session.portableBusy = true;
    try {return await work();}
    finally {session.portableBusy = false;}
}

/**
 * Runs an Apply and its readback. A finished Apply is shown only while this
 * runs, so a later read or export is not drawn as its readback; `step` names
 * the readback step the model shows.
 * @template T
 * @param {Pick<Session, "applyRunning" | "postApplyReadStep">} session
 * @param {(step: (step: import("../../contracts/messages.js").ReadStep) => void) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function whileApplying(session, work) {
    session.applyRunning = true;
    try {return await work((step) => {session.postApplyReadStep = step;});}
    finally {
        session.applyRunning = false;
        session.postApplyReadStep = undefined;
    }
}

// What the next model carries once, then forgets.
/** @param {Pick<Session, "notice" | "noticeFailed" | "acceptedEdit" | "resetDraftForms">} session */
function takeOutbox(session) {
    const outbox = {notice: session.notice, acceptedEdit: session.acceptedEdit, resetDraftForms: session.resetDraftForms,
        ...(session.noticeFailed && session.notice ? {failed: true} : {})};
    session.notice = undefined;
    session.noticeFailed = undefined;
    session.acceptedEdit = undefined;
    session.resetDraftForms = undefined;
    return outbox;
}

module.exports = {assertBound, beginRead, boundDraft, closeEditors, draftBinding, endRead, replaceDraft, setDraft, takeOutbox, whileApplying, whilePanelBusy};
