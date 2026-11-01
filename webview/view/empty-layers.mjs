// @ts-check
// Empty layers (D-L76). The keyboard compiles every layer it has room for, so
// a profile that uses eight still lists sixteen. Every place that lists the
// layers shows the ones in use and folds the empty ones behind one disclosure
// at its end; folding only draws less, and stores nothing.
//
// A layer is empty when nothing would be lost by not seeing it: it is not the
// base or a default layer, the profile gives it no name of its own (core's
// `named`), every key on it is transparent or disabled, nothing turns it on
// (a layer key anywhere in the profile, a pointing mode's key or a custom
// key's shortcut, `qmkKeyTurnsOn`), it starts no pointing mode and is not the
// pointer layer, it matches its combos on its own keys and no layer matches
// on its, it has no layer colour that paints and owns no LED override, no key
// on it has Use behaviour or Join combos off, and each of its switches on the
// Settings screens reads as the other empty layers' do. Ark does not know what
// the firmware compiled each switch to, so a switch counts as set when it
// differs from the most empty layers'; where they split evenly, it counts as
// set on every one of them, and none folds.
import {keptPer} from "../lib/once.mjs";
import {layersAnyKeyTurnsOn} from "./key-identity.mjs";
import {layerColourRow, layerPaints, mappedKeyCount} from "./lighting.mjs";
import {isLayerSwitch} from "./settings-layout.mjs";

/** @typedef {import("../../contracts/panel.js").PublishedModel} Model */

/** @type {ReadonlySet<number>} */
const NONE = new Set();
/** @type {(model: Model, key: string, work: () => ReadonlySet<number>) => ReadonlySet<number>} */
const EMPTY = keptPer();

// The empty layers, by index, worked out once per model.
/** @param {Model | null | undefined} model @returns {ReadonlySet<number>} */
export function emptyLayers(model) {
    if (!model?.layers?.length) return NONE;
    return EMPTY(model, "empty", () => {
        const any = (/** @type {number[]} */ masks) => masks.reduce((mask, each) => mask | each, 0);
        const turnedOn = layersAnyKeyTurnsOn(model);
        const starts = any((model.pdModes || []).map((slot) => slot.linkedLayers || 0));
        const references = model.comboReferenceLayers || [];
        const matched = new Set(references.flatMap((reference, layer) => reference === layer ? [] : [layer, reference]));
        const overridden = new Set((model.rgb?.layerLedGroups || []).map((row) => row.ownerLayer));
        const placements = model.participation?.layers || [];
        const unused = new Set(model.layers.filter((layer) => {
            const bit = 2 ** layer.index;
            return layer.index !== 0 && !layer.alwaysOn && !layer.named && !mappedKeyCount(model, layer)
                && !(turnedOn & bit) && !(starts & bit) && layer.index !== model.pdModeEditing?.pointerLayer
                && !matched.has(layer.index) && !layerPaints(layerColourRow(model, layer.index)?.color) && !overridden.has(layer.index)
                && !placements[layer.index]?.bypass?.length && !placements[layer.index]?.exclude?.length;
        }).map((layer) => layer.index));
        // Each per-layer setting, judged among the layers nothing else uses.
        const set = (model.configDefaults || []).flatMap((section) => {
            if (!section.layerGroup) return [];
            const switches = section.fields.filter((field) => isLayerSwitch(field) && unused.has(layerOf(field)));
            const on = switches.filter((field) => field.enabled).length, off = switches.length - on;
            return switches.filter((field) => on === off || Boolean(field.enabled) !== on > off).map(layerOf);
        });
        for (const layer of set) unused.delete(layer);
        return unused;
    });
}

/** @param {import("../../contracts/panel.js").PresentedField} field */
const layerOf = (field) => field.governs?.kind === "layer" ? field.governs.layer : -1;

// A list of layers split into what shows and what folds: an item folds when
// its layer is empty and the place does not keep it (the layer picked there,
// or one whose setting there differs from how it came). Both keep the list's
// order; with nothing to fold, everything shows.
/**
 * @template T
 * @param {Model | null | undefined} model @param {readonly T[]} items @param {(item: T) => number} layerOf
 * @param {(item: T) => boolean} [keep]
 * @returns {{shown: T[], folded: T[]}}
 */
export function foldEmptyLayers(model, items, layerOf, keep = () => false) {
    const empty = emptyLayers(model);
    /** @type {T[]} */
    const shown = [];
    /** @type {T[]} */
    const folded = [];
    for (const item of items) (empty.has(layerOf(item)) && !keep(item) ? folded : shown).push(item);
    return {shown, folded};
}

// What the disclosure says, the same in every place.
/** @param {number} count */
export const emptyLayersLabel = (count) => `${count} empty layer${count === 1 ? "" : "s"}`;
