// @ts-check
"use strict";

// Resolves the numeric keycodes a device reports into something a person
// recognises, using the vendored catalog rather than a QMK checkout.
//
// A keycode arriving from the keyboard is a bare uint16. Most resolve to a
// catalog entry directly. The rest are parameterised quantum keycodes — layer
// taps, momentary layers, modified keys — where the high bits select a
// behaviour and the low bits carry its arguments. Those are decoded
// structurally so an unknown-but-valid keycode still renders as something
// truthful rather than as a hex number.

const catalog = require("./keycode-catalog.json");
const legacy = require("./keycode-legacy");

const BY_VALUE = new Map(catalog.entries.map((entry) => [entry.value, entry]));
/** @type {Map<string, typeof catalog.entries[number]>} */
const BY_NAME = new Map();
for (const entry of catalog.entries) {
    BY_NAME.set(entry.name, entry);
    for (const alias of entry.aliases) {
        if (!BY_NAME.has(alias)) {
            BY_NAME.set(alias, entry);
        }
    }
}

// QMK's quantum keycode ranges. Kept here rather than derived from the catalog
// because the catalog lists the range markers only as boundaries, which the
// generator deliberately drops.
const LAYER_FORMS = Object.freeze([
    {base: 0x5200, name: "TO", label: "Layer move"},
    {base: 0x5220, name: "MO", label: "Layer hold"},
    {base: 0x5240, name: "DF", label: "Default layer"},
    {base: 0x5260, name: "TG", label: "Layer toggle"},
    {base: 0x5280, name: "OSL", label: "One-shot layer"},
    {base: 0x52c0, name: "TT", label: "Layer tap toggle"},
    {base: 0x52e0, name: "PDF", label: "Persistent default layer"},
]);
const MODIFIERS = [
    {bit: 1, name: "CTL", label: "Ctrl"}, {bit: 2, name: "SFT", label: "Shift"},
    {bit: 4, name: "ALT", label: "Alt"}, {bit: 8, name: "GUI", label: "Cmd"},
];
// Modified-key spellings share QMK's five modifier bits. The picker emits
// short forms (for example G for Cmd), while device readback uses long forms.
const MODIFIER_WRAPPERS = new Map(Object.entries({
    C: 0x01, LCTL: 0x01, S: 0x02, LSFT: 0x02,
    A: 0x04, LALT: 0x04, LOPT: 0x04,
    G: 0x08, LGUI: 0x08, LCMD: 0x08, LWIN: 0x08,
    LCS: 0x03, LCA: 0x05, LCG: 0x09, LSA: 0x06, LSG: 0x0a, LAG: 0x0c,
    LCSG: 0x0b, LCAG: 0x0d, LSAG: 0x0e, MEH: 0x07, HYPR: 0x0f,
    RCTL: 0x11, RSFT: 0x12, RALT: 0x14, ALGR: 0x14, ROPT: 0x14,
    RGUI: 0x18, RCMD: 0x18, RWIN: 0x18,
    RCS: 0x13, RCA: 0x15, RCG: 0x19, RSA: 0x16, RSG: 0x1a, RAG: 0x1c,
    RCSG: 0x1b, RCAG: 0x1d, RSAG: 0x1e,
}));

/** @param {number} bits */
function modifiers(bits) {
    const side = bits & 0x10 ? "R" : "L";
    return MODIFIERS.filter(mod => bits & mod.bit).map(mod => ({
        name: side + mod.name, label: (side === "R" ? "Right " : "") + mod.label,
    }));
}

/** @param {number} value @returns {import("./types.js").ResolvedKeycode} */
function resolve(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
        return unknown(value);
    }

    const direct = BY_VALUE.get(value);
    if (direct) {
        return {
            value,
            name: direct.name,
            label: direct.label,
            group: direct.group,
            kind: "basic",
            known: true,
        };
    }

    const layered = resolveLayerKeycode(value);
    if (layered) {
        return layered;
    }

    const tap = resolveTapHold(value);
    if (tap) {
        return tap;
    }

    if (value >= 0x0100 && value <= 0x1fff) {
        const key = BY_VALUE.get(value & 0xff);
        const mods = modifiers((value >> 8) & 0x1f);
        if (key && mods.length) return {
            value, name: mods.reduceRight((name, mod) => `${mod.name}(${name})`, key.name),
            label: [...mods.map(mod => mod.label), key.label].join("+"),
            group: "modifiers", kind: "modified", known: true,
        };
    }
    if (value >= 0x52a0 && value <= 0x52bf) {
        const mods = modifiers(value & 0x1f);
        if (mods.length) return {
            value, name: `OSM(${mods.map(mod => `MOD_${mod.name}`).join("|")})`,
            label: `One-shot ${mods.map(mod => mod.label).join("+")}`,
            group: "modifiers", kind: "one-shot-mod", known: true,
        };
    }
    // LM(layer, mods): a layer hold with its modifiers held too.
    if (value >= 0x5000 && value <= 0x51ff) {
        const layer = (value >> 5) & 0x0f;
        const mods = modifiers(value & 0x1f);
        if (mods.length) return {
            value, name: `LM(${layer},${mods.map(mod => `MOD_${mod.name}`).join("|")})`,
            label: `Layer ${layer} + ${mods.map(mod => mod.label).join("+")}`,
            group: "layer", kind: "layer-mod", layer, known: true,
        };
    }

    return unknown(value);
}

// MO/TG/OSL/TO carry the layer in the low bits of a fixed base.
/** @param {number} value @returns {import("./types.js").ResolvedKeycode | undefined} */
function resolveLayerKeycode(value) {
    for (const form of LAYER_FORMS) {
        const layer = value - form.base;
        if (layer >= 0 && layer < 32) {
            return {
                value,
                name: `${form.name}(${layer})`,
                label: `${form.label} ${layer}`,
                group: "layer",
                kind: "layer",
                layer,
                known: true,
            };
        }
    }
    return undefined;
}

// LT(layer, kc) and mod-tap share a shape: a behaviour in the high nibble, a
// basic keycode in the low byte.
/** @param {number} value @returns {import("./types.js").ResolvedKeycode | undefined} */
function resolveTapHold(value) {
    const tapped = BY_VALUE.get(value & 0xff);
    if (!tapped) return undefined;
    if ((value & 0xf000) === 0x4000) {
        const argument = (value >> 8) & 0x0f;
        return {
            value,
            name: `LT(${argument},${tapped.name})`,
            label: `${tapped.label} / layer ${argument}`,
            group: "layer",
            kind: "layer-tap",
            layer: argument,
            tap: tapped.name,
            known: true,
        };
    }
    if ((value & 0xe000) !== 0x2000) return undefined;
    const mods = modifiers((value >> 8) & 0x1f);
    if (!mods.length) return undefined;
    return {
        value,
        name: `MT(${mods.map(mod => `MOD_${mod.name}`).join("|")},${tapped.name})`,
        label: `${tapped.label} / ${mods.map(mod => mod.label).join("+")}`,
        group: "modifiers",
        kind: "mod-tap",
        tap: tapped.name,
        known: true,
    };
}

/** @param {number} value @returns {import("./types.js").ResolvedKeycode} */
function unknown(value) {
    const hex = Number.isInteger(value) ? `0x${(value >>> 0).toString(16).toUpperCase().padStart(4, "0")}` : String(value);
    return {value, name: hex, label: hex, group: "unknown", kind: "unknown", known: false};
}

// The inverse of resolve(): turn an authored expression back into the uint16
// the device stores. Returns undefined rather than guessing, so a caller can
// refuse the write instead of sending a wrong keycode to the keyboard.
/** @param {unknown} expression @returns {number | undefined} */
function encode(expression) {
    const text = String(expression || "").trim();
    if (!text) {
        return undefined;
    }

    const direct = BY_NAME.get(text);
    if (direct) {
        return direct.value;
    }
    // QMK's other spellings: a name QMK compiles to an expression, a
    // mod-tap shorthand, a deprecated wrapper (keycode-legacy.js).
    if (Object.hasOwn(legacy.NAMES, text)) return encode(legacy.NAMES[text]);
    const shorthand = text.match(/^([A-Z_]+)\(\s*(.+?)\s*\)$/);
    if (shorthand && Object.hasOwn(legacy.MOD_TAP_SHORTHANDS, shorthand[1])) return encode(`MT(${legacy.MOD_TAP_SHORTHANDS[shorthand[1]]}, ${shorthand[2]})`);
    if (shorthand && Object.hasOwn(legacy.WRAPPER_ALIASES, shorthand[1])) return encode(`${legacy.WRAPPER_ALIASES[shorthand[1]]}(${shorthand[2]})`);

    const layerForm = text.match(/^(MO|TG|OSL|TO|DF|TT|PDF)\(\s*(\d+)\s*\)$/);
    if (layerForm) {
        const layer = Number(layerForm[2]);
        const form = LAYER_FORMS.find(form => form.name === layerForm[1]);
        return layer < 32 && form ? form.base + layer : undefined;
    }

    const wrapper = text.match(/^([A-Z]+)\(\s*(.+)\s*\)$/);
    const modifier = wrapper ? MODIFIER_WRAPPERS.get(wrapper[1]) : undefined;
    if (wrapper && modifier !== undefined) {
        const key = encode(wrapper[2]);
        if (key === undefined || key > 0x1fff) return undefined;
        const bits = combineModifiers((key >> 8) & 0x1f, modifier);
        return bits === undefined ? undefined : (key & 0xff) | (bits << 8);
    }
    // A mod-tap or layer-tap taps a plain key (0x00-0xFF), by any name.
    const modTap = text.match(/^MT\(\s*([^,]+)\s*,\s*([A-Za-z0-9_]+)\s*\)$/);
    if (modTap) {
        const bits = encodeModifiers(modTap[1]);
        const tapped = plainKey(modTap[2]);
        return bits !== undefined && tapped !== undefined ? 0x2000 | (bits << 8) | tapped : undefined;
    }
    const oneshot = text.match(/^OSM\(\s*(.+)\s*\)$/);
    if (oneshot) {
        const bits = encodeModifiers(oneshot[1]);
        return bits === undefined ? undefined : 0x52a0 | bits;
    }

    const layerMod = text.match(/^LM\(\s*(\d+)\s*,\s*(.+)\s*\)$/);
    if (layerMod) {
        const layer = Number(layerMod[1]);
        const bits = encodeModifiers(layerMod[2]);
        return layer < 16 && bits ? 0x5000 | (layer << 5) | bits : undefined;
    }

    const layerTap = text.match(/^LT\(\s*(\d+)\s*,\s*([A-Za-z0-9_]+)\s*\)$/);
    if (layerTap) {
        const layer = Number(layerTap[1]);
        const tapped = plainKey(layerTap[2]);
        if (layer < 16 && tapped !== undefined) {
            return 0x4000 | (layer << 8) | tapped;
        }
        return undefined;
    }

    const hex = text.match(/^0[xX]([0-9a-fA-F]{1,4})$/);
    if (hex) {
        return Number.parseInt(hex[1], 16);
    }

    return undefined;
}

/** @param {string} name */
function plainKey(name) {
    const value = BY_NAME.get(name)?.value ?? (Object.hasOwn(legacy.NAMES, name) ? encode(legacy.NAMES[name]) : undefined);
    return value !== undefined && value <= 0xff ? value : undefined;
}

/** @param {string} expression */
function encodeModifiers(expression) {
    let bits = 0;
    for (const part of expression.split("|")) {
        const match = part.trim().match(/^MOD_([LR])(CTL|SFT|ALT|GUI)$/);
        if (!match) return undefined;
        const modifier = MODIFIERS.find(mod => mod.name === match[2]);
        if (!modifier) return undefined;
        const combined = combineModifiers(bits, modifier.bit | (match[1] === "R" ? 0x10 : 0));
        if (combined === undefined) return undefined;
        bits = combined;
    }
    return bits;
}

// QMK has one side flag for every modifier in a compact keycode. Combining
// left and right masks would silently move all of them to the right.
/** @param {number} before @param {number} added @returns {number | undefined} */
function combineModifiers(before, added) {
    return (before & 0x0f) && (added & 0x0f) && ((before ^ added) & 0x10)
        ? undefined : before | added;
}

/** @param {string} name */
function lookup(name) {
    return BY_NAME.get(name);
}

// QMK's alias table: every name and alias mapping to its canonical keycode
// name, built from the vendored catalog.
function aliasTable() {
    /** @type {Record<string, string>} */
    const aliases = {};
    for (const entry of catalog.entries) {
        aliases[entry.name] = entry.name;
    }
    for (const entry of catalog.entries) {
        for (const alias of entry.aliases) {
            if (!aliases[alias]) {
                aliases[alias] = entry.name;
            }
        }
    }
    // QMK's other names for a catalogued key (KC_BTN1 is MS_BTN1).
    for (const [alias, target] of Object.entries(legacy.NAMES)) {
        const entry = BY_NAME.get(target);
        if (entry && !aliases[alias]) aliases[alias] = entry.name;
    }
    aliases._______ = "_______";
    aliases.XXXXXXX = "XXXXXXX";
    return aliases;
}

function entries() {
    return catalog.entries;
}

function metadata() {
    return {
        format: catalog.format,
        qmkVersion: catalog.qmkVersion,
        keycodeCount: catalog.entries.length,
    };
}

module.exports = {aliasTable, combineModifiers, encode, entries, lookup, metadata, resolve};
