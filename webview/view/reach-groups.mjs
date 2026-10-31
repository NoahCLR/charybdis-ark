// @ts-check
// How the Keymap tabs group what a layer reaches.
//
// Every tab that answers "what does this layer reach" groups its rows the
// same way and in the same order: what the layer holds itself, then what it
// only reaches under a transparent key, then the rest of the board. These
// name the groups, order them, keep which are open, and name a picked row;
// what each tab's groups list is tab-reach.mjs's.

/** @type {Readonly<Record<string, string>>} */
export const ROUTE_WORDS = Object.freeze({here: "key", branches: "behaviour", combos: "combo"});

export const GROUP_TITLES = {
    // The Combos tab's one cut across the others: what the selected key takes
    // part in, in the view the board shows.
    key: "On the selected key in this view",
    view: "On this view",
    here: "On this layer",
    branches: "Through a behaviour on this layer",
    combos: "Through a combo on this layer",
    through: "Through a transparent key",
    belowBranches: "Through a behaviour under a transparent key",
    belowCombos: "Through a combo under a transparent key",
    elsewhere: "Unreachable from this layer",
};

// A tab lists the groups it has in any order and they come out in this one,
// so the headers do not move between tabs.
export const GROUP_ORDER = ["key", "view", "here", "branches", "combos", "through", "belowBranches", "belowCombos", "elsewhere"];
/** @template {{id: string}} T @param {T[]} groups @returns {T[]} */
export const inGroupOrder = (groups) => GROUP_ORDER.map((id) => groups.find((group) => group.id === id)).filter((group) => group !== undefined);

// The same section means the same thing in each Keymap tab. Keep one open state
// by section id, including ids that only some tabs show. No section closes
// another when it opens.
export const initialReachGroups = () => Object.fromEntries(
    GROUP_ORDER.map((id) => [id, id === "key" || id === "view"]));
/** @param {Record<string, boolean>} groups @param {string} id @param {boolean} open */
export const setReachGroupOpen = (groups, id, open) => ({...groups, [id]: open});

// One thing can be listed under several routes, so a picked row names the
// group it was picked under and what it lists, `group:name`: otherwise
// picking it in one group would ring the keys of all of them.
/** @param {string} group @param {string | number} name */
export const reachRowId = (group, name) => `${group}:${name}`;

// The layers a macro or custom key is placed on (placementsOf), as their
// chips read: the layer, its place in the stack, and how it is reached there
// ("key ×2 · combo").
/** @param {ReturnType<typeof import("./reach.mjs").placementsOf>} placements */
export const placementChips = (placements) => placements.map(({layer, at, routes}) => ({layer, at,
    how: routes.map((route) => `${ROUTE_WORDS[route.group]}${route.group === "here" && route.keys.length > 1 ? ` ×${route.keys.length}` : ""}`).join(" · ")}));

// Where a chip opens its layer in a Keymap tab: on the row of the first route
// that reaches it there, the group that row is under open, with the first key
// that route rings picked. Null for a layer it is not placed on.
/** @param {ReturnType<typeof import("./reach.mjs").placementsOf>} placements @param {string} keycode @param {number} at */
export function placementOpening(placements, keycode, at) {
    const route = placements.find((entry) => entry.at === at)?.routes[0];
    return route ? {layer: at, selected: route.keys[0], group: route.group, row: reachRowId(route.group, keycode)} : null;
}
/** @param {string} id */
export const reachRowOf = (id) => {
    const [group, ...rest] = String(id).split(":");
    return {group, name: rest.join(":")};
};
