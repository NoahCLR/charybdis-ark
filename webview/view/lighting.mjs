// @ts-check
// What the keyboard would light, from what the keyboard reported.
//
// Every surface that shows colour asks this module, so the board, the key
// dots, the swatches and the review all answer the same way — and they answer
// from the draft, because the draft is what the model carries.

import {GEO, LED_INDEX, TRACKBALL_LED, inLocality, trackballInLocality} from "./geometry.mjs";
import {pointingSlotFor} from "./reach.mjs";
import {keyMeaning} from "./keyface.mjs";

/**
 * @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model
 * @typedef {import("../../contracts/panel.js").Layer | null | undefined} Layer
 * @typedef {import("../../contracts/panel.js").Position | undefined} Position
 * @typedef {import("../../contracts/edits.js").Colour} Colour
 * @typedef {import("./types.js").LightOptions} LightOptions
 */
const OFF = {h: "0", s: "0", v: "0"};


// A pointing slot's lighting row by the name the RGB enum gives its id; the
// 32-slot firmware's slots past seven are PD_MODE_SLOT_n. A keyboard reports
// rows only for the slots it has.
export const PD_MODE_IDS = [
    "PD_MODE_DRAGSCROLL", "PD_MODE_VOLUME", "PD_MODE_BRIGHTNESS", "PD_MODE_ZOOM",
    "PD_MODE_ARROW", "PD_MODE_PINCH", "PD_MODE_SLOT_6", "PD_MODE_SLOT_7",
    ...Array.from({length: 24}, (_, index) => `PD_MODE_SLOT_${index + 8}`),
];

/** @param {Model} model @param {string} id */
export function stageEnabled(model, id) {
    if (id === "base") return Boolean(model?.rgb?.baseEffect?.enabled);
    // A stage is found by its id, never by what it is called.
    const stage = (model?.rgb?.stages || []).find((row) => row.id === id);
    return Boolean(stage?.enabled);
}

// A stage switched on can still paint nothing. The auto-mouse fade runs only
// while auto-mouse raises its layer: with auto-mouse off, a pointer layer
// turned on by hand shows its own lighting. This answers why, or null; the
// stored switch is left as it is, so turning auto-mouse back on restores it.
// Without settings readback nothing is claimed.
/** @param {Model} model @param {string} id */
export function stageIdle(model, id) {
    if (id !== "auto" || !stageEnabled(model, id)) return null;
    const field = (model?.configDefaults || []).find((section) => section.id === "autoMouse")
        ?.fields.find((entry) => entry.macro === "autoMouse");
    return field && !field.enabled ? "Auto-mouse is off, so this stage paints nothing." : null;
}

/** @param {Model} model @param {string} id */
export const stageInEffect = (model, id) => stageEnabled(model, id) && !stageIdle(model, id);

// The base effect is a VIA read, not part of the profile. Only a solid colour
// can be drawn honestly; any other effect has no single colour to show.
/** @param {Model} model */
export function baseColour(model) {
    const base = model?.rgb?.baseEffect;
    if (!base || base.state !== "read" || !base.enabled || !base.previewColor) return null;
    return base.previewColor;
}

// A base-lighting setting the draft holds (Settings · Base lighting).
/** @param {Model} model @param {string} macro */
const baseField = (model, macro) => (model?.configDefaults || []).find((section) => section.id === "rgbAppearance")?.fields.find((field) => field.macro === macro);

// An effect other than Solid colour animates: it has no single colour, but it
// is lit, so it must never be drawn as off.
/** @param {Model} model */
export function baseAnimated(model) {
    const base = model?.rgb?.baseEffect;
    return Boolean(base && base.state === "read" && base.enabled && base.effectId !== 1);
}

// An animated effect drawn as a soft glow of its own hue: lit, but not a
// colour the keyboard holds still.
/** @param {Model} model @returns {Colour | null} */
function animatedGlow(model) {
    const base = model?.rgb?.baseEffect;
    if (!base || base.state !== "read") return null;
    const brightness = Number(base.previewColor?.v ?? baseField(model, "brightness")?.value ?? base.brightness ?? 0);
    return {h: String(base.hue ?? 0), s: String(Math.round(Number(base.saturation ?? 0) / 4)), v: String(Math.round(brightness * 0.6))};
}

// Which LEDs the base effect paints: QMK skips an LED whose class the stored
// flags leave out. On this board the "modifier" class is the eight thumb keys
// and the trackball LED, the "key" class every other key.
/** @param {Model} model @param {number | undefined} layoutIndex undefined for the trackball LED */
export function baseReaches(model, layoutIndex) {
    const field = baseField(model, "effectLeds");
    if (!field) return true;
    const flags = Number(field.value);
    if (flags === 255) return true;
    const thumb = layoutIndex === undefined || Object.hasOwn(GEO.thumbs, layoutIndex);
    return Boolean(flags & (thumb ? 1 : 4));
}

// The key a trackball mode's preview starts from: the first key that holds or
// locks it, on the viewed layer first, then from layer 0 up. The firmware
// paints "the half holding the trigger key" and "only the trigger key" from
// the key that started the mode; with none, both halves or every LED.
/** @param {Model} model @param {Layer} layer @param {number} slotId @returns {{layoutIndex: number, layer: number} | null} */
export function pdTrigger(model, layer, slotId) {
    const stack = model?.layers || [];
    const order = [layer, ...stack.filter((row) => row !== layer)].filter(Boolean);
    for (const row of order) {
        const found = (row?.positions || []).find((position) => pointingSlotFor(/** @type {any} */ (model), keyMeaning(position))?.id === slotId);
        if (found) return {layoutIndex: found.layoutIndex, layer: /** @type {number} */ (row?.index)};
    }
    return null;
}

/** @param {Model} model @param {number} layerId */
export const layerColourRow = (model, layerId) =>
    (model?.rgb?.layerColors || []).find((row) => row.layerId === layerId);

/** @param {Model} model @param {number} slotId */
export const pdColourRow = (model, slotId) =>
    (model?.rgb?.pdModeColors || []).find((row) => row.pointingMode === PD_MODE_IDS[slotId]);

/** @param {Model} model */
export function feedbackColours(model) {
    const feedback = model?.rgb?.keyBehaviorFeedback;
    return {
        tap: feedback?.tapCommittedColor || OFF,
        hold: feedback?.holdActiveColor || OFF,
        long: feedback?.longHoldActiveColor || OFF,
        branches: feedback?.tapBranchColors || [],
    };
}

/** @param {Model} model @param {import("../../contracts/edits.js").Tier} kind */
export const tierColour = (model, kind) => feedbackColours(model)[kind] || OFF;

// A key counts as mapped on a layer when it stores something of its own;
// transparent and disabled positions keep the layer underneath.
/** @param {Position} position */
export const isMapped = (position) =>
    Boolean(position?.keycode) && !["KC_TRANSPARENT", "KC_TRNS", "_______", "KC_NO", "XXXXXXX"].includes(position?.keycode || "");

/** @param {Layer} layer */
export const mappedKeyCount = (layer) => (layer?.positions || []).filter(isMapped).length;

// Two firmware rules for "no colour": a layer colour is skipped only when both
// saturation and value are 0 (rgb_layer_stage.c), and a group row stored as
// HSV(0, 0, 0) inherits its stage colour instead of painting black
// (rgb_helpers.h rgb_hsv_is_inherit_color).
/** @param {Colour | null | undefined} colour */
export const layerPaints = (colour) => Boolean(colour) && !(Number(colour?.s) === 0 && Number(colour?.v) === 0);
/** @param {Colour | null | undefined} colour */
export const inheritsStageColour = (colour) => !colour || (Number(colour?.h) === 0 && Number(colour?.s) === 0 && Number(colour?.v) === 0);

// The indicator stages only run under a live effect: with the matrix off the
// firmware reports effect 0 and paints nothing at all (rgb_matrix.c).
/** @param {Model} model */
const matrixOff = (model) => model?.rgb?.baseEffect?.state === "read" && !model.rgb.baseEffect.enabled;

// Whether a key stores something of its own on layer l. The viewed layer's
// position is passed in; any other layer is looked up at the same place.
/** @param {Model} model @param {Layer} layer @param {number} l @param {Position} position */
function mappedOn(model, layer, l, position) {
    if (!position) return false;
    if (l === layer?.index) return isMapped(position);
    const other = (model?.layers || []).find((row) => row.index === l) || model?.layers?.[l];
    return isMapped((other?.positions || []).find((row) => row.layoutIndex === position.layoutIndex));
}

/**
 * The colour one LED would show with the viewed layer held on top of the
 * default layer — the firmware's own stage order, per LED:
 *
 *   base effect → every active layer's solid colour, ascending (layer 0 first,
 *   so the default layer shows through a mapped-keys-only layer above it) →
 *   the layer LED group rows → a previewed pointing mode by locality → its
 *   LED group rows.
 *
 * The answer says what painted the LED last: `source` is the stage ("off",
 * "base", "layer" or "pointing") and, for a layer, `layer` is its id.
 *
 * `options.held` names the layers previewed on as well (by layer id); they
 * paint in the same ascending pass, as rgb_layer_stage.c paints every active
 * layer.
 *
 * `position` is the key over this LED, or undefined for the trackball LED,
 * which no key maps to: an all-keys wash reaches it, a mapped-keys layer never
 * does. A pointing-mode colour is an overlay that exists only while its mode
 * runs, so it is painted only when the caller asks for that preview.
 */
/** @param {Model} model @param {Layer} layer @param {number | undefined} led @param {Position} position @param {LightOptions} [options] @returns {import("./types.js").LedLight} */
function ledLight(model, layer, led, position, options = {}) {
    if (matrixOff(model)) return {colour: OFF, source: "off"};
    const baseHere = baseReaches(model, position ? position.layoutIndex : undefined);
    const animated = baseHere && stageEnabled(model, "base") && baseAnimated(model);
    const base = !baseHere || !stageEnabled(model, "base") ? null : animated ? animatedGlow(model) : baseColour(model);
    /** @type {Colour} */
    let colour = base || OFF;
    let source = base ? (animated ? "animated" : "base") : "off";
    /** @type {number | null} */
    let painter = null;
    /** @param {Colour} next @param {string} from @param {number | null} [by] */
    const paint = (next, from, by = null) => { colour = next; source = from; painter = by; };

    if (stageEnabled(model, "layers")) {
        const active = [...new Set([0, layer?.index ?? 0, ...(options.held || [])])].sort((a, b) => a - b);
        for (const l of active) {
            const row = layerColourRow(model, l);
            if (!row || !layerPaints(row.color)) continue;
            if (row.mode === "ALL_KEYS" || mappedOn(model, layer, l, position)) paint(row.color, "layer", l);
        }
        for (const group of model?.rgb?.layerLedGroups || []) {
            if (!(group.ledIndices || []).includes(led ?? -1)) continue;
            const owners = group.owner === "RGB_LAYER_GROUP_ALL" ? active : active.filter((l) => group.owner === `Layer ${l}`);
            for (const l of owners) {
                const row = layerColourRow(model, l);
                if (!inheritsStageColour(group.color)) paint(group.color, "layer", l);
                else if (row && layerPaints(row.color)) paint(row.color, "layer", l);
            }
        }
    }

    const preview = options.pdActive;
    if (preview && stageEnabled(model, "pd")) {
        const reaches = position ? inLocality(position.layoutIndex, preview.locality, preview.triggerIndex)
            : trackballInLocality(preview.locality, preview.triggerIndex);
        // Black is black: outside layer colours HSV(0, 0, 0) paints the LEDs
        // dark while the mode runs (B17).
        if (reaches) paint(preview.color, "pointing");
        for (const group of model?.rgb?.pdModeLedGroups || []) {
            if (!(group.ledIndices || []).includes(led ?? -1)) continue;
            if (group.owner !== "RGB_PD_MODE_GROUP_ALL" && group.owner !== preview.mode) continue;
            paint(inheritsStageColour(group.color) ? preview.color : group.color, "pointing");
        }
    }
    return {colour, source, layer: painter};
}

/** @param {Model} model @param {Layer} layer @param {Position} position @param {LightOptions} [options] */
export function keyLight(model, layer, position, options = {}) {
    return ledLight(model, layer, LED_INDEX[position?.layoutIndex ?? -1], position, options);
}

// The trackball LED is LED 56, soldered on the right half and wired to no key.
/** @param {Model} model @param {Layer} layer @param {LightOptions} [options] */
export function trackballLight(model, layer, options = {}) {
    return ledLight(model, layer, TRACKBALL_LED, undefined, options);
}

// Whether an LED's light is the viewed layer's own rather than seen through it
// from beneath: that layer or a previewed pointing mode painted it last, or the
// viewed layer is base, which nothing lies under — the base effect is the floor
// base sits on, always on with it, not a layer below it.
/** @param {import("./types.js").LedLight | null | undefined} light @param {number} [layerId] */
export const ownLight = (light, layerId = 0) =>
    layerId === 0 || light?.source === "pointing" || (light?.source === "layer" && light.layer === layerId);
