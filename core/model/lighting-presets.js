// @ts-check
"use strict";
const {decodeLightingDomain, encodeLightingDomain} = require("../schema/lighting-domain-v1");
const {convertLightingV4} = require("../schema/lighting-conversion-v1");
const {opaqueLighting} = require("./lighting-editor");
const {lightingWorkingCost} = require("../schema/lighting-working-v1");
/** @typedef {import('../schema/lighting-types.js').LightingProfile} Program */
/** @typedef {import('../schema/lighting-types.js').LightingOptions} Options */
/** Exact compiled bytes read with the profile; conversion is the existing codec.
 * @param {Uint8Array | null | undefined} bytes @param {Options} options */
function factoryLighting(bytes, options) {
    if (!bytes) throw new Error("Read the keyboard's compiled lighting to use this preset.");
    return decodeLightingDomain(bytes[0] === 4 ? convertLightingV4(bytes, options) : bytes, options);
}
/** @param {Program} current @param {Uint8Array | null | undefined} factory @param {{enabled?: boolean}[]} combos @param {Options} options @param {'standard' | 'minimal' | 'teaching'} name */
function lightingPreset(current, factory, combos, options, name) {
    if (!options.capabilities) throw new Error("This keyboard has not reported lighting support.");
    const standard = factoryLighting(factory, options);
    /** @type {Program} */ let program;
    if (name === "standard") program = standard;
    else if (name === "minimal" || name === "teaching") {
        // Layer recipe from the exact factory conversion, without fade/commit
        // extensions. Minimal takes the factory identities; Teaching keeps the
        // current identities and adds independent combo colour snapshots.
        program = {...structuredClone(standard), rules: standard.rules.filter(r => r.parts[0]?.slot === 0 && r.parts[0].kind === 1), extensions: []};
        if (name === "teaching") {
            const caps = options.capabilities.registries;
            if (!caps.facts.includes(9) || !caps.targets.includes(8) || !caps.paints.includes(9) || !caps.paints.includes(2) || !caps.things.includes(1) || !caps.things.includes(3)) throw new Error("Teaching needs top-layer conditions, live key queries, direct-action paint and layer/combo identities.");
            // Retain current identity tables and their palette references. Remap
            // the factory layer accents onto appended factory colours, so no
            // table reference changes its meaning.
            const offset = current.palette.length;
            program.palette = [...structuredClone(current.palette), ...structuredClone(standard.palette)];
            program.things = structuredClone(current.things);
            if (!program.things.some(t => t.kind === 1) || !program.things.some(t => t.kind === 3)) throw new Error("Teaching needs this profile's layer and combo identities.");
            for (const map of program.maps) for (let led = 0; led < map.length; led++) if (map[led] < 128) map[led] += offset;
            for (const r of program.rules) for (const p of r.parts) if ((p.slot === 3 || p.slot === 4) && [2, 6].includes(p.kind)) p.params[0] += offset;
            /** @param {number} query @param {number} selector @param {number} paint @param {number[]} [params] */
            const accent = (query, selector, paint, params = []) => ({flags: 0, brightness: 255, parts: [{slot: 0, kind: 9, params: [255, 0]}, {slot: 2, kind: 8, params: [query, selector]}, {slot: 3, kind: paint, params}]});
            const hints = [accent(10, 255, 9)], table = current.things.find(t => t.kind === 3);
            /** @type {Map<string, number>} */ const copied = new Map();
            combos.forEach((combo, id) => {
                if (!combo.enabled || !table) return;
                const record = table.records[id] ?? table.default, ref = record[1] === 254 ? table.default[1] : record[1], colour = current.palette[ref];
                if (ref === 255 || !colour) return;
                const key = JSON.stringify(colour);
                let index = copied.get(key);
                if (index === undefined) {index = program.palette.length;program.palette.push({...colour});copied.set(key, index);}
                // Lower combo row wins overlap. Copies never alias an identity.
                hints.splice(hints.length - 1, 0, accent(15, id, 2, [index]));
            });
            program.rules.unshift(...hints);
        }
    } else throw new Error("Choose Standard, Minimal or Teaching lighting.");
    const bytes = encodeLightingDomain(program, {...options, allowUnknown: false});
    program = decodeLightingDomain(bytes, options);
    if (program.palette.length > options.capabilities.paletteMaximum) throw new Error("This preset has more colours than the keyboard accepts.");
    const working = lightingWorkingCost(program, options.capabilities.working);
    if (!working.admitted) throw new Error(working.reason || "This preset needs more lighting working memory than the keyboard provides.");
    return {program, bytes, working, replacesUnknown: opaqueLighting(current)};
}
/** @param {Program} current @param {Uint8Array | null | undefined} factory @param {{enabled?: boolean}[]} combos @param {Options} options */
function lightingPresets(current, factory, combos, options) {
    return /** @type {const} */ (["standard", "minimal", "teaching"]).map(name => {
        try {const {program, working, replacesUnknown} = lightingPreset(current, factory, combos, options, name);return {name, program, working, replacesUnknown};}
        catch (e) {
            const error = /** @type {Error & {code?: string}} */ (e);
            const reason = error.code === "CAPACITY_EXCEEDED" ? "This preset does not fit the keyboard's saved lighting memory." : error.code === "BRIGHTNESS_EXCEEDED" ? "The compiled colours exceed this keyboard's brightness limit." : error.code === "UNSUPPORTED_KIND" ? "This preset needs lighting support the keyboard does not advertise." : error.message;
            return {name, reason};
        }
    });
}
module.exports = {factoryLighting, opaqueLighting, lightingPreset, lightingPresets};
