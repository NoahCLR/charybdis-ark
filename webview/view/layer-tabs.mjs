// @ts-check
// Which layers get a tab of their own. A layer with no name of its own, no
// keys (every key Transparent or Nothing) and no colour is an empty slot:
// those fold into one "+N empty" tab, so the strip shows the layers in use.
// The picked layer always keeps its own tab, empty or not.

import {layerColourRow, layerPaints, mappedKeyCount} from "./lighting.mjs";

/** @typedef {import("../../contracts/panel.js").PublishedModel | null | undefined} Model */
/** @typedef {import("../../contracts/panel.js").Layer} Layer */

// A layer named only by its number ("Layer 8").
/** @param {Pick<Layer, "index" | "name"> & {displayName?: string}} layer */
export const layerUnnamed = (layer) => (layer.displayName || layer.name) === `Layer ${layer.index}` || !(layer.displayName || layer.name);

/** @param {Model} model @param {Layer} layer */
export function layerIsEmpty(model, layer) {
    return layerUnnamed(layer) && mappedKeyCount(layer) === 0 && !layerPaints(layerColourRow(model, layer.index)?.color);
}

// The stack split into tabs: `shown` are stack positions with a tab, in order;
// `empty` the stack positions folded into the "+N empty" tab. Base always has
// its tab.
/** @param {Model} model @param {readonly Layer[]} stack @param {number} picked stack position */
export function layerTabs(model, stack, picked) {
    /** @type {number[]} */
    const shown = [];
    /** @type {number[]} */
    const empty = [];
    stack.forEach((layer, at) => (at === 0 || at === picked || !layerIsEmpty(model, layer) ? shown : empty).push(at));
    return {shown, empty};
}
