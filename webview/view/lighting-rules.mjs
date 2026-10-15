// @ts-check
import {vocabulary} from "./vocabulary.mjs";
/** @typedef {import('../../contracts/panel.js').PublishedModel} Model */
/** @param {Model} model @param {string} type @param {number} [thing] @returns {[number, string][]} */
export function lightingParameterChoices(model, type, thing = 0) {
    const lighting = model.rgb.lighting, words = vocabulary(model).lighting;
    const any = (/** @type {[number, string][]} */ choices, label = "Any") => [[255, label], ...choices];
    const numbered = (/** @type {number} */ count, /** @type {string} */ name) => Array.from({length: count}, (_, i) => [i, `${name} ${i + 1}`]);
    /** @type {[number, string][]} */ let result = [];
    if (words.choices[type]) return words.choices[type].map((name, i) => [i, name]);
    if (type === "layer") result = model.layers.map(l => [l.index, l.displayName || l.name]);
    else if (type === "mode") result = model.pdModes.map(m => [m.id, m.displayName || m.name || `Pointing mode ${m.id + 1}`]);
    else if (type === "thing") result = thing === 3 ? model.combos.map((c, i) => [i, c.badge || `Combo ${i + 1}`]) : thing === 4 ? model.keyBehaviors.map((b, i) => [i, model.qmkKeyLabels[b.keycode] || b.keycode]) : thing === 5 ? model.viaMacros.map((m, i) => [i, m.name || `Macro ${i + 1}`]) : numbered(128, "Thing").map(([n, label]) => [Number(n), String(label)]);
    else if (type === "keySelector") result = Array.from({length: 60}, (_, k) => [k, `Key position ${k + 1} · ${k < 30 ? "left" : "right"} ${Math.floor(k / 6) % 5 + 1}:${k % 6 + 1}`]);
    else if (type === "tapSelector") return [[255, "Any branch"], ...Array.from({length: model.behaviorEditing.maxTapStepsPerBehavior}, (_, i) => [i + 1, `Branch ${i + 1}`])].map(([n, label]) => [Number(n), String(label)]);
    else if (type === "role") return [[255, "Any held combo"], [0, "Leading into a preview or mode"], [1, "Other held combos"]];
    else if (type === "scope") return words.scopes.map((label, i) => [i, label]);
    else if (type === "states") return Array.from({length: 15}, (_, i) => [i + 1, words.states.filter((_, bit) => (i + 1) & 1 << bit).join(" or ")]);
    else if (type === "set") return (lighting?.program.keySets ?? []).map((_, i) => [i, `Saved key set ${i + 1}`]);
    else if (type === "map") return (lighting?.program.maps ?? []).map((_, i) => [i, `Painted map ${i + 1}`]);
    else if (type === "colour") return (lighting?.program.palette ?? []).map((_, i) => [i, `Palette colour ${i + 1}`]);
    else if (type === "level") return Array.from({length: 256}, (_, i) => [i, `${Math.round(i / 255 * 100)}% (${i})`]);
    return /** @type {[number, string][]} */ (any(result));
}
/** @param {Model} model @param {string} registry @param {number} kind @returns {number[]} */
export function defaultLightingParams(model, registry, kind) {
    const d = model.rgb.lighting?.descriptors[registry]?.[kind];
    return d?.parameters.map(type => type === "milliseconds" ? 0 : lightingParameterChoices(model, type, d.thing)[0]?.[0] ?? 255) ?? [];
}
/** @param {Model} model @param {import('../../contracts/lighting.js').LightingRule} source */
export function normaliseLightingRule(model, source) {
    const rule = structuredClone(source), first = rule.parts.find(p => p.slot < 2);
    const event = first?.slot === 0 && model.rgb.lighting?.descriptors.facts[first.kind]?.construction === "event";
    rule.parts = rule.parts.filter(p => p.slot !== 5 || (p.kind !== 2 || !event) && (p.kind !== 3 || event));
    if (event && !rule.parts.some(p => p.slot === 5 && p.kind === 3)) rule.parts.push({slot: 5, kind: 3, params: [244, 1]});
    rule.parts.sort((a, b) => Math.max(1, a.slot) - Math.max(1, b.slot) || (a.slot === 5 ? a.kind - b.kind : 0));
    return rule;
}
/** @param {Model} model @param {{kind: number; params: number[]; keys: number[]}[]} chips @returns {import('./lighting-simulator-types.js').Situation} */
export function lightingSituation(model, chips) {
    const lighting = model.rgb.lighting;
    /** @type {import('./lighting-simulator-types.js').Situation} */
    const s = {layers: [], mapped: {}, keymap: lighting?.keymap, queryCombos: lighting?.queryCombos};
    for (const [layer, keys] of Object.entries(s.keymap ?? {})) (s.mapped ??= {})[Number(layer)] = Object.entries(keys).filter(([, k]) => k.code !== 0 && k.code !== 1).map(([k]) => Number(k));
    for (const {kind, params: p, keys} of chips) {
        const id = p[0] === 255 ? 0 : p[0];
        /** @type {Record<number, () => void>} */ const collect = {
            1: () => s.layers?.push(id), 2: () => {s.preview = id;},
            3: () => {s.mode = {id, keys, halves: [...new Set(keys.map(k => k < 30 ? /** @type {const} */ ("left") : /** @type {const} */ ("right")))]};},
            4: () => {s.combos = {...s.combos, [p[0] === 0 ? "owning" : "others"]: keys};},
            5: () => {
                const state = /** @type {const} */ (["branch", "tap", "hold", "long"])[Math.max(0, [0, 1, 2, 3].findIndex(bit => p[0] & 1 << bit))];
                s.behaviour ??= {keys: {}, owners: {}};keys.forEach(k => {(s.behaviour ??= {keys: {}}).keys[k] = {state, branch: 2, lit: true};});
                s.behaviour.owners = {board: keys.at(-1) ?? 0, left: keys.find(k => k < 30) ?? 0, right: keys.find(k => k >= 30) ?? 30, [state]: keys.at(-1) ?? 0};
            },
            7: () => {s.combos ??= {};s.combos.instances ??= [];s.combos.instances.push({id, role: p[1] === 255 ? 1 : p[1], keys});},
            8: () => {s.behaviour ??= {keys: {}};const state = /** @type {const} */ (["branch", "tap", "hold", "long"])[Math.max(0, [0, 1, 2, 3].findIndex(bit => p[1] & 1 << bit))];keys.forEach(k => {(s.behaviour ??= {keys: {}}).keys[k] = {id, state, branch: 2, lit: true};});},
            9: () => {
                s.layers?.push(id);
                if (p[1] === 1) {s.layerOwners ??= {};keys.forEach(k => {(s.layerOwners ??= {})[k] = id;});}
                if (p[1] === 2) {s.lockedLayers ??= [];s.lockedLayers.push(id);}
                if (p[1] === 3) s.oneshotLayer = id;
            },
            10: () => {s.modeStatus = {id, locked: Boolean(p[1]), keys, halves: [...new Set(keys.map(k => k < 30 ? /** @type {const} */ ("left") : /** @type {const} */ ("right")))]};},
            11: () => {s.comboLayers ??= [];s.comboLayers.push({id, layer: p[1] === 255 ? 0 : p[1], keys});},
            12: () => {s.behaviourPhases ??= {};keys.forEach(k => {(s.behaviourPhases ??= {})[k] = {id, phases: [p[1]], branch: p[2] === 255 ? 1 : p[2]};});},
            13: () => {s.macroPlaying = id;}, 14: () => {s.pressedKeys ??= [];s.pressedKeys.push(id);},
            15: () => {s.modifiers ??= [0, 0];s.modifiers[p[2]] |= p[1] === 2 ? (1 << id) | (1 << id + 4) : 1 << id + 4 * p[1];},
            16: () => {s.hostLocks = (s.hostLocks ?? 0) | 1 << id;}, 17: () => {s.pointer = (s.pointer ?? 0) | 1 << id;}, 18: () => {s.idle = true;},
        };
        collect[kind]?.();
    }
    return s;
}
