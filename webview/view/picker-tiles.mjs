// @ts-check
// What the keycode picker's key sections draw: each key as a tile, in named
// groups on one grid, and what a search finds, grouped the same way. The sheet
// itself is webview/ui/picker.mjs.

import {keyIdentity, reachKind} from "./key-identity.mjs";
import {macroShortName, macroWords} from "./macro.mjs";
import {PICKER_BOARD} from "./picker-board.mjs";
import {offeredEntries, offeredKeys, offeredMacros} from "./picker.mjs";
import {groupedEntries, pickerSections} from "./picker-sections.mjs";
import {layerCalled, vocabulary} from "./vocabulary.mjs";

/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 * @typedef {import("../../contracts/panel.js").CatalogEntry} CatalogEntry
 * @typedef {import("../../contracts/panel.js").MacroSlot} MacroSlot
 * @typedef {import("../state.js").PickerState} Picker
 * @typedef {import("./types.js").PickerSection} PickerSection
 *
 * @typedef {{value: string, words: string, sub: string, tip: string, search: string, mark: number, macro?: boolean, layer?: number, verb?: string, tapHold?: boolean}} Tile
 *   `value` is the key's keycode, what a tile's click picks; `sub` what shows
 *   under its `words`; `search` what a search reads; `mark` how wide the mark
 *   beside its words is. A Tap-hold tile picks nothing yet: it arms `layer`.
 * @typedef {{name: string, tiles: Tile[]}} TileGroup
 *   One with no name has no heading of its own.
 * @typedef {TileGroup & {groups: TileGroup[], rows?: "layers" | "modes"}} ListedSection
 *   A section in All keycodes: its `groups`, or, by `rows`, one row a layer or a
 *   slot as its own section draws them.
 */

// The columns of the grid every group's tiles sit on (.pk-grid in styles.css).
export const GRID_COLUMNS = 12;

// A plain mark is about 18 pixels; a layer's is wider, with a form's tag beside.
const MARK_WIDTH = 18, LAYER_MARK_WIDTH = 44;

// A hex alias is no name anybody searches by, and its digits match any number.
/** @param {CatalogEntry} entry */
const entrySearch = (entry) => `${entry.search} ${entry.value} ${(entry.aliases || []).filter((alias) => !/^0x/i.test(alias)).join(" ")}`.toLowerCase();

/** @param {Model} model @param {CatalogEntry} entry @returns {Tile} */
const entryTile = (model, entry) => ({value: entry.value, words: entry.label || entry.value, sub: entry.value, tip: entry.tip || entry.value,
    search: entrySearch(entry), mark: reachKind(model, entry.value) ? MARK_WIDTH : 0});

// A macro by its name, or as a custom key is, its slot written out ("Macro 3").
/** @param {MacroSlot} slot @returns {Tile} */
const macroTile = (slot) => ({value: slot.keycode, words: slot.name || slot.defaultName || macroShortName(slot),
    sub: slot.keycode, tip: slot.name ? `${slot.name} · ${slot.keycode}` : slot.keycode,
    search: macroWords(slot).join(" ").toLowerCase(), mark: MARK_WIDTH, macro: true});

// A layer's keys in the order the picker offers them, each in core's word for
// its form (vocabulary.layerKeyVerbs). `also` is another spelling a search
// finds it by. A combo can't send Tap-hold, which needs a key of its own.
/** @param {Model} model @param {number} layer @param {{comboOutput?: boolean}} picker */
export function layerKeys(model, layer, picker) {
    const verbs = vocabulary(model).layerKeyVerbs;
    return [
        {value: `MO(${layer})`, verb: verbs.MO ?? "", tip: "On while the key is down.", also: "", tapHold: false},
        {value: `LOCK_LAYER(${layer})`, verb: verbs.LOCK_LAYER ?? "", tip: "Turns the layer on until pressed again. QMK's TG() is the same lock.", also: `TG(${layer})`, tapHold: false},
        ...(picker.comboOutput ? [] : [{value: `LT(${layer}, …)`, verb: "Tap-hold", tip: "A tap sends a key, a hold holds the layer. Pick the tap key next.", also: "", tapHold: true}]),
        {value: `TT(${layer})`, verb: verbs.TT ?? "", tip: "Holds the layer like Hold; repeated taps lock it.", also: "", tapHold: false},
        {value: `OSL(${layer})`, verb: verbs.OSL ?? "", tip: "Holds the layer like Hold; a tap turns it on for the next key only.", also: "", tapHold: false},
        {value: `TO(${layer})`, verb: verbs.TO ?? "", tip: "Locks this layer alone and releases every other lock. TO(0) returns to the base layer.", also: "", tapHold: false},
    ];
}

// A field takes layer keys unless it is limited to some keys; a shortcut's
// layers are switches, not keys.
/** @param {Model} model @param {Picker} picker @returns {Tile[]} */
const layerTiles = (model, picker) => picker.shortcut || picker.allowedKeys ? [] : (model?.layers || []).flatMap((layer) => {
    const called = layerCalled(layer);
    return layerKeys(model, layer.index, picker).map(({value, verb, tip, also, tapHold}) => {
        const words = tapHold ? `${verb} ${called}` : keyIdentity(model, value).label || `${verb} ${called}`;
        return {value, words, sub: value, tip, mark: LAYER_MARK_WIDTH, layer: layer.index, verb, tapHold,
            search: `${words} ${value} ${called} layer ${verb} ${also}`.toLowerCase()};
    });
});

// A macro with a name or steps is in use; the rest are empty.
/** @param {Model} model @param {Picker} picker @returns {{name: string, tiles: Tile[]}[]} */
function macroGroups(model, picker) {
    const slots = offeredMacros(model, picker);
    /** @param {MacroSlot} slot */
    const used = (slot) => Boolean(slot.name) || !slot.empty;
    return [{name: "In use", tiles: slots.filter(used).map(macroTile)}, {name: "Empty", tiles: slots.filter((slot) => !used(slot)).map(macroTile)}];
}

// A section's keys for a field, in the section's groups, the ones with any. The
// keyboard's board has no tiles, its keys being Letters and digits, Symbols and
// the rest, and All keycodes is every section's (listedSections).
/** @param {Model} model @param {Picker} picker @param {PickerSection} section @returns {TileGroup[]} */
export function sectionGroups(model, picker, section) {
    const groups = section.kind === "catalogue"
        ? groupedEntries(section, offeredEntries(model, picker, section), model).map(({name, entries}) => ({name, tiles: entries.map((entry) => entryTile(model, entry))}))
        : section.kind === "macros" ? macroGroups(model, picker)
        : section.kind === "layers" ? [{name: section.label, tiles: layerTiles(model, picker)}]
        : section.kind === "modes" ? [{name: section.label, tiles: offeredKeys(model, picker).filter((entry) => reachKind(model, entry.value) === "pointing").map((entry) => entryTile(model, entry))}]
        : [];
    return groups.filter((group) => group.tiles.length);
}

const keySections = () => pickerSections().filter((section) => section.kind !== "all");

// All keycodes: every section under its name, in its own groups, layers and
// pointing modes in the rows their sections have; a field limited to some keys
// lists only the pointing keys it takes. A section of one group named as it is
// needs no second heading.
/** @param {Model} model @param {Picker} picker @returns {ListedSection[]} */
export function listedSections(model, picker) {
    return keySections().map((section) => {
        const groups = sectionGroups(model, picker, section).map((group) => group.name === section.label ? {...group, name: ""} : group);
        /** @type {ListedSection} */
        const listed = {name: section.label, tiles: groups.flatMap(({tiles}) => tiles), groups};
        if (section.kind === "layers") listed.rows = "layers";
        if (section.kind === "modes" && !picker.allowedKeys) listed.rows = "modes";
        return listed;
    }).filter((section) => section.tiles.length);
}

/** @param {string} text */
const squeezed = (text) => text.replace(/[\s_·-]+/g, "");

// What a search finds across every section a field takes, nothing cut off: a
// key whose words hold every word typed, in any order, or, for one word, hold
// it with their spaces gone ("pageup"); and every key of a section or a group
// whose name it begins ("arrows", "no key"). Keyboard and All keycodes hold so
// much that a short start ("key", "all") would bury what it finds, so they take
// five letters. Its groups are the sections', in their order. Case is ignored.
/** @param {Model} model @param {Picker} picker @returns {TileGroup[]} */
export function foundGroups(model, picker) {
    const query = picker.search.trim().toLowerCase().replace(/\s+/g, " ");
    const words = query.split(" ");
    /** @param {Tile} tile */
    const holds = ({search}) => words.every((word) => search.includes(word)) || (words.length === 1 && squeezed(search).includes(squeezed(query)));
    /** @param {string} name */
    const begun = (name) => query.length >= 2 && name.toLowerCase().startsWith(query);
    /** @param {PickerSection["kind"]} kind */
    const wholeList = (kind) => query.length >= 5 && begun(pickerSections().find((section) => section.kind === kind)?.label ?? "");
    const every = wholeList("all");
    const board = wholeList("board") ? new Set(PICKER_BOARD.keys.map(({value}) => keyIdentity(model, value).name)) : null;
    return keySections().map((section) => ({name: section.label, tiles: sectionGroups(model, picker, section).flatMap(({name, tiles}) =>
        every || begun(section.label) || begun(name) ? tiles : tiles.filter((tile) => holds(tile) || board?.has(tile.value)))})).filter((group) => group.tiles.length);
}

// How many of the grid's columns a group's tiles span, all alike so their edges
// line up: enough for the widest. A column is 72 pixels with a gap of 8, a
// tile's sans about 6.5 a character and its mono 6.62. A small group goes one
// step wider when that fills its last row (eight modifiers read as four left
// and four right); a long run's width stays put as its count changes. Rows run
// full, whatever that leaves on the last one. A longer name clips, and its tip
// says it.
/** @param {Tile[]} tiles */
export function tileSpan(tiles) {
    const width = Math.max(...tiles.map(({words, sub, mark}) => Math.max(words.length * 6.5 + mark, sub.length * 6.62) + 20));
    const span = width <= 72 ? 1 : width <= 152 ? 2 : width <= 232 ? 3 : 4;
    /** @param {number} wide */
    const fills = (wide) => tiles.length % (GRID_COLUMNS / wide) === 0;
    return tiles.length <= GRID_COLUMNS && span > 1 && span < 4 && !fills(span) && fills(span + 1) ? span + 1 : span;
}
