// @ts-check
import {MODIFIER_KEYS} from "./qmk-keycodes.mjs";

// A custom key's shortcut (firmware D-F26) as Ark writes it, in words for
// every place that names one (core's key names, Review, the Custom keys
// screen, the picker's offers and the combo builder) and as a chord of QMK
// names for the picker's footer. Its modifiers come first, left before right
// by the mask's bits, then its keys in the order they go down, then the layers
// it turns on, lowest first. Parts join with "+", as a modified keycode's name
// does ("Ctrl+Option+Spacebar"); a modifier reads as the host calls it, the
// left one unmarked and the right one named so (D-L83).

/** @typedef {{mods?: number, keys?: readonly number[], layers?: number, layerKind?: number}} Shortcut */
/**
 * The words a shortcut is named with, which core and the interface each
 * supply from their own model: the modifiers by their bits in the host's
 * words, a key's name, a layer's name, how many layers there are, and each
 * layer kind's verb.
 * @typedef {{modifiers: readonly (readonly [number, string])[], keyLabel: (code: number) => string, layerName: (layer: number) => string, layerCount: number, layerKinds: readonly (readonly [number, string])[]}} ShortcutTerms
 */

export const SHORTCUT_JOIN = "+";

// The layer key a shortcut's layers act as, by its layer kind (the settings
// domain's byte 9, core's SHORTCUT_LAYER_KINDS): Hold, Lock, Move to,
// Tap-toggle, One-shot. tests/model/key-names.test.js pins the order to
// core's kinds and their verbs.
export const SHORTCUT_LAYER_FUNCTIONS = Object.freeze(["MO", "TG", "TO", "TT", "OSL"]);
// One bit per modifier key, KC_LEFT_CTRL … KC_RIGHT_GUI.
const MODIFIER_COUNT = MODIFIER_KEYS.last - MODIFIER_KEYS.first + 1;

/** @param {number} mask @param {number} count */
const layersIn = (mask, count) => Array.from({length: count}, (_, layer) => layer).filter((layer) => mask & 2 ** layer);

/**
 * What a shortcut sends, one part each: its modifiers by the host's words for
 * their bits, then each key by its name. Empty for layers alone.
 * @param {Shortcut} shortcut
 * @param {Pick<ShortcutTerms, "modifiers" | "keyLabel">} words
 */
export const shortcutSendWords = ({mods = 0, keys = []}, {modifiers, keyLabel}) =>
    [...modifiers.filter(([bit]) => mods & bit).map(([, label]) => label), ...keys.map(keyLabel)];

/**
 * The layers it turns on, by name, lowest first; any kind but Hold leads with
 * its layer key's verb ("Lock Navigation", "Extra").
 * @param {Shortcut} shortcut
 * @param {Pick<ShortcutTerms, "layerName" | "layerCount" | "layerKinds">} words
 */
export function shortcutLayerWords({layers = 0, layerKind = 0}, {layerName, layerCount, layerKinds}) {
    const named = layersIn(layers, layerCount).map(layerName);
    const verb = layerKind ? layerKinds.find(([kind]) => kind === layerKind)?.[1] : "";
    if (named.length && verb) named[0] = `${verb} ${named[0]}`;
    return named;
}

/**
 * The whole shortcut in words: "Command+Lock Navigation+Extra". Empty for none.
 * @param {Shortcut} shortcut
 * @param {ShortcutTerms} words
 */
export const shortcutWords = (shortcut, words) =>
    [...shortcutSendWords(shortcut, words), ...shortcutLayerWords(shortcut, words)].filter(Boolean).join(SHORTCUT_JOIN);

/**
 * The shortcut as QMK would spell its parts, held together: each modifier as
 * its key, each key by its name, each layer as the layer key its kind acts as
 * ("KC_LEFT_CTRL+KC_SPACE+TG(1)").
 * @param {Shortcut} shortcut
 * @param {{keyName: (code: number) => string, layerCount: number}} names
 */
export function shortcutChord({mods = 0, keys = [], layers = 0, layerKind = 0}, {keyName, layerCount}) {
    const modifierKeys = Array.from({length: MODIFIER_COUNT}, (_, bit) => bit).filter((bit) => mods & 2 ** bit).map((bit) => keyName(MODIFIER_KEYS.first + bit));
    const layerKeys = layersIn(layers, layerCount).map((layer) => `${SHORTCUT_LAYER_FUNCTIONS[layerKind] || SHORTCUT_LAYER_FUNCTIONS[0]}(${layer})`);
    return [...modifierKeys, ...keys.map(keyName), ...layerKeys].filter(Boolean).join(SHORTCUT_JOIN);
}
