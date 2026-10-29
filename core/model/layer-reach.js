// @ts-check
"use strict";

// Which layers a profile lets you reach, and whether you can always get back.
//
// The keyboard runs its layers through layer ownership (users/noah/lib/state/
// ownership): a layer is on while a key holds it or while it is locked, and
// base is always on. TG() and LOCK_LAYER() toggle a lock, TO(n) locks n alone
// and TO(0) releases every lock, TT()'s TAPPING_TOGGLE-th tap locks, and MO(),
// TT(), LT()'s hold, LM() and OSL() hold their layer. There is no timeout and no
// "clear all" key, so a lock with nothing to release it stays until the
// keyboard is unplugged.
//
// This checks states the profile can reach from a keyboard at rest: a set
// of locked layers, and on top of it any layers held while keys are down. In
// each state every key resolves as the firmware does (the highest layer on that
// is not transparent answers), and each key's own layer action, its behaviour
// branches, the combos that match, a pointing mode's key turning on the layers
// its link names, a custom key's shortcut holding its layers, and the
// trackball waking the pointer layer move it to another state. A key that
// turns several layers on turns them on together and lets them go together.
// From that it names:
//
// - traps: a set of locks you can get into and cannot get back to Base from;
// - layers nothing reaches, layer keys that reach a layer with no keys of its
//   own, layer keys that hold or toggle Base (which is always on, so they do
//   nothing), transparent and KC_NO keys on Base, a pointer layer that cannot work, and
//   layer keys the keyboard does not run through its layer tracking.
//
// Holding keys is not limited by fingers or by which key is already down, and
// a one-shot counts as a hold, so the walk finds every way out a person could
// find and at most a few they could not. It never invents a trap.
// Shared Boolean decisions keep independent layers compact. Permanent resets
// and universally available toggles can prove escape without a backwards walk.
// An unresolved interaction is named before Apply; partial checks make no
// absence claims about the part they could not establish.
//
// What each key does to the layers is layer-effects.js, the walk itself
// layer-walk.js; this module names what the walk finds, and where.

const {LAYERS, layersOfMask} = require("../data/charybdis-layout");
const {actionName} = require("../schema/actions");
const {VOCABULARY, layerName, listed, settingsPath} = require("./vocabulary");
const {maskOf: layersOf} = require("./layer-state-graph");
const {actionEffects, bit, codeName, layerEffects} = require("./layer-effects");
const {MAX_TRAPS, NOTHING, TRANSPARENT, boundedWalk, comboCodes, compactWalk, heldOf, highest, locksOf, profileFacts, stateOf} = require("./layer-walk");

/**
 * @typedef {import("./types.js").LayerEffect} LayerEffect
 * @typedef {import("./types.js").OfferedLayerEffect} OfferedEffect
 * @typedef {import("./types.js").WalkLayerEffect} WalkEffect
 * @typedef {import("../schema/types.js").SemanticAction} Action
 * @typedef {import("../../contracts/model.js").Finding} Finding
 * @typedef {import("./layer-walk.js").Facts} Facts
 * @typedef {import("./layer-walk.js").SymbolicWalk} SymbolicWalk
 * @typedef {import("./layer-walk.js").Walk} Walk
 */
const LEVELS = Object.freeze(/** @type {const} */ ({TRAP: "trap", WARNING: "warning", NOTICE: "notice"}));

// How to get from rest to a state, in steps a person takes; releases are not
// steps.
/** @param {import("./types.js").BoundedLayerWalk["parent"]} parent @param {number} state */
function pathTo(parent, state) {
    /** @type {WalkEffect[]} */
    const steps = [];
    for (let at = parent.get(state); at; at = parent.get(at.from)) if (at.effect.kind !== "release") steps.unshift(at.effect);
    return steps;
}

/** @param {Facts} facts @param {number} mask */
const namesOf = (facts, mask) => layersOfMask(mask).map((layer) => layerName(facts.names, layer));
// Where a finding is edited, in the review's place shapes (profile-review.js):
// a key on a layer slot of this profile, a combo, or a settings section.
/** @param {number} layer @param {number} [layoutIndex] @returns {import("../../contracts/model.js").FindingPlace} */
const keyPlace = (layer, layoutIndex) => ({kind: "key", layer, layoutIndex});
/** @param {import("./types.js").LayerEffectSource | undefined} from @returns {import("../../contracts/model.js").FindingPlace | undefined} */
const placeOf = (from) => (from && typeof from.layer === "number" && Number.isInteger(from.layoutIndex) ? keyPlace(from.layer, from.layoutIndex)
    : from && typeof from.combo === "number" && Number.isInteger(from.combo) ? {kind: "combo", index: from.combo} : undefined);

/** @param {Facts} facts @param {import("./types.js").BoundedLayerWalk | Extract<SymbolicWalk, {complete: true}>} walked @returns {Finding[]} */
function traps(facts, walked) {
    const {edges} = walked;
    // Symbolic walks supply traps directly; the bounded helpers run only over explicit edges.
    const parent = /** @type {import("./types.js").BoundedLayerWalk['parent']} */ (walked.parent);
    const home = /** @type {Set<number>} */ (walked.home);
    // A set of locks is a trap once every key is let go and Base cannot be
    // reached from it; the way in is the lock that first leaves a state that
    // could still get home.
    /** @param {number} locks */
    const trapped = (locks) => parent.has(stateOf(locks, 0)) && !home.has(stateOf(locks, 0));
    /** @type {Map<number, {from: number, effect: WalkEffect}>} */
    const found = new Map();
    /** @param {number} state */
    const depth = (state) => pathTo(parent, state).length;
    for (const [from, out] of edges || []) {
        if (trapped(locksOf(from))) continue;
        for (const {to, effect} of out) {
            const locks = locksOf(to);
            if (effect.kind === "release" || !trapped(locks)) continue;
            const known = found.get(locks);
            if (!known || depth(from) < depth(known.from)) found.set(locks, {from, effect});
        }
    }
    /** @type {[number, {from: number, effect: WalkEffect}][]} */
    const sorted = [];
    for (const entry of [...found].sort(([a], [b]) => layersOfMask(a).length - layersOfMask(b).length || a - b)) {
        if (!sorted.some(([mask]) => (entry[0] & mask) === mask)) sorted.push(entry);
    }
    const entries = walked.symbolic ? walked.traps : sorted.slice(0, MAX_TRAPS).map(([locks, entry]) => ({locks,
        effect: entry.effect, path: [...pathTo(parent, entry.from), entry.effect]}));
    const named = entries.map(/** @returns {Finding} */ ({locks, effect, path}) => {
        const top = highest(locks);
        const names = namesOf(facts, locks);
        return {kind: "trap", level: LEVELS.TRAP, layers: layersOfMask(locks),
            title: `${listed(names)} can lock with no way back to ${layerName(facts.names, 0)}`,
            detail: `Once ${listed(names)} ${names.length === 1 ? "is" : "are"} locked, no key, behaviour or combo left on the board turns ${names.length === 1 ? "it" : "them"} off or moves back to ${layerName(facts.names, 0)}. Unplugging the keyboard clears it.`,
            path: path.map((effect) => effect.kind === "release" ? `Release the hold on ${listed(namesOf(facts, layersOf(effect)))}` : effect.how),
            fix: `Put TO(0) or TG(${top}) on ${layerName(facts.names, top)}, where it answers, or take away the lock.`,
            place: placeOf(effect.from)};
    });
    const omitted = (walked.symbolic ? walked.trapCount : sorted.length) - named.length;
    if (omitted) named.push({kind: "trapOverflow", level: LEVELS.TRAP, layers: [], count: omitted, identity: String(omitted),
        title: `${omitted} more trapping layer combination${omitted === 1 ? " is" : "s are"} possible`,
        detail: `The review shows the first ${MAX_TRAPS} smallest trapping combinations. ${omitted} more minimal combinations of locked layers also have no way back to ${layerName(facts.names, 0)}.`,
        fix: "Remove the trapping locks or add a reachable way home to each affected layer."});
    return named;
}

/** @param {Facts} facts @param {Walk} walked @returns {Finding[]} */
function findings(facts, walked) {
    const reachabilityComplete = walked.reachabilityComplete ?? walked.complete;
    const uncertain = walked.uncertainty ?? walked;
    const involved = layersOfMask(uncertain.affectedLayers ?? 0).filter(layer => layer !== 0);
    const names = involved.map(layer => layerName(facts.names, layer));
    const shortNames = names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} other layers` : listed(names);
    /** @type {Finding[]} */
    const results = walked.complete ? [...traps(facts, walked)] : [{kind: "reachabilityIncomplete", level: LEVELS.WARNING, layers: involved,
        scope: reachabilityComplete ? "escapes" : "reachability",
        title: names.length ? `Check ${reachabilityComplete ? "a way home when" : "how"} ${shortNames} combine` : "Check the layer controls together",
        detail: `${names.length ? `The controls involving ${listed(names)} have complex interactions. ` : ""}${reachabilityComplete
            ? "Ark checked which layers and combos can be reached, but could not establish whether every combination of locks has a way back to Base."
            : "Ark could not establish which layer and combo combinations can be reached or whether every combination of locks has a way back to Base."}`,
        fix: "Check these layers together, including keys that cover another layer's exit. Keep a TO(0) escape accessible through every overlay.",
        place: involved.length ? keyPlace(involved[0]) : undefined}];
    const reached = walked.reachedLayers ?? [...walked.parent.keys()].reduce((mask, state) => mask | locksOf(state) | heldOf(state), facts.always);
    // A layer of transparent keys and KC_NO has nothing of its own to use.
    /** @param {number} layer */
    const hasKeys = (layer) => facts.layers[layer].some((code) => code !== TRANSPARENT && code !== NOTHING);

    for (let layer = 1; layer < LAYERS; layer++) {
        if (!reachabilityComplete || reached & bit(layer) || !hasKeys(layer)) continue;
        results.push({kind: "unreachable", level: LEVELS.WARNING, layers: [layer],
            title: `Nothing reaches ${layerName(facts.names, layer)}`,
            detail: `${layerName(facts.names, layer)} has keys, but no key, behaviour, combo, pointing mode or the trackball turns it on, so none of them can be used.`,
            fix: `Put a layer key for ${layerName(facts.names, layer)} (MO(${layer}), TG(${layer}), TO(${layer})…) on a layer you can reach.`,
            place: keyPlace(layer)});
    }

    // Layer keys that reach a layer with no keys of its own, once per layer.
    /** @type {Map<number, OfferedEffect>} */
    const empty = new Map();
    for (const effect of walked.effects ?? [...walked.cache.values()].flat()) {
        if (effect.kind === "unowned" || effect.from.trackball) continue;
        for (const layer of layersOfMask(layersOf(effect))) if (layer !== 0 && !hasKeys(layer) && !empty.has(layer)) empty.set(layer, effect);
    }
    for (const [layer, effect] of empty) {
        results.push({kind: "emptyTarget", level: LEVELS.NOTICE, layers: [layer],
            title: `${effect.mode ? `${effect.mode}, a pointing mode,` : effect.shortcut ? "A custom key's shortcut" : "A layer key"} reaches ${layerName(facts.names, layer)}, which has no keys of its own`,
            detail: `${effect.how}: ${layerName(facts.names, layer)} holds only transparent keys and KC_NO, so it adds nothing to the board.`,
            fix: `Give ${layerName(facts.names, layer)} keys, or take the layer key away.`,
            place: placeOf(effect.from)});
    }

    if (reachabilityComplete && facts.combos.length) {
        const reachable = walked.reachableCombos ?? new Set();
        for (const active of walked.reachableCombos ? [] : walked.cache.keys()) {
            const present = comboCodes(facts, active);
            for (const combo of facts.combos) if (combo.inputs.every(code => (present.get(code) || []).some(layer => combo.allowedLayers & bit(layer)))) reachable.add(combo.index);
        }
        for (const combo of facts.combos) if (!reachable.has(combo.index)) {
            results.push({kind: "unreachableCombo", level: LEVELS.WARNING, layers: [], identity: `${combo.index}:${combo.inputs.join(",")}`,
                title: `Combo ${combo.index} cannot fire`,
                detail: "No reachable layer combination produces all of this combo's input keys together. Transparent keys can supply inputs from below; they are included in this check.",
                fix: "Place its inputs where one reachable layer combination can produce them, or change its input keys.",
                place: {kind: "combo", index: combo.index}});
        }
    }

    // Holding, toggling or locking a layer that is always on does nothing;
    // only TO() means something there. Every key, branch and combo output is
    // counted, reachable or not.
    /** @param {LayerEffect[]} effects */
    const idle = (effects) => effects.some((effect) => effect.kind !== "move" && effect.kind !== "unowned" && (layersOf(effect) & ~facts.always) === 0);
    /** @type {{name: string, place: import("../../contracts/model.js").FindingPlace}[]} */
    const idlePlaces = [];
    facts.layers.forEach((codes, layer) => codes.forEach((code, position) => {
        if (idle(layerEffects(code))) idlePlaces.push({name: codeName(code), place: keyPlace(layer, position)});
    }));
    for (const [code, row] of facts.rows) for (const step of row.steps) {
        for (const action of [step.tap, step.hold?.action, step.longHold?.action]) {
            if (idle(actionEffects(action))) idlePlaces.push({name: `${actionName(/** @type {Action} */ (action))} in the behaviour on ${codeName(code)}`, place: {kind: "behaviour", keycode: codeName(code)}});
        }
    }
    for (const combo of facts.allCombos) {
        if (idle(actionEffects(combo.output))) idlePlaces.push({name: `${actionName(combo.output)} on combo ${combo.index}`, place: {kind: "combo", index: combo.index}});
    }
    if (idlePlaces.length) {
        const count = idlePlaces.length;
        results.push({kind: "idleLayerKey", level: LEVELS.NOTICE, layers: [0], count,
            identity: idlePlaces.map(({name, place}) => `${name}:${JSON.stringify(place)}`).join("|"),
            title: `${count} layer key${count === 1 ? "" : "s"} hold${count === 1 ? "s" : ""} or toggle${count === 1 ? "s" : ""} ${layerName(facts.names, 0)}, which is always on`,
            detail: `${count > 3 ? `${idlePlaces.slice(0, 3).map((entry) => entry.name).join(", ")} and ${count - 3} more` : listed(idlePlaces.map((entry) => entry.name))}: ${layerName(facts.names, 0)} is always on, so holding, toggling or locking it does nothing. TO(0) is the one that means something there: it goes home.`,
            fix: "Point them at another layer, use TO(0) to go home, or give the keys something else to do.",
            place: idlePlaces[0].place});
    }

    /** @param {number} code */
    const emptyBase = (code) => facts.layers[0].map((value, position) => value === code ? position : -1).filter(position => position >= 0);
    const transparent = emptyBase(TRANSPARENT);
    if (transparent.length) {
        results.push({kind: "deadBase", level: LEVELS.NOTICE, layers: [0], count: transparent.length, identity: transparent.join(","),
            title: `${transparent.length} transparent key${transparent.length === 1 ? "" : "s"} on the base layer (${layerName(facts.names, 0)}) ${transparent.length === 1 ? "does" : "do"} nothing`,
            detail: `A transparent key on the base layer (${layerName(facts.names, 0)}) has no layer under it to answer, so it sends nothing unless a layer above covers it.`,
            fix: `Give ${transparent.length === 1 ? "it" : "them"} a keycode, or KC_NO to mark ${transparent.length === 1 ? "it" : "them"} intentionally empty.`,
            place: keyPlace(0, transparent[0])});
    }
    const no = emptyBase(NOTHING);
    if (no.length) {
        results.push({kind: "noBase", level: LEVELS.NOTICE, layers: [0], count: no.length, identity: no.join(","),
            title: `${no.length} KC_NO key${no.length === 1 ? "" : "s"} on the base layer (${layerName(facts.names, 0)}) ${no.length === 1 ? "does" : "do"} nothing`,
            detail: `KC_NO on the base layer (${layerName(facts.names, 0)}) explicitly sends nothing unless a layer above covers it.`,
            fix: `Give ${no.length === 1 ? "it" : "them"} a keycode if ${no.length === 1 ? "it should" : "they should"} do something.`,
            place: keyPlace(0, no[0])});
    }

    if (facts.pointer !== undefined) {
        if (facts.always & bit(facts.pointer)) {
            results.push({kind: "pointerLayer", level: LEVELS.WARNING, layers: [facts.pointer],
                title: `The trackball turns on ${layerName(facts.names, facts.pointer)}, which is always on`,
                detail: "Moving the trackball changes nothing on the board, so the pointer layer's keys are never there when you mouse.",
                fix: `Choose the pointer layer under ${settingsPath("pointer", "autoMouse")}.`, place: {kind: "settings", area: "Mouse", section: "autoMouse"}});
        } else if (!hasKeys(facts.pointer)) {
            results.push({kind: "pointerLayer", level: LEVELS.NOTICE, layers: [facts.pointer],
                title: `The trackball turns on ${layerName(facts.names, facts.pointer)}, which has no keys of its own`,
                detail: "Moving the trackball changes nothing on the board.",
                fix: `Give ${layerName(facts.names, facts.pointer)} its mouse keys, or choose another pointer layer.`, place: keyPlace(facts.pointer)});
        }
    }

    facts.layers.forEach((codes, layer) => codes.forEach((code, position) => {
        if (!layerEffects(code).some((effect) => effect.kind === "unowned")) return;
        results.push({kind: "unowned", level: LEVELS.WARNING, layers: [layer], identity: `${position}:${code}`,
            title: `${codeName(code)} on ${layerName(facts.names, layer)} bypasses layer tracking`,
            detail: `The keyboard leaves ${codeName(code)} to QMK's own layer code, so it can change the default layer or turn on a layer no key releases.`,
            fix: "Replace it with TO(), TG() or MO().", place: keyPlace(layer, position)});
    }));
    return results;
}

// The findings for a validated profile.
/** @param {import("./types.js").DecodedProfile} decoded @returns {Finding[]} */
function layerReach(decoded) {
    if (decoded?.layers?.length !== LAYERS) return [];
    const facts = profileFacts(decoded);
    const compact = compactWalk(facts);
    const walked = compact.complete || compact.reachabilityComplete ? compact : {...boundedWalk(facts), uncertainty: compact};
    return findings(facts, walked);
}

module.exports = {layerReach, LEVELS};
