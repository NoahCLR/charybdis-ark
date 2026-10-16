// @ts-check
import {lifetimeStatus} from "./lighting-lifetime.mjs";
import {LightingSimulator} from "./lighting-simulator.mjs";
import {lightingSituation} from "./lighting-rules.mjs";
/** @typedef {import('./lighting-simulator-types.js').Observation} Observation */
/** Replay exact observations; disabling a whole rule includes its background.
 * Indices stay fixed; retained D1/D2 batches are rebuilt, never borrowed.
 * @param {import('../../contracts/lighting.js').LightingProgram} program @param {Observation[]} history @param {number} depth @param {number | null} [clearRule] */
export function replayLighting(program, history, depth, clearRule = null) {
    const copy = structuredClone(program);
    if (clearRule !== null && copy.rules[clearRule]) copy.rules[clearRule].flags |= 1;
    const simulator = new LightingSimulator(copy, depth);
    let frame = /** @type {(number[] | null)[]} */ (Array(58).fill(null));
    /** @type {import('./lighting-simulator-types.js').Situation | null} */ let previous = null;
    for (const step of history) {
        // A held local situation stays true between authored observations.
        // Tick existing gates before a later input change, without renewing a
        // full-match entry or inventing another event occurrence.
        if (previous && simulator.lastTime !== undefined) {
            let remaining = ((step.situation.time ?? 0) - simulator.lastTime) >>> 0;
            while (remaining > 0 && remaining < 0x80000000) {
                const wakes = [...simulator.histories.values()].map(h => lifetimeStatus(h.cell, h.timing).wake).filter(w => w > 0);
                const wake = Math.min(...wakes);
                if (wake >= remaining) break;
                simulator.observe({...previous, time: ((simulator.lastTime ?? 0) + wake) >>> 0});
                remaining -= wake;
            }
        }
        simulator.observe(step.situation, step.event ?? null);previous = step.situation;
    }
    if (previous) frame = simulator.frame(previous);
    return {simulator, frame};
}
/** Independent histories, explicit situations; never reuse the main simulator.
 * @param {import('../../contracts/panel.js').PublishedModel} model @param {number} layer */
export function lightingLooks(model, layer) {
    const base = lightingSituation(model, [{kind: 1, params: [layer], keys: []}]);
    /** @type {{kind: number; id: number; title: string; note: string; situation: import('./lighting-simulator-types.js').Situation; available: boolean}[]} */
    const looks = model.layers.map(l => ({kind: 1, id: l.index, title: l.displayName || l.name, note: `Layer ${l.index} over Base · 0 ms`, situation: {...base, time: 0, layers: [l.index]}, available: Boolean(model.rgb.lighting?.supportedFacts.includes(1))}));
    for (const mode of model.pdModes) {
        const code = mode.binding?.holdCode, key = Object.entries(base.keymap?.[layer] ?? {}).find(([, v]) => v.code === code)?.[0], keys = key === undefined ? [] : [Number(key)];
        const available = Boolean(mode.kind && model.rgb.lighting?.supportedFacts.includes(3));
        looks.push({kind: 2, id: mode.id, title: mode.displayName || mode.name, note: !mode.kind ? "Empty pointing slot" : `Held mode · layer ${layer} · ${keys.length ? `owner matrix ${keys[0]}` : "no direct owner on this layer; whole-board fallback"} · 0 ms`, situation: {...base, time: 0, mode: {id: mode.id, keys, halves: keys.map(k => k < 30 ? "left" : "right")}}, available});
    }
    model.combos.forEach((combo, id) => {
        const query = base.queryCombos?.[id], keys = Object.entries(base.keymap?.[layer] ?? {}).filter(([, v]) => query?.inputs.includes(v.code)).map(([k]) => Number(k));
        const enabled = combo.enabled !== false && Boolean((combo.allowedLayers ?? 0xffff) & 1 << layer) && model.comboReadback.enabled !== false;
        const available = enabled && Boolean(model.rgb.lighting?.supportedFacts.includes(7));
        looks.push({kind: 3, id, title: combo.badge, note: `${enabled ? "Configured combo held (other role)" : "Combo disabled on this layer"} · layer ${layer} · owners ${keys.join(", ") || "none"} · 0 ms; firing is not guaranteed`, situation: {...base, time: 0, combos: {others: keys, instances: [{id, role: 1, keys}]}}, available});
    });
    return looks;
}
