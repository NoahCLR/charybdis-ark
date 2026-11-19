// @ts-check
// Key edits made from the board: picking a keycode for a position and
// swapping two keys by dragging one onto the other, on this layer or from
// another one the drag came from.

import {keyMeaning} from "../../view/keyface.mjs";
import {sameKey} from "../../view/key-identity.mjs";
import {currentLayer, getModel, layers, positionAt, post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {layerCalled} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {openPicker} from "../picker.mjs";

/** @param {number} layoutIndex */
export function pickKeycodeFor(layoutIndex) {
    if (!editGate(getModel(), "keys").editable) return;
    const layer = currentLayer();
    if (!layer) return;
    const position = positionAt(layer, layoutIndex);
    state.selected = layoutIndex;
    openPicker({
        // Named as the board names the key, never by its layout index.
        title: `Key on ${layerCalled(layer)}`,
        contextKeycode: position ? keyMeaning(position) : undefined,
        onLayer: layer.index,
        seed: position ? [keyMeaning(position)] : [],
        layoutKey: true,
        onPick: (expression) => {
            post(edits.setKey(layer.name, layoutIndex, expression));
        },
        // Modifiers from both sides, or modifiers alone: an unused custom key
        // gets them as its shortcut and goes here, in one draft step (D-L63).
        onCustomKey: (keycode, shortcut, name) => {
            post(edits.customKeyForShortcut(keycode, shortcut, name, edits.setKey(layer.name, layoutIndex, keycode), getModel()?.customKeyEditing?.identity));
        },
    });
}

// Two keys that store the same thing have nothing to trade, so a drag
// between them posts nothing and leaves no undo step.
/** @param {number} from @param {number} to @param {number} fromLayer the layer `from` is on; `to` is on the layer shown */
export function swapKeys(from, to, fromLayer) {
    const layer = currentLayer(), source = layers()[fromLayer];
    if (!layer || !source) return;
    const a = positionAt(source, from), b = positionAt(layer, to);
    if (!a || !b) return;
    state.selected = to;
    if (sameKey(getModel(), a.keycode, b.keycode)) { render(); return; }
    post(edits.swapKeys(placed(source, a), placed(layer, b)));
}

// A key as a swap names it: its layer, its place and what it stores.
/** @param {import("../../../contracts/panel.js").Layer} layer @param {import("../../../contracts/panel.js").Position} position @returns {import("../../view/edits.mjs").PlacedKey} */
const placed = (layer, {layoutIndex, keycode}) => ({layer: layer.name, layoutIndex, keycode});
