// @ts-check
// Bounded native lifecycle projection from the pinned action-kind registry and
// ownership handlers. Paint identity is deliberately separate from lifecycle.
import {nativeIdentity} from "./lighting-facts.mjs";
/** @typedef {import('./lighting-simulator-types.js').Situation} Situation */
/** @typedef {import('./lighting-simulator-types.js').Event} Event */
/** @typedef {{kind: 'key'|'layer-hold'|'layer-goto'|'layer-toggle'|'mode-hold'|'mode-lock'|'conditional'; code: number; identity: [number, number] | null; outcome: number; keepsFeedback: boolean; reason?: string}} GestureAction */
/** @param {import('../../contracts/panel.js').PublishedModel} model @param {number} code @returns {GestureAction} */
export function classifyGestureAction(model, code) {
    const identity = nativeIdentity(code);
    /** @param {GestureAction['kind']} kind @param {string} [reason] @returns {GestureAction} */
    const result = (kind, reason) => ({kind, code, identity, outcome: identity?.[0] === 1 ? identity[1] + 1 : identity?.[0] === 2 ? identity[1] + 33 : 0, keepsFeedback: kind === "key", ...(reason ? {reason} : {})});
    if (identity?.[0] === 1) {
        if (code >= 0x5200 && code <= 0x521f) return result("layer-goto");
        if (code >= 0x5260 && code <= 0x527f || code >= 0x7ec0 && code <= 0x7ecf) return result("layer-toggle");
        if (code >= 0x5220 && code <= 0x523f || code >= 0x52c0 && code <= 0x52df) return result("layer-hold");
        if (code >= 0x5280 && code <= 0x529f) return result("conditional", "One-shot enabled state and prior arming time are not observable here; no one-shot layer is invented.");
        return result("conditional", "Nested LT/LM action planning and modifier ownership are not replayed here; no layer owner is invented.");
    }
    if (identity?.[0] === 2) {
        const slot = model.pdModes.find(m => m.id === identity[1]);
        if (!slot?.kind) return result("conditional", "This pointing slot is empty; no active mode or owner is inferred.");
        return result(code === slot.binding.holdCode ? "mode-hold" : "mode-lock");
    }
    if (identity?.[0] === 5) return result("conditional", "Nested macro playback is not replayed here; use an explicit local playback situation.");
    return result("key");
}
/** Update only a layer whose ownership changed; unrelated active bits are not
 * guessed to be locks. Base is always supplied by the existing fact renderer.
 * @param {Situation} s @param {number} layer */
function refreshLayer(s, layer) {
    const active = Object.values(s.layerOwners ?? {}).includes(layer) || (s.lockedLayers ?? []).includes(layer) || s.oneshotLayer === layer;
    s.layers = [...new Set([...(s.layers ?? []).filter(l => l !== layer && l !== 0), ...active && layer !== 0 ? [layer] : []])].sort((a, b) => a - b);
}
/** @param {Situation} s @param {number} layer @param {boolean} locked @param {Event[]} events */
function setLock(s, layer, locked, events) {
    if ((s.lockedLayers ?? []).includes(layer) === locked) return;
    s.lockedLayers = [...new Set([...(s.lockedLayers ?? []).filter(l => l !== layer), ...locked ? [layer] : []])].sort((a, b) => a - b);
    refreshLayer(s, layer);events.push({kind: locked ? 0 : 1, thing: layer, owners: []});
}
/** @param {Situation} s @param {number} id @param {boolean} locked @param {number[]} keys */
function setMode(s, id, locked, keys) {
    const halves = [...new Set(keys.map(k => k < 30 ? /** @type {const} */ ("left") : /** @type {const} */ ("right")))];
    s.mode = {id, locked, keys, halves};s.modeStatus = {...s.mode};
}
/** Same classification is used for registration, dispatch and release. A
 * press-only action never acquires a momentary owner merely due to its helper.
 * @param {Situation} s @param {GestureAction} action @param {'press'|'tap'|'release'} phase @param {number} owner @returns {Event[]} */
export function applyGestureAction(s, action, phase, owner) {
    /** @type {Event[]} */ const events = [];
    const id = action.identity?.[1];if (id === undefined) return events;
    if (action.kind === "layer-toggle" && phase !== "release") setLock(s, id, !(s.lockedLayers ?? []).includes(id), events);
    if (action.kind === "layer-goto" && phase !== "release") {
        if (id !== 0) setLock(s, id, true, events);
        for (const other of [...s.lockedLayers ?? []]) if (other !== id || id === 0) setLock(s, other, false, events);
        const once = s.oneshotLayer;delete s.oneshotLayer;if (once !== undefined) refreshLayer(s, once);
    }
    if (action.kind === "layer-hold" && phase !== "tap") {
        if (phase === "press") {const previous = s.layerOwners?.[owner];s.layerOwners ??= {};s.layerOwners[owner] = id;if (previous !== undefined && previous !== id) refreshLayer(s, previous);}
        else if (s.layerOwners?.[owner] === id) {delete s.layerOwners[owner];if (!Object.keys(s.layerOwners).length) delete s.layerOwners;}
        refreshLayer(s, id);
    }
    if (action.kind === "mode-hold" || action.kind === "mode-lock") {
        const before = s.mode ? structuredClone(s.mode) : null;
        const same = s.mode?.id === id, locked = same && (s.modeStatus?.locked ?? s.mode?.locked) === true;
        if (action.kind === "mode-lock" && phase !== "release") {
            if (locked) {delete s.mode;delete s.modeStatus;}
            else setMode(s, id, true, [owner]);
        } else if (action.kind === "mode-hold" && phase === "press" && !locked) setMode(s, id, false, [...new Set([...same ? s.mode?.keys ?? [] : [], owner])]);
        else if (action.kind === "mode-hold" && phase === "release" && same && !locked) {
            const keys = (s.mode?.keys ?? []).filter(k => k !== owner);
            if (keys.length) setMode(s, id, false, keys);else {delete s.mode;delete s.modeStatus;}
        }
        if (before?.id !== s.mode?.id) {
            if (before) events.push({kind: 4, thing: before.id, owners: before.keys ?? []});
            if (s.mode) events.push({kind: 3, thing: s.mode.id, owners: s.mode.keys ?? []});
        }
    }
    return events;
}
