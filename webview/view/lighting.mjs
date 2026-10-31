// @ts-check
// What the keyboard would light, from what the keyboard reported.
//
// Every surface that shows colour asks this module, so the board, the key
// dots, the swatches and the review all answer the same way — and they answer
// from the draft, because the draft is what the model carries.

import {GEO, inLocality, trackballInLocality} from "./geometry.mjs";
import {keyIdentity} from "./key-identity.mjs";
import {keyKindOf, keyMeaning} from "./keyface.mjs";
import {vocabulary} from "./vocabulary.mjs";
import {OFF, inheritsStageColour, layerPaints, ledColour} from "../../rules/led-light.mjs";

/**
 * @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model
 * @typedef {import("../../contracts/panel.js").Layer | null | undefined} Layer
 * @typedef {import("../../contracts/panel.js").Position | undefined} Position
 * @typedef {import("../../contracts/edits.js").Colour} Colour
 * @typedef {import("./types.js").LightOptions} LightOptions
 */


// A pointing slot's lighting row by the name the RGB enum gives its id; the
// 32-slot firmware's slots past seven are POINTING_MODE_n. A keyboard reports
// rows only for the slots it has.
export const POINTING_MODE_IDS = [
    "POINTING_MODE_DRAGSCROLL", "POINTING_MODE_VOLUME", "POINTING_MODE_BRIGHTNESS", "POINTING_MODE_ZOOM",
    "POINTING_MODE_ARROW", "POINTING_MODE_PINCH", "POINTING_MODE_6", "POINTING_MODE_7",
    ...Array.from({length: 24}, (_, index) => `POINTING_MODE_${index + 8}`),
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
export const stageInEffect = (model, id) => stageEnabled(model, id) && !stageIdle(model, id) && !lightingOff(model);

// All lighting off (QMK's matrix switch): the keyboard paints nothing, no
// stage included, since QMK skips the hooks the stages paint from while its
// effect is off (rgb_matrix.c).
/** @param {Model} model */
export const lightingOff = (model) => model?.rgb?.baseEffect?.state === "read" && !model.rgb.baseEffect.enabled;

// The background effect, as the draft stores it. Only a solid colour
// can be drawn honestly; any other effect has no single colour to show.
/** @param {Model} model */
export function baseColour(model) {
    const base = model?.rgb?.baseEffect;
    if (!base || base.state !== "read" || !base.enabled || !base.previewColor) return null;
    return base.previewColor;
}

// A background-effect setting the draft holds (Lighting · Background effect).
/** @param {Model} model @param {string} macro */
const baseField = (model, macro) => (model?.configDefaults || []).find((section) => section.id === "rgbAppearance")?.fields.find((field) => field.macro === macro);

// An effect other than Solid colour animates: it has no single colour, but it
// is lit, so it must never be drawn as off.
/** @param {Model} model */
function baseAnimated(model) {
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

// QMK's LED classes as the stored flags name them (LED_FLAGS in
// core/schema/settings-domain-v1.js): every class, the modifier and the key.
export const LED_FLAGS = Object.freeze({ALL: 255, MODIFIER: 1, KEY: 4});
// Which LEDs the background effect paints: QMK skips an LED whose class the stored
// flags leave out. On this board the "modifier" class is the eight thumb keys
// and the trackball LED, the "key" class every other key.
/** @param {Model} model @param {number | undefined} layoutIndex undefined for the trackball LED */
function baseReaches(model, layoutIndex) {
    const field = baseField(model, "effectLeds");
    if (!field) return true;
    const flags = Number(field.value);
    if (flags === LED_FLAGS.ALL) return true;
    const thumb = layoutIndex === undefined || Object.hasOwn(GEO.thumbs, layoutIndex);
    return Boolean(flags & (thumb ? LED_FLAGS.MODIFIER : LED_FLAGS.KEY));
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
        const found = (row?.positions || []).find((position) => keyIdentity(model, keyMeaning(position)).pointing?.id === slotId);
        if (found) return {layoutIndex: found.layoutIndex, layer: /** @type {number} */ (row?.index)};
    }
    return null;
}

/** @param {Model} model @param {number} layerId */
export const layerColourRow = (model, layerId) =>
    (model?.rgb?.layerColors || []).find((row) => row.layerId === layerId);

/** @param {Model} model @param {number} slotId */
export const pdColourRow = (model, slotId) =>
    (model?.rgb?.pdModeColors || []).find((row) => row.pointingMode === POINTING_MODE_IDS[slotId]);

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
// transparent and disabled positions keep the layer underneath (qmkKeyKinds).
/** @param {Model} model @param {Position | undefined} position */
const isMapped = (model, position) => {
    const kind = position?.keycode ? keyKindOf(model, position.keycode) : "disabled";
    return kind !== "transparent" && kind !== "disabled";
};

/** @param {Model} model @param {Layer} layer */
export const mappedKeyCount = (model, layer) => (layer?.positions || []).filter((position) => isMapped(model, position)).length;

// The firmware's two rules for "no colour" (rules/led-light.mjs).
export {inheritsStageColour, layerPaints};

// What the colour editor says about HSV(0, 0, 0) in a stage, in the
// vocabulary's words (colourOff), spread into its options. A layer colour and
// a group row ("groups", not a stage) are the two places black is not black.
/** @param {import("./vocabulary.mjs").VocabularyModel | null | undefined} model @param {string} stage @returns {{offTip?: string, offNote?: string}} */
export const offWording = (model, stage) => vocabulary(model).colourOff[stage] || {};


// Whether a key stores something of its own on layer l. The viewed layer's
// position is passed in; any other layer is looked up at the same place.
/** @param {Model} model @param {Layer} layer @param {number} l @param {Position} position */
function mappedOn(model, layer, l, position) {
    if (!position) return false;
    if (l === layer?.index) return isMapped(model, position);
    const other = (model?.layers || []).find((row) => row.index === l) || model?.layers?.[l];
    return isMapped(model, (other?.positions || []).find((row) => row.layoutIndex === position.layoutIndex));
}

/**
 * The colour one LED would show with the viewed layer held on top of the
 * default layer — the firmware's own stage order, per LED:
 *
 *   background effect → every active layer's solid colour, ascending (layer 0 first,
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
    const baseHere = baseReaches(model, position ? position.layoutIndex : undefined);
    const animated = baseHere && stageEnabled(model, "base") && baseAnimated(model);
    const base = !baseHere || !stageEnabled(model, "base") ? null : animated ? animatedGlow(model) : baseColour(model);
    // The keyboard paints base and the layers that are on (rgb_layer_stage.c,
    // from layer_state), never the other default layers it keeps: those live
    // in QMK's default layer state, which lighting does not read.
    const active = [...new Set([0, layer?.index ?? 0, ...(options.held || [])])].sort((a, b) => a - b);
    const lit = (/** @type {{ledIndices?: number[]}} */ group) => (group.ledIndices || []).includes(led ?? -1);
    const preview = options.pdActive;
    return ledColour({
        off: lightingOff(model),
        base: base ? {colour: base, source: animated ? "animated" : "base"} : null,
        layers: stageEnabled(model, "layers") ? active.map((l) => {
            const row = layerColourRow(model, l);
            return {layer: l, colour: row?.color, paints: Boolean(row) && (row?.mode === "ALL_KEYS" || mappedOn(model, layer, l, position))};
        }) : null,
        layerGroups: (model?.rgb?.layerLedGroups || []).filter(lit).map((group) => ({colour: group.color,
            owners: group.owner === "RGB_LAYER_GROUP_ALL" ? active : active.filter((l) => group.ownerLayer === l)})),
        pointing: preview && stageEnabled(model, "pd") ? {colour: preview.color,
            reaches: position ? inLocality(position.layoutIndex, preview.locality, preview.triggerIndex) : trackballInLocality(preview.locality, preview.triggerIndex),
            groups: (model?.rgb?.pdModeLedGroups || []).filter((group) => lit(group) && (group.owner === "RGB_POINTING_MODE_GROUP_ALL" || group.owner === preview.mode)).map((group) => group.color)} : null,
    });
}

// The LED a key carries, by layout index, and the trackball's, soldered on
// the right half and wired to no key, as core publishes them (model.leds).
/** @param {Model} model @param {number | undefined} layoutIndex */
export const keyLed = (model, layoutIndex) => model?.leds?.keys[layoutIndex ?? -1];
/** @param {Model} model */
export const trackballLed = (model) => model?.leds?.trackball;

/** @param {Model} model @param {Layer} layer @param {Position} position @param {LightOptions} [options] */
export function keyLight(model, layer, position, options = {}) {
    return ledLight(model, layer, keyLed(model, position?.layoutIndex), position, options);
}

/** @param {Model} model @param {Layer} layer @param {LightOptions} [options] */
export function trackballLight(model, layer, options = {}) {
    return ledLight(model, layer, trackballLed(model), undefined, options);
}

// Whether an LED's light is the viewed layer's own rather than seen through it
// from beneath: that layer or a previewed pointing mode painted it last, or the
// viewed layer is base, which nothing lies under — the background effect is the floor
// base sits on, always on with it, not a layer below it.
/** @param {import("./types.js").LedLight | null | undefined} light @param {number} [layerId] */
export const ownLight = (light, layerId = 0) =>
    layerId === 0 || light?.source === "pointing" || (light?.source === "layer" && light.layer === layerId);
