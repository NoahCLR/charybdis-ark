// @ts-check
"use strict";

// The name a key reads by, in one profile (D-L33). The vendored catalogue names
// what QMK ships; the profile names the rest: a macro or custom key by its
// name, a pointing-mode key by its slot, a bare user slot by the behaviour
// target it stands for.
// The screens (session/device-model.js) and the review (model/profile-review.js)
// both ask here, so one key never reads "Dragscroll · hold" on one and
// "User 16" on the other.
//
// A layer is named by its name wherever a key is named: MO(3) reads "Hold
// Navigation" and LT(3,KC_SLASH) "/ / Navigation". Only the raw keycode, where
// a screen shows one, keeps the number.

const {VOCABULARY} = require("./vocabulary");
const {PD_SLOT_BINDINGS} = require("../data/pd-bindings");
const {CUSTOM_KEY_SLOTS, customKeyCode, layerLockOfCode} = require("../data/user-keycodes");
const keycodes = require("../data/keycode-catalog");
const {actionName} = require("../schema/actions");
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {resolveNativeQmkExpression} = require("../schema/compiled-profile-v1");
const {layerName, slotName} = require("./vocabulary");
const {hostLayout, US_HOST_LAYOUT} = require("../data/host-layouts");

// What a layer key does to its layer, in the picker's words. TG is a lock on
// this firmware (firmware D-F46).
/** @type {Readonly<Record<string, string>>} */
const LAYER_VERBS = {MO: "Hold", TG: "Lock", LOCK_LAYER: "Lock", TT: "Tap-toggle", OSL: "One-shot", TO: "Move to", DF: "Default", PDF: "Default"};
const LAYER_KEY = /^(MO|TG|TT|OSL|TO|DF|PDF|LOCK_LAYER)\((\d+)\)$/;

// LOCK_LAYER(2) → "Lock layer 2".
/** @param {string} semantic */
function semanticLabel(semantic) {
    const [, name, args] = /^([A-Z][A-Z0-9_]*)(?:\((.*)\))?$/.exec(semantic) || [, semantic, undefined];
    const words = name.replace(/_/g, " ").toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1) + (args === undefined ? "" : ` ${args.replace(/\s+/g, "")}`);
}

/**
 * What one profile renames, over the catalogue.
 *
 *   labels    keycode name → label, under the stored name and the profile's own
 *   aliases   stored name → the profile's name for it (QK_USER_16 → PD_SLOT_0)
 *   pointing  every pointing-mode keycode, {name, native, code, label}
 *   custom    every custom key, {name, native, code, label}
 *   keyLayers keycode name → the layer it acts on, for every layer key named
 *             here (keyLayer), so a screen marks the layer a name ends in
 *             without working it out again
 *
 * `layers` holds the layer names, which every layer key reads by. Only a
 * keyboard whose action ABI is known gets the rest from its profile: the
 * user-slot layout they depend on is the ABI's.
 */
// Catalogue groups describe browsing, not whether a label carries modifiers.
// Detect modifier words centrally so new modifier-bearing families inherit
// host naming without requiring another screen or group allowlist.
/** @param {Pick<import("../data/types.js").ResolvedKeycode, "group" | "label">} entry */
const carriesModifiers = entry => ["modifiers", "magic"].includes(entry.group) || /\b[LR]?(?:Ctrl|Shift|Alt|GUI|Cmd)\b/.test(entry.label);

// A key as the host layout prints it (data/host-layouts.js): a letter as its
// capital, as on a keycap; anything else as it types it plain; a dead key as
// its accent. Shifted symbol keycodes (KC_EXLM is S(KC_1)) read as what the
// layout types with Shift. US keeps the catalogue's own labels. Stored
// keycodes never change, only what they are called.
/** @param {number} layoutId @param {boolean} macosIso @returns {{labels: Record<string, string>, legends: Record<string, string[]> | null}} */
function hostLayoutNames(layoutId, macosIso) {
    const layout = hostLayout(layoutId);
    if (!layout || layoutId === US_HOST_LAYOUT) return {labels: {}, legends: null};
    const swapIso = macosIso && layout.os === "macos";
    /** @type {Record<string, string>} */
    const labels = {};
    /** @type {Record<string, string[]>} */
    const legends = {};
    /** @param {import("../data/types.js").HostLayoutCell | undefined} cell */
    const text = cell => cell && typeof cell === "object" ? `${cell.dead} ◌` : cell || "";
    /** @param {import("../data/types.js").ResolvedKeycode} resolved @param {string} label */
    const name = (resolved, label) => {
        const entry = keycodes.lookup(resolved.name) || resolved;
        labels[entry.name] = label;
        for (const alias of ("aliases" in entry ? entry.aliases : [])) labels[alias] = label;
    };
    for (const key of Object.keys(layout.keys)) {
        const source = swapIso && key === "KC_GRV" ? "KC_NUBS" : swapIso && key === "KC_NUBS" ? "KC_GRV" : key;
        const cells = layout.keys[source];
        const value = keycodes.encode(key);
        if (key === "KC_SPC" || value === undefined) continue;
        const plain = text(cells[0]), shift = text(cells[1]);
        const capital = shift.length === 1 && shift !== plain && shift === plain.toUpperCase();
        if (plain) name(keycodes.resolve(value), capital ? shift : plain);
        const shifted = keycodes.resolve(0x0200 | value);
        if (shift && shifted.group === "shifted") name(shifted, shift);
        legends[key] = [capital ? shift : plain, capital ? "" : shift, text(cells[2]), text(cells[3])];
    }
    return {labels, legends};
}

/**
 * @param {{hostOs?: number, hostLayout?: number, macosIso?: boolean, layers?: string[], macros?: {keycode: string, name?: string}[], customKeys?: {slot: number, name?: string}[], behaviors?: Pick<import("../schema/types.js").BehaviorRow, 'target'>[], pdModes?: Pick<import("../schema/types.js").PdSlot, 'id' | 'name' | 'kind'>[], actionsKnown?: boolean}} [options]
 * @returns {import("../../contracts/model.js").ProfileKeyNames}
 */
function profileKeyNames({hostOs = 0, hostLayout: layoutId = US_HOST_LAYOUT, macosIso = false, layers, macros = [], customKeys = [], behaviors = [], pdModes = [], actionsKnown = false} = {}) {
    const typed = hostLayoutNames(layoutId, macosIso);
    const labels = {...typed.labels};
    /** @type {Record<string, number>} */
    const keyLayers = {};
    /** @type {Record<string, string>} */
    const aliases = {};
    /** @type {import("../../contracts/model.js").NamedKey[]} */
    const pointing = [];
    /** @type {import("../../contracts/model.js").NamedKey[]} */
    const custom = [];
    const modifiers = hostKeyVocabulary(hostOs).modifiers;
    for (const entry of keycodes.entries()) if (carriesModifiers(entry)) {
        let label = entry.value >= 0xe0 && entry.value <= 0xe7 ? modifiers[entry.value - 0xe0][1] : hostKeyLabel(entry.label, hostOs);
        const base = typed.labels[keycodes.resolve(entry.value & 0xff).name];
        if ("kind" in entry && entry.kind === "modified" && base !== undefined) label = label.replace(/\+[^+]+$/, () => `+${base}`);
        labels[entry.name] = label;
        for (const alias of ("aliases" in entry ? entry.aliases : [])) labels[alias] = label;
    }
    const count = Math.max(8, layers?.length || 0);
    for (let layer = 0; layer < count; layer++) for (const form of Object.keys(LAYER_VERBS)) {
        const name = `${form}(${layer})`;
        if (form !== "LOCK_LAYER") {
            labels[name] = /** @type {string} */ (layerKeyLabel(name, layers));
            keyLayers[name] = layer;
        } else if (actionsKnown) {
            const value = resolveNativeQmkExpression(name, {});
            if (value === undefined) continue;
            const native = keycodes.resolve(value).name;
            aliases[native] = name;
            labels[native] = labels[name] = /** @type {string} */ (layerKeyLabel(name, layers));
            keyLayers[native] = keyLayers[name] = layer;
        }
    }
    const layered = {labels, aliases, pointing, custom, hostOs, legends: typed.legends, layers: layers || [], keyLayers};
    if (!actionsKnown) return layered;
    for (const slot of macros) {
        const native = keycodes.resolve(/** @type {number} */ (resolveNativeQmkExpression(slot.keycode, {}))).name;
        const label = slot.name || `Macro ${slot.keycode.split("_").at(-1)}`;
        aliases[native] = slot.keycode;
        labels[native] = label;
        labels[slot.keycode] = label;
    }
    // Every custom key, named or not: all 128 exist, and one without a name
    // reads by its number.
    for (let slot = 0; slot < CUSTOM_KEY_SLOTS; slot++) {
        const name = `CUSTOM_KEY_${slot}`, code = customKeyCode(slot);
        const label = customKeys.find(key => key.slot === slot)?.name || `Custom key ${slot}`;
        const native = keycodes.resolve(code).name;
        aliases[native] = name;
        labels[native] = labels[name] = label;
        custom.push({name, native, code, label});
    }
    // A behaviour row keyed by a semantic target names its keycode only where
    // the catalogue has nothing better than a bare user slot: LOCK_LAYER(2)
    // reads "Lock Numbers" instead of "User 30". A key already named — a layer
    // key, or a macro named above — keeps that name, so a key reads the same
    // whether or not a behaviour sits on it.
    for (const row of behaviors) {
        if (row.target.kind === ACTION.QMK_KEYCODE) continue;
        const semantic = actionName(row.target);
        const value = resolveNativeQmkExpression(semantic, {});
        if (value === undefined) continue;
        const catalogued = keycodes.resolve(value);
        aliases[catalogued.name] = semantic;
        const generic = !catalogued.known || catalogued.group === "user";
        if (!generic || labels[catalogued.name] !== undefined) continue;
        labels[catalogued.name] = labels[semantic] = semanticLabel(semantic);
    }
    // Every slot gets its keycodes, configured or not: the firmware's mode
    // keycodes are a fixed registry, so a key may be placed for a slot that is
    // still empty, and stays put when a slot is cleared. It does nothing until
    // the slot is configured, which the label says.
    for (const slot of pdModes) for (const locked of [false, true]) {
        const binding = PD_SLOT_BINDINGS[slot.id];
        const name = locked ? binding.lock : binding.hold, code = locked ? binding.lockCode : binding.holdCode;
        const label = `${slotName(slot)} · ${locked ? "lock" : "hold"}${slot.kind ? "" : " (empty)"}`;
        const native = keycodes.resolve(code).name;
        aliases[native] = name;
        labels[native] = label;
        labels[name] = label;
        pointing.push({name, native, code, label});
    }
    return layered;
}

// The layer a stored keycode acts on: a layer key's, a layer-tap's hold, a
// layer-mod's, a layer lock's. Undefined for any other key. The screens
// (through keyLayers and the model's qmkKeyLayers) and the review's marks
// both take it from here.
/** @param {number} value @returns {number | undefined} */
function keyLayer(value) {
    return layerLockOfCode(value) ?? keycodes.resolve(value).layer;
}

// A layer key by what it does and the name of its layer.
/** @param {string} name @param {readonly string[]} [layers] */
function layerKeyLabel(name, layers) {
    const [, form, layer] = LAYER_KEY.exec(name) || [];
    return form ? `${LAYER_VERBS[form]} ${layerName(layers, Number(layer))}` : undefined;
}

/** @param {string} label @param {number} [hostOs] */
function hostKeyLabel(label, hostOs) {
    const gui = ["GUI", "Command", "Windows", "Super"][hostOs ?? 0] || "GUI";
    return String(label).replace(/\b([LR])(Ctrl|Shift|Alt|GUI|Cmd)\b/g, (_, side, name) => `${side === "L" ? "Left" : "Right"} ${name}`).replace(/\bControl\b/g, "Ctrl").replace(/\b(?:GUI|Cmd)\b/g, gui).replace(/\bAlt\b/g, hostOs === 1 ? "Option" : "Alt");
}

// Compact faces are another spelling of the same host-resolved basic key.
// Keep modifier side, layout characters and stored keycodes intact. Unknown
// names stay whole; fixed-size faces can clip them with the full name on hover.
/** @param {string} label */
function compactKeyLabel(label) {
    const basic = {Spacebar: "Space", Backspace: "Bksp", Escape: "Esc", "Page Up": "PgUp", "Page Down": "PgDn", "Print Screen": "PrtSc", "Scroll Lock": "ScrLk", "Caps Lock": "Caps", "Num Lock": "NumL"};
    return /** @type {Record<string, string>} */ (basic)[label] || label
        .replace(/^(Left|Right) /, (_, side) => `${side === "Left" ? "L" : "R"} `)
        .replace(/\bCommand\b/g, "Cmd").replace(/\bOption\b/g, "Opt").replace(/\bWindows\b/g, "Win");
}

/** @param {Record<string, string>} labels @returns {Record<string, string>} */
function compactKeyLabels(labels) {
    /** @type {Record<string, string>} */
    const short = {};
    for (const entry of keycodes.entries()) {
        if (entry.value > 0xff) continue;
        for (const name of [entry.name, ...entry.aliases]) short[name] = compactKeyLabel(labels[name] || entry.label);
    }
    return short;
}

// Every modifier control uses these same names as keys and Review. Picker
// identifiers are stable edit tokens, not display words; derive their labels
// from the bit vocabulary rather than maintaining another naming table.
/** @param {number} [hostOs] */
function hostKeyVocabulary(hostOs = 0) {
    const modifiers = VOCABULARY.modifiers.map(/** @returns {[number, string]} */ ([bit, label]) => [bit, hostKeyLabel(label, hostOs)]);
    const wrappers = ["C", "S", "A", "G", "RCTL", "RSFT", "RALT", "RGUI"];
    const pickerModifiers = modifiers.map(([bit, label], i) => ({bit, value: wrappers[i], label: i < 4 ? label.replace(/^Left /, "") : label}));
    return {modifiers, pickerModifiers};
}

// A stored keycode value as it reads in this profile, and as it reads with the
// name it is stored under too, for the one place two keys can read alike: a
// review row whose sides would otherwise look the same (KC_1 and KC_KP_1 are
// both "1").
/** @param {Partial<import("../../contracts/model.js").ProfileKeyNames> | null | undefined} names @param {number} value @returns {string} */
function keyLabel(names, value) {
    const resolved = keycodes.resolve(value);
    const named = names?.labels?.[resolved.name];
    if (named !== undefined) return named;
    // A layer-tap is a tap key and a layer, both named: "/ / Navigation".
    if (resolved.kind === "layer-tap") {
        const tap = keycodes.lookup(/** @type {string} */ (resolved.tap));
        return `${tap ? keyLabel(names, tap.value) : resolved.tap} / ${layerName(names?.layers, /** @type {number} */ (resolved.layer))}`;
    }
    if (resolved.kind === "layer-mod") {
        const modifiers = resolved.label.replace(/^Layer \d+ \+ /, "");
        return `${layerName(names?.layers, /** @type {number} */ (resolved.layer))} + ${hostKeyLabel(modifiers, names?.hostOs)}`;
    }
    if (resolved.kind === "mod-tap") {
        const tap = keycodes.lookup(/** @type {string} */ (resolved.tap));
        return hostKeyLabel(resolved.label, names?.hostOs).replace(/^[^/]+ \/ /, () => `${tap ? keyLabel(names, tap.value) : resolved.tap} / `);
    }
    if (resolved.kind === "modified") {
        const base = keycodes.resolve(value & 0xff);
        return hostKeyLabel(resolved.label, names?.hostOs).replace(/\+[^+]+$/, () => `+${keyLabel(names, base.value)}`);
    }
    return carriesModifiers(resolved) ? hostKeyLabel(resolved.label, names?.hostOs) : resolved.label;
}
// A custom key's shortcut (firmware D-F26) as it reads: its modifiers in the
// host's words, left before right, then its key, joined by " + ". Empty for
// no shortcut.
/** @param {Partial<import("../../contracts/model.js").ProfileKeyNames> | null | undefined} names @param {{mods: number, key: number} | null | undefined} shortcut */
function shortcutLabel(names, shortcut) {
    if (!shortcut) return "";
    const parts = hostKeyVocabulary(names?.hostOs).modifiers.filter(([bit]) => shortcut.mods & bit).map(([, label]) => label);
    if (shortcut.key) parts.push(keyLabel(names, shortcut.key));
    return parts.join(" + ");
}
/** @param {Partial<import("../../contracts/model.js").ProfileKeyNames> | null | undefined} names @param {number} value */
function keyLabelWithName(names, value) {
    const {name} = keycodes.resolve(value);
    const label = keyLabel(names, value);
    return label === name ? label : `${label} (${name})`;
}

module.exports = {compactKeyLabel, compactKeyLabels, hostKeyVocabulary, hostKeyLabel, keyLabel, keyLabelWithName, keyLayer, layerKeyLabel, profileKeyNames, semanticLabel, shortcutLabel};
