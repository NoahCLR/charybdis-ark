// @ts-check
"use strict";

const catalog = require("../data/keycode-catalog");
const {layoutTypes, US_HOST_LAYOUT} = require("../data/host-layouts");
const MACRO_PROTECTION = Object.freeze({AUTO: "auto", ON: "on", OFF: "off"});
// What one macro may ask of the keyboard: keys held at once, a chord's keys
// included, and a delay in milliseconds.
const MACRO_LIMITS = Object.freeze({maxHeldKeys: 16, maxDelayMs: 65535});
/** @param {string} message */
const fail = message => Object.assign(new Error(message), {code: "INVALID_MACRO"});
/** @param {unknown} key @returns {key is number} */
const validKey = key => typeof key === "number" && Number.isInteger(key) && ((key >= 4 && key <= 0xa4) || (key >= 0xe0 && key <= 0xe7));
/** @param {string} text */
const escapeText = text => text.replace(/[{}]/g, brace => brace + brace);
/** @param {number} key */
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
/** @param {unknown} payload @param {import("./types.js").MacroOptions} [options] @returns {import("./types.js").MacroStep[]} */
function parsePayload(payload, {textEntry = false, layout = US_HOST_LAYOUT} = {}) {
    if (typeof payload !== "string") throw fail("Enter a macro as text.");
    /** @type {import("./types.js").MacroStep[]} */
    const steps = [];
    /** @type {Set<number>} */
    const held = new Set();
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
            // The loop has just read this character, so its index is in range.
            const code = /** @type {number} */ (payload.codePointAt(index - 1));
            if (!(code === 9 || code === 10 || (code >= 32 && code <= 126) || (code >= 0xA0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF)))) throw fail("Macro text must contain valid Unicode characters, tabs or newlines; control characters and unpaired surrogates are unsupported.");
            if (code > 0xFFFF) {text += payload.slice(index - 1, index + 1); index++;} else text += char;
            continue;
        }
        flush();
        const end = payload.indexOf("}", index);
        if (end < 0) throw fail("Missing } for a macro command.");
        const command = payload.slice(index, end).trim(); index = end + 1;
        if (/^\d+$/.test(command)) {
            const delay = Number(command);
            if (delay > MACRO_LIMITS.maxDelayMs) throw fail(`A macro delay must be between 0 and ${MACRO_LIMITS.maxDelayMs.toLocaleString("en-US")} milliseconds.`);
            steps.push({kind: "delay", delay}); continue;
        }
        const kind = command[0] === "+" ? "down" : command[0] === "-" ? "up" : "tap";
        const names = (kind === "tap" ? command : command.slice(1)).split(",").map(name => name.trim());
        const keys = names.map(name => catalog.encode(name));
        if (!keys.length || keys.length > MACRO_LIMITS.maxHeldKeys || !keys.every(validKey) || new Set(keys).size !== keys.length || (kind !== "tap" && keys.length !== 1)) throw fail(`Choose up to ${MACRO_LIMITS.maxHeldKeys} distinct basic keys for a chord, or one key for a press or release.`);
        if (kind === "up") {
            if (!held.delete(keys[0])) throw fail("A macro releases a key that is not held.");
        } else {
            if (keys.some(key => held.has(key)) || held.size + keys.length > MACRO_LIMITS.maxHeldKeys) throw fail(`A macro presses a held key or holds more than ${MACRO_LIMITS.maxHeldKeys} keys.`);
            if (kind === "down") held.add(keys[0]);
        }
        steps.push({kind, keys});
    }
    flush();
    if (held.size) throw fail("Release every held key before the macro ends.");
    return steps;
}

// A macro as the bytes QMK stores: text as is, then 1 and an opcode for a
// key tap (1), press (2), release (3) or a delay (4, digits, '|').
/** @param {string} payload @param {import("./types.js").MacroOptions} [options] */
function encodeMacroPayload(payload, options) {
    /** @type {Buffer[]} */
    const chunks = [];
    const protection = options?.protection ?? "auto";
    if (!Object.values(MACRO_PROTECTION).includes(protection)) throw fail("Choose Automatic, On or Off for uninterruptible playback.");
    if (protection !== "auto") chunks.push(Buffer.from([1, 5, protection === "on" ? 1 : 2]));
    for (const step of parsePayload(payload, options)) {
        if (step.kind === "text") {
            chunks.push(Buffer.from(step.text, "utf8"));
        } else if (step.kind === "delay") {
            chunks.push(Buffer.concat([Buffer.from([1, 4]), Buffer.from(`${step.delay}|`)]));
        } else if (step.kind === "tap" && step.keys.length > 1) {
            // The firmware's own chord form: press every key but the last,
            // tap the last, release the rest in reverse.
            const last = step.keys.length - 1;
            for (const key of step.keys.slice(0, last)) chunks.push(Buffer.from([1, 2, key]));
            chunks.push(Buffer.from([1, 1, step.keys[last]]));
            for (const key of step.keys.slice(0, last).reverse()) chunks.push(Buffer.from([1, 3, key]));
        } else {
            chunks.push(Buffer.from([1, {tap: 1, down: 2, up: 3}[step.kind], step.keys[0]]));
        }
    }
    return Buffer.concat(chunks);
}

/** @typedef {{kind: "text", text: string} | {kind: "delay", digits: string} | {kind: "tap" | "down" | "up", key: number}} MacroCommand */

// One chord found at commands[at]: a run of presses, then either a tap whose
// releases follow in reverse (the firmware's form) or, for Ark's older form,
// at least two presses released straight away in reverse. Presses before the
// longest matching tail stay presses. Returns the keys and the commands used.
/** @param {MacroCommand[]} commands @param {number} at @returns {{downs: number, keys: number[], length: number} | undefined} */
function chordAt(commands, at) {
    let end = at;
    while (commands[end]?.kind === "down") end++;
    if (end === at) return undefined;
    const tap = commands[end]?.kind === "tap" ? /** @type {{key: number}} */ (commands[end]).key : undefined;
    const ups = tap === undefined ? end : end + 1;
    const keyOf = /** @param {number} index */ index => /** @type {{key: number}} */ (commands[index]).key;
    for (let start = at; start < end; start++) {
        const held = end - start, total = held + (tap === undefined ? 0 : 1);
        if (total < 2 || total > MACRO_LIMITS.maxHeldKeys) continue;
        let matched = true;
        for (let index = 0; index < held && matched; index++) {
            const up = commands[ups + index];
            matched = up?.kind === "up" && up.key === keyOf(end - 1 - index);
        }
        if (!matched) continue;
        const keys = [];
        for (let index = start; index < end; index++) keys.push(keyOf(index));
        if (tap !== undefined) keys.push(tap);
        return {downs: start - at, keys, length: ups + held - at};
    }
    return undefined;
}

/** @param {MacroCommand} command */
const commandText = command => command.kind === "text" ? escapeText(command.text)
    : command.kind === "delay" ? `{${command.digits}}`
    : `{${command.kind === "down" ? "+" : command.kind === "up" ? "-" : ""}${keyName(command.key)}}`;

/** @param {MacroCommand[]} commands */
function commandsText(commands) {
    let output = "";
    for (let index = 0; index < commands.length;) {
        const chord = chordAt(commands, index);
        if (!chord) {output += commandText(commands[index++]); continue;}
        for (let press = 0; press < chord.downs; press++) output += commandText(commands[index + press]);
        output += `{${chord.keys.map(keyName).join(",")}}`;
        index += chord.length;
    }
    return output;
}

/** @param {Buffer} bytes @param {import("./types.js").MacroOptions} [options] */
function decodeMacroPayload(bytes, options) {
    if (!Buffer.isBuffer(bytes)) throw fail("Invalid macro bytes.");
    /** @type {MacroCommand[]} */
    const commands = [];
    let offset = 0;
    while (offset < bytes.length) {
        let op = bytes[offset++];
        if (op !== 1) {
            const start = offset - 1;
            while (offset < bytes.length && bytes[offset] !== 1) offset++;
            const raw = bytes.subarray(start, offset), text = raw.toString("utf8");
            if (!Buffer.from(text, "utf8").equals(raw)) throw fail("Malformed UTF-8 macro text.");
            commands.push({kind: "text", text}); continue;
        }
        op = bytes[offset++];
        if (op === 5) {
            macroProtectionOf(bytes);
            if (offset !== 2) throw fail("Macro protection must be a single prefix before the steps.");
            offset++;
        } else if (op === 4) {
            const end = bytes.indexOf(124, offset);
            if (end < 0) throw fail("Truncated macro delay.");
            commands.push({kind: "delay", digits: bytes.subarray(offset, end).toString("ascii")}); offset = end + 1;
        } else {
            if (![1, 2, 3].includes(op) || !validKey(bytes[offset])) throw fail("Invalid macro key instruction.");
            commands.push({kind: op === 2 ? "down" : op === 3 ? "up" : "tap", key: bytes[offset++]});
        }
    }
    const output = commandsText(commands);
    parsePayload(output, options);
    return output;
}

/** @param {Uint8Array} bytes @returns {"auto" | "on" | "off"} */
function macroProtectionOf(bytes) {
    if (bytes[0] !== 1 || bytes[1] !== 5) return "auto";
    if (bytes[2] !== 1 && bytes[2] !== 2) throw fail("Invalid macro playback protection prefix.");
    return bytes[2] === 1 ? "on" : "off";
}

module.exports = {macroModifierKeycodes, MACRO_LIMITS, MACRO_PROTECTION, macroProtectionOf, macroKeycodes, parsePayload, encodeMacroPayload, decodeMacroPayload};
