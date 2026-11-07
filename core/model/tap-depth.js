// @ts-check
"use strict";

// How deep a behaviour row's tap counts go: its deepest tap count that sets a
// tap, a hold or a long hold, or 0 with none. A row deeper than its Single
// tap counts taps up to it, and past it every press is the standard key
// (firmware D-F64). The grid's empty cells (empty-cells.js) and layer reach
// (layer-effects.js) both read it here.
/** @param {readonly Pick<import("../schema/types.js").BehaviorStep, "tapIndex" | "tap" | "hold" | "longHold">[] | undefined} steps */
const tapDepth = (steps) => Math.max(0, ...(steps || []).filter((step) => step.tap || step.hold || step.longHold).map((step) => step.tapIndex + 1));

module.exports = {tapDepth};
