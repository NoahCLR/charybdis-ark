// @ts-check
"use strict";

// Between edits, a look at the keyboard's edit status (firmware D-F32), about
// once a second while the panel is open: Ark starts no save timer of its own,
// it only reads what the keyboard says.
//
//   - Live edit: the keyboard saved by itself, so what is saved moves to what
//     it runs ("saved by the keyboard"), or its save failed, which is shown.
//   - The revision moved without Ark (an adjustment key such as DPI or an RGB
//     key, another app's edit): the keyboard is read again, as news, not as
//     a failure. A restart is read again too, and what became of the edits
//     said at once.
//   - Its halves and flags: the slave half refusing the working copy, a save
//     waiting for a quiet keyboard, the edit mode not yet stored.
//   - Under a Review and save draft: a change its keys made and it then saved
//     is read again, as a Refresh would; until then, what it says of itself
//     (an adjustment still reaching both halves, a half that stopped saving)
//     is shown.
//
// It never runs while an operation or the panel holds the keyboard, and a
// look that raced with one (the draft moved meanwhile) is dropped. It pauses
// while the shell says it may not be answered (`paused`): a web page whose
// menu is open, or which is hidden. A look that goes unanswered is skipped
// (background-reads.js).

const {endRetries, lastFollowed, readAndFollow, retryPending} = require("./draft-follow");
const {EDIT_MODE} = require("../protocol/profile-edit-v1");
const {readNews} = require("./live-edits");

const LIVE_WATCH_MS = 1000;
const MOVED = "The keyboard changed by itself (a DPI or lighting key, or another app); Ark read it again.";
const FOLLOWED = "Ark read the keyboard again now that it is back; the draft is what it runs.";

/**
 * One look. Resolves true when the panel has something new to show.
 * @param {import("./types.js").RunningPanelSession} session
 */
async function checkLive(session) {
    const draft = session.draft, service = session.service;
    if (!draft || session.portableBusy || session.applyRunning || session.liveProposal || service.busy || session.demo) return false;
    const state = service.snapshot();
    if (!state.connected) return false;
    const elsewhere = state.selectedDeviceId !== draft.deviceId || state.connectionToken !== draft.connectionToken;
    if (elsewhere && !await followBack(session, draft)) return false;
    if (draft.stale) {
        if (!retryPending(session, draft)) return false;
        // What the read told is said with it (readNews), as Read keyboard says it.
        const told = readNews(session, await readAndFollow(session)).words;
        const notice = [elsewhere && session.draft === draft && !draft.stale ? FOLLOWED : "", told].filter(Boolean).join(" ");
        if (notice) session.notice = notice;
        return true;
    }
    const before = {revision: draft.revision, live: draft.live};
    const status = await service.readLiveStatus();
    // Anything that moved the draft while the look was out wins over it.
    if (!status || session.draft !== draft || draft.revision !== before.revision || draft.live !== before.live || session.portableBusy || service.busy) return false;
    if (!draft.live) return checkApply(session, draft, status);
    // A Review and save keyboard opened live while it ran unsaved key
    // adjustments goes back to a Review and save draft once it has saved them.
    const settled = draft.live.mode === EDIT_MODE.APPLY && status.mode === EDIT_MODE.APPLY && !status.unsaved;
    if (settled || status.session !== draft.live.session || status.revision !== draft.live.revision || status.mode !== draft.live.mode) {
        const restarted = status.session !== draft.live.session;
        // A restart is this read's news, said as Read keyboard says it, even
        // when the draft must still be read again; a working copy changed
        // without Ark is what this look's own words say.
        const told = readNews(session, await readAndFollow(session)).restart;
        session.resetDraftForms = true;
        if (told) session.notice = told;
        else if (!restarted && session.draft && !session.draft.stale) session.notice = status.mode !== before.live?.mode ? "The keyboard's edit mode was changed elsewhere; Ark read it again." : MOVED;
        return true;
    }
    return draft.observeLiveStatus(status) !== "same";
}

// A live draft whose follow-back read failed (the keyboard moved under it,
// as its own save after a rename does) waits for a read under the old device
// id or connection. If the keyboard now connected names the draft's edit
// session it is the same keyboard on the same boot: the draft follows it,
// and the stale-draft retry (draft-follow.js retryPending) reads it again,
// within its bound.
/** @param {import("./types.js").RunningPanelSession} session @param {NonNullable<import("./types.js").RunningPanelSession["draft"]>} draft */
async function followBack(session, draft) {
    if (!draft.live || !retryPending(session, draft)) return false;
    const status = await session.service.readLiveStatus();
    if (!status || session.draft !== draft || session.portableBusy || session.service.busy) return false;
    // Another keyboard, or this one restarted: the person reads it.
    if (status.session !== draft.live.session) {endRetries(session); return false;}
    draft.followSession(status.session, session.service.snapshot().selectedDeviceId);
    return true;
}

// A Review and save draft: the keyboard's own keys may still change what it
// runs (its adjustment keys, saved by the keyboard after a quiet moment). Once
// it has saved such a change, it is read again as a Refresh would: an
// untouched draft shows it, one with edits says the keyboard changed (review
// again).
/** @param {import("./types.js").RunningPanelSession} session @param {NonNullable<import("./types.js").RunningPanelSession["draft"]>} draft @param {import("../protocol/types.js").EditStatus} status */
async function checkApply(session, draft, status) {
    // What it says of itself meanwhile, such as an adjustment still reaching
    // both halves or a half that stopped saving, is shown as it is.
    const told = draft.observeApplyStatus(status);
    const seen = session.applyWatch?.draftId === draft.id ? session.applyWatch : undefined;
    session.applyWatch = {draftId: draft.id, session: status.session, revision: status.revision, savedGeneration: status.savedGeneration};
    const observed = lastFollowed(session);
    const base = observed && "status" in observed ? /** @type {import("./types.js").CompleteReadSnapshot} */ (observed).status : undefined;
    // The first poll must compare with the successful profile snapshot, since
    // an adjustment may already have been saved before this poll exists.
    const same = seen ? (seen.session === status.session && seen.revision === status.revision && seen.savedGeneration === status.savedGeneration)
        : base && base.committedGeneration === status.savedGeneration && base.committedOriginHalf === status.savedOrigin;
    if (status.unsaved || same) return told;
    await readAndFollow(session);
    if (session.draft && !session.draft.stale) session.notice = MOVED;
    return true;
}

// A look waiting for its time never keeps a process alive by itself (Node
// unrefs the timer; a browser has no such thing).
/** @param {number} ms @returns {Promise<void>} */
const unrefSleep = ms => new Promise(resolve => {
    const timer = /** @type {{unref?: () => void}} */ (/** @type {unknown} */ (setTimeout(resolve, ms)));
    timer.unref?.();
});

/**
 * Looks until stopped; `publish` shows what changed. The shell's `sleep` is
 * the wait (a browser tab passes one its throttling cannot slow); `paused`
 * says when not to look. `check` is the look (tests pass their own).
 * @param {import("./types.js").RunningPanelSession} session
 * @param {{publish: () => void, sleep?: (ms: number) => Promise<void>, intervalMs?: number, paused?: () => boolean, check?: (session: import("./types.js").RunningPanelSession) => Promise<boolean>}} options
 */
function watchLive(session, {publish, sleep = unrefSleep, intervalMs = LIVE_WATCH_MS, paused = () => false, check = checkLive}) {
    let stopped = false;
    const done = (async () => {
        while (!stopped) {
            await sleep(intervalMs);
            if (stopped) break;
            if (paused()) continue;
            try {if (await check(session)) publish();}
            catch {/* the next look tries again; a lost connection shows itself */}
        }
    })();
    return {stop: () => {stopped = true; return done;}};
}

module.exports = {checkLive, watchLive, LIVE_WATCH_MS};
