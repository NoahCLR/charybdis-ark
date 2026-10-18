// @ts-check
// What the Keys board's layer plate says about how a layer is reached: one
// line per way in, in words, from core's walk (draft.layerWays, core/model/
// layer-reach.js layerWays). The walk decides what counts; this only names it.
//
// A key whose own keycode does it reads by its name, which already says how
// ("Hold Number", "Lock Symbol"); one of its behaviour's actions reads as the
// gesture that runs it ("Double-tap Left Thumb (lock)"). A way from a layer
// other than a default layer says which layer it is on.

import {keyName} from "./keyface.mjs";
import {vocabulary} from "./vocabulary.mjs";

/** @typedef {import("../../contracts/panel.js").PublishedModel | null | undefined} Model */
/** @typedef {import("../../contracts/model.js").LayerWay} LayerWay */

const PRESS_WORDS = /** @type {const} */ ({tap: "Tap", hold: "Hold", longHold: "Long hold"});
const TAP_WORDS = ["Tap", "Double-tap", "Triple-tap"];

// The gesture that runs a behaviour's action, short enough for the plate: the
// taps that start it, then the press itself ("Double-tap Left Thumb",
// "Tap+hold Left Thumb", "2 taps+long hold Right Thumb").
/** @param {LayerWay} way @param {string} name */
function gesture(way, name) {
    if (way.press === "tap") return TAP_WORDS[way.tapIndex] ? `${TAP_WORDS[way.tapIndex]} ${name}` : `${way.tapIndex + 1} taps ${name}`;
    const press = PRESS_WORDS[way.press];
    if (!way.tapIndex) return `${press} ${name}`;
    return `${way.tapIndex === 1 ? "Tap" : `${way.tapIndex} taps`}+${press.toLowerCase()} ${name}`;
}

/** @param {Model} model @param {number} layerIndex keyboard layer */
const layerAt = (model, layerIndex) => (model?.layers || []).find((layer) => layer.index === layerIndex);

// One way in, as a line, with the key it names (null for a combo or the
// trackball) so the plate can show it.
/** @param {Model} model @param {LayerWay} way @param {readonly number[]} defaults */
export function wayLine(model, way, defaults) {
    const verbs = vocabulary(model).layerWayVerbs || {};
    const verb = verbs[way.verb] || way.verb;
    if ("trackball" in way.from) return {text: "Moving the trackball", key: null};
    if ("combo" in way.from) {
        const index = way.from.combo;
        const combo = (model?.combos || []).find((row) => row.id === index) || model?.combos?.[index];
        const inputs = combo ? (combo.inputDisplays?.length ? combo.inputDisplays : combo.inputs).join(" + ") : `combo ${index}`;
        return {text: `${way.press === "hold" ? "Hold " : ""}${inputs} together (${verb})`, key: null};
    }
    const {layer, layoutIndex} = way.from;
    const source = layerAt(model, layer);
    const position = source?.positions.find((entry) => entry.layoutIndex === layoutIndex);
    const name = position ? keyName(position) : `key ${layoutIndex}`;
    // A hold that holds says nothing more; any other effect names itself.
    const plain = way.verb === "hold" && way.press !== "tap";
    // A layer-tap's own way in is its hold, named by the key it taps.
    const layerTap = way.own && way.press === "hold" && /^LT\(/.test(position?.keycode || "") && position?.display;
    const text = layerTap ? `Hold ${layerTap}` : way.own && !way.tapIndex ? name : `${gesture(way, name)}${plain ? "" : ` (${verb})`}`;
    const where = defaults.includes(layer) ? "" : ` on ${source?.displayName || source?.name || `Layer ${layer}`}`;
    return {text: `${text}${where}`, key: {layer, layoutIndex}};
}

// How the layer at keyboard index `layerIndex` is reached: always on (a
// default layer), the ways in (at most `limit` lines and how many more), not
// reached by anything, or unknown when the walk could not tell or no draft
// published it. Lines that read the same are said once.
/** @param {Model} model @param {number} layerIndex @param {{limit?: number}} [options] */
export function layerReachLines(model, layerIndex, {limit = 3} = {}) {
    const ways = model?.draft?.layerWays;
    if (!ways) return {state: /** @type {const} */ ("unknown"), lines: [], more: 0};
    if (ways.defaults.includes(layerIndex)) return {state: /** @type {const} */ ("default"), lines: [], more: 0};
    const entry = ways.layers.find((row) => row.layer === layerIndex);
    /** @type {ReturnType<typeof wayLine>[]} */
    const lines = [];
    for (const way of entry?.ways || []) {
        const line = wayLine(model, way, ways.defaults);
        if (!lines.some((known) => known.text === line.text)) lines.push(line);
    }
    if (!lines.length) return {state: entry?.reached === false ? /** @type {const} */ ("unreached") : /** @type {const} */ ("unknown"), lines: [], more: 0};
    return {state: /** @type {const} */ ("reached"), lines: lines.slice(0, limit), more: Math.max(0, lines.length - limit)};
}
