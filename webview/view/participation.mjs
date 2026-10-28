// @ts-check
// Permissions follow the layer supplying a key, including transparent keys.
/** @typedef {{participation?: import("../../contracts/model.js").Participation | null, layers?: Partial<Pick<import("../../contracts/panel.js").Layer, "index" | "name" | "displayName">>[]} | null | undefined} ParticipationModel */
// A key by its matrix position, which places its bits in a layer record. A
// key the keyboard reported none for has no placement bit to veto it.
/** @typedef {{row?: number, column?: number}} Placed */

// A placement is one key on one layer (firmware's participation policy), and
// every word about one says so, naming the layer: its switches are neither the
// layer's, which Settings holds, nor the definition's, which runs everywhere.
/** @param {string} [name] */
export const thisKeyOnThisLayer = (name) => `this key on this layer${name ? ` (${name})` : ""}`;
/** @param {string} [name] */
const thisLayer = (name) => `this layer${name ? ` (${name})` : ""}`;
/** @param {ParticipationModel} model @param {number} layer */
const nameOf = (model, layer) => {
    const found = model?.layers?.find((row) => row.index === layer);
    return found?.displayName || found?.name || "";
};

// Why a behaviour or combo's own switches keep it off this layer: its enable
// switch and the layers it runs on. These hold whether or not the keyboard
// reports the rest of its participation.
/** @param {ParticipationModel} model @param {number} layer @param {{enabled?: boolean, allowedLayers?: number} | null | undefined} definition @param {"behavior" | "combo"} kind */
function definitionReasons(model, layer, definition, kind) {
    const reasons = [];
    if (definition?.enabled === false) reasons.push(kind === "behavior" ? "Use this behaviour is off" : "Use this combo is off");
    if (definition && !((definition.allowedLayers ?? 0xffff) & 2 ** layer)) reasons.push(`Layers it runs on leaves out ${thisLayer(nameOf(model, layer))}`);
    return reasons;
}

/** @param {ParticipationModel} model @param {number} layer @param {Placed} position @param {{enabled?: boolean, allowedLayers?: number} | null | undefined} definition @param {"behavior" | "combo"} [kind] */
export function participationAt(model, layer, position, definition, kind = "behavior") {
    const policy = model?.participation;
    if (!policy) return null;
    const behavior = kind === "behavior", bit = 2 ** layer;
    const record = policy.layers[layer];
    if (!record) return null;
    const placed = position.row !== undefined && position.column !== undefined;
    const placementOn = !placed || !(behavior ? record.bypass : record.exclude).includes(Number(position.row) * 6 + Number(position.column));
    const name = nameOf(model, layer);
    // Each reason names the switch that says no, in the words its control uses.
    const reasons = [];
    if (!(behavior ? policy.behaviorsEnabled : policy.combosEnabled)) reasons.push(behavior ? "behaviours are off in Settings" : "combos are off in Settings");
    if (!((behavior ? policy.behaviorLayers : policy.comboLayers) & bit)) reasons.push(`Settings has ${behavior ? "behaviours" : "combos"} off on ${thisLayer(name)}`);
    reasons.push(...definitionReasons(model, layer, definition, kind));
    if (!placementOn) reasons.push(`${behavior ? "Use behaviour" : "Join combos"} is off for ${thisKeyOnThisLayer(name)}`);
    return {placementOn, enabled: reasons.length === 0, reasons};
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
    const reasons = decision ? decision.reasons : definitionReasons(model, layer, behaviour, "behavior");
    return {runs: reasons.length === 0, reasons};
}

// Whether a key pressed here counts toward this combo: the same four scopes
// as a behaviour, with the layer's combo switch and the placement's Join
// combos (firmware's combo decision). With no participation reported, the
// combo's own switches decide.
/** @param {ParticipationModel} model @param {number} layer @param {Placed} position @param {{enabled?: boolean, allowedLayers?: number}} combo @returns {{joins: boolean, reasons: string[]}} */
export function comboJoins(model, layer, position, combo) {
    const decision = participationAt(model, layer, position, combo, "combo");
    const reasons = decision ? decision.reasons : definitionReasons(model, layer, combo, "combo");
    return {joins: reasons.length === 0, reasons};
}
