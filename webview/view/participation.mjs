// @ts-check
// Permissions follow the layer supplying a key, including transparent keys.
/** @param {{participation?: import("../../contracts/model.js").Participation | null} | null | undefined} model @param {number} layer @param {{row: number, column: number}} position @param {{enabled?: boolean, allowedLayers?: number} | null | undefined} definition @param {"behavior" | "combo"} [kind] */
export function participationAt(model, layer, position, definition, kind = "behavior") {
    const policy = model?.participation;
    if (!policy) return null;
    const behavior = kind === "behavior", bit = 2 ** layer;
    const record = policy.layers[layer];
    if (!record) return null;
    const placementOn = !(behavior ? record.bypass : record.exclude).includes(position.row * 6 + position.column);
    // Each reason names the switch that says no, in the words its control uses.
    const reasons = [];
    if (!(behavior ? policy.behaviorsEnabled : policy.combosEnabled)) reasons.push(behavior ? "behaviours are off in Settings" : "combos are off in Settings");
    if (!((behavior ? policy.behaviorLayers : policy.comboLayers) & bit)) reasons.push(behavior ? "Settings has behaviours off on this layer" : "Settings has combos off on this layer");
    if (definition?.enabled === false) reasons.push(behavior ? "Use this behaviour is off" : "Use this combo is off");
    if (definition && !((definition.allowedLayers ?? 0xffff) & bit)) reasons.push("this layer is not one it runs on");
    if (!placementOn) reasons.push(behavior ? "this key's Use behaviour is off" : "this key's Join combos is off");
    return {placementOn, enabled: reasons.length === 0, reasons};
}

// Whether a key's behaviour row runs on this layer: the switches, its
// definition and this placement let it. A row that does not run is ignored,
// as if it were not there; the key keeps what it does without one, and the
// keyboard decides its tap or hold either way (firmware D-F27). With no
// participation reported, the row's own switch decides. `reasons` says why a
// row does not run here.
/** @param {{participation?: import("../../contracts/model.js").Participation | null} | null | undefined} model @param {number} layer @param {{row: number, column: number}} position @param {{enabled?: boolean, allowedLayers?: number} | null | undefined} behaviour @returns {{runs: boolean, reasons: string[]}} */
export function behaviourRuns(model, layer, position, behaviour) {
    if (!behaviour) return {runs: false, reasons: []};
    const decision = participationAt(model, layer, position, behaviour);
    if (!decision) return {runs: behaviour.enabled !== false, reasons: behaviour.enabled === false ? ["Use this behaviour is off"] : []};
    return {runs: decision.enabled, reasons: decision.reasons};
}
