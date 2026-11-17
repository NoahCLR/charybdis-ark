// @ts-check

// The colour the keyboard paints one LED: each lighting stage that is on
// paints over the one before, in the firmware's order (rgb_layer_stage.c).
// First the background effect, then each layer that is on, lowest first, in
// its colour where it paints, then the layers' accents, then a held combo's
// feedback where its output runs the pointing mode, then a running pointing
// mode's colour where it reaches and its accents (beneath the lowest layer
// on that its link names, when one is, firmware D-F62), then any other held
// combo's feedback where it reaches and its accents, then a behaviour
// feedback case where it reaches and its accents, and last a replacement
// flash where it reaches and its accents. The interface's lighting preview
// runs it as a person turns layers on, holds a pointing mode, holds a combo
// or picks a behaviour feedback case or a replacement flash
// (webview/view/lighting.mjs); what it paints with it reads from the model
// (D-L73).

/** @typedef {{h?: string | number, s?: string | number, v?: string | number}} Colour */
/**
 * @typedef {object} LedStages
 * @property {boolean} off Whether all lighting is off.
 * @property {{colour: Colour, source: string} | null} base The background effect where it lights this LED, or null.
 * @property {{layer: number, colour: Colour | null | undefined, paints: boolean}[] | null} layers The layer colour stage, null when it is off: each layer on, lowest first, its stored colour and whether it paints this LED (every key, or a key it maps).
 * @property {{colour: Colour | null | undefined, owners: number[]}[]} layerGroups The layer accents that light this LED, in stored order, with the layers on that own each.
 * @property {{colour: Colour, reaches: boolean, groups: (Colour | null | undefined)[], beneath?: number | null} | null} pointing A running pointing mode's stage, null when none runs or it is off: its colour, whether its locality reaches this LED, its groups that hold this LED, and the lowest layer that is on among those its link names (`linkedBeneath`), which it paints beneath, null when none is.
 * @property {{colour: Colour, reaches: boolean, groups: (Colour | null | undefined)[], beneath?: boolean} | null} [combo] A held combo's feedback, null when none is held, it holds a momentary layer (the layer stage shows the hold) or the stage is off: its colour, whether its locality reaches this LED, its accents that hold this LED, and whether it paints beneath the pointing mode, as one whose output runs that mode does (firmware stage 3).
 * @property {{colour: Colour, reaches: boolean, every: (Colour | null | undefined)[], group?: (Colour | null | undefined)[], own: (Colour | null | undefined)[]} | null} [behaviour] A behaviour feedback case showing (firmware stage 7), null when none shows or the stage is off: its colour, whether its own locality reaches this LED (firmware D-F73), and its accents that hold this LED, those for every state (`every`), for every tap branch when it is one (`group`, firmware D-F75) and for its own (`own`), each in stored order.
 * @property {{colour: Colour, reaches: boolean, every: (Colour | null | undefined)[], own: (Colour | null | undefined)[]} | null} [replacement] A replacement flash showing (firmware stage 8), null when none shows or the stage is off: its case's colour, whether its locality reaches this LED, and its accents that hold this LED, those for every case (`every`) and those for its own (`own`), each in stored order.
 */

export const OFF = Object.freeze({h: "0", s: "0", v: "0"});

// Two firmware rules for "no colour" (firmware D-F74): a colour a layer, a
// pointing slot, combo feedback or a feedback case owns is passthrough when
// its saturation and value are 0, at any hue, and paints nothing; value 0
// with saturation is off, which turns its LEDs dark. A group row stored as
// HSV(0, 0, 0) takes its owner's colour instead of painting black
// (rgb_helpers.h rgb_hsv_is_inherit_color). The auto-mouse end colour is
// neither: it is literal.
/** @param {Colour | null | undefined} colour */
export const colourPaints = (colour) => Boolean(colour) && !(Number(colour?.s) === 0 && Number(colour?.v) === 0);
// Off: value 0 with saturation above 0, which turns an owned colour's LEDs
// off, dark over what is beneath (black, in HSV's words).
/** @param {Colour | null | undefined} colour */
export const ledsOff = (colour) => Boolean(colour) && Number(colour?.s) > 0 && Number(colour?.v) === 0;
/** @param {Colour | null | undefined} colour */
export const inheritsStageColour = (colour) => !colour || (Number(colour?.h) === 0 && Number(colour?.s) === 0 && Number(colour?.v) === 0);
// An accent's own colour as it is stored. Exactly HSV(0, 0, 0) is the code
// for its owner's colour, and any other accent colour paints as itself, so a
// dark own colour that lands on 0, 0, 0 is kept at hue 1: dark too, and the
// accent's own (rgb_helpers.h rgb_hsv_is_inherit_color; the stages paint
// hsv_to_rgb of any other).
/** @param {Colour} colour @returns {Colour} */
export const ownAccentColour = (colour) => inheritsStageColour(colour) ? {h: 1, s: 0, v: 0} : colour;

// The layer a running pointing mode paints beneath: the lowest of `on` that
// its link names (`link`, bit n layer n: the layers that start it and those
// its key turns on, less those the keyboard ignores in a link), or null when
// none is on and it paints over every layer (firmware D-F62,
// rgb_runtime_pointing_mode_stage_beneath_layer).
/** @param {number | undefined} link @param {readonly number[]} on @returns {number | null} */
export function linkedBeneath(link, on) {
    const named = [...on].sort((a, b) => a - b).find((layer) => ((link ?? 0) & 2 ** layer) !== 0);
    return named ?? null;
}

/**
 * The colour one LED shows, which stage painted it, and the layer that did.
 * @param {LedStages} stages @returns {{colour: Colour, source: string, layer?: number | null}}
 */
export function ledColour({off, base, layers, layerGroups, pointing, combo = null, behaviour = null, replacement = null}) {
    if (off) return {colour: OFF, source: "off"};
    /** @type {Colour} */
    let colour = base?.colour || OFF;
    let source = base ? base.source : "off";
    /** @type {number | null} */
    let painter = null;
    /** @param {Colour} next @param {string} from @param {number | null} [by] */
    const paint = (next, from, by = null) => { colour = next; source = from; painter = by; };
    // The layers from `first` up to before `end`, their colours then their
    // accents, as the keyboard paints a range of the stack.
    /** @param {number} first @param {number} end */
    const paintLayers = (first, end) => {
        if (!layers) return;
        const inRange = (/** @type {number} */ layer) => layer >= first && layer < end;
        for (const {layer, colour: own, paints} of layers) if (inRange(layer) && own && colourPaints(own) && paints) paint(own, "layer", layer);
        for (const group of layerGroups) {
            for (const layer of group.owners.filter(inRange)) {
                const own = layers.find((row) => row.layer === layer)?.colour;
                if (!inheritsStageColour(group.colour)) paint(/** @type {Colour} */ (group.colour), "layer", layer);
                else if (own && colourPaints(own)) paint(own, "layer", layer);
            }
        }
    };
    // An owner's stage: its colour where it reaches, then its accents in
    // order, a black one in its colour. A passthrough owner paints nothing,
    // nor do its accents that take its colour; a coloured accent still does.
    /** @param {{colour: Colour, reaches: boolean}} owner @param {(Colour | null | undefined)[]} groups @param {string} from */
    const paintOwned = (owner, groups, from) => {
        const paints = colourPaints(owner.colour);
        if (paints && owner.reaches) paint(owner.colour, from);
        for (const group of groups) {
            if (!inheritsStageColour(group)) paint(/** @type {Colour} */ (group), from);
            else if (paints) paint(owner.colour, from);
        }
    };
    /** @param {NonNullable<LedStages["combo"]>} held */
    const paintCombo = (held) => paintOwned(held, held.groups, "combo");
    // A mode whose link names a layer that is on paints in the stack beneath
    // the lowest such layer, so that layer and those above show over it
    // (firmware D-F62). Painted there, it is drawn with the layers, before
    // any combo feedback (rgb_runtime.c). A passthrough mode paints nothing;
    // black paints its area dark.
    const beneath = pointing?.beneath ?? null;
    if (pointing && beneath !== null) {
        paintLayers(0, beneath);
        paintOwned(pointing, pointing.groups, "pointing");
        paintLayers(beneath, Infinity);
        if (combo?.beneath) paintCombo(combo);
    } else {
        paintLayers(0, Infinity);
        // A combo whose output runs the pointing mode paints beneath it
        // (stage 3), so the mode covers it where it paints.
        if (combo?.beneath) paintCombo(combo);
        if (pointing) paintOwned(pointing, pointing.groups, "pointing");
    }
    // Any other combo paints above them all (stage 6).
    if (combo && !combo.beneath) paintCombo(combo);
    // A behaviour feedback case paints next (stage 7). Its accents paint
    // widest first, those for every state, then for every tap branch, then
    // those naming it (firmware D-F75), and a black one takes the case's
    // colour.
    if (behaviour) paintOwned(behaviour, [...behaviour.every, ...(behaviour.group || []), ...behaviour.own], "behaviour");
    // A replacement flash paints last. A case whose colour paints nothing
    // does not flash, and neither do its accents that take its colour; an
    // accent in a colour of its own still lights. Accents for every case
    // paint before those naming one, so the narrower repaints them.
    if (replacement) {
        paintOwned(replacement, [...replacement.every, ...replacement.own], "replacement");
    }
    return {colour, source, layer: painter};
}
