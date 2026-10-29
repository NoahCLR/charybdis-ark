// @ts-check
// What one layer view reaches, as each Keymap tab lists it: the tab's groups
// in the one order (reach-groups.mjs), what each lists and what it says when
// it lists nothing, the number on the tab, the keys the board rings for a
// picked row, and the group a row is found under. A tab draws its own rows
// from this; which list a group reads, and how a picked row is found again,
// are kept here once for every tab. Each list is worked out on first read and
// kept for as long as the view is (layer-view.mjs).

import {GROUP_ORDER, reachRowOf} from "./reach-groups.mjs";
import {customKeyNamesOf, macroNamesOf, reachGroups, reachInView, reachKeys} from "./reach.mjs";
import {pointingReach, pointingReachInView} from "./pointing-reach.mjs";
import {customKeyInUse} from "./custom-key.mjs";
import {once} from "./layer-view.mjs";
/** @typedef {import("../../contracts/panel.js").BehaviorView} BehaviorView */
/** @typedef {import("./keyface-types.js").BehaviourReachEntry} BehaviourReachEntry */
/** @typedef {import("./keyface-types.js").ComboReachEntry} ComboReachEntry */
/** @typedef {import("./keyface-types.js").LayerView} LayerView */
/** @typedef {import("./keyface-types.js").ReachEntry} ReachEntry */
/** @typedef {import("./keyface-types.js").ReachGroup} ReachGroup */
/** @typedef {import("./keyface-types.js").ReachRows} ReachRows */
/** @typedef {import("./keyface-types.js").ReachTab} ReachTab */
/** @template E @typedef {import("./keyface-types.js").TabReach<E>} TabReach */
/** @template E @typedef {import("./keyface-types.js").TabReachGroup<E>} TabReachGroup */
/** @typedef {ReachRows[ReachTab]} TabEntry */

// What a group says when it lists nothing, by tab. The Combos tab's On this
// layer says so differently before the keyboard's combos are read (`unread`).
/** @type {Record<ReachTab, Record<string, string>>} */
const EMPTY_WORDS = {
    macros: {
        view: "No macro is reached by the layers in this view.",
        here: "No macro keycode is placed on this layer.",
        through: "No transparent key falls through to a macro key.",
        branches: "No behaviour mapped on this layer sends a macro.",
        combos: "No combo on this layer sends a macro.",
        belowBranches: "No behaviour under a transparent key sends a macro.",
        belowCombos: "No combo that needs a transparent key sends a macro.",
        elsewhere: "Every stored macro is reached from this layer.",
    },
    customKeys: {
        view: "No custom key is reached by the layers in this view.",
        here: "No custom key is placed on this layer.",
        through: "No transparent key falls through to a custom key.",
        branches: "No behaviour mapped on this layer sends a custom key.",
        combos: "No combo on this layer sends a custom key.",
        belowBranches: "No behaviour under a transparent key sends a custom key.",
        belowCombos: "No combo that needs a transparent key sends a custom key.",
        elsewhere: "Every custom key in use is reached from this layer.",
    },
    pointing: {
        view: "No pointing mode is reached by the layers in this view.",
        here: "No pointing mode is placed on this layer.",
        through: "No transparent key falls through to a pointing-mode key.",
        branches: "No behaviour mapped on this layer sends a pointing mode.",
        combos: "No combo on this layer sends a pointing mode.",
        belowBranches: "No behaviour under a transparent key sends a pointing mode.",
        belowCombos: "No combo that needs a transparent key sends a pointing mode.",
        elsewhere: "Every configured mode is reached from this layer.",
    },
    behaviours: {
        view: "No behaviour is reached by the layers in this view.",
        here: "No key behaviour is placed on this layer.",
        combos: "No combo on this layer sends a behaviour.",
        through: "No transparent key falls through to a behaviour.",
        belowCombos: "No combo that needs a transparent key sends a behaviour.",
        elsewhere: "Every behaviour on the board is reached from this layer.",
    },
    combos: {
        view: "No combo fires with the layers in this view.",
        here: "No combo has all of its inputs on this layer.",
        unread: "Combos have not been read from this keyboard.",
        through: "No combo is completed by keys falling through.",
        elsewhere: "Every combo on the board fires from this layer.",
    },
};

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
/** @param {LayerView} view */
const macroReach = (view) => reachGroups(view, macroNamesOf(view.model),
    (view.model?.macros || [])
        // An empty slot is not a macro this layer is missing, it is a slot.
        .filter((slot) => !slot.empty).map((slot) => slot.keycode));

// Custom keys, grouped the ways a layer reaches them, as macros are: a key
// carrying one, a transparent key letting a lower one, a behaviour branch
// sending one (which sends its shortcut only, D-L63), or a combo sending one.
/** @param {LayerView} view */
const customKeyReach = (view) => reachGroups(view, customKeyNamesOf(view.model),
    (view.model?.customKeys || []).filter(customKeyInUse).map((key) => key.keycode));

// The lists of a tab grouping what reachGroups finds: the view's own list,
// each route's, then what this layer reaches no way, as entries with no route.
/** @param {() => ReachGroup} reach @param {() => ReachEntry[]} inView @returns {Record<string, () => ReachEntry[]>} */
function routeLists(reach, inView) {
    const kept = once(reach);
    return {
        view: inView,
        here: () => kept().onKeys, branches: () => kept().fromBranches, combos: () => kept().fromCombos,
        through: () => kept().throughKeys, belowBranches: () => kept().fromBranchesBelow, belowCombos: () => kept().fromCombosBelow,
        elsewhere: () => kept().elsewhere.map((name) => ({name, keys: [], behaviours: [], combos: []})),
    };
}

// A behaviour's row in any group, named by its keycode, with whatever its
// group says of how it is reached: the keys in view carrying it and the
// combos sending it, or the layer below a transparent key answers from.
/** @param {Partial<BehaviourReachEntry> & {row: BehaviorView}} entry @returns {BehaviourReachEntry} */
const behaviourEntry = ({row, keys = [], combos = [], layer = null, whileHeld = false}) => ({name: row.keycode, row, keys, combos, layer, whileHeld});
/** @param {LayerView} view @returns {Record<string, () => BehaviourReachEntry[]>} */
const behaviourLists = (view) => ({
    view: () => view.behaviours.inView.map(behaviourEntry),
    here: () => view.behaviours.groups.here.map((row) => behaviourEntry({row})),
    combos: () => view.behaviours.groups.combos.map(behaviourEntry),
    through: () => view.behaviours.groups.through.map(behaviourEntry),
    belowCombos: () => view.behaviours.groups.combosBelow.map(behaviourEntry),
    elsewhere: () => view.behaviours.groups.elsewhere.map((row) => behaviourEntry({row})),
});

/** @param {Omit<ComboReachEntry, "name">} entry @returns {ComboReachEntry} */
const comboEntry = (entry) => ({...entry, name: String(entry.combo.id)});
/** @param {LayerView} view @returns {Record<string, () => ComboReachEntry[]>} */
const comboLists = (view) => ({
    view: () => view.combos.inView.map(comboEntry),
    here: () => view.combos.groups.onKeys.map(comboEntry),
    through: () => view.combos.groups.throughKeys.map(comboEntry),
    elsewhere: () => view.combos.groups.elsewhere.map(comboEntry),
});

/** @param {TabReachGroup<TabEntry>[]} groups @param {string} group @param {string} name */
const entryIn = (groups, group, name) => groups.find((entry) => entry.id === group)?.entries.find((entry) => entry.name === name);
// A row rings the keys of the route it was picked under; a row On this view
// rings only the keys of the layers on in the view.
/** @param {LayerView} view @param {TabReachGroup<TabEntry>[]} groups @param {string} group @param {string} name */
const keysInGroup = (view, groups, group, name) => reachKeys(view, entryIn(groups, group, name), group === "view");

/**
 * @typedef {object} TabSpec
 * @property {(view: LayerView) => Record<string, string>} words
 * @property {(view: LayerView) => Record<string, () => TabEntry[]>} lists
 * @property {(view: LayerView, groups: TabReachGroup<TabEntry>[], group: string, name: string) => number[]} keysFor
 */
// Each tab: its words, its lists by group, and how a picked row is found again.
/** @type {Record<ReachTab, TabSpec>} */
const TABS = {
    macros: {words: () => EMPTY_WORDS.macros, keysFor: keysInGroup,
        lists: (view) => routeLists(() => macroReach(view), () => reachInView(view, macroNamesOf(view.model)))},
    customKeys: {words: () => EMPTY_WORDS.customKeys, keysFor: keysInGroup,
        lists: (view) => routeLists(() => customKeyReach(view), () => reachInView(view, customKeyNamesOf(view.model)))},
    pointing: {words: () => EMPTY_WORDS.pointing, keysFor: keysInGroup,
        lists: (view) => routeLists(() => pointingReach(view), () => pointingReachInView(view))},
    // A behaviour rings by the route it was picked under (behaviourRouteKeys);
    // one picked under no group, as a behaviour selected anywhere but its
    // row is, rings every way this layer reaches it.
    behaviours: {words: () => EMPTY_WORDS.behaviours, lists: behaviourLists,
        keysFor: (view, groups, group, name) =>
            view.behaviours.routeKeys(name, /** @type {import("./keyface-types.js").BehaviorRoute | null} */ (group || null))},
    // A combo is found by its id under any group of this layer, the selected
    // key's included, and On this view by the keys that fire it there.
    combos: {lists: comboLists,
        words: (view) => view.model?.comboReadback?.state === "read" ? EMPTY_WORDS.combos : {...EMPTY_WORDS.combos, here: EMPTY_WORDS.combos.unread},
        keysFor: (view, groups, group, name) => group === "view" ? keysInGroup(view, groups, group, name)
            : reachKeys(view, groups.filter((entry) => entry.id !== "view").flatMap((entry) => entry.entries).find((entry) => entry.name === name))},
};

// A tab's number counts what the selected layer stores, not the selected key
// position or what it reaches only through transparent keys on lower layers;
// one thing reached two ways counts once.
const STORED = new Set(["here", "branches", "combos"]);

// A tab with no reach rows (the Key tab) lists nothing and rings nothing.
/** @type {TabReach<TabEntry>} */
const NO_REACH = Object.freeze({groups: [], count: 0, keysFor: () => [], groupOf: () => undefined});

/** @type {WeakMap<LayerView, Map<string, TabReach<TabEntry>>>} */
const REACHES = new WeakMap();

/**
 * What `view` reaches, as the Keymap tab `tab` lists it.
 *
 *   groups        the tab's groups in the one order, each with its id, what
 *                 it says when empty, and its entries, each named as its row is
 *   count         the number on the tab
 *   keysFor(id)   the keys the board rings for the row picked as `id`
 *                 (reachRowId): whatever it lists, by the route it was
 *                 picked under
 *   groupOf(name) the first group listing `name`, where a row asked for by
 *                 name is picked
 */
/** @template {string} T @param {LayerView} view @param {T} tab @returns {TabReach<T extends ReachTab ? ReachRows[T] : never>} */
export function tabReach(view, tab) {
    let reaches = REACHES.get(view);
    if (!reaches) REACHES.set(view, reaches = new Map());
    let reach = reaches.get(tab);
    if (!reach) reaches.set(tab, reach = reachOf(view, tab));
    // Each tab's entries are the ones its lists hold (TABS).
    return /** @type {TabReach<T extends ReachTab ? ReachRows[T] : never>} */ (reach);
}

/** @param {LayerView} view @param {string} tab @returns {TabReach<TabEntry>} */
function reachOf(view, tab) {
    const spec = Object.hasOwn(TABS, tab) ? TABS[/** @type {ReachTab} */ (tab)] : null;
    if (!spec) return NO_REACH;
    const words = spec.words(view), lists = spec.lists(view);
    /** @type {TabReachGroup<TabEntry>[]} */
    const groups = GROUP_ORDER.flatMap((id) => {
        const list = lists[id];
        if (!list) return [];
        const entries = once(list);
        return [{id, empty: words[id] ?? "", get entries() { return entries(); }}];
    });
    const count = once(() => new Set(groups.filter((group) => STORED.has(group.id)).flatMap((group) => group.entries.map((entry) => entry.name))).size);
    return {
        groups,
        get count() { return count(); },
        keysFor: (picked) => {
            if (!picked) return [];
            const {group, name} = reachRowOf(picked);
            return spec.keysFor(view, groups, group, name);
        },
        groupOf: (name) => groups.find((group) => group.entries.some((entry) => entry.name === String(name)))?.id,
    };
}
