// @ts-check
// The offline preview's read-only inspectors run the production rules: a
// macro's steps through the codec, and a text replacement edit through the
// list's own rules. They answer inspection only; posted edits remain in
// window.__posted.
import {inspectMacroInput} from "../core/model/macro-input.js";
import {changeList, listEditNames} from "../core/model/autocorrect-editor.js";
import {inputOf, listWarnings} from "../core/model/autocorrect-list.js";
import {US_HOST_LAYOUT} from "../core/data/host-layouts.js";

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

// What the published list would make of an edit, as the core's check answers
// it: its refusal in words, the warnings it would newly bring, and the entry
// its replacement is. The list is rebuilt from what the model publishes, so
// the Text replacement screen can be driven here: it posts an edit only once
// this check has passed. An import is not judged here; nothing asks it to be.
/**
 * @param {Extract<import("../contracts/messages.js").PanelRequest, {type: "validateAutocorrect"}> & Partial<import("../contracts/edits.js").DraftIdentity>} message
 * @param {import("../contracts/panel.js").PublishedModel} model
 * @returns {Extract<import("../contracts/messages.js").PanelResponse, {type: "autocorrectValidation"}>}
 */
export function inspectAutocorrect(message, model) {
    const published = model.autocorrect?.entries || [];
    const list = () => ({entries: published.map(entry => ({correction: entry.correction, ...(entry.macro === undefined ? {} : {macro: entry.macro}), typos: entry.typos.map(typo => inputOf(typo.input))}))});
    const macroNames = model.macros.map(macro => macro.name);
    const host = {layout: model.macroUnicode.layout ?? US_HOST_LAYOUT, layoutName: model.autocorrect?.layoutName, macroNames, emptyMacros: new Set(model.macros.flatMap((macro, slot) => macro.empty ? [slot] : []))};
    /** @type {import("../contracts/messages.js").AutocorrectValidation} */
    let validation;
    /** @type {Pick<import("../contracts/messages.js").AutocorrectValidation, "entry" | "label" | "listed" | "listedSaid">} */
    let named = {};
    try {
        const {entry, label, listed, listedSaid, joins, unfinished} = listEditNames(list(), macroNames, message.edit);
        named = entry === undefined ? {} : {entry, label, listed: Boolean(listed), ...(listedSaid ? {listedSaid} : {})};
        const before = list(), after = list();
        if (!unfinished && message.edit.type !== "importAutocorrect") changeList(after, message.edit, host, {maxCorrections: Infinity, maxTypos: Infinity, maxTextBytes: Infinity, capacity: Infinity, sharedFree: Infinity});
        const had = new Set(listWarnings(before, host).map(warning => warning.text));
        validation = {error: "", code: "", warnings: [...(joins ? [joins] : []), ...listWarnings(after, host).filter(warning => !had.has(warning.text)).map(warning => warning.text)],
            ...named};
    } catch (error) {
        validation = {error: error instanceof Error ? error.message : String(error), code: "AUTOCORRECT_EDIT_REFUSED", warnings: [], ...named};
    }
    return {type: "autocorrectValidation", requestId: message.requestId, draftId: message.draftId, draftRevision: message.draftRevision, validation};
}
