// @ts-check
import {actionLabel, behaviourFor, canonicalKeycode, keyMeaning, layerOfKeycode} from "./keyface.mjs";
import {reachablePositions, viewPositions, downTheStack} from "./layer-resolution.mjs";
import {comboGroups, comboOutput, combosInView, comboInputOn} from "./combo-reach.mjs";
/** @typedef {import("../../contracts/panel.js").BehaviorView} BehaviorView */
/** @typedef {import("../../contracts/panel.js").Layer} Layer */
/** @typedef {import("./keyface-types.js").PointingSlot} PointingSlot */
/** @typedef {import("./keyface-types.js").ComboGroupEntry} ComboGroupEntry */
/** @typedef {import("./keyface-types.js").BehaviorCombo} BehaviorCombo */
/** @typedef {import("./keyface-types.js").ComboRoute} ComboRoute */
/** @typedef {import("./keyface-types.js").ReachEntry} ReachEntry */
/** @typedef {import("./keyface-types.js").BranchCell} BranchCell */
/** @typedef {import("./keyface-types.js").ResolvedKey} ResolvedKey */
/** @typedef {import("./keyface-types.js").ViewModel} ViewModel */
// Generated outputs use the last declared input's physical source, even
// when matching uses another reference layer. Physical bypass/layer switches
// never veto a generated output. Several owner placements remain alternatives.
/** @param {ViewModel} model @param {import("../../contracts/panel.js").ComboView} combo @param {ResolvedKey[]} keys @param {Layer[]} stack @param {number} at @param {number[]} [held] */
function comboBehaviourFor(model, combo, keys, stack, at, held = []) {
    if (combo.useOutputBehavior === false || model?.participation?.comboOutputBehaviors === false || model?.participation?.behaviorsEnabled === false) return undefined;
    const row = behaviourFor(model, comboOutput(model, combo));
    if (!row || row.enabled === false) return undefined;
    const owner = combo.inputs?.at(-1);
    const placements = keys.filter(({position}) => owner !== undefined && comboInputOn(owner, position));
    const physical = placements.some(key => key.reference) ? viewPositions(stack, at, held) : [];
    const permitted = placements.some(key => {
        const source = key.reference ? physical.find(entry => entry.position.layoutIndex === key.position.layoutIndex)?.layer : key.layer;
        return source && ((row.allowedLayers ?? 0xffff) & (2 ** source.index));
    });
    return permitted ? row : undefined;
}

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
 * is what the board draws. With `held`, a row On this view rings only the
 * keys of the layers on in that view.
 */
/** @param {Layer[]} stack @param {number} at @param {Partial<Pick<ReachEntry, "keys" | "behaviours" | "combos">> | null | undefined} entry @param {number[] | null} [held] */
export function reachKeys(stack, at, entry, held = null) {
    const indexes = new Set([...(entry?.keys || []), ...(entry?.combos || []).flatMap((route) => route.keys)]
        .map((key) => key.position.layoutIndex));
    const behaviours = new Set((entry?.behaviours || []).map((row) => row.keycode));
    if (behaviours.size) {
        for (const {position} of held === null ? reachablePositions(stack, at) : viewPositions(stack, at, held)) {
            if (behaviours.has(keyMeaning(position))) indexes.add(position.layoutIndex);
        }
    }
    return [...indexes];
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

/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {number[]} held @param {import("./keyface-types.js").NamesOf} namesOf */
export function reachInView(model, stack, at, held, namesOf) {
    /** @type {Map<string, ReachEntry>} */
    const found = new Map();
    /** @param {string} name */
    const add = (name) => {
        if (!found.has(name)) found.set(name, {name, keys: [], behaviours: [], combos: []});
        // The entry was inserted above whenever it was absent.
        return /** @type {NonNullable<ReturnType<typeof found.get>>} */ (found.get(name));
    };
    for (const key of viewPositions(stack, at, held)) {
        for (const name of namesOf(keyMeaning(key.position))) add(name).keys.push(key);
        const row = behaviourFor(model, keyMeaning(key.position));
        if (row) branchActions(row, (action, cell) => {
            for (const name of namesOf(action)) {
                const entry = add(name);
                const found = entry.behaviours.find((item) => item.keycode === row.keycode && item.action === action);
                if (found) addCell(found.cells, cell);
                else entry.behaviours.push({keycode: row.keycode, action, layer: key.fellThrough ? key.layer : null, whileHeld: key.whileHeld, cells: [cell]});
            }
        });
    }
    for (const {combo, keys} of combosInView(model, stack, at, held)) {
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
        const row = comboBehaviourFor(model, combo, keys, stack, at, held);
        if (row) branchActions(row, (action, cell) => sent(action, output, cell));
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
/** @param {string | undefined} keycode */
export const macroKeycodes = (keycode) =>
    [...String(keycode || "").matchAll(/\b((?:VIA_)?MACRO_\d+)\b/g)].map((match) => match[1]);

/**
 * The layers a macro is set off from, in stack order: every layer that holds a
 * way to it itself — a key naming it, a behaviour mapped there whose branch
 * sends it, or a combo firing from its keys that sends it, directly or through
 * a behaviour. Each route carries the group the Keys tab lists it under, so a
 * screen can open that layer on the same row, and the keys the board rings.
 * What a layer only reaches under a transparent key is the lower layer's route,
 * listed for that layer, not repeated for every layer above it. `at` is the
 * layer's position in the stack, which is how a screen selects it.
 */
/** @param {ViewModel} model @param {Layer[]} stack @param {string} keycode */
export const macroPlacements = (model, stack, keycode) => placementsVia(macroReach, model, stack, keycode);

/** @param {string | undefined} keycode */
export const customKeyKeycodes = (keycode) =>
    [...String(keycode || "").matchAll(/\b(CUSTOM_KEY_\d+)\b/g)].map((match) => match[1]);

// Where a custom key is placed, whatever it does: a key carrying it, a
// behaviour branch sending it (which sends its shortcut, D-L63) or a combo
// sending it.
/** @param {ViewModel} model @param {Layer[]} stack @param {string} keycode */
export const customKeyPlacements = (model, stack, keycode) => placementsVia(
    (m, s, at) => reachGroups(m, s, at, customKeyKeycodes, [keycode]), model, stack, keycode);

/** @param {import("./keyface-types.js").ReachOf} reachOf @param {ViewModel} model @param {Layer[]} stack @param {string} keycode */
function placementsVia(reachOf, model, stack, keycode) {
    return (stack || []).map((layer, at) => {
        const reach = reachOf(model, stack, at);
        /** @type {['here' | 'branches' | 'combos', ReachEntry[]][]} */
        const groups = [["here", reach.onKeys], ["branches", reach.fromBranches], ["combos", reach.fromCombos]];
        const routes = groups
            .map(([group, entries]) => ({group, entry: entries.find((entry) => entry.name === keycode)}))
            .filter((route) => route.entry !== undefined)
            .map((route) => {
                // The preceding filter kept only routes with an entry.
                const entry = /** @type {ReachEntry} */ (route.entry);
                return {...route, entry, keys: reachKeys(stack, at, entry)};
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
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {import("./keyface-types.js").NamesOf} namesOf @param {string[]} all @returns {import("./keyface-types.js").ReachGroup} */
export function reachGroups(model, stack, at, namesOf, all) {
    /** @type {Map<string, import("./keyface-types.js").ReachRecord>} */
    const found = new Map();
    /** @param {string} name */
    const reachOf = (name) => {
        if (!found.has(name)) found.set(name, {directKeys: [], fellKeys: [], directRows: [], belowRows: [], directCombos: [], belowCombos: []});
        // The entry was inserted above whenever it was absent.
        return /** @type {NonNullable<ReturnType<typeof found.get>>} */ (found.get(name));
    };

    for (const {position, layer, fellThrough, whileHeld} of reachablePositions(stack, at)) {
        for (const name of namesOf(keyMeaning(position))) {
            reachOf(name)[fellThrough ? "fellKeys" : "directKeys"].push({position, layer, fellThrough, whileHeld});
        }
    }

    // Every behaviour this layer can fire, including the ones it only reaches
    // because a transparent key lets the default layer answer. Those carry the
    // layer that holds them, so a row can say so.
    const {here, through} = behaviourGroups(model, stack, at);
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
    const combos = comboGroups(model, stack, at);
    /** @type {[ComboGroupEntry[], boolean][]} */
    const comboRoutes = [[combos.onKeys, false], [combos.throughKeys, true]];
    for (const [entries, below] of comboRoutes) {
        for (const {combo, keys, held} of entries) {
            const output = comboOutput(model, combo);
            /** @type {{action: string; via: string | null; cell?: BranchCell}[]} */
            const sends = [{action: output, via: null}];
            const row = comboBehaviourFor(model, combo, keys, stack, at, held.map(layer => layer.index));
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

/**
 * Macro slots, grouped by how this layer sets them off.
 *
 * A key on this layer can carry a macro keycode, which the board shows. A
 * transparent key lets a lower layer's macro key answer instead, which the
 * board shows only as falling through. A behaviour this layer reaches can fire
 * one from any of its branches, and that the board cannot show at all, because
 * the key cap carries the behaviour, not what its branches send. The rest are
 * slots holding a payload nothing here reaches.
 */
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at */
export const macroReach = (model, stack, at) => reachGroups(model, stack, at, macroKeycodes,
    (model?.macros || [])
        // An empty slot is not a macro this layer is missing, it is a slot.
        .filter((slot) => !slot.empty).map((slot) => slot.keycode));

/**
 * Pointing modes, grouped the same four ways. A mode is reached by the key that
 * holds or locks it, by a transparent key letting a lower one do so, or by a
 * behaviour branch or combo that sends its keycode. A layer that starts it
 * (its link, firmware D-F62) reaches it by turning on: On this layer, with no
 * key at all, and wherever a route turns that layer on (startedRoutes).
 */
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @returns {import("./keyface-types.js").ReachGroup} */
export const pointingReach = (model, stack, at) => {
    // A slot with no movement cannot be activated, so it is not a mode this
    // layer is missing either.
    const all = (model?.pdModes || []).filter((slot) => slot.kind).map((slot) => String(slot.id));
    const reach = reachGroups(model, stack, at, pointingNamesOf(model), all);
    const layer = stack[at]?.index ?? at, on = 2 ** layer;
    /** @param {ReachEntry[]} entries */
    const kept = (entries) => startedRoutes(model, entries, on);
    const groups = {onKeys: withLinkStarts(model, stack, [layer], kept(reach.onKeys)), fromBranches: kept(reach.fromBranches), fromCombos: kept(reach.fromCombos),
        throughKeys: kept(reach.throughKeys), fromBranchesBelow: kept(reach.fromBranchesBelow), fromCombosBelow: kept(reach.fromCombosBelow)};
    const reached = new Set(Object.values(groups).flat().map((entry) => entry.name));
    return {...groups, elsewhere: all.filter((name) => !reached.has(name))};
};

/**
 * The pointing modes reached by the layers on in the view the board shows:
 * the routes reachInView finds that reach a mode with those layers on, and
 * every mode a layer in view starts. A layer shown alone is the view by
 * itself; base joins once layers are held, as in viewPositions.
 */
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at @param {number[]} held */
export function pointingReachInView(model, stack, at, held) {
    const view = held.length ? [0, at, ...held] : [at];
    const on = view.reduce((mask, layer) => mask | 2 ** layer, 0);
    return withLinkStarts(model, stack, view, startedRoutes(model, reachInView(model, stack, at, held, pointingNamesOf(model)), on));
}

// What may reach a pointing mode: its own keycodes, and any keycode that turns
// on a layer starting it. Whether that start happens where the keycode is
// pressed is startedRoutes', which knows the layers on there.
/** @param {ViewModel} model @returns {import("./keyface-types.js").NamesOf} */
const pointingNamesOf = (model) => (keycode) => {
    const slot = pointingSlotFor(model, keycode);
    const turnsOn = layersTurnedOn(model, keycode);
    const started = turnsOn ? (model?.pdModes || []).filter((entry) => entry !== slot
        && (entry.linkStarts || []).some((start) => turnsOn & 2 ** start.layer)) : [];
    return [...(slot ? [slot] : []), ...started].map((entry) => String(entry.id));
};

// The layers a keycode turns on, as the core publishes them (qmkKeyTurnsOn,
// core/model/layer-reach.js keycodeLayersOn), read under the stored name, the
// name the core knows it by, or however the expression is spelled.
/** @param {ViewModel} model @param {string | undefined} keycode */
function layersTurnedOn(model, keycode) {
    const table = model?.qmkKeyTurnsOn || {}, name = String(keycode ?? "");
    for (const key of [name, model?.qmkKeycodeAliases?.[name], canonicalKeycode(model, name)]) {
        if (key && Number.isInteger(table[key])) return table[key] >>> 0;
    }
    return 0;
}

// The layers by which `keycode` starts a slot's mode, as a mask: the layers it
// turns on that start the mode (slot.linkStarts, core/model/pointing-links.js),
// each only while no layer ending a start from it is on, with `on` (the layers
// on where it is pressed) and the layers it turns on. Zero for none.
/** @param {ViewModel} model @param {PointingSlot} slot @param {string | undefined} keycode @param {number} on */
function pointingStartsVia(model, slot, keycode, on) {
    const turnsOn = layersTurnedOn(model, keycode), active = on | turnsOn;
    return (slot.linkStarts || []).reduce((mask, start) =>
        turnsOn & 2 ** start.layer && !(start.ends & active) ? mask | 2 ** start.layer : mask, 0) >>> 0;
}

// Of each entry, the routes that reach its mode as the keyboard runs it: those
// sending one of its own keycodes, and those that start it by turning on one
// of its layers as they act, with the layer they are pressed on still on
// (`on`), and, for a key or a behaviour a transparent key answers from a layer
// held below, that layer too. An entry left with no route is dropped. Each
// entry records, by keycode, the layers its routes start it through
// (`startVia`), so the tab says so without working it out again.
/** @param {ViewModel} model @param {ReachEntry[]} entries @param {number} on @returns {ReachEntry[]} */
function startedRoutes(model, entries, on) {
    /** @param {Layer | null | undefined} layer @param {boolean | undefined} whileHeld */
    const heldBelow = (layer, whileHeld) => (whileHeld && layer ? 2 ** layer.index : 0);
    return entries.flatMap((entry) => {
        const slot = (model?.pdModes || []).find((item) => String(item.id) === entry.name);
        if (!slot) return [entry];
        /** @type {Record<string, number>} */
        const startVia = {};
        /** @param {string} keycode @param {number} held */
        const reaches = (keycode, held) => {
            if (pointingSlotFor(model, keycode) === slot) return true;
            const mask = pointingStartsVia(model, slot, keycode, on | held);
            if (mask) startVia[keycode] = (startVia[keycode] ?? 0) | mask;
            return mask !== 0;
        };
        const keys = entry.keys.filter((key) => reaches(keyMeaning(key.position), heldBelow(key.layer, key.whileHeld)));
        const behaviours = entry.behaviours.filter((row) => reaches(row.action, heldBelow(row.layer, row.whileHeld)));
        const combos = entry.combos.filter((route) => reaches(route.action, route.keys.reduce((mask, key) => mask | heldBelow(key.layer, key.whileHeld), 0)));
        if (!keys.length && !behaviours.length && !combos.length) return [];
        return [{...entry, keys, behaviours, combos, ...(Object.keys(startVia).length ? {startVia} : {})}];
    });
}

// The layers of `on` that start each mode with all of them on, added to the
// entries a layer's keys reach: on the mode's entry if it has one, or as an
// entry of their own after the rest (slot.linkStarts, which leaves out the
// layers the keyboard ignores in a link).
/** @param {ViewModel} model @param {Layer[]} stack @param {number[]} on @param {ReachEntry[]} entries @returns {ReachEntry[]} */
function withLinkStarts(model, stack, on, entries) {
    const active = on.reduce((mask, layer) => mask | 2 ** layer, 0);
    const result = entries.map((entry) => ({...entry}));
    for (const slot of model?.pdModes || []) {
        const starts = (slot.linkStarts || []).filter((start) => active & 2 ** start.layer && !(start.ends & active))
            .map((start) => stack.find((layer) => layer.index === start.layer)).filter((layer) => layer !== undefined);
        if (!starts.length) continue;
        const entry = result.find((item) => item.name === String(slot.id));
        if (entry) entry.starts = starts;
        else result.push({name: String(slot.id), keys: [], behaviours: [], combos: [], starts});
    }
    return result;
}

// A layout position carries the keyboard's own name for its keycode, which for
// a pointing mode is a bare user keycode (`QK_USER_16`) or, for a slot the
// vocabulary does not name at all, its hex. So resolve the alias the model
// published first, then fall back to the number: an empty slot has no name to
// match on, and its keycodes exist regardless.
/** @param {ViewModel} model @param {string | number | undefined} keycode */
export function pointingSlotFor(model, keycode) {
    const slots = model?.pdModes || [];
    const alias = model?.qmkKeycodeAliases?.[keycode ?? ""] ?? keycode;
    const named = slots.find((slot) => slot.keys && [slot.keys.hold, slot.keys.lock].includes(String(alias || "")));
    if (named) return named;
    const value = typeof keycode === "number" ? keycode : /^0x[0-9a-f]+$/i.test(String(keycode)) ? Number(keycode) : NaN;
    return Number.isInteger(value) ? slots.find((slot) => slotKeycodes(slot).includes(value)) : undefined;
}

// Which of a slot's two keycodes this is. Everything else about the mode is the
// same either way, so holding it or locking it on is the only thing a route
// has to carry beyond the slot itself.
/** @param {ViewModel} model @param {string | number | undefined} keycode */
export function pointingVariant(model, keycode) {
    const alias = model?.qmkKeycodeAliases?.[keycode ?? ""] ?? keycode;
    if (/_LOCK$/.test(String(alias))) return "lock";
    const slot = pointingSlotFor(model, keycode);
    const value = typeof keycode === "number" ? keycode
        : /^0x[0-9a-f]+$/i.test(String(keycode)) ? Number(keycode) : NaN;
    if (slot && Number.isInteger(value) && slotKeycodes(slot)[1] === value) return "lock";
    return "hold";
}

// A branch or combo action read as the pointing mode it sends: the slot, the
// name it goes by, and whether the key holds the mode or locks it on. Null
// for any other action. An empty slot keeps its keycodes, so it still
// resolves, marked empty.
/** @param {ViewModel} model @param {string} action */
export function pointingAction(model, action) {
    const slot = pointingSlotFor(model, action);
    if (!slot) return null;
    return {
        slot,
        name: slot.displayName || slot.name || `Slot ${slot.id}`,
        how: pointingVariant(model, action),
        empty: !slot.kind,
    };
}

// A branch or combo action read as the macro it plays: the slot and the name
// it was given, or its number when it has none. Null for anything but a bare
// macro keycode.
/** @param {ViewModel} model @param {string} action */
export function macroAction(model, action) {
    const [keycode] = macroKeycodes(action);
    if (!keycode || keycode !== String(action).trim()) return null;
    const slot = (model?.macros || []).find((row) => row.keycode === keycode);
    return {slot, keycode, name: slot?.name || `Macro ${keycode.split("_").at(-1)}`, empty: Boolean(slot?.empty)};
}

// A branch or combo action read as the layer it acts on: the layer, the name
// it goes by, and what the action does to it, in the words the key's name puts
// beside the layer's ("Hold", "Lock", "+ Shift"; core/model/key-names.js). Null
// for any other action, for a layer-tap, which is a tap and a layer at once,
// and for a name that does not carry the layer's.
/** @param {ViewModel} model @param {string} action */
export function layerAction(model, action) {
    const at = layerOfKeycode(model, action);
    if (at === null || /^LT\(/.test(canonicalKeycode(model, action))) return null;
    const layer = model?.layers?.[at];
    const name = layer ? layer.displayName || layer.name : "";
    const label = actionLabel(model, action);
    if (!name) return null;
    const how = label.endsWith(name) ? label.slice(0, -name.length) : label.startsWith(name) ? label.slice(name.length) : null;
    return how === null ? null : {layer: at, name, how: how.trim()};
}

// An action that names something the person set up — a layer, a pointing mode
// or a macro — as that thing: what kind it is, its name, and the tags that
// qualify it. Null for a plain keycode, which reads as itself.
/** @param {ViewModel} model @param {string} action @returns {import("./keyface-types.js").NamedAction | null} */
export function namedAction(model, action) {
    const pd = pointingAction(model, action);
    if (pd) return {kind: "pointing", word: "pointing mode", name: pd.name, slot: pd.slot, tags: [pd.how, ...(pd.empty ? ["empty"] : [])]};
    const layer = layerAction(model, action);
    if (layer) return {kind: "layer", word: "layer", name: layer.name, layer: layer.layer, tags: layer.how ? [layer.how] : []};
    const macro = macroAction(model, action);
    if (macro) return {kind: "macro", word: "macro", name: macro.name, slot: macro.slot, tags: macro.empty ? ["empty"] : []};
    return null;
}

// The two values a slot answers to: hold and lock, as the core's key table
// (data/pd-mode-keys.js) gives them. Matching on the numbers rather than on names matters
// for an empty slot, whose record carries no name for the model to resolve —
// the keycode exists on the keyboard either way.
/** @param {PointingSlot} slot */
export const slotKeycodes = (slot) => slot.keys ? [slot.keys.holdCode, slot.keys.lockCode] : [];
// The same two keycodes by the names the model knows them by: hold, then lock.
/** @param {PointingSlot} slot */
export const slotKeycodeNames = (slot) => slot.keys ? [slot.keys.hold, slot.keys.lock] : [];

// What still reaches a pointing slot. The keyboard keeps its mode keycodes
// whatever a slot holds, so a key bound to an empty slot is inert rather than
// invalid — and the interface has to say which keys those are.
/** @param {ViewModel} model @param {PointingSlot | null | undefined} slot */
export function whatReachesSlot(model, slot) {
    if (!slot) return {keys: [], behaviours: [], combos: [], layers: []};
    const values = new Set(slotKeycodes(slot));
    const names = new Set(slotKeycodeNames(slot));
    for (const entry of model?.qmkKeycodes || []) {
        if (values.has(entry.keycode)) names.add(entry.value);
    }
    const keys = [];
    /** @type {Set<string>} */
    const layers = new Set();
    for (const layer of model?.layers || []) {
        for (const position of layer.positions || []) {
            if (!names.has(position.keycode) && !(position.value !== undefined && values.has(position.value))) continue;
            keys.push({layer, position});
            layers.add(layer.displayName || layer.name);
        }
    }
    const behaviours = (model?.keyBehaviors || []).filter((row) => (row.steps || []).some((step) =>
        [step.tap, step.hold, step.longHold].some((tier) => (tier?.action !== undefined && names.has(tier.action)))));
    const combos = (model?.combos || []).filter((row) => names.has(row.output));
    return {keys, behaviours, combos, layers: [...layers]};
}

// The keycode name that holds a slot's mode.
/** @param {PointingSlot} slot */
export const holdKeyName = (slot) => slot.keys?.hold || "";
