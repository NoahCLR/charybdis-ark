// @ts-check
"use strict";
const {LIGHTING_KINDS} = require("../schema/lighting-kinds-v1");
const {VOCABULARY} = require("./vocabulary");
const {knownRule, ruleIdentity, ruleBand, ruleWords} = require("./lighting-editor");
/** @param {import('../schema/lighting-types.js').LightingProfile} domain @param {string[]} [names] @param {import('../schema/lighting-types.js').LightingCapabilities} [capabilities] @param {readonly string[]} [keys] @param {{modes?: string[]; combos?: string[]; behaviours?: string[]; macros?: string[]}} [subjects] */
function lightingForView(domain, names = [], capabilities, keys = [], subjects = {}) {
    const rules = domain.rules.map((rule, index) => {
        const words = ruleWords(rule, names, subjects), paint = rule.parts.find(p => p.slot === 3);
        const colour = paint && (paint.kind === 2 || paint.kind === 6) ? domain.palette[paint.params[0]] : undefined;
        return {index, key: keys[index] ?? `rule-${index}`, identity: ruleIdentity(rule), band: ruleBand(rule), enabled: !(rule.flags & 1), readOnly: !knownRule(rule), ...words,
            colour, canColour: knownRule(rule) && Boolean(paint) && (capabilities?.registries.paints.includes(2) ?? false)};
    });
    return {program: domain, rules, working: require("../schema/lighting-working-v1").lightingWorkingCost(domain, capabilities?.working), descriptors: LIGHTING_KINDS, supportedTimings: capabilities?.registries.timings ?? [], bands: VOCABULARY.lighting.bands, used: domain.byteLength ?? 0, capacity: capabilities?.payloadBudget ?? 8192, paletteCapacity: capabilities?.paletteMaximum ?? 128,
        supportedPaints: capabilities?.registries.paints ?? [], supportedTargets: capabilities?.registries.targets ?? [], supportedFacts: capabilities?.registries.facts ?? [], supportedThings: capabilities?.registries.things ?? [], unknownRules: rules.filter(r => r.readOnly).length};
}
// Project identities onto the existing Keys presentation; the complete
// lighting program remains the only stored and edited form.
/** @param {import('../schema/lighting-types.js').LightingProfile} domain @returns {import('../schema/types.js').RgbProfile} */
function lightingIdentities(domain) {
    const off = {h: 0, s: 0, v: 0};
    /** @param {number} kind @param {number} id @param {number} [slot] */
    const colour = (kind, id, slot = 1) => {
        const table = domain.things.find(t => t.kind === kind); if (!table) return off;
        const record = table.records[id] ?? table.default, index = record[slot] === 254 ? table.default[slot] : record[slot];
        return domain.palette[index] ?? off;
    };
    /** @param {number} kind @param {number} id */
    const place = (kind, id) => {
        const table = domain.things.find(t => t.kind === kind); const record = table?.records[id] ?? table?.default;
        return record?.[0] === 254 ? table?.default[0] ?? 0 : record?.[0] ?? 0;
    };
    /** @param {number} place */
    const locality = place => ({0: 0, 1: 1, 2: 2, 4: 4, 5: 3})[place] ?? 0;
    const has = (/** @type {number} */ fact) => domain.rules.some(r => !(r.flags & 1) && r.parts.some(p => p.slot === 0 && p.kind === fact));
    const fade = domain.extensions.find(e => e.kind === 1);
    return {formatVersion: 5, stageEnableMask: (has(1) || has(2) ? 1 : 0) | (fade?.params[0] ? 2 : 0) | (has(3) ? 4 : 0) | (has(4) || has(7) ? 8 : 0) | (has(5) || has(8) ? 16 : 0),
        groups: domain.keySets.map((leds, id) => ({id, leds})),
        layerColors: Array.from({length: 16}, (_, id) => ({layerId: id, color: colour(1, id), mode: place(1, id) === 0 ? 0 : 1})), layerGroupRows: [],
        pdModeColors: Array.from({length: 32}, (_, id) => ({pdModeId: id, color: colour(2, id), locality: locality(place(2, id))})), pdModeGroupRows: [],
        comboFeedback: {color: colour(3, 255), locality: locality(place(3, 255))}, comboGroupRows: [],
        keyFeedback: {holdActiveColor: colour(4, 255), longHoldActiveColor: colour(4, 255, 2), tapCommittedColor: colour(4, 255, 3),
            tapBranchColors: (domain.things.find(t => t.kind === 4)?.default.slice(4) ?? []).map((_, index) => colour(4, 255, index + 4)), locality: locality(place(4, 255)), tapCommitMode: domain.extensions.some(e => e.kind === 2) ? 1 : 0}, keyGroupRows: [],
        automouseFade: {mode: fade?.params[1] ?? 0, endColor: domain.palette[fade?.params[2] ?? -1] ?? off}};
}


// Publish a sufficient native keymap basis with the draft. Queries must follow
// remaps and exact authored rows, independent of host-layout key labels.
/** @param {import('./types.js').DecodedProfile} decoded */
function lightingKeymap(decoded) {
    const {nativeCode} = require("../schema/actions");
    const rows = decoded.behaviors.rows.map(row => nativeCode(row.target));
    return {keymap: Object.fromEntries(decoded.document.layers.map((layer, id) => [id, Object.fromEntries(layer.map((code, key) => {
        const behaviour = rows.indexOf(code);
        return [key, {code, ...(behaviour < 0 ? {} : {behaviour})}];
    }))])), queryCombos: Object.fromEntries(decoded.combos.rows.map((c, id) => [id, {enabled: c.enabled, inputs: c.inputs.map(nativeCode).filter(n => n !== undefined), layers: Array.from({length: 16}, (_, l) => l).filter(l => c.allowedLayers & 1 << l)}]))};
}
module.exports = {lightingForView, lightingIdentities, lightingKeymap};
