// @ts-check
// A branch or combo action read as the thing the person set up that it acts
// on — a pointing mode, a layer or a macro — for the names keyface gives keys.
import {actionLabel, layerFormOf, layerModsOf, layerOfKeycode, layerTapOf} from "./keyface.mjs";
import {keyIdentity} from "./key-identity.mjs";
import {layerCalledAt, macroNamed, slotNamed, vocabulary} from "./vocabulary.mjs";
/** @typedef {import("./keyface-types.js").ViewModel} ViewModel */

// A branch or combo action read as the pointing mode it sends: the slot, the
// name it goes by, and whether the key holds the mode or locks it on. Null
// for any other action. An empty slot keeps its keycodes, so it still
// resolves, marked empty.
/** @param {ViewModel} model @param {string} action */
export function pointingAction(model, action) {
    const {pointing: slot, variant} = keyIdentity(model, action);
    if (!slot) return null;
    return {
        slot,
        name: slotNamed(slot),
        how: variant,
        empty: !slot.kind,
    };
}

// A branch or combo action read as the macro it plays: the slot and the name
// it was given, or its number when it has none. Null for anything but a
// macro's keycode.
/** @param {ViewModel} model @param {string} action */
export function macroAction(model, action) {
    const keycode = keyIdentity(model, action).macro;
    if (!keycode) return null;
    const slot = (model?.macros || []).find((row) => row.keycode === keycode);
    return {slot, keycode, name: macroNamed(slot, keycode), empty: Boolean(slot?.empty)};
}

// A branch or combo action read as the layer it acts on: the layer, the name
// it goes by, and what the action does to it, by what core says the key does
// to its layer (qmkKeyLayerForms), in the words its name reads by ("Hold",
// "Lock"; vocabulary.layerKeyVerbs). A layer-mod holds its layer with
// modifiers, so it reads by them, as its name ends ("+ Shift"; core's
// qmkKeyLayerMods). Null for any other action, for a layer-tap, which is a
// tap and a layer at once, and for a layer the model has not.
/** @param {ViewModel} model @param {string} action */
function layerAction(model, action) {
    const at = layerOfKeycode(model, action), form = layerFormOf(model, action);
    const name = at === null ? "" : layerCalledAt(model, at);
    if (at === null || !form || form === "LT" || !name) return null;
    if (form !== "LM") return {layer: at, name, how: vocabulary(model).layerKeyVerbs[form] ?? ""};
    const mods = layerModsOf(model, action);
    return {layer: at, name, how: mods ? `+ ${mods}` : ""};
}

// A layer-tap read as its two halves, as core names it ("/ / Navigation"):
// the key it taps (qmkKeyLayerTaps) and the layer its hold turns on, by the
// name it goes by, so a screen marks the layer without cutting the name.
// Null for any other key, for a layer the model has not, and for a name core
// does not give it in these two halves.
/** @param {ViewModel} model @param {string} action @returns {{tap: string, layer: number, name: string} | null} */
export function layerTapAction(model, action) {
    const at = layerOfKeycode(model, action), tap = layerTapOf(model, action);
    const name = at === null ? "" : layerCalledAt(model, at);
    if (at === null || layerFormOf(model, action) !== "LT" || tap === undefined || !name || actionLabel(model, action) !== `${tap} / ${name}`) return null;
    return {tap, layer: at, name};
}

// An action that names something the person set up — a layer, a pointing mode
// or a macro — as that thing: what kind it is, its name, and the tags that
// qualify it. Null for a plain keycode, which reads as itself.
/** @param {ViewModel} model @param {string} action @returns {import("./keyface-types.js").NamedAction | null} */
export function namedAction(model, action) {
    const pd = pointingAction(model, action);
    if (pd) return {kind: "pointing", word: "pointing mode", name: pd.name, slot: pd.slot, tags: [pd.how, ...(pd.empty ? ["empty"] : [])]};
    const layer = layerAction(model, action);
    if (layer) return {kind: "layer", word: "layer", name: layer.name, layer: layer.layer, tags: layer.how ? [layer.how] : []};
    const macro = macroAction(model, action);
    if (macro) return {kind: "macro", word: "macro", name: macro.name, slot: macro.slot, tags: macro.empty ? ["empty"] : []};
    return null;
}
