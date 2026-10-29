// @ts-check
// Which behaviour the Behaviours tab has open, and how it was reached. The
// board, the workbench tabs and the Key tab's link all select through here.

import {currentView, state} from "../../store.mjs";

// The group the picked behaviour was picked in, while it is still the picked
// one. A behaviour selected any other way — a fresh one, a moved one, the Key
// tab's link — has no route, and every way to it counts.
/** @returns {import("../../view/keyface-types.js").BehaviorRoute | null} */
export const behaviourRoute = () =>
    state.behaviourRoute && state.behaviourRoute.row === state.behaviourRow ? /** @type {import("../../view/keyface-types.js").BehaviorRoute} */ (state.behaviourRoute.group) : null;

// The key a board position opens in Behaviours: a transparent key follows the
// key answered from below.
/** @param {number | undefined} index */
export const behaviourKey = (index) => currentView().behaviours.keyAt(index);

/** @param {string} keycode */
export function selectBehaviourKey(keycode) {
    state.behaviourRow = keycode;
    state.behaviourRoute = {row: keycode, group: "view"};
    state.cell = null;
    state.cellHow = null;
}
