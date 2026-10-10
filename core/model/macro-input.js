"use strict";

const {parsePayload, encodeMacroPayload, macroProgramBytes, MACRO_PROGRAM_MAX} = require("../schema/macro-payload");
const {hostLayout, layoutTypes, US_HOST_LAYOUT} = require("../data/host-layouts");

// What to do when the host layout cannot type a character, by effective OS.
const ENTRY_SETUP = [
    "Choose a host OS and enable Unicode playback in Settings → Host to type it with Unicode entry.",
    "Choose the Unicode Hex Input layout in Settings → Host to type it with Unicode entry.",
    "Enable Unicode playback in Settings → Host to type it with Unicode entry.",
    "Enable Unicode playback in Settings → Host to type it with Unicode entry.",
];

// Inspection and staging use the same codec and limits. A partial or oversized
// edit remains visible locally; inspection never changes a profile.
function inspectMacroInput(payload, {unicode = false, mode = 0, enabled = false, layout = US_HOST_LAYOUT, os = 0, macosIso = false, currentBytes = 0, bankFree = 0} = {}) {
    const result = {bytes: null, program: null, programMax: MACRO_PROGRAM_MAX, availableBytes: currentBytes + bankFree, error: "", code: "", typing: []};
    try {
        // Inspect literal text only, not command spelling or escaped braces.
        // Keep its typing route even when a held key makes playback invalid.
        const characters = new Set(parsePayload(payload, {unicode: true}).filter(step => step.kind === "text").flatMap(step => [...step.text]));
        const native = hostLayout(layout);
        const swapIso = stroke => macosIso && native?.os === "macos"
            ? stroke.replace(/KC_GRV|KC_NUBS/g, key => key === "KC_GRV" ? "KC_NUBS" : "KC_GRV") : stroke;
        result.typing = [...characters].map(character => layoutTypes(layout, character)
            ? {character, method: "layout", strokes: native.strokes[character].map(swapIso)}
            : {character, method: mode && unicode ? "unicode" : "unavailable", mode: mode && unicode ? mode : 0});
        const bytes = encodeMacroPayload(payload, {unicode, textEntry: enabled, layout});
        result.bytes = bytes.length;
        result.program = macroProgramBytes(bytes);
        const missing = [...characters].find(character => !layoutTypes(layout, character));
        if (missing && unicode && !mode) {
            result.error = `The ${hostLayout(layout)?.name || "chosen"} layout cannot type “${missing}”. ${ENTRY_SETUP[os] || ENTRY_SETUP[0]}`;
            result.code = "UNICODE_SETUP_REQUIRED";
        } else if (result.program > MACRO_PROGRAM_MAX) {
            result.error = `This macro needs ${result.program} bytes to play; the keyboard plays at most ${MACRO_PROGRAM_MAX}. Shorten the text or remove steps.`;
            result.code = "MACRO_TOO_LONG";
        } else if (bytes.length > result.availableBytes) {
            result.error = `This macro needs ${bytes.length} bytes of macro memory; ${result.availableBytes} are available for this slot. Shorten it or clear another macro.`;
            result.code = "MACRO_BANK_FULL";
        }
    } catch (error) {
        result.error = error.message;
        result.code = error.code || "INVALID_MACRO";
    }
    return result;
}

// Stored macros use the same syntax, host setup and playback limits as edits,
// without judging whether an existing slot fits the bank a second time.
function inspectMacroPlayback(payload, host, unicode = true) {
    const {error, code, typing} = inspectMacroInput(payload, {unicode, mode: host.unicodeMode, enabled: Boolean(host.unicodeMode),
        layout: host.layout, os: host.effective, macosIso: host.macosIso, bankFree: Infinity});
    return {error, code, typing};
}

module.exports = {inspectMacroInput, inspectMacroPlayback};
