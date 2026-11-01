// @ts-check
// Whether the draft will take a key expression, asked before it is posted.
//
// The picker reads an expression with the shared grammar's keyboard dialect,
// the one the draft stores by (rules/keycode-expression.mjs), over what the
// model publishes (the keycode catalog's values and aliases, QMK's other
// spellings, the keyboard's layer locks), and asks the shared layer placement
// rule (rules/layer-placement.mjs) where a layer key may go, so it never
// enables Use key for something the draft would refuse, and a typed
// expression reads as what it stores.
// tests/view/keycode-expression holds it to the draft, expression by
// expression.

/** @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model */

import {LAYERS} from "./layout.mjs";
import {QK, inBlock} from "../../rules/qmk-keycodes.mjs";
import {DIALECTS, encodeExpression, normalizeExpression} from "../../rules/keycode-expression.mjs";
import {PLACEMENT, layerRuleOf} from "../../rules/layer-placement.mjs";

// The keyboard's layer-lock block (LOCK_LAYER(n)), as core/data/
// user-keycodes.js has it: the interface may not import core, so
// tests/view/enum-drift.test.mjs pins this copy.
export const LAYER_LOCK_BASE = 0x7ec0, LAYER_LOCK_SLOTS = 16;
const LAYER_LOCK_BLOCK = Object.freeze({first: LAYER_LOCK_BASE, count: LAYER_LOCK_SLOTS});

// The catalogue's names, aliases and the keyboard's own keys, by name.
/** @type {WeakMap<object, Map<string, number>>} */
const NAMES = new WeakMap();
/** @param {Model} model */
function namesOf(model) {
    const entries = model?.qmkKeycodes || [];
    const known = NAMES.get(entries);
    if (known) return known;
    /** @type {Map<string, number>} */
    const names = new Map();
    for (const entry of entries) {
        names.set(entry.value, entry.keycode);
        if (entry.name) names.set(entry.name, entry.keycode);
    }
    for (const entry of entries) for (const alias of entry.aliases || []) if (!names.has(alias)) names.set(alias, entry.keycode);
    for (const [alias, canonical] of Object.entries(model?.qmkKeycodeAliases || {})) if (!names.has(alias) && names.has(canonical)) names.set(alias, /** @type {number} */ (names.get(canonical)));
    names.set("_______", names.get("KC_TRANSPARENT") ?? 1);
    names.set("XXXXXXX", names.get("KC_NO") ?? 0);
    NAMES.set(entries, names);
    return names;
}

// The keycode an expression stores, or undefined where the draft refuses it:
// the shared grammar's keyboard dialect, the one the draft stores by
// (rules/keycode-expression.mjs), over the names the model publishes.
/** @param {Model} model @param {unknown} expression @returns {number | undefined} */
export function keycodeValue(model, expression) {
    const names = namesOf(model);
    return encodeExpression(String(expression ?? ""), {
        names: (name) => names.get(name),
        ...(model?.qmkSpellings ? {spellings: model.qmkSpellings} : {}),
        layerLocks: LAYER_LOCK_BLOCK,
    }, DIALECTS.keyboard);
}

// What is wrong with a layout key expression, in words, or "" when the draft
// takes it. Layer keycodes are checked by the shared layer placement rule
// (rules/layer-placement.mjs), as the keyboard checks a saved profile: a layer
// it has, a layer lock of one it has, and never DF() or PDF().
/** @param {Model} model @param {string} expression */
export function keyProblem(model, expression) {
    const text = normalizeExpression(expression);
    if (!text) return "Choose a key.";
    const code = keycodeValue(model, text);
    if (code === undefined) return `${text} is not a key this keyboard can store.`;
    const layers = model?.layers?.length || LAYERS;
    if (inBlock(code, QK.DEF_LAYER) || inBlock(code, QK.PERSISTENT_DEF_LAYER)) return "DF() and PDF() change the default layer, which this keyboard keeps to itself. Use Move to, Hold or Lock.";
    const kind = layerRuleOf(code, layers, LAYER_LOCK_BLOCK)?.kind;
    if (kind === "unowned" || kind === "missing") return `This keyboard has ${layers} layers, numbered 0–${layers - 1}.`;
    return "";
}

// What is wrong with a combo output expression, or "" when the draft takes it:
// what a layout key takes, less KC_NO, which would send nothing, and Tap-hold
// (LT), which decides tap or hold on a key of its own and so is never a combo's
// output (rules/layer-placement.mjs, comboOutput).
/** @param {Model} model @param {string} expression */
export function comboOutputProblem(model, expression) {
    const problem = keyProblem(model, expression);
    if (problem) return problem;
    const code = /** @type {number} */ (keycodeValue(model, expression));
    if (code === 0) return "A combo has to send something. Choose a key.";
    const rule = layerRuleOf(code, model?.layers?.length || LAYERS);
    return rule && !rule.places.includes(PLACEMENT.COMBO_OUTPUT) ? "A combo can't send Tap-hold: it decides tap or hold on a key of its own. Send Hold or the key instead." : "";
}
