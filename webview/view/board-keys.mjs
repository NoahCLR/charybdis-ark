// @ts-check
// What the board shows at each key, and on the trackball, from one layer view
// (webview/ui/board.mjs draws it; layer-view.mjs answers the stack).
//
// With layers previewed under the viewed layer, a key shows what the keyboard
// would answer with instead of what this layer stores: a transparent key
// shows the key of the highest layer below that is on, `from` that layer. Its
// cap is glass like any transparent key's, since this layer is glass there
// and the key is seen through it, and the light it shows is the answering
// layer's. It wears the answering key's behaviour dots and the badges of the
// combos it fires in the view (view.combos.badgesAt).
//
// Dots and badges mark only what runs: a behaviour or combo that a switch
// keeps off for the key, on the layer that supplies it, marks nothing there
// (firmware's participation policy).
//
// In "leds" mode, the LED selector, a key names its LED and shows no light,
// marks or second line; `faces: false` leaves the marks off in any mode.

import {isOff} from "../lib/colour.mjs";
import {behaviourTiers, keyFace, keyMeaning} from "./keyface.mjs";
import {keyIdentity} from "./key-identity.mjs";
import {behaviourRuns} from "./participation.mjs";
import {keyLed, keyLight, ownLight, stageEnabled, tierColour, trackballLed, trackballLight} from "./lighting.mjs";
/** @typedef {import("./keyface-types.js").LayerView} LayerView */
/** @typedef {import("../lib/colour.mjs").Colour} Colour */
/** @typedef {{mode?: "light" | "leds", faces?: boolean, pdActive?: import("./types.js").LightOptions["pdActive"] | null}} BoardShows */

/**
 * @typedef {object} BoardKey
 * @property {number} index the layout index
 * @property {import("../../contracts/panel.js").Position | undefined} shown the key the cap shows
 * @property {import("../../contracts/panel.js").Layer | null} from the layer below that answers, through a transparent key
 * @property {import("./keyface-types.js").KeyFace["kind"]} kind
 * @property {string} meaning what the shown key means
 * @property {boolean} glass
 * @property {Colour | null} light the colour it shows, none in the LED selector
 * @property {{kind: import("./keyface-types.js").Tier, count: number, colour: Colour | null}[]} tiers one dot per tier, with the colour it flashes, none when key feedback leaves it dark
 * @property {{text: string, lit: Colour | null}[]} badges one per combo, lit in the combo feedback colour
 * @property {string} main
 * @property {string} sub
 */

/** @param {LayerView} view @param {BoardShows} [shows] @returns {BoardKey[]} */
export function boardKeys(view, {mode = "light", faces = true, pdActive = null} = {}) {
    const model = /** @type {import("../../contracts/panel.js").PublishedModel | null} */ (view.model ?? null);
    const {layer} = view;
    const leds = mode === "leds";
    const answering = layer && view.previewing && !leds;
    const marks = faces && !leds;
    const held = heldIds(view);
    const feedbackOn = stageEnabled(model, "key");
    const comboColour = model?.rgb?.comboFeedback?.color;
    const comboLit = stageEnabled(model, "combo") && comboColour && !isOff(comboColour) ? comboColour : null;
    return (layer?.positions || []).map((position) => {
        const index = position.layoutIndex;
        const answer = answering ? view.answerAt(index) : undefined;
        const shown = answer?.position || position;
        const from = answer?.fellThrough ? answer.layer : null;
        const face = keyFace(shown, model);
        const behaviour = marks ? keyIdentity(model, keyMeaning(shown)).behaviour : undefined;
        const runs = behaviour && behaviourRuns(model, (from || layer)?.index ?? 0, shown, behaviour).runs;
        return {
            index, shown, from,
            kind: face.kind,
            meaning: keyMeaning(shown),
            glass: face.kind === "transparent" || Boolean(from),
            light: leds ? null : keyLight(model, layer, position, {pdActive, held}).colour,
            tiers: runs ? behaviourTiers(behaviour).map((tier) => {
                const colour = tierColour(model, tier.kind);
                return {...tier, colour: feedbackOn && !isOff(colour) ? colour : null};
            }) : [],
            badges: marks ? view.combos.badgesAt(index).map((combo) => ({text: combo.badge || "C", lit: comboLit})) : [],
            main: leds ? String(keyLed(model, index) ?? index) : face.main,
            sub: leds ? "" : face.sub,
        };
    });
}

// The trackball LED belongs to no key, but is lit like every other LED. Its
// light is glass when it is seen through the viewed layer from underneath
// rather than the layer's own (lighting.mjs ownLight).
/** @param {LayerView} view @param {BoardShows} [shows] */
export function boardTrackball(view, {mode = "light", pdActive = null} = {}) {
    const model = /** @type {import("../../contracts/panel.js").PublishedModel | null} */ (view.model ?? null);
    const light = trackballLight(model, /** @type {import("../../contracts/panel.js").Layer} */ (view.layer), {pdActive, held: heldIds(view)});
    const leds = mode === "leds";
    return {led: trackballLed(model), light: leds ? null : light.colour, glass: !leds && !ownLight(light, view.layer?.index ?? 0)};
}

// Lighting names the layers held by id, as a mask's bit does; the view holds
// them by place, which is the same number (layer-view.mjs).
/** @param {LayerView} view */
const heldIds = ({held, stack}) => held.map((at) => stack[at]?.index).filter((id) => id !== undefined);
