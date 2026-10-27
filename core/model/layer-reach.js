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

const {effectiveTimings, releaseHoldUnreachable} = require("./gesture-timing");
const keycodes = require("../data/keycode-catalog");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, LAYERS, matrixPosition} = require("../data/charybdis-layout");
const {customKeyOfCode, layerLockOfCode} = require("../data/user-keycodes");
const {pdModeKeyOfCode, PD_MODE_KEYS} = require("../data/pd-mode-keys");
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {KEY_BEHAVIOR_HOLD_STYLES} = require("../schema/key-behavior-domain-v1");
const {SETTING, SHORTCUT_LAYER_KINDS, alwaysOnLayers} = require("../schema/settings-domain-v1");
const {actionName, nativeCode} = require("../schema/actions");
const {layerName, slotName} = require("./vocabulary");
const {inertLinkLayers, linkStarts} = require("./pointing-links");
const {PD_LINK_LAYERS} = require("../schema/pd-mode-domain-v1");
const {analyzeLayerStates, maskOf: layersOf, lowest} = require("./layer-state-graph");
const {compileLayerAnswers, answeringLayer} = require("./layer-resolution");

/**
 * @typedef {import("./types.js").LayerEffect} LayerEffect
 * @typedef {import("./types.js").OfferedLayerEffect} OfferedEffect
 * @typedef {import("./types.js").WalkLayerEffect} WalkEffect
 * @typedef {import("./types.js").LayerCondition} Condition
 * @typedef {import("../schema/types.js").BehaviorRow} BehaviorRow
 * @typedef {import("../schema/types.js").SemanticAction} Action
 * @typedef {import("../../contracts/model.js").Finding} Finding
 * @typedef {ReturnType<typeof profileFacts>} Facts
 * @typedef {OfferedEffect & {when: Condition}} Transition
 * @typedef {Extract<import("./types.js").LayerAnalysisResult<Transition>, {reachedLayers: number}> & {symbolic: true, cache: Map<number, OfferedEffect[]>, reachableCombos: Set<number>, parent?: undefined, edges?: undefined, home?: undefined, affectedLayers?: number, uncertainty?: undefined}} SymbolicWalk
 * @typedef {import("./types.js").BoundedLayerWalk | SymbolicWalk} Walk
 */
const TRANSPARENT = 0x0001;
const NOTHING = 0x0000;
// QMK's TAPPING_TOGGLE default (compat/qmk_tapping_contract.h).
const TAPPING_TOGGLE = 5;
const LEVELS = Object.freeze(/** @type {const} */ ({TRAP: "trap", WARNING: "warning", NOTICE: "notice"}));
// Enough to name a way in without listing every superset of one trap.
const MAX_TRAPS = 4;
// Each layer has independent held and locked bits: sixteen layers cannot be
// exhaustively enumerated in the panel. Bound both states and retained edges;
// a partial graph proves neither a trap nor a missing way into a layer.
const MAX_WALK_STATES = 4096, MAX_WALK_EDGES = 65536;
const GRAPH_FINDINGS = new Set(["trap", "trapOverflow", "unreachable", "unreachableCombo"]);

/** @param {number} layer */
const bit = (layer) => 1 << layer;
/** @param {number} mask */
const layersIn = (mask) => Array.from({length: LAYERS}, (_, layer) => layer).filter((layer) => mask & bit(layer));
/** @param {number} code */
// All semantic actions in a validated current-ABI profile have native keycodes.
const codeName = (code) => {
    const key = pdModeKeyOfCode(code);
    if (key) return key.locked ? PD_MODE_KEYS[key.slot].lock : PD_MODE_KEYS[key.slot].hold;
    const custom = customKeyOfCode(code);
    if (custom !== undefined) return `CUSTOM_KEY_${custom}`;
    return layerLockOfCode(code) !== undefined ? `LOCK_LAYER(${layerLockOfCode(code)})`
        : keycodes.resolve(code)?.name || `0x${code.toString(16).toUpperCase().padStart(4, "0")}`;
};

// The pointing slots whose key turns layers on (firmware D-F62): a mode its
// key runs, held or locked, turns on those layers for as long as it runs. So
// the mode's hold key holds them, and its lock key toggles them as a layer
// lock would, one more way onto them: all of them at once, as one effect, so
// the walk never reaches a state where only some are on. Which source wins
// while another mode runs is not walked. Each slot maps to its layers and its
// name; each custom key whose shortcut turns layers on (firmware D-F26) to
// its layers and how it turns them on.
/** @typedef {Map<number, {layers: number, name: string}>} ModeLinks */
/** @typedef {{modes: ModeLinks, shortcuts: Map<number, {layers: number, layerKind: number}>}} LayerOwners */
/** @param {number} slot @param {boolean} locked @param {LayerOwners | undefined} owners @returns {LayerEffect[]} */
function modeEffects(slot, locked, owners) {
    const link = owners?.modes.get(slot);
    return link ? [{kind: locked ? "lock" : "hold", layer: lowest(link.layers), layers: link.layers, mode: link.name}] : [];
}
// A custom key's shortcut layers (firmware D-F26), all at once, as its layer
// key turns one on: held while it is held (a tap holds nothing), locked,
// locked alone (a move), or held as a one-shot is. A tap-toggle shortcut holds
// them, and its own key's TAPPING_TOGGLE-th tap locks them, the key itself
// or a combo that runs its behaviour; sent by a behaviour step or a combo
// that sends only the shortcut (`own` false) it only holds, since those taps
// are its key's. On its own key, a tap-toggle or one-shot shortcut is a momentary
// layer key, as TT() and OSL() are: its layers are on from every press,
// whatever the key's row (`fromPress`).
/** @param {number} slot @param {LayerOwners | undefined} owners @param {boolean} own @returns {LayerEffect[]} */
function shortcutEffects(slot, owners, own) {
    const shortcut = owners?.shortcuts.get(slot);
    if (!shortcut) return [];
    const {layers, layerKind} = shortcut, at = {layer: lowest(layers), layers, shortcut: true};
    switch (layerKind) {
        case SHORTCUT_LAYER_KINDS.LOCK: return [{kind: "lock", ...at}];
        case SHORTCUT_LAYER_KINDS.MOVE: return [{kind: "move", ...at}];
        case SHORTCUT_LAYER_KINDS.ONESHOT: return [{kind: "hold", ...at, oneShot: true, ...(own ? {fromPress: true} : {})}];
        case SHORTCUT_LAYER_KINDS.TAP_TOGGLE: return own ? [{kind: "hold", ...at, fromPress: true}, {kind: "lock", ...at, taps: TAPPING_TOGGLE}] : [{kind: "hold", ...at}];
        default: return [{kind: "hold", ...at}];
    }
}

// The shortcuts by slot, for the timing a custom key follows.
/** @param {LayerOwners | undefined} owners */
const shortcutsBySlot = (owners) => Array.from({length: 128}, (_, slot) => owners?.shortcuts.get(slot));

// What a native keycode does to the layers, if anything: as the key pressed
// (`own`), or sent by a behaviour step or a combo. `unowned` is a layer
// keycode the keyboard leaves to QMK (DF, PDF, a layer past the bank).
/** @param {number} code @param {LayerOwners} [links] @param {boolean} [own] @returns {LayerEffect[]} */
function layerEffects(code, links, own = true) {
    /** @param {number} layer @param {LayerEffect[]} effects @returns {LayerEffect[]} */
    const within = (layer, effects) => (layer < LAYERS ? effects : [{kind: "unowned", layer}]);
    const key = pdModeKeyOfCode(code);
    if (key) return modeEffects(key.slot, key.locked, links);
    const custom = customKeyOfCode(code);
    if (custom !== undefined) return shortcutEffects(custom, links, own);
    if (code >= 0x4000 && code <= 0x4fff) return within((code >> 8) & 15, [{kind: "hold", layer: (code >> 8) & 15}]);
    if (code >= 0x5000 && code <= 0x51ff) return within((code >> 5) & 15, [{kind: "hold", layer: (code >> 5) & 15}]);
    if (layerLockOfCode(code) !== undefined) return [{kind: "lock", layer: /** @type {number} */ (layerLockOfCode(code))}];
    if (code < 0x5200 || code >= 0x5300) return [];
    const layer = code & 31;
    switch (code & ~31) {
        case 0x5200: return within(layer, [{kind: "move", layer}]);
        case 0x5220: return within(layer, [{kind: "hold", layer}]);
        case 0x5260: return within(layer, [{kind: "lock", layer}]);
        case 0x5280: return within(layer, [{kind: "hold", layer, oneShot: true}]);
        case 0x52c0: return within(layer, [{kind: "hold", layer}, {kind: "lock", layer, taps: TAPPING_TOGGLE}]);
        case 0x5240: case 0x52e0: return [{kind: "unowned", layer}];
        default: return [];
    }
}

// What a stored action does to the layers.
/** @param {Action | undefined} action @param {LayerOwners} [links] @returns {LayerEffect[]} */
function actionEffects(action, links) {
    if (!action) return [];
    if (action.kind === ACTION.LAYER_MOMENTARY) return action.operand < LAYERS ? [{kind: "hold", layer: action.operand}] : [];
    if (action.kind === ACTION.LAYER_LOCK) return action.operand < LAYERS ? [{kind: "lock", layer: action.operand}] : [];
    if (action.kind === ACTION.POINTING_MODE_MOMENTARY || action.kind === ACTION.POINTING_MODE_LOCK) return modeEffects(action.operand, action.kind === ACTION.POINTING_MODE_LOCK, links);
    if (action.kind === ACTION.CUSTOM_KEY) return shortcutEffects(action.operand, links, false);
    if (action.kind === ACTION.QMK_KEYCODE) return layerEffects(action.operand, links, false);
    return [];
}

// A branch as the taps and holds that reach it: tapIndex 0 is the first tap.
const TAP_WORDS = ["Tap", "Double-tap", "Triple-tap"];
/** @param {number} index @param {string} name */
const tapPhrase = (index, name) => (TAP_WORDS[index] ? `${TAP_WORDS[index]} ${name}` : `Tap ${name} ${index + 1} times`);
/** @param {number} index @param {string} name @param {boolean} longer */
const holdPhrase = (index, name, longer) => `${index === 0 ? `Hold ${name}` : `Tap ${name}${index > 1 ? ` ${index} times` : ""}, then hold it`}${longer ? " longer" : ""}`;

// Every layer effect one key offers once it resolves to `code`: its own
// action, less the parts its behaviour row replaces, and each branch of that
// row. A row with steps replaces TT()'s own taps; one without is no row
// (firmware D-F27). A hold branch that presses and holds until release holds
// the layer; any other hold, like a tap, sends the action once. A custom key's
// row sends its shortcut where it leaves a tier empty (firmware D-F26): tapped
// from an empty first tap, held from the fallback hold, which belongs to the
// first press alone and only while it authors neither a hold nor a long hold
// (built-in-behavior.js). A shortcut that locks or moves does so from either,
// and one that holds from the fallback hold.
/** @param {number} code @param {BehaviorRow | undefined} row @param {readonly number[]} [values] @param {LayerOwners} [links] @returns {(LayerEffect & {how: string, note?: string})[]} */
function keyEffects(code, row, values, links) {
    /** @type {(LayerEffect & {how: string, note?: string})[]} */
    const effects = [];
    const first = row?.steps.find((step) => step.tapIndex === 0);
    /** @param {LayerEffect} effect */
    const runs = (effect) => (effect.mode ? `which runs ${effect.mode}, whose key turns layers on` : effect.shortcut ? "whose shortcut turns layers on" : "");
    // The fallback hold: the first press's, while it authors no hold tier.
    const fallbackHold = !first?.hold && !first?.longHold;
    for (const effect of layerEffects(code, links)) {
        let how;
        if (effect.taps) {
            if (row?.steps.length) continue;
            how = `Tap ${codeName(code)} ${effect.taps} times`;
        } else if (effect.fromPress) {
            how = `Hold ${codeName(code)}`;
        } else if (effect.shortcut) {
            if (effect.kind !== "hold" && !first?.tap) how = `Tap ${codeName(code)}`;
            else if (fallbackHold) how = holdPhrase(0, codeName(code), false);
            else continue;
        } else {
            if (effect.kind === "hold" && !effect.oneShot ? first?.hold : first?.tap) continue;
            how = effect.kind === "hold" && !effect.oneShot ? `Hold ${codeName(code)}` : `Tap ${codeName(code)}`;
        }
        effects.push({...effect, how, ...(effect.mode || effect.shortcut ? {note: runs(effect)} : {})});
    }
    for (const step of row?.steps || []) {
        /** @param {Action | undefined} action */
        const sends = (action) => `its behaviour sends ${actionName(/** @type {Action} */ (action))}`;
        for (const effect of actionEffects(step.tap, links)) {
            if (effect.kind !== "hold" || effect.oneShot) effects.push({...effect, how: tapPhrase(step.tapIndex, codeName(code)), note: sends(step.tap)});
        }
        for (const [part, longer] of /** @type {const} */ ([["hold", false], ["longHold", true]])) {
            if (part === "hold" && values && row && releaseHoldUnreachable(step, effectiveTimings(row, values, shortcutsBySlot(links)))) continue;
            const hold = step[part];
            for (const effect of actionEffects(hold?.action, links)) {
                const press = hold?.style === KEY_BEHAVIOR_HOLD_STYLES.PRESS_AND_HOLD_UNTIL_RELEASE;
                // A hold that only sends its action once holds nothing, but a
                // one-shot it sends is armed.
                if (effect.kind === "hold" && !effect.oneShot && !press) continue;
                effects.push({...effect, how: holdPhrase(step.tapIndex, codeName(code), longer), note: sends(hold?.action)});
            }
        }
    }
    return effects;
}

// The parts of a validated profile (portable-profile.validateSnapshot) the
// walk reads, in its own terms.
// Pointing links the keyboard runs (firmware D-F62; the pointer layer or
// a default layer in a link does nothing): the slots whose key turns
// layers on, and the linked layers that start a mode, each of which keeps
// a separate pointer layer off while it starts it, as a sniping layer
// does. A link that a higher layer, or any other layer, ends starts its
// mode from a linked layer only while none of those is on (linkStarts,
// pointing-links.js). The custom keys whose shortcut turns layers on, and how.
// What the links and shortcuts read of a profile: its settings and its modes.
/** @typedef {{settings: Pick<import("../schema/types.js").SettingsDomain, "values" | "names" | "customKeyShortcuts">, pdModes?: import("../schema/types.js").PointingSlot[]}} LinkProfile */
/** @param {LinkProfile} decoded */
function linkFacts(decoded) {
    /** @type {ModeLinks} */
    const modes = new Map();
    let layerStarted = 0;
    /** @type {{layer: number, ends: number}[]} */
    const endedStarts = [];
    /** @param {number} mask */
    const live = (mask) => layersIn(mask & ((1 << PD_LINK_LAYERS) - 1) & ~inertLinkLayers(decoded.settings, mask));
    for (const slot of decoded.pdModes || []) {
        if (!slot.kind) continue;
        const turnsOn = live(slot.linkTurnsOn);
        if (turnsOn.length) modes.set(slot.id, {layers: turnsOn.reduce((layers, layer) => layers | bit(layer), 0) >>> 0, name: slotName(slot)});
        for (const {layer, ends} of linkStarts(decoded.settings, slot)) {
            if (ends) endedStarts.push({layer, ends});
            else layerStarted |= bit(layer);
        }
    }
    // The custom keys whose shortcut turns layers on (firmware D-F26), and
    // how; the layers always on never are among them.
    /** @type {LayerOwners["shortcuts"]} */
    const shortcuts = new Map();
    (decoded.settings.customKeyShortcuts || []).forEach((shortcut, slot) => {if (shortcut.layers) shortcuts.set(slot, {layers: shortcut.layers & 0xffff, layerKind: shortcut.layerKind ?? SHORTCUT_LAYER_KINDS.HOLD});});
    /** @type {LayerOwners} */
    const modeLinks = {modes, shortcuts};
    return {modeLinks, layerStarted: layerStarted >>> 0, endedStarts};
}

// The layers a stored keycode turns on as the key pressed, as a mask: a layer
// key's layer, a pointing-mode key's linked layers, a custom key's shortcut
// layers (layerEffects). DF, PDF and the other layer keycodes the keyboard
// leaves to QMK turn none on. The model publishes it per keycode
// (qmkKeyTurnsOn), so the interface never works it out of a keycode itself.
/** @param {LinkProfile} decoded @returns {(code: number) => number} */
function keycodeLayersOn(decoded) {
    const {modeLinks} = linkFacts(decoded);
    return (code) => layerEffects(code, modeLinks).reduce((mask, effect) =>
        effect.kind === "unowned" ? mask : mask | (effect.layers ?? bit(effect.layer)), 0) >>> 0;
}

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
    const records = decoded.settings.layers;
    const combos = values[SETTING.COMBOS_ENABLED] ? (decoded.combos?.rows || []).map((combo, index) => ({index,
        inputs: combo.inputs.map((input) => (input.kind === ACTION.QMK_KEYCODE ? input.operand : /** @type {number} */ (nativeCode(input)))),
        output: combo.output, useOutputBehavior: combo.useOutputBehavior !== false && decoded.settings.comboOutputBehaviors !== false, enabled: combo.enabled !== false, allowedLayers: combo.allowedLayers ?? 0xffff})).filter((combo) => combo.enabled) : [];
    // Participation (participation-policy.md), judged by the layer a key came
    // from and its matrix position.
    /** @param {number} layoutIndex */
    const matrixOf = matrixPosition;
    /** @param {BehaviorRow | undefined} row @param {number} layer @param {number} layoutIndex */
    const behaviorUsed = (row, layer, layoutIndex) => Boolean(row && values[SETTING.BEHAVIORS_ENABLED] !== 0 && Boolean(values[SETTING.LAYER_BEHAVIORS] & bit(layer))
        && row.enabled !== false && Boolean((row.allowedLayers ?? 0xffff) & bit(layer)) && !records?.[layer]?.bypass.includes(matrixOf(layoutIndex)));
    /** @param {number} layer @param {number} layoutIndex */
    const comboPress = (layer, layoutIndex) => Boolean(values[SETTING.LAYER_COMBOS] & bit(layer)) && !records?.[layer]?.exclude.includes(matrixOf(layoutIndex));
    // Generated outputs have no physical placement and do not consult the
    // source-layer behaviour switch. Their row uses the declared owner's origin.
    /** @param {BehaviorRow | undefined} row @param {{useOutputBehavior: boolean}} combo */
    const generatedLayers = (row, combo) => combo.useOutputBehavior && row && values[SETTING.BEHAVIORS_ENABLED] !== 0 && row.enabled !== false ? (row.allowedLayers ?? 0xffff) : 0;
    const pointer = values[SETTING.AUTO_MOUSE_ENABLED] ? values[SETTING.AUTO_MOUSE_LAYER] : undefined;
    // The auto-sniping layers, none with its master switch off. Any of them
    // that is on keeps a separate pointer layer off (pointer_layer_policy_apply).
    const sniping = values[SETTING.AUTO_SNIPING_ENABLED] ? (values[SETTING.AUTO_SNIPING_LAYERS] & 0xffff) >>> 0 : 0;
    const {modeLinks, layerStarted, endedStarts} = linkFacts(decoded);
    const allCombos = (decoded.combos?.rows || []).map((combo, index) => ({index, output: combo.output}));
    return {names, layers, answers: compileLayerAnswers(layers), rows, combos, allCombos, pointer, sniping, modeLinks, layerStarted, endedStarts, values, behaviorUsed, comboPress, generatedLayers,
        // Base is always on, and so are the default layers the keyboard keeps.
        always: alwaysOnLayers(values),
        /** @param {number} layer */
        comboLayer: (layer) => records?.[layer]?.reference ?? layer};
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
    const endedStrips = facts.endedStarts.some(({layer, ends}) => (active & bit(layer)) && !(active & ends));
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
    const tops = Array.from({length: LAYERS}, (_, layer) => ({layer, when: {on: bit(layer), off: (0xffff << (layer + 1)) & 0xffff}}));
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

// A state is its locks and the layers held on top, sixteen bits each.
/** @param {number} locks @param {number} held */
const stateOf = (locks, held) => (locks | (held << 16)) >>> 0;
/** @param {number} state */
const locksOf = (state) => state & 0xffff;
/** @param {number} state */
const heldOf = (state) => state >>> 16;

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
const namesOf = (facts, mask) => layersIn(mask).map((layer) => layerName(facts.names, layer));
/** @param {readonly string[]} words */
const listed = (words) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);
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
    for (const entry of [...found].sort(([a], [b]) => layersIn(a).length - layersIn(b).length || a - b)) {
        if (!sorted.some(([mask]) => (entry[0] & mask) === mask)) sorted.push(entry);
    }
    const entries = walked.symbolic ? walked.traps : sorted.slice(0, MAX_TRAPS).map(([locks, entry]) => ({locks,
        effect: entry.effect, path: [...pathTo(parent, entry.from), entry.effect]}));
    const named = entries.map(/** @returns {Finding} */ ({locks, effect, path}) => {
        const top = highest(locks);
        const names = namesOf(facts, locks);
        return {kind: "trap", level: LEVELS.TRAP, layers: layersIn(locks),
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
    const involved = layersIn(uncertain.affectedLayers ?? 0).filter(layer => layer !== 0);
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
        for (const layer of layersIn(layersOf(effect))) if (layer !== 0 && !hasKeys(layer) && !empty.has(layer)) empty.set(layer, effect);
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
                fix: "Choose the pointer layer under Mouse → Auto-mouse.", place: {kind: "settings", area: "Mouse"}});
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

// A finding's identity across two profiles: what kind it is and which layers it
// is about, named by the keyboard layer each slot holds (`order[slot]`, as
// model/layer-order.js keeps it).
const IDENTITY = Object.freeze(Array.from({length: LAYERS}, (_, layer) => layer));
/** @param {Finding} finding @param {readonly number[]} [order] */
const findingKey = (finding, order = IDENTITY) => `${finding.kind}:${finding.layers.map((slot) => order[slot]).sort((a, b) => a - b).join(",")}${finding.identity === undefined ? "" : `:${finding.identity}`}`;

// The findings for a validated profile.
/** @param {import("./types.js").DecodedProfile} decoded @returns {Finding[]} */
function layerReach(decoded) {
    if (decoded?.layers?.length !== LAYERS) return [];
    const facts = profileFacts(decoded);
    const compact = compactWalk(facts);
    const walked = compact.complete || compact.reachabilityComplete ? compact : {...boundedWalk(facts), uncertainty: compact};
    return findings(facts, walked);
}

// The findings for a draft beside its keyboard's: each finding in the draft is
// new or already on the keyboard, and each one the draft no longer has is fixed
// by it. The keyboard is walked as it is, not rearranged into the draft's
// order, since a reorder can make or mend a finding itself (a new base leaves
// the old one unreached); `order` says which keyboard layer each draft slot
// holds, so the two are matched layer with layer. Traps always ask to be
// confirmed.
/** @param {readonly Finding[]} before @param {readonly Finding[]} after @param {readonly number[]} [order] @returns {import("../../contracts/model.js").Check[]} */
function compareFindings(before, after, order = IDENTITY) {
    const known = new Set(before.map((finding) => findingKey(finding))), still = new Set(after.map((finding) => findingKey(finding, order)));
    const incomplete = after.find(finding => finding.kind === "reachabilityIncomplete");
    const uncertainKinds = incomplete?.scope === "escapes" ? new Set(["trap", "trapOverflow"]) : GRAPH_FINDINGS;
    return [
        ...after.map(/** @returns {import("../../contracts/model.js").Check} */ (finding) => ({...finding, key: findingKey(finding, order), status: known.has(findingKey(finding, order)) ? "existing" : "new"})),
        ...before.filter((finding) => !still.has(findingKey(finding)) && !(incomplete && uncertainKinds.has(finding.kind)))
            .map(/** @returns {import("../../contracts/model.js").Check} */ (finding) => ({...finding, key: findingKey(finding), status: "fixed", place: undefined})),
    ];
}

/** @param {import("./types.js").DecodedProfile | null} keyboard @param {import("./types.js").DecodedProfile} draft @param {readonly number[]} [order] */
function draftChecks(keyboard, draft, order = IDENTITY) {
    return compareFindings(keyboard ? layerReach(keyboard) : [], layerReach(draft), order);
}

module.exports = {layerReach, draftChecks, compareFindings, findingKey, keycodeLayersOn, LEVELS};
