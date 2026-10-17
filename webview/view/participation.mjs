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
    const reasons = [];
    if (!(behavior ? policy.behaviorsEnabled : policy.combosEnabled)) reasons.push("master switch is off");
    if (!((behavior ? policy.behaviorLayers : policy.comboLayers) & bit)) reasons.push("source layer switch is off");
    if (definition?.enabled === false) reasons.push("definition is disabled");
    if (definition && !((definition.allowedLayers ?? 0xffff) & bit)) reasons.push("definition does not allow the source layer");
    if (!placementOn) reasons.push(behavior ? "this placement bypasses its behaviour" : "this placement is excluded from combos");
    return {placementOn, enabled: reasons.length === 0, reasons};
}

// Who handles a key on this layer: the keyboard's own key engine, once it has a
// behaviour row that the switches, its definition and this placement let run;
// otherwise QMK, as if the row were not there. With no participation reported,
// a row alone decides. `reasons` says why a row is not used here.
/** @param {{participation?: import("../../contracts/model.js").Participation | null} | null | undefined} model @param {number} layer @param {{row: number, column: number}} position @param {{enabled?: boolean, allowedLayers?: number} | null | undefined} behaviour @returns {{by: "keyboard" | "qmk", reasons: string[]}} */
export function keyHandling(model, layer, position, behaviour) {
    if (!behaviour) return {by: "qmk", reasons: []};
    const decision = participationAt(model, layer, position, behaviour);
    if (!decision) return {by: behaviour.enabled === false ? "qmk" : "keyboard", reasons: behaviour.enabled === false ? ["definition is disabled"] : []};
    return {by: decision.enabled ? "keyboard" : "qmk", reasons: decision.reasons};
}
