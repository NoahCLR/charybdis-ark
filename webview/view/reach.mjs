// @ts-check
import {behaviourFor, keyMeaning} from "./keyface.mjs";
import {reachablePositions, resolvedPositions, downTheStack} from "./layer-resolution.mjs";
import {comboGroups, comboOutput, combosInView, comboInputOn} from "./combo-reach.mjs";
/** @typedef {import("../../contracts/panel.js").BehaviorView} BehaviorView */
/** @typedef {import("../../contracts/panel.js").Layer} Layer */
/** @typedef {import("./keyface-types.js").PointingSlot} PointingSlot */
/** @typedef {import("./keyface-types.js").ComboGroupEntry} ComboGroupEntry */
/** @typedef {import("./keyface-types.js").BehaviorCombo} BehaviorCombo */
/** @typedef {import("./keyface-types.js").ComboRoute} ComboRoute */
/** @typedef {import("./keyface-types.js").ReachEntry} ReachEntry */
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
    const physical = placements.some(key => key.reference) ? resolvedPositions(stack, at, held) : [];
    const permitted = placements.some(key => {
        const source = key.reference ? physical.find(entry => entry.position.layoutIndex === key.position.layoutIndex)?.layer : key.layer;
        return source && ((row.allowedLayers ?? 0xffff) & (2 ** source.index));
    });
    return permitted ? row : undefined;
}
/**
 * Where to press for this, on this layer.
 *
 * The keys that name it, and — for anything a behaviour branch sends — the keys
 * carrying that behaviour, because those are the ones you actually reach it
 * through. For anything a combo sends, the keys you chord to fire it. A key answered from a layer below keeps its physical position, which
 * is what the board draws.
 */
/** @param {Layer[]} stack @param {number} at @param {Partial<Pick<ReachEntry, "keys" | "behaviours" | "combos">> | null | undefined} entry @param {number[] | null} [held] */
export function reachKeys(stack, at, entry, held = null) {
    const indexes = new Set([...(entry?.keys || []), ...(entry?.combos || []).flatMap((route) => route.keys)]
        .map((key) => key.position.layoutIndex));
    const behaviours = new Set((entry?.behaviours || []).map((row) => row.keycode));
    if (behaviours.size) {
        for (const {position} of held === null ? reachablePositions(stack, at) : resolvedPositions(stack, at, held)) {
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
    for (const key of resolvedPositions(stack, at, held)) {
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
    /** @param {BehaviorView} row @param {(action: string) => void} record */
    const branchActions = (row, record) => {
        for (const step of row.steps || []) for (const tier of [step.tap, step.hold, step.longHold]) {
            if (tier?.action) record(tier.action);
        }
    };
    for (const key of resolvedPositions(stack, at, held)) {
        for (const name of namesOf(keyMeaning(key.position))) add(name).keys.push(key);
        const row = behaviourFor(model, keyMeaning(key.position));
        if (row) branchActions(row, (action) => {
            for (const name of namesOf(action)) {
                const entry = add(name);
                if (!entry.behaviours.some((item) => item.keycode === row.keycode && item.action === action))
                    entry.behaviours.push({keycode: row.keycode, action, layer: key.fellThrough ? key.layer : null, whileHeld: key.whileHeld});
            }
        });
    }
    for (const {combo, keys} of combosInView(model, stack, at, held)) {
        const output = comboOutput(model, combo);
        /** @param {string} action @param {string | null} [via] */
        const sent = (action, via = null) => {
            for (const name of namesOf(action)) {
                const entry = add(name);
                if (!entry.combos.some((item) => item.combo === combo && item.action === action))
                    entry.combos.push({combo, keys, via, action});
            }
        };
        sent(output);
        const row = comboBehaviourFor(model, combo, keys, stack, at, held);
        if (row) branchActions(row, (action) => sent(action, output));
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
        for (const step of row.steps || []) {
            for (const tier of [step.tap, step.hold, step.longHold]) {
                if (!tier) continue;
                for (const name of namesOf(tier.action)) {
                    const rows = reachOf(name)[from ? "belowRows" : "directRows"];
                    // The action matters as well as the behaviour: a pointing
                    // mode answers to two keycodes, and which one a branch
                    // sends is the difference between holding and toggling it.
                    if (!rows.some((entry) => entry.keycode === row.keycode && entry.action === tier.action)) {
                        rows.push({keycode: row.keycode, action: tier.action, layer: from, whileHeld});
                    }
                }
            }
        }
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
            /** @type {{action: string; via: string | null}[]} */
            const sends = [{action: output, via: null}];
            for (const step of comboBehaviourFor(model, combo, keys, stack, at, held.map(layer => layer.index))?.steps || []) {
                for (const tier of [step.tap, step.hold, step.longHold]) {
                    if (tier?.action) sends.push({action: tier.action, via: output});
                }
            }
            for (const {action, via} of sends) {
                for (const name of namesOf(action)) {
                    const routes = reachOf(name)[below ? "belowCombos" : "directCombos"];
                    if (!routes.some((route) => route.combo === combo && route.action === action)) routes.push({combo, via, action, keys});
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
    (model?.viaMacros || [])
        // An empty slot is not a macro this layer is missing, it is a slot.
        .filter((slot) => !slot.empty).map((slot) => slot.keycode));

/**
 * Pointing modes, grouped the same four ways. A mode is reached by the key that
 * holds or toggles it, by a transparent key letting a lower one do so, or by a
 * behaviour branch that sends its keycode.
 */
/** @param {ViewModel} model @param {Layer[]} stack @param {number} at */
export const pointingReach = (model, stack, at) => reachGroups(model, stack, at,
    (keycode) => { const slot = pointingSlotFor(model, keycode); return slot ? [String(slot.id)] : []; },
    // A slot with no movement cannot be activated, so it is not a mode this
    // layer is missing either.
    (model?.pdModes || []).filter((slot) => slot.kind).map((slot) => String(slot.id)));


// A layout position carries the keyboard's own name for its keycode, which for
// a pointing mode is a bare user keycode (`QK_USER_16`) or, for a slot the
// vocabulary does not name at all, its hex. So resolve the alias the model
// published first, then fall back to the number: an empty slot has no name to
// match on, and its keycodes exist regardless.
/** @param {ViewModel} model @param {string | number | undefined} keycode */
export function pointingSlotFor(model, keycode) {
    const slots = model?.pdModes || [];
    const alias = model?.qmkKeycodeAliases?.[keycode ?? ""] ?? keycode;
    const named = slots.find((slot) => slot.binding && [slot.binding.hold, slot.binding.lock].includes(String(alias || "")));
    if (named) return named;
    const value = typeof keycode === "number" ? keycode : /^0x[0-9a-f]+$/i.test(String(keycode)) ? Number(keycode) : NaN;
    return Number.isInteger(value) ? slots.find((slot) => slotKeycodes(slot).includes(value)) : undefined;
}

// Which of a slot's two keycodes this is. Everything else about the mode is the
// same either way, so holding it or toggling it on is the only thing a route
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
// name it goes by, and whether the key holds the mode or toggles it on. Null
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
    const slot = (model?.viaMacros || []).find((row) => row.keycode === keycode);
    return {slot, keycode, name: slot?.name || `Macro ${keycode.split("_").at(-1)}`, empty: Boolean(slot?.empty)};
}

// An action that names something the person set up — a pointing mode or a
// macro — as that thing: what kind it is, its name, and the tags that qualify
// it. Null for a plain keycode, which reads as itself.
/** @param {ViewModel} model @param {string} action @returns {import("./keyface-types.js").NamedAction | null} */
export function namedAction(model, action) {
    const pd = pointingAction(model, action);
    if (pd) return {kind: "pointing", word: "trackball mode", name: pd.name, slot: pd.slot, tags: [pd.how, ...(pd.empty ? ["empty"] : [])]};
    const macro = macroAction(model, action);
    if (macro) return {kind: "macro", word: "macro", name: macro.name, slot: macro.slot, tags: macro.empty ? ["empty"] : []};
    return null;
}

// The two values a slot answers to: hold and toggle, as the host's binding
// registry gives them. Matching on the numbers rather than on names matters
// for an empty slot, whose record carries no name for the model to resolve —
// the keycode exists on the keyboard either way.
/** @param {PointingSlot} slot */
export const slotKeycodes = (slot) => slot.binding ? [slot.binding.holdCode, slot.binding.lockCode] : [];

// What still reaches a pointing slot. The keyboard keeps its mode keycodes
// whatever a slot holds, so a key bound to an empty slot is inert rather than
// invalid — and the interface has to say which keys those are.
/** @param {ViewModel} model @param {PointingSlot | null | undefined} slot */
export function bindingsForSlot(model, slot) {
    if (!slot) return {keys: [], behaviours: [], combos: [], layers: []};
    const values = new Set(slotKeycodes(slot));
    const names = new Set([slot.binding?.hold, slot.binding?.lock].filter((name) => name !== undefined));
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
export const bindingKeycode = (slot) => slot.binding?.hold || "";
