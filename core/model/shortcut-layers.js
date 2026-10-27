// @ts-check
"use strict";
// The layers a custom key's shortcut may turn on (firmware D-F26): any but
// the ones always on, the base layer and the default layers, which the
// keyboard refuses in a shortcut. The settings domain holds both the
// shortcuts and the default layers, so a change to either can make the other
// refused; one rule, here, for the editor (published in the model), for
// staging a shortcut, a settings change and a layer reorder.

const {SETTINGS, alwaysOnLayers} = require("../schema/settings-domain-v1");
const {layerName} = require("./vocabulary");

/** @typedef {Pick<import("../schema/types.js").SettingsDomain, "values" | "names">} ShortcutSettings */
/** @typedef {Pick<import("../schema/types.js").SettingsDomain, "values" | "names" | "customKeyShortcuts" | "customKeyNames">} ShortcutKeys */

/** @param {number} mask */
const layerList = mask => Array.from({length: SETTINGS.LAYERS}, (_, layer) => layer).filter(layer => mask & (1 << layer));

// Which kind of layer a shortcut cannot name: the base layer, a default
// layer, or "" for neither.
/** @param {ShortcutSettings} settings @param {number} layer @returns {"base" | "default" | ""} */
const alwaysOnKind = (settings, layer) => layer === 0 ? "base" : alwaysOnLayers(settings.values) & (1 << layer) ? "default" : "";

// Why a shortcut cannot turn `layer` on, in words; "" when it can.
/** @param {ShortcutSettings} settings @param {number} layer */
function shortcutLayerReason(settings, layer) {
    const kind = alwaysOnKind(settings, layer), name = layerName(settings.names, layer);
    return kind ? `${name} is ${kind === "base" ? "the base layer" : "a default layer"}: it is always on, so a shortcut cannot turn it on.` : "";
}

// Every layer as a shortcut's layer: why it cannot be one ("" when it can)
// and which kind of layer that makes it.
/** @param {ShortcutSettings} settings */
const shortcutLayerTargets = settings => Array.from({length: SETTINGS.LAYERS}, (_, layer) => ({layer, refusal: shortcutLayerReason(settings, layer), alwaysOn: alwaysOnKind(settings, layer)}));

// Why a shortcut cannot be staged for a custom key, in words; "" when it can.
/** @param {ShortcutSettings} settings @param {{layers: number}} shortcut */
function shortcutRefusal(settings, shortcut) {
    for (const layer of layerList(shortcut.layers)) {
        const reason = shortcutLayerReason(settings, layer);
        if (reason) return reason;
    }
    return "";
}

/** @param {ShortcutKeys} settings @param {number} slot */
const keyWords = (settings, slot) => `Custom key ${slot}${settings.customKeyNames[slot] ? ` (${settings.customKeyNames[slot]})` : ""}`;

// The first custom key whose shortcut names a layer that is always on in
// `settings`, with that layer; undefined when none does.
/** @param {ShortcutKeys} settings */
function alwaysOnShortcut(settings) {
    for (const [slot, shortcut] of settings.customKeyShortcuts.entries()) {
        const [layer] = layerList(shortcut.layers & alwaysOnLayers(settings.values));
        if (layer !== undefined) return {slot, layer};
    }
    return undefined;
}

// Why a settings change cannot be staged, in words; "" when it can: it would
// make a layer some shortcut turns on a default layer, which the keyboard
// refuses.
/** @param {ShortcutKeys} after */
function settingsShortcutRefusal(after) {
    const found = alwaysOnShortcut(after);
    return found ? `${layerName(after.names, found.layer)} is turned on by ${keyWords(after, found.slot)}'s shortcut, and a shortcut cannot turn on a default layer, which is always on. Take it out of the shortcut first.` : "";
}

// Why a layer reorder cannot be made, in words; "" when it can. A reorder
// renumbers a shortcut's layers as it renumbers layer keys
// (portable-profile.js), so a shortcut keeps turning on the layers it did;
// with keys keeping their numbers, though, one could land on the base or a
// default layer, or two of its layers on one (Make base: the old base's slot
// and the new base's both reach it), which would merge them. `moved`
// renumbers a mask from before the move to after it.
/** @param {ShortcutKeys} before @param {ShortcutKeys} after @param {(mask: number) => number} moved @param {boolean} keysFollow */
function reorderShortcutRefusal(before, after, moved, keysFollow) {
    const instead = keysFollow ? "Change the shortcut first." : "Turn on Keys follow their layers, or change the shortcut first.";
    for (const [slot, shortcut] of before.customKeyShortcuts.entries()) {
        const layers = layerList(shortcut.layers);
        const landed = layers.map((layer) => layerList(moved(1 << layer))[0]);
        const at = landed.findIndex((target, i) => landed.indexOf(target) !== i);
        if (at < 0) continue;
        const first = layers[landed.indexOf(landed[at])];
        return `This move would have ${keyWords(after, slot)}'s shortcut turn on ${layerName(before.names, first)} and ${layerName(before.names, layers[at])} as one layer, ${layerName(after.names, landed[at])}. ${instead}`;
    }
    const found = alwaysOnShortcut(after);
    if (!found) return "";
    const what = found.layer === 0 ? "the base layer, always on" : "which would be a default layer, always on";
    return `This move would have ${keyWords(after, found.slot)}'s shortcut turn on ${layerName(after.names, found.layer)}, ${what}. ${instead}`;
}

module.exports = {shortcutLayerReason, shortcutLayerTargets, shortcutRefusal, settingsShortcutRefusal, reorderShortcutRefusal};
