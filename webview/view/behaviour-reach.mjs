// @ts-check
// The behaviours a layer reaches: on its keys, under a transparent key, or
// through a combo whose output runs one; and the keys the board rings for one.
import {behaviourFor, keyMeaning} from "./keyface.mjs";
import {reachablePositions, viewPositions, downTheStack} from "./layer-resolution.mjs";
import {comboGroups, comboOutput, combosInView} from "./combo-reach.mjs";
import {inputOn} from "../../rules/combo-inputs.mjs";
/** @typedef {import("../../contracts/panel.js").BehaviorView} BehaviorView */
/** @typedef {import("../../contracts/panel.js").Layer} Layer */
/** @typedef {import("./keyface-types.js").ComboGroupEntry} ComboGroupEntry */
/** @typedef {import("./keyface-types.js").BehaviorCombo} BehaviorCombo */
/** @typedef {import("./keyface-types.js").ComboRoute} ComboRoute */
/** @typedef {import("./keyface-types.js").ResolvedKey} ResolvedKey */
/** @typedef {import("./keyface-types.js").ViewModel} ViewModel */

// The behaviour a combo's output runs, judged from the layer its last
// declared input's key comes from, even when matching uses another reference
// layer, against the layers core publishes for it (outputBehaviorLayers).
// Several owner placements remain alternatives.
/** @param {ViewModel} model @param {import("../../contracts/panel.js").ComboView} combo @param {ResolvedKey[]} keys @param {Layer[]} stack @param {number} at @param {number[]} [held] */
export function comboBehaviourFor(model, combo, keys, stack, at, held = []) {
    const layers = combo.outputBehaviorLayers ?? 0;
    const row = layers ? behaviourFor(model, comboOutput(model, combo)) : undefined;
    if (!row) return undefined;
    const owner = combo.inputs?.at(-1);
    const placements = keys.filter(({position}) => owner !== undefined && inputOn(owner, position));
    const physical = placements.some(key => key.reference) ? viewPositions(stack, at, held) : [];
    const permitted = placements.some(key => {
        const source = key.reference ? physical.find(entry => entry.position.layoutIndex === key.position.layoutIndex)?.layer : key.layer;
        return source && (layers & (2 ** source.index));
    });
    return permitted ? row : undefined;
}

/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {number[]} [held] */
export function behavioursInView(model, stack, at, held = []) {
    /** @type {Map<string, {row: BehaviorView; keys: ResolvedKey[]; combos: ComboRoute[]}>} */
    const found = new Map();
    /** @param {BehaviorView} row */
    const add = (row) => {
        if (!found.has(row.keycode)) found.set(row.keycode, {row, keys: [], combos: []});
        // The entry was inserted above whenever it was absent.
        return /** @type {NonNullable<ReturnType<typeof found.get>>} */ (found.get(row.keycode));
    };
    for (const key of viewPositions(stack, at, held)) {
        const row = behaviourFor(model, keyMeaning(key.position));
        if (row) add(row).keys.push(key);
    }
    for (const route of combosInView(model, stack, at, held)) {
        const row = comboBehaviourFor(model, route.combo, route.keys, stack, at, held);
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
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at */
export function behaviourGroups(model, stack, at) {
    /** @type {BehaviorView[]} */
    const here = [];
    /** @type {{row: BehaviorView; layer: Layer; whileHeld: boolean}[]} */
    const through = [];
    for (const {position, layer, fellThrough, whileHeld} of reachablePositions(stack, at)) {
        const row = behaviourFor(model, keyMeaning(position));
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
    const groupsOfCombos = comboGroups(model, stack, at);
    /** @type {[ComboGroupEntry[], BehaviorCombo[]][]} */
    const routes = [[groupsOfCombos.onKeys, combos], [groupsOfCombos.throughKeys, combosBelow]];
    for (const [entries, list] of routes) {
        for (const {combo, keys, held} of entries) {
            const row = comboBehaviourFor(model, combo, keys, stack, at, held.map(layer => layer.index));
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
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {string} keycode @param {import("./keyface-types.js").BehaviorRoute | null} [route] @param {number[]} [held] */
export function behaviourRouteKeys(model, stack, at, keycode, route = null, held = []) {
    if (!keycode) return [];
    const carrying = reachablePositions(stack, at).filter(({position}) => keyMeaning(position) === keycode);
    const groups = behaviourGroups(model, stack, at);
    /** @param {BehaviorCombo[]} entries */
    const chorded = (entries) => entries.filter((entry) => entry.row.keycode === keycode)
        .flatMap((entry) => entry.combos).flatMap((combo) => combo.keys);
    const keys = {
        view: behavioursInView(model, stack, at, held).filter((entry) => entry.row.keycode === keycode)
            .flatMap((entry) => [...entry.keys, ...entry.combos.flatMap((combo) => combo.keys)]),
        here: carrying.filter((entry) => !entry.fellThrough),
        through: carrying.filter((entry) => entry.fellThrough),
        combos: chorded(groups.combos),
        belowCombos: chorded(groups.combosBelow),
    };
    const chosen = route ? keys[route] || [] : Object.values(keys).flat();
    return [...new Set(chosen.map((entry) => entry.position.layoutIndex))];
}
