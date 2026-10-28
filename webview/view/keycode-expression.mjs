// @ts-check
// Whether the draft will take a key expression, asked before it is posted.
//
// The draft stores a layout key through the catalogue's encoder
// (core/data/keycode-catalog.js encode, then the keyboard's own blocks) and
// refuses a layer keycode the keyboard does not run (core/schema/actions.js
// placementProblem). This mirrors those rules over what the model publishes —
// the catalogue's values and aliases, QMK's other spellings, the layers — so
// the picker never enables Use key for something the draft would refuse, and
// a typed expression reads as what it stores. tests/view/keycode-expression
// holds it to the core encoder, expression by expression.

/** @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model */

// QMK's keycode layout and the keyboard's own blocks, as core/data/
// qmk-keycodes.js and core/data/user-keycodes.js have them: the interface may
// not import core, so tests/view/keycode-layout-drift.test.mjs pins each.
/** @param {number} first @param {number} last */
const block = (first, last) => Object.freeze({first, last});
export const QK = Object.freeze({
    BASIC: block(0x0000, 0x00ff),
    MODS: block(0x0100, 0x1fff),
    MOD_TAP: block(0x2000, 0x3fff),
    LAYER_TAP: block(0x4000, 0x4fff),
    LAYER_MOD: block(0x5000, 0x51ff),
    ONE_SHOT_MOD: block(0x52a0, 0x52bf),
    DEF_LAYER: block(0x5240, 0x525f),
    PERSISTENT_DEF_LAYER: block(0x52e0, 0x52ff),
    MACRO: block(0x7700, 0x777f),
});
/** @param {number} code @param {{first: number, last: number}} range */
export const inBlock = (code, {first, last}) => code >= first && code <= last;
// The layer keycodes with their layer in the low five bits.
export const LAYER_FORMS = Object.freeze({TO: 0x5200, MO: 0x5220, DF: 0x5240, TG: 0x5260, OSL: 0x5280, TT: 0x52c0, PDF: 0x52e0});
/** @param {number} code */
const isLayerForm = (code) => /** @type {readonly number[]} */ (Object.values(LAYER_FORMS)).includes(code & ~0x1f);
// QMK's five modifier bits, and every wrapper spelling with the bits it adds.
export const MODS = Object.freeze({LCTL: 0x01, LSFT: 0x02, LALT: 0x04, LGUI: 0x08, RCTL: 0x11, RSFT: 0x12, RALT: 0x14, RGUI: 0x18});
export const MOD_RIGHT = 0x10;
/** @type {Readonly<Record<string, number>>} */
export const MODIFIER_WRAPPERS = Object.freeze({
    C: 0x01, LCTL: 0x01, S: 0x02, LSFT: 0x02,
    A: 0x04, LALT: 0x04, LOPT: 0x04,
    G: 0x08, LGUI: 0x08, LCMD: 0x08, LWIN: 0x08,
    LCS: 0x03, LCA: 0x05, LCG: 0x09, LSA: 0x06, LSG: 0x0a, LAG: 0x0c,
    LCSG: 0x0b, LCAG: 0x0d, LSAG: 0x0e, MEH: 0x07, HYPR: 0x0f,
    RCTL: 0x11, RSFT: 0x12, RALT: 0x14, ALGR: 0x14, ROPT: 0x14,
    RGUI: 0x18, RCMD: 0x18, RWIN: 0x18,
    RCS: 0x13, RCA: 0x15, RCG: 0x19, RSA: 0x16, RSG: 0x1a, RAG: 0x1c,
    RCSG: 0x1b, RCAG: 0x1d, RSAG: 0x1e,
});
/** @param {number} mods The first wrapper spelling for these modifier bits: C, S, A, G, RCTL, … for one. */
export const wrapperOf = (mods) => Object.keys(MODIFIER_WRAPPERS).find((name) => MODIFIER_WRAPPERS[name] === mods);
export const LAYER_LOCK_BASE = 0x7ec0, LAYER_LOCKS = 16;

// The macro slot a name reaches: MACRO_n, or VIA_MACRO_n, the name before
// firmware D-F31 dropped VIA, so a name typed the old way still reaches its
// macro (core/schema/compiled-profile-v1.js reads both too). Ark only ever
// shows MACRO_n.
/** @param {string} name */
export const macroOfName = (name) => {
    const match = /^(?:MACRO_|VIA_MACRO_)(\d+)$/.exec(name);
    return match && Number(match[1]) < 128 ? Number(match[1]) : undefined;
};

/** @param {Record<string, number>} table @param {string} name */
const own = (table, name) => Object.hasOwn(table, name) ? table[name] : undefined;

// QMK keeps one side flag for all of a compact keycode's modifiers.
/** @param {number} before @param {number} added */
const combine = (before, added) => (before & 0x0f) && (added & 0x0f) && ((before ^ added) & MOD_RIGHT) ? undefined : before | added;

/** @param {string} text */
function modifierBits(text) {
    let bits = 0;
    for (const part of text.split("|")) {
        const match = part.trim().match(/^MOD_([LR](?:CTL|SFT|ALT|GUI))$/);
        if (!match) return undefined;
        const next = combine(bits, MODS[/** @type {keyof typeof MODS} */ (match[1])]);
        if (next === undefined) return undefined;
        bits = next;
    }
    return bits;
}

// The catalogue's names, aliases and the keyboard's own keys, by name.
/** @type {WeakMap<object, Map<string, number>>} */
const NAMES = new WeakMap();
/** @param {Model} model */
function namesOf(model) {
    const entries = model?.qmkKeycodes || [];
    const known = NAMES.get(entries);
    if (known) return known;
    /** @type {Map<string, number>} */
    const names = new Map();
    for (const entry of entries) {
        names.set(entry.value, entry.keycode);
        if (entry.name) names.set(entry.name, entry.keycode);
    }
    for (const entry of entries) for (const alias of entry.aliases || []) if (!names.has(alias)) names.set(alias, entry.keycode);
    for (const [alias, canonical] of Object.entries(model?.qmkKeycodeAliases || {})) if (!names.has(alias) && names.has(canonical)) names.set(alias, /** @type {number} */ (names.get(canonical)));
    names.set("_______", names.get("KC_TRANSPARENT") ?? 1);
    names.set("XXXXXXX", names.get("KC_NO") ?? 0);
    NAMES.set(entries, names);
    return names;
}

/** @param {unknown} value */
export const normalizeExpression = (value) => String(value ?? "").replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

// The keycode an expression stores, or undefined where the draft refuses it.
/** @param {Model} model @param {unknown} expression @returns {number | undefined} */
export function keycodeValue(model, expression) {
    const text = normalizeExpression(expression);
    if (!text) return undefined;
    const names = namesOf(model);
    const direct = names.get(text);
    if (direct !== undefined) return direct;
    const spellings = model?.qmkSpellings;
    if (spellings && Object.hasOwn(spellings.names, text)) return keycodeValue(model, spellings.names[text]);
    const macro = macroOfName(text);
    if (macro !== undefined) return QK.MACRO.first + macro;
    let match = text.match(/^0x([0-9a-f]{1,4})$/i);
    if (match) return Number.parseInt(match[1], 16);
    if (/^\d+$/.test(text)) return Number(text) <= 0xffff ? Number(text) : undefined;
    const call = text.match(/^([A-Z][A-Z0-9_]*)\((.*)\)$/);
    if (!call) return undefined;
    const [, name, inner] = call;
    if (spellings && Object.hasOwn(spellings.modTaps, name)) return keycodeValue(model, `MT(${spellings.modTaps[name]}, ${inner})`);
    if (spellings && Object.hasOwn(spellings.wrappers, name)) return keycodeValue(model, `${spellings.wrappers[name]}(${inner})`);
    const base = own(LAYER_FORMS, name);
    if (base !== undefined) {
        if (!/^\d+$/.test(inner)) return undefined;
        return Number(inner) < 32 ? base + Number(inner) : undefined;
    }
    if (name === "LOCK_LAYER") return /^\d+$/.test(inner) && Number(inner) < LAYER_LOCKS ? LAYER_LOCK_BASE + Number(inner) : undefined;
    const wrapper = own(MODIFIER_WRAPPERS, name);
    if (wrapper !== undefined) {
        const key = keycodeValue(model, inner);
        if (key === undefined || key > QK.MODS.last) return undefined;
        const bits = combine((key >> 8) & 0x1f, wrapper);
        return bits === undefined ? undefined : (key & 0xff) | (bits << 8);
    }
    const args = inner.split(",").map((part) => part.trim());
    if (name === "MT" && args.length === 2) {
        const bits = modifierBits(args[0]), tap = plainKey(model, args[1]);
        return bits !== undefined && tap !== undefined ? QK.MOD_TAP.first | (bits << 8) | tap : undefined;
    }
    if (name === "LT" && args.length === 2) {
        const tap = plainKey(model, args[1]);
        return /^\d+$/.test(args[0]) && Number(args[0]) < 16 && tap !== undefined ? QK.LAYER_TAP.first | (Number(args[0]) << 8) | tap : undefined;
    }
    if (name === "OSM" && args.length === 1) {
        const bits = modifierBits(args[0]);
        return bits === undefined ? undefined : QK.ONE_SHOT_MOD.first | bits;
    }
    if (name === "LM" && args.length === 2) {
        const bits = modifierBits(args[1]);
        return /^\d+$/.test(args[0]) && Number(args[0]) < 16 && bits ? QK.LAYER_MOD.first | (Number(args[0]) << 5) | bits : undefined;
    }
    return undefined;
}

// A mod-tap or layer-tap taps a plain key (0x00–0xFF), by one name.
/** @param {Model} model @param {string} name */
function plainKey(model, name) {
    if (!/^[A-Za-z0-9_]+$/.test(name)) return undefined;
    const value = namesOf(model).get(name) ?? (model?.qmkSpellings && Object.hasOwn(model.qmkSpellings.names, name) ? keycodeValue(model, model.qmkSpellings.names[name]) : undefined);
    return value !== undefined && value <= QK.BASIC.last ? value : undefined;
}

// Whether a keycode is a plain key, the only kind a tap with a hold can send.
/** @param {Model} model @param {string} expression */
export const isPlainKey = (model, expression) => {
    const value = keycodeValue(model, expression);
    return value !== undefined && value <= QK.BASIC.last;
};

// Whether modifiers can wrap a keycode: a plain or already-modified key.
/** @param {Model} model @param {string} expression */
export const takesModifiers = (model, expression) => {
    const value = keycodeValue(model, expression);
    return value !== undefined && value <= QK.MODS.last;
};

// What is wrong with a layout key expression, in words, or "" when the draft
// takes it. Layer keycodes are checked as the keyboard checks a saved profile:
// a layer it has, and never DF() or PDF(). A one-shot modifier sits among the
// layer forms but holds modifiers, not a layer.
/** @param {Model} model @param {string} expression */
export function keyProblem(model, expression) {
    const text = normalizeExpression(expression);
    if (!text) return "Choose a key.";
    const code = keycodeValue(model, text);
    if (code === undefined) return `${text} is not a key this keyboard can store.`;
    const layers = model?.layers?.length || 16;
    if (inBlock(code, QK.DEF_LAYER) || inBlock(code, QK.PERSISTENT_DEF_LAYER)) return "DF() and PDF() change the default layer, which this keyboard keeps to itself. Use Move to, Hold or Lock.";
    const layer = inBlock(code, QK.LAYER_TAP) ? (code >> 8) & 0x0f
        : inBlock(code, QK.LAYER_MOD) ? (code >> 5) & 0x0f
        : isLayerForm(code) ? code & 0x1f
        : inBlock(code, {first: LAYER_LOCK_BASE, last: LAYER_LOCK_BASE + LAYER_LOCKS - 1}) ? code - LAYER_LOCK_BASE : undefined;
    if (layer !== undefined && layer >= layers) return `This keyboard has ${layers} layers, numbered 0–${layers - 1}.`;
    return "";
}

// What is wrong with a combo output expression, or "" when the draft takes it:
// what a layout key takes, less KC_NO, which would send nothing, and Tap-hold
// (LT), which decides tap or hold on a key of its own and so is never a combo's
// output (core/schema/actions.js placementProblem, comboOutput).
/** @param {Model} model @param {string} expression */
export function comboOutputProblem(model, expression) {
    const problem = keyProblem(model, expression);
    if (problem) return problem;
    const code = /** @type {number} */ (keycodeValue(model, expression));
    if (code === 0) return "A combo has to send something. Choose a key.";
    return inBlock(code, QK.LAYER_TAP) ? "A combo can't send Tap-hold: it decides tap or hold on a key of its own. Send Hold or the key instead." : "";
}
