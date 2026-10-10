"use strict";

const {encodeMacroPayload, macroProgramBytes, MACRO_PROGRAM_MAX} = require("../schema/macro-payload");
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
function inspectMacroInput(payload, {unicode = false, mode = 0, enabled = false, layout = US_HOST_LAYOUT, os = 0, currentBytes = 0, bankFree = 0} = {}) {
    const result = {bytes: null, program: null, programMax: MACRO_PROGRAM_MAX, availableBytes: currentBytes + bankFree, error: "", code: ""};
    try {
        const bytes = encodeMacroPayload(payload, {unicode, textEntry: enabled, layout});
        result.bytes = bytes.length;
        result.program = macroProgramBytes(bytes);
        const missing = [...payload].find(character => !layoutTypes(layout, character));
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

module.exports = {inspectMacroInput};
