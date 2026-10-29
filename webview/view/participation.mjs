// @ts-check
// Permissions follow the layer supplying a key, including transparent keys.
// Core decides what each layer's switches allow, and publishes it with the
// keys whose own switch is off there, by layout index
// (core/model/participation.js); a behaviour or combo adds its own switches,
// the shared rule in rules/definition-switches.mjs. Why one does not take part
// is a reason code, worded by the vocabulary.
import {definitionReasons} from "../../rules/definition-switches.mjs";
import {layerCalledAt, vocabulary} from "./vocabulary.mjs";
/** @typedef {import("../../contracts/model.js").ParticipationReason} Reason */
/** @typedef {{participation?: import("../../contracts/model.js").Participation | null, layers?: (Pick<import("../../contracts/panel.js").Layer, "index"> & Partial<Pick<import("../../contracts/panel.js").Layer, "displayName">>)[]} & import("./vocabulary.mjs").VocabularyModel | null | undefined} ParticipationModel */
// A key by its layout index. A key the keyboard reported none for has no
// placement switch to veto it.
/** @typedef {{layoutIndex?: number}} Placed */

// A placement is one key on one layer (firmware's participation policy), and
// every word about one says so, naming the layer: its switches are neither the
// layer's, which Settings holds, nor the definition's, which runs everywhere.
// The words are the vocabulary's (participationPlaces).
/** @param {import("./vocabulary.mjs").VocabularyModel | null | undefined} model @param {string} [name] */
export const thisKeyOnThisLayer = (model, name) => `${vocabulary(model).participationPlaces.key}${name ? ` (${name})` : ""}`;
/** @param {import("./vocabulary.mjs").VocabularyModel | null | undefined} model @param {string} [name] */
const thisLayer = (model, name) => `${vocabulary(model).participationPlaces.layer}${name ? ` (${name})` : ""}`;

// A reason in the words of the switch that says no, naming the layer or the
// placement where it does.
/** @param {ParticipationModel} model @param {"behavior" | "combo"} kind @param {number} layer @param {Reason} reason */
function reasonWords(model, kind, layer, reason) {
    const words = vocabulary(model).participationReasons?.[kind]?.[reason] ?? reason;
    if (reason === "layer" || reason === "layers") return `${words} ${thisLayer(model, layerCalledAt(model, layer))}`;
    if (reason === "placement") return `${words} ${thisKeyOnThisLayer(model, layerCalledAt(model, layer))}`;
    return words;
}

/** @param {ParticipationModel} model @param {number} layer @param {Placed} position @param {{enabled?: boolean, allowedLayers?: number} | null | undefined} definition @param {"behavior" | "combo"} [kind] */
export function participationAt(model, layer, position, definition, kind = "behavior") {
    const policy = model?.participation;
    if (!policy) return null;
    const behavior = kind === "behavior";
    const record = policy.layers[layer];
    if (!record) return null;
    const placementOn = position.layoutIndex === undefined || !(behavior ? record.bypass : record.exclude).includes(position.layoutIndex);
    /** @type {Reason[]} */
    const reasons = [...(behavior ? record.behaviors : record.combos), ...definitionReasons(definition, layer), ...(placementOn ? [] : /** @type {Reason[]} */ (["placement"]))];
    return {placementOn, enabled: reasons.length === 0, reasons: reasons.map((reason) => reasonWords(model, kind, layer, reason))};
}

// Whether a key's behaviour row runs on this layer: the switches, its
// definition and this placement let it. A row that does not run is ignored,
// as if it were not there; the key keeps what it does without one, and the
// keyboard decides its tap or hold either way (firmware D-F27). With no
// participation reported, the row's own switches decide. `reasons` says why a
// row does not run here.
/** @param {ParticipationModel} model @param {number} layer @param {Placed} position @param {{enabled?: boolean, allowedLayers?: number} | null | undefined} behaviour @returns {{runs: boolean, reasons: string[]}} */
export function behaviourRuns(model, layer, position, behaviour) {
    if (!behaviour) return {runs: false, reasons: []};
    const decision = participationAt(model, layer, position, behaviour);
    const reasons = decision ? decision.reasons : definitionReasons(behaviour, layer).map((reason) => reasonWords(model, "behavior", layer, reason));
    return {runs: reasons.length === 0, reasons};
}

// Whether a key pressed here counts toward this combo: the same four scopes
// as a behaviour, with the layer's combo switch and the placement's Join
// combos (firmware's combo decision). With no participation reported, the
// combo's own switches decide.
/** @param {ParticipationModel} model @param {number} layer @param {Placed} position @param {{enabled?: boolean, allowedLayers?: number}} combo @returns {{joins: boolean, reasons: string[]}} */
export function comboJoins(model, layer, position, combo) {
    const decision = participationAt(model, layer, position, combo, "combo");
    const reasons = decision ? decision.reasons : definitionReasons(combo, layer).map((reason) => reasonWords(model, "combo", layer, reason));
    return {joins: reasons.length === 0, reasons};
}
