// The offline preview's read-only macro inspector runs the production codec.
// It answers inspection only; posted edits remain in window.__posted.
import {inspectMacroInput} from "../core/model/macro-input.js";

export function inspect(message, model) {
    const slot = model.viaMacros.find(slot => slot.keycode === message.keycode);
    return {...message, type: "macroValidation", validation: inspectMacroInput(message.payload, {
        unicode: model.macroUnicode.supported, mode: model.macroUnicode.mode, enabled: model.macroUnicode.enabled ?? Boolean(model.macroUnicode.mode),
        currentBytes: slot.bytes, bankFree: model.macroBank.free,
    })};
}
