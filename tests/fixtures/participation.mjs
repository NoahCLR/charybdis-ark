// @ts-check
// The participation core publishes (core/model/participation.js) for a set of
// switches: every one on unless named, and the keys whose Use behaviour
// (`bypass`) or Join combos (`exclude`) is off, by layer, by layout index.
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const {participation} = require("../../core/model/participation");
const {SETTING} = require("../../core/schema/settings-domain-v1");
const {LAYERS, matrixPosition} = require("../../core/data/charybdis-layout");
export const {VOCABULARY} = require("../../core/model/vocabulary");

/** @param {{behaviorsEnabled?: boolean, combosEnabled?: boolean, behaviorLayers?: number, comboLayers?: number, comboOutputBehaviors?: boolean, bypass?: Record<number, number[]>, exclude?: Record<number, number[]>}} [switches] */
export function publishedParticipation({behaviorsEnabled = true, combosEnabled = true, behaviorLayers = 0xffff, comboLayers = 0xffff, comboOutputBehaviors = true, bypass = {}, exclude = {}} = {}) {
    /** @type {number[]} */
    const values = [];
    values[SETTING.BEHAVIORS_ENABLED] = behaviorsEnabled ? 1 : 0;
    values[SETTING.COMBOS_ENABLED] = combosEnabled ? 1 : 0;
    values[SETTING.LAYER_BEHAVIORS] = behaviorLayers;
    values[SETTING.LAYER_COMBOS] = comboLayers;
    const keys = (/** @type {number[] | undefined} */ list) => (list || []).map((layoutIndex) => matrixPosition(layoutIndex));
    const layers = Array.from({length: LAYERS}, (_, layer) => ({reference: layer, bypass: keys(bypass[layer]), exclude: keys(exclude[layer])}));
    return participation({values, layers, comboOutputBehaviors}).view();
}
