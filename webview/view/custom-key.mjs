// @ts-check
// What a custom key does, in words, and its shortcut's key by value. A custom
// key's shortcut (firmware D-F26) is its own action: held while the key is
// held, tapped when it is tapped. A behaviour on the key works on top of it,
// and a behaviour step on another key that sends it sends the shortcut only.
import {vocabulary} from "./vocabulary.mjs";
import {customKeyPlacements} from "./reach.mjs";
import {NAME_MAX_BYTES, nameBytes} from "./names.mjs";
import {compactModifierMask} from "./keyvalues.mjs";

/** @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model */
/** @typedef {import("../../contracts/panel.js").CustomKey} CustomKey */

/** @param {CustomKey | null | undefined} key */
export const hasShortcut = (key) => Boolean(key?.shortcut && (key.shortcut.mods || key.shortcut.key));

// The custom key a keycode names, if it is one.
/** @param {Model} model @param {string | null | undefined} keycode */
export const customKeyOf = (model, keycode) => /^CUSTOM_KEY_\d+$/.test(String(keycode ?? ""))
    ? (model?.customKeys || []).find((key) => key.keycode === keycode) : undefined;

// "What it does": its shortcut, its behaviour on top, both, or nothing yet.
/** @param {CustomKey} key */
export function customKeyDoes(key) {
    const sends = hasShortcut(key) ? key.shortcutLabel : "";
    if (sends && key.hasBehavior) return `Its behaviour, on top of ${sends}: a tap or hold the behaviour leaves empty sends ${sends}.`;
    if (sends) return `Sends ${sends}: held while the key is held, tapped when it is tapped.`;
    if (key.hasBehavior) return "Only what its behaviour says. Give it a shortcut to send one where the behaviour leaves a tap or hold empty.";
    return "Does nothing yet: choose what it sends.";
}

// What the shortcut does on this key, in one line: held and tapped as the key
// is, or, under a behaviour, where the behaviour leaves a tap or hold empty
// (firmware D-F26).
/** @param {CustomKey} key */
export function customKeyShortcutLine(key) {
    if (!hasShortcut(key)) return key.hasBehavior ? "No shortcut: it does only what its behaviour says." : "Does nothing yet: choose what it sends.";
    return key.hasBehavior ? `Sends ${key.shortcutLabel} where its behaviour leaves a tap or hold empty.`
        : `Sends ${key.shortcutLabel}: held while the key is held, tapped when it is tapped.`;
}

// A custom key under its name in the hover card: what its shortcut does on
// the key, or, with none, only that, since its behaviour shows below.
/** @param {CustomKey | null | undefined} key */
export function customKeyHeadline(key) {
    if (!key) return "";
    if (hasShortcut(key)) return customKeyShortcutLine(key);
    return key.hasBehavior ? "No shortcut" : "No shortcut and no behaviour yet: it sends nothing.";
}

// Where only a custom key's shortcut runs (a behaviour step that sends the
// key, or a combo output whose behaviour does not run), what it sends.
/** @param {CustomKey | null | undefined} key */
export function customKeyShortcutOnly(key) {
    if (!key) return "";
    return hasShortcut(key) ? `sends its shortcut, ${key.shortcutLabel}` : "no shortcut, so it sends nothing";
}

// A short note for a place that names the key: what it sends.
/** @param {Model} model @param {string | null | undefined} keycode */
export function customKeySendsNote(model, keycode) {
    const key = customKeyOf(model, keycode);
    if (!key) return "";
    return hasShortcut(key) ? `Custom key · sends ${key.shortcutLabel}` : "Custom key · no shortcut: sends nothing of its own";
}

// What a placed custom key sends with its behaviour bypassed or off: its
// shortcut, or nothing. Empty for a key that is not a custom key.
/** @param {CustomKey | null | undefined} key */
export function customKeyBypassText(key) {
    if (!key) return "";
    return hasShortcut(key) ? `With its behaviour bypassed or off, this custom key sends its shortcut, ${key.shortcutLabel}.`
        : "This custom key has no shortcut, so it sends nothing when its behaviour is bypassed or off. Give it a shortcut, or map a plain keycode on a gaming layer that needs direct output.";
}

// The key a shortcut picker returned, as the value the profile stores: only a
// key the shortcut may hold (model.customKeyShortcutKeys), else null.
/** @param {Model} model @param {string} expression @returns {number | null} */
export function shortcutKeyCode(model, expression) {
    const name = String(expression ?? "").trim();
    if (!name || !(model?.customKeyShortcutKeys || []).includes(name)) return null;
    const entry = (model?.qmkKeycodes || []).find((row) => row.value === name || row.aliases.includes(name));
    return entry ? entry.keycode : null;
}

// A catalogue key that is or carries modifiers is a shortcut too, though its
// keycode is not a key the shortcut holds: a modifier key is its modifier in
// the mask (Left Shift is Left Shift, with no key), and a key with its own
// modifiers, as QMK's shifted symbols are (KC_EXLM is S(KC_1)), is those
// modifiers and its key, when the shortcut may hold that key. So the shortcut
// picker offers every modifier and symbol the Keys screen's picker does, and
// `!` is Left Shift + 1. Null for any other key.
/** @param {Model} model @param {string} name @returns {{key: string, mods: number} | null} */
export function shortcutModifiers(model, name) {
    const value = model?.qmkKeycodeAliases?.[name] || name;
    const code = (model?.qmkKeycodes || []).find((row) => row.value === value || row.aliases.includes(value))?.keycode;
    if (code === undefined) return null;
    if (code >= 0xe0 && code <= 0xe7) return {key: "", mods: 1 << (code - 0xe0)};
    const mods = compactModifierMask(code);
    if (!mods) return null;
    const base = (model?.qmkKeycodes || []).find((row) => row.keycode === (code & 0xff));
    return base && shortcutKeyCode(model, base.value) !== null ? {key: base.value, mods} : null;
}

// The keycode picker sets a shortcut as it wraps any key: the modifier row
// above the board, here any of the eight, left and right mixed, since the
// shortcut stores a mask rather than one wrapped keycode (firmware D-F26).
// The row starts as the stored mask...
/** @param {Model} model @param {number} mask */
export const shortcutPickMods = (model, mask) => (vocabulary(model).pickerModifiers || []).filter((entry) => mask & entry.bit).map((entry) => entry.value);

// ...and the picker's choice is the mask and the key's value (0 for none).
/** @param {Model} model @param {{mods?: string[], keys?: string[]}} pick @returns {import("../../contracts/edits.js").EditPayloads["updateCustomKeyShortcut"]["shortcut"]} */
export function shortcutPick(model, {mods = [], keys = []}) {
    const controls = vocabulary(model).pickerModifiers || [];
    const mask = mods.reduce((bits, wrapper) => bits | (controls.find((entry) => entry.value === wrapper)?.bit ?? 0), 0);
    const held = keys[0] ? shortcutModifiers(model, keys[0]) : null;
    if (held) return {mods: mask | held.mods, key: held.key ? shortcutKeyCode(model, held.key) ?? 0 : 0};
    return {mods: mask, key: keys[0] ? shortcutKeyCode(model, keys[0]) ?? 0 : 0};
}

// The picker's choice in words, for its footer: "Left Ctrl + Right Alt + K".
/** @param {Model} model @param {{mods: number, key: number}} shortcut */
export function shortcutPickLabel(model, shortcut) {
    const mods = (vocabulary(model).modifiers || []).filter(([bit]) => shortcut.mods & bit).map(([, label]) => label);
    const entry = shortcut.key ? (model?.qmkKeycodes || []).find((row) => row.keycode === shortcut.key) : undefined;
    return [...mods, entry ? entry.label || entry.value : ""].filter(Boolean).join(" + ");
}

// A key with modifiers from both sides, which no keycode can hold, still makes
// a shortcut, and the keycode picker offers a custom key for it (D-L63). This
// is the shortcut it would take, or null when a keycode can hold the
// selection, there is no key, or the key cannot be a shortcut's. Modifiers
// alone are folded by modifierPick (view/keyvalues.mjs), which offers a custom
// key only for a set no keycode holds.
/** @param {Model} model @param {{mods?: string[], keys?: string[]}} pick */
export function shortcutOffer(model, {mods = [], keys = []}) {
    if (!mods.length || !keys.length || !(model?.customKeyShortcutKeys || []).length) return null;
    const shortcut = shortcutPick(model, {mods, keys});
    if (!shortcut.key) return null;
    return (shortcut.mods & 0x0f) && (shortcut.mods & 0xf0) ? shortcut : null;
}

// A custom key that already holds exactly this shortcut, to use rather than
// make another. Where the key runs its own behaviour (a layout key, a combo
// output) only one without a behaviour does just that; a behaviour step sends
// a custom key's shortcut only, so any will do there.
/** @param {Model} model @param {{mods: number, key: number}} shortcut @param {{runsBehaviour?: boolean}} [options] */
export const customKeyWithShortcut = (model, shortcut, {runsBehaviour = true} = {}) => (model?.customKeys || []).find((key) =>
    hasShortcut(key) && key.shortcut.mods === shortcut.mods && key.shortcut.key === shortcut.key && !(runsBehaviour && key.hasBehavior));

// The custom key such an offer takes: the first that does nothing yet, with no
// name, behaviour or shortcut and on no layer or combo.
/** @param {Model} model @param {import("../../contracts/panel.js").Layer[]} stack */
export const unusedCustomKey = (model, stack) => (model?.customKeys || []).find((key) =>
    !key.name && !key.hasBehavior && !hasShortcut(key) && !customKeyPlacements(model, stack, key.keycode).length);

// What the picker offers for a shortcut no keycode holds (D-L63). A custom key
// with exactly that shortcut is used if it does only that. Where the field
// runs a custom key's behaviour too (a layout key, a combo output), a match
// that has a behaviour is offered beside a new key, and the person chooses;
// a behaviour step sends only the shortcut and never chains another
// behaviour, so there any match is used as it is. With no match, an unused
// key is made it.
/** @param {Model} model @param {{mods: number, key: number}} shortcut @param {import("../../contracts/panel.js").Layer[]} stack @param {{runsBehaviour?: boolean}} [options] */
export function customKeyChoice(model, shortcut, stack, {runsBehaviour = true} = {}) {
    const plain = customKeyWithShortcut(model, shortcut, {runsBehaviour});
    // A step sends only the shortcut, so a match's behaviour never runs there.
    if (plain) return {existing: plain, withBehaviour: false, spare: undefined};
    const behaved = runsBehaviour ? customKeyWithShortcut(model, shortcut, {runsBehaviour: false}) : undefined;
    return {existing: behaved, withBehaviour: Boolean(behaved), spare: unusedCustomKey(model, stack)};
}

// The name it gets: the shortcut in words if that fits a name, else written
// short ("LCtrl+LShift+RCtrl+RShift"), else none.
/** @param {Model} model @param {{mods: number, key: number}} shortcut */
export function offeredName(model, shortcut) {
    const label = shortcutPickLabel(model, shortcut);
    if (nameBytes(label) <= NAME_MAX_BYTES) return label;
    const short = shortcutPickLabel(model, shortcut).split(" + ").map((part) => part.replace(/^Left /, "L").replace(/^Right /, "R")).join("+");
    return nameBytes(short) <= NAME_MAX_BYTES ? short : "";
}

// Whether a custom key is in use: named, sending a shortcut or carrying a
// behaviour. The list counts these and keeps them in view.
/** @param {CustomKey} key */
export const customKeyInUse = (key) => Boolean(key.name) || hasShortcut(key) || key.hasBehavior;

// The Custom keys list: keys in use (and the open one), then the rest folded
// behind their count. A search finds a key by name, by "K5" or by its slot
// number, and shows every key it finds.
/** @param {readonly CustomKey[]} keys @param {{query?: string, current?: string | null}} [options] */
export function customKeyBankList(keys, {query = "", current = null} = {}) {
    const needle = String(query).trim().toLowerCase();
    /** @param {CustomKey} key */
    const matches = (key) => !needle || key.name.toLowerCase().includes(needle) || String(key.slot) === needle
        || `k${key.slot}` === needle || key.shortcutLabel.toLowerCase().includes(needle);
    /** @type {CustomKey[]} */
    const shown = [];
    /** @type {CustomKey[]} */
    const folded = [];
    for (const key of keys) {
        if (!matches(key)) continue;
        (customKeyInUse(key) || needle || key.keycode === current ? shown : folded).push(key);
    }
    return {shown, folded, firstFree: keys.find((key) => !customKeyInUse(key))};
}

// A shortcut drawn short, as a keycap prints it: modifier symbols on macOS
// (⌃⌥⇧⌘, in Apple's order), words joined by + elsewhere, then the key's
// label. A modifier held on both sides shows once. Empty for no shortcut.
const MAC_GLYPHS = [[0x11, "⌃"], [0x44, "⌥"], [0x22, "⇧"], [0x88, "⌘"]];
const PC_WORDS = [[0x11, "Ctrl"], [0x44, "Alt"], [0x22, "Shift"], [0x88, "Win"]];
/** @param {Model} model @param {{mods: number, key: number}} shortcut */
export function shortcutGlyphs(model, shortcut) {
    if (!shortcut.mods && !shortcut.key) return "";
    const mac = model?.hostSettings?.effective === 1;
    const mods = /** @type {[number, string][]} */ (mac ? MAC_GLYPHS : PC_WORDS).filter(([bits]) => shortcut.mods & bits).map(([, glyph]) => glyph);
    const entry = shortcut.key ? (model?.qmkKeycodes || []).find((row) => row.keycode === shortcut.key) : undefined;
    const key = entry ? model?.qmkKeyLabels?.[entry.value] || entry.label || entry.value : "";
    return mac ? `${mods.join("")}${key}` : [...mods, key].filter(Boolean).join("+");
}
