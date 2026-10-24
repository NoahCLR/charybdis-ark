// @ts-check
"use strict";

// What Ark says when an Apply or a Save is cut short. Every notice about one
// starts with what happened to the profile, in the words the Apply bar uses
// (APPLY_VERDICTS, published as `apply.failure.verdict`), then says why in
// plain words. A person reads these; the transport's and the coordinators'
// own text stays in the error's cause and in the diagnostics.
//
//   APPLY_VERDICTS         what can honestly be said about what an Apply
//                          saved: a save is all or nothing, never "part of it"
//   SAVE_WORDS             a Save cut short, and what the next read shows
//   INTERRUPTION_REASONS   why, when the connection went away
//   interruption(error)    "lost" when the connection to the keyboard went
//                          away anywhere in the cause, "unanswered" when the
//                          keyboard stopped answering, else ""
//   saveResult(cut, read)  after a Save cut short, what a read of the
//                          keyboard shows became of the edits

/** @typedef {"none" | "decided" | "unknown"} SavedVerdict */

/** @type {Readonly<Record<SavedVerdict, string>>} */
const APPLY_VERDICTS = Object.freeze({
    none: "Nothing was saved: the keyboard kept the profile it had.",
    decided: "The keyboard had already decided to save the new profile, and finishes it by itself about 15 seconds after both halves are connected. Read the keyboard then.",
    unknown: "Ark can't tell which profile was saved. Read the keyboard to see what it runs now.",
});

const SAVE_WORDS = Object.freeze({
    cutShort: "Ark can't tell whether the save finished.",
    /** @param {string | undefined} recovery where the edits were kept */
    later: (recovery) => `${recovery ? `A recovery copy on Backups has your edits (${recovery}). ` : ""}Ark says whether they were saved once it reads the keyboard again.`,
    saved: "The save finished: the keyboard saved your edits.",
    unsaved: "The save did not finish: the keyboard still runs your edits, unsaved. Save them again.",
    /** @param {string | undefined} recovery where the edits were kept */
    gone: (recovery) => `The save did not finish, so the keyboard's unsaved edits are gone: it runs its saved profile again.${recovery ? ` The recovery copy on Backups has them (${recovery}).` : ""}`,
});

const INTERRUPTION_REASONS = Object.freeze({
    lost: "The keyboard was disconnected or restarted.",
    unanswered: "The keyboard stopped answering.",
});

// The transport's codes (core/transport/device-adapter.js), never its text.
const LOST = new Set(["DISCONNECTED", "WRITE_FAILED", "NOT_CONNECTED"]);
const UNANSWERED = new Set(["TIMEOUT"]);

/** @param {unknown} error @returns {"lost" | "unanswered" | ""} */
function interruption(error) {
    let found = /** @type {"lost" | "unanswered" | ""} */ ("");
    const seen = new Set();
    for (let cause = error; cause && typeof cause === "object" && !seen.has(cause); cause = /** @type {{cause?: unknown}} */ (cause).cause) {
        seen.add(cause);
        const code = /** @type {{code?: unknown}} */ (cause).code;
        if (typeof code !== "string") continue;
        if (LOST.has(code)) return "lost";
        if (UNANSWERED.has(code)) found = "unanswered";
    }
    return found;
}

// `cut` is what Ark knew when the Save was cut short: the edits' fingerprint
// and where it kept them. `read` is a live read of the keyboard since.
/** @param {{edits: string, recovery?: string}} cut @param {{fingerprint?: string, saved?: {fingerprint?: string}, live?: {unsaved?: boolean} | null} | null | undefined} read */
function saveResult(cut, read) {
    if (!read?.live || !read.saved) return "";
    if (read.saved.fingerprint === cut.edits) return SAVE_WORDS.saved;
    if (read.live.unsaved && read.fingerprint === cut.edits) return SAVE_WORDS.unsaved;
    return SAVE_WORDS.gone(cut.recovery);
}

module.exports = {APPLY_VERDICTS, SAVE_WORDS, INTERRUPTION_REASONS, interruption, saveResult};
