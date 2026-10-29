// @ts-check
// What a custom key does, in words, and its shortcut's keys by value. A custom
// key's shortcut (firmware D-F26) is its own action: up to six keys and
// modifiers held together, held while the key is held, tapped when it is
// tapped, and layers, which it turns
// on as one layer key does (its layer kind): held, locked, moved to,
// tap-toggled or one-shot. A behaviour on the key works on top of it, and a
// behaviour step on another key that sends it sends the shortcut only, layers
// included.
import {layerCalledAt, sentence, vocabulary} from "./vocabulary.mjs";
import {customKeyNamesOf, customKeyPlacements, reachGroups} from "./reach.mjs";
import {NAME_MAX_BYTES, nameBytes} from "./names.mjs";
import {compactModifierMask} from "./keyvalues.mjs";
import {LAYERS} from "./layout.mjs";
import {MODIFIER_KEYS, MODIFIER_KEY_SIDES, TAPPING_TOGGLE, inBlock, keyOf} from "../../rules/qmk-keycodes.mjs";

/** @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model */
/** @typedef {import("../../contracts/panel.js").CustomKey} CustomKey */

// A shortcut, or the parts of one a caller has (a missing part is none).
/** @typedef {{mods?: number, keys?: readonly number[], layers?: number, layerKind?: number}} ShortcutParts */

// Whether a shortcut sends anything to the computer, modifiers or keys; with
// layers, any part at all is a shortcut.
/** @param {ShortcutParts | null | undefined} shortcut */
const sendsKeys = (shortcut) => Boolean(shortcut && (shortcut.mods || shortcut.keys?.length));
/** @param {CustomKey | null | undefined} key */
export const hasShortcut = (key) => Boolean(key?.shortcut && (sendsKeys(key.shortcut) || key.shortcut.layers));
// Whether two shortcuts are the same: every part, a missing one as none.
/** @param {ShortcutParts} a @param {ShortcutParts} b */
export const sameShortcut = (a, b) => (a.mods ?? 0) === (b.mods ?? 0) && (a.keys ?? []).join() === (b.keys ?? []).join()
    && (a.layers ?? 0) === (b.layers ?? 0) && (a.layerKind ?? 0) === (b.layerKind ?? 0);

// How a shortcut turns its layers on (SHORTCUT_LAYER_KINDS): hold, lock, move
// to, tap-toggle, one-shot; hold without layers.
export const LAYER_KIND = Object.freeze({HOLD: 0, LOCK: 1, MOVE: 2, TAP_TOGGLE: 3, ONESHOT: 4});
/** @param {CustomKey} key */
const layerKindOf = (key) => (key.shortcut?.layers ? key.shortcut.layerKind || LAYER_KIND.HOLD : LAYER_KIND.HOLD);
/** @param {CustomKey} key */
const layersAlone = (key) => Boolean(key.shortcut?.layers) && !sendsKeys(key.shortcut);
/** @param {CustomKey} key */
const layerNames = (key) => (key.shortcutLayerNames || []).join(" + ") || key.shortcutLabel;
// What a shortcut of layers alone does with them, after "it".
const LAYER_ACTS = [(/** @type {string} */ names) => `holds ${names} on`, (/** @type {string} */ names) => `locks ${names}`, (/** @type {string} */ names) => `moves to ${names}`,
    (/** @type {string} */ names) => `tap-toggles ${names}`, (/** @type {string} */ names) => `turns ${names} on as a one-shot`];
// What the shortcut does, after "it": sends its modifiers and keys, its layers
// named after them by their kind ("sends Left Cmd + Lock Navigation"), or, of
// layers alone, what it does with them (firmware D-F26).
/** @param {CustomKey} key */
export const shortcutAct = (key) => (layersAlone(key) ? (LAYER_ACTS[layerKindOf(key)] || LAYER_ACTS[0])(layerNames(key)) : `sends ${key.shortcutLabel}`);
// A tap-toggle or one-shot shortcut makes its key a momentary layer key, as
// TT() and OSL() are: its layers are on from every press, behaviour or not.
/** @param {CustomKey} key */
const momentary = (key) => layerKindOf(key) === LAYER_KIND.TAP_TOGGLE || layerKindOf(key) === LAYER_KIND.ONESHOT;
const FROM_EVERY_PRESS = "its layers are on from every press of the key";

// When it does it, on the key itself with no behaviour: held and tapped as the
// key is, and its layers as their kind turns them on.
/** @param {CustomKey} key */
function shortcutRuns(key) {
    const keys = !layersAlone(key);
    switch (layerKindOf(key)) {
        case LAYER_KIND.LOCK: return `${keys ? "its keys held while the key is held; " : ""}pressing the key locks its layers on, or off again once all are on`;
        case LAYER_KIND.MOVE: return `${keys ? "its keys held while the key is held; " : ""}pressing the key locks its layers alone, letting every other lock go`;
        case LAYER_KIND.TAP_TOGGLE: return `held while the key is held; tapping it ${TAPPING_TOGGLE} times locks its layers`;
        case LAYER_KIND.ONESHOT: return "held while the key is held; a tap turns its layers on for the next key press";
        default: return "held while the key is held, tapped when it is tapped";
    }
}
// A shortcut's limits in words, as core says them (model.
// customKeyShortcutKeyLimits): "up to 6 keys held together, at most one media
// key and one system key"; `start` begins a sentence with them.
/** @param {Model} model @param {boolean} [start] */
export const shortcutLimitWords = (model, start = false) => (start ? sentence : String)(model?.customKeyShortcutKeyLimits?.words || "");

// A slot in use: named, or sending a shortcut, or with a behaviour. Any other
// is an empty slot, drawn as one on the Custom keys screen, and is not a key a
// layer could be missing.
/** @param {CustomKey | null | undefined} key */
export const customKeyInUse = (key) => Boolean(key && (key.name || key.hasBehavior || hasShortcut(key)));

// Custom keys, grouped the ways a layer reaches them, as macros are: a key
// carrying one, a transparent key letting a lower one, a behaviour branch
// sending one (which sends its shortcut only, D-L63), or a combo sending one.
/** @param {import("./keyface-types.js").LayerView} view */
export const customKeyReach = (view) => reachGroups(view, customKeyNamesOf(view.model),
    (view.model?.customKeys || []).filter(customKeyInUse).map((key) => key.keycode));

// The custom key a keycode names, if it is one: one of the custom keys core
// publishes, by its name or any other it is read by, the bare hex a combo
// stores included (customKeyNamesOf).
/** @param {Model} model @param {string | null | undefined} keycode */
export const customKeyOf = (model, keycode) => {
    if (!keycode) return undefined;
    const [name = keycode] = customKeyNamesOf(model)(keycode);
    return (model?.customKeys || []).find((key) => key.keycode === name);
};

// "What it does": its shortcut, its behaviour on top, both, or nothing yet.
/** @param {CustomKey} key */
export function customKeyDoes(key) {
    const sends = hasShortcut(key) ? key.shortcutLabel : "";
    if (sends && key.hasBehavior) return `Its behaviour, on top of ${sends}: a tap or hold the behaviour leaves empty ${shortcutAct(key)}${momentary(key) ? `, and ${FROM_EVERY_PRESS}` : ""}.`;
    if (sends) return `${sentence(shortcutAct(key))}: ${shortcutRuns(key)}. Set taps and holds in its grid to give it more.`;
    if (key.hasBehavior) return "Only what its behaviour says. Give it a shortcut to send one where the behaviour leaves a tap or hold empty.";
    return "Nothing yet. Give it a shortcut, or set taps and holds in its grid.";
}

// What the shortcut does on this key, in one line: held and tapped as the key
// is, or, under a behaviour, where the behaviour leaves a tap or hold empty
// (firmware D-F26).
/** @param {CustomKey} key */
export function customKeyShortcutLine(key) {
    if (!hasShortcut(key)) return "No shortcut: it does only what its behaviour says.";
    return key.hasBehavior ? `${sentence(shortcutAct(key))} where its behaviour leaves a tap or hold empty${momentary(key) ? `; ${FROM_EVERY_PRESS}` : ""}.`
        : `${sentence(shortcutAct(key))}: ${shortcutRuns(key)}.`;
}

// A custom key under its name in the hover card: with no shortcut, only that,
// since its behaviour shows below. A shortcut has its own section instead.
/** @param {CustomKey | null | undefined} key */
export function customKeyHeadline(key) {
    if (!key || hasShortcut(key)) return null;
    // Under a behaviour the missing shortcut is a quiet aside; alone, the key
    // sends nothing, which the card says plainly.
    return key.hasBehavior ? {text: "No shortcut", quiet: true} : {text: "No shortcut and no behaviour yet: it sends nothing.", quiet: false};
}

// When a custom key's shortcut runs on it, for the hover card's Shortcut
// section: held and tapped as the key is, or, under a behaviour, where the
// behaviour leaves a tap or hold empty (firmware D-F26).
/** @param {CustomKey} key */
export const shortcutWhen = (key) => key.hasBehavior ? `Where its behaviour leaves a tap or hold empty${momentary(key) ? `; ${FROM_EVERY_PRESS}` : ""}`
    : layersAlone(key) && (layerKindOf(key) === LAYER_KIND.LOCK || layerKindOf(key) === LAYER_KIND.MOVE) ? "When the key is pressed"
    : "Held while the key is held, tapped when it is tapped";

// Each layer's tag in the hover card, the kind's verb as its layer key reads
// ("hold", "lock"), and what the layers do, under them.
/** @param {Model} model @param {CustomKey} key */
export function shortcutLayerTag(model, key) {
    const kind = layerKindOf(key);
    const verb = (vocabulary(model).customKeys.layerKinds || []).find(([value]) => value === kind)?.[1] || "Hold";
    return verb.toLowerCase();
}
/** @param {CustomKey} key */
export function shortcutLayerUnder(key) {
    const many = (key.shortcut.layers & (key.shortcut.layers - 1)) !== 0;
    const them = many ? "them" : "it", what = many ? "layers" : "layer";
    switch (layerKindOf(key)) {
        case LAYER_KIND.LOCK: return `${what} · locks ${them} on, or off when ${many ? "all are" : "it is"} on`;
        case LAYER_KIND.MOVE: return `${what} · locks ${them} alone`;
        case LAYER_KIND.TAP_TOGGLE: return key.hasBehavior ? `${what} · held from every press; ${TAPPING_TOGGLE} taps lock ${them} unless its behaviour has steps`
            : `${what} · held while held; ${TAPPING_TOGGLE} taps lock ${them}`;
        case LAYER_KIND.ONESHOT: return key.hasBehavior ? `${what} · held from every press; an empty tap turns ${them} on for the next key`
            : `${what} · held while held; a tap turns ${them} on for the next key`;
        default: return `${what} · on while the shortcut is held`;
    }
}

// The layers a shortcut holds on, lowest first.
/** @param {CustomKey} key */
export const shortcutLayerList = (key) => Array.from({length: LAYERS}, (_, layer) => layer).filter((layer) => (key.shortcut?.layers ?? 0) & (1 << layer));

// Where only a custom key's shortcut runs (a behaviour step that sends the
// key, or a combo output whose behaviour does not run), what it sends.
/** @param {CustomKey | null | undefined} key */
export function customKeyShortcutOnly(key) {
    if (!key) return "";
    if (!hasShortcut(key)) return "no shortcut, so it sends nothing";
    if (!layersAlone(key)) return `sends its shortcut, ${key.shortcutLabel}`;
    // Sent this way, a tap-toggle shortcut only holds: its taps are its key's.
    switch (layerKindOf(key)) {
        case LAYER_KIND.LOCK: return `locks its shortcut's layers, ${layerNames(key)}`;
        case LAYER_KIND.MOVE: return `moves to its shortcut's layers, ${layerNames(key)}`;
        case LAYER_KIND.ONESHOT: return `turns its shortcut's layers on as a one-shot, ${layerNames(key)}`;
        default: return `holds its shortcut's layers on, ${layerNames(key)}`;
    }
}

// What a custom key does as itself, its behaviour bypassed or off: its
// shortcut, as when it is sent, except that a tap-toggle or one-shot key is
// still TT() or OSL() of its layers (firmware D-F26): held from the press, its
// own taps locking them or arming them.
/** @param {CustomKey} key */
function customKeyBypassed(key) {
    const many = (key.shortcut.layers & (key.shortcut.layers - 1)) !== 0, them = many ? "them" : "it";
    const sends = layersAlone(key) ? `holds its shortcut's layers on while held, ${layerNames(key)}` : `sends its shortcut, ${key.shortcutLabel}`;
    switch (layerKindOf(key)) {
        case LAYER_KIND.TAP_TOGGLE: return `${sends}; tapping it ${TAPPING_TOGGLE} times locks ${them}`;
        case LAYER_KIND.ONESHOT: return `${sends}; a tap turns ${them} on for the next key`;
        default: return customKeyShortcutOnly(key);
    }
}

// A short note for a place that names the key: what it sends.
/** @param {Model} model @param {string | null | undefined} keycode */
export function customKeySendsNote(model, keycode) {
    const key = customKeyOf(model, keycode);
    if (!key) return "";
    return hasShortcut(key) ? `Custom key · ${shortcutAct(key)}` : "Custom key · no shortcut: sends nothing of its own";
}

// What a placed custom key sends with its behaviour bypassed or off: its
// shortcut, or nothing. Empty for a key that is not a custom key.
/** @param {CustomKey | null | undefined} key */
export function customKeyBypassText(key) {
    if (!key) return "";
    return hasShortcut(key) ? `With its behaviour bypassed or off, this custom key ${customKeyBypassed(key)}.`
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
// picker offers every modifier and symbol the Keymap screen's picker does, and
// `!` is Left Shift + 1. Null for any other key.
/** @param {Model} model @param {string} name @returns {{key: string, mods: number} | null} */
export function shortcutModifiers(model, name) {
    const value = model?.qmkKeycodeAliases?.[name] || name;
    const code = (model?.qmkKeycodes || []).find((row) => row.value === value || row.aliases.includes(value))?.keycode;
    if (code === undefined) return null;
    if (inBlock(code, MODIFIER_KEYS)) return {key: "", mods: 1 << (code - MODIFIER_KEYS.first)};
    const mods = compactModifierMask(code);
    if (!mods) return null;
    const base = (model?.qmkKeycodes || []).find((row) => row.keycode === keyOf(code));
    return base && shortcutKeyCode(model, base.value) !== null ? {key: base.value, mods} : null;
}

// The keycode picker sets a shortcut as it wraps any key: the modifier row
// above the board, here any of the eight, left and right mixed, since the
// shortcut stores a mask rather than one wrapped keycode (firmware D-F26).
// The row starts as the stored mask...
/** @param {Model} model @param {number} mask */
export const shortcutPickMods = (model, mask) => (vocabulary(model).pickerModifiers || []).filter((entry) => mask & entry.bit).map((entry) => entry.value);

// ...and the picker's choice is the mask, the keys' values in the order they
// were picked, and the layers switched on in its Layers section. A symbol
// picked is its key with its modifiers in the mask.
/** @param {Model} model @param {{mods?: string[], keys?: string[], layers?: number, layerKind?: number}} pick @returns {import("../../contracts/edits.js").EditPayloads["updateCustomKeyShortcut"]["shortcut"]} */
export function shortcutPick(model, {mods = [], keys = [], layers = 0, layerKind = 0}) {
    const controls = vocabulary(model).pickerModifiers || [];
    let mask = mods.reduce((bits, wrapper) => bits | (controls.find((entry) => entry.value === wrapper)?.bit ?? 0), 0);
    /** @type {number[]} */
    const codes = [];
    for (const name of keys) {
        const held = shortcutModifiers(model, name);
        if (held) mask |= held.mods;
        const code = held ? (held.key ? shortcutKeyCode(model, held.key) : null) : shortcutKeyCode(model, name);
        if (code !== null) codes.push(code);
    }
    // A kind means nothing without layers: the shortcut holds then.
    return {mods: mask, keys: codes, layers, layerKind: layers ? layerKind : 0};
}

// Why the picker's keys cannot be a shortcut, before Use posts them: the
// first of core's caps they break, in core's words (model.
// customKeyShortcutKeyLimits, SHORTCUT_KEY_CAPS), read as the codec reads
// them; "" when they can.
/** @param {Model} model @param {{mods?: string[], keys?: string[], layers?: number, layerKind?: number}} pick */
export function shortcutPickProblem(model, pick) {
    const {keys} = shortcutPick(model, pick);
    const broken = (model?.customKeyShortcutKeyLimits?.caps || []).find((cap) => {
        const held = cap.keycodes ? keys.filter((key) => /** @type {readonly number[]} */ (cap.keycodes).includes(key)) : keys;
        const most = cap.each ? Math.max(0, ...held.map((key) => held.filter((other) => other === key).length)) : held.length;
        return most > cap.most;
    });
    return broken?.refusal || "";
}

// The shortcut picker's keys and modifiers as the person builds them: the
// keys in press order, the modifier row lit (`mods`), the modifiers they
// turned on themselves (`own`), and the modifiers each key picked as a symbol
// brought (`symbols`, by its key: `!` is 1 with Shift).
/** @typedef {{keys: string[], mods: string[], own?: string[], symbols?: Record<string, string[]>}} ShortcutPicking */
/** @param {ShortcutPicking} picking */
const picking = ({keys, mods, own = [], symbols = {}}) => ({keys: [...keys], mods: [...mods], own: [...own], symbols: {...symbols}});

// A modifier turned on or off with its button, or with its modifier key.
/** @param {ShortcutPicking} pick @param {string} mod @returns {Required<ShortcutPicking>} */
export function shortcutPickModifier(pick, mod) {
    const next = picking(pick);
    const on = next.mods.includes(mod);
    next.mods = on ? next.mods.filter((value) => value !== mod) : [...next.mods, mod];
    next.own = on ? next.own.filter((value) => value !== mod) : [...new Set([...next.own, mod])];
    return next;
}

// A key taken out: with it go the modifiers it brought as a symbol, unless
// another key picked as a symbol still needs one or the person turned it on.
/** @param {ShortcutPicking} pick @param {string} key @returns {Required<ShortcutPicking>} */
export function shortcutPickDrop(pick, key) {
    const next = picking(pick);
    const brought = next.symbols[key] || [];
    delete next.symbols[key];
    const needed = new Set([...next.own, ...Object.values(next.symbols).flat()]);
    next.keys = next.keys.filter((value) => value !== key);
    next.mods = next.mods.filter((mod) => !brought.includes(mod) || needed.has(mod));
    return next;
}

// A click on a key in the shortcut picker. A modifier key toggles its
// modifier. A symbol joins the keys with its modifiers lit, and a second
// click takes it out; any other key joins the keys in press order, or is
// taken out.
/** @param {Model} model @param {ShortcutPicking} pick @param {string} name @returns {Required<ShortcutPicking>} */
export function shortcutPickKey(model, pick, name) {
    const held = shortcutModifiers(model, name);
    if (!held) return pick.keys.includes(name) ? shortcutPickDrop(pick, name) : {...picking(pick), keys: [...pick.keys, name]};
    const mods = shortcutPickMods(model, held.mods);
    const on = mods.every((mod) => pick.mods.includes(mod));
    if (!held.key) return mods.filter((mod) => pick.mods.includes(mod) === on).reduce((next, mod) => shortcutPickModifier(next, mod), picking(pick));
    if (on && pick.keys.includes(held.key)) return shortcutPickDrop(pick, held.key);
    const next = picking(pick);
    next.mods = [...new Set([...next.mods, ...mods])];
    if (!next.keys.includes(held.key)) next.keys.push(held.key);
    next.symbols[held.key] = mods;
    return next;
}


// The picker's choice in words, for its footer: "Left Ctrl + Right Alt + K",
// its keys in order ("Left Shift + A + S + Play"), then its layers by name, lowest first, led by their kind's verb unless held,
// as core names a shortcut ("Left Cmd + Lock Navigation + Extra").
/** @param {Model} model @param {{mods: number, keys: readonly number[], layers?: number, layerKind?: number}} shortcut */
export function shortcutPickLabel(model, shortcut) {
    const mods = (vocabulary(model).modifiers || []).filter(([bit]) => shortcut.mods & bit).map(([, label]) => label);
    const keys = shortcut.keys.map((code) => (model?.qmkKeycodes || []).find((row) => row.keycode === code)).map((entry) => entry ? entry.label || entry.value : "");
    const layers = (model?.layers || []).map((layer) => layer.index).filter((index) => (shortcut.layers ?? 0) & 2 ** index).sort((a, b) => a - b).map((index) => layerCalledAt(model, index));
    const verb = shortcut.layerKind ? (vocabulary(model).customKeys?.layerKinds || []).find(([kind]) => kind === shortcut.layerKind)?.[1] : "";
    if (layers.length && verb) layers[0] = `${verb} ${layers[0]}`;
    return [...mods, ...keys, ...layers].filter(Boolean).join(" + ");
}

// The kinds a shortcut's layers can be turned on as, in the picker: each
// kind's verb, as its layer key reads ("Lock"), and what it does, for its tip.
/** @param {Model} model @returns {{kind: number, label: string, tip: string, column: string}[]} */
export function shortcutLayerKinds(model) {
    /** @type {Record<number, {tip: string, column: string}>} */
    const words = {
        [LAYER_KIND.HOLD]: {tip: "As MO(): on while the shortcut is held, and only for a tap when it is tapped.", column: "Held on while the shortcut is"},
        [LAYER_KIND.LOCK]: {tip: "As TG(): pressing it locks them all on, or all off again once all are locked.", column: "Locked by the shortcut"},
        [LAYER_KIND.MOVE]: {tip: "As TO(): pressing it locks them alone, letting every other lock go.", column: "Locked alone by the shortcut"},
        [LAYER_KIND.TAP_TOGGLE]: {tip: `As TT(): on from every press of the key; tapping it ${TAPPING_TOGGLE} times locks them, unless its behaviour has steps. Sent by another key's step, or by a combo that does not run the key's behaviour, they are only held; a combo that runs it acts as the key.`, column: "Held; locked by its taps"},
        [LAYER_KIND.ONESHOT]: {tip: "As OSL(): on from every press of the key; a tap, or holding it alone and letting go, turns them on for the next key press, and a quick second tap cancels that.", column: "Held; one-shot when tapped"},
    };
    return (vocabulary(model).customKeys?.layerKinds || []).map(([kind, label]) => ({kind, label, ...(words[kind] || words[LAYER_KIND.HOLD])}));
}

// The layers a shortcut can turn on, one row each in the tab order, with why
// one cannot (the base layer and the default layers are always on, firmware
// D-F26): the core publishes the rule (model.customKeyShortcutLayers,
// core/model/shortcut-layers.js).
/** @param {Model} model @param {number} chosen */
export function shortcutLayerRows(model, chosen) {
    const targets = model?.customKeyShortcutLayers || [];
    const words = vocabulary(model).customKeys.alwaysOn;
    return (model?.layers || []).map((layer) => {
        const target = targets.find((entry) => entry.layer === layer.index);
        const on = Boolean(chosen & 2 ** layer.index), unusable = Boolean(target?.refusal);
        return {layer: layer.index, name: layerCalledAt(model, layer.index), on, unusable,
            why: unusable && target?.alwaysOn && words ? words[target.alwaysOn] : "", tip: target?.refusal || ""};
    });
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
    if (!shortcut.keys.length) return null;
    return (shortcut.mods & MODIFIER_KEY_SIDES.LEFT) && (shortcut.mods & MODIFIER_KEY_SIDES.RIGHT) ? shortcut : null;
}

// A custom key that already holds exactly this shortcut, to use rather than
// make another. Where the key runs its own behaviour (a layout key, a combo
// output) only one without a behaviour does just that; a behaviour step sends
// a custom key's shortcut only, so any will do there.
/** @param {Model} model @param {ShortcutParts} shortcut @param {{runsBehaviour?: boolean}} [options] */
export const customKeyWithShortcut = (model, shortcut, {runsBehaviour = true} = {}) => (model?.customKeys || []).find((key) =>
    hasShortcut(key) && sameShortcut(key.shortcut, shortcut) && !(runsBehaviour && key.hasBehavior));

// The custom key such an offer takes: the first that does nothing yet, with no
// name, behaviour or shortcut and on no layer or combo.
/** @param {Model} model */
export const unusedCustomKey = (model) => (model?.customKeys || []).find((key) =>
    !key.name && !key.hasBehavior && !hasShortcut(key) && !customKeyPlacements(model, key.keycode).length);

// What the picker offers for a shortcut no keycode holds (D-L63). A custom key
// with exactly that shortcut is used if it does only that. Where the field
// runs a custom key's behaviour too (a layout key, a combo output), a match
// that has a behaviour is offered beside a new key, and the person chooses;
// a behaviour step sends only the shortcut and never chains another
// behaviour, so there any match is used as it is. With no match, an unused
// key is made it.
/** @param {Model} model @param {{mods: number, keys: readonly number[]}} shortcut @param {{runsBehaviour?: boolean}} [options] */
export function customKeyChoice(model, shortcut, {runsBehaviour = true} = {}) {
    const plain = customKeyWithShortcut(model, shortcut, {runsBehaviour});
    // A step sends only the shortcut, so a match's behaviour never runs there.
    if (plain) return {existing: plain, withBehaviour: false, spare: undefined};
    const behaved = runsBehaviour ? customKeyWithShortcut(model, shortcut, {runsBehaviour: false}) : undefined;
    return {existing: behaved, withBehaviour: Boolean(behaved), spare: unusedCustomKey(model)};
}

// The name it gets: the shortcut in words if that fits a name, else written
// short ("LCtrl+LShift+RCtrl+RShift"), else none.
/** @param {Model} model @param {{mods: number, keys: readonly number[]}} shortcut */
export function offeredName(model, shortcut) {
    const label = shortcutPickLabel(model, shortcut);
    if (nameBytes(label) <= NAME_MAX_BYTES) return label;
    const short = shortcutPickLabel(model, shortcut).split(" + ").map((part) => part.replace(/^Left /, "L").replace(/^Right /, "R")).join("+");
    return nameBytes(short) <= NAME_MAX_BYTES ? short : "";
}
