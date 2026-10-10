"use strict";

const {MACRO_BANK_BYTES, MACRO_SLOTS, decodedOf, encodeNamedProfile, validateSnapshot} = require("./portable-profile");
const {decodeProfileBlob} = require("../schema/profile-blob-v1");
const {SETTINGS, validName, encodeSettings} = require("../schema/settings-domain-v1");
const {macroKeycodes, macroModifierKeycodes, encodeMacroPayload, decodeMacroPayload, macroProgramBytes, MACRO_PROGRAM_MAX} = require("../schema/macro-payload");
const {supportsUnicodeMacros} = require("../schema/macro-payload");
const {hostSettings} = require("../schema/host-settings");
const fail = (message, code = "MACRO_EDIT_CONFLICT") => Object.assign(new Error(message), {code});


// Every empty slot keeps room for ten key taps (3 bytes each, the slot's end
// marker already counted). When the free bytes cannot keep that for every
// empty slot, the highest-numbered empty slots are shown as out of room.
const SLOT_RESERVE_TAPS = 10, KEY_TAP_BYTES = 3;

function macroBudget(slots, capacity) {
    const stored = slots.reduce((total, bytes) => total + bytes.length + 1, 1);
    const free = Math.max(0, capacity - stored);
    const empty = slots.flatMap((bytes, index) => bytes.length ? [] : [index]);
    const room = Math.min(empty.length, Math.floor(free / (SLOT_RESERVE_TAPS * KEY_TAP_BYTES)));
    return {capacity, stored, free, outOfRoom: new Set(empty.slice(room)), available: slots.length - (empty.length - room)};
}

function macroEditorView(snapshot, capabilities) {
    if (!snapshot?.document || snapshot.incomplete) return null;
    const {document, settings} = decodedOf(snapshot);
    const unicode = supportsUnicodeMacros(capabilities);
    const host = hostSettings(settings.values, snapshot.hostOs?.detected);
    const names = settings.macroNames;
    const slots = document.macros.map(value => Buffer.from(value, "base64"));
    const budget = macroBudget(slots, capabilities?.viaMacroBytes ?? MACRO_BANK_BYTES);
    const slot = (bytes, index) => {
        const program = macroProgramBytes(bytes);
        // Presentation preserves valid stored text, including Review without a
        // destination. Editing and Apply gate writes against capabilities.
        const payload = decodeMacroPayload(bytes, {unicode: true});
        const hasUnicode = /[^\x00-\x7F]/u.test(payload);
        const needsUnicodeSetup = hasUnicode && !host.unicodeMode;
        return {kind: "via", keycode: `VIA_MACRO_${index}`, name: names[index],
            payload, needsUnicodeSetup, empty: bytes.length === 0, bytes: bytes.length,
            program, playable: program <= MACRO_PROGRAM_MAX && !needsUnicodeSetup && (unicode || !hasUnicode), available: !budget.outOfRoom.has(index),
            // How many more key taps this macro can take: the smaller of what
            // it may still play and what the bank has free.
            roomTaps: Math.floor(Math.max(0, Math.min(MACRO_PROGRAM_MAX - program, budget.free)) / KEY_TAP_BYTES)};
    };
    return {identity: snapshot.fingerprint,
        unicode: {supported: unicode, mode: host.unicodeMode, enabled: host.unicodeEnabled},
        viaMacros: slots.map(slot),
        macroBank: {capacity: budget.capacity, stored: budget.stored, free: budget.free, available: budget.available,
            slots: slots.length, reserveTaps: SLOT_RESERVE_TAPS, programMax: MACRO_PROGRAM_MAX},
        // Every slot can hold a full-length name, whatever the others hold.
        names: {perName: SETTINGS.NAME_MAX_BYTES},
        macroPayloadKeycodes: macroKeycodes(), macroPayloadModifierKeycodes: macroModifierKeycodes()};
}

// A macro's steps, its name, or both. A name lives in the profile's settings
// domain.
function editMacro(snapshot, message, capabilities) {
    if (!snapshot?.document || !message.expectedFingerprint || message.expectedFingerprint !== snapshot.fingerprint) throw fail("The keyboard changed since this macro draft was opened. Read the keyboard and review the draft before saving again.");
    const match = /^VIA_MACRO_(\d+)$/.exec(message.keycode || "");
    const index = match && Number(match[1]);
    if (!match || index >= MACRO_SLOTS || String(index) !== match[1]) throw fail("Choose a macro slot reported by the keyboard.");
    if (message.payload === undefined && message.name === undefined) throw fail("Send the macro's steps, its name, or both.");
    const value = validateSnapshot(snapshot.document, capabilities);
    const document = JSON.parse(JSON.stringify(value.document));
    if (message.payload !== undefined) {
        const unicode = supportsUnicodeMacros(capabilities);
        const host = hostSettings(value.settings.values, snapshot.hostOs?.detected);
        if (/[^\x00-\x7F]/u.test(message.payload) && unicode && !host.unicodeMode) throw fail("Choose a known host OS and enable Unicode playback in Settings → Host before saving Unicode text.", "UNICODE_SETUP_REQUIRED");
        const bytes = encodeMacroPayload(message.payload, {unicode, textEntry: host.unicodeEnabled}), program = macroProgramBytes(bytes);
        if (program > MACRO_PROGRAM_MAX) throw fail(`This macro needs ${program} bytes to play and the keyboard plays at most ${MACRO_PROGRAM_MAX}. Shorten it by about ${Math.ceil((program - MACRO_PROGRAM_MAX) / KEY_TAP_BYTES)} key taps.`, "MACRO_TOO_LONG");
        document.macros[index] = bytes.toString("base64");
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

module.exports = {macroEditorView, editMacro, macroBudget, SLOT_RESERVE_TAPS};
