// @ts-check
"use strict";
const {copyBytes, protocolError} = require("./bytes");

// Macro domain 0x70, version 1 (firmware portable-profile-v1.md): the 128
// macros in the bank encoding VIA's dynamic macros use, slot 0 first, each
// ended by a zero byte. A bank may continue after the 128th terminator with
// unused capacity, possibly stale bytes a writer left after shortening a
// macro, as long as its final byte is zero; nothing reads them. Ark writes
// the canonical form, the macros and their terminators alone, which is what
// the firmware's compiled defaults hold.
//
// Inside a macro: text 0x02..0x7f, canonical UTF-8, or 0x01 and a code: 1, 2
// or 3 (tap, press, release) and a nonzero keycode; 4 and decimal digits (a
// delay) ended by any other byte, which the delay consumes, or by the macro's
// terminator; 5 and a protection level of 1 or 2, only as the macro's first
// two bytes. This codec checks exactly that grammar, as the firmware's
// validator does; whether a macro can play (held keys balanced, its text
// typeable on the host) is the model's check (portable-profile.js).
const MACRO_DOMAIN_V1 = Object.freeze({
    VERSION: 1,
    SLOTS: 128,
    MAX_SIZE: 34903,
    PREFIX: 0x01,
    TAP: 0x01,
    DOWN: 0x02,
    UP: 0x03,
    DELAY: 0x04,
    PROTECT: 0x05,
});

const MacroDomainError = protocolError("MacroDomainError");

// The canonical domain's size for these macros: each macro and its terminator.
/** @param {readonly Uint8Array[]} macros */
const macroDomainSize = macros => macros.reduce((total, bytes) => total + bytes.length + 1, 0);

/** @param {readonly Uint8Array[]} macros @param {{maxSize?: number}} [options] @returns {Buffer} */
function encodeMacroDomain(macros, {maxSize = MACRO_DOMAIN_V1.MAX_SIZE} = {}) {
    if (!Array.isArray(macros) || macros.length !== MACRO_DOMAIN_V1.SLOTS) throw new MacroDomainError("INVALID_SLOTS", `The macro domain holds exactly ${MACRO_DOMAIN_V1.SLOTS} macros.`);
    const streams = Array.from(macros, (macro, slot) => {
        if (!(macro instanceof Uint8Array)) throw new MacroDomainError("INVALID_MACRO", `Macro ${slot} must be bytes.`, {slot});
        const bytes = copyBytes(macro, `Macro ${slot}`);
        const end = scanMacro(bytes, 0, slot);
        if (end !== bytes.length) throw new MacroDomainError("INVALID_MACRO", `Macro ${slot} contains a zero byte.`, {slot});
        return bytes;
    });
    const size = macroDomainSize(streams);
    if (size > maxSize) throw new MacroDomainError("CAPACITY_EXCEEDED", `Macros need ${size} bytes; the macro domain holds ${maxSize}.`, {size, capacity: maxSize});
    const output = Buffer.alloc(size);
    let offset = 0;
    for (const stream of streams) {stream.copy(output, offset); offset += stream.length + 1;}
    return output;
}

// The 128 macros, without terminators. Bytes after the 128th terminator are
// unused capacity and are not returned.
/** @param {Uint8Array} value @returns {Buffer[]} */
function decodeMacroDomain(value) {
    const bytes = copyBytes(value, "Macro domain");
    if (bytes.length < 1 || bytes.length > MACRO_DOMAIN_V1.MAX_SIZE) throw new MacroDomainError("INVALID_LENGTH", `The macro domain is ${bytes.length} bytes; version 1 holds 1 to ${MACRO_DOMAIN_V1.MAX_SIZE}.`);
    if (bytes.at(-1) !== 0) throw new MacroDomainError("UNFINISHED", "The macro domain's final byte is not zero.");
    const macros = [];
    let offset = 0;
    while (macros.length < MACRO_DOMAIN_V1.SLOTS) {
        const slot = macros.length;
        const end = scanMacro(bytes, offset, slot);
        if (end >= bytes.length) throw new MacroDomainError("MISSING_TERMINATOR", `Macro ${slot} has no terminator.`, {slot});
        macros.push(Buffer.from(bytes.subarray(offset, end)));
        offset = end + 1;
    }
    return macros;
}

// Reads one macro from offset by the firmware's grammar; returns the offset of
// its terminator, or bytes.length when the bytes end first.
/** @param {Buffer} bytes @param {number} start @param {number} slot */
function scanMacro(bytes, start, slot) {
    const invalid = (/** @type {number} */ at) => new MacroDomainError("INVALID_MACRO", `Macro ${slot} is not valid at byte ${at - start}.`, {slot, offset: at});
    let index = start;
    while (index < bytes.length) {
        const byte = bytes[index];
        if (byte === 0) return index;
        if (byte === MACRO_DOMAIN_V1.PREFIX) {
            const code = bytes[index + 1];
            if (code === MACRO_DOMAIN_V1.TAP || code === MACRO_DOMAIN_V1.DOWN || code === MACRO_DOMAIN_V1.UP) {
                if (!bytes[index + 2]) throw invalid(index + 2);
                index += 3;
            } else if (code === MACRO_DOMAIN_V1.DELAY) {
                index += 2;
                while (index < bytes.length && bytes[index] >= 0x30 && bytes[index] <= 0x39) index += 1;
                // Any other byte ends the delay and is consumed with it; the
                // terminator ends it and the macro.
                if (index < bytes.length && bytes[index] !== 0) index += 1;
            } else if (code === MACRO_DOMAIN_V1.PROTECT) {
                if (index !== start) throw invalid(index);
                if (bytes[index + 2] !== 1 && bytes[index + 2] !== 2) throw invalid(index + 2);
                index += 3;
            } else {
                throw invalid(index + 1);
            }
        } else if (byte < 0x80) {
            index += 1;
        } else {
            index = utf8End(bytes, index, invalid);
        }
    }
    return index;
}

// The rules the firmware's playback applies: no overlong form, surrogate,
// value above U+10FFFF or C1 control.
/** @param {Buffer} bytes @param {number} index @param {(at: number) => Error} invalid */
function utf8End(bytes, index, invalid) {
    const lead = bytes[index];
    const count = lead >= 0xc2 && lead <= 0xdf ? 2 : lead >= 0xe0 && lead <= 0xef ? 3 : lead >= 0xf0 && lead <= 0xf4 ? 4 : 0;
    if (!count || index + count > bytes.length) throw invalid(index);
    let scalar = lead & (count === 2 ? 0x1f : count === 3 ? 0x0f : 0x07);
    for (let i = 1; i < count; i += 1) {
        if ((bytes[index + i] & 0xc0) !== 0x80) throw invalid(index + i);
        scalar = (scalar << 6) | (bytes[index + i] & 0x3f);
    }
    if (scalar < 0xa0 || (count === 3 && scalar < 0x800) || (count === 4 && scalar < 0x10000) || (scalar >= 0xd800 && scalar <= 0xdfff) || scalar > 0x10ffff) throw invalid(index);
    return index + count;
}

module.exports = {MACRO_DOMAIN_V1, MacroDomainError, decodeMacroDomain, encodeMacroDomain, macroDomainSize};
