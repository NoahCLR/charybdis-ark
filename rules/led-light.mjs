// @ts-check

// The colour the keyboard paints one LED: each lighting stage that is on
// paints over the one before, in the firmware's order (rgb_layer_stage.c).
// First the background effect, then each layer that is on, lowest first, in
// its colour where it paints, then the layers' LED groups, then a running
// pointing mode's colour where it reaches and its LED groups. The interface's
// lighting preview runs it as a person turns layers on and holds a pointing
// mode (webview/view/lighting.mjs); what it paints with it reads from the
// model (D-L73).

/** @typedef {{h?: string | number, s?: string | number, v?: string | number}} Colour */
/**
 * @typedef {object} LedStages
 * @property {boolean} off Whether all lighting is off.
 * @property {{colour: Colour, source: string} | null} base The background effect where it lights this LED, or null.
 * @property {{layer: number, colour: Colour | null | undefined, paints: boolean}[] | null} layers The layer colour stage, null when it is off: each layer on, lowest first, its stored colour and whether it paints this LED (every key, or a key it maps).
 * @property {{colour: Colour | null | undefined, owners: number[]}[]} layerGroups The layer LED groups that hold this LED, in stored order, with the layers on that own each.
 * @property {{colour: Colour, reaches: boolean, groups: (Colour | null | undefined)[]} | null} pointing A running pointing mode's stage, null when none runs or it is off: its colour, whether its locality reaches this LED, and its groups that hold this LED.
 */

export const OFF = Object.freeze({h: "0", s: "0", v: "0"});

// Two firmware rules for "no colour": a layer colour is skipped only when both
// saturation and value are 0 (rgb_layer_stage.c), and a group row stored as
// HSV(0, 0, 0) inherits its stage colour instead of painting black
// (rgb_helpers.h rgb_hsv_is_inherit_color).
/** @param {Colour | null | undefined} colour */
export const layerPaints = (colour) => Boolean(colour) && !(Number(colour?.s) === 0 && Number(colour?.v) === 0);
/** @param {Colour | null | undefined} colour */
export const inheritsStageColour = (colour) => !colour || (Number(colour?.h) === 0 && Number(colour?.s) === 0 && Number(colour?.v) === 0);

/**
 * The colour one LED shows, which stage painted it, and the layer that did.
 * @param {LedStages} stages @returns {{colour: Colour, source: string, layer?: number | null}}
 */
export function ledColour({off, base, layers, layerGroups, pointing}) {
    if (off) return {colour: OFF, source: "off"};
    /** @type {Colour} */
    let colour = base?.colour || OFF;
    let source = base ? base.source : "off";
    /** @type {number | null} */
    let painter = null;
    /** @param {Colour} next @param {string} from @param {number | null} [by] */
    const paint = (next, from, by = null) => { colour = next; source = from; painter = by; };
    if (layers) {
        for (const {layer, colour: own, paints} of layers) if (own && layerPaints(own) && paints) paint(own, "layer", layer);
        for (const group of layerGroups) {
            for (const layer of group.owners) {
                const own = layers.find((row) => row.layer === layer)?.colour;
                if (!inheritsStageColour(group.colour)) paint(/** @type {Colour} */ (group.colour), "layer", layer);
                else if (own && layerPaints(own)) paint(own, "layer", layer);
            }
        }
    }
    if (pointing) {
        // Black is black: outside layer colours HSV(0, 0, 0) paints the LEDs
        // dark while the mode runs.
        if (pointing.reaches) paint(pointing.colour, "pointing");
        for (const group of pointing.groups) paint(inheritsStageColour(group) ? pointing.colour : /** @type {Colour} */ (group), "pointing");
    }
    return {colour, source, layer: painter};
}
