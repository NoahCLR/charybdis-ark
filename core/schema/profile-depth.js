"use strict";

// The configured firmware depth governs behaviour steps and its RGB palette.
// Offline backups carry the depth in RGB's counted palette; a connected
// keyboard supplies it through capabilities and always takes precedence.
const DEFAULT_TAP_DEPTH = 5, MAX_TAP_DEPTH = 255;
function profileDepthOptions(capabilities = {}, rgbPayload) {
    const depth = capabilities?.maxTapStepsPerBehavior ?? (rgbPayload?.[10] ? rgbPayload[10] + 1 : DEFAULT_TAP_DEPTH);
    if (!Number.isInteger(depth) || depth < 2 || depth > MAX_TAP_DEPTH) throw new RangeError("Unsupported profile tap depth.");
    return {
        rgb: {tapBranchColorCount: depth - 1},
        behaviors: {limits: {maxTapStepsPerBehavior: depth, maxRows: capabilities?.maxBehaviorRows ?? 128,
            maxPopulatedSteps: capabilities?.maxPopulatedBehaviorSteps ?? 128 * depth}},
    };
}
module.exports = {DEFAULT_TAP_DEPTH, MAX_TAP_DEPTH, profileDepthOptions};
