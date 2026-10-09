"use strict";
// The one rule every stored name follows (firmware D-F14, profile_name_v1.h):
// at most 32 bytes of well-formed UTF-8, no C0 control character and no DEL,
// stored as a length byte and those bytes. Limits count bytes, not characters.
const NAME_MAX_BYTES = 32;
const CONTROL = /[\u0000-\u001f\u007f]/u;

// Whether a name can be stored. A string with a lone surrogate does not
// survive UTF-8 encoding, so it is refused rather than altered.
const validName = name => typeof name === "string" && !CONTROL.test(name) && Buffer.from(name, "utf8").toString("utf8") === name
    && Buffer.byteLength(name, "utf8") <= NAME_MAX_BYTES;
const nameBytes = name => Buffer.byteLength(String(name ?? ""), "utf8");

// The stored bytes as a name, or undefined when they are not one: malformed,
// overlong or surrogate UTF-8 does not re-encode to the same bytes.
function nameOfBytes(bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length > NAME_MAX_BYTES) return undefined;
    const name = bytes.toString("utf8");
    return Buffer.from(name, "utf8").equals(bytes) && !CONTROL.test(name) ? name : undefined;
}

// A name as its counted record: a length byte, then the UTF-8.
function encodeName(name) {
    if (!validName(name)) throw Object.assign(new Error(`A name is at most ${NAME_MAX_BYTES} bytes of text, with no control characters.`), {code: "INVALID_NAME"});
    const bytes = Buffer.from(name, "utf8");
    return Buffer.concat([Buffer.from([bytes.length]), bytes]);
}

module.exports = {NAME_MAX_BYTES, validName, nameBytes, nameOfBytes, encodeName};
