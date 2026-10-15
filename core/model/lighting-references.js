// @ts-check
"use strict";
const {decodeLightingDomain, encodeLightingDomain} = require("../schema/lighting-domain-v1");
const {knownRule} = require("./lighting-editor");
const {PROFILE_DOMAIN_IDS} = require("../schema/profile-blob-v1");
/** @param {ReturnType<typeof import('../schema/profile-blob-v1').decodeProfileBlob>} profile @param {number} kind @param {(number | null)[]} previousIds @param {import('../schema/lighting-types.js').LightingOptions} options */
function rewriteLightingThings(profile, kind, previousIds, options) {
    const domain = profile.domains.find(d => d.id === PROFILE_DOMAIN_IDS.RGB);
    if (!domain || domain.payload[0] !== 5) return;
    const program = decodeLightingDomain(domain.payload, options);
    remapLightingThings(program, kind, previousIds);
    domain.payload = encodeLightingDomain(program, options);
}
/** @param {import('../schema/lighting-types.js').LightingProfile} program @param {number} kind @param {(number | null)[]} previousIds */
function remapLightingThings(program, kind, previousIds) {
    const table = program.things.find(t => t.kind === kind);
    if (table) {
        const old = table.records;
        table.records = previousIds.map(id => id === null ? table.default.map(() => 254) : [...(old[id] ?? table.default.map(() => 254))]);
        while (table.records.length && table.records.at(-1)?.every(n => n === 254)) table.records.pop();
    }
    const selectors = kind === 3 ? [7, 11, 24] : [8, 12, 25, 26, 27], removed = new Set();
    program.rules = program.rules.filter((rule, at) => {
        if (!knownRule(rule)) return true;
        for (const p of rule.parts) if (p.slot <= 1 && selectors.includes(p.kind) && p.params[0] !== 255) {
            const id = previousIds.indexOf(p.params[0]);
            if (id < 0) {removed.add(at);return false;}
            p.params[0] = id;
        }
        for (const p of rule.parts) if (p.slot === 2 && p.kind === 8 && p.params[0] === (kind === 3 ? 15 : 14) && p.params[1] !== 255) {
            const id = previousIds.indexOf(p.params[1]);
            if (id < 0) {removed.add(at);return false;}
            p.params[1] = id;
        }
        return true;
    });
    const fade = program.extensions.find(e => e.kind === 1);
    if (fade) {
        const end = program.rules.length + removed.size, start = end - fade.params[3];
        fade.params[3] -= [...removed].filter(at => at >= start).length;
    }
}
module.exports = {rewriteLightingThings, remapLightingThings};
