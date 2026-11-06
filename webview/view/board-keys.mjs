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
// A key also wears an icon for each kind of thing it reaches, a macro, a
// custom key or a pointing mode: its own keycode's first, then what its
// behaviour's branches send, in tap order. One per kind however many it
// reaches, so a key never wears more than three; the hover card names them.
//
// Dots, badges and icons mark only what runs: a behaviour or combo that a switch
// keeps off for the key, on the layer that supplies it, marks nothing there
// (firmware's participation policy).
//
// Every key carries its LED's index, which Lighting numbers each key with
// (D-L77). While an accent is edited, `accent` names the LEDs picked for it
// and the colour it lights them: a picked key shows that colour over what the
// layer paints, as the keyboard would with the accent kept, and says it is
// picked. `faces: false` leaves the marks off.

import {isOff} from "../lib/colour.mjs";
import {behaviourTiers, keyFace, keyMeaning, keyName} from "./keyface.mjs";
import {keyIdentity, reachKind} from "./key-identity.mjs";
import {behaviourRuns} from "./participation.mjs";
import {keyLed, keyLight, ownLight, stageEnabled, tierColour, trackballLed, trackballLight} from "./lighting.mjs";
/** @typedef {import("./keyface-types.js").LayerView} LayerView */
/** @typedef {import("../lib/colour.mjs").Colour} Colour */
/** @typedef {import("./key-identity.mjs").ReachKind} KeyIcon */
/** @typedef {{leds: ReadonlySet<number>, colour: Colour | null}} AccentPicks the LEDs picked for the accent being edited, and the colour it lights them, none when it would paint nothing */
/** @typedef {{faces?: boolean, pdActive?: import("./types.js").LightOptions["pdActive"] | null, comboActive?: import("./types.js").LightOptions["comboActive"] | null, accent?: AccentPicks | null}} BoardShows */

/**
 * @typedef {object} BoardKey
 * @property {number} index the layout index
 * @property {import("../../contracts/panel.js").Position | undefined} shown the key the cap shows
 * @property {import("../../contracts/panel.js").Layer | null} from the layer below that answers, through a transparent key
 * @property {import("./keyface-types.js").KeyFace["kind"]} kind
 * @property {string} meaning what the shown key means
 * @property {number | undefined} led the LED it carries
 * @property {boolean} picked whether its LED is picked for the accent being edited
 * @property {string} name what a screen reader calls the key: as the board
 *     names it, never by its layout index
 * @property {boolean} glass
 * @property {Colour} light the colour it shows
 * @property {{kind: import("./keyface-types.js").Tier, count: number, colour: Colour | null}[]} tiers one dot per tier, with the colour it flashes, none when key feedback leaves it dark
 * @property {{text: string, lit: Colour | null}[]} badges one per combo, lit in the combo feedback colour
 * @property {KeyIcon[]} icons one per kind of thing it reaches: a macro, a custom key, a pointing mode
 * @property {string} main
 * @property {string} sub
 */

/** @param {LayerView} view @param {BoardShows} [shows] @returns {BoardKey[]} */
export function boardKeys(view, {faces = true, pdActive = null, comboActive = null, accent = null} = {}) {
    const model = /** @type {import("../../contracts/panel.js").PublishedModel | null} */ (view.model ?? null);
    const {layer} = view;
    const answering = layer && view.previewing;
    const marks = faces;
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
        const led = keyLed(model, index);
        const picked = led !== undefined && Boolean(accent?.leds.has(led));
        return {
            index, shown, from, led, picked,
            kind: face.kind,
            meaning: keyMeaning(shown),
            name: keyName(shown, model),
            glass: face.kind === "transparent" || Boolean(from),
            light: picked && accent?.colour ? accent.colour : keyLight(model, layer, position, {pdActive, comboActive, held}).colour,
            tiers: runs ? behaviourTiers(behaviour).map((tier) => {
                const colour = tierColour(model, tier.kind);
                return {...tier, colour: feedbackOn && !isOff(colour) ? colour : null};
            }) : [],
            badges: marks ? view.combos.badgesAt(index).map((combo) => ({text: combo.badge || "C", lit: comboLit})) : [],
            icons: marks ? keyIcons(model, keyMeaning(shown), runs ? behaviour : undefined) : [],
            main: face.main,
            sub: face.sub,
        };
    });
}

// The trackball LED belongs to no key, but is lit like every other LED. Its
// light is glass when it is seen through the viewed layer from underneath
// rather than the layer's own (lighting.mjs ownLight).
/** @param {LayerView} view @param {BoardShows} [shows] */
export function boardTrackball(view, {pdActive = null, comboActive = null, accent = null} = {}) {
    const model = /** @type {import("../../contracts/panel.js").PublishedModel | null} */ (view.model ?? null);
    const light = trackballLight(model, /** @type {import("../../contracts/panel.js").Layer} */ (view.layer), {pdActive, comboActive, held: heldIds(view)});
    const led = trackballLed(model);
    const picked = led !== undefined && Boolean(accent?.leds.has(led));
    if (picked && accent?.colour) return {led, picked, light: accent.colour, glass: false};
    return {led, picked, light: light.colour, glass: !ownLight(light, view.layer?.index ?? 0)};
}

// Lighting names the layers held by id, as a mask's bit does; the view holds
// them by place, which is the same number (layer-view.mjs).
/** @param {LayerView} view */
const heldIds = ({held, stack}) => held.map((at) => stack[at]?.index).filter((id) => id !== undefined);

// The icons a key wears: its own keycode's, then each branch's of the
// behaviour that runs there, tap, hold and long hold in tap order.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} meaning @param {import("../../contracts/panel.js").BehaviorView | undefined} behaviour @returns {KeyIcon[]} */
function keyIcons(model, meaning, behaviour) {
    const actions = [meaning, ...(behaviour?.steps || []).flatMap((step) =>
        [step.tap, step.hold, step.longHold].map((branch) => String(branch?.action ?? "")))];
    /** @type {Set<KeyIcon>} */
    const icons = new Set();
    for (const action of actions) {
        const kind = action ? reachKind(model, action) : "";
        if (kind) icons.add(kind);
    }
    return [...icons];
}
