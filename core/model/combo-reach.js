// @ts-check
"use strict";

// Which combos fire from each layer (D-L73): published per layer so the
// interface reads it rather than enumerating every hold itself.
//
// A combo needs every input present at the same time, under one activation.
// Its inputs could each be reachable under some hold and still never be
// reachable together: one answered only while Numbers is held, another only
// while it is not. So every activation a layer can top is tried, and the combo
// fires if any single one carries all of its inputs, preferring the one that
// holds the fewest extra layers, because that is the easiest way to press it.
// Under Combo Layer Matching the keyboard matches the reference layer's raw
// keycodes (process_combo.c: keymap_key_to_keycode on ref_layer, no
// transparency), so there is exactly one way to press it.
//
// It reads what the model publishes (each layer's keys and compiled answers,
// the combos, each layer's combo reference and whether it is always on) and
// names keys by layer and layout index; webview/view/combo-reach.mjs turns
// them back into the keys it draws. Which keys press a combo's inputs is the
// shared rule in rules/combo-inputs.mjs.

const {alwaysOnMask, answeringCandidate} = require("../../rules/layer-answers.mjs");
const {comboKeysAmong, comboTouches, inputPressed} = require("../../rules/combo-inputs.mjs");

/** @typedef {import("../../contracts/panel.js").Layer} Layer */
/** @typedef {import("../../contracts/panel.js").Position} Position */
/** @typedef {import("../../rules/combo-inputs.mjs").ComboInputs} ComboInputs */
/** @typedef {import("../../contracts/panel.js").ComboReachKey} ComboReachKey */
/** @typedef {import("../../contracts/panel.js").ComboReach} ComboReach */

// The sets of `count` layers, as masks of their places in a list, smallest
// first, and among sets of one size by mask: the order in which a smaller
// hold is found before a larger one, and of two the same size, the one
// holding lower layers.
/** @param {number} count @returns {Generator<number>} */
function* bySize(count) {
    yield 0;
    for (let size = 1; size <= count; size++) {
        // Gosper's hack: the next larger mask with as many bits.
        for (let bits = (1 << size) - 1; bits < 1 << count;) {
            yield bits;
            const low = bits & -bits, carried = bits + low;
            bits = (((carried ^ bits) >>> 2) / low) | carried;
        }
    }
}

/**
 * Per layer, per combo in the model's order: whether it fires from that
 * layer, and on which keys under the smallest hold that fires it, or the hold
 * that covers the most of its inputs when none does.
 *
 * Only a transparent key on the layer lets a lower layer answer, and holding a
 * lower layer only matters to a combo when one of that layer's keys presses
 * one of its inputs: holding any other layer can only hide an input, never
 * add one. So each combo tries the holds of just those layers, below the
 * layer and not always on. A hold is a mask of their places in that list,
 * and the answer is the one trying every mask in turn would give: the
 * smallest hold that fires it, the lowest mask of that size; or, when none
 * does, the lowest mask covering the most inputs. Each set of answers its
 * keys can give has one smallest hold, the layers those answers need, so
 * either those sets or the holds are tried, whichever are fewer. Holds are
 * tried smallest first, so the first that fires is the answer; a combo whose
 * keys cannot press every input stops at the first hold that covers as many
 * as they can.
 * @param {readonly Layer[]} stack @param {readonly ComboInputs[]} combos @param {readonly number[]} references @returns {ComboReach[][]}
 */
function comboReach(stack, combos, references) {
    if (!combos.length) return stack.map(() => []);
    const always = alwaysOnMask(stack);
    const byIndex = stack.map((layer) => new Map((layer?.positions || []).map((position) => [position.layoutIndex, position])));
    /** @param {number} layer @param {number} layoutIndex */
    const positionAt = (layer, layoutIndex) => byIndex[layer]?.get(layoutIndex);
    // The keys among these that press the combo's inputs, as the rule finds
    // them among the keys they name.
    /** @param {ComboReachKey[]} keys @param {ComboInputs} combo */
    const among = (keys, combo) => {
        const named = new Map(keys.map((key) => [/** @type {Position} */ (positionAt(key.layer, key.layoutIndex)), key]));
        const found = comboKeysAmong([...named.keys()], combo);
        return {...found, keys: found.keys.map((position) => /** @type {ComboReachKey} */ (named.get(position)))};
    };
    return stack.map((_, at) => {
        const reference = references[at] ?? at;
        if (reference !== at && stack[reference]) {
            const keys = (stack[reference].positions || []).map((position) =>
                ({layer: reference, layoutIndex: position.layoutIndex, fellThrough: false, whileHeld: false, reference: true}));
            return combos.map((combo) => {
                const found = among(keys, combo);
                return {fires: found.forms, covered: found.covered, keys: found.keys, held: []};
            });
        }
        // Each key of the layer with the layers that may answer it, highest
        // first, and the key each of them stores there, if any.
        const candidates = (stack[at]?.positions || []).map((position) => (stack[at]?.answers?.[position.layoutIndex] || [])
            .map((answer) => ({answer, key: positionAt(answer.layer, position.layoutIndex)})));
        /** @param {ComboInputs} combo @param {Position | undefined} key */
        const touches = (combo, key) => key !== undefined && comboTouches(combo, key);
        return combos.map((combo) => {
            const touching = candidates.filter((keys) => keys.some(({key}) => touches(combo, key)));
            const relevant = [...new Set(touching.flatMap((keys) => keys.filter(({answer, key}) =>
                answer.layer < at && !(always & (1 << answer.layer)) && touches(combo, key)).map(({answer}) => answer.layer)))].sort((one, other) => one - other);
            /** @param {number} bits @param {ComboReachKey[]} keys */
            const outcome = (bits, keys) => ({bits, held: relevant.filter((_, place) => bits & (1 << place)), ...among(keys, combo)});
            /** @param {number} layer @param {number} layoutIndex @returns {ComboReachKey} */
            const answered = (layer, layoutIndex) => ({layer, layoutIndex, fellThrough: layer !== at, whileHeld: layer !== at && !(always & (1 << layer))});
            /** @param {number} bits */
            const tried = (bits) => {
                const active = relevant.reduce((mask, layer, place) => bits & (1 << place) ? mask | (1 << layer) : mask, always | (1 << at));
                return outcome(bits, touching.flatMap((keys) => {
                    const answer = answeringCandidate(keys.map((candidate) => candidate.answer), active);
                    const key = answer && keys.find((candidate) => candidate.answer === answer)?.key;
                    return answer && key ? [answered(answer.layer, key.layoutIndex)] : [];
                }));
            };
            // What each key can answer with, and the hold that gives it: a
            // layer held for its answer (`needs`), with the held layers above
            // it left off (`off`), as masks of their places in `relevant`. An
            // answer always on ends the list, as nothing below it answers;
            // with none, the key may answer nothing at all.
            const choices = touching.map((keys) => {
                /** @type {{needs: number, off: number, key: ComboReachKey | null}[]} */
                const options = [];
                let above = 0;
                for (const {answer, key} of keys) {
                    const on = answer.layer === at || Boolean(always & (1 << answer.layer));
                    const place = relevant.indexOf(answer.layer);
                    if (!on && place < 0) continue;
                    options.push({needs: on ? 0 : 1 << place, off: above, key: key ? answered(answer.layer, key.layoutIndex) : null});
                    if (on) return options;
                    above |= 1 << place;
                }
                options.push({needs: 0, off: above, key: null});
                return options;
            });
            // The smallest hold that fires it, the lowest of that size, and
            // the lowest hold covering the most inputs.
            /** @type {{fires: ReturnType<typeof outcome> | null, most: ReturnType<typeof outcome> | null}} */
            const best = {fires: null, most: null};
            /** @param {ReturnType<typeof outcome>} found */
            const weigh = (found) => {
                const {fires, most} = best, size = found.held.length;
                if (found.forms && (!fires || size < fires.held.length || (size === fires.held.length && found.bits < fires.bits))) best.fires = found;
                if (!most || found.covered > most.covered || (found.covered === most.covered && found.bits < most.bits)) best.most = found;
            };
            // Every hold gives one answer per key, and the smallest hold that
            // gives a set of answers is the layers those answers need. So
            // either the sets of answers or the holds can be tried, whichever
            // are fewer: holds of many layers over few keys, or many keys
            // with few layers to hold.
            const sets = choices.reduce((count, options) => Math.min(count * options.length, Number.MAX_SAFE_INTEGER), 1);
            if (sets < 1 << relevant.length) {
                /** @param {number} at @param {number} needs @param {number} off @param {ComboReachKey[]} keys */
                const walk = (at, needs, off, keys) => {
                    if (needs & off) return;
                    if (at === choices.length) return weigh(outcome(needs, keys));
                    for (const option of choices[at]) walk(at + 1, needs | option.needs, off | option.off, option.key ? [...keys, option.key] : keys);
                };
                walk(0, 0, 0, []);
            } else {
                // As many inputs as any of its keys press: no hold covers more.
                const reachable = new Set(touching.flatMap((keys) => keys.flatMap(({key}) => key && comboTouches(combo, key) ? [inputPressed(combo, key)] : []))).size;
                if (reachable >= (combo.inputs || []).length) {
                    for (const bits of bySize(relevant.length)) {
                        const found = tried(bits);
                        if (found.forms) { best.fires = found; break; }
                        weigh(found);
                    }
                } else {
                    for (let bits = 0; bits < 1 << relevant.length; bits++) {
                        weigh(tried(bits));
                        if ((best.most?.covered ?? 0) >= reachable) break;
                    }
                }
            }
            const {fires, most} = best;
            return fires ? {fires: true, covered: fires.covered, keys: fires.keys, held: fires.held}
                : {fires: false, covered: most?.covered || 0, keys: most?.keys || [], held: []};
        });
    });
}

// Each publish rebuilds the model, but what this reads changes only with an
// edit to keys, combos, their matching or the default layers, so the last few
// answers are kept by exactly what they read.
/** @type {Map<string, ComboReach[][]>} */
const recent = new Map();
/** @param {readonly Layer[]} stack @param {readonly ComboInputs[]} combos @param {readonly number[]} references */
function publishedComboReach(stack, combos, references) {
    const key = JSON.stringify([stack.map((layer) => [(layer.positions || []).map((position) => [position.layoutIndex, position.keycode, position.semantic]), layer.answers, Boolean(layer.alwaysOn)]),
        combos.map((combo) => [combo.inputs, combo.inputPositions]), references]);
    const known = recent.get(key);
    if (known) return known;
    const reach = comboReach(stack, combos, references);
    recent.set(key, reach);
    if (recent.size > 8) recent.delete(/** @type {string} */ (recent.keys().next().value));
    return reach;
}

module.exports = {comboReach, publishedComboReach};
