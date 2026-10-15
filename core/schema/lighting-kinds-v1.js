// @ts-check
"use strict";
// Stable descriptors implement the pinned open registries. Device bitmaps alone
// select what may be offered; construction roles are part of each module.
/** @typedef {{parameters: string[], place?: boolean, thing?: number, construction?: 'state' | 'event' | 'any' | 'stateTail' | 'eventWindow'}} Kind */
/** @param {number} thing @param {string[]} parameters @param {'state' | 'event'} [construction] @returns {Kind} */
const fact = (thing, parameters, construction = "state") => ({thing, parameters, construction});
/** @type {Readonly<Record<import('./lighting-types.js').LightingRegistry, Readonly<Record<number, Kind>>>>} */
const LIGHTING_KINDS = Object.freeze({
    facts: {
        1: fact(1, ["layer"]), 2: fact(1, ["layer"]), 3: fact(2, ["mode"]), 4: fact(3, ["role"]), 5: fact(4, ["states", "scope"]),
        7: fact(3, ["thing", "role"]), 8: fact(4, ["thing", "states"]), 9: fact(1, ["layer", "layerStatus"]), 10: fact(2, ["mode", "modeStatus"]),
        11: fact(3, ["thing", "layer"]), 12: fact(4, ["thing", "behaviourPhase", "tapSelector"]), 13: fact(5, ["thing"]), 14: fact(7, ["keySelector"]),
        15: fact(6, ["modifier", "side", "modifierState"]), 16: fact(0, ["hostLock"]), 17: fact(0, ["pointerState"]), 18: fact(0, []),
        19: fact(1, ["layer"], "event"), 20: fact(1, ["layer"], "event"), 21: fact(1, ["layer"], "event"), 22: fact(2, ["mode"], "event"), 23: fact(2, ["mode"], "event"),
        24: fact(3, ["thing"], "event"), 25: fact(4, ["thing", "tapSelector"], "event"), 26: fact(4, ["thing"], "event"), 27: fact(4, ["thing"], "event"), 28: fact(5, ["thing"], "event"),
    },
    targets: {0: {parameters: [], place: true}, 1: {parameters: [], place: true}, 2: {parameters: [], place: true}, 3: {parameters: ["set"]}, 4: {parameters: [], place: true}, 5: {parameters: [], place: true}, 6: {parameters: [], place: true}, 7: {parameters: []}, 8: {parameters: ["keyQuery", "thing"]}},
    paints: {0: {parameters: []}, 1: {parameters: []}, 2: {parameters: ["colour"]}, 3: {parameters: []}, 4: {parameters: ["map"]}, 5: {parameters: ["level"]}, 6: {parameters: ["colour", "level"]}, 8: {parameters: []}, 9: {parameters: []}},
    timings: {1: {parameters: ["milliseconds"], construction: "any"}, 2: {parameters: ["milliseconds"], construction: "stateTail"}, 3: {parameters: ["milliseconds"], construction: "eventWindow"}},
    ruleExtensions: {},
    domainExtensions: {1: {parameters: ["flags", "fadeMode", "colour", "base"]}, 2: {parameters: ["flashMode"]}},
    things: {1: {parameters: []}, 2: {parameters: []}, 3: {parameters: []}, 4: {parameters: []}, 5: {parameters: []}, 6: {parameters: []}, 7: {parameters: []}},
});
const LIGHTING_REGISTRIES = /** @type {const} */ (["facts", "targets", "paints", "timings", "ruleExtensions", "domainExtensions", "things"]);
const LIGHTING_SLOTS = /** @type {const} */ (["facts", "facts", "targets", "paints", "paints", "timings", "ruleExtensions"]);
/** @param {Kind} descriptor */
const parameterLength = descriptor => descriptor.parameters.reduce((sum, type) => sum + (type === "milliseconds" ? 2 : 1), 0);
module.exports = {LIGHTING_KINDS, LIGHTING_REGISTRIES, LIGHTING_SLOTS, parameterLength};
