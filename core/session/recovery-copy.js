// @ts-check
"use strict";

// What a recovery copy records besides the profile it keeps: what made it and
// the keyboard it came from, so the Backups screen can name it. Both shells
// keep that: the browser stores it beside the copy, and VS Code's recovery
// files, and the browser's downloads, carry it in the file name.

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

module.exports = {recoveryFileName};
