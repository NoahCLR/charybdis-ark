"use strict";

const catalog = require("../data/keycode-catalog");
const {layoutTypes, US_HOST_LAYOUT} = require("../data/host-layouts");
const UNICODE_MACRO_FEATURE = 1 << 21;
const MACRO_PROTECTION_FEATURE = 1 << 23;
const MACRO_OUTPUT_ISOLATION_FEATURE = 1 << 26;
const MACRO_PROTECTION = Object.freeze({AUTO: "auto", ON: "on", OFF: "off"});
const supportsUnicodeMacros = capabilities => Boolean(capabilities?.featureFlags & UNICODE_MACRO_FEATURE);
const supportsMacroProtection = capabilities => Boolean(capabilities?.featureFlags & MACRO_PROTECTION_FEATURE);
const supportsMacroOutputIsolation = capabilities => supportsMacroProtection(capabilities) && Boolean(capabilities?.featureFlags & MACRO_OUTPUT_ISOLATION_FEATURE);
const fail = message => Object.assign(new Error(message), {code: "INVALID_MACRO"});
const validKey = key => Number.isInteger(key) && ((key >= 4 && key <= 0xa4) || (key >= 0xe0 && key <= 0xe7));
const escapeText = text => text.replace(/[{}]/g, brace => brace + brace);
const keyName = key => catalog.resolve(key).name;

function macroKeycodes() {
    return catalog.entries().filter(entry => validKey(entry.value)).flatMap(entry => [entry.name, ...entry.aliases]);
}

function macroModifierKeycodes() {
    return catalog.entries().filter(entry => entry.value >= 0xE0 && entry.value <= 0xE7).flatMap(entry => [entry.name, ...entry.aliases]);
}

// The existing recorder and step builder use text plus {key}, {+key}, {-key}
// and {milliseconds}. Doubled braces preserve literal text from device bytes.
// The keyboard types text through the host layout and the rest by host
// Unicode entry, which an ordinary key held across it would corrupt.
function parsePayload(payload, {unicode = false, textEntry = false, layout = US_HOST_LAYOUT} = {}) {
    if (typeof payload !== "string" || payload.length > 32768) throw fail("Enter a macro of at most 32,768 characters.");
    const steps = [], held = new Set();
    let text = "";
    const flush = () => {
        if (textEntry && [...text].some(character => !layoutTypes(layout, character)) && [...held].some(key => key < 0xE0)) throw fail("Release ordinary keys before text your keyboard layout cannot type, which needs Unicode entry; modifier holds are supported.");
        if (text) steps.push({kind: "text", text}); text = "";
    };
    for (let index = 0; index < payload.length;) {
        const char = payload[index++];
        if ((char === "{" || char === "}") && payload[index] === char) {text += char; index++; continue;}
        if (char === "}") throw fail("Unexpected }. Use }} for a literal closing brace.");
        if (char !== "{") {
            const code = payload.codePointAt(index - 1);
            if (!(code === 9 || code === 10 || (code >= 32 && code <= 126) || (unicode && code >= 0xA0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF)))) throw fail(unicode ? "Macro text must contain valid Unicode characters, tabs or newlines; control characters and unpaired surrogates are unsupported." : "This firmware supports ASCII macro text only. Update both halves for Unicode text.");
            if (code > 0xFFFF) {text += payload.slice(index - 1, index + 1); index++;} else text += char;
            continue;
        }
        flush();
        const end = payload.indexOf("}", index);
        if (end < 0) throw fail("Missing } for a macro command.");
        const command = payload.slice(index, end).trim(); index = end + 1;
        if (/^\d+$/.test(command)) {
            const delay = Number(command);
            if (delay > 65535) throw fail("A macro delay must be between 0 and 65,535 milliseconds.");
            steps.push({kind: "delay", delay}); continue;
        }
        const kind = command[0] === "+" ? "down" : command[0] === "-" ? "up" : "tap";
        const names = (kind === "tap" ? command : command.slice(1)).split(",").map(name => name.trim());
        const keys = names.map(name => catalog.encode(name));
        if (!keys.length || keys.length > 16 || keys.some(key => !validKey(key)) || new Set(keys).size !== keys.length || (kind !== "tap" && keys.length !== 1)) throw fail("Choose up to 16 distinct basic keys for a chord, or one key for a press or release.");
        if (kind === "up") {
            if (!held.delete(keys[0])) throw fail("A macro releases a key that is not held.");
        } else {
            if (keys.some(key => held.has(key)) || held.size + keys.length > 16) throw fail("A macro presses a held key or holds more than 16 keys.");
            if (kind === "down") held.add(keys[0]);
        }
        steps.push({kind, keys});
    }
    flush();
    if (held.size) throw fail("Release every held key before the macro ends.");
    return steps;
}

// A VIA macro as the bytes QMK stores: text as is, then 1 and an opcode for a
// key tap (1), press (2), release (3) or a delay (4, digits, '|').
function encodeMacroPayload(payload, options) {
    const chunks = [];
    const protection = options?.protection ?? "auto";
    if (!Object.values(MACRO_PROTECTION).includes(protection)) throw fail("Choose Automatic, On or Off for uninterruptible playback.");
    if (protection !== "auto") {
        if (!options?.protectionSupported) throw fail("Update both halves to set macro playback protection.");
        chunks.push(Buffer.from([1, 5, protection === "on" ? 1 : 2]));
    }
    for (const step of parsePayload(payload, options)) {
        if (step.kind === "text") {
            chunks.push(Buffer.from(step.text, "utf8"));
        } else if (step.kind === "delay") {
            chunks.push(Buffer.concat([Buffer.from([1, 4]), Buffer.from(`${step.delay}|`)]));
        } else if (step.kind === "tap" && step.keys.length > 1) {
            for (const key of step.keys) chunks.push(Buffer.from([1, 2, key]));
            for (const key of [...step.keys].reverse()) chunks.push(Buffer.from([1, 3, key]));
        } else {
            chunks.push(Buffer.from([1, {tap: 1, down: 2, up: 3}[step.kind], step.keys[0]]));
        }
    }
    return Buffer.concat(chunks);
}

function decodeMacroPayload(bytes, options) {
    if (!Buffer.isBuffer(bytes)) throw fail("Invalid macro bytes.");
    let output = "", offset = 0;
    while (offset < bytes.length) {
        let op = bytes[offset++];
        if (op !== 1) {
            const start = offset - 1;
            while (offset < bytes.length && bytes[offset] !== 1) offset++;
            const raw = bytes.subarray(start, offset), text = raw.toString("utf8");
            if (!Buffer.from(text, "utf8").equals(raw)) throw fail("Malformed UTF-8 macro text.");
            output += escapeText(text); continue;
        }
        op = bytes[offset++];
        if (op === 5) {
            macroProtectionOf(bytes, options);
            if (offset !== 2) throw fail("Macro protection must be a single prefix before the steps.");
            offset++;
        } else if (op === 4) {
            const end = bytes.indexOf(124, offset);
            if (end < 0) throw fail("Truncated macro delay.");
            output += `{${bytes.subarray(offset, end).toString("ascii")}}`; offset = end + 1;
        } else {
            if (![1, 2, 3].includes(op) || !validKey(bytes[offset])) throw fail("Invalid macro key instruction.");
            output += `{${op === 2 ? "+" : op === 3 ? "-" : ""}${keyName(bytes[offset++])}}`;
        }
    }
    parsePayload(output, options);
    return output;
}

// The keyboard plays a VIA macro only after compiling its stored bytes into a
// program of at most this many bytes; a longer one is kept but never plays.
const MACRO_PROGRAM_MAX = 512;

function macroProtectionOf(bytes, {protectionSupported = false} = {}) {
    if (bytes[0] !== 1 || bytes[1] !== 5) return "auto";
    if (!protectionSupported) throw fail("Update both halves to read macro playback protection.");
    if (bytes[2] !== 1 && bytes[2] !== 2) throw fail("Invalid macro playback protection prefix.");
    return bytes[2] === 1 ? "on" : "off";
}

// The program size the firmware's decoder (macro_payload_decode_qmk_stream)
// produces for well-formed VIA macro bytes. It mirrors that decoder step for
// step: text runs cost 2 bytes per 255 characters plus one per character; a
// tap 3; a held key's press and release 2 each; a chord of held keys closed
// around one tap becomes one tap list; a delay 3.
function macroProgramBytes(bytes) {
    if (!Buffer.isBuffer(bytes)) throw fail("Invalid macro bytes.");
    let length = 0, chunk = 0, downs = [], tap = null, matched = 0;
    const flush = () => {
        length += 2 * downs.length + (tap === null ? 0 : 3) + 2 * matched;
        downs = []; tap = null; matched = 0;
    };
    for (let index = 0; index < bytes.length;) {
        const byte = bytes[index++];
        if (byte !== 1) {
            flush();
            if (byte >= 0x80) {
                const width = byte < 0xE0 ? 2 : byte < 0xF0 ? 3 : 4;
                index += width - 1; length += 4; chunk = 0;
                continue;
            }
            if (!chunk || chunk === 255) { length += 2; chunk = 0; }
            length++; chunk++;
            continue;
        }
        chunk = 0;
        const op = bytes[index++];
        if (op === 5) { index++; continue; }
        if (op === 4) {
            flush();
            while (index < bytes.length && bytes[index] !== 124) index++;
            index++; length += 3;
            continue;
        }
        const key = bytes[index++];
        if (op === 1) {
            if (tap !== null) flush();
            if (!downs.length) length += 3;
            else { tap = key; matched = 0; }
        } else if (op === 2) {
            if (tap !== null) flush();
            downs.push(key);
        } else if (tap !== null && matched < downs.length && key === downs[downs.length - 1 - matched]) {
            if (++matched === downs.length) { length += 3 + downs.length; downs = []; tap = null; matched = 0; }
        } else {
            flush(); length += 2;
        }
    }
    flush();
    return length;
}

module.exports = {macroModifierKeycodes, UNICODE_MACRO_FEATURE, supportsUnicodeMacros, MACRO_PROTECTION_FEATURE, MACRO_OUTPUT_ISOLATION_FEATURE, supportsMacroOutputIsolation, MACRO_PROTECTION, supportsMacroProtection, macroProtectionOf, macroKeycodes, parsePayload, encodeMacroPayload, decodeMacroPayload, macroProgramBytes, MACRO_PROGRAM_MAX};
