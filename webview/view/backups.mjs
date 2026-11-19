// @ts-check
// What the Backups screen says about a chosen file: whether it fits the
// keyboard's memory, and what a VIA layout brings (D-L97).

// The largest backup read, and what a larger one is told: core's own
// (FILE_MAX_BYTES and FILE_TOO_LARGE in core/model/portable-profile.js).
export const PROFILE_FILE_MAX_BYTES = 196608;
export const PROFILE_FILE_TOO_LARGE = "This file is too large for a backup.";

/** @param {number} value */
const bytes = (value) => value.toLocaleString("en-GB");

// The import sheet's size line. A file exactly at capacity fits; a larger one
// says plainly that it does not, as a warning.
/** @param {{used: number, capacity: number}} fits @returns {{text: string, warn: boolean}} */
export function fitsLine({used, capacity}) {
    return used > capacity
        ? {text: `This file does not fit: ${bytes(used)} bytes, and this keyboard holds ${bytes(capacity)}.`, warn: true}
        : {text: `This file fits: ${bytes(used)} of ${bytes(capacity)} bytes`, warn: false};
}

/** @param {number} count @param {string} one */
const counted = (count, one) => `${count} ${one}${count === 1 ? "" : "s"}`;
/** @param {string[]} words */
const listed = (words) => words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0] ?? "";

// What a blank slate can remove, in the words the sheet and the callout use.
/** @type {readonly [keyof import("../../contracts/model.js").ViaClears, string, string][]} */
const CLEARABLE = [["behaviors", "behaviour", "behaviours"], ["combos", "combo", "combos"], ["customKeys", "custom key", "custom keys"]];

// What a VIA layout replaces, for the import sheet's callout: it holds keys
// and macros only, so the rest of the draft stays, but for what a blank slate
// removes. Layers are named as the sheet's table names them (the file's
// summary names).
/** @param {import("../../contracts/model.js").ViaImportView} via @param {readonly string[]} names */
export function viaCallout({layers, clear, clearable, pointer, kept}, names) {
    const replaced = layers === 1 ? names[0] : `${names[0]} to ${names[layers - 1]}`;
    // Only what the draft has is removed; a kind it has none of stays, empty.
    const goes = (/** @type {keyof import("../../contracts/model.js").ViaClears} */ kind) => clear[kind] && clearable[kind] > 0;
    const removed = CLEARABLE.filter(([kind]) => goes(kind)).map(([, , many]) => many);
    const stays = listed([...CLEARABLE.filter(([kind]) => !goes(kind)).map(([, , many]) => many), "pointing modes", "the rest of lighting and settings"]);
    return `A VIA layout holds keys and macros only. Its ${counted(layers, "layer")} replace${layers === 1 ? "s" : ""} ${replaced}, and every layer above is emptied; its macros fill the first macro slots, and the rest are emptied. Layer and macro names are cleared, and so are each layer's own settings and the emptied layers' lighting and pointing links.${pointerLine(pointer)}${removed.length ? ` Your draft's ${listed(removed)} are removed.` : ""} ${stays[0].toUpperCase()}${stays.slice(1)} stay as they are.${keptLine(kept)}`;
}

// What the import keeps that plays a macro by its slot, which the file filled
// or emptied, so it plays the file's macro now or nothing: each as core calls
// it, the first VIA_LEFT_SHOWN of them, then a count of the rest. Nothing, when
// nothing kept plays a macro.
/** @param {import("../../contracts/model.js").ViaImportView["kept"]} kept */
function keptLine(kept) {
    if (!kept.length) return "";
    const plays = kept.map((item) => `${item.called} plays ${item.emptied ? `nothing (${item.macro} is emptied)` : `this file's ${item.macro}`}`);
    const rest = plays.length - VIA_LEFT_SHOWN;
    return ` Kept, these still play a macro by its slot, which now holds this file's macro or nothing: ${rest > 0 ? `${plays.slice(0, VIA_LEFT_SHOWN).join(", ")} and ${rest} more` : listed(plays)}.`;
}

// What became of Auto-mouse's pointer layer, which the file decides: moved
// to its highest layer above Base with mouse buttons, or Auto-mouse turned
// off for want of one.
/** @param {import("../../contracts/model.js").ViaImportView["pointer"]} pointer */
function pointerLine(pointer) {
    if (!pointer) return "";
    return pointer.change === "off" ? " Auto-mouse is turned off: no layer of this file above Base has mouse buttons."
        : ` The pointer layer is now ${pointer.layerName}, the file's layer with mouse buttons.`;
}

// The sheet's blank-slate question: one switch for each of behaviours,
// combos and custom keys the draft has, which a VIA layout cannot hold. Each
// starts as core chose (on: the import is a fresh start), and what is kept
// still turns its layers on. Nothing to ask, when the draft has none.
/** @param {import("../../contracts/model.js").ViaImportView} via @returns {{intro: string, choices: {kind: keyof import("../../contracts/model.js").ViaClears, label: string, checked: boolean}[]} | null} */
export function viaClearChoices({clearable, clear}) {
    const present = CLEARABLE.filter(([kind]) => clearable[kind] > 0);
    if (!present.length) return null;
    return {intro: `Start from a blank slate? A VIA layout has no ${listed(present.map(([, , many]) => many)).replace(/ and /g, " or ")}, so your draft's own are removed unless you keep them. Kept, they still turn on their layers.`,
        choices: present.map(([kind, one, many]) => ({kind, checked: clear[kind],
            label: `Remove the draft's ${clearable[kind] === 1 ? `${one}` : `${clearable[kind]} ${many}`}${kind === "customKeys" ? ", with their behaviours" : ""}`}))};
}

// The most the sheet lists of what a VIA layout left out; the rest is counted.
export const VIA_LEFT_SHOWN = 8;

// What a VIA layout could not bring, each left empty: a heading counting the
// keys and macros, and one line per key the file names (with the layers it
// sits on) and per macro, each named as core names it, the first
// VIA_LEFT_SHOWN of them, then a count of the rest. Nothing, when all of it
// came.
/** @param {import("../../contracts/model.js").ViaImportView} via @returns {{heading: string, lines: string[], more: string} | null} */
export function viaLeftOut({left}) {
    /** @type {Map<string, {spelling: string, reason: string, layers: string[], count: number}>} */
    const keys = new Map();
    for (const key of left.keys) {
        const id = JSON.stringify([key.spelling, key.reason]);
        const entry = keys.get(id) ?? keys.set(id, {spelling: key.spelling, reason: key.reason, layers: [], count: 0}).get(id);
        if (!entry) continue;
        entry.count += 1;
        if (!entry.layers.includes(key.layerName)) entry.layers.push(key.layerName);
    }
    const all = [...[...keys.values()].map((key) => `${key.spelling} on ${listed(key.layers)}${key.count > 1 ? ` (${key.count} keys)` : ""}: ${key.reason}`),
        ...left.macros.map((macro) => `${macro.name}: ${macro.reason}`)];
    if (!all.length) return null;
    const parts = [left.keys.length ? counted(left.keys.length, "key") : "", left.macros.length ? counted(left.macros.length, "macro") : ""].filter(Boolean);
    const rest = all.length - VIA_LEFT_SHOWN;
    return {heading: `Left empty: ${parts.join(" and ")} Ark cannot bring from this file`, lines: all.slice(0, VIA_LEFT_SHOWN),
        more: rest > 0 ? `and ${rest} more` : ""};
}
