// @ts-check
"use strict";
const {decodeLightingDomain, encodeLightingDomain} = require("../schema/lighting-domain-v1");
const {LIGHTING_KINDS, LIGHTING_SLOTS} = require("../schema/lighting-kinds-v1");
const {VOCABULARY} = require("./vocabulary");
/** @param {import('../schema/lighting-types.js').LightingRule} rule */
const ruleIdentity = rule => JSON.stringify([rule.flags, rule.brightness, rule.parts]);
/** @param {import('../schema/lighting-types.js').LightingRule} rule */
const knownRule = rule => rule.known !== false && rule.parts.every(p => Boolean(LIGHTING_KINDS[LIGHTING_SLOTS[p.slot]]?.[p.kind]));
/** @param {number[]} map */
const knownMap = map => map.every(value => value < 128 || Boolean(LIGHTING_KINDS.paints[value - 128]));
/** @param {import('../schema/lighting-types.js').LightingProfile} value */
const opaqueLighting = value => !value.rules.every(knownRule) || !value.maps.every(knownMap) || value.extensions.some(e => !LIGHTING_KINDS.domainExtensions[e.kind]);
// An unshared fixed paint can reuse its colour slot. Opaque parts may refer
// to any palette entry, so their presence forbids replacing existing entries.
/** @param {import('../schema/lighting-types.js').LightingProfile} value @param {number} index */
function colourReferences(value, index) {
    if (opaqueLighting(value)) return Infinity;
    let count = 0;
    for (const table of value.things) for (const record of [table.default, ...table.records]) count += record.slice(1).filter(value => value === index).length;
    for (const map of value.maps) count += map.filter(value => value === index).length;
    for (const rule of value.rules) for (const part of rule.parts) if ((part.slot === 3 || part.slot === 4) && (part.kind === 2 || part.kind === 6) && part.params[0] === index) count++;
    for (const extension of value.extensions) if (extension.kind === 1 && extension.params[2] === index) count++;
    return count;
}
/** @param {import('../schema/lighting-types.js').LightingRule} rule */
const ruleBand = rule => {
    const condition = rule.parts.find(p => p.slot === 0);
    if (!condition) return "base";
    return ({1: "layers", 2: "preview", 3: "modes", 4: "combos", 5: "feedback", 7: "combos", 8: "feedback", 9: "layers", 10: "modes", 11: "combos", 12: "feedback", 13: "macros", 14: "keys", 15: "alerts", 16: "alerts", 17: "pointer", 18: "base", 19: "layers", 20: "layers", 21: "layers", 22: "modes", 23: "modes", 24: "combos", 25: "feedback", 26: "feedback", 27: "feedback", 28: "macros"})[condition.kind] ?? "other";
};
/** @param {import('../schema/lighting-types.js').LightingRule} rule @param {string[]} [names] @param {{modes?: string[]; combos?: string[]; behaviours?: string[]; macros?: string[]}} [subjects] */
function ruleWords(rule, names = [], subjects = {}) {
    /** @param {number} layer */
    const layer = layer => layer === 255 ? "Any layer" : names[layer] || `Layer ${layer}`;
    const when = rule.parts.filter(p => p.slot <= 1).map(p => {
        const [value, scope] = p.params;
        let text;
        if (p.kind === 1) text = `${layer(value)} is active`;
        else if (p.kind === 2) text = `${layer(value)} is previewing`;
        else if (p.kind === 3) text = value === 255 ? "Any pointing mode is active" : `${subjects.modes?.[value] || `Pointing mode ${value + 1}`} is active`;
        else if (p.kind === 4) text = value === 0 ? "Combos leading into a preview or mode are held" : value === 1 ? "Other combos are held" : "Any combo is held";
        else if (p.kind === 7) text = value === 255 ? "Each held combo" : `${subjects.combos?.[value] || `Combo ${value + 1}`} is held`;
        else if (p.kind === 8) text = `${value === 255 ? "Each behaviour" : subjects.behaviours?.[value] || `Behaviour ${value + 1}`} shows ${VOCABULARY.lighting.states.filter((_, bit) => scope & 1 << bit).join(" or ").toLowerCase()}`;
        else if (p.kind === 5) text = `${value === 15 ? "Any key feedback" : VOCABULARY.lighting.states.filter((_, bit) => value & 1 << bit).join(" or ")} · ${VOCABULARY.lighting.scopes[scope]}`;
        else if (LIGHTING_KINDS.facts[p.kind]) {
            const descriptor = LIGHTING_KINDS.facts[p.kind];
            const details = p.params.map((v, i) => {
                const type = descriptor.parameters[i];
                if (VOCABULARY.lighting.choices[type]) return VOCABULARY.lighting.choices[type][v];
                if (type === "layer") return layer(v);
                if (type === "mode") return v === 255 ? "Any mode" : subjects.modes?.[v] || `Pointing mode ${v + 1}`;
                if (type === "thing") return v === 255 ? "Any" : descriptor.thing === 5 ? subjects.macros?.[v] || `Macro ${v + 1}` : descriptor.thing === 3 ? subjects.combos?.[v] || `Combo ${v + 1}` : subjects.behaviours?.[v] || `Behaviour ${v + 1}`;
                if (type === "tapSelector") return v === 255 ? "Any branch" : `Branch ${v}`;
                if (type === "keySelector") return v === 255 ? "Any key" : `Key position ${v + 1}`;
                return String(v);
            });
            text = [VOCABULARY.lighting.facts[p.kind], ...details].join(" · ");
        } else text = "A condition from newer firmware";
        return p.slot === 1 ? `Not: ${text}` : text;
    }).join(" and ") || "Always";
    const target = rule.parts.find(p => p.slot === 2), paint = rule.parts.find(p => p.slot === 3);
    const where = target?.kind === 8 ? `Keys that ${VOCABULARY.lighting.choices.keyQuery[target.params[0]].toLowerCase()}${target.params[1] === 255 ? "" : ` · ${target.params[1] + 1}`}` : target?.kind === 3 ? `Saved key set ${target.params[0] + 1}` : VOCABULARY.lighting.targets[target?.kind ?? -1] ?? "A target from newer firmware";
    const how = VOCABULARY.lighting.paints[paint?.kind ?? -1] ?? "A paint from newer firmware";
    return {when, where, how};
}
/** @param {Uint8Array} bytes @param {import('../../contracts/edits.js').EditOf<'editLightingRule'>} edit @param {import('../schema/lighting-types.js').LightingOptions} [options] */
function editLightingRule(bytes, edit, options = {}) {
    const value = decodeLightingDomain(bytes, options);
    /** @param {string} message @returns {never} */
    const fail = message => {throw Object.assign(new Error(message), {code: "INVALID_EDIT"});};
    if (edit.action === "add") {
        if (!options.capabilities || !edit.rule) return fail("Choose a lighting rule supported by this keyboard.");
        if (!knownRule(edit.rule)) return fail("New lighting rules must use kinds this Ark understands.");
        value.rules.unshift({...edit.rule, parts: edit.rule.parts.map(p => ({...p, params: [...p.params]}))});
        return encodeLightingDomain(value, options);
    }
    if (!Number.isInteger(edit.index) || edit.index < 0 || edit.index >= value.rules.length) fail("This lighting rule no longer exists.");
    const rule = value.rules[edit.index];
    if (edit.expectedRule !== ruleIdentity(rule)) fail("This lighting rule changed. Read its current value before editing.");
    if (!knownRule(rule)) fail("This rule needs a newer Ark and is read-only.");
    const fade = value.extensions.find(e => e.kind === 1), base = fade?.params[3] ?? 0, sceneStart = value.rules.length - base;
    if (edit.action === "configure") {
        if (!edit.rule) return fail("Choose a complete lighting rule.");
        if (!knownRule(edit.rule)) return fail("Choose lighting kinds this Ark can edit.");
        value.rules[edit.index] = {...edit.rule, flags: rule.flags, parts: edit.rule.parts.map(p => ({...p, params: [...p.params]}))};
    } else if (edit.action === "toggle") rule.flags ^= 1;
    else if (edit.action === "delete") {
        value.rules.splice(edit.index, 1);
        if (fade && edit.index >= sceneStart) fade.params[3]--;
    } else if (edit.action === "move") {
        if (!Number.isInteger(edit.to) || edit.to === undefined || edit.to < 0 || edit.to >= value.rules.length) fail("Choose a valid place for this lighting rule.");
        const to = /** @type {number} */ (edit.to);
        value.rules.splice(edit.index, 1); value.rules.splice(to, 0, rule);
        // The fade's scene is a bottom suffix in firmware, not a list of ids.
        // Keep its boundary fixed when ordering changes; describe this in Review.
    } else if (edit.action === "colour") {
        const paint = rule.parts.find(p => p.slot === 3);
        if (!paint || !(options.capabilities?.registries.paints ?? Object.keys(LIGHTING_KINDS.paints).map(Number)).includes(2)) fail("This rule's paint cannot be changed to a colour on this keyboard.");
        if (!paint) return fail("This rule has no paint.");
        const colour = edit.colour;
        if (!colour) return fail("Choose a colour.");
        if (!colour || [colour.h, colour.s, colour.v].some(v => !Number.isInteger(v) || v < 0 || v > 255) || colour.v > (options.maximumBrightness ?? 255)) fail("Choose a colour within this keyboard's brightness limit.");
        let index = value.palette.findIndex(c => c.h === colour.h && c.s === colour.s && c.v === colour.v);
        if (index < 0) {
            if (paint.kind === 2 && colourReferences(value, paint.params[0]) === 1) {
                index = paint.params[0];value.palette[index] = {...colour};
            } else {index = value.palette.length;value.palette.push({...colour});}
        }
        paint.kind = 2; paint.params = [index];
    } else fail("Unknown lighting edit.");
    return encodeLightingDomain(value, options);
}
module.exports = {ruleIdentity, knownRule, knownMap, opaqueLighting, ruleBand, ruleWords, editLightingRule};
