// @ts-check
"use strict";
const {SAVE_WORDS} = require("../model/vocabulary");

// When an Apply or a Save is cut short. Every notice about one starts with
// what happened to the profile, in the words the Apply bar uses
// (APPLY_VERDICTS, published as `apply.failure.verdict`), then says why in
// plain words (SAVE_WORDS, INTERRUPTION_REASONS; all three in
// core/model/vocabulary.js). A person reads these; the transport's and the
// coordinators' own text stays in the error's cause and in the diagnostics.
//
//   interruption(error)    "lost" when the connection to the keyboard went
//                          away anywhere in the cause, "unanswered" when the
//                          keyboard stopped answering, else ""
//   saveResult(cut, read)  after a Save cut short, what a read of the
//                          keyboard shows became of the edits

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

module.exports = {interruption, saveResult};
