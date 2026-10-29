// @ts-check
"use strict";

// The walk over the layer states a profile can reach from a keyboard at rest
// (layer-reach.js): the profile in the walk's terms, what each state offers,
// the compact symbolic walk, and the bounded walk over explicit states when
// that one cannot decide.

const {ALL_LAYERS, CHARYBDIS_4X6_LAYOUT_MATRIX, LAYERS, layersAbove, matrixPosition} = require("../data/charybdis-layout");
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {SETTING, alwaysOnLayers} = require("../schema/settings-domain-v1");
const {actionName, nativeCode} = require("../schema/actions");
const {layerName} = require("./vocabulary");
const {analyzeLayerStates, maskOf: layersOf, lowest} = require("./layer-state-graph");
const {compileLayerAnswers, answeringLayer} = require("./layer-resolution");
const {participation} = require("./participation");
const {linkStartHolds} = require("../../rules/pointing-link-starts.mjs");
const {actionEffects, bit, codeName, keyEffects, linkFacts} = require("./layer-effects");
const {comboReferenceLayers} = require("./combo-reach");

/**
 * @typedef {import("./types.js").OfferedLayerEffect} OfferedEffect
 * @typedef {import("./types.js").WalkLayerEffect} WalkEffect
 * @typedef {import("./types.js").LayerCondition} Condition
 * @typedef {import("../schema/types.js").BehaviorRow} BehaviorRow
 * @typedef {ReturnType<typeof profileFacts>} Facts
 * @typedef {OfferedEffect & {when: Condition}} Transition
 * @typedef {Extract<import("./types.js").LayerAnalysisResult<Transition>, {reachedLayers: number}> & {symbolic: true, cache: Map<number, OfferedEffect[]>, reachableCombos: Set<number>, parent?: undefined, edges?: undefined, home?: undefined, affectedLayers?: number, uncertainty?: undefined}} SymbolicWalk
 * @typedef {import("./types.js").BoundedLayerWalk | SymbolicWalk} Walk
 */
const TRANSPARENT = 0x0001;
const NOTHING = 0x0000;
// Enough to name a way in without listing every superset of one trap.
const MAX_TRAPS = 4;
// Each layer has independent held and locked bits: sixteen layers cannot be
// exhaustively enumerated in the panel. Bound both states and retained edges;
// a partial graph proves neither a trap nor a missing way into a layer.
const MAX_WALK_STATES = 4096, MAX_WALK_EDGES = 65536;

// The parts of a validated profile (portable-profile.validateSnapshot) the
// walk reads, in its own terms.
/** @param {import("./types.js").DecodedProfile} decoded */
function profileFacts(decoded) {
    const values = decoded.settings.values;
    const names = decoded.settings.names;
    const layers = decoded.layers.map((codes) => CHARYBDIS_4X6_LAYOUT_MATRIX.map((position, layoutIndex) => codes[matrixPosition(layoutIndex)]));
    /** @type {Map<number, BehaviorRow>} */
    const rows = new Map();
    for (const row of decoded.behaviors?.rows || []) {
        const code = row.target.kind === ACTION.QMK_KEYCODE ? row.target.operand : nativeCode(row.target);
        if (code !== undefined && Number.isInteger(code) && !rows.has(code)) rows.set(code, row);
    }
    const references = comboReferenceLayers(decoded.settings.layers?.map((record) => record.reference));
    const combos = values[SETTING.COMBOS_ENABLED] ? (decoded.combos?.rows || []).map((combo, index) => ({index,
        inputs: combo.inputs.map((input) => (input.kind === ACTION.QMK_KEYCODE ? input.operand : /** @type {number} */ (nativeCode(input)))),
        output: combo.output, useOutputBehavior: combo.useOutputBehavior !== false && decoded.settings.comboOutputBehaviors !== false, enabled: combo.enabled !== false, allowedLayers: combo.allowedLayers ?? ALL_LAYERS})).filter((combo) => combo.enabled) : [];
    // Participation (participation-policy.md), judged by the layer a key came
    // from and its matrix position.
    const {behaviorUsed, comboPress, generatedLayers} = participation(decoded.settings);
    const pointer = values[SETTING.AUTO_MOUSE_ENABLED] ? values[SETTING.AUTO_MOUSE_LAYER] : undefined;
    // The auto-sniping layers, none with its master switch off. Any of them
    // that is on keeps a separate pointer layer off (pointer_layer_policy_apply).
    const sniping = values[SETTING.AUTO_SNIPING_ENABLED] ? (values[SETTING.AUTO_SNIPING_LAYERS] & ALL_LAYERS) >>> 0 : 0;
    const {modeLinks, layerStarted, endedStarts} = linkFacts(decoded);
    const allCombos = (decoded.combos?.rows || []).map((combo, index) => ({index, output: combo.output}));
    return {names, layers, answers: compileLayerAnswers(layers), rows, combos, allCombos, pointer, sniping, modeLinks, layerStarted, endedStarts, values, behaviorUsed, comboPress, generatedLayers,
        // Base is always on, and so are the default layers the keyboard keeps.
        always: alwaysOnLayers(values),
        // Which layer's keys combos match while `layer` is on top (combo-reach.js).
        /** @param {number} layer */
        comboLayer: (layer) => references[layer] ?? layer};
}

// The code a key answers with while `active` layers are on, and the layer it
// comes from; null when every layer is transparent there.
/** @param {Facts} facts @param {number} active @param {number} position */
function resolve(facts, active, position) {
    const layer = answeringLayer(facts.answers[highest(active)]?.[position], active);
    return layer === null ? null : {layer, code: facts.layers[layer][position]};
}

// QMK uses the raw reference layer only when it differs from the highest
// active layer. Otherwise combo inputs are the resolved keycodes, including
// those inherited through transparent keys. Either way a press joins combos
// only as its source layer and position allow, and the reference never
// replaces that source (participation-policy.md). Maps each code a press can
// offer to the source layers it can come from.
/** @param {Facts} facts @param {number} active */
function comboCodes(facts, active) {
    const top = highest(active), reference = facts.comboLayer(top);
    /** @type {Map<number | undefined, number[]>} */
    const codes = new Map();
    if (reference >= LAYERS) return codes;
    facts.layers[0].forEach((_, position) => {
        const at = resolve(facts, active, position);
        if (!at || !facts.comboPress(at.layer, position)) return;
        const code = reference !== top ? facts.layers[reference][position] : at.code;
        codes.set(code, [...(codes.get(code) || []), at.layer]);
    });
    return codes;
}

/** @param {number} mask */
const highest = (mask) => 31 - Math.clz32(mask);
// The layers that keep the pointer layer off while any is on: every sniping
// layer but the pointer layer itself, and every linked layer that starts its
// mode (which never is the pointer layer) unless another layer can end the
// mode, which keeps it off only while none of those is on
// (facts.endedStarts). Which source wins while a mode's key runs another mode
// is not walked.
/** @param {Facts} facts */
const pointerStrip = (facts) => {
    const strip = facts.sniping | facts.layerStarted;
    return facts.pointer === undefined ? strip : (strip & ~bit(facts.pointer)) >>> 0;
};

// Everything that changes the layers from one state, each with where it came
// from so a path can be told.
/** @param {Facts} facts @param {number} active @param {Map<number, OfferedEffect[]>} cache @returns {OfferedEffect[]} */
function offers(facts, active, cache) {
    const cached = cache.get(active); if (cached) return cached;
    /** @type {OfferedEffect[]} */
    const found = [];
    facts.layers[0].forEach((_, position) => {
        const at = resolve(facts, active, position);
        if (!at || at.code === NOTHING) return;
        const row = facts.rows.get(at.code);
        for (const effect of keyEffects(at.code, facts.behaviorUsed(row, at.layer, position) ? row : undefined, facts.values, facts.modeLinks)) {
            found.push({...effect, from: {layer: at.layer, layoutIndex: position, code: at.code},
                how: `${effect.how} on ${layerName(facts.names, at.layer)}${effect.note ? ` (${effect.note})` : ""}`});
        }
    });
    if (facts.combos.length) {
        const present = comboCodes(facts, active);
        for (const combo of facts.combos) {
            if (!combo.inputs.length || !combo.inputs.every((code) => (present.get(code) || []).some((layer) => combo.allowedLayers & bit(layer)))) continue;
            const outputCode = /** @type {number} */ (nativeCode(combo.output));
            // The last declared member owns the output regardless of press
            // order. Duplicate placements are choices of that member, never
            // permissions borrowed from another declared input.
            const row = facts.rows.get(outputCode), allowed = facts.generatedLayers(row, combo);
            const origins = (present.get(combo.inputs.at(-1)) || []).filter(layer => combo.allowedLayers & bit(layer));
            const effects = [
                ...(origins.some(layer => allowed & bit(layer)) ? keyEffects(outputCode, row, facts.values, facts.modeLinks) : []),
                ...(origins.some(layer => !(allowed & bit(layer))) ? actionEffects(combo.output, facts.modeLinks) : []),
            ];
            for (const effect of effects) {
                if (effect.kind === "unowned") continue;
                found.push({...effect, from: {combo: combo.index}, how: `Press combo ${combo.index} (${combo.inputs.map(codeName).join(" + ")}), which sends ${actionName(combo.output)}`});
            }
        }
    }
    // Moving the trackball wakes the pointer layer, unless a sniping layer or
    // a layer that starts its mode is on and keeps it off
    // (pointer_layer_policy_apply).
    const endedStrips = facts.endedStarts.some((start) => linkStartHolds(start, active));
    if (facts.pointer !== undefined && facts.pointer < LAYERS && !(active & pointerStrip(facts)) && !endedStrips) {
        found.push({kind: "hold", layer: facts.pointer, from: {trackball: true}, how: `Move the trackball, which turns on ${layerName(facts.names, facts.pointer)}`});
    }
    cache.set(active, found);
    return found;
}

// Compile the same source-resolution and participation rules into conditions
// on active layers. A transparent overlay contributes no condition at all;
// independently available layer controls therefore share one decision rather
// than expanding every hold/lock combination.
/** @param {Facts} facts @returns {SymbolicWalk | Extract<import("./types.js").LayerAnalysisResult<Transition>, {reachedLayers?: undefined}>} */
function compactWalk(facts) {
    /** @type {Transition[]} */
    const transitions = [];
    /** @type {Condition[]} */
    const queries = [];
    /** @typedef {{position: number, layer: number, code: number, when: Condition}} Source */
    /** @type {Source[]} */
    const sources = [];
    facts.layers[0].forEach((_, position) => {
        let covered = 0;
        for (let layer = LAYERS - 1; layer >= 0; layer--) {
            const code = facts.layers[layer][position];
            if (code === TRANSPARENT) continue;
            const when = {on: bit(layer), off: covered}; covered |= bit(layer);
            const source = {position, layer, code, when}; sources.push(source);
            const row = facts.rows.get(code);
            for (const effect of keyEffects(code, facts.behaviorUsed(row, layer, position) ? row : undefined, facts.values, facts.modeLinks)) {
                transitions.push({...effect, when, from: {layer, layoutIndex: position, code},
                    how: `${effect.how} on ${layerName(facts.names, layer)}${effect.note ? ` (${effect.note})` : ""}`});
            }
        }
    });
    const tops = Array.from({length: LAYERS}, (_, layer) => ({layer, when: {on: bit(layer), off: layersAbove(layer)}}));
    const selfReferences = tops.every(({layer}) => facts.comboLayer(layer) === layer);
    /** @type {Map<number | undefined, Map<number, Condition[]>>} */
    const present = new Map();
    const needed = new Set(facts.combos.flatMap(combo => combo.inputs));
    /** @param {number} code @param {Source} source @param {Condition} when */
    const include = (code, source, when) => {
        if (!needed.has(code) || !facts.comboPress(source.layer, source.position)) return;
        const byLayer = present.get(code) || new Map(), cases = byLayer.get(source.layer) || [];
        cases.push(when); byLayer.set(source.layer, cases); present.set(code, byLayer);
    };
    for (const source of sources) {
        if (selfReferences) include(source.code, source, source.when);
        else for (const top of tops) {
            if (source.layer > top.layer) continue;
            const reference = facts.comboLayer(top.layer);
            if (reference >= LAYERS) continue;
            const code = reference === top.layer ? source.code : facts.layers[reference][source.position];
            include(code, source, {all: [source.when, top.when]});
        }
    }
    /** @param {number | undefined} code @param {number} allowed @returns {Condition} */
    const presence = (code, allowed) => ({any: [...(present.get(code) || [])]
        .filter(([layer]) => allowed & bit(layer)).flatMap(([, cases]) => cases)});
    const comboQueries = [];
    for (const combo of facts.combos) {
        const when = combo.inputs.length ? {all: combo.inputs.map(code => presence(code, combo.allowedLayers))} : false;
        comboQueries.push({index: combo.index, query: queries.length}); queries.push(when);
        const outputCode = /** @type {number} */ (nativeCode(combo.output)), row = facts.rows.get(outputCode);
        const allowed = facts.generatedLayers(row, combo), owner = combo.inputs.at(-1);
        // Both variants can exist when the owner code has several placements.
        // Bind each to its own source-resolution/participation conditions;
        // absence of an eligible owner is not the condition for a bypassed one.
        const variants = allowed ? [
            {when: {all: [when, presence(owner, combo.allowedLayers & allowed)]}, effects: keyEffects(outputCode, row, facts.values, facts.modeLinks)},
            {when: {all: [when, presence(owner, combo.allowedLayers & ~allowed)]}, effects: actionEffects(combo.output, facts.modeLinks)},
        ] : [{when, effects: actionEffects(combo.output, facts.modeLinks)}];
        for (const variant of variants) for (const effect of variant.effects) transitions.push({...effect, when: variant.when,
            from: {combo: combo.index}, how: `Press combo ${combo.index} (${combo.inputs.map(codeName).join(" + ")}), which sends ${actionName(combo.output)}`});
    }
    if (facts.pointer !== undefined && facts.pointer < LAYERS) transitions.push({kind: "hold", layer: facts.pointer,
        when: {all: [{off: pointerStrip(facts)}, ...facts.endedStarts.map(({layer, ends}) => ({not: {on: bit(layer), off: ends}}))]},
        from: {trackball: true}, how: `Move the trackball, which turns on ${layerName(facts.names, facts.pointer)}`});
    const result = analyzeLayerStates({always: facts.always, transitions, queries, trapLimit: MAX_TRAPS});
    if (!result.complete && !result.reachabilityComplete) return result;
    return {...result, symbolic: /** @type {const} */ (true),
        reachableCombos: new Set(comboQueries.filter(({query}) => result.queries[query]).map(({index}) => index)),
        cache: new Map([...result.witnesses].map(active => [active, offers(facts, active, new Map())]))};
}

// A state is its locks and the layers held on top, a layer set each.
/** @param {number} locks @param {number} held */
const stateOf = (locks, held) => (locks | (held << LAYERS)) >>> 0;
/** @param {number} state */
const locksOf = (state) => state & ALL_LAYERS;
/** @param {number} state */
const heldOf = (state) => state >>> LAYERS;

/** @param {number} state @param {WalkEffect} effect */
function step(state, effect) {
    const locks = locksOf(state), held = heldOf(state);
    const layers = layersOf(effect);
    switch (effect.kind) {
        case "hold": return (held & layers) === layers ? state : stateOf(locks, held | layers);
        // A lock of several turns them all on, or all off once all are on,
        // sharing each layer's lock with TG(), as a shortcut's Lock does
        // (layer-state-graph.js; a pointing mode's lock key is walked alike).
        case "lock": {
            const set = layers & ~1;
            if (!set) return state;
            if (!(set & (set - 1))) return stateOf(locks ^ set, held);
            return stateOf((locks & set) === set ? locks & ~set : locks | set, held);
        }
        // Locks the layers alone, every other lock let go; TO(0) lets them all go.
        case "move": return stateOf(layers & ~1, held);
        default: return state;
    }
}

// Walks every state reachable from rest. `edges` keeps, for each state, where
// each effect leads; `parent` the first way each state was reached.
/** @param {Facts} facts @returns {import("./types.js").BoundedLayerWalk} */
function boundedWalk(facts) {
    // What one key holds is let go together, while any of it is still held
    // (another hold that shared a layer may have let that one go), once a
    // state reached can make that hold, as the symbolic walk does: walked
    // again, with each release found, until no new one is.
    /** @type {Set<number>} */
    const holds = new Set();
    for (;;) {
        const walked = walkWith(facts, holds);
        const made = [...walked.edges.values()].flat().map(({effect}) => effect).filter((effect) => effect.kind === "hold" && !holds.has(layersOf(effect)));
        if (!walked.complete || !made.length) return walked;
        for (const effect of made) holds.add(layersOf(effect));
    }
}

/** @param {Facts} facts @param {ReadonlySet<number>} holds @returns {import("./types.js").BoundedLayerWalk} */
function walkWith(facts, holds) {
    /** @type {Map<number, OfferedEffect[]>} */
    const cache = new Map();
    /** @type {import("./types.js").BoundedLayerWalk['edges']} */
    const edges = new Map();
    /** @type {import("./types.js").BoundedLayerWalk['parent']} */
    const parent = new Map([[0, null]]);
    const queue = [0];
    let edgeCount = 0, complete = true;
    states: for (let next = 0; next < queue.length; next++) {
        const state = queue[next];
        const active = facts.always | locksOf(state) | heldOf(state);
        /** @type {{to: number, effect: WalkEffect}[]} */
        const out = [];
        for (const effect of offers(facts, active, cache)) {
            if (effect.kind === "unowned") continue;
            out.push({to: step(state, effect), effect});
        }
        for (const layers of holds) {
            if (heldOf(state) & layers) out.push({to: stateOf(locksOf(state), heldOf(state) & ~layers), effect: {kind: "release", layer: lowest(layers), layers}});
        }
        edgeCount += out.length;
        if (edgeCount > MAX_WALK_EDGES) {complete = false; break;}
        edges.set(state, out);
        for (const {to, effect} of out) {
            if (to === state || parent.has(to)) continue;
            if (parent.size === MAX_WALK_STATES) {complete = false; break states;}
            parent.set(to, {from: state, effect});
            queue.push(to);
        }
    }
    if (!complete) return {cache, edges, parent, home: new Set(), complete};
    // The states that can still get back to rest, walking the edges backwards.
    /** @type {Map<number, number[]>} */
    const back = new Map();
    for (const [from, out] of edges) for (const {to} of out) /** @type {number[]} */ (back.get(to) || back.set(to, []).get(to)).push(from);
    const home = new Set([0]), pending = [0];
    while (pending.length) for (const from of back.get(/** @type {number} */ (pending.pop())) || []) if (!home.has(from)) {home.add(from); pending.push(from);}
    return {cache, edges, parent, home, complete};
}

module.exports = {TRANSPARENT, NOTHING, MAX_TRAPS, profileFacts, comboCodes, compactWalk, boundedWalk, stateOf, locksOf, heldOf, highest};
