// @ts-check
import {alwaysOnMask, answeringCandidate} from "../../rules/layer-answers.mjs";
/** @typedef {import("../../contracts/panel.js").Layer} Layer */
// The layers always on: base, and every default layer the keyboard keeps, as
// core publishes them on each layer (alwaysOn).
/** @param {readonly Layer[]} stack */
const layersAlwaysOn = (stack) => {
    const always = alwaysOnMask(stack);
    return stack.length ? stack.flatMap((_, index) => always & (1 << index) ? [index] : []) : [0];
};
// The layers on in the view the board shows: a layer shown alone is the view
// by itself; the layers always on join once layers are previewed with it.
/** @param {readonly Layer[]} stack @param {number} at @param {readonly number[]} held */
export const viewLayers = (stack, at, held) => held.length ? [...layersAlwaysOn(stack), at, ...held] : [at];

/**
 * What each key of this layer answers with under one activation.
 *
 * The firmware resolves a press by scanning the layers whose bit is set,
 * highest first, and taking the first that is not transparent. An inactive
 * layer is skipped entirely — it neither answers nor blocks — so `held` names
 * the layers on besides those always on and this one.
 */
export function resolvedPositions(/** @type {Layer[]} */ stack, /** @type {number} */ at, /** @type {number[]} */ held = []) {
    return answeredUnder(stack, at, [...layersAlwaysOn(stack), at, ...held]);
}

/**
 * What each key answers with in the view the board shows: only the layers on
 * in it. A layer shown alone is the view by itself, its transparent keys
 * answering nothing; the layers always on join once layers are previewed
 * together, as the layer bar shows base on (layer-set.mjs). This is what **On
 * this view** lists. The keyboard itself always has them on: what a
 * transparent key does when pressed, or shows through to, is resolvedPositions.
 */
export function viewPositions(/** @type {Layer[]} */ stack, /** @type {number} */ at, /** @type {number[]} */ held = []) {
    return answeredUnder(stack, at, viewLayers(stack, at, held));
}

/** @param {Layer[]} stack @param {number} at @param {number[]} on */
function answeredUnder(stack, at, on) {
    const active = on.reduce((mask, layer) => mask | (1 << layer), 0);
    const answeredKey = sourceKeys(stack, at);
    return (stack[at]?.positions || []).flatMap(position => {
        const answer = answeringCandidate(stack[at]?.answers?.[position.layoutIndex], active);
        const key = answer ? answeredKey(position.layoutIndex, answer.layer) : null;
        return key ? [key] : [];
    });
}

/**
 * Every answer this layer's keys can give, across every activation.
 *
 * For one key this is exactly the union of the layers below that are not
 * transparent at that position: holding {default, M, this} makes M answer, and
 * every answer is some such M. So the set is built directly rather than by
 * enumerating activations — they would produce the same thing. A key answered
 * by anything but the default layer only answers that way while that layer is
 * held too, which `whileHeld` records.
 *
 * Anything reached through a single key — a behaviour, and so the macros and
 * pointing modes its branches send — is exact here. Combos are not: their
 * inputs have to answer at the same time, under one activation, so core tries
 * the activations for them (comboReach, core/model/combo-reach.js).
 */
/** @param {Layer[]} stack @param {number} at */
export function reachablePositions(stack, at) {
    const answeredKey = sourceKeys(stack, at);
    return (stack[at]?.positions || []).flatMap(position =>
        (stack[at]?.answers?.[position.layoutIndex] || []).flatMap(answer => {
            const key = answeredKey(position.layoutIndex, answer.layer);
            return key ? [key] : [];
        }));
}

// Index each source once per resolution call. A Macros open asks for every
// layer; re-reading source positions once per key multiplies that work.
/** @param {Layer[]} stack @param {number} at */
function sourceKeys(stack, at) {
    /** @type {Map<number, Map<number, import("../../contracts/panel.js").Position>>} */
    const sources = new Map();
    const always = alwaysOnMask(stack);
    /** @param {number} layoutIndex @param {number} from */
    return (layoutIndex, from) => {
        const layer = stack[from];
        let positions = sources.get(from);
        if (!positions) {
            positions = new Map((layer?.positions || []).map(key => [key.layoutIndex, key]));
            sources.set(from, positions);
        }
        const position = positions.get(layoutIndex);
        return position ? {position, layer, fellThrough: from !== at, whileHeld: from !== at && !(always & (1 << from))} : null;
    };
}

// Reach lists read down the stack: what the default layer answers first, then
// what each layer you would have to hold adds. An entry answered by several
// layers sorts by the nearest one to the default, which is also the layer its
// row names first. Sorting is stable, so entries from one layer keep the order
// the board gave them.
/** @param {import("./keyface-types.js").SortableReach} entry */
const sourceRank = (entry) => Math.min(
    entry.layer ? entry.layer.index ?? 0 : Infinity,
    ...(entry.keys || []).filter((key) => key.fellThrough).map((key) => key.layer?.index ?? 0),
    ...(entry.behaviours || []).filter((row) => row.layer).map((row) => row.layer?.index ?? 0),
    ...(entry.combos || []).flatMap((route) => route.keys).filter((key) => key.fellThrough).map((key) => key.layer?.index ?? 0),
);
/** @template {import("./keyface-types.js").SortableReach} T @param {T[]} entries */
export const downTheStack = (entries) => [...entries].sort((one, other) => sourceRank(one) - sourceRank(other));
