// @ts-check
// How the Keys tabs group what a layer reaches.
//
// Every tab that answers "what does this layer reach" groups its rows the
// same way and in the same order: what the layer holds itself, then what it
// only reaches under a transparent key, then the rest of the board. The reach
// functions in reach.mjs return one list per group; these name the groups,
// order them, and say which list each reads.

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

// The same section means the same thing in each Keys tab. Keep one open state
// by section id, including ids that only some tabs show. No section closes
// another when it opens.
export const initialReachGroups = () => Object.fromEntries(
    GROUP_ORDER.map((id) => [id, id === "key" || id === "view"]));
/** @param {Record<string, boolean>} groups @param {string} id @param {boolean} open */
export const setReachGroupOpen = (groups, id, open) => ({...groups, [id]: open});

// The reach list each group reads. `elsewhere` is a tab's own remainder.
/** @typedef {"inView" | "onKeys" | "fromBranches" | "fromCombos" | "throughKeys" | "fromBranchesBelow" | "fromCombosBelow"} ReachField */
/** @type {Partial<Record<string, ReachField>>} */
export const REACH_FIELDS = {view: "inView", here: "onKeys", branches: "fromBranches", combos: "fromCombos", through: "throughKeys",
    belowBranches: "fromBranchesBelow", belowCombos: "fromCombosBelow"};
/** @template T @param {Partial<Record<ReachField, T[]>> | null | undefined} reach @param {string} group */
export const reachEntries = (reach, group) => {
    const field = REACH_FIELDS[group];
    return field ? reach?.[field] || [] : [];
};
