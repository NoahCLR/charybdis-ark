// @ts-check
import {answeringCandidate} from "../../rules/layer-answers.mjs";
/** @typedef {import("../../contracts/panel.js").Layer} Layer */
// Every activation this layer can be the top of: layer 0 is always on, this
// layer is held, and any set of the layers between may be held alongside.
// Sixteen layers make up to 16,384 sets. Combo grouping excludes layers that
// cannot change an answer before enumerating them.
//
// Layer 0 stands in for the default layer. The keyboard can move that with
// NOAH_SETTING_DEFAULT_LAYERS and does not report it, but layer 0 is also what
// the firmware falls back to when nothing active answers, so the set of layers
// that can answer is right either way — only whether an answer needs a layer
// held would be misread, and only on a keyboard whose default has moved.
/** @param {number} at */
export function activations(at) {
    return activationSets(Array.from({length: Math.max(0, at - 1)}, (_, index) => index + 1));
}

/** @param {number[]} layers */
export function activationSets(layers) {
    /** @type {number[][]} */
    const sets = [[]];
    for (const layer of layers) {
        for (const held of [...sets]) sets.push([...held, layer]);
    }
    return sets;
}

/**
 * What each key of this layer answers with under one activation.
 *
 * The firmware resolves a press by scanning the layers whose bit is set,
 * highest first, and taking the first that is not transparent. An inactive
 * layer is skipped entirely — it neither answers nor blocks — so `held` names
 * the layers on besides layer 0 and this one.
 */
export function resolvedPositions(/** @type {Layer[]} */ stack, /** @type {number} */ at, /** @type {number[]} */ held = []) {
    return answeredUnder(stack, at, [0, at, ...held]);
}

/**
 * What each key answers with in the view the board shows: only the layers on
 * in it. A layer shown alone is the view by itself, its transparent keys
 * answering nothing; base joins once layers are previewed together, as the
 * layer bar shows it on (layer-set.mjs). This is what **On this view** lists.
 * The keyboard itself always has base on: what a transparent key does when
 * pressed, or shows through to, is resolvedPositions.
 */
export function viewPositions(/** @type {Layer[]} */ stack, /** @type {number} */ at, /** @type {number[]} */ held = []) {
    return answeredUnder(stack, at, held.length ? [0, at, ...held] : [at]);
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
 * inputs have to answer at the same time, under one activation, so they
 * enumerate instead.
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
    /** @param {number} layoutIndex @param {number} from */
    return (layoutIndex, from) => {
        const layer = stack[from];
        let positions = sources.get(from);
        if (!positions) {
            positions = new Map((layer?.positions || []).map(key => [key.layoutIndex, key]));
            sources.set(from, positions);
        }
        const position = positions.get(layoutIndex);
        return position ? {position, layer, fellThrough: from !== at, whileHeld: from !== at && from !== 0} : null;
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

// Only a transparent key on the top layer can change with a lower hold. A
// lower layer matters if it answers any such position, including KC_NO: that
// blocks an input below. Omitting every other layer preserves all answers and
// their smallest held sets, without enumerating duplicate views of the board.
/** @param {Layer[]} stack @param {number} at */
export function comboActivations(stack, at) {
    const relevant = new Set((stack[at]?.answers || []).flat()
        .filter(answer => answer.layer > 0 && answer.layer < at).map(answer => answer.layer));
    return activationSets([...relevant].sort((one, other) => one - other));
}
