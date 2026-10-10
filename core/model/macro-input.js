"use strict";

const {encodeMacroPayload, macroProgramBytes, MACRO_PROGRAM_MAX} = require("../schema/macro-payload");

// Inspection and staging use the same codec and limits. A partial or oversized
// edit remains visible locally; inspection never changes a profile.
function inspectMacroInput(payload, {unicode = false, mode = 0, enabled = false, currentBytes = 0, bankFree = 0} = {}) {
    const result = {bytes: null, program: null, programMax: MACRO_PROGRAM_MAX, availableBytes: currentBytes + bankFree, error: "", code: ""};
    try {
        const bytes = encodeMacroPayload(payload, {unicode, textEntry: enabled});
        result.bytes = bytes.length;
        result.program = macroProgramBytes(bytes);
        if (/[^\x00-\x7F]/u.test(payload) && unicode && !mode) {
            result.error = "Choose a known host OS and enable Unicode playback in Settings → Host before saving Unicode text.";
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
