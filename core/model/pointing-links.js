// @ts-check
"use strict";
// A pointing slot's link (firmware D-F62): which layers may start a slot's
// mode or be turned on by its key, and why not. The pointing domain refuses a
// layer that starts two modes; the layers keys turn on may repeat. The
// keyboard ignores the pointer layer and the default layers in a link, which
// its domain cannot see, so Ark refuses those in the editor (published in the
// model) and when a changed link is staged. One rule, here, for both.

const {PD_LINK_ENDS, PD_LINK_LAYERS} = require("../schema/pd-mode-domain-v1");
const {SETTING, SETTINGS} = require("../schema/settings-domain-v1");
const {layerName, slotName} = require("./vocabulary");
const {ALL_LAYERS, layersAbove, layersOfMask: layersOf} = require("../data/charybdis-layout");

/** @typedef {{id: number, kind: number, name: string, linkedLayers?: number, linkTurnsOn?: number, linkEnds?: number, pointerLayer?: number}} LinkSlot */
/** @typedef {Pick<import("../schema/types.js").SettingsDomain, "values" | "names">} LinkSettings */

// Every layer a slot's link names: the layers that start it and those its key turns on.
/** @param {Partial<LinkSlot>} slot */
const linkNamed = slot => ((slot.linkedLayers ?? 0) | (slot.linkTurnsOn ?? 0)) >>> 0;
// The slot other than `id` whose mode `layer` starts, if one is.
/** @param {readonly LinkSlot[]} slots @param {number} layer @param {number} [id] */
const startedBy = (slots, layer, id) => slots.find(slot => slot.id !== id && slot.kind && (slot.linkedLayers ?? 0) & (1 << layer));

// Which kind of layer the keyboard ignores in a link: a default layer, the
// pointer layer, or "" for neither.
/** @param {LinkSettings} settings @param {number} layer @returns {"default" | "pointer" | ""} */
const inertKind = (settings, layer) => settings.values[SETTING.DEFAULT_LAYERS] & (1 << layer) ? "default"
    : settings.values[SETTING.AUTO_MOUSE_LAYER] === layer ? "pointer" : "";

// The layers of `mask` the keyboard ignores in a link, as a mask: the pointer
// layer and the default layers.
/** @param {LinkSettings} settings @param {number} mask */
const inertLinkLayers = (settings, mask) => layersOf(mask).reduce((inert, layer) => (inertKind(settings, layer) ? inert | (1 << layer) : inert) >>> 0, 0);

// Why the keyboard ignores `layer` in a link, in words; "" when it would not.
/** @param {LinkSettings} settings @param {number} layer */
function inertLinkReason(settings, layer) {
    const name = layerName(settings.names, layer);
    if (inertKind(settings, layer) === "default") return `${name} is a default layer: it is always on, so the mode would run all the time. The keyboard ignores it in a link.`;
    if (inertKind(settings, layer) === "pointer") return `${name} is the pointer layer: moving the trackball turns it on. The keyboard ignores it in a link.`;
    return "";
}

// Every layer as a link target: why the keyboard would ignore it in a link
// ("" when it would not) and which kind of layer that makes it, and the slot
// whose mode it already starts, if one is.
/** @param {LinkSettings} settings @param {readonly LinkSlot[]} slots */
function linkTargets(settings, slots) {
    return Array.from({length: Math.min(SETTINGS.LAYERS, PD_LINK_LAYERS)}, (_, layer) => {
        const owner = startedBy(slots, layer);
        return {layer, refusal: inertLinkReason(settings, layer), inert: inertKind(settings, layer), linkedBy: owner ? owner.id : null, linkedByName: owner ? slotName(owner) : ""};
    });
}

// The layers the pointer layer covers among those a slot's key turns on, as a
// mask (zero when none): a mode its key runs keeps the pointer layer on unless
// it returns to the typing layer (pointer-layer policy 1), and the pointer
// layer paints its keys over every layer below it wherever they are not
// transparent. A mode its layers started never turns the pointer layer on.
/** @param {LinkSettings} settings @param {Partial<LinkSlot>} slot */
function pointerCoveredLayers(settings, slot) {
    const pointer = settings.values[SETTING.AUTO_MOUSE_LAYER];
    if (!slot.kind || slot.pointerLayer !== 0 || !(pointer < PD_LINK_LAYERS)) return 0;
    return ((slot.linkTurnsOn ?? 0) & ((1 << pointer) - 1)) >>> 0;
}

// The layers that start a slot's mode as the keyboard runs its link, each
// with the layers whose being on ends a start from it, as a mask (zero when
// nothing does): a higher layer ends a start from every layer above it, any
// layer one from every layer outside both of the link's sets
// (pointing_mode_link_ended). Base, the default layers and the pointer layer
// never end it, and a layer the keyboard ignores in a link starts nothing.
// Layer reach (layer-reach.js) walks these; the interface reads them per
// slot (pdModes[].linkStarts) to say which layers reach a mode.
/** @param {LinkSettings} settings @param {Partial<LinkSlot>} slot @returns {{layer: number, ends: number}[]} */
function linkStarts(settings, slot) {
    if (!slot.kind) return [];
    const starting = ((slot.linkedLayers ?? 0) & ((1 << PD_LINK_LAYERS) - 1)) >>> 0;
    const neverEnds = ((1 << settings.values[SETTING.AUTO_MOUSE_LAYER]) | settings.values[SETTING.DEFAULT_LAYERS] | 1) >>> 0;
    return layersOf(starting & ~inertLinkLayers(settings, starting)).map(layer => ({layer,
        ends: (slot.linkEnds === PD_LINK_ENDS.HIGHER_LAYER ? layersAbove(layer) & ~neverEnds
            : slot.linkEnds === PD_LINK_ENDS.OTHER_LAYER ? ALL_LAYERS & ~linkNamed(slot) & ~neverEnds : 0) >>> 0}));
}

// Why a slot cannot take this link, in words; "" when it can. A layer its
// link already names is never refused for being inert (the pointer or default
// layers may have moved under it): the keyboard keeps ignoring it, and the
// editor says so. A layer that starts another mode cannot start this one.
/** @param {LinkSettings} settings @param {readonly LinkSlot[]} slots @param {LinkSlot} next @param {LinkSlot | undefined} stored */
function linkRefusal(settings, slots, next, stored) {
    for (const layer of layersOf(next.linkedLayers ?? 0)) {
        const owner = startedBy(slots, layer, next.id);
        if (owner) return `${layerName(settings.names, layer)} already starts ${slotName(owner)}; a layer starts one pointing mode.`;
    }
    for (const layer of layersOf(linkNamed(next) & ~(stored ? linkNamed(stored) : 0))) {
        const reason = inertLinkReason(settings, layer);
        if (reason) return reason;
    }
    return "";
}

// Why a settings change cannot be staged, in words; "" when it can. It would
// make a layer a mode's link names the pointer layer or a default layer,
// which the keyboard then ignores in that link. A layer a link names that was
// ignored already is left as it is (Review says so).
/** @param {LinkSettings} before @param {LinkSettings} after @param {readonly LinkSlot[]} slots */
function settingsLinkRefusal(before, after, slots) {
    for (const slot of slots) {
        if (!slot.kind) continue;
        const named = linkNamed(slot);
        const [layer] = layersOf(inertLinkLayers(after, named) & ~inertLinkLayers(before, named));
        if (layer === undefined) continue;
        const what = inertKind(after, layer) === "pointer" ? "the pointer layer" : "a default layer";
        return `${layerName(after.names, layer)} is in ${slotName(slot)}'s link, and the keyboard ignores ${what} in a link. Take it out of ${slotName(slot)}'s link first.`;
    }
    return "";
}

// Why a layer reorder cannot be made, in words; "" when it can. A reorder
// renumbers a link as it renumbers layer keys (portable-profile.js), so the
// keys that started a mode still start it. With keys keeping their numbers,
// though, a move could still give two modes one starting layer, put a link's
// layer on the pointer layer or a default layer, or put two of its layers on
// one (Make base: the old base's slot and the new base's both reach it), which
// would merge them. `moved` renumbers a mask from before the move to after it.
/** @param {LinkSettings} before @param {LinkSettings} after @param {readonly LinkSlot[]} was @param {readonly LinkSlot[]} now @param {(mask: number) => number} moved @param {boolean} keysFollow */
function reorderLinkRefusal(before, after, was, now, moved, keysFollow) {
    const instead = keysFollow ? "Change the link first." : "Turn on Keys follow their layers, or change the link first.";
    for (const slot of was) {
        if (!slot.kind) continue;
        for (const mask of [slot.linkedLayers ?? 0, slot.linkTurnsOn ?? 0]) {
            const layers = layersOf(mask), landed = layers.map(layer => layersOf(moved(1 << layer))[0]);
            const at = landed.findIndex((target, i) => landed.indexOf(target) !== i);
            if (at >= 0) return `This move would put ${layerName(before.names, layers[landed.indexOf(landed[at])])} and ${layerName(before.names, layers[at])} of ${slotName(slot)}'s link on one layer, ${layerName(after.names, landed[at])}. ${instead}`;
        }
    }
    for (const slot of now) {
        if (!slot.kind) continue;
        for (const layer of layersOf(slot.linkedLayers ?? 0)) {
            const other = startedBy(now, layer, slot.id);
            if (other) return `This move would have ${layerName(after.names, layer)} start both ${slotName(slot)} and ${slotName(other)}, and a layer starts one pointing mode. ${instead}`;
        }
        const stored = was.find(entry => entry.id === slot.id);
        const [layer] = layersOf(inertLinkLayers(after, linkNamed(slot)) & ~moved(stored ? inertLinkLayers(before, linkNamed(stored)) : 0));
        if (layer === undefined) continue;
        const what = inertKind(after, layer) === "pointer" ? "the pointer layer" : "a default layer";
        return `This move would put ${slotName(slot)}'s link on ${layerName(after.names, layer)}, ${what}, which the keyboard ignores in a link. ${instead}`;
    }
    return "";
}

module.exports = {inertLinkLayers, inertLinkReason, linkStarts, linkTargets, linkRefusal, linkNamed, pointerCoveredLayers, reorderLinkRefusal, settingsLinkRefusal};
