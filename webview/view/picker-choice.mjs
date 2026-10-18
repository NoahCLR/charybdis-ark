// @ts-check
// What the keycode picker has chosen, and whether the draft will take it.
//
// A key on the layout can be a plain choice (a key, perhaps wrapped in
// modifiers held with it) or a tap with a hold (decisions R7): a modifier
// held is MT(mod, tap), a layer held is LT(n, tap), and a trackball mode held
// is a behaviour row on the tap's keycode (Single tap · Hold = PD_SLOT_n).
// The firmware's limits decide what is offered: a mod-tap or layer-tap taps a
// plain key, its modifiers are one side's, and a behaviour row belongs to a
// keycode, so every key sending it gets the hold unless a custom key stands in
// for this one. Pure: the picker draws and posts what these return.

import {canonicalKeycode, behaviourListeningTo} from "./keyface.mjs";
import {isPlainKey, keyProblem, keycodeValue, normalizeExpression, takesModifiers} from "./keycode-expression.mjs";
import {pickerExpression, saveBehaviour, customKeyForShortcut, setKey} from "./edits.mjs";
import {shortcutPick, shortcutKeyCode} from "./custom-key.mjs";

/** @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model */
/** @typedef {import("../../contracts/panel.js").Layer} Layer */
/** @typedef {{kind: 'mod', mod: string} | {kind: 'layer', layer: number} | {kind: 'mode', slot: number}} Hold */
/** @typedef {{keys: string[], mods: string[], hold?: Hold | null, mode?: 'single' | 'list', shortcut?: boolean}} Pick */

// The picker's modifier values (vocabulary pickerModifiers) as MT() names them.
/** @type {Readonly<Record<string, string>>} */
export const HOLD_MODS = Object.freeze({C: "MOD_LCTL", S: "MOD_LSFT", A: "MOD_LALT", G: "MOD_LGUI", RCTL: "MOD_RCTL", RSFT: "MOD_RSFT", RALT: "MOD_RALT", RGUI: "MOD_RGUI"});
// The modifier key a held modifier is, for a behaviour row's hold.
/** @type {Readonly<Record<string, string>>} */
const MOD_KEYS = Object.freeze({MOD_LCTL: "KC_LEFT_CTRL", MOD_LSFT: "KC_LEFT_SHIFT", MOD_LALT: "KC_LEFT_ALT", MOD_LGUI: "KC_LEFT_GUI",
    MOD_RCTL: "KC_RIGHT_CTRL", MOD_RSFT: "KC_RIGHT_SHIFT", MOD_RALT: "KC_RIGHT_ALT", MOD_RGUI: "KC_RIGHT_GUI"});
const MOD_OF_NAME = Object.freeze(Object.fromEntries(Object.entries(HOLD_MODS).map(([value, mod]) => [mod, value])));
// Long and short wrapper names the picker's modifier row stands for.
/** @type {Readonly<Record<string, string>>} */
const WRAPPER_VALUE = Object.freeze({C: "C", LCTL: "C", S: "S", LSFT: "S", A: "A", LALT: "A", LOPT: "A", G: "G", LGUI: "G", LCMD: "G", LWIN: "G",
    RCTL: "RCTL", RSFT: "RSFT", RALT: "RALT", ROPT: "RALT", ALGR: "RALT", RGUI: "RGUI", RCMD: "RGUI", RWIN: "RGUI"});

// Keys that stop the keyboard or erase it, and what pressing one does.
/** @type {Readonly<Record<string, string>>} */
export const DANGEROUS_KEYS = Object.freeze({
    QK_BOOTLOADER: "Puts the keyboard into flashing mode: it stops typing until it is flashed or unplugged.",
    QK_REBOOT: "Restarts the keyboard: it stops typing for a moment.",
    QK_CLEAR_EEPROM: "Erases the keyboard's saved settings and profile, back to the firmware's defaults.",
});
/** @param {Model} model @param {string} value */
export const dangerOf = (model, value) => DANGEROUS_KEYS[model?.qmkKeycodeAliases?.[value] || value] || "";

// Words a person searches with that the catalogue does not carry.
/** @type {Readonly<Record<string, string>>} */
const SEARCH_WORDS = Object.freeze({
    KC_NO: "nothing none blank empty blocks disabled",
    KC_TRANSPARENT: "transparent falls through trans",
    QK_BOOTLOADER: "reset flash bootloader dfu",
    QK_REBOOT: "reset restart reboot",
    QK_CLEAR_EEPROM: "reset clear erase eeprom factory",
});
/** @param {string} value */
export const searchWords = (value) => SEARCH_WORDS[value] || "";

// ── layer keys ─────────────────────────────────────────────────────────

/** @typedef {{value: string, verb: string, tip: string, arms?: boolean}} LayerChoice */

// The layer keys a layer offers, by the one set of verbs. Base is always on,
// so holding, locking or one-shotting it does nothing: its row keeps Tap-hold
// and Move to.
/** @param {number} index @returns {LayerChoice[]} */
export function layerChoices(index) {
    /** @type {LayerChoice[]} */
    const all = [
        {value: `MO(${index})`, verb: "Hold", tip: "On while the key is down."},
        {value: `LOCK_LAYER(${index})`, verb: "Lock", tip: "Turns the layer on until pressed again. QMK's TG() is the same lock."},
        {value: `LT(${index}, …)`, verb: "Tap-hold", tip: "A tap sends a key, a hold holds the layer. Choose the tap key next.", arms: true},
        {value: `TT(${index})`, verb: "Tap-toggle", tip: "Holds the layer like Hold; repeated taps lock it."},
        {value: `OSL(${index})`, verb: "One-shot", tip: "Holds the layer like Hold; a tap turns it on for the next key only."},
        {value: `TO(${index})`, verb: "Move to", tip: "Locks this layer alone and releases every other lock. TO(0) returns to the base layer."},
    ];
    return index === 0 ? all.filter((choice) => choice.verb === "Tap-hold" || choice.verb === "Move to") : all;
}

// ── search ─────────────────────────────────────────────────────────────

/** @typedef {{kind: 'layer', value: string, verb: string, layer: number, name: string, tip: string, arms?: boolean}} LayerResult */

/** @param {Layer} layer */
const nameOf = (layer) => layer.displayName || layer.name || `Layer ${layer.index}`;

// Layer keys a search finds: every word of it matches the layer's name, the
// verb or the QMK form ("number", "hold num", "MO(", "lt").
/** @param {Layer[]} layers @param {string} query @returns {LayerResult[]} */
export function layerResults(layers, query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || words.join("").length < 2) return [];
    return layers.flatMap((layer) => layerChoices(layer.index).map((choice) => ({kind: /** @type {const} */ ("layer"), ...choice, layer: layer.index, name: nameOf(layer)})))
        .filter((result) => {
            const haystack = `${result.name} ${result.verb} ${result.value} layer ${result.layer}`.toLowerCase();
            return words.every((word) => haystack.includes(word));
        });
}

// A catalogue entry a search finds: by its words, its QMK names, or a name
// QMK used to give it (KC_BTN1 finds Mouse button 1).
/** @param {Model} model @param {import("../../contracts/panel.js").CatalogEntry} entry @param {string} query */
export function entryMatches(model, entry, query) {
    const lower = query.toLowerCase().trim();
    if (!lower) return false;
    if (entry.search?.includes(lower) || entry.value.toLowerCase().includes(lower) || searchWords(entry.value).includes(lower)) return true;
    const alias = model?.qmkKeycodeAliases?.[query.trim().toUpperCase()];
    return Boolean(alias && alias === entry.value);
}

// A search that is itself an expression the draft takes, typed as QMK spells
// it: "LT(3,KC_F)", "lctl_t(kc_a)", "KC_BTN1". Null when it names nothing, or
// is only a word the catalogue already finds.
/** @param {Model} model @param {string} query @returns {{expression: string, problem: string} | null} */
export function typedExpression(model, query) {
    const text = normalizeExpression(query);
    if (!/^[A-Za-z0-9_]+(?:\(.*\))?$/.test(text) || text.length < 2) return null;
    const expression = /^0x/i.test(text) ? text : text.toUpperCase();
    if (keycodeValue(model, expression) === undefined) {
        // Something shaped like a call that does not encode is still worth
        // saying no to, so a typo does not look like a missing feature.
        return /\(/.test(expression) ? {expression, problem: keyProblem(model, expression)} : null;
    }
    // A bare word typed in lower case is a search, unless it is a QMK name.
    if (!/[_(]/.test(expression) && !/^[A-Z0-9_]+$/.test(text) && !model?.qmkKeycodeAliases?.[expression]) return null;
    return {expression, problem: keyProblem(model, expression)};
}

// ── seeds ──────────────────────────────────────────────────────────────

// A stored key as the picker's slots: LT(3, KC_F) is the tap F with layer 3
// held, MT(MOD_LCTL, KC_A) and LCTL_T(KC_A) the tap A with Ctrl held, and
// S(C(KC_A)) is A with Ctrl and Shift held with it.
/** @param {Model} model @param {string} seed @returns {{keys: string[], mods: string[], hold: Hold | null}} */
export function seedPick(model, seed) {
    const text = normalizeExpression(seed);
    if (!text) return {keys: [], mods: [], hold: null};
    let match = text.match(/^LT\((\d+), ?([A-Za-z0-9_]+)\)$/);
    if (match) return {keys: [match[2]], mods: [], hold: {kind: "layer", layer: Number(match[1])}};
    match = text.match(/^MT\((MOD_[LR](?:CTL|SFT|ALT|GUI)), ?([A-Za-z0-9_]+)\)$/);
    if (match) return {keys: [match[2]], mods: [], hold: {kind: "mod", mod: match[1]}};
    match = text.match(/^([A-Z_]+_T)\(([A-Za-z0-9_]+)\)$/);
    const shorthand = match ? model?.qmkSpellings?.modTaps?.[match[1]] : undefined;
    if (match && shorthand && MOD_OF_NAME[shorthand]) return {keys: [match[2]], mods: [], hold: {kind: "mod", mod: shorthand}};
    /** @type {string[]} */
    const mods = [];
    let inner = text;
    for (let call; (call = inner.match(/^([A-Z]+)\((.*)\)$/)) && WRAPPER_VALUE[call[1]];) {
        mods.unshift(WRAPPER_VALUE[call[1]]);
        inner = call[2];
    }
    if (mods.length && keycodeValue(model, inner) !== undefined && /^[A-Za-z0-9_]+$/.test(inner)) return {keys: [inner], mods, hold: null};
    return {keys: [text], mods: [], hold: null};
}

// ── the choice ─────────────────────────────────────────────────────────

/** @typedef {{expression: string, problem: string, behaviour: boolean, customKey: boolean}} Choice */

// What Use key would store, and why it cannot, if it cannot. `key` says the
// choice goes on a layout key, where layer keycodes are checked as the
// keyboard checks them; elsewhere only whether a keycode encodes at all.
// `customKey` says a custom key can do what no keycode can (a hold over a
// tap that is not a plain key); `behaviour` that the hold goes in a row.
/** @param {Model} model @param {Pick} pick @param {{key?: boolean, folded?: string}} [options] @returns {Choice} */
export function pickerChoice(model, pick, {key = false, folded} = {}) {
    const tap = pick.keys[0] || "";
    const hold = pick.hold || null;
    const plain = folded ?? pickerExpression({keys: pick.keys, mods: pick.mods, mode: pick.mode});
    /** @param {string} problem @param {Partial<Choice>} [rest] @returns {Choice} */
    const refuse = (problem, rest = {}) => ({expression: "", problem, behaviour: false, customKey: false, ...rest});
    if (pick.mode === "list" || pick.shortcut) return {expression: plain, problem: "", behaviour: false, customKey: false};
    if (!hold) {
        if (!plain) return refuse("");
        const problem = key ? keyProblem(model, plain) : keycodeValue(model, plain) === undefined ? `${plain} is not a key this keyboard can store.` : "";
        return {expression: problem ? "" : plain, problem, behaviour: false, customKey: false};
    }
    if (!tap) return refuse("Choose the key a tap sends.");
    if (hold.kind === "mode") {
        // A behaviour row is keyed by the tap's keycode: the tap has to be a
        // key that runs one, and not one making its own tap/hold decision.
        const value = keycodeValue(model, plain);
        const problem = value === undefined ? `${plain} is not a key this keyboard can store.`
            : value <= 1 ? "Nothing and Transparent send nothing to hold. Choose the key a tap sends."
            : (value > 0x1fff && !/^CUSTOM_KEY_\d+$/.test(plain)) ? "A trackball-mode hold goes on a keyboard key or a custom key."
            : keyProblem(model, plain);
        return problem ? refuse(problem) : {expression: plain, problem: "", behaviour: true, customKey: false};
    }
    const holdWord = hold.kind === "layer" ? "layer-tap" : "mod-tap";
    if (pick.mods.length || !isPlainKey(model, tap)) {
        return refuse(`A ${holdWord} can only tap a plain key, not ${pick.mods.length ? "one with modifiers" : "this one"}. A custom key can send it and take the hold instead.`, {customKey: true});
    }
    const expression = hold.kind === "layer" ? `LT(${hold.layer}, ${tap})` : `MT(${hold.mod}, ${tap})`;
    const problem = keyProblem(model, expression);
    return problem ? refuse(problem) : {expression, problem: "", behaviour: false, customKey: false};
}

// Why a modifier chip is off, or "" when it can be pressed: a tap with a
// hold takes no modifiers, and only keyboard keys can be wrapped in them.
/** @param {Model} model @param {Pick} pick */
export function modifierBlock(model, pick) {
    if (pick.mode === "list" || pick.shortcut) return "";
    if (pick.hold && pick.hold.kind !== "mode") return "A key with a hold taps a plain key, so it cannot hold modifiers too. Clear the hold to add them.";
    const tap = pick.keys[0];
    if (tap && !takesModifiers(model, tap) && keycodeValue(model, tap) !== undefined) return "Modifiers are held with keyboard keys. This key cannot hold them.";
    return "";
}

// ── a hold that is a behaviour row ─────────────────────────────────────

// Where a keycode sits on the layout, by layer: every one of those keys gets a
// behaviour row given to the keycode.
/** @param {Model} model @param {string} keycode @returns {{places: {layer: number, name: string, count: number}[], total: number}} */
export function keycodeScope(model, keycode) {
    const wanted = canonicalKeycode(model, keycode);
    const places = (model?.layers || []).map((layer) => ({
        layer: layer.index, name: nameOf(layer),
        count: (layer.positions || []).filter((position) => canonicalKeycode(model, position.semantic || position.keycode) === wanted).length,
    })).filter((place) => place.count);
    return {places, total: places.reduce((sum, place) => sum + place.count, 0)};
}

// The hold a behaviour row gives: press and hold the mode, a layer or a
// modifier key until the key is let go.
/** @param {Model} model @param {Hold} hold */
export function holdAction(model, hold) {
    if (hold.kind === "mode") return (model?.pdModes || []).find((slot) => slot.id === hold.slot)?.binding?.hold || `PD_SLOT_${hold.slot}`;
    if (hold.kind === "layer") return `MO(${hold.layer})`;
    return MOD_KEYS[hold.mod] || "";
}

/** @param {Model} model @param {string} keycode @param {Hold} hold */
function holdRow(model, keycode, hold) {
    const existing = behaviourListeningTo(model, keycode);
    const row = existing || {keycode, stored: false, steps: []};
    const branch = {helper: /** @type {const} */ ("PRESS_AND_HOLD_UNTIL_RELEASE"), action: holdAction(model, hold), repeatHz: "0"};
    // saveBehaviour returns null only for a row with nothing in it; a hold
    // is something.
    return /** @type {import("../../contracts/edits.js").EditOf<'saveBehavior'>} */ (
        saveBehaviour(/** @type {import("../../contracts/edits.js").Behavior} */ (row), {change: {tapCount: 0, kind: "hold", branch}}, model?.profileIdentity));
}

// The custom key a tap becomes so only this key gets a hold: its shortcut
// sends the tap. Null when no shortcut can send it.
/** @param {Model} model @param {Pick} pick */
export function tapShortcut(model, pick) {
    const shortcut = shortcutPick(model, {keys: pick.keys.slice(0, 1), mods: pick.mods});
    if (!shortcut.key && !shortcut.mods) return null;
    if (pick.keys[0] && !shortcut.key && shortcutKeyCode(model, pick.keys[0]) === null && !shortcut.mods) return null;
    return shortcut;
}

// The one draft edit a hold given from the picker posts, so one undo takes it
// back:
//   a keycode hold (MT, LT)   the key, as any pick is;
//   every <key> key           the behaviour row on the tap's keycode, with the
//                             tap put on this key in the same step;
//   only this key             a spare custom key sending the tap, its row,
//                             and the custom key on this key, in one step.
/** @param {Model} model @param {{layer: import("../../contracts/edits.js").LayerReference, layoutIndex: number, current?: string}} target @param {Pick} pick @param {Choice} choice @param {{onlyThisKey?: boolean, spare?: {keycode: string} | null, name?: string}} [options] */
export function holdEdit(model, target, pick, choice, {onlyThisKey = false, spare = null, name = ""} = {}) {
    const hold = pick.hold;
    if (!hold) return choice.expression ? setKey(target.layer, target.layoutIndex, choice.expression) : null;
    if (onlyThisKey || choice.customKey) {
        const shortcut = tapShortcut(model, pick);
        if (!spare || !shortcut) return null;
        return customKeyForShortcut(spare.keycode, shortcut, name, [holdRow(model, spare.keycode, hold), setKey(target.layer, target.layoutIndex, spare.keycode)], model?.customKeyEditing?.identity);
    }
    if (!choice.behaviour) return choice.expression ? setKey(target.layer, target.layoutIndex, choice.expression) : null;
    const row = holdRow(model, choice.expression, hold);
    const same = target.current !== undefined && canonicalKeycode(model, target.current) === canonicalKeycode(model, choice.expression);
    return same ? row : {...row, then: setKey(target.layer, target.layoutIndex, choice.expression)};
}

// Layer keys used lately, newest first, for the Basics strip.
/** @param {string[]} recent @param {string} value @param {number} [limit] */
export function rememberLayerKey(recent, value, limit = 4) {
    if (!/^(?:MO|LOCK_LAYER|TG|TT|OSL|TO|LT)\(/.test(value)) return recent;
    return [value, ...recent.filter((entry) => entry !== value)].slice(0, limit);
}
