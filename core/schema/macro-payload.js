// @ts-check
"use strict";

const catalog = require("../data/keycode-catalog");
const keycodes = require("./keycodes");
const {layoutTypes, US_HOST_LAYOUT} = require("../data/host-layouts");
const MACRO_PROTECTION = Object.freeze({AUTO: "auto", ON: "on", OFF: "off"});
const {MACRO_LIMITS, readMacroPayload} = require("../../rules/macro-payload.mjs");
/** @param {string} message */
const fail = message => Object.assign(new Error(message), {code: "INVALID_MACRO"});
/** @param {unknown} key @returns {key is number} */
const validKey = key => typeof key === "number" && Number.isInteger(key) && ((key >= 4 && key <= 0xa4) || (key >= 0xe0 && key <= 0xe7));
/** @param {string} text */
const escapeText = text => text.replace(/[{}]/g, brace => brace + brace);
/** @param {number} key */
const keyName = key => keycodes.resolve(key).name;

function macroKeycodes() {
    return catalog.entries().filter(entry => validKey(entry.value)).flatMap(entry => [entry.name, ...entry.aliases]);
}

function macroModifierKeycodes() {
    return catalog.entries().filter(entry => entry.value >= 0xE0 && entry.value <= 0xE7).flatMap(entry => [entry.name, ...entry.aliases]);
}

// A stored macro's steps, read in the shared macro grammar
// (rules/macro-payload.mjs) by keycode: a key is the keycode its name encodes
// to, and only a basic key or modifier may be sent, by the names the step
// editor offers (macroKeycodes), never by number. A name a macro cannot send
// stays itself, so it is never the same key as another and is refused by
// name, as the step editor refuses it. A macro that does not read is refused
// with the grammar's reason (`problem`), which the model words from the
// vocabulary (wordedMacroError); a macro that leaves a key held is refused
// too.
/** @type {Set<string> | undefined} */
let sendableNames;
/** @param {string} name */
const sendable = name => (sendableNames ??= new Set(macroKeycodes())).has(name);
/** @param {unknown} payload @param {import("./types.js").MacroOptions} [options] @returns {import("./types.js").MacroStep[]} */
function parsePayload(payload, {textEntry = false, layout = US_HOST_LAYOUT} = {}) {
    if (typeof payload !== "string") throw fail("Enter a macro as text.");
    const {steps, error} = readMacroPayload(payload, {
        identity: name => sendable(name) ? keycodes.encode(name) : name, sendable,
        textEntry, needsEntry: character => !layoutTypes(layout, character), ordinary: key => /** @type {number} */ (key) < 0xE0,
        skipEmptyNames: true, stopAtTextHold: true, releaseAll: true,
    });
    if (error) throw Object.assign(fail(`This macro does not read (${error.code}).`), {problem: error});
    return steps.map(step => step.kind === "text" || step.kind === "delay" ? step
        : {kind: step.kind === "press" ? "down" : step.kind === "release" ? "up" : "tap", keys: /** @type {number[]} */ (step.ids)});
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

module.exports = {macroModifierKeycodes, MACRO_PROTECTION, macroProtectionOf, macroKeycodes, parsePayload, encodeMacroPayload, decodeMacroPayload};
