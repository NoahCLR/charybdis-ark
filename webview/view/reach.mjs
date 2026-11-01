// @ts-check
// The reach machinery every Keymap tab shares: what a layer reaches by name,
// grouped by route or in the view the board shows, the keys the board rings
// for it, and the layers a macro or custom key is placed on. A tab reads it
// through tabReach (tab-reach.mjs).
import {keyMeaning} from "./keyface.mjs";
import {keyIdentity} from "./key-identity.mjs";
import {downTheStack} from "./layer-resolution.mjs";
import {layerView} from "./layer-view.mjs";
import {routesOf} from "./reach-routes.mjs";
/** @typedef {import("./keyface-types.js").LayerView} LayerView */
/** @typedef {import("./keyface-types.js").NamesOf} NamesOf */
/** @typedef {import("./keyface-types.js").ReachEntry} ReachEntry */
/** @typedef {import("./keyface-types.js").ReachRoute} ReachRoute */
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

/** @param {BranchCell[]} cells @param {BranchCell} cell */
const addCell = (cells, cell) => {
    if (!cells.some((item) => item.branch === cell.branch && item.tier === cell.tier)) cells.push(cell);
};

/** @typedef {Omit<ReachEntry, "name">} Reached */
// What `namesOf` names along each route, by name in the order the routes
// first name it: the keys naming it, the behaviours a branch of which sends
// it, with the cells of their grids that do, and the combos sending it,
// directly or through the behaviour their output runs. What the layer holds
// is kept apart from what it reaches only below a transparent key.
/** @param {ReachRoute[]} routes @param {NamesOf} namesOf */
function byName(routes, namesOf) {
    /** @type {Map<string, {here: Reached, below: Reached}>} */
    const found = new Map();
    /** @param {string} name @param {boolean} below */
    const reachOf = (name, below) => {
        if (!found.has(name)) found.set(name, {here: {keys: [], behaviours: [], combos: []}, below: {keys: [], behaviours: [], combos: []}});
        // The entry was inserted above whenever it was absent.
        return /** @type {NonNullable<ReturnType<typeof found.get>>} */ (found.get(name))[below ? "below" : "here"];
    };
    for (const route of routes) {
        if (route.how === "key") {
            for (const name of namesOf(route.action)) reachOf(name, route.below).keys.push(route.key);
        } else if (route.how === "behaviour") {
            const {row, layer, whileHeld} = route;
            for (const {action, cell} of route.sends) {
                for (const name of namesOf(action)) {
                    const rows = reachOf(name, route.below).behaviours;
                    // The action matters as well as the behaviour: a pointing
                    // mode answers to two keycodes, and which one a branch
                    // sends is the difference between holding and locking it.
                    const reached = rows.find((entry) => entry.keycode === row.keycode && entry.action === action);
                    if (reached) addCell(reached.cells, cell);
                    else rows.push({keycode: row.keycode, action, layer, whileHeld, cells: [cell]});
                }
            }
        } else {
            const {combo, keys, action: output} = route;
            /** @type {{action: string, via: string | null, cell?: BranchCell}[]} */
            const sends = [{action: output, via: null}, ...route.sends.map(({action, cell}) => ({action, via: output, cell}))];
            for (const {action, via, cell} of sends) {
                for (const name of namesOf(action)) {
                    const combos = reachOf(name, route.below).combos;
                    const reached = combos.find((item) => item.combo === combo && item.action === action);
                    const sent = reached || {combo, keys, via, action, cells: []};
                    if (!reached) combos.push(sent);
                    if (cell) addCell(sent.cells, cell);
                }
            }
        }
    }
    return found;
}

// What the view the board shows reaches, by name. Macros and pointing modes
// share the same view routes: a visible key, a behaviour on a visible key, or
// a combo that fires under this exact stack.
/** @param {LayerView} view @param {NamesOf} namesOf @returns {ReachEntry[]} */
export const reachInView = (view, namesOf) =>
    [...byName(routesOf(view, "view"), namesOf)].map(([name, {here}]) => ({name, ...here}));

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
/** @param {LayerView} view @param {NamesOf} namesOf @param {string[]} all @returns {import("./keyface-types.js").ReachGroup} */
export function reachGroups(view, namesOf, all) {
    const found = byName(routesOf(view, "layer"), namesOf);

    // One thing is often reached several ways, and the groups answer which way
    // rather than which way first — so it is listed under each route it has,
    // each entry carrying only that route. A macro sitting on a key here that a
    // behaviour here also fires is two answers, not one with a footnote.
    const onKeys = [], fromBranches = [], fromCombos = [], throughKeys = [], fromBranchesBelow = [], fromCombosBelow = [];
    for (const [name, {here, below}] of found) {
        if (here.keys.length) onKeys.push({name, keys: here.keys, behaviours: [], combos: []});
        if (here.behaviours.length) fromBranches.push({name, keys: [], behaviours: here.behaviours, combos: []});
        if (here.combos.length) fromCombos.push({name, keys: [], behaviours: [], combos: here.combos});
        if (below.keys.length) throughKeys.push({name, keys: below.keys, behaviours: [], combos: []});
        if (below.behaviours.length) fromBranchesBelow.push({name, keys: [], behaviours: below.behaviours, combos: []});
        if (below.combos.length) fromCombosBelow.push({name, keys: [], behaviours: [], combos: below.combos});
    }
    return {onKeys, fromBranches, fromCombos,
        throughKeys: downTheStack(throughKeys), fromBranchesBelow: downTheStack(fromBranchesBelow),
        fromCombosBelow: downTheStack(fromCombosBelow),
        elsewhere: all.filter((name) => !found.has(name))};
}
