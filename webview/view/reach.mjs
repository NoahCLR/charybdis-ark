// @ts-check
// The reach machinery every Keymap tab shares: what a layer reaches by name,
// grouped by route or in the view the board shows, the keys the board rings
// for it, and the layers a macro or custom key is placed on. A tab reads it
// through tabReach (tab-reach.mjs).
import {keyMeaning} from "./keyface.mjs";
import {keyIdentity} from "./key-identity.mjs";
import {downTheStack} from "./layer-resolution.mjs";
import {layerView} from "./layer-view.mjs";
import {comboOutput} from "./combo-reach.mjs";
import {comboBehaviourFor} from "./behaviour-reach.mjs";
/** @typedef {import("../../contracts/panel.js").BehaviorView} BehaviorView */
/** @typedef {import("./keyface-types.js").ComboGroupEntry} ComboGroupEntry */
/** @typedef {import("./keyface-types.js").LayerView} LayerView */
/** @typedef {import("./keyface-types.js").ReachEntry} ReachEntry */
/** @typedef {import("./keyface-types.js").ResolvedKey} ResolvedKey */
/** @typedef {import("./keyface-types.js").BranchCell} BranchCell */
/** @typedef {import("./keyface-types.js").ViewModel} ViewModel */

// The words of a reach: the keys, as the board names them, then the layers
// they fall through to and the layers a reference matched on. A combo's row
// already names its inputs, so it leaves the keys out, and when every input is
// on the layer in view it says that, so its cell is never blank.
/** @param {{named?: string[], sources?: string[], matched?: string[]}} parts @param {{names?: boolean}} [options] */
export const reachText = ({named = [], sources = [], matched = []}, {names = true} = {}) =>
    [names ? named.join(", ") : "", sources.length ? `on ${sources.join(", ")}` : "", matched.length ? `matched on ${matched.join(", ")}` : ""]
        .filter(Boolean).join(" · ") || (names ? "—" : "this layer");

/**
 * Where to press for this, on this layer.
 *
 * The keys that name it, and — for anything a behaviour branch sends — the keys
 * carrying that behaviour, because those are the ones you actually reach it
 * through. For anything a combo sends, the keys you chord to fire it. A key answered from a layer below keeps its physical position, which
 * is what the board draws. A row On this view (`inView`) rings only the keys
 * of the layers on in that view.
 */
/** @param {LayerView} view @param {{keys?: ResolvedKey[], behaviours?: {keycode: string}[], combos?: {keys: ResolvedKey[]}[]} | null | undefined} entry @param {boolean} [inView] */
export function reachKeys(view, entry, inView = false) {
    const indexes = new Set([...(entry?.keys || []), ...(entry?.combos || []).flatMap((route) => route.keys)]
        .map((key) => key.position.layoutIndex));
    const behaviours = new Set((entry?.behaviours || []).map((row) => row.keycode));
    if (behaviours.size) {
        for (const {position} of inView ? view.shown : view.reachable) {
            if (behaviours.has(keyMeaning(position))) indexes.add(position.layoutIndex);
        }
    }
    return [...indexes];
}

// Macros and pointing modes share the same view routes: a visible key, a
// behaviour on a visible key, or a combo that fires under this exact stack.
// Every branch of a behaviour that sends something, with the cell of its grid
// it sits in: the branch by how many taps start it, and the tier. A route names
// the cell, so "double tap and hold locks it" reads as that, not as the key.
/** @param {BehaviorView} row @param {(action: string, cell: BranchCell) => void} record */
const branchActions = (row, record) => {
    for (const step of row.steps || []) {
        for (const [tier, branch] of /** @type {const} */ ([["tap", step.tap], ["hold", step.hold], ["long", step.longHold]])) {
            if (branch?.action) record(branch.action, {branch: step.tapCount + 1, tier});
        }
    }
};
/** @param {BranchCell[]} cells @param {BranchCell} cell */
const addCell = (cells, cell) => {
    if (!cells.some((item) => item.branch === cell.branch && item.tier === cell.tier)) cells.push(cell);
};

/** @param {LayerView} view @param {import("./keyface-types.js").NamesOf} namesOf */
export function reachInView(view, namesOf) {
    const {model} = view;
    /** @type {Map<string, ReachEntry>} */
    const found = new Map();
    /** @param {string} name */
    const add = (name) => {
        if (!found.has(name)) found.set(name, {name, keys: [], behaviours: [], combos: []});
        // The entry was inserted above whenever it was absent.
        return /** @type {NonNullable<ReturnType<typeof found.get>>} */ (found.get(name));
    };
    for (const key of view.shown) {
        for (const name of namesOf(keyMeaning(key.position))) add(name).keys.push(key);
        const row = keyIdentity(model, keyMeaning(key.position)).behaviour;
        if (row) branchActions(row, (action, cell) => {
            for (const name of namesOf(action)) {
                const entry = add(name);
                const found = entry.behaviours.find((item) => item.keycode === row.keycode && item.action === action);
                if (found) addCell(found.cells, cell);
                else entry.behaviours.push({keycode: row.keycode, action, layer: key.fellThrough ? key.layer : null, whileHeld: key.whileHeld, cells: [cell]});
            }
        });
    }
    for (const {combo, keys} of view.combos.inView) {
        const output = comboOutput(model, combo);
        /** @param {string} action @param {string | null} [via] @param {BranchCell} [cell] */
        const sent = (action, via = null, cell) => {
            for (const name of namesOf(action)) {
                const entry = add(name);
                const found = entry.combos.find((item) => item.combo === combo && item.action === action);
                const route = found || {combo, keys, via, action, cells: []};
                if (!found) entry.combos.push(route);
                if (cell) addCell(route.cells, cell);
            }
        };
        sent(output);
        const row = comboBehaviourFor(view, combo, keys);
        if (row) branchActions(row, (action, cell) => sent(action, output, cell));
    }
    return [...found.values()];
}

// What a keycode reaches of one kind, by the name the reach lists key it by:
// the profile's name for it (MACRO_0, CUSTOM_KEY_0) under any name it is read
// by (key-identity.mjs), and nothing for any other keycode.
/** @param {ViewModel} model @param {"macro" | "customKey"} kind @returns {import("./keyface-types.js").NamesOf} */
const namesOfKind = (model, kind) => (keycode) => {
    const name = keyIdentity(model, keycode)[kind];
    return name ? [name] : [];
};

// The macro a keycode plays, if it plays one.
/** @param {ViewModel} model */
export const macroNamesOf = (model) => namesOfKind(model, "macro");

// The custom key a keycode is, if it is one.
/** @param {ViewModel} model */
export const customKeyNamesOf = (model) => namesOfKind(model, "customKey");

/**
 * The layers a macro or a custom key is set off from, by the Keymap tab that
 * lists it, in stack order: every layer that holds a way to it itself — a key
 * naming it, a behaviour mapped there whose branch sends it (a custom key's
 * sends its shortcut, D-L63), or a combo firing from its keys that sends it,
 * directly or through a behaviour. Each route carries the group the Keymap tab
 * lists it under, so a screen can open that layer on the same row, and the
 * keys the board rings. What a layer only reaches under a transparent key is
 * the lower layer's route, listed for that layer, not repeated for every layer
 * above it. `at` is the layer's position in the stack, which is how a screen
 * selects it.
 */
/** @param {ViewModel} model @param {"macros" | "customKeys"} tab @param {string} keycode */
export function placementsOf(model, tab, keycode) {
    const namesOf = namesOfKind(model, tab === "macros" ? "macro" : "customKey");
    return (model?.layers || []).map((layer, at) => {
        const view = layerView(model, at);
        const reach = reachGroups(view, namesOf, [keycode]);
        /** @type {['here' | 'branches' | 'combos', ReachEntry[]][]} */
        const groups = [["here", reach.onKeys], ["branches", reach.fromBranches], ["combos", reach.fromCombos]];
        const routes = groups
            .map(([group, entries]) => ({group, entry: entries.find((entry) => entry.name === keycode)}))
            .filter((route) => route.entry !== undefined)
            .map((route) => {
                // The preceding filter kept only routes with an entry.
                const entry = /** @type {ReachEntry} */ (route.entry);
                return {...route, entry, keys: reachKeys(view, entry)};
            });
        return {layer, at, routes};
    }).filter((placement) => placement.routes.length);
}

/**
 * How this layer reaches a set of things named by keycode — the one shape the
 * Macros and Pointing modes tabs both group by, so they cannot drift apart.
 *
 *   on this layer        a key here names it
 *   through a behaviour  a branch of a behaviour mapped here sends it, which
 *                        no key cap can show
 *   through this layer   a transparent key lets a lower layer's key name it
 *   through a combo      a combo firing from this layer's keys sends it —
 *                        or sends a behaviour whose branch does, since a
 *                        combo's output runs through the same stages a key
 *                        press does
 *   through a behaviour  a transparent key lets a lower layer's behaviour
 *     below              answer, and one of its branches sends it
 *   through a combo      a combo that needs a transparent key to fire sends
 *     below              it, directly or through a behaviour
 *   elsewhere            the profile carries it, this layer reaches it no way
 *
 * The first three are what this layer itself holds, which is what a tab counts;
 * the rest it only reaches down the stack. `namesOf(keycode)` answers which
 * of the things a keycode names, as stable string keys, and `all` is every name
 * worth reporting as unreached.
 */
/** @param {LayerView} view @param {import("./keyface-types.js").NamesOf} namesOf @param {string[]} all @returns {import("./keyface-types.js").ReachGroup} */
export function reachGroups(view, namesOf, all) {
    const {model, stack} = view;
    /** @type {Map<string, import("./keyface-types.js").ReachRecord>} */
    const found = new Map();
    /** @param {string} name */
    const reachOf = (name) => {
        if (!found.has(name)) found.set(name, {directKeys: [], fellKeys: [], directRows: [], belowRows: [], directCombos: [], belowCombos: []});
        // The entry was inserted above whenever it was absent.
        return /** @type {NonNullable<ReturnType<typeof found.get>>} */ (found.get(name));
    };

    for (const {position, layer, fellThrough, whileHeld} of view.reachable) {
        for (const name of namesOf(keyMeaning(position))) {
            reachOf(name)[fellThrough ? "fellKeys" : "directKeys"].push({position, layer, fellThrough, whileHeld});
        }
    }

    // Every behaviour this layer can fire, including the ones it only reaches
    // because a transparent key lets the default layer answer. Those carry the
    // layer that holds them, so a row can say so.
    const {here, through} = view.behaviours.groups;
    for (const {row, from, whileHeld} of [...here.map((row) => ({row, from: null, whileHeld: false})),
        ...through.map((item) => ({row: item.row, from: item.layer, whileHeld: item.whileHeld}))]) {
        branchActions(row, (action, cell) => {
            for (const name of namesOf(action)) {
                const rows = reachOf(name)[from ? "belowRows" : "directRows"];
                // The action matters as well as the behaviour: a pointing
                // mode answers to two keycodes, and which one a branch
                // sends is the difference between holding and locking it.
                const found = rows.find((entry) => entry.keycode === row.keycode && entry.action === action);
                if (found) addCell(found.cells, cell);
                else rows.push({keycode: row.keycode, action, layer: from, whileHeld, cells: [cell]});
            }
        });
    }

    // A combo's output is processed like a key press, so it reaches what it
    // sends and, when that is a behaviour's keycode, what the behaviour's
    // branches send. A combo firing from this layer's own keys is this layer's;
    // one that needs a transparent key is reached down the stack.
    const combos = view.combos.groups;
    /** @type {[ComboGroupEntry[], boolean][]} */
    const comboRoutes = [[combos.onKeys, false], [combos.throughKeys, true]];
    for (const [entries, below] of comboRoutes) {
        for (const {combo, keys, held} of entries) {
            const output = comboOutput(model, combo);
            /** @type {{action: string; via: string | null; cell?: BranchCell}[]} */
            const sends = [{action: output, via: null}];
            const row = comboBehaviourFor(view.under(held.map((layer) => stack.indexOf(layer))), combo, keys);
            if (row) branchActions(row, (action, cell) => sends.push({action, via: output, cell}));
            for (const {action, via, cell} of sends) {
                for (const name of namesOf(action)) {
                    const routes = reachOf(name)[below ? "belowCombos" : "directCombos"];
                    const found = routes.find((route) => route.combo === combo && route.action === action);
                    const route = found || {combo, via, action, keys, cells: []};
                    if (!found) routes.push(route);
                    if (cell) addCell(route.cells, cell);
                }
            }
        }
    }

    // One thing is often reached several ways, and the groups answer which way
    // rather than which way first — so it is listed under each route it has,
    // each entry carrying only that route. A macro sitting on a key here that a
    // behaviour here also fires is two answers, not one with a footnote.
    const onKeys = [], fromBranches = [], fromCombos = [], throughKeys = [], fromBranchesBelow = [], fromCombosBelow = [];
    for (const [name, reach] of found) {
        if (reach.directKeys.length) onKeys.push({name, keys: reach.directKeys, behaviours: [], combos: []});
        if (reach.directRows.length) fromBranches.push({name, keys: [], behaviours: reach.directRows, combos: []});
        if (reach.directCombos.length) fromCombos.push({name, keys: [], behaviours: [], combos: reach.directCombos});
        if (reach.fellKeys.length) throughKeys.push({name, keys: reach.fellKeys, behaviours: [], combos: []});
        if (reach.belowRows.length) fromBranchesBelow.push({name, keys: [], behaviours: reach.belowRows, combos: []});
        if (reach.belowCombos.length) fromCombosBelow.push({name, keys: [], behaviours: [], combos: reach.belowCombos});
    }
    return {onKeys, fromBranches, fromCombos,
        throughKeys: downTheStack(throughKeys), fromBranchesBelow: downTheStack(fromBranchesBelow),
        fromCombosBelow: downTheStack(fromCombosBelow),
        elsewhere: all.filter((name) => !found.has(name))};
}
