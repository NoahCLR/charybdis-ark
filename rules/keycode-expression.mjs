// @ts-check

// QMK key expressions (KC_A, LCTL(KC_A), MT(MOD_LSFT, KC_A), LT(1, KC_A),
// MO(2), 0x0004), read into the keycode they store, in one grammar (D-L73).
// Two readers use it, each a dialect, their differences listed in DIALECTS:
// - qmk: QMK's own grammar over the keycode catalog's names, which
//   core's encoder reads (core/schema/keycodes.js encode);
// - keyboard: that grammar and this keyboard's own names (MACRO_n,
//   LOCK_LAYER(n), custom and pointing keys, a layer by name), with
//   whitespace anywhere. The draft stores a key by it
//   (core/schema/compiled-profile-v1.js), and the interface's picker checks a
//   key by it before posting (webview/view/keycode-expression.mjs), so the two
//   accept the same keys.
// What a reader knows of names it passes in as `tables`.

import {QK, LAYER_FORMS, LAYER_FORM_LAYERS, MOD_NAMES, MODIFIER_WRAPPERS, PACKED_LAYERS, combineModifiers, keyOf, layerMod, layerTap,
    macroOfName, modTap, modified, modsOf, oneShotMod} from "./qmk-keycodes.mjs";

/**
 * @typedef {object} ExpressionTables
 * @property {(name: string) => number | undefined} names The keycode a name stores: the catalog's names and aliases, and whatever else the reader knows by name.
 * @property {{names: Readonly<Record<string, string>>, modTaps: Readonly<Record<string, string>>, wrappers: Readonly<Record<string, string>>}} [spellings] QMK's other spellings: a name as the expression it compiles to, a mod-tap shorthand's modifiers, a deprecated wrapper's spelling.
 * @property {(name: string) => number | undefined} [more] Names read after a macro's: the keyboard's custom and pointing keys.
 * @property {readonly ({name?: string} | null | undefined)[]} [layers] The profile's layers, for a layer taken by its name.
 * @property {{first: number, count: number}} [layerLocks] The keyboard's layer-lock block, LOCK_LAYER(n).
 */
/** @typedef {'wrapper' | 'spelled' | 'oneShot' | 'layer' | 'lock' | 'MT' | 'LT' | 'LM'} CallKind */
/**
 * @typedef {object} Dialect
 * @property {(text: string) => string} normalize How the reader tidies whitespace before it reads.
 * @property {(text: string) => {value: number | undefined} | undefined} number A number, when the text is one: its keycode, or undefined past 0xFFFF.
 * @property {boolean} spellings Whether QMK's other spellings are read.
 * @property {boolean} macros Whether MACRO_n and VIA_MACRO_n are read.
 * @property {Readonly<Record<string, number>>} layerForms The layer forms read, by name, with their base.
 * @property {(text: string, tables: ExpressionTables) => number | undefined} layer A layer argument.
 * @property {boolean} layerLocks Whether LOCK_LAYER(n) is read.
 * @property {Readonly<Record<string, number>>} wrappers The modifier wrappers read, with their bits.
 * @property {(text: string) => number | undefined} modifiers A MOD_… list.
 * @property {boolean} layerMod Whether LM() is read.
 * @property {(inner: string, kind: CallKind) => string[] | undefined} args A call's arguments, or undefined where the reader refuses their shape.
 */

const LINE_BREAK = /[\n\r\u2028\u2029]/;
const DIGITS = /^\d+$/;
const CALL = /^([A-Z][A-Z0-9_]*)\(([\s\S]*)\)$/;

// A call's name and the text between its parentheses, or undefined.
/** @param {string} text */
export function callParts(text) {
    const match = CALL.exec(text);
    return match ? {name: match[1], inner: match[2]} : undefined;
}

// A call's arguments, split at the commas outside parentheses, each tidied
// with `normalize`; none for unbalanced parentheses.
/** @param {string} inner @param {(text: string) => string} normalize */
export function splitArguments(inner, normalize) {
    const parts = [];
    let depth = 0, start = 0;
    for (let index = 0; index < inner.length; index += 1) {
        if (inner[index] === "(") depth += 1;
        if (inner[index] === ")") depth -= 1;
        if (depth < 0) return [];
        if (inner[index] === "," && depth === 0) {
            parts.push(normalize(inner.slice(start, index)));
            start = index + 1;
        }
    }
    if (depth !== 0) return [];
    parts.push(normalize(inner.slice(start)));
    return parts;
}

// The keyboard dialect's tidy form, which the picker also shows: one space
// between words, ", " between arguments and none inside the parentheses.
/** @param {unknown} value */
export const normalizeExpression = (value) => String(value ?? "").replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
/** @param {string} text */
const tightExpression = (text) => text.replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim();

// QMK's MOD_ names, each a whole part of a | list.
/** @param {string} text */
function strictModifiers(text) {
    let bits = 0;
    for (const part of text.split("|")) {
        const name = part.trim();
        if (!Object.hasOwn(MOD_NAMES, name)) return undefined;
        const next = combineModifiers(bits, MOD_NAMES[name]);
        if (next === undefined) return undefined;
        bits = next;
    }
    return bits;
}
/** @param {string} text */
const digitLayer = (text) => DIGITS.test(text) ? Number(text) : undefined;
/** @param {string} text @param {ExpressionTables} tables */
function namedLayer(text, tables) {
    const expression = tightExpression(text);
    if (DIGITS.test(expression)) return Number(expression);
    const index = (tables.layers || []).findIndex((layer) => layer?.name === expression);
    return index < 0 ? undefined : index;
}

/** @param {string} inner @param {number} count */
const commaParts = (inner, count) => {
    const parts = inner.split(",").map((part) => part.trim());
    return parts.length === count ? parts : undefined;
};

/** @type {Readonly<Record<'qmk' | 'keyboard', Dialect>>} */
export const DIALECTS = Object.freeze({
    qmk: Object.freeze(/** @satisfies {Dialect} */ ({
        normalize: (text) => text.trim(),
        // Hex, one to four digits.
        number: (text) => {
            const hex = text.match(/^0[xX]([0-9a-fA-F]{1,4})$/);
            return hex ? {value: Number.parseInt(hex[1], 16)} : undefined;
        },
        spellings: true,
        macros: false,
        layerForms: LAYER_FORMS,
        layer: digitLayer,
        layerLocks: false,
        wrappers: MODIFIER_WRAPPERS,
        modifiers: strictModifiers,
        layerMod: true,
        // A line break may stand only at the edges of an argument, or among
        // MT()'s modifiers; an argument holding one is refused.
        args(inner, kind) {
            if (kind === "wrapper" || kind === "spelled" || kind === "oneShot") {
                const text = inner.trim();
                return text && !LINE_BREAK.test(text) ? [text] : undefined;
            }
            if (kind === "layer") return DIGITS.test(inner.trim()) ? [inner.trim()] : undefined;
            if (kind === "MT") {
                const parts = inner.split(",");
                return parts.length === 2 && parts[0].length > 0 ? [parts[0], parts[1].trim()] : undefined;
            }
            if (kind === "LT") {
                const parts = inner.split(",");
                return parts.length === 2 && DIGITS.test(parts[0].trim()) ? [parts[0].trim(), parts[1].trim()] : undefined;
            }
            if (kind === "LM") {
                const comma = inner.indexOf(",");
                if (comma < 0) return undefined;
                const layer = inner.slice(0, comma).trim(), mods = inner.slice(comma + 1).trim();
                return DIGITS.test(layer) && mods && !LINE_BREAK.test(mods) ? [layer, mods] : undefined;
            }
            return undefined;
        },
    })),
    keyboard: Object.freeze(/** @satisfies {Dialect} */ ({
        normalize: normalizeExpression,
        // Hex, one to four digits.
        number: (text) => {
            const hex = text.match(/^0x([0-9a-f]{1,4})$/i);
            return hex ? {value: Number.parseInt(hex[1], 16)} : undefined;
        },
        spellings: true,
        macros: true,
        layerForms: LAYER_FORMS,
        // A layer by its number, or by its name where the reader knows the
        // profile's layers (core's own messages name them "Layer n").
        layer: namedLayer,
        layerLocks: true,
        wrappers: MODIFIER_WRAPPERS,
        modifiers: strictModifiers,
        layerMod: true,
        args(inner, kind) {
            if (kind === "wrapper" || kind === "spelled" || kind === "layer" || kind === "lock") return [inner];
            return commaParts(inner, kind === "oneShot" ? 1 : 2);
        },
    })),
});

/** @param {Readonly<Record<string, unknown>>} table @param {string} name */
const has = (table, name) => Object.hasOwn(table, name);

/**
 * The keycode an expression stores, read in `dialect` with what `tables`
 * knows by name, or undefined where that reader refuses it.
 * @param {string} expression @param {ExpressionTables} tables @param {Dialect} dialect @returns {number | undefined}
 */
export function encodeExpression(expression, tables, dialect) {
    const read = (/** @type {string} */ text) => encodeExpression(text, tables, dialect);
    const text = dialect.normalize(expression);
    if (!text) return undefined;
    const number = dialect.number(text);
    if (number) return number.value;
    const named = tables.names(text);
    if (named !== undefined) return named;
    const spellings = dialect.spellings ? tables.spellings : undefined;
    if (spellings && has(spellings.names, text)) return read(spellings.names[text]);
    if (dialect.macros) {
        const macro = macroOfName(text);
        if (macro !== undefined) return QK.MACRO.first + macro;
    }
    const more = tables.more?.(text);
    if (more !== undefined) return more;

    const call = callParts(text);
    if (!call) return undefined;
    const {name, inner} = call;
    /** @param {CallKind} kind */
    const args = (kind) => dialect.args(inner, kind);
    if (spellings && (has(spellings.modTaps, name) || has(spellings.wrappers, name))) {
        const [arg] = args("spelled") ?? [];
        if (arg === undefined) return undefined;
        return has(spellings.modTaps, name) ? read(`MT(${spellings.modTaps[name]}, ${arg})`) : read(`${spellings.wrappers[name]}(${arg})`);
    }
    if (has(dialect.layerForms, name)) {
        const [arg] = args("layer") ?? [];
        const layer = arg === undefined ? undefined : dialect.layer(arg, tables);
        return layer === undefined || layer >= LAYER_FORM_LAYERS ? undefined : dialect.layerForms[name] + layer;
    }
    if (name === "LOCK_LAYER" && dialect.layerLocks && tables.layerLocks) {
        const [arg] = args("lock") ?? [];
        const layer = arg === undefined ? undefined : dialect.layer(arg, tables);
        return layer === undefined || layer >= tables.layerLocks.count ? undefined : tables.layerLocks.first + layer;
    }
    // A modifier wrapper only applies to a basic or already-modified key
    // (QK_MODS, up to 0x1FFF). Anything above would OR the modifier bits into
    // an unrelated keycode, e.g. C(MACRO_3) into a macro without Ctrl.
    if (has(dialect.wrappers, name)) {
        const [arg] = args("wrapper") ?? [];
        const key = arg === undefined ? undefined : read(arg);
        if (key === undefined || key > QK.MODS.last) return undefined;
        const bits = combineModifiers(modsOf(key), dialect.wrappers[name]);
        return bits === undefined ? undefined : modified(bits, keyOf(key));
    }
    // A mod-tap or layer-tap taps a basic key; LT() has four layer bits, so
    // layer 16 and up would spill into TO(), MO() and QK_BOOTLOADER.
    if (name === "MT") {
        const parts = args("MT");
        if (!parts) return undefined;
        const bits = dialect.modifiers(parts[0]), tap = tapOf(parts[1], tables, dialect);
        return bits !== undefined && tap !== undefined ? modTap(bits, tap) : undefined;
    }
    if (name === "LT") {
        const parts = args("LT");
        if (!parts) return undefined;
        const layer = dialect.layer(parts[0], tables), tap = tapOf(parts[1], tables, dialect);
        return layer !== undefined && layer < PACKED_LAYERS && tap !== undefined ? layerTap(layer, tap) : undefined;
    }
    if (name === "OSM") {
        const [arg] = args("oneShot") ?? [];
        const bits = arg === undefined ? undefined : dialect.modifiers(arg);
        return bits === undefined ? undefined : oneShotMod(bits);
    }
    if (name === "LM" && dialect.layerMod) {
        const parts = args("LM");
        if (!parts) return undefined;
        const layer = dialect.layer(parts[0], tables), bits = dialect.modifiers(parts[1]);
        return layer !== undefined && layer < PACKED_LAYERS && bits ? layerMod(layer, bits) : undefined;
    }
    return undefined;
}

// What MT() or LT() taps: a basic key (0x00–0xFF), by one name.
/** @param {string} text @param {ExpressionTables} tables @param {Dialect} dialect */
function tapOf(text, tables, dialect) {
    if (!/^[A-Za-z0-9_]+$/.test(text)) return undefined;
    const spellings = dialect.spellings ? tables.spellings : undefined;
    const value = tables.names(text) ?? (spellings && has(spellings.names, text) ? encodeExpression(spellings.names[text], tables, dialect) : undefined);
    return value !== undefined && value <= QK.BASIC.last ? value : undefined;
}
