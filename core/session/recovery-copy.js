// @ts-check
"use strict";

// What a recovery copy records besides the profile it keeps: what made it and
// the keyboard it came from, so the Backups screen can name it. The browser
// stores it beside the copy, and the copy's file name, which it downloads
// as, carries it too.

// The keyboard's name as letters and digits joined by "-", short enough for
// a file name: "Noah's Charybdis" is "noah-s-charybdis".
/** @param {string} name */
const fileWords = (name) => name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-+|-+$/g, "");

// "recovery-2026-10-23T14-02-00-000Z-before-save-noah-s-charybdis.charybdis.json".
// The time comes first, so the files sort by when they were saved; a copy of
// an interrupted restore's data is a diagnostic file.
/** @param {{format?: string} | null | undefined} document @param {import("./types.js").RecoveryAbout} about @param {Date} savedAt */
function recoveryFileName(document, {cause, keyboard}, savedAt) {
    const suffix = document?.format === "charybdis-profile" ? ".charybdis.json" : ".diagnostic.json";
    const words = [`before-${cause}`, fileWords(keyboard)].filter(Boolean).join("-");
    return `recovery-${savedAt.toISOString().replace(/[:.]/g, "-")}-${words}${suffix}`;
}

// What a person is told when the shell's storage would not keep a recovery
// copy: the cause, and what helps, since neither trying again nor reloading
// does. The operation that asked for the copy stops before it sends anything.
const RECOVERY_STORAGE_WORDS = Object.freeze({
    full: "The browser's storage for this page is full, so Ark cannot keep a recovery copy. Delete recovery copies you no longer need on Backups, or free some of the browser's storage, then try again.",
    refused: "The browser is set not to let this page save data, so Ark cannot keep a recovery copy. Allow this site to save data in the browser's settings, then try again.",
    unavailable: "The browser's storage is not available to this page, so Ark cannot keep a recovery copy. Check that the browser lets this site save data and that the computer has free disk space, then try again.",
});
// The storage's refusals by the name its error carries (the browser's
// IndexedDB errors); anything else is passed on as it is.
/** @type {Readonly<Record<string, {code: string, words: string}>>} */
const STORAGE_REFUSALS = Object.freeze({
    QuotaExceededError: {code: "RECOVERY_STORAGE_FULL", words: RECOVERY_STORAGE_WORDS.full},
    SecurityError: {code: "RECOVERY_STORAGE_REFUSED", words: RECOVERY_STORAGE_WORDS.refused},
    UnknownError: {code: "RECOVERY_STORAGE_UNAVAILABLE", words: RECOVERY_STORAGE_WORDS.unavailable},
    InvalidStateError: {code: "RECOVERY_STORAGE_UNAVAILABLE", words: RECOVERY_STORAGE_WORDS.unavailable},
    NotFoundError: {code: "RECOVERY_STORAGE_UNAVAILABLE", words: RECOVERY_STORAGE_WORDS.unavailable},
    VersionError: {code: "RECOVERY_STORAGE_UNAVAILABLE", words: RECOVERY_STORAGE_WORDS.unavailable},
    AbortError: {code: "RECOVERY_STORAGE_UNAVAILABLE", words: RECOVERY_STORAGE_WORDS.unavailable},
});

// The shell's failure to store a recovery copy as Ark says it: a refusal of
// the storage with its own code and sentence, which an Apply's failure says
// as its reason; Ark's own fault or sentence unchanged. The storage's error
// is kept as `storageError`, not `cause`, which an Apply's failure would say
// instead (portable-profile-session.js withFailure).
/** @param {unknown} error @returns {unknown} */
function recoveryStorageFailure(error) {
    const name = /** @type {{name?: unknown} | null | undefined} */ (error)?.name;
    const refusal = typeof name === "string" && Object.hasOwn(STORAGE_REFUSALS, name) ? STORAGE_REFUSALS[name] : undefined;
    return refusal ? Object.assign(new Error(refusal.words), {code: refusal.code, storageError: error}) : error;
}

module.exports = {recoveryFileName, RECOVERY_STORAGE_WORDS, recoveryStorageFailure};
