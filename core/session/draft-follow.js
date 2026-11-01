// @ts-check
"use strict";

// How the open draft follows what Ark reads from the keyboard.
//
// A read the editor follows reaches the draft by one of two paths: the
// service's change notice, which the panel loop observes explicitly (D-L61,
// followService), or the operation that made the read (readAndFollow,
// followRead). Whichever comes first follows it; the other finds it followed,
// since the session keeps the read the draft last followed
// (`observedPortable`). Everything here keeps the session's part of that:
//
//   followService    a service notice: the draft follows the latest read and
//                    the connection it came over
//   followRead       a read opens the draft, or the open one follows it
//   readAndFollow    the keyboard read again, and followed, resolving the
//                    read; a failure leaves the draft stale
//   takeRead         a given draft takes a read itself (one Ark put back or
//                    followed to the keyboard's new device id)
//   replaceFromRead  a new draft from a read, in place of the open one
//   keepStale        a draft kept over the keyboard's latest read, stale
//   forgetRead       the open draft is no read's (the demo's)
//   needRead         the open draft waits, stale, for a read
//   readFailed       …after a read that failed; one the keyboard moved under
//                    counts toward the live watch's retries
//   retryPending     whether the live watch reads a stale draft again
//   endRetries       the retries end: reading again is the person's
//   takeNews         what a given read told that is not said yet, once
//   lastFollowed     the read the draft last followed
//
// A read can tell what a person should hear (ProfileDraftSession.observe): a
// live keyboard that restarted over unsaved edits, or whose working copy
// changed without Ark. That is the news of the read that told it, kept with
// the open draft for whoever made that read: the operation takes it by the
// read it made, so a notice that followed the read first loses nothing, and
// no later read says what an earlier one told (by then it is no longer so).

/**
 * @typedef {import("./types.js").PanelModelSession} ModelSession
 * @typedef {import("./types.js").RunningPanelSession} Session
 * @typedef {import("./types.js").PanelDeviceState} State
 * @typedef {import("./types.js").ReadNews} News
 * @typedef {NonNullable<ModelSession["draft"]>} Draft
 * @typedef {import("../model/types.js").ProfileSnapshot} Read
 */
const {canEdit} = require("./firmware-support");
const {ProfileDraftSession} = require("./profile-draft-session");
const {replaceDraft, setDraft} = require("./panel-session-state");

// A stale draft is read again by the live watch at most this many times
// after reads the keyboard moved under.
const LIVE_READ_RETRIES = 3;

// What `read` told `draft`, in place of what an earlier read told: that is
// no later read's to say.
/** @param {Pick<ModelSession, "readNews">} session @param {Draft} draft @param {Read} read @param {News | undefined} told */
function remember(session, draft, read, told) {
    if (told) session.readNews = {...told, draftId: draft.id, read};
}

// A complete read of a supported keyboard opens the draft, or refreshes the
// one already open against what the keyboard now holds. A read the draft
// followed already is not followed again.
/** @param {ModelSession} session @param {Read | null | undefined} read @param {State} state */
function followRead(session, read, state) {
    if (session.draft && state.connected && read !== session.observedPortable) session.draft.follow(read, state.selectedDeviceId);
    if (session.draft && !session.draft.dirty && state.connected && (state.selectedDeviceId !== session.draft.deviceId || !canEdit(state.capabilities))) {
        setDraft(session, undefined);
    }
    if (!read || read === session.observedPortable || !state.connected || !canEdit(state.capabilities)) return;
    if (read.incomplete && !session.draft) return;
    const live = "live" in read && Boolean(read.live);
    // A keyboard whose edit mode changed under an open draft: an untouched
    // draft starts again in the new mode; one with work waits, stale, for the
    // person to discard it (switching modes here asks first).
    if (session.draft && Boolean(session.draft.live) !== live && state.selectedDeviceId === session.draft.deviceId && !read.incomplete) {
        if (session.draft.live || !session.draft.dirty) setDraft(session, new ProfileDraftSession(read, state.selectedDeviceId, state.capabilities, state.connectionToken));
        else session.draft.needsRead = true;
    } else if (!session.draft) setDraft(session, new ProfileDraftSession(read, state.selectedDeviceId, state.capabilities, state.connectionToken));
    else remember(session, session.draft, read, session.draft.observe(read, state.selectedDeviceId, state.connectionToken, state.capabilities));
    session.observedPortable = read;
}

// A service notification advances the draft lifecycle explicitly. Rendering
// the same state again is only a projection and cannot perform this step.
/** @param {ModelSession} session @param {State} state */
function followService(session, state) {
    if (!session.demo) followRead(session, session.service.portable, state);
    if (session.draft && state.connected && state.selectedDeviceId === session.draft.deviceId) session.draft.noteConnection(state.connectionToken ?? null);
}

// Read the keyboard as a Refresh does and let the draft follow: it follows,
// or changes kind when the keyboard's mode did. Resolves the read, whose news
// the caller may take; a read that failed leaves the draft stale (readFailed)
// and resolves undefined.
/** @param {Session} session @returns {Promise<Read | undefined>} */
async function readAndFollow(session) {
    try {
        const read = await session.service.readKeyboardProfile();
        followRead(session, read, session.service.snapshot());
        session.liveReadRetry = undefined;
        return read;
    } catch (error) {
        readFailed(session, error);
        return undefined;
    }
}

// `draft` takes `read` itself, whatever the panel followed: the read just
// made, which the shell may not have shown it yet.
/** @param {Session} session @param {Draft} draft @param {Read} read */
function takeRead(session, draft, read) {
    const state = session.service.snapshot();
    remember(session, draft, read, draft.observe(read, state.selectedDeviceId, state.connectionToken, state.capabilities || undefined));
    session.observedPortable = read;
}

// The draft starts again from `read`, as after a change of edit mode: a new
// draft in place of the open one, and what was opened against it closes.
/** @param {Session} session @param {Read} read */
function replaceFromRead(session, read) {
    const state = session.service.snapshot();
    replaceDraft(session, new ProfileDraftSession(read, state.selectedDeviceId, /** @type {import("../model/types.js").ProfileDestination} */ (state.capabilities), state.connectionToken));
    session.observedPortable = read;
}

// `draft` in place of the open one, over the keyboard's latest read: it
// waits, stale, for a read of its own, and the latest is not followed in its
// place (a Review and save draft whose send went wrong).
/** @param {Session} session @param {Draft} draft */
function keepStale(session, draft) {
    replaceDraft(session, draft);
    draft.needsRead = true;
    session.observedPortable = session.service.portable || undefined;
}

// The open draft is no read's, as the demo's: the next complete read opens
// its own.
/** @param {Pick<ModelSession, "observedPortable">} session */
function forgetRead(session) {
    session.observedPortable = undefined;
}

// Until a read is followed, the open draft is stale, which says to read again.
/** @param {Pick<ModelSession, "draft">} session */
function needRead(session) {
    if (session.draft) session.draft.needsRead = true;
}

// A read that failed leaves the draft stale. Only a read that moved
// underneath us is automatically retried: LIVE_READ_RETRIES failed reads in
// this cycle leave Read keyboard to the person; unrelated stale Review and
// save drafts and persistent device failures are never polled away.
/** @param {Pick<ModelSession, "draft" | "liveReadRetry">} session @param {unknown} error */
function readFailed(session, error) {
    const draft = session.draft;
    needRead(session);
    if (!draft || /** @type {{code?: string}} */ (error)?.code !== "PROFILE_CHANGED") {session.liveReadRetry = undefined; return;}
    const attempts = session.liveReadRetry?.draftId === draft.id ? session.liveReadRetry.attempts : 0;
    session.liveReadRetry = {draftId: draft.id, attempts: attempts + 1};
}

// Whether the live watch reads `draft` again: it is stale after a read the
// keyboard moved under, within the bound.
/** @param {Pick<ModelSession, "liveReadRetry">} session @param {Draft} draft */
function retryPending(session, draft) {
    const retry = session.liveReadRetry;
    return Boolean(draft.needsRead && retry?.draftId === draft.id && retry.attempts < LIVE_READ_RETRIES);
}

/** @param {Pick<ModelSession, "liveReadRetry">} session */
function endRetries(session) {
    session.liveReadRetry = undefined;
}

// What `read` (the read the caller made) told the open draft of `kind`, not
// said yet; taking it says it, so it is not said again. A read that failed
// (none) told nothing, and an earlier read's news is not this read's.
/** @template {keyof News} K @param {Pick<ModelSession, "draft" | "readNews">} session @param {K} kind @param {Read | null | undefined} read @returns {News[K] | undefined} */
function takeNews(session, kind, read) {
    const news = session.readNews;
    if (!news || news.read !== read || news.draftId !== session.draft?.id) return undefined;
    const told = news[kind];
    session.readNews = {...news, [kind]: undefined};
    return told;
}

// The read the draft last followed, whichever path brought it; none before
// the first, or once the draft is no read's (forgetRead).
/** @param {Pick<ModelSession, "observedPortable">} session */
const lastFollowed = (session) => session.observedPortable;

module.exports = {LIVE_READ_RETRIES, endRetries, followRead, followService, forgetRead, keepStale, lastFollowed, needRead, readAndFollow, readFailed, replaceFromRead, retryPending, takeNews, takeRead};
