// @ts-check
// The behaviours a layer reaches: on its keys, under a transparent key, or
// through a combo whose output runs one; the keys the board rings for one;
// and the key whose behaviour a pick on the board opens. A screen reads them
// through the view (view.behaviours, layer-view.mjs), which works each out
// once.
import {keyMeaning} from "./keyface.mjs";
import {keyIdentity} from "./key-identity.mjs";
import {downTheStack} from "./layer-resolution.mjs";
import {comboOutput} from "./combo-reach.mjs";
import {inputOn} from "../../rules/combo-inputs.mjs";
/** @typedef {import("../../contracts/panel.js").BehaviorView} BehaviorView */
/** @typedef {import("../../contracts/panel.js").Layer} Layer */
/** @typedef {import("./keyface-types.js").ComboGroupEntry} ComboGroupEntry */
/** @typedef {import("./keyface-types.js").BehaviorCombo} BehaviorCombo */
/** @typedef {import("./keyface-types.js").BehaviourInView} BehaviourInView */
/** @typedef {import("./keyface-types.js").BehaviourKey} BehaviourKey */
/** @typedef {import("./keyface-types.js").LayerView} LayerView */
/** @typedef {import("./keyface-types.js").ResolvedKey} ResolvedKey */

// The behaviour a combo's output runs, judged from the layer its last
// declared input's key comes from, even when matching uses another reference
// layer, against the layers core publishes for it (outputBehaviorLayers).
// Several owner placements remain alternatives. A key the reference layer
// supplies comes from whichever layer the view shows there.
/** @param {LayerView} view @param {import("../../contracts/panel.js").ComboView} combo @param {ResolvedKey[]} keys */
export function comboBehaviourFor(view, combo, keys) {
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

/** @param {LayerView} view @returns {BehaviourInView[]} */
export function behavioursInView(view) {
    const {model} = view;
    /** @type {Map<string, BehaviourInView>} */
    const found = new Map();
    /** @param {BehaviorView} row */
    const add = (row) => {
        if (!found.has(row.keycode)) found.set(row.keycode, {row, keys: [], combos: []});
        // The entry was inserted above whenever it was absent.
        return /** @type {NonNullable<ReturnType<typeof found.get>>} */ (found.get(row.keycode));
    };
    for (const key of view.shown) {
        const row = keyIdentity(model, keyMeaning(key.position)).behaviour;
        if (row) add(row).keys.push(key);
    }
    for (const route of view.combos.inView) {
        const row = comboBehaviourFor(view, route.combo, route.keys);
        if (row) add(row).combos.push(route);
    }
    return [...found.values()];
}

/**
 * Behaviours, grouped by how this layer reaches them.
 *
 * A key stored on this layer reaches its behaviour directly. A transparent key
 * lets the layer underneath answer, so a behaviour stored below still fires
 * while this layer is active — that one is reached *through* the layer, and it
 * is worth naming which layer answers. A combo that sends a behaviour's
 * keycode fires it too, with no key carrying it at all. Everything else the
 * profile carries is somewhere this layer never reaches.
 */
/** @param {LayerView} view @returns {import("./keyface-types.js").BehaviourGroups} */
export function behaviourGroups(view) {
    const {model, stack} = view;
    /** @type {BehaviorView[]} */
    const here = [];
    /** @type {{row: BehaviorView; layer: Layer; whileHeld: boolean}[]} */
    const through = [];
    for (const {position, layer, fellThrough, whileHeld} of view.reachable) {
        const row = keyIdentity(model, keyMeaning(position)).behaviour;
        if (!row) continue;
        if (!fellThrough) { if (!here.includes(row)) here.push(row); }
        else if (!through.some((entry) => entry.row === row)) through.push({row, layer, whileHeld});
    }

    // A combo's output is processed like a key press, so a combo sending a
    // behaviour's keycode fires it though no key carries it. A combo chorded on
    // this layer's own keys is this layer's; one needing a transparent key is
    // reached down the stack.
    /** @type {BehaviorCombo[]} */
    const combos = [];
    /** @type {BehaviorCombo[]} */
    const combosBelow = [];
    const groupsOfCombos = view.combos.groups;
    /** @type {[ComboGroupEntry[], BehaviorCombo[]][]} */
    const routes = [[groupsOfCombos.onKeys, combos], [groupsOfCombos.throughKeys, combosBelow]];
    for (const [entries, list] of routes) {
        for (const {combo, keys, held} of entries) {
            const row = comboBehaviourFor(view.under(held.map((layer) => stack.indexOf(layer))), combo, keys);
            if (!row) continue;
            const entry = list.find((candidate) => candidate.row === row);
            if (entry) entry.combos.push({combo, keys});
            else list.push({row, combos: [{combo, keys}]});
        }
    }

    // A behaviour reached several ways is listed under each, the same as
    // anything else: the groups say how this layer gets at it, not which way won.
    const reached = new Set([...here, ...[...through, ...combos, ...combosBelow].map((entry) => entry.row)]);
    return {here, through: downTheStack(through), combos, combosBelow: downTheStack(combosBelow),
        elsewhere: (model?.keyBehaviors || []).filter((row) => !reached.has(row))};
}

/**
 * The keys the board rings for a behaviour picked under one of its routes.
 *
 * A behaviour reached several ways is listed under each group, and a pick
 * names the group it was made in — as the macro and pointing lists do — so
 * picking it under "through a combo" rings the chord, not also the transparent
 * key that happens to fall through to it. With no route, every way this layer
 * reaches it.
 */
/** @param {LayerView} view @param {string} keycode @param {import("./keyface-types.js").BehaviorRoute | null} [route] */
export function behaviourRouteKeys(view, keycode, route = null) {
    if (!keycode) return [];
    const carrying = view.reachable.filter(({position}) => keyMeaning(position) === keycode);
    const groups = view.behaviours.groups;
    /** @param {BehaviorCombo[]} entries */
    const chorded = (entries) => entries.filter((entry) => entry.row.keycode === keycode)
        .flatMap((entry) => entry.combos).flatMap((combo) => combo.keys);
    const keys = {
        view: view.behaviours.inView.filter((entry) => entry.row.keycode === keycode)
            .flatMap((entry) => [...entry.keys, ...entry.combos.flatMap((combo) => combo.keys)]),
        here: carrying.filter((entry) => !entry.fellThrough),
        through: carrying.filter((entry) => entry.fellThrough),
        combos: chorded(groups.combos),
        belowCombos: chorded(groups.combosBelow),
    };
    const chosen = route ? keys[route] || [] : Object.values(keys).flat();
    return [...new Set(chosen.map((entry) => entry.position.layoutIndex))];
}

// The key a board position opens in Behaviours. Rows are keyed by keycode, so
// a transparent position follows the key that answers it from below, through
// the layers held in a preview and the base layer, which is always on, and
// names the layer that supplies it. With nothing mapped below it stays the
// stored key. Which key answers is core's (each layer's answers): a key that
// is not transparent answers itself.
/** @param {LayerView} view @param {number | undefined} layoutIndex @returns {BehaviourKey} */
export function behaviourKeyAt(view, layoutIndex) {
    const own = (view.stack[view.at]?.positions || []).find((position) => position.layoutIndex === layoutIndex);
    const answer = own && view.answerAt(layoutIndex);
    return answer?.fellThrough ? {keycode: keyMeaning(answer.position), from: answer.layer} : {keycode: keyMeaning(own), from: null};
}
