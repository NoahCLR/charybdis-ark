// @ts-check
// Published models are replaced, never mutated. Keep the latest payload for
// each slot and reading purpose on that model; editing does not retain an
// unbounded history, and a new model cannot reuse the core's old parsing options.
import {parseMacro} from "./macro.mjs";
import {vocabulary} from "./vocabulary.mjs";

/** @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model */
/** @typedef {'grid' | 'peek' | 'editor' | 'feedback'} Purpose */

/** @param {typeof parseMacro} [parse] */
export function createMacroReader(parse = parseMacro) {
    /** @type {WeakMap<object, Map<string, {payload: string, parsed: ReturnType<typeof parseMacro>}>>} */
    const models = new WeakMap();
    /** @param {Model} model @param {string} keycode @param {string} payload @param {Purpose} purpose */
    return (model, keycode, payload, purpose) => {
        const options = readingOptions(model, purpose);
        if (!model) return parse(payload, options);
        let slots = models.get(model);
        if (!slots) models.set(model, slots = new Map());
        const key = `${purpose}:${keycode}`, previous = slots.get(key);
        if (previous?.payload === payload) return previous.parsed;
        const parsed = parse(payload, options);
        slots.set(key, {payload, parsed});
        return parsed;
    };
}

/** @param {Model} model @param {Purpose} purpose @returns {import("./types.js").MacroOptions} */
function readingOptions(model, purpose) {
    if (purpose === "peek") return {};
    const problems = vocabulary(model).macroProblems;
    if (purpose === "editor") return {keys: model?.macroPayloadKeycodes, model, problems};
    return {problems, textEntry: Boolean(model?.macroUnicode?.mode),
        layoutChars: model?.macroUnicode?.layoutChars, modifierKeys: model?.macroPayloadModifierKeycodes,
        ...(purpose === "feedback" ? {keys: model?.macroPayloadKeycodes, model} : {})};
}

export const readMacro = createMacroReader();
