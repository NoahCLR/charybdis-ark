// @ts-check
// Key edits made from the board: picking a keycode for a position and
// swapping two keys by dragging one onto the other.

import {keyMeaning, keyName} from "../../view/keyface.mjs";
import {currentLayer, getModel, layerName, positionAt, post, state, writable} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";
import {openPicker} from "../picker.mjs";

// The picker for a key on the board. `hold` opens it with the Hold slot's
// menu open: the Key tab's "Add a hold…" (decisions R7).
/** @param {number} layoutIndex @param {{hold?: boolean}} [options] */
export function pickKeycodeFor(layoutIndex, {hold = false} = {}) {
    if (!writable()) return;
    const layer = currentLayer();
    if (!layer) return;
    const position = positionAt(layer, layoutIndex);
    state.selected = layoutIndex;
    openPicker({
        title: `Keycode on ${layerName(layer)}`,
        heading: `Change ${position ? keyName(position) : "this key"} on ${layerName(layer)}`,
        contextKeycode: position ? keyMeaning(position) : undefined,
        seed: position ? [keyMeaning(position)] : [],
        target: {layer: layer.name, layoutIndex, current: position ? keyMeaning(position) : undefined},
        hold,
        onPick: (expression) => {
            post(edits.setKey(layer.name, layoutIndex, expression));
        },
        // A hold built in the picker is one draft edit of its own.
        onEdit: (message) => post(message),
        // Modifiers from both sides, or modifiers alone: an unused custom key
        // gets them as its shortcut and goes here, in one draft step (D-L63).
        onCustomKey: (keycode, shortcut, name) => {
            post(edits.customKeyForShortcut(keycode, shortcut, name, edits.setKey(layer.name, layoutIndex, keycode), getModel()?.customKeyEditing?.identity));
        },
    });
}

/** @param {number} from @param {number} to */
export function swapKeys(from, to) {
    const layer = currentLayer();
    if (!layer) return;
    const a = positionAt(layer, from), b = positionAt(layer, to);
    if (!a || !b) return;
    state.selected = to;
    post(edits.swapKeys(layer.name, a, b));
}
