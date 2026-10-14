// @ts-check
"use strict";

// The firmware depth governs behaviour steps and lighting identity records.
// v4 carries its depth in the counted palette; v5 portable metadata supplies
// nondefault offline depths. Connected capabilities always take precedence.
const DEFAULT_TAP_DEPTH = 5, MAX_TAP_DEPTH = 255;
/** @param {{maxTapStepsPerBehavior?: number, maxBehaviorRows?: number, maxPopulatedBehaviorSteps?: number, brightnessMax?: number, lighting?: import('./lighting-types.js').LightingCapabilities} | null} [capabilities] @param {Uint8Array} [rgbPayload] */
function profileDepthOptions(capabilities = {}, rgbPayload) {
    const depth = capabilities?.maxTapStepsPerBehavior ?? (rgbPayload?.[0] === 4 && rgbPayload[10] ? rgbPayload[10] + 1 : DEFAULT_TAP_DEPTH);
    if (!Number.isInteger(depth) || depth < 2 || depth > MAX_TAP_DEPTH) throw new RangeError("Unsupported profile tap depth.");
    return {
        rgb: {tapDepth: depth, maximumBrightness: capabilities?.brightnessMax, capabilities: capabilities?.lighting, allowUnknown: true},
        behaviors: {limits: {maxTapStepsPerBehavior: depth, maxRows: capabilities?.maxBehaviorRows ?? 128,
            maxPopulatedSteps: capabilities?.maxPopulatedBehaviorSteps ?? 128 * depth}},
    };
}
module.exports = {DEFAULT_TAP_DEPTH, MAX_TAP_DEPTH, profileDepthOptions};
