// @ts-check
"use strict";

// Shared wire primitives. Callers keep their protocol's error name, code and
// location fields; the byte checks do not invent a domain's policy.
/** @param {unknown} value @param {string} label */
function asBytes(value, label) {
    if (!(value instanceof Uint8Array)) throw new TypeError(`${label} must be a Buffer or Uint8Array.`);
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

/** @param {unknown} value @param {string} label */
function copyBytes(value, label) {
    return Buffer.from(asBytes(value, label));
}

/** @param {unknown} value @param {string} label @param {{nonzero?: boolean}} [options] */
function u8(value, label, options = {}) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < (options.nonzero ? 1 : 0) || number > 0xff) {
        throw new RangeError(`${label} must be ${options.nonzero ? "a nonzero " : "an "}8-bit integer.`);
    }
    return number;
}

/** @param {unknown} value @param {string} label @param {{nonzero?: boolean}} [options] */
function u16(value, label, options = {}) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < (options.nonzero ? 1 : 0) || number > 0xffff) {
        throw new RangeError(`${label} must be ${options.nonzero ? "a nonzero " : "an "}16-bit integer.`);
    }
    return number;
}

/** @param {string} name */
function protocolError(name) {
    const ProtocolError = class extends Error {
        /** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
        constructor(code, message, details = {}) {
            super(message);
            this.name = name;
            this.code = code;
            Object.assign(this, details);
        }
    };
    Object.defineProperty(ProtocolError, "name", {value: name});
    return ProtocolError;
}

/** @param {Uint8Array} bytes @param {number} start @param {number} end @param {(offset: number) => Error} error */
function zeroRange(bytes, start, end, error) {
    for (let offset = start; offset < end; offset++) {
        if (bytes[offset] !== 0) throw error(offset);
    }
}

// The check every profile domain decoder ends with: what it read must encode
// back to exactly the bytes it read. The decoder passes its own encoder, with
// the options it decoded under, and its own refusal; an encoder that refuses
// the value refuses the bytes with its own error.
/** @template T @param {Uint8Array} bytes @param {T} value @param {(value: T) => Uint8Array} encode @param {() => Error} refuse @returns {T} */
function canonical(bytes, value, encode, refuse) {
    if (Buffer.compare(encode(value), bytes) !== 0) throw refuse();
    return value;
}

module.exports = {asBytes, copyBytes, u8, u16, zeroRange, protocolError, canonical};
