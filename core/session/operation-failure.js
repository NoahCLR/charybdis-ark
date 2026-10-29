// @ts-check
"use strict";

// How the device service words a failure (profile-device-service.js): the
// error it records and publishes, what lies under it for the diagnostics, and
// what the operation rejects with.

/** @typedef {import("./types.js").PublicError & Partial<Record<'step' | 'stepLabel' | 'reason' | 'saved' | 'verdict' | 'fault', string>>} PublishedError */

// What an operation started while another runs is told, here and by the panel.
const BUSY_REFUSAL = "Wait for the current operation to finish before starting another.";

/** @param {unknown} value */
function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
}

/** @param {unknown} value @returns {PublishedError} */
function publicError(value) {
    const error = /** @type {Partial<Error> & Record<string, unknown> | null | undefined} */ (value);
    /** @type {PublishedError} */
    const result = {
        code: cleanText(error?.code) || cleanText(error?.name) || "LIVE_LINK_ERROR",
        message: cleanText(error?.message) || String(error || "Unknown live-link error."),
    };
    // Where an Apply failed, why, and what was saved (see apply-progress.js
    // and interruption.js), and whose text it is (model/vocabulary.js
    // failureSentence).
    for (const key of /** @type {const} */ (["step", "stepLabel", "reason", "saved", "verdict", "fault"])) {
        if (typeof error?.[key] === "string" && error[key]) result[key] = cleanText(error[key]);
    }
    return result;
}

// What lies under a failure, for the diagnostics: the coordinators' and the
// transport's own words, with the device they name. A person reads the
// failure's sentence; this is for whoever looks into it.
/** @param {unknown} error */
function causeText(error) {
    const own = /** @type {{deviceId?: unknown} | null | undefined} */ (error)?.deviceId;
    const parts = typeof own === "string" ? [`device ${own}`] : [];
    let cause = /** @type {{cause?: unknown} | null | undefined} */ (error)?.cause;
    for (let depth = 0; cause && typeof cause === "object" && depth < 8; depth++) {
        const item = /** @type {{code?: unknown, name?: unknown, message?: unknown, deviceId?: unknown, cause?: unknown}} */ (cause);
        const device = typeof item.deviceId === "string" ? ` [${item.deviceId}]` : "";
        parts.push(`${cleanText(item.code) || cleanText(item.name) || "cause"}: ${cleanText(item.message)}${device}`);
        cause = item.cause;
    }
    return parts.length ? ` (${parts.join("; ")})` : "";
}

// What a failed operation rejects with: the error it recorded, as a thrown
// Error carrying the same code and fields.
/** @param {PublishedError} error */
function rejection(error) {
    return Object.assign(new Error(error.message), error);
}

module.exports = {BUSY_REFUSAL, causeText, cleanText, publicError, rejection};
