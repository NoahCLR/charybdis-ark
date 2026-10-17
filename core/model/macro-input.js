// @ts-check
"use strict";

const {parsePayload, encodeMacroPayload} = require("../schema/macro-payload");
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
/** @param {unknown} payload @param {import("../schema/types.js").MacroOptions & {mode?: number, enabled?: boolean, os?: number, macosIso?: boolean, currentBytes?: number, bankFree?: number}} [options] @returns {import("../../contracts/model.js").MacroInspection} */
function inspectMacroInput(payload, {mode = 0, enabled = false, layout = US_HOST_LAYOUT, os = 0, macosIso = false, currentBytes = 0, bankFree = 0, protection = "auto"} = {}) {
    /** @type {import("../../contracts/model.js").MacroInspection} */
    const result = {bytes: null, availableBytes: currentBytes + bankFree, error: "", code: "", typing: []};
    try {
        // Inspect literal text only, not command spelling or escaped braces.
        // Keep its typing route even when a held key makes playback invalid.
        const characters = new Set(parsePayload(payload).filter(step => step.kind === "text").flatMap(step => [...step.text]));
        const native = hostLayout(layout);
        /** @param {string} stroke */
        const swapIso = stroke => macosIso && native?.os === "macos"
            ? stroke.replace(/KC_GRV|KC_NUBS/g, key => key === "KC_GRV" ? "KC_NUBS" : "KC_GRV") : stroke;
        // Generated typeable characters come from this same stroke table.
        result.typing = [...characters].map(/** @returns {import("../../contracts/model.js").MacroTypingRoute} */ character => layoutTypes(layout, character)
            ? {character, method: "layout", strokes: /** @type {string[]} */ (native?.strokes[character]).map(swapIso)}
            : {character, method: mode ? "unicode" : "unavailable", mode});
        // parsePayload above established that this input is text.
        const bytes = encodeMacroPayload(/** @type {string} */ (payload), {textEntry: enabled, layout, protection});
        result.bytes = bytes.length;
        const missing = [...characters].find(character => !layoutTypes(layout, character));
        if (missing && !mode) {
            result.error = `The ${hostLayout(layout)?.name || "chosen"} layout cannot type “${missing}”. ${ENTRY_SETUP[os] || ENTRY_SETUP[0]}`;
            result.code = "UNICODE_SETUP_REQUIRED";
        } else if (bytes.length > result.availableBytes) {
            result.error = `This macro needs ${bytes.length} bytes of macro memory; ${result.availableBytes} are available for this slot. Shorten it or clear another macro.`;
            result.code = "MACRO_BANK_FULL";
        }
    } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        result.code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "INVALID_MACRO";
    }
    return result;
}

// Stored macros use the same syntax and host setup as edits, without judging
// whether an existing slot fits the bank a second time.
/** @param {string} payload @param {{unicodeMode: number, layout: number, effective: number, macosIso?: boolean}} host */
function inspectMacroPlayback(payload, host) {
    const {error, code, typing} = inspectMacroInput(payload, {mode: host.unicodeMode, enabled: Boolean(host.unicodeMode),
        layout: host.layout, os: host.effective, macosIso: host.macosIso, bankFree: Infinity});
    return {error, code, typing};
}

module.exports = {inspectMacroInput, inspectMacroPlayback};
