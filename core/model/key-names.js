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
const {PD_MODE_KEYS, pdModeKeyOfName} = require("../data/pd-mode-keys");
const {CUSTOM_KEY_SLOTS, customKeyCode, layerLockOfCode} = require("../data/user-keycodes");
const catalog = require("../data/keycode-catalog");
const keycodes = require("../schema/keycodes");
const {LAYER_FORMS, MODS, layerFormBase, wrapperOf} = require("../../rules/qmk-keycodes.mjs");
const {actionName} = require("../schema/actions");
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {resolveNativeQmkExpression} = require("../schema/compiled-profile-v1");
const {LAYER_KEY_VERBS: LAYER_VERBS, layerName, macroDefaultName, slotName} = require("./vocabulary");
const {hostLayout, US_HOST_LAYOUT} = require("../data/host-layouts");
const {LAYERS} = require("../data/charybdis-layout");
const {shortcutPresent, shortcutSends} = require("../schema/settings-domain-v1");


// A pointing key by its slot: "Dragscroll · hold", "Slot 6 · lock (empty)",
// or "Slot 0 · hold" where the keyboard reported no slots.
/** @param {{id: number, kind: number, name: string} | undefined} slot @param {number} id @param {boolean} locked */
const pointingKeyLabel = (slot, id, locked) => `${slotName(slot, id)} · ${locked ? "lock" : "hold"}${slot && !slot.kind ? " (empty)" : ""}`;

// LOCK_LAYER(2) → "Lock layer 2", PD_MODE_0 → "Slot 0 · hold".
/** @param {string} semantic */
function semanticLabel(semantic) {
    const pointing = pdModeKeyOfName(semantic);
    if (pointing) return pointingKeyLabel(undefined, pointing.slot, pointing.locked);
    const [, name, args] = /^([A-Z][A-Z0-9_]*)(?:\((.*)\))?$/.exec(semantic) || [, semantic, undefined];
    const words = name.replace(/_/g, " ").toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1) + (args === undefined ? "" : ` ${args.replace(/\s+/g, "")}`);
}

/**
 * What one profile renames, over the catalogue.
 *
 *   labels    keycode name → label, under the stored name and the profile's own
 *   aliases   stored name → the profile's name for it (QK_USER_16 → PD_MODE_0)
 *   pointing  every pointing-mode keycode, {name, native, code, label}
 *   custom    every custom key, {name, native, code, label}
 *   keyLayers keycode name → the layer it acts on, for every layer key named
 *             here (keyLayer), so a screen marks the layer a name ends in
 *             without working it out again
 *   keyLayerForms keycode name → what it does to that layer, by QMK's
 *             function (keyLayerForm)
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
        const entry = catalog.lookup(resolved.name) || resolved;
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
 * @param {{hostOs?: number, hostLayout?: number, macosIso?: boolean, layers?: string[], macros?: {keycode: string, name?: string}[], customKeys?: {slot: number, name?: string}[], behaviors?: Pick<import("../schema/types.js").BehaviorRow, 'target'>[], pdModes?: Pick<import("../schema/types.js").PointingSlot, 'id' | 'name' | 'kind'>[], actionsKnown?: boolean}} [options]
 * @returns {import("../../contracts/model.js").ProfileKeyNames}
 */
function profileKeyNames({hostOs = 0, hostLayout: layoutId = US_HOST_LAYOUT, macosIso = false, layers, macros = [], customKeys = [], behaviors = [], pdModes = [], actionsKnown = false} = {}) {
    const typed = hostLayoutNames(layoutId, macosIso);
    const labels = {...typed.labels};
    /** @type {Record<string, number>} */
    const keyLayers = {};
    /** @type {Record<string, import("../../contracts/model.js").LayerForm>} */
    const keyLayerForms = {};
    /** @type {Record<string, string>} */
    const aliases = {};
    /** @type {import("../../contracts/model.js").NamedKey[]} */
    const pointing = [];
    /** @type {import("../../contracts/model.js").NamedKey[]} */
    const custom = [];
    const modifiers = hostKeyVocabulary(hostOs).modifiers;
    for (const entry of catalog.entries()) if (carriesModifiers(entry)) {
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
            labels[name] = layerKeyLabel(form, layer, layers);
            keyLayers[name] = layer;
            keyLayerForms[name] = /** @type {import("../../contracts/model.js").LayerForm} */ (form);
        } else if (actionsKnown) {
            const value = resolveNativeQmkExpression(name, {});
            if (value === undefined) continue;
            const native = keycodes.resolve(value).name;
            aliases[native] = name;
            labels[native] = labels[name] = layerKeyLabel(form, layer, layers);
            keyLayers[native] = keyLayers[name] = layer;
            keyLayerForms[native] = keyLayerForms[name] = "LOCK_LAYER";
        }
    }
    const layered = {labels, aliases, pointing, custom, hostOs, legends: typed.legends, layers: layers || [], keyLayers, keyLayerForms};
    if (!actionsKnown) return layered;
    for (const slot of macros) {
        const native = keycodes.resolve(/** @type {number} */ (resolveNativeQmkExpression(slot.keycode, {}))).name;
        const label = slot.name || macroDefaultName(Number(slot.keycode.split("_").at(-1)));
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
        const keys = PD_MODE_KEYS[slot.id];
        const name = locked ? keys.lock : keys.hold, code = locked ? keys.lockCode : keys.holdCode;
        const label = pointingKeyLabel(slot, slot.id, locked);
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

// What a stored keycode does to the layer it acts on, by QMK's function: a
// layer key's (MO … PDF), a layer-tap's (LT), a layer-mod's (LM), a layer
// lock's (LOCK_LAYER). Undefined for any other key.
/** @param {number} value @returns {import("../../contracts/model.js").LayerForm | undefined} */
function keyLayerForm(value) {
    if (layerLockOfCode(value) !== undefined) return "LOCK_LAYER";
    const {kind} = keycodes.resolve(value);
    if (kind === "layer-tap") return "LT";
    if (kind === "layer-mod") return "LM";
    if (kind !== "layer") return undefined;
    const base = layerFormBase(value);
    return /** @type {import("../../contracts/model.js").LayerForm | undefined} */ (Object.keys(LAYER_FORMS).find((form) => LAYER_FORMS[/** @type {keyof typeof LAYER_FORMS} */ (form)] === base));
}

// A layer key by what it does and the name of its layer.
/** @param {string} form @param {number} layer @param {readonly string[]} [layers] */
function layerKeyLabel(form, layer, layers) {
    return `${LAYER_VERBS[form]} ${layerName(layers, layer)}`;
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
    for (const entry of catalog.entries()) {
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
    // The modifiers' QMK bits, in the vocabulary's order: left, then right.
    const wrappers = Object.values(MODS).map(mods => /** @type {string} */ (wrapperOf(mods)));
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
        const tap = catalog.lookup(/** @type {string} */ (resolved.tap));
        return `${tap ? keyLabel(names, tap.value) : resolved.tap} / ${layerName(names?.layers, /** @type {number} */ (resolved.layer))}`;
    }
    if (resolved.kind === "layer-mod") {
        const modifiers = resolved.label.replace(/^Layer \d+ \+ /, "");
        return `${layerName(names?.layers, /** @type {number} */ (resolved.layer))} + ${hostKeyLabel(modifiers, names?.hostOs)}`;
    }
    if (resolved.kind === "mod-tap") {
        const tap = catalog.lookup(/** @type {string} */ (resolved.tap));
        return hostKeyLabel(resolved.label, names?.hostOs).replace(/^[^/]+ \/ /, () => `${tap ? keyLabel(names, tap.value) : resolved.tap} / `);
    }
    if (resolved.kind === "modified") {
        const base = keycodes.resolve(value & 0xff);
        return hostKeyLabel(resolved.label, names?.hostOs).replace(/\+[^+]+$/, () => `+${keyLabel(names, base.value)}`);
    }
    return carriesModifiers(resolved) ? hostKeyLabel(resolved.label, names?.hostOs) : resolved.label;
}
// A custom key's shortcut (firmware D-F26) as it reads: its modifiers in the
// host's words, left before right, then its keys in order, then the layers it turns on
// by name, lowest first, joined by " + ": "Left Command + Navigation + Extra".
// Held layers read by name alone; any other kind leads with its layer key's
// verb: "Left Command + Lock Navigation + Extra". Empty for no shortcut.
/** @param {Partial<import("../../contracts/model.js").ProfileKeyNames> | null | undefined} names @param {import("../schema/types.js").CustomKeyShortcut | null | undefined} shortcut */
function shortcutLabel(names, shortcut) {
    if (!shortcut) return "";
    const parts = shortcutKeys(names, shortcut);
    const layers = shortcutLayerNames(names, shortcut);
    const verb = shortcut.layerKind ? VOCABULARY.customKeys.layerKinds.find(([kind]) => kind === shortcut.layerKind)?.[1] : "";
    if (layers.length && verb) layers[0] = `${verb} ${layers[0]}`;
    return [...parts, ...layers].join(" + ");
}
// The layers a shortcut turns on, by name, lowest first.
/** @param {Partial<import("../../contracts/model.js").ProfileKeyNames> | null | undefined} names @param {{layers?: number} | null | undefined} shortcut @returns {string[]} */
function shortcutLayerNames(names, shortcut) {
    const layers = [];
    for (let layer = 0; layer < LAYERS; layer++) if ((shortcut?.layers ?? 0) & (1 << layer)) layers.push(layerName(names?.layers, layer));
    return layers;
}
// What a shortcut does, after its key's name in a tip: sends its modifiers and
// keys, its layers named after them by their kind, or, of layers alone, what
// it does with them ("holds Navigation on", "locks Navigation + Extra"), as
// the Custom keys screen says it (webview/view/custom-key.mjs, shortcutAct).
const LAYER_ACTS = ["holds %s on", "locks %s", "moves to %s", "tap-toggles %s", "turns %s on as a one-shot"];
/** @param {Partial<import("../../contracts/model.js").ProfileKeyNames> | null | undefined} names @param {import("../schema/types.js").CustomKeyShortcut | null | undefined} shortcut */
function shortcutAct(names, shortcut) {
    if (!shortcut || !shortcutPresent(shortcut)) return "";
    if (shortcutSends(shortcut)) return `sends ${shortcutLabel(names, shortcut)}`;
    return (LAYER_ACTS[shortcut.layerKind] || LAYER_ACTS[0]).replace("%s", shortcutLayerNames(names, shortcut).join(" + "));
}
// What a shortcut sends, one part each: its modifiers in the host's words,
// left before right, then each key in the order it is pressed. Empty for a
// shortcut of layers alone.
/** @param {Partial<import("../../contracts/model.js").ProfileKeyNames> | null | undefined} names @param {import("../schema/types.js").CustomKeyShortcut | null | undefined} shortcut @returns {string[]} */
function shortcutKeys(names, shortcut) {
    if (!shortcut) return [];
    const parts = hostKeyVocabulary(names?.hostOs).modifiers.filter(([bit]) => shortcut.mods & bit).map(([, label]) => label);
    for (const key of shortcut.keys) parts.push(keyLabel(names, key));
    return parts;
}
/** @param {Partial<import("../../contracts/model.js").ProfileKeyNames> | null | undefined} names @param {number} value */
function keyLabelWithName(names, value) {
    const {name} = keycodes.resolve(value);
    const label = keyLabel(names, value);
    return label === name ? label : `${label} (${name})`;
}

module.exports = {compactKeyLabel, compactKeyLabels, hostKeyVocabulary, hostKeyLabel, keyLabel, keyLabelWithName, keyLayer, keyLayerForm, profileKeyNames, semanticLabel, shortcutAct, shortcutKeys, shortcutLabel, shortcutLayerNames};
