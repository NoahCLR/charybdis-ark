// Permissions follow the layer supplying a key, including transparent keys.
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
