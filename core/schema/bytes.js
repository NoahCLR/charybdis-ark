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

/** @param {unknown} value @param {string} label @param {{nonzero?: boolean}} [options] */
function u32(value, label, options = {}) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < (options.nonzero ? 1 : 0) || number > 0xffffffff) {
        throw new RangeError(`${label} must be ${options.nonzero ? "a nonzero " : "an "}unsigned 32-bit integer.`);
    }
    return number;
}

// A protocol's error class. Its text names bytes and layouts, for the
// diagnostics, and a person reads what the vocabulary says of such a failure
// (core/model/vocabulary.js failureSentence): one that reads the keyboard's
// answers marks its errors `fault: "answer"`, a byte format Ark encodes and
// decodes alike `fault: "ark"` (where Ark reads the keyboard's bytes with
// it, answerFault re-marks the refusal as the answer's).
/** @param {string} name @param {"answer" | "ark"} [fault] */
function protocolError(name, fault) {
    const ProtocolError = class extends Error {
        /** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
        constructor(code, message, details = {}) {
            super(message);
            this.name = name;
            this.code = code;
            if (fault) this.fault = fault;
            Object.assign(this, details);
        }
    };
    Object.defineProperty(ProtocolError, "name", {value: name});
    return ProtocolError;
}

// A refusal of bytes the keyboard sent, by a reader that also reads Ark's
// own bytes and backups: one Ark coded (not the language's or the
// platform's) is the keyboard's answer not reading, marked as such for what a
// person reads (core/model/vocabulary.js failureSentence), even where its
// reader marks its text as a developer's (`fault: "ark"`, protocolError);
// its own text stays for the diagnostics.
/** @template E @param {E} error @returns {E} */
function answerFault(error) {
    const details = /** @type {{code?: unknown, fault?: unknown}} */ (error);
    if (error instanceof Error && (details.fault === undefined || details.fault === "ark") && typeof details.code === "string" && /^(?!ERR_)[A-Z]/.test(details.code)) details.fault = "answer";
    return error;
}
// A reading of the keyboard's bytes, its refusal marked (answerFault).
/** @template T @param {() => T} read @returns {T} */
function answered(read) {
    try {return read();} catch (error) {throw answerFault(error);}
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

module.exports = {answerFault, answered, asBytes, copyBytes, u8, u16, u32, zeroRange, protocolError, canonical};
