// @ts-check
"use strict";
const {decodeRgbDomainV1} = require("./rgb-domain-v1");
const {encodeLightingDomain, lightingLimits} = require("./lighting-domain-v1");
const {LIGHTING_SLOTS} = require("./lighting-kinds-v1");
/** @typedef {import('./lighting-types.js').LightingProfile} Profile */
/** @typedef {import('./lighting-types.js').LightingPart & {colour?: import('./types.js').Hsv}} Part */
/** @param {Uint8Array} bytes @param {import('./lighting-types.js').LightingOptions} [options] */
function convertLightingV4(bytes, options = {}) {
    const limits = lightingLimits(options);
    const v4 = decodeRgbDomainV1(bytes, {tapBranchColorCount: limits.tapDepth - 1, logicalLayerCount: limits.logicalLayers, maximumBrightness: limits.maximumBrightness,
        supportedPdModeIds: Array.from({length: 32}, (_, id) => id).filter(id => (limits.supportedModeMask >>> id) & 1)});
    /** @type {Profile} */
    const result = {formatVersion: 5, palette: [], things: [], keySets: v4.groups.map(g => g.leds), maps: [], rules: [], extensions: []};
    const locality = [0, 1, 2, 5, 4];
    /** @param {number} slot @param {number} kind @param {number[]} params @returns {Part} */
    const part = (slot, kind, params = []) => ({slot, kind, params});
    /** @param {import('./types.js').Hsv} colour @returns {Part} */
    const paint = colour => colour.h === 0 && colour.s === 0 && colour.v === 0 ? part(3, 3, []) : {...part(3, 2, []), colour};
    /** @param {Part} condition @param {Part} target @param {Part} paint @param {number} bit */
    const add = (condition, target, paint, bit) => {
        const parts = [condition, target, paint];
        if (parts.every(p => limits.registries[LIGHTING_SLOTS[p.slot]].includes(p.kind))) result.rules.push({flags: v4.stageEnableMask & bit ? 0 : 1, brightness: 255, parts});
    };
    const key = v4.keyFeedback, keyPresent = key.tapBranchColors.length > 0;
    if (keyPresent) {
        for (const specific of [true, false]) for (const row of [...v4.keyGroupRows].reverse().filter(r => (r.semantic !== 255) === specific)) {
            add(part(0, 5, [specific ? 1 << row.semantic : 15, 3]), part(2, 3, [row.groupId]), paint(row.color), 16);
        }
        add(part(0, 5, [15, key.locality === 4 ? 0 : key.locality === 3 ? 1 : 2]), part(2, 7, []), part(3, 3, []), 16);
    }
    /** @param {number} role */
    const combos = role => {
        for (const row of [...v4.comboGroupRows].reverse()) add(part(0, 4, [role]), part(2, 3, [row.groupId]), paint(row.color), 8);
        add(part(0, 4, [role]), part(2, 7, []), part(3, 3, []), 8);
    };
    combos(1);
    if (v4.pdModeColors.length) {
        for (const row of [...v4.pdModeGroupRows].reverse()) add(part(0, 3, [row.selector]), part(2, 3, [row.groupId]), paint(row.color), 4);
        add(part(0, 3, [255]), part(2, 7, []), part(3, 3, []), 4);
    }
    if (v4.layerColors.length) {
        for (const row of [...v4.layerGroupRows].reverse()) add(part(0, 2, [row.selector]), part(2, 3, [row.groupId]), paint(row.color), 1);
        add(part(0, 2, [255]), part(2, 7, []), part(3, 3, []), 1);
    }
    combos(0); const start = result.rules.length;
    if (v4.layerColors.length) {
        for (const row of [...v4.layerGroupRows].reverse()) add(part(0, 1, [row.selector]), part(2, 3, [row.groupId]), paint(row.color), 1);
        add(part(0, 1, [255]), part(2, 7, []), part(3, 3, []), 1);
    }
    const base = result.rules.length - start;
    /** @param {import('./types.js').Hsv | number} colour */
    const pal = colour => {
        if (typeof colour === "number") return colour;
        let index = result.palette.findIndex(c => c.h === colour.h && c.s === colour.s && c.v === colour.v);
        if (index < 0) {index = result.palette.length; result.palette.push({...colour});}
        return index;
    };
    // Assignment order is part of the conversion contract: thing tables,
    // default first; then rules; finally domain extensions.
    if (v4.layerColors.length && limits.registries.things.includes(1)) result.things.push({kind: 1, default: [6, 255], records: v4.layerColors.map(r => [r.mode === 0 ? 0 : 6, pal(r.color.s === 0 && r.color.v === 0 ? 255 : r.color)])});
    if (v4.pdModeColors.length && limits.registries.things.includes(2)) result.things.push({kind: 2, default: [0, 255], records: v4.pdModeColors.map(r => [locality[r.locality], pal(r.color)])});
    if (limits.registries.things.includes(3)) result.things.push({kind: 3, default: [locality[v4.comboFeedback.locality], pal(v4.comboFeedback.color)], records: []});
    if (keyPresent && limits.registries.things.includes(4)) result.things.push({kind: 4, default: [locality[key.locality], ...[key.holdActiveColor, key.longHoldActiveColor, key.tapCommittedColor, ...key.tapBranchColors].map(pal)], records: []});
    for (const rule of result.rules) for (const p of /** @type {Part[]} */ (rule.parts)) if (p.colour) {p.params = [pal(p.colour)]; delete p.colour;}
    if (limits.registries.domainExtensions.includes(1)) result.extensions.push({kind: 1, params: [(v4.stageEnableMask >> 1) & 1, v4.automouseFade.mode, pal(v4.automouseFade.endColor), base]});
    if (limits.registries.domainExtensions.includes(2) && keyPresent && v4.stageEnableMask & 16 && key.tapCommitMode === 1) result.extensions.push({kind: 2, params: [1]});
    return encodeLightingDomain(result, options);
}
module.exports = {convertLightingV4};
