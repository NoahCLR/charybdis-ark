// @ts-check

// Why a behaviour or combo's own switches keep it off a layer: Use this
// behaviour or combo is off (`definition`), or the layers it runs on leave
// that layer out (`layers`); one that names no layers runs on every layer.
// They hold on the layer that supplies a key, which the layers a person turns
// on decide, so core's participation and the interface's reach both ask this
// (D-L73), and each words the reasons from the vocabulary.

/** @typedef {{readonly enabled?: boolean, readonly allowedLayers?: number}} DefinitionSwitches */

/** The reasons, in order, this definition does not run on `layer`; none when it does. */
export function definitionReasons(/** @type {DefinitionSwitches | null | undefined} */ definition, /** @type {number} */ layer) {
    if (!definition) return [];
    /** @type {("definition" | "layers")[]} */
    const reasons = [];
    if (definition.enabled === false) reasons.push("definition");
    if (typeof definition.allowedLayers === "number" && !(definition.allowedLayers & (1 << layer))) reasons.push("layers");
    return reasons;
}
