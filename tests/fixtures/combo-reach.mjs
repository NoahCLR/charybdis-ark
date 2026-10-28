// @ts-check
// A hand-built model as core would publish it for its stack: with each
// layer's combo reach (core/model/combo-reach.js) worked out over that stack,
// its combos and their Combo Layer Matching. The view tests read combos
// through these, as the interface reads them from the published model.
import {createRequire} from "node:module";

const {comboReach} = createRequire(import.meta.url)("../../core/model/combo-reach");

// Every other field reads through to the test's model, so a test that
// changes it after a call sees the change, as with a fresh model.
/** @type {WeakMap<object, Map<unknown, object>>} */
const published = new WeakMap();
/** @template {object | null | undefined} M @param {M} model @param {unknown} stack @returns {M} */
export function withComboReach(model, stack) {
    if (!model || !Array.isArray(stack) || "comboReach" in model) return model;
    let byStack = published.get(model);
    if (!byStack) published.set(model, byStack = new Map());
    if (!byStack.has(stack)) {
        const {combos = [], comboReferenceLayers = []} = /** @type {any} */ (model);
        const reach = comboReach(stack, combos, comboReferenceLayers);
        byStack.set(stack, new Proxy(model, {
            get: (target, key) => key === "comboReach" ? reach : Reflect.get(target, key),
            has: (target, key) => key === "comboReach" || Reflect.has(target, key),
        }));
    }
    return /** @type {M} */ (byStack.get(stack));
}

// Each view function that reads combos takes the model and the stack first.
/** @template {(model: any, stack: any, ...rest: any[]) => any} F @param {F} view @returns {F} */
export const publishedFor = (view) => /** @type {F} */ ((model, stack, ...rest) => view(withComboReach(model, stack), stack, ...rest));
