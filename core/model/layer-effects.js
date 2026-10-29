// @ts-check
"use strict";

// What a keycode does to the layers, as the keyboard runs it (layer-reach.js):
// a layer key's own effect, a pointing-mode key's linked layers, a custom
// key's shortcut layers, and each branch of a behaviour row, each told by
// the taps and holds that reach it.

const {effectiveTimings, releaseHoldUnreachable} = require("./gesture-timing");
const keycodes = require("../schema/keycodes");
const {ALL_LAYERS, LAYERS, layersOfMask} = require("../data/charybdis-layout");
const {CUSTOM_KEY_SLOTS, customKeyName, customKeyOfCode, layerLockOfCode} = require("../data/user-keycodes");
const {QK, inBlock, LAYER_FORMS, TAPPING_TOGGLE, layerFormBase, layerFormLayer, layerModLayer, layerTapLayer} = require("../../rules/qmk-keycodes.mjs");
const {pdModeKeyOfCode, PD_MODE_KEYS} = require("../data/pd-mode-keys");
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {KEY_BEHAVIOR_HOLD_STYLES} = require("../schema/key-behavior-domain-v1");
const {SHORTCUT_LAYER_KINDS} = require("../schema/settings-domain-v1");
const {actionName} = require("../schema/actions");
const {slotName} = require("./vocabulary");
const {inertLinkLayers, linkStarts} = require("./pointing-links");
const {PD_LINK_LAYERS} = require("../schema/pd-mode-domain-v1");
const {lowest} = require("./layer-state-graph");

/**
 * @typedef {import("./types.js").LayerEffect} LayerEffect
 * @typedef {import("../schema/types.js").BehaviorRow} BehaviorRow
 * @typedef {import("../schema/types.js").SemanticAction} Action
 */

/** @param {number} layer */
const bit = (layer) => 1 << layer;
/** @param {number} code */
// All semantic actions in a validated current-ABI profile have native keycodes.
const codeName = (code) => {
    const key = pdModeKeyOfCode(code);
    if (key) return key.locked ? PD_MODE_KEYS[key.slot].lock : PD_MODE_KEYS[key.slot].hold;
    const custom = customKeyOfCode(code);
    if (custom !== undefined) return customKeyName(custom);
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
const shortcutsBySlot = (owners) => Array.from({length: CUSTOM_KEY_SLOTS}, (_, slot) => owners?.shortcuts.get(slot));

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
    if (inBlock(code, QK.LAYER_TAP)) return within(layerTapLayer(code), [{kind: "hold", layer: layerTapLayer(code)}]);
    if (inBlock(code, QK.LAYER_MOD)) return within(layerModLayer(code), [{kind: "hold", layer: layerModLayer(code)}]);
    if (layerLockOfCode(code) !== undefined) return [{kind: "lock", layer: /** @type {number} */ (layerLockOfCode(code))}];
    if (code < QK.TO.first || code > QK.PERSISTENT_DEF_LAYER.last) return [];
    const layer = layerFormLayer(code);
    switch (layerFormBase(code)) {
        case LAYER_FORMS.TO: return within(layer, [{kind: "move", layer}]);
        case LAYER_FORMS.MO: return within(layer, [{kind: "hold", layer}]);
        case LAYER_FORMS.TG: return within(layer, [{kind: "lock", layer}]);
        case LAYER_FORMS.OSL: return within(layer, [{kind: "hold", layer, oneShot: true}]);
        case LAYER_FORMS.TT: return within(layer, [{kind: "hold", layer}, {kind: "lock", layer, taps: TAPPING_TOGGLE}]);
        case LAYER_FORMS.DF: case LAYER_FORMS.PDF: return [{kind: "unowned", layer}];
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
    const live = (mask) => layersOfMask(mask & ((1 << PD_LINK_LAYERS) - 1) & ~inertLinkLayers(decoded.settings, mask));
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
    (decoded.settings.customKeyShortcuts || []).forEach((shortcut, slot) => {if (shortcut.layers) shortcuts.set(slot, {layers: shortcut.layers & ALL_LAYERS, layerKind: shortcut.layerKind ?? SHORTCUT_LAYER_KINDS.HOLD});});
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

module.exports = {bit, codeName, layerEffects, actionEffects, keyEffects, linkFacts, keycodeLayersOn};
