// @ts-check
// What the Backups screen says about a chosen file: whether it fits the
// keyboard's memory.

// The largest profile file read, and what a larger one is told: core's own
// (FILE_MAX_BYTES and FILE_TOO_LARGE in core/model/portable-profile.js).
export const PROFILE_FILE_MAX_BYTES = 196608;
export const PROFILE_FILE_TOO_LARGE = "This profile file is too large.";

/** @param {number} value */
const bytes = (value) => value.toLocaleString("en-GB");

// The import sheet's size line. A file exactly at capacity fits; a larger one
// says plainly that it does not, as a warning.
/** @param {{used: number, capacity: number}} fits @returns {{text: string, warn: boolean}} */
export function fitsLine({used, capacity}) {
    return used > capacity
        ? {text: `This file does not fit: ${bytes(used)} bytes, and this keyboard holds ${bytes(capacity)}.`, warn: true}
        : {text: `This file fits: ${bytes(used)} of ${bytes(capacity)} bytes`, warn: false};
}
