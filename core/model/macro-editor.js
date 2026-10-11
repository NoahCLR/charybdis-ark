"use strict";

const {MACRO_BANK_BYTES, MACRO_SLOTS, decodedOf, encodeNamedProfile, validateSnapshot} = require("./portable-profile");
const {decodeProfileBlob} = require("../schema/profile-blob-v1");
const {SETTINGS, validName, encodeSettings} = require("../schema/settings-domain-v1");
const {macroKeycodes, macroModifierKeycodes, encodeMacroPayload, decodeMacroPayload, macroProgramBytes, MACRO_PROGRAM_MAX} = require("../schema/macro-payload");
const {supportsUnicodeMacros, supportsMacroProtection, supportsMacroOutputIsolation, macroProtectionOf} = require("../schema/macro-payload");
const {hostSettings, supportsHostLayouts} = require("../schema/host-settings");
const {hostLayout} = require("../data/host-layouts");
const {inspectMacroInput, inspectMacroPlayback} = require("./macro-input");
const {VOCABULARY} = require("./vocabulary");
const fail = (message, code = "MACRO_EDIT_CONFLICT") => Object.assign(new Error(message), {code});


// Every empty slot keeps room for ten key taps (3 bytes each, the slot's end
// marker already counted). When the free bytes cannot keep that for every
// empty slot, the highest-numbered empty slots are shown as out of room.
const SLOT_RESERVE_TAPS = 10, KEY_TAP_BYTES = 3;

function macroBudget(slots, capacity) {
    const stored = slots.reduce((total, bytes) => total + bytes.length + 1, 1);
    const free = Math.max(0, capacity - stored);
    const empty = slots.flatMap((bytes, index) => bytes.length === 0 || (bytes.length === 3 && bytes[0] === 1 && bytes[1] === 5) ? [index] : []);
    const room = Math.min(empty.length, Math.floor(free / (SLOT_RESERVE_TAPS * KEY_TAP_BYTES)));
    return {capacity, stored, free, outOfRoom: new Set(empty.slice(room)), available: slots.length - (empty.length - room)};
}

function macroEditorView(snapshot, capabilities) {
    if (!snapshot?.document || snapshot.incomplete) return null;
    const {document, settings} = decodedOf(snapshot);
    const unicode = supportsUnicodeMacros(capabilities);
    const protectionSupported = supportsMacroProtection(capabilities);
    const host = hostSettings(settings.values, snapshot.hostOs?.detected);
    const names = settings.macroNames;
    const slots = document.macros.map(value => Buffer.from(value, "base64"));
    const budget = macroBudget(slots, capabilities?.viaMacroBytes ?? MACRO_BANK_BYTES);
    const slot = (bytes, index) => {
        const program = macroProgramBytes(bytes);
        // Presentation preserves valid stored text, including Review without a
        // destination. Editing and Apply gate writes against capabilities.
        const payload = decodeMacroPayload(bytes, {unicode: true, protectionSupported: true});
        const playback = inspectMacroPlayback(payload, host, unicode);
        const protection = macroProtectionOf(bytes, {protectionSupported: true});
        const needsUnicodeEntry = playback.typing.some(route => route.method !== "layout");
        const needsUnicodeSetup = playback.code === "UNICODE_SETUP_REQUIRED";
        return {kind: "via", keycode: `VIA_MACRO_${index}`, name: names[index],
            payload, protection, uninterruptible: protectionSupported && (protection === "on" || (protection === "auto" && needsUnicodeEntry)),
            needsUnicodeEntry, needsUnicodeSetup, playbackError: playback.error, playbackCode: playback.code, empty: !payload, bytes: bytes.length,
            program, playable: !playback.error, available: !budget.outOfRoom.has(index),
            // How many more key taps this macro can take: the smaller of what
            // it may still play and what the bank has free.
            roomTaps: Math.floor(Math.max(0, Math.min(MACRO_PROGRAM_MAX - program, budget.free)) / KEY_TAP_BYTES)};
    };
    return {identity: snapshot.fingerprint,
        // Text types through the host layout; what it cannot type needs Unicode
        // entry (mode). The interface judges held keys against layoutChars.
        unicode: {supported: unicode, mode: host.unicodeMode, enabled: host.unicodeEnabled, os: host.effective,
            layouts: supportsHostLayouts(capabilities), layout: host.layout, layoutFits: host.layoutFits, layoutName: hostLayout(host.layout).name, layoutChars: hostLayout(host.layout).chars},
        viaMacros: slots.map(slot),
        macroBank: {capacity: budget.capacity, stored: budget.stored, free: budget.free, available: budget.available,
            slots: slots.length, reserveTaps: SLOT_RESERVE_TAPS, programMax: MACRO_PROGRAM_MAX},
        // Every slot can hold a full-length name, whatever the others hold.
        names: {perName: SETTINGS.NAME_MAX_BYTES}, protectionSupported, outputIsolationSupported: supportsMacroOutputIsolation(capabilities),
        protectionChoices: VOCABULARY.macroProtection.map(([value, label]) => ({value, label})),
        macroPayloadKeycodes: macroKeycodes(), macroPayloadModifierKeycodes: macroModifierKeycodes()};
}

// A macro's steps, its name, or both. A name lives in the profile's settings
// domain.
function macroInputStatus(snapshot, message, capabilities) {
    const index = macroIndex(message.keycode);
    const {document, settings} = decodedOf(snapshot);
    const slots = document.macros.map(value => Buffer.from(value, "base64"));
    const budget = macroBudget(slots, capabilities?.viaMacroBytes ?? MACRO_BANK_BYTES);
    const host = hostSettings(settings.values, snapshot.hostOs?.detected);
    return inspectMacroInput(message.payload, {unicode: supportsUnicodeMacros(capabilities), mode: host.unicodeMode,
        protectionSupported: supportsMacroProtection(capabilities), protection: message.protection ?? macroProtectionOf(slots[index], {protectionSupported: true}),
        enabled: Boolean(host.unicodeMode), layout: host.layout, os: host.effective, macosIso: host.macosIso, currentBytes: slots[index].length, bankFree: budget.free});
}

function macroIndex(keycode) {
    const match = /^VIA_MACRO_(\d+)$/.exec(keycode || "");
    const index = match && Number(match[1]);
    if (!match || index >= MACRO_SLOTS || String(index) !== match[1]) throw fail("Choose a macro slot reported by the keyboard.");
    return index;
}

function editMacro(snapshot, message, capabilities) {
    if (!snapshot?.document || !message.expectedFingerprint || message.expectedFingerprint !== snapshot.fingerprint) throw fail("The keyboard changed since this macro draft was opened. Read the keyboard and review the draft before saving again.");
    const index = macroIndex(message.keycode);
    if (message.payload === undefined && message.name === undefined && message.protection === undefined) throw fail("Send the macro's steps, its name or its playback protection.");
    const value = validateSnapshot(snapshot.document, capabilities);
    const document = JSON.parse(JSON.stringify(value.document));
    if (message.payload !== undefined) {
        const unicode = supportsUnicodeMacros(capabilities);
        const host = hostSettings(value.settings.values, snapshot.hostOs?.detected);
        const status = macroInputStatus(snapshot, message, capabilities);
        if (status.error) throw fail(status.error, status.code);
        const protection = message.protection ?? macroProtectionOf(Buffer.from(document.macros[index], "base64"), {protectionSupported: true});
        const bytes = encodeMacroPayload(message.payload, {unicode, textEntry: Boolean(host.unicodeMode), layout: host.layout, protection, protectionSupported: supportsMacroProtection(capabilities)});
        document.macros[index] = bytes.toString("base64");
    }
    if (message.protection !== undefined && message.payload === undefined) {
        if (!supportsMacroProtection(capabilities)) throw fail("Update both halves to set macro playback protection.");
        const bytes = Buffer.from(document.macros[index], "base64");
        const previous = macroProtectionOf(bytes, {protectionSupported: true});
        const prefix = encodeMacroPayload("", {protection: message.protection, protectionSupported: true});
        document.macros[index] = Buffer.concat([prefix, bytes.subarray(previous === "auto" ? 0 : 3)]).toString("base64");
    }
    if (message.name !== undefined && message.name !== value.settings.macroNames[index]) {
        if (typeof message.name !== "string") throw fail("A macro name must be text.");
        if (!validName(message.name.trim())) throw fail(`A macro name is up to ${SETTINGS.NAME_MAX_BYTES} bytes of text, with no control characters. Accented letters and symbols take two to four bytes each.`, "MACRO_NAME_INVALID");
        const settings = structuredClone(value.settings);
        settings.macroNames[index] = message.name.trim();
        const domains = decodeProfileBlob(value.profile).domains.map(domain => domain.id === 0x40 ? {...domain, payload: encodeSettings(settings)} : domain);
        document.profile = encodeNamedProfile({domains}).toString("base64");
    }
    validateSnapshot(document, capabilities);
    return document;
}

module.exports = {macroEditorView, editMacro, macroInputStatus, macroBudget, SLOT_RESERVE_TAPS};
