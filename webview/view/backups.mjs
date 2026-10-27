// @ts-check
// What the Backups screen says about a chosen file: whether it fits the
// keyboard's memory.

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
