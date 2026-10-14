// @ts-check
"use strict";

// Stable registry descriptors: parameter validation and byte lengths live here.
// The keyboard's bitmaps decide which of these descriptors may be offered.
/** @typedef {{parameters: string[], place?: boolean}} Kind */
/** @type {Readonly<Record<import('./lighting-types.js').LightingRegistry, Readonly<Record<number, Kind>>>>} */
const LIGHTING_KINDS = Object.freeze({
    facts: {1: {parameters: ["layer"]}, 2: {parameters: ["layer"]}, 3: {parameters: ["mode"]}, 4: {parameters: ["role"]}, 5: {parameters: ["states", "scope"]}, 7: {parameters: ["thing", "role"]}, 8: {parameters: ["thing", "states"]}},
    targets: {0: {parameters: [], place: true}, 1: {parameters: [], place: true}, 2: {parameters: [], place: true}, 3: {parameters: ["set"]}, 4: {parameters: [], place: true}, 5: {parameters: [], place: true}, 6: {parameters: [], place: true}, 7: {parameters: []}},
    paints: {0: {parameters: []}, 1: {parameters: []}, 2: {parameters: ["colour"]}, 3: {parameters: []}, 4: {parameters: ["map"]}, 5: {parameters: ["level"]}, 6: {parameters: ["colour", "level"]}, 8: {parameters: []}},
    timings: {1: {parameters: ["milliseconds"]}},
    ruleExtensions: {},
    domainExtensions: {1: {parameters: ["flags", "fadeMode", "colour", "base"]}, 2: {parameters: ["flashMode"]}},
    things: {1: {parameters: []}, 2: {parameters: []}, 3: {parameters: []}, 4: {parameters: []}},
});
const LIGHTING_REGISTRIES = /** @type {const} */ (["facts", "targets", "paints", "timings", "ruleExtensions", "domainExtensions", "things"]);
const LIGHTING_SLOTS = /** @type {const} */ (["facts", "facts", "targets", "paints", "paints", "timings", "ruleExtensions"]);
/** @param {Kind} descriptor */
const parameterLength = descriptor => descriptor.parameters.reduce((sum, type) => sum + (type === "milliseconds" ? 2 : 1), 0);
module.exports = {LIGHTING_KINDS, LIGHTING_REGISTRIES, LIGHTING_SLOTS, parameterLength};
