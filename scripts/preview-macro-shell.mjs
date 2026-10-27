// @ts-check
// The offline preview's read-only macro inspector runs the production codec.
// It answers inspection only; posted edits remain in window.__posted.
import {inspectMacroInput} from "../core/model/macro-input.js";

/**
 * @param {Extract<import("../contracts/messages.js").PanelRequest, {type: "validateMacro"}>} message
 * @param {import("../contracts/panel.js").PublishedModel} model
 * @returns {Extract<import("../contracts/messages.js").PanelResponse, {type: "macroValidation"}>}
 */
export function inspect(message, model) {
    // The preview forwards only the macro editor's inspection requests: its
    // selected keycode belongs to the published macro bank.
    const slot = /** @type {import("../contracts/panel.js").MacroSlot} */ (model.macros.find(slot => slot.keycode === message.keycode));
    // The macro editor is available only after this fixture bank was read.
    const bank = /** @type {NonNullable<typeof model.macroBank>} */ (model.macroBank);
    return {...message, type: "macroValidation", validation: inspectMacroInput(message.payload, {
        mode: model.macroUnicode.mode, enabled: model.macroUnicode.enabled ?? Boolean(model.macroUnicode.mode),
        currentBytes: slot.bytes, bankFree: bank.free,
        layout: model.macroUnicode.layout, os: model.macroUnicode.os,
        protection: slot.protection,
    })};
}
