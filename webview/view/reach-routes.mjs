// @ts-check
// Every way one layer view reaches something, walked once: a key and what it
// sends, a behaviour and what its branches send, or a combo and what it
// sends, with the behaviour that output runs. The reach lists only sort these
// routes: what a Keymap tab lists by name (reach.mjs) and the behaviours a
// layer reaches (behaviour-reach.mjs), so they cannot disagree on what a
// route is. Each walk is worked out on first read and kept for as long as its
// view is (layer-view.mjs).
import {keyMeaning} from "./keyface.mjs";
import {keyIdentity} from "./key-identity.mjs";
import {downTheStack} from "./layer-resolution.mjs";
import {comboOutput} from "./combo-reach.mjs";
import {inputOn} from "../../rules/combo-inputs.mjs";
import {keptPer} from "../lib/once.mjs";
/** @typedef {import("../../contracts/panel.js").BehaviorView} BehaviorView */
/** @typedef {import("../../contracts/panel.js").ComboView} ComboView */
/** @typedef {import("./keyface-types.js").BranchSend} BranchSend */
/** @typedef {import("./keyface-types.js").LayerView} LayerView */
/** @typedef {import("./keyface-types.js").ReachRoute} ReachRoute */
/** @typedef {import("./keyface-types.js").ResolvedKey} ResolvedKey */

/** @type {(view: LayerView, scope: string, work: () => ReachRoute[]) => ReachRoute[]} */
const ROUTES = keptPer();

/**
 * Every route `view` has, in the order the reach lists read them.
 *
 *   "view"   the view the board shows: each key on in it and the behaviour it
 *            carries, key by key, then each combo firing in it
 *            (view.combos.inView). Nothing in it is below.
 *   "layer"  every activation of the layer, which the layers held do not
 *            change: each key it can answer with (view.reachable); each
 *            behaviour once on its own keys, then each once under a
 *            transparent key, down the stack, naming the first layer that
 *            answers with it; then each combo firing from its own keys, and
 *            each that needs a transparent key (view.combos.groups).
 *
 * `below` marks a route the layer reaches only under a transparent key.
 */
/** @param {LayerView} view @param {"view" | "layer"} scope @returns {ReachRoute[]} */
export function routesOf(view, scope) {
    const owner = scope === "layer" ? view.alone : view;
    return ROUTES(owner, scope, () => scope === "layer" ? layerRoutes(owner) : viewRoutes(owner));
}

/** @param {LayerView} view @returns {ReachRoute[]} */
function viewRoutes(view) {
    const {model} = view;
    /** @type {ReachRoute[]} */
    const routes = [];
    for (const key of view.shown) {
        const action = keyMeaning(key.position);
        routes.push({how: "key", below: false, key, action});
        const row = keyIdentity(model, action).behaviour;
        if (row) routes.push({how: "behaviour", below: false, row, key, layer: key.fellThrough ? key.layer : null, whileHeld: key.whileHeld, sends: branchSends(row)});
    }
    for (const {combo, keys} of view.combos.inView) routes.push(comboRoute(view, combo, keys, false));
    return routes;
}

/** @param {LayerView} view @returns {ReachRoute[]} */
function layerRoutes(view) {
    const {model} = view;
    /** @type {ReachRoute[]} */
    const keys = [];
    /** @type {(ReachRoute & {how: "behaviour"})[]} */
    const here = [];
    /** @type {(ReachRoute & {how: "behaviour"})[]} */
    const through = [];
    for (const key of view.reachable) {
        const action = keyMeaning(key.position);
        keys.push({how: "key", below: key.fellThrough, key, action});
        const row = keyIdentity(model, action).behaviour;
        if (!row) continue;
        const list = key.fellThrough ? through : here;
        if (list.some((route) => route.row === row)) continue;
        list.push(key.fellThrough
            ? {how: "behaviour", below: true, row, layer: key.layer, whileHeld: key.whileHeld, sends: branchSends(row)}
            : {how: "behaviour", below: false, row, layer: null, whileHeld: false, sends: branchSends(row)});
    }
    // Each combo key names the layer it comes from, and one matched on a
    // reference layer needs nothing held (core/model/combo-reach.js), so the
    // layer's own view judges every combo whatever it needs held.
    const {onKeys, throughKeys} = view.combos.groups;
    /** @param {boolean} below @returns {(entry: import("./keyface-types.js").ComboGroupEntry) => ReachRoute} */
    const comboOf = (below) => ({combo, keys: pressed}) => comboRoute(view, combo, pressed, below);
    return [...keys, ...here, ...downTheStack(through), ...onKeys.map(comboOf(false)), ...throughKeys.map(comboOf(true))];
}

// A combo's output is processed like a key press, so it sends its output and,
// when that is a behaviour's keycode the combo runs, what the behaviour's
// branches send.
/** @param {LayerView} view @param {ComboView} combo @param {ResolvedKey[]} keys @param {boolean} below @returns {ReachRoute} */
function comboRoute(view, combo, keys, below) {
    const row = comboBehaviour(view, combo, keys);
    return {how: "combo", below, combo, keys, action: comboOutput(view.model, combo), row, sends: row ? branchSends(row) : []};
}

// The behaviour a combo's output runs, judged from the layer its last
// declared input's key comes from, even when matching uses another reference
// layer, against the layers core publishes for it (outputBehaviorLayers).
// Several owner placements remain alternatives. A key the reference layer
// supplies comes from whichever layer the view shows there.
/** @param {LayerView} view @param {ComboView} combo @param {ResolvedKey[]} keys */
function comboBehaviour(view, combo, keys) {
    const {model} = view;
    const layers = combo.outputBehaviorLayers ?? 0;
    const row = layers ? keyIdentity(model, comboOutput(model, combo)).behaviour : undefined;
    if (!row) return undefined;
    const owner = combo.inputs?.at(-1);
    const placements = keys.filter(({position}) => owner !== undefined && inputOn(owner, position));
    const permitted = placements.some(key => {
        const source = key.reference ? view.shownAt(key.position.layoutIndex)?.layer : key.layer;
        return source && (layers & (2 ** source.index));
    });
    return permitted ? row : undefined;
}

// Every branch of a behaviour that sends something, with the cell of its grid
// it sits in: the branch by how many taps start it, and the tier. A route
// names the cell, so "double tap and hold locks it" reads as that, not as the
// key.
/** @param {BehaviorView} row @returns {BranchSend[]} */
const branchSends = (row) => (row.steps || []).flatMap((step) =>
    /** @type {const} */ ([["tap", step.tap], ["hold", step.hold], ["long", step.longHold]])
        .flatMap(([tier, branch]) => branch?.action ? [{action: branch.action, cell: {branch: step.tapCount + 1, tier}}] : []));
