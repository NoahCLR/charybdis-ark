// @ts-check
// Which key a spelling is, and whether two spellings are the same key.
//
// One key goes by many names. The keyboard stores QK_USER_16 or a bare
// 0x7f00 where the profile says PD_MODE_0 or CUSTOM_KEY_0; the picker says
// KC_ENT and G(KC_C) where a behaviour row says KC_ENTER and LGUI(KC_C); QMK
// names the first 32 macros QK_MACRO_n and MC_n where Ark says MACRO_n. Every
// screen asks this module which key a spelling is, through one value per
// spelling and model, worked out once on first read (a model is replaced,
// never mutated, so the answers are kept as long as it is).
//
// Two ways of matching a key stay apart. A behaviour row is keyed exactly by
// the name the profile uses (`behaviour`: the key a position means, or the
// output a combo sends, as it is). A key a person picks or types is matched
// however it is spelled (`listening`, `sameKey`: one spelling per key,
// `canonical`).

import {MODIFIER_WRAPPERS, MODS, MOD_BITS, MOD_RIGHT, QK, inBlock, keyOf, macroName, macroOfName, modsOf, wrapperOf} from "../../rules/qmk-keycodes.mjs";
import {keycodeValue} from "./keycode-expression.mjs";
import {keptPer, once} from "../lib/once.mjs";
/** @typedef {import("./keyface-types.js").ViewModel} ViewModel */
/** @typedef {import("./keyface-types.js").KeyIdentity} KeyIdentity */
/** @typedef {import("./keyface-types.js").PointingSlot} PointingSlot */

/** @type {(model: NonNullable<ViewModel>, spelling: string, work: () => KeyIdentity) => KeyIdentity} */
const KEYS = keptPer();

// The key a spelling names in this model: the same spelling makes the same
// value.
/** @param {ViewModel} model @param {string | null | undefined} spelling @returns {KeyIdentity} */
export function keyIdentity(model, spelling) {
    const text = String(spelling ?? "");
    return model ? KEYS(model, text, () => identityOf(model, text)) : identityOf(model, text);
}

// Whether two spellings are one key: KC_ENT and KC_ENTER, G(KC_C) and
// LGUI(KC_C), 0x7f00 and CUSTOM_KEY_0.
/** @param {ViewModel} model @param {string | null | undefined} a @param {string | null | undefined} b */
export const sameKey = (model, a, b) => keyIdentity(model, a).canonical === keyIdentity(model, b).canonical;

/** @param {ViewModel} model @param {string} spelling @returns {KeyIdentity} */
function identityOf(model, spelling) {
    const aliases = model?.qmkKeycodeAliases;
    // The name the profile knows the key by: QK_USER_16 is PD_MODE_0, KC_ENT
    // is KC_ENTER. Every name core publishes is one, never empty.
    const name = aliases?.[spelling] || spelling;
    const canonical = once(() => canonicalOf(model, spelling));
    // The names core may publish a fact about a keycode under, in the order a
    // table keyed by them is read: as written, the name the core knows it by
    // (QK_USER_31 → LOCK_LAYER(3), KC_TRNS → KC_TRANSPARENT), however the
    // expression is spelled (canonical), and a bare number as core keys one
    // (0x7f00 → 0x7F00).
    const spellings = once(() => [spelling, aliases?.[spelling] ?? "", canonical(), hexSpelling(spelling)].filter(Boolean));
    // What core says the key is where the interface treats it apart
    // (qmkKeyKinds): transparent, disabled, a macro's or a custom key's.
    // What a table core keys by keycode name says of the key, read under
    // each spelling in turn: the first entry `found` accepts (any but an
    // empty one unless it says otherwise), or undefined.
    /** @template T @param {Readonly<Record<string, T>> | null | undefined} table @param {(value: T | undefined) => boolean} [found] @returns {T | undefined} */
    const lookUp = (table, found = Boolean) => {
        for (const spelled of spellings()) if (found(table?.[spelled])) return table?.[spelled];
        return undefined;
    };
    const kind = once(() => lookUp(model?.qmkKeyKinds));
    const value = once(() => keycodeValue(model, spelling));
    // The keyboard's catalogue entry for the key, by the name the profile
    // knows it by or any alias it lists, as written or as that name.
    const entry = once(() => (model?.qmkKeycodes || []).find((row) => row.value === name || row.value === spelling
        || row.aliases?.includes(spelling) || row.aliases?.includes(name)));
    // The name the profile lists a key of this kind by (MACRO_3,
    // CUSTOM_KEY_0) when core says it is one, under any name it is read by:
    // the name the value it stores goes by, so QK_MACRO_3, MC_3 and 0x7703
    // are all MACRO_3.
    /** @param {import("../../contracts/model.js").KeyKind} wanted */
    const named = (wanted) => {
        if (!spelling || kind() !== wanted) return "";
        const stored = value();
        return keyIdentity(model, stored === undefined ? spelling : keycodeName(model, stored)).name;
    };
    const macro = once(() => named("macro"));
    const customKey = once(() => named("customKey"));
    // A behaviour row is keyed by the name the profile uses, so the key a
    // position means and what a combo sends find theirs as spelled; a key a
    // person picks or types finds the row listening to it however it is spelled.
    const behaviour = once(() => (model?.keyBehaviors || []).find((row) => row.keycode === spelling));
    const listening = once(() => (model?.keyBehaviors || []).find((row) => keyIdentity(model, row.keycode).canonical === canonical()));
    const pointing = once(() => pointingSlotOf(model, spelling, name));
    const variant = once(() => pointingVariantOf(spelling, name, pointing()));
    return {
        spelling,
        name,
        get canonical() { return canonical(); },
        get spellings() { return spellings(); },
        get kind() { return kind(); },
        get value() { return value(); },
        get entry() { return entry(); },
        get macro() { return macro(); },
        get customKey() { return customKey(); },
        get behaviour() { return behaviour(); },
        get listening() { return listening(); },
        get pointing() { return pointing(); },
        get variant() { return variant(); },
        lookUp,
    };
}

// One spelling per key: every name goes through the keyboard's alias table,
// a bare number however it is cased, and every modifier wrapper becomes one
// ordered set, however an expression spaces its arguments or nests two
// modifiers.
const MOD_ORDER = /** @type {(keyof typeof MODS)[]} */ (Object.keys(MODS));
/** @param {string} wrapper The modifiers a wrapper spelling holds, by their long names, or undefined for no wrapper. */
const wrapperMods = (wrapper) => {
    const bits = Object.hasOwn(MODIFIER_WRAPPERS, wrapper) ? MODIFIER_WRAPPERS[wrapper] : undefined;
    return bits === undefined ? undefined : MOD_ORDER.filter((mod) => (MODS[mod] & MOD_RIGHT) === (bits & MOD_RIGHT) && MODS[mod] & bits & MOD_BITS);
};
// A number as the keyboard names a value it has no name for, the way core
// keys it: 0x7f00 and 0x7F00 are both 0x7F00 (core/schema/keycodes.js). Any
// other name stays as it is.
/** @param {string} name */
const hexSpelling = (name) => /^0x[0-9a-f]+$/i.test(name) ? `0x${Number(name).toString(16).toUpperCase().padStart(4, "0")}` : name;
/** @param {ViewModel} model @param {string} expression */
function canonicalOf(model, expression) {
    let text = expression.replace(/\s+/g, "");
    /** @type {Set<string>} */
    const mods = new Set();
    for (let match, held; (match = /^([A-Z]+)\((.*)\)$/.exec(text)) && (held = wrapperMods(match[1]));) {
        held.forEach((mod) => mods.add(mod));
        text = match[2];
    }
    const aliases = model?.qmkKeycodeAliases;
    const inner = text.replace(/0x[0-9A-Fa-f]+\b|[A-Za-z_][A-Za-z0-9_]*/g, (name) => aliases?.[name] ?? aliases?.[hexSpelling(name)] ?? name);
    return MOD_ORDER.filter((mod) => mods.has(mod)).reduceRight((wrapped, mod) => `${mod}(${wrapped})`, inner);
}

// A bare number as a spelling reads as one: "0x7E86" is the value 0x7E86.
/** @param {string} spelling */
const hexValue = (spelling) => /^0x[0-9a-f]+$/i.test(spelling) ? Number(spelling) : NaN;

// The two values a pointing slot answers to: hold and lock, as the core's key
// table (data/pd-mode-keys.js) gives them. Matching on the numbers rather than
// on names matters for an empty slot, whose record carries no name for the
// model to resolve — the keycode exists on the keyboard either way.
/** @param {PointingSlot} slot */
export const slotKeycodes = (slot) => slot.keys ? [slot.keys.holdCode, slot.keys.lockCode] : [];
// The same two keycodes by the names the model knows them by: hold, then lock.
/** @param {PointingSlot} slot */
export const slotKeycodeNames = (slot) => slot.keys ? [slot.keys.hold, slot.keys.lock] : [];

// The pointing slot a key holds or locks. A layout position carries the
// keyboard's own name for its keycode, which for a pointing mode is a bare
// user keycode (`QK_USER_16`) or, for a slot the vocabulary does not name at
// all, its hex. So the name the model publishes for it comes first, then the
// number.
/** @param {ViewModel} model @param {string} spelling @param {string} known */
function pointingSlotOf(model, spelling, known) {
    const slots = model?.pdModes || [];
    const named = slots.find((slot) => slot.keys && slotKeycodeNames(slot).includes(known));
    if (named) return named;
    const value = hexValue(spelling);
    return Number.isInteger(value) ? slots.find((slot) => slotKeycodes(slot).includes(value)) : undefined;
}

// Which of a slot's two keycodes this is. Everything else about the mode is
// the same either way, so holding it or locking it on is the only thing a
// route has to carry beyond the slot itself. Any other key holds.
/** @param {string} spelling @param {string} known @param {PointingSlot | undefined} slot @returns {"hold" | "lock"} */
function pointingVariantOf(spelling, known, slot) {
    if (/_LOCK$/.test(known)) return "lock";
    const value = hexValue(spelling);
    return slot && Number.isInteger(value) && slotKeycodes(slot)[1] === value ? "lock" : "hold";
}

// The name a stored value goes by, using the catalogue the keyboard itself
// reported: a macro by its name, a catalogue key by its own, a basic key
// wrapped in modifiers by the wrappers it carries, and otherwise its hex
// rather than a name it cannot prove. Pointing slots store their shortcuts
// as bare numbers, and the profile writer takes them back as these names.
const LEFT_MODS = [MODS.LCTL, MODS.LSFT, MODS.LALT, MODS.LGUI], RIGHT_MODS = [MODS.RCTL, MODS.RSFT, MODS.RALT, MODS.RGUI];
/** @param {ViewModel} model @param {number} code */
export function keycodeName(model, code) {
    if (!code) return "";
    const macro = macroIndex(code);
    if (macro !== null) return macroName(macro);
    const direct = (/** @type {number} */ value) => (model?.qmkKeycodes || []).find((entry) => entry.keycode === value)?.value;
    const exact = direct(code);
    if (exact) return exact;

    // Modifier-wrapped basic keycodes: 0x0100–0x1fff carries the held
    // modifiers in bits 8–12, and bit 12 means they are the right-hand ones.
    // The side flag with no modifier is no name of QMK's, so it stays hex.
    if (inBlock(code, QK.MODS)) {
        const base = direct(keyOf(code));
        const bits = modsOf(code);
        if (base && bits & MOD_BITS) {
            const mods = bits & MOD_RIGHT ? RIGHT_MODS : LEFT_MODS;
            return mods.filter((mod) => bits & mod & MOD_BITS).reduceRight((value, mod) => `${wrapperOf(mod)}(${value})`, base);
        }
    }
    return `0x${code.toString(16).toUpperCase()}`;
}

// The macro slot a stored keycode names (MACRO_n), including the other
// names the writer accepts: the former VIA_MACRO_n, its number, and QMK's own
// names for the first 32 slots, which are the keycode catalog's and so are
// read through the model (keycodeValue).
/** @param {string | number | null | undefined} code @param {ViewModel} [model] */
export function macroIndex(code, model) {
    const text = String(code ?? "").trim();
    const named = macroOfName(text);
    if (named !== undefined) return named;
    const value = /^(?:0x[0-9a-f]+|\d+)$/i.test(text) ? Number(text) : keycodeValue(model, text);
    return value !== undefined && inBlock(value, QK.MACRO) ? value - QK.MACRO.first : null;
}
