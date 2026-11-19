// @ts-check
"use strict";

// A VIA layout (D-L97): the file VIA's Save + Load pane saves, read into the
// draft as its keys and macros. VIA keeps nothing else Ark stores, so the
// rest of the draft stays as it is.
//
// The file holds the keyboard's dynamic layers, each a list of keycodes in
// matrix order (row first, then column), as the keymap domain stores them,
// and its macros as text in the grammar Ark's macros are written in
// (rules/macro-payload.mjs). A key is named as VIA names it: QMK's name,
// VIA's own (MACRO00, USER00, CUSTOM(n)), or the keycode in hexadecimal.
//
// The file's layers become the keyboard's first layers and every layer above
// them is emptied; its macros become the first macro slots and every slot
// above them is emptied. The names Ark gave those layers and macros described
// what they held, and the file has none, so they are cleared too, with the
// rest of each layer's own state (resetLayerState).
//
// Pointing stays, but for its pointer layer, which the file decides, and the
// links to layers the file empties (settlePointing). With a blank slate
// (`clear`), the draft's behaviours on ordinary keys, its combos and its
// custom keys go too, each on its own; otherwise they stay.
// What is kept names a macro by its slot, so it plays the file's macro now,
// or nothing, and is listed (`kept`, keptMacros).
//
// A key or macro Ark cannot carry is left empty and listed (`left`): one Ark
// does not know or cannot place, and a custom key from before firmware D-F14,
// which current firmware leaves inert (core/data/user-keycodes.js). The
// review sheet says what did not come; the rest of the file still comes.
// Only a file that is no VIA layout for this keyboard is refused whole.

const keycodes = require("../schema/keycodes");
const {LAYERS, MATRIX_KEYS} = require("../data/charybdis-layout");
const {MACRO_DOMAIN_V1} = require("../schema/macro-domain-v1");
const {QK, NOTHING, TRANSPARENT, MODS, MOD_BITS, MOD_NAMES, MOD_RIGHT, macroName} = require("../../rules/qmk-keycodes.mjs");
const {NAMES: LEGACY_NAMES} = require("../data/keycode-legacy");
const {lookupValue} = require("../data/keycode-catalog");
const {VOCABULARY, layerName, macroDefaultName, slotName, word} = require("./vocabulary");
const {DIAGONALS, DIRECTIONS, PD_LINK_ENDS, isPdMacro} = require("../schema/pd-mode-domain-v1");
const {editProfileDomains, validateSnapshot, walkActions} = require("./portable-profile");
const {nativeCode} = require("../schema/actions");
const {keyLabel, profileKeyNames} = require("./key-names");
const {inputForm} = require("./autocorrect-list");
const {keyPlacementProblem} = require("./profile-placement");
const {encodeMacroPayload} = require("../schema/macro-payload");
const {hostSettings} = require("../schema/host-settings");
const {inspectMacroPlayback} = require("./macro-input");
const {customKeyInUse, customKeysSupported, emptyCustomKey} = require("./custom-key-editor");
const {PROFILE_ACTION_KINDS} = require("../schema/profile-blob-v1");
const {RGB_DOMAIN_V1, RGB_LAYER_MODES} = require("../schema/rgb-domain-v1");
const {SETTING, defaultLayerRecord} = require("../schema/settings-domain-v1");
const {RETIRED_CUSTOM_KEY_BASE, RETIRED_CUSTOM_KEY_SLOTS} = require("../data/user-keycodes");

/** @param {string} message @param {string} [code] */
const fail = (message, code = "INVALID_VIA_LAYOUT") => Object.assign(new Error(message), {code});

// VIA writes a set of modifiers as each one's MOD_ name joined by " | ", a
// right one named beside its left (MOD_LCTL | MOD_RCTL is right Ctrl), as
// QMK's bits are or'd. The same set as Ark spells it, one side's names from
// QMK's modifier bits (MODS), or the text unchanged when a name is not a
// modifier.
/** @param {string} set @returns {string} */
function modifierSet(set) {
    const names = set.split("|").map(name => name.trim());
    if (!names.every(name => name in MOD_NAMES)) return set;
    const bits = names.reduce((all, name) => all | MOD_NAMES[name], 0);
    const side = bits & MOD_RIGHT ? "R" : "L";
    return Object.entries(MODS).filter(([name, mod]) => name.startsWith(side) && bits & mod & MOD_BITS)
        .map(([name]) => `MOD_${name}`).join("|") || set;
}

// VIA's spelling of a key as Ark's encoder reads it: its modifier sets as
// Ark spells them. The names it keeps that QMK has renamed are QMK's older
// spellings, which the encoder reads (core/data/keycode-legacy.js).
/** @param {string} name @returns {string} */
const qmkSpelling = name => name.replace(/MOD_\w+(?:\s*\|\s*MOD_\w+)*/g, modifierSet);

// A key in a macro by a name the macro grammar reads, which is the
// catalogue's: an older name becomes the one QMK gives it now.
/** @param {string} name */
const macroKeyName = name => {
    const now = LEGACY_NAMES[name];
    return now && /^\w+$/.test(now) ? now : name;
};

// A key's code from VIA's spelling, or undefined when Ark cannot read it.
// VIA writes a code it cannot name in hexadecimal, and one it cannot even
// write as an empty name, which it loads as no key.
/** @param {unknown} spelling @returns {number | undefined} */
function codeOf(spelling) {
    if (typeof spelling === "number") return Number.isInteger(spelling) && spelling >= 0 && spelling <= 0xffff ? spelling : undefined;
    if (typeof spelling !== "string") return undefined;
    const name = spelling.trim();
    if (!name) return NOTHING;
    if (/^0x[0-9a-f]{1,4}$/i.test(name)) return Number.parseInt(name, 16);
    // MACRO(n) and CUSTOM(n), and VIA 10's MACRO00 and USER00, are numbered
    // from QMK's first macro key and first keyboard key (QK_KB_0), and run
    // past the 32 of each the catalogue names: macros to the end of their
    // block, keyboard keys on through QMK's user keys.
    const numbered = /^(?:MACRO(\d{2})|MACRO\((\d+)\)|USER(\d{2})|CUSTOM\((\d+)\))$/.exec(name);
    if (numbered) {
        const [first, last, index] = numbered[1] ?? numbered[2]
            ? [QK.MACRO.first, QK.MACRO.last, numbered[1] ?? numbered[2]] : [QK.KB.first, QK.USER.last, numbered[3] ?? numbered[4]];
        const code = first + Number(index);
        return code <= last ? code : undefined;
    }
    const code = keycodes.encode(qmkSpelling(name));
    return typeof code === "number" ? code : undefined;
}

// A VIA macro in Ark's grammar. VIA cuts its text at each {…} not after a
// backslash, writes a literal { as \{ and leaves } as it is, and reads a
// key's name in any case; Ark doubles a literal brace (rules/macro-payload.mjs).
/** @param {string} expression @returns {string} */
function viaMacroText(expression) {
    return viaMacroParts(expression).map((part, index) => {
        if (index % 2 === 0) return part.replace(/\\\{/g, "{").replace(/[{}]/g, brace => brace + brace);
        const inner = part.slice(1, -1);
        if (/^\d+$/.test(inner)) return part;
        const [, sign] = /^([+-]?)/.exec(inner) ?? ["", ""];
        const keys = inner.slice(sign.length).split(",").map(key => key.trim().toUpperCase()).filter(Boolean)
            .map(macroKeyName);
        return `{${sign}${keys.join(",")}}`;
    }).join("");
}

// A VIA macro's text cut as VIA cuts it, `split(/(?<!\\)(\{.*?\})/)`: the
// text between its keys, then each {…} from a { not after a backslash to the
// first } after it on the same line. Scanned once, as that expression takes
// time that grows with the square of a long run of unmatched { (each would
// look to the end of the text for its }).
/** @param {string} text @returns {string[]} */
function viaMacroParts(text) {
    /** @type {string[]} */
    const parts = [];
    const lineBreak = /[\n\r\u2028\u2029]/g;
    // The first } and the first line break after the { being read, each looked
    // for again only once the reading has passed it.
    let from = 0, close = -1, lineEnd = -1;
    for (let at = text.indexOf("{"); at !== -1; at = text.indexOf("{", at + 1)) {
        if (text[at - 1] === "\\") continue;
        if (close <= at) close = text.indexOf("}", at + 1);
        if (close === -1) break;
        if (lineEnd <= at) {
            lineBreak.lastIndex = at + 1;
            lineEnd = lineBreak.exec(text)?.index ?? text.length;
        }
        if (lineEnd < close) {at = lineEnd; continue;}
        parts.push(text.slice(from, at), text.slice(at, close + 1));
        from = close + 1;
        at = close;
    }
    parts.push(text.slice(from));
    return parts;
}

// The file, if it is a VIA layout: undefined for anything else, which is
// then read as a backup and refused in a backup's words. A JSON object with
// layers and no backup's `format` is a VIA layout, refused here if it does
// not read as one for this keyboard. How many layers it may have is the
// keyboard's (importViaLayout).
/** @param {string} text @returns {{name: string, layers: unknown[][], macros: unknown[]} | undefined} */
function viaLayoutOf(text) {
    /** @type {unknown} */
    let value;
    try {value = JSON.parse(text);} catch {return undefined;}
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const file = /** @type {Record<string, unknown>} */ (value);
    if ("format" in file || !("layers" in file)) return undefined;
    const {layers, macros = []} = file;
    if (!Array.isArray(layers) || !layers.length || !layers.every(Array.isArray)) throw fail("This VIA layout has no layers Ark can read.");
    const misfit = layers.find(layer => layer.length !== MATRIX_KEYS);
    if (misfit) throw fail(`This VIA layout is for another keyboard: its layers have ${misfit.length} keys, and a Charybdis 4x6's have ${MATRIX_KEYS}.`);
    if (!Array.isArray(macros)) throw fail("This VIA layout's macros are not a list Ark can read.");
    return {name: typeof file.name === "string" ? file.name : "", layers: /** @type {unknown[][]} */ (layers), macros};
}

/**
 * @typedef {import("../../contracts/model.js").ViaImportView} ViaImportView
 * @typedef {ViaImportView["left"]["keys"][number]} LeftKey
 * @typedef {ViaImportView["left"]["macros"][number]} LeftMacro
 * @typedef {ViaImportView["kept"][number]} KeptMacro
 * @typedef {import("../../contracts/model.js").ViaClears} ViaClears
 * @typedef {Pick<ViaImportView, "layers" | "macros" | "left" | "pointer" | "kept"> & {document: import("./types.js").PortableDocument}} ViaImport
 */

// Each layer's own state after a VIA import (D-L97): whatever described a
// layer was about what it held. It is the state reorderLayers moves with a
// layer (portable-profile.js), less what points at a layer from something the
// import keeps: the pointer layer and pointing modes' links (Pointing), a
// custom key's shortcut layers, and the layers a behaviour or combo may act
// on.
// - Lighting, on the layers the file does not fill (`from` up), which are
//   gone: a Passthrough colour (D-L94) over the layer's mapped keys, and no
//   accent of its own. A layer the file fills keeps its colour and accents.
// - Settings, on every layer: each matches its combos on its own keys and has
//   none of its key positions taken out of behaviours or combos; Base alone is
//   a default layer, every layer lets its keys use behaviours and join
//   combos, and none turns auto-sniping on.
// The colour a layer owns that paints nothing: Passthrough (firmware D-F74;
// colourPaints in rules/led-light.mjs).
const PASSTHROUGH = Object.freeze({h: 0, s: 0, v: 0});
// Each per-layer switch, as a layer's own state leaves it on `every` layer.
/** @type {Readonly<Record<number, (every: number) => number>>} */
const LAYER_SWITCHES = Object.freeze({
    [SETTING.DEFAULT_LAYERS]: () => 1, [SETTING.LAYER_BEHAVIORS]: every => every,
    [SETTING.LAYER_COMBOS]: every => every, [SETTING.AUTO_SNIPING_LAYERS]: () => 0,
});
/** @param {import("./types.js").OpenDomain} open @param {number} layerCount @param {number} from */
function resetLayerState(open, layerCount, from) {
    const rgb = open("rgb");
    rgb.layerColors.forEach(row => {
        if (row.layerId < from) return;
        row.color = {...PASSTHROUGH};
        row.mode = RGB_LAYER_MODES.KEYS_MAPPED_ON_THIS_LAYER_ONLY;
    });
    rgb.layerGroupRows = rgb.layerGroupRows.filter(row => row.selector === RGB_DOMAIN_V1.SELECTOR_ALL || row.selector < from);
    const settings = open("settings");
    settings.layers = settings.layers.map((_, layer) => defaultLayerRecord(layer));
    for (const [id, value] of Object.entries(LAYER_SWITCHES)) settings.values[Number(id)] = value(2 ** layerCount - 1);
}

// What points at a layer from Pointing, which the import keeps: the import
// was asked to start over, and the old setup is someone else's (D-L97).
// - The file decides the pointer layer: its highest layer above Base that
//   holds a mouse button, the layer VIA's keymaps point with. With none,
//   Auto-mouse turns off, and a pointer layer the file empties becomes its
//   last, so nothing points at a layer that is gone.
// - A pointing mode's link lets go of the emptied layers (`from` up); one no
//   layer starts any more has nothing to end it either.
// What the sheet says of it: the layer it moved to, or that Auto-mouse
// turned off; null when neither happened.
/** @param {import("./types.js").OpenDomain} open @param {number[][]} keymap @param {number} from @returns {ViaImportView["pointer"]} */
function settlePointing(open, keymap, from) {
    const kept = (2 ** from - 1) >>> 0;
    for (const slot of open("pdModes")) {
        slot.linkedLayers = (slot.linkedLayers & kept) >>> 0;
        slot.linkTurnsOn = (slot.linkTurnsOn & kept) >>> 0;
        if (!slot.linkedLayers) slot.linkEnds = PD_LINK_ENDS.NOTHING;
    }
    const values = open("settings").values;
    const highestMouseLayer = keymap.slice(1, from).reduce((highest, keys, index) => keys.some(isMouseButton) ? index + 1 : highest, 0);
    if (highestMouseLayer) {
        if (values[SETTING.AUTO_MOUSE_LAYER] === highestMouseLayer) return null;
        values[SETTING.AUTO_MOUSE_LAYER] = highestMouseLayer;
        return {layer: highestMouseLayer, layerName: layerName([], highestMouseLayer), change: "moved"};
    }
    if (values[SETTING.AUTO_MOUSE_LAYER] >= from) values[SETTING.AUTO_MOUSE_LAYER] = from - 1;
    if (!values[SETTING.AUTO_MOUSE_ENABLED]) return null;
    values[SETTING.AUTO_MOUSE_ENABLED] = 0;
    const layer = values[SETTING.AUTO_MOUSE_LAYER];
    return {layer, layerName: layerName([], layer), change: "off"};
}
// QMK's mouse buttons, as the catalogue names them.
/** @param {number} code */
const isMouseButton = code => /^QK_MOUSE_BUTTON_\d$/.test(lookupValue(code)?.name ?? "");

// What the import keeps that plays a macro (D-L97): a replacement, a pointing
// mode's direction, and a behaviour or combo the blank slate leaves. Each names
// its macro by slot, and the file fills or empties every slot, so each now
// plays the file's macro there or nothing (`emptied`). Read from the imported
// document, so it is what Use as draft keeps; a behaviour is called by its key
// and a combo by its number, as Review calls them, and each is `called` as the
// import sheet and Review name it.
/** @type {Readonly<Record<KeptMacro["kind"], (item: Omit<KeptMacro, "called" | "slot" | "macro" | "emptied">) => string>>} */
const KEPT_CALLED = {replacement: item => `the replacement for “${item.name}”`, pointing: item => `${item.name}'s ${item.direction} direction`,
    behaviour: item => `the behaviour on ${item.name}`, combo: item => item.name};
/** @param {import("./types.js").DecodedProfile} after @param {ReturnType<typeof hostSettings>} host @returns {KeptMacro[]} */
function keptMacros(after, host) {
    /** @type {KeptMacro[]} */
    const kept = [];
    /** @param {Omit<KeptMacro, "called" | "slot" | "macro" | "emptied">} what @param {number} slot */
    const plays = (what, slot) => {
        if (kept.some(item => item.kind === what.kind && item.name === what.name && item.direction === what.direction && item.slot === slot)) return;
        kept.push({...what, called: KEPT_CALLED[what.kind](what), slot, macro: macroDefaultName(slot), emptied: !after.macroSlots[slot]?.length});
    };
    /** @param {unknown} value @returns {number[]} */
    const slotsIn = value => {
        /** @type {number[]} */
        const slots = [];
        walkActions(value, action => {
            if (action.kind === PROFILE_ACTION_KINDS.MACRO) slots.push(action.operand);
            else if (action.kind === PROFILE_ACTION_KINDS.QMK_KEYCODE && action.operand >= QK.MACRO.first && action.operand <= QK.MACRO.last) slots.push(action.operand - QK.MACRO.first);
        });
        return slots;
    };
    for (const entry of after.autocorrect.entries) if (entry.macro !== undefined && entry.typos.length) plays({kind: "replacement", name: inputForm(entry.typos[0])}, entry.macro);
    for (const slot of after.pdModes) for (const [taps, words] of /** @type {const} */ ([[slot.directions, VOCABULARY.pointing.directions], [slot.diagonals, VOCABULARY.pointing.diagonals]])) {
        for (const name of [...DIRECTIONS, ...DIAGONALS]) {
            const tap = taps?.[name];
            if (tap && isPdMacro(tap.keycode)) plays({kind: "pointing", name: slotName(slot), direction: word(words, name)}, tap.keycode - QK.MACRO.first);
        }
    }
    const names = profileKeyNames({hostOs: host.effective, hostLayout: host.layout, macosIso: host.macosIso, actionsKnown: true, layers: after.settings.names,
        behaviors: after.behaviors.rows, pdModes: after.pdModes, customKeys: after.settings.customKeyNames.map((name, slot) => ({slot, name}))});
    for (const row of after.behaviors.rows) {
        const code = nativeCode(row.target);
        for (const slot of slotsIn(row)) plays({kind: "behaviour", name: code === undefined ? `Action ${row.target.operand}` : keyLabel(names, code)}, slot);
    }
    after.combos.rows.forEach((row, index) => {for (const slot of slotsIn(row)) plays({kind: "combo", name: `Combo ${index}`}, slot);});
    return kept;
}

// The draft history's words for a VIA layout used as the draft (D-L97).
const VIA_IMPORT_LABEL = "Imported a VIA layout";
// How many of a list Review names in full before it counts the rest, as the
// import sheet does (its copy, VIA_LEFT_SHOWN in webview/view/backups.mjs).
const KEPT_SHOWN = 8;

// What Review says of a VIA import still in the draft: what it kept that
// plays a macro by its slot, where that slot now holds other steps than the
// keyboard's, or none, so each plays the imported macro or nothing once
// saved. `keyboard` is the keyboard's profile in the draft's slots. A notice,
// since the import meant it; null when nothing kept plays a macro it changed.
/** @param {import("./types.js").DecodedProfile} keyboard @param {import("./types.js").DecodedProfile} draft @param {ReturnType<typeof hostSettings>} host @returns {import("../../contracts/model.js").Finding | null} */
function keptMacroFinding(keyboard, draft, host) {
    /** @param {number} slot */
    const changed = slot => {
        const mine = draft.macroSlots[slot] || [], theirs = keyboard.macroSlots[slot] || [];
        return mine.length !== theirs.length || mine.some((byte, at) => byte !== theirs[at]);
    };
    const kept = keptMacros(draft, host).filter(item => changed(item.slot));
    if (!kept.length) return null;
    const plays = kept.map(item => `${item.called} plays ${item.emptied ? `nothing (${item.macro} is emptied)` : `the imported ${item.macro}`}`);
    const rest = plays.length - KEPT_SHOWN;
    const named = rest > 0 ? `${plays.slice(0, KEPT_SHOWN).join(", ")} and ${rest} more`
        : plays.length > 1 ? `${plays.slice(0, -1).join(", ")} and ${plays.at(-1)}` : plays[0];
    return {kind: "keptMacros", level: "notice", layers: [], count: kept.length,
        identity: kept.map(item => `${item.called}:${item.slot}:${item.emptied ? 0 : 1}`).join("|"),
        title: "What the VIA import kept plays the macros it brought",
        detail: `These play a macro by its slot, which now holds the imported macro or nothing: ${named}.`,
        fix: "Choose another macro for any of them that should play something else.",
        place: {kind: "macro", index: kept[0].slot, keycode: macroName(kept[0].slot)}};
}

// No blank slate: the draft keeps its behaviours, combos and custom keys.
/** @type {Readonly<ViaClears>} */
const KEEP_ALL = Object.freeze({behaviors: false, combos: false, customKeys: false});
// A whole blank slate, which the sheet starts from: the import is a fresh
// start, so what the draft had goes unless the person keeps it (D-L97).
/** @type {Readonly<ViaClears>} */
const BLANK_SLATE = Object.freeze({behaviors: true, combos: true, customKeys: true});

// A behaviour on a custom key is part of that key (custom-key-editor.js), so
// it goes with the custom keys, not with the other behaviours.
/** @param {import("../schema/types.js").BehaviorRow} row */
const onCustomKey = row => row.target.kind === PROFILE_ACTION_KINDS.CUSTOM_KEY;

// What a blank slate could take from the draft besides its keys and macros,
// none of which a VIA layout holds (D-L97): how many behaviours on ordinary
// keys, combos and custom keys in use it has. Custom keys count only on
// firmware that has them.
/** @param {import("./types.js").PortableDocument} document @param {import("./types.js").ProfileDestination} [capabilities] @returns {import("../../contracts/model.js").ViaClearable} */
function viaClearable(document, capabilities) {
    const decoded = validateSnapshot(document, capabilities);
    return {behaviors: decoded.behaviors.rows.filter(row => !onCustomKey(row)).length, combos: decoded.combos.rows.length,
        customKeys: customKeysSupported(document, capabilities) ? decoded.settings.customKeyNames.filter((_, slot) => customKeyInUse(decoded, slot)).length : 0};
}

// The draft's document with the file's keys and macros, and what of the file
// was left out. `hostOs` is the host the draft types to, which decides what
// a macro's text can type (macro-input.js).
/** @param {import("./types.js").PortableDocument} document @param {NonNullable<ReturnType<typeof viaLayoutOf>>} via @param {{capabilities?: import("./types.js").ProfileDestination, hostOs?: import("./types.js").SnapshotFacts["hostOs"], clear?: ViaClears}} [context] @returns {ViaImport} */
function importViaLayout(document, via, {capabilities, hostOs, clear = KEEP_ALL} = {}) {
    const layerCount = capabilities?.compiledLayerCount ?? LAYERS;
    if (via.layers.length > layerCount) throw fail(`This VIA layout has ${via.layers.length} layers, and the keyboard holds ${layerCount}.`);
    /** @type {LeftKey[]} */
    const keys = [];
    /** @type {LeftMacro[]} */
    const macros = [];
    const imported = via.layers.map((layer, index) => layer.map((spelling, position) => {
        const code = codeOf(spelling);
        // The file names its layers by number only, so each is called as an
        // unnamed layer is.
        /** @param {string} reason */
        const leave = reason => {
            keys.push({layer: index, layerName: layerName([], index), position, spelling: typeof spelling === "string" ? spelling.trim() : String(spelling), reason});
            return NOTHING;
        };
        if (code === undefined) return leave("Ark does not know this key.");
        if (code >= RETIRED_CUSTOM_KEY_BASE && code < RETIRED_CUSTOM_KEY_BASE + RETIRED_CUSTOM_KEY_SLOTS) {
            return leave(`It was custom key ${code - RETIRED_CUSTOM_KEY_BASE} on older firmware, and does nothing on this firmware.`);
        }
        const misplaced = keyPlacementProblem(code, {layerCount, capabilities});
        return misplaced ? leave(misplaced) : code;
    }));
    // A slot past the bank holds nothing the keyboard could play; one that
    // holds something is said, an empty one is not.
    via.macros.slice(MACRO_DOMAIN_V1.SLOTS).forEach((text, offset) => {
        const slot = MACRO_DOMAIN_V1.SLOTS + offset;
        if (typeof text !== "string" || text) macros.push({slot, name: macroDefaultName(slot), reason: `The keyboard holds ${MACRO_DOMAIN_V1.SLOTS} macros.`});
    });
    const fileMacros = via.macros.slice(0, MACRO_DOMAIN_V1.SLOTS);
    let brought = 0;
    /** @type {ViaImportView["pointer"]} */
    let pointer = null;
    const result = editProfileDomains(document, {capabilities}, (open, read) => {
        const value = read();
        const host = hostSettings(value.settings.values, hostOs?.detected);
        const keymap = open("keymap");
        keymap.forEach((layer, index) => layer.splice(0, MATRIX_KEYS, ...(imported[index] ?? Array(MATRIX_KEYS).fill(TRANSPARENT))));
        const slots = open("macros");
        slots.forEach((_, slot) => {
            const text = fileMacros[slot];
            slots[slot] = Buffer.alloc(0);
            if (text === undefined || text === "") return;
            if (typeof text !== "string") {macros.push({slot, name: macroDefaultName(slot), reason: "It is not text."}); return;}
            const written = viaMacroText(text);
            const status = inspectMacroPlayback(written, host);
            if (status.error) {macros.push({slot, name: macroDefaultName(slot), reason: status.error}); return;}
            slots[slot] = encodeMacroPayload(written, {textEntry: Boolean(host.unicodeMode), layout: host.layout});
            brought += 1;
        });
        const settings = open("settings");
        settings.names.fill("");
        settings.macroNames.fill("");
        resetLayerState(open, layerCount, via.layers.length);
        pointer = settlePointing(open, keymap, via.layers.length);
        // A blank slate, as asked: the behaviours on ordinary keys, the
        // combos, and the custom keys with their own behaviours.
        if (clear.behaviors && value.behaviors.rows.some(row => !onCustomKey(row))) {
            const behaviors = open("behaviors");
            behaviors.rows = behaviors.rows.filter(onCustomKey);
        }
        if (clear.combos && value.combos.rows.length) open("combos").rows = [];
        if (clear.customKeys && customKeysSupported(document, capabilities)) {
            value.settings.customKeyNames.forEach((_, slot) => {if (customKeyInUse(value, slot)) emptyCustomKey(open, read, slot);});
        }
    });
    const after = validateSnapshot(result, capabilities);
    const kept = keptMacros(after, hostSettings(after.settings.values, hostOs?.detected));
    return {document: result, layers: via.layers.length, macros: brought, pointer, kept, left: {keys, macros: macros.sort((a, b) => a.slot - b.slot)}};
}

module.exports = {BLANK_SLATE, KEEP_ALL, KEPT_SHOWN, LAYER_SWITCHES, VIA_IMPORT_LABEL, viaLayoutOf, importViaLayout, keptMacroFinding, viaClearable, codeOf, viaMacroText, viaMacroParts};
