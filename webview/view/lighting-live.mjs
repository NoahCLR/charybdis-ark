// @ts-check
import {lightingRgb} from "./lighting-simulator.mjs";
import {factSubjects} from "./lighting-facts.mjs";
import {lightingSituation} from "./lighting-rules.mjs";
/** @typedef {import('./lighting-simulator-types.js').Situation} Situation */
/** @param {number[]} p @param {number} [start] */
const keys = (p, start = 0) => Array.from({length: 60}, (_, k) => k).filter(k => p[start + (k >> 3)] & 1 << (k & 7));
/** @param {number} p @returns {import('./lighting-simulator-types.js').Half[]} */
const halves = p => [...(p & 1 ? [/** @type {const} */ ("left")] : []), ...(p & 2 ? [/** @type {const} */ ("right")] : [])];
/** @param {number[]} p @param {number} bit @param {number} width */
const packed = (p, bit, width) => ((p[bit >> 3] | (p[(bit >> 3) + 1] ?? 0) << 8) >> (bit & 7)) & (1 << width) - 1;
// Exact producer v1 slices. Missing modules remain unavailable knowledge.
// This projects a single cut onto the existing pure fact walkers; no sample
// is ever fed to the local timeline or its retained histories.
/** @param {import('../../contracts/panel.js').PublishedModel} model @param {import('../../contracts/lighting-live.js').LightingLiveSample} sample */
export function sampledSituation(model, sample) {
    if (sample.matrixKeys !== 60 || sample.ledCount !== 58 || sample.leftCount !== 29) throw new Error("This sample uses a geometry this Ark cannot explain.");
    /** @type {Record<number, number>} */ const lengths = {1: 2, 2: 1, 3: 11, 4: 16, 5: 61, 7: 40, 8: 180, 9: 64, 10: 11, 11: 40, 12: 180, 13: 1, 14: 8, 15: 2, 16: 1, 17: 1, 18: 1};
    for (const [id, p] of Object.entries(sample.slices)) if (lengths[Number(id)] !== p.length) throw new Error("This sample contains an unknown fact slice or producer layout.");
    const s = {...lightingSituation(model, []), time: sample.captured}, p = sample.slices;
    if (p[1]) s.layers = Array.from({length: 16}, (_, l) => l).filter(l => p[1][l >> 3] & 1 << (l & 7));
    if (p[2]?.[0] < 16) s.preview = p[2][0];
    if (p[3]?.[0] < 32) s.mode = {id: p[3][0], keys: p[3][2] ? keys(p[3], 3) : [], halves: halves(p[3][1])};
    if (p[4]) s.combos = {owning: keys(p[4]), others: keys(p[4], 8)};
    if (p[7]) (s.combos ??= {}).instances = Array.from({length: 4}, (_, i) => i * 10).filter(i => p[7][i] < 128).map(i => ({id: p[7][i], role: p[7][i + 1], keys: keys(p[7], i + 2)}));
    if (p[5] || p[8]) s.behaviour = {keys: {}, standardKeys: {}, owners: {}};
    if (p[5] && s.behaviour) {
        const v = p[5], b = s.behaviour;
        for (let k = 0; k < 60; k++) {
            const semantic = packed(v.slice(8, 31), k * 3, 3), branch = packed(v.slice(38), k * 3, 3);
            if (!semantic || semantic > 6) continue;
            const state = semantic <= 2 ? "hold" : semantic <= 4 ? "long" : semantic === 5 ? "branch" : "tap";
            (b.standardKeys ??= {})[k] = {state, branch: branch ? branch + 1 : 0, flashing: semantic === 2 || semantic === 4, lit: Boolean(v[k >> 3] & 1 << (k & 7))};
        }
        ["board", "left", "right", "branch", "tap", "hold", "long"].forEach((name, i) => {if (v[31 + i] < 60) (b.owners ??= {})[name] = v[31 + i];});
    }
    if (p[8] && s.behaviour) for (let k = 0; k < 60; k++) {
        const [id, slot, outcome] = p[8].slice(k * 3, k * 3 + 3);
        if (!id || id > 128 || !slot) continue;
        s.behaviour.keys[k] = {id: id - 1, slot: slot - 1, state: slot === 1 ? "hold" : slot === 2 ? "long" : slot === 3 ? "tap" : "branch", branch: slot <= 4 ? 2 : slot - 2, outcome};
    }
    if (p[9]) {s.layerOwners = {};for (let k = 0; k < 60; k++) if (p[9][k] > 0 && p[9][k] <= 16) s.layerOwners[k] = p[9][k] - 1;s.lockedLayers = Array.from({length: 16}, (_, l) => l).filter(l => p[9][60 + (l >> 3)] & 1 << (l & 7));if (p[9][62] < 16) s.oneshotLayer = p[9][62];s.topLayer = p[9][63];}
    if (p[10]) {const v = p[10];s.modeStatuses = {};if (v[0] < 32 && v[0] !== v[1]) s.modeStatuses.held = {id: v[0], locked: false, keys: keys(v, 3), halves: halves(v[2])};if (v[1] < 32) s.modeStatuses.locked = {id: v[1], locked: true, keys: keys(v, 3), halves: halves(v[2])};}
    if (p[11]) s.comboLayers = Array.from({length: 4}, (_, i) => i * 10).filter(i => p[11][i] < 128 && p[11][i + 1] < 16).map(i => ({id: p[11][i], layer: p[11][i + 1], keys: keys(p[11], i + 2)}));
    if (p[12]) {s.behaviourPhases = {};for (let k = 0; k < 60; k++) if (p[12][3 * k]) s.behaviourPhases[k] = {id: p[12][3 * k] - 1, phases: Array.from({length: 5}, (_, n) => n).filter(n => p[12][3 * k + 1] & 1 << n), branch: p[12][3 * k + 2]};}
    if (p[13]?.[0] < 128) s.macroPlaying = p[13][0];if (p[14]) s.pressedKeys = keys(p[14]);if (p[15]) s.modifiers = [...p[15]];if (p[16]) s.hostLocks = p[16][0];if (p[17]) s.pointer = p[17][0];if (p[18]) s.idle = Boolean(p[18][0]);
    return s;
}
/** @param {import('../../contracts/panel.js').PublishedModel} model @param {import('../../contracts/lighting-live.js').LightingLiveSample} sample */
export function liveConditions(model, sample) {
    const situation = sampledSituation(model, sample), lighting = model.rgb.lighting;
    return (lighting?.program.rules ?? []).map((rule, index) => {
        const conditions = rule.parts.filter(p => p.slot < 2);
        if (rule.flags & 1) return {index, state: "Disabled"};
        if (rule.known === false || conditions.some(p => !sample.slices[p.kind]) || rule.parts.some(p => p.slot === 5)) return {index, state: "Indeterminate · events, timing or unavailable facts"};
        const matches = conditions.every(p => Boolean(factSubjects(p.kind, p.params, situation, model.behaviorEditing.maxTapStepsPerBehavior).length) !== (p.slot === 1));
        return {index, state: matches ? "Sampled conditions match" : "Sampled conditions do not match"};
    });
}
/** @param {(number[] | null)[]} frame @param {import('../../contracts/panel.js').PublishedModel | null} model */
export function completeLocalFrame(frame, model) {
    const lighting = model?.rgb.lighting;
    if (!model || !lighting || frame.length !== 58 || lighting.unknownRules || lighting.rules.some(r => r.readOnly)) return {reason: "This look includes lighting Ark cannot fully interpret.", bytes: null};
    if (!model.rgb.baseEffect.previewColor && lighting.program.rules.some(r => !(r.flags & 1) && r.parts.some(p => [3, 4].includes(p.slot) && [5, 6].includes(p.kind))) ) return {reason: "This look reads an unknown base effect. Choose a complete known look first.", bytes: null};
    const base = model.rgb.baseEffect.previewColor;
    const complete = frame.map(c => c ?? (base ? lightingRgb({h: Number(base.h), s: Number(base.s), v: Number(base.v)}) : null));
    if (complete.some(c => !c || c.length !== 3 || c.some(v => !Number.isInteger(v) || v < 0 || v > 255))) return {reason: "This look leaves base-effect LEDs unknown. Paint a complete look first.", bytes: null};
    return {reason: "", bytes: complete.flatMap(c => c ?? [])};
}
