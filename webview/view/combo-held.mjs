// @ts-check
// Combo feedback previews one combo held on the board. A combo is layer
// dependent and is pressed from particular keys, so what is held comes from
// the Keymap's own answer, never a match of keycodes here: the combos the
// Combos tab lists as firing in this view (tabReach(view, "combos"), from
// core's comboReach) and the keys it rings for one (keysFor). A combo pressed
// from more than one key for an input (two Backspace keys) is held on one of
// them for each input: the first, unless another was picked, since its
// feedback follows the keys actually pressed. Unpicked, it is held from the
// half its other inputs are on, as a hand presses it, which keeps a combo of
// one thumb cluster from spanning both halves.

import {tabReach} from "./tab-reach.mjs";
import {reachRowId} from "./reach-groups.mjs";
import {inputPressed} from "../../rules/combo-inputs.mjs";
import {isRightHalf} from "./geometry.mjs";
import {layerView} from "./layer-view.mjs";
import {toggleLayer} from "./layer-set.mjs";

/** @typedef {import("./keyface-types.js").LayerView} LayerView */
/** @typedef {import("./keyface-types.js").ComboReachEntry} ComboReachEntry */
/** @typedef {import("../../contracts/panel.js").ComboView} ComboView */
/** @typedef {import("./types.js").LightOptions["comboActive"]} ComboActive */

// Whether holding a combo holds layers, whose own light then shows the hold
// in place of combo feedback: core publishes the layers per combo
// (holdsLayers, from layer-effects.js comboHeldShows).
/** @param {ComboView} combo */
export const holdsLayers = (combo) => (combo.holdsLayers || []).length > 0;

// The combos that fire in the view the board shows, as the Combos tab's "On
// this view" group lists them, so they follow the layer picked and the layers
// previewed under it: those lighting combo feedback first, then those
// holding a layer, each in the tab's order.
/** @param {LayerView} view @returns {ComboReachEntry[]} */
export function combosHere(view) {
    const entries = tabReach(view, "combos").groups.find((group) => group.id === "view")?.entries || [];
    return [...entries.filter((entry) => !holdsLayers(entry.combo)), ...entries.filter((entry) => holdsLayers(entry.combo))];
}

/**
 * The combo held on the board: the one picked if it fires here, else the
 * first that does; null when none does.
 *   ring     every key that presses it here, as the Keymap rings it
 *   held     the key holding each input: the picked one where it presses that
 *            input, else one on the half its other inputs are on, else the first
 *   choice   whether some input is pressed by more than one key
 *   holds    the layers its output holds, by index: with any, it shows no
 *            combo light, since their own light shows the hold
 *   pointing the pointing slot its output runs, held or locked, null when
 *            none: the mode runs, and the combo paints beneath it
 *   active   what the board paints for it, null when it holds layers or the
 *            stage has no feedback
 * @param {LayerView} view @param {{id: number, keys: number[]} | null | undefined} picked
 */
export function comboHeld(view, picked) {
    const here = combosHere(view);
    const entry = here.find((row) => row.combo.id === picked?.id) || here[0];
    if (!entry) return null;
    const combo = entry.combo;
    const ring = tabReach(view, "combos").keysFor(reachRowId("view", entry.name));
    /** @type {Map<string, number[]>} */
    const byInput = new Map();
    for (const key of entry.keys) {
        const input = inputPressed(combo, key.position);
        byInput.set(input, [...(byInput.get(input) || []), key.position.layoutIndex]);
    }
    const chosen = picked?.id === combo.id ? picked.keys : [];
    const sure = [...byInput.values()].filter((keys) => keys.length === 1).map(([key]) => isRightHalf(key));
    const right = sure.filter(Boolean).length > sure.length / 2;
    const held = [...byInput.values()].map((keys) => keys.find((key) => chosen.includes(key))
        ?? (sure.length ? keys.find((key) => isRightHalf(key) === right) : undefined) ?? keys[0]);
    const holds = combo.holdsLayers || [];
    const pointing = combo.runsPointing ?? null;
    const feedback = view.model?.rgb?.comboFeedback;
    /** @type {ComboActive} */
    const active = holds.length || !feedback ? null
        : {color: feedback.color, locality: feedback.locality, inputs: held, beneath: pointing !== null};
    return {combo, ring, held, choice: [...byInput.values()].some((keys) => keys.length > 1), holds, pointing, active};
}

// What the board shows while a combo is held: one that holds layers turns
// each on over the view, as turning it on in the layer strip does
// (layer-set.mjs), and their own light then shows the hold.
/** @param {LayerView} view @param {ReturnType<typeof comboHeld>} held @returns {LayerView} */
export function viewWhileHeld(view, held) {
    let top = view.at, on = view.held;
    for (const layer of held?.holds || []) {
        if (layer === top || on.includes(layer)) continue;
        ({top, on} = toggleLayer(top, on, layer));
    }
    return top === view.at && on === view.held ? view : layerView(view.model, top, on);
}

// The keys a combo is held on once the key at `layoutIndex` holds its input
// instead, or null when that key presses none of its inputs here.
/** @param {LayerView} view @param {{id: number, keys: number[]} | null | undefined} picked @param {number} layoutIndex @returns {{id: number, keys: number[]} | null} */
export function holdComboFrom(view, picked, layoutIndex) {
    const now = comboHeld(view, picked);
    if (!now || !now.ring.includes(layoutIndex)) return null;
    const entry = combosHere(view).find((row) => row.combo.id === now.combo.id);
    const pressed = entry?.keys.find((key) => key.position.layoutIndex === layoutIndex);
    if (!entry || !pressed) return null;
    const input = inputPressed(now.combo, pressed.position);
    const others = now.held.filter((key) => {
        const position = entry.keys.find((each) => each.position.layoutIndex === key)?.position;
        return !position || inputPressed(now.combo, position) !== input;
    });
    return {id: now.combo.id, keys: [...others, layoutIndex]};
}
