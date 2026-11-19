import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {GRID_COLUMNS, foundGroups, layerKeys, listedSections, sectionGroups, tileSpan} from "../../webview/view/picker-tiles.mjs";
import {pickable, pickerSections} from "../../webview/view/picker-sections.mjs";
import {PICKER_BOARD} from "../../webview/view/picker-board.mjs";

const {demoDocument, publishedModel} = createRequire(import.meta.url)("../fixtures/published-model");

const model = publishedModel(demoDocument());
/** @param {object} [over] @returns {any} */
const picker = (over = {}) => ({title: "Key", mode: "single", allowedKeys: null, maxKeys: Infinity, section: "board", search: "", mods: [], keys: [], layerTap: null, ...over});
const section = (/** @type {string} */ id) => /** @type {any} */ (pickerSections().find((candidate) => candidate.id === id));
const found = (/** @type {string} */ search, over = {}) => foundGroups(model, picker({search, ...over}));
const values = (/** @type {{tiles: {value: string}[]}[]} */ groups) => groups.flatMap((group) => group.tiles.map((tile) => tile.value));
const names = (/** @type {{name: string}[]} */ groups) => groups.map((group) => group.name);

test("All keycodes lists every key a field takes, section by section", () => {
    const groups = listedSections(model, picker());
    assert.deepEqual(names(groups), ["Letters and digits", "Symbols", "Numpad", "Common keys", "Layers", "Macros", "Custom keys", "Pointing modes", "Mouse", "Media", "More keys", "Lighting", "Other QMK"]);
    const shown = new Set(values(groups));
    assert.equal(shown.size, values(groups).length, "each once");
    for (const entry of model.qmkKeycodes.filter(pickable)) assert.ok(shown.has(entry.value), entry.value);
    for (const slot of model.macros) assert.ok(shown.has(slot.keycode), slot.keycode);
    for (const layer of model.layers) for (const {value} of layerKeys(model, layer.index, {})) assert.ok(shown.has(value), value);
    // Layers and pointing modes in the rows their sections draw.
    assert.deepEqual(groups.filter((group) => group.rows).map((group) => [group.name, group.rows]), [["Layers", "layers"], ["Pointing modes", "modes"]]);
    assert.ok(!shown.has("QK_USER_0"), "what core does not offer stays out");
    // Each section in the groups its own tab has.
    const common = groups.find((group) => group.name === "Common keys");
    assert.deepEqual(names(common?.groups ?? []), ["Typing", "Modifiers", "Arrows", "Navigation", "System", "Function", "No key"]);
    assert.deepEqual(names(common?.groups ?? []), names(sectionGroups(model, picker(), section("common"))));
    assert.deepEqual(names(groups.find((group) => group.name === "Macros")?.groups ?? []), ["In use", "Empty"]);
    assert.deepEqual(values(common?.groups ?? []), values(sectionGroups(model, picker(), section("common"))));
});

test("a field limited to some keys lists only those, in All keycodes and a search", () => {
    const limited = picker({allowedKeys: ["KC_A", "MACRO_0", "PD_MODE_0"]});
    const groups = listedSections(model, limited);
    assert.deepEqual(values(groups), ["KC_A", "MACRO_0", "PD_MODE_0"]);
    assert.deepEqual(groups.filter((group) => group.rows), [], "a pointing key by itself, not every slot's row");
    assert.deepEqual(names(groups.find((group) => group.name === "Pointing modes")?.groups ?? []), [""], "under its section's heading alone");
    assert.deepEqual(values(found("a", {allowedKeys: ["KC_A", "MACRO_0"]})), ["KC_A", "MACRO_0"]);
});

test("a shortcut's layers are switches, so no layer key is listed or found", () => {
    const shortcut = {shortcut: true, allowedKeys: ["KC_A"]};
    assert.deepEqual(values(found("MO(1)", shortcut)), []);
    assert.ok(!names(listedSections(model, picker(shortcut))).includes("Layers"));
});

test("a search finds a layer's keys by keycode, name and form, and TG as the lock it is", () => {
    const named = model.layers.find((layer) => layer.name);
    assert.deepEqual(values(found("MO(1)")), ["MO(1)"]);
    assert.deepEqual(values(found("TG(3)")), ["LOCK_LAYER(3)"]);
    assert.deepEqual(values(found(`${named.name} hold`)).slice(0, 1), [`MO(${named.index})`]);
    assert.deepEqual(values(found(`hold ${named.name}`)).slice(0, 1), [`MO(${named.index})`], "in any order");
    const tapHold = found("LT(2").flatMap((group) => group.tiles);
    assert.deepEqual(tapHold.map(({layer, tapHold: arms}) => [layer, arms]), [[2, true]], "Tap-hold arms its layer");
    assert.deepEqual(names(found("MO(")), ["Layers"]);
    assert.ok(!values(found("LT(", {comboOutput: true})).length, "a combo can't send Tap-hold");
});

test("a search cuts nothing off, and groups what it finds in the sections' order", () => {
    assert.equal(values(found("custom")).length, 128);
    const groups = found("a");
    const order = names(listedSections(model, picker()));
    assert.deepEqual(names(groups), order.filter((name) => names(groups).includes(name)));
    assert.deepEqual(values(found("Mute")), ["KC_AUDIO_MUTE", "KC_KB_MUTE"], "case aside, by name or words");
    assert.deepEqual(values(found("QK_USER")), [], "what core does not offer is never found");
});

test("a search finds a key by every word typed, in any order, or one word with the spaces gone", () => {
    assert.deepEqual(values(found("dragscroll lock")), ["PD_MODE_0_LOCK"]);
    assert.deepEqual(values(found("lock dragscroll")), ["PD_MODE_0_LOCK"]);
    assert.deepEqual(values(found("pageup")), ["KC_PAGE_UP"]);
    assert.ok(values(found("custom 12")).includes("CUSTOM_KEY_12"));
    assert.deepEqual(values(found("pa geup")), [], "two words are two words, not one squeezed");
});

test("a search finds a key by its other names, never by a hex alias's digits", () => {
    assert.deepEqual(values(found("KC_BSPC")), ["KC_BACKSPACE"]);
    assert.deepEqual(values(found("PD_SLOT_3_LOCK")), ["PD_MODE_3_LOCK"]);
    assert.deepEqual(values(found("DRAGSCROLL_LOCK")), ["PD_MODE_0_LOCK"]);
    assert.deepEqual(values(found("0x7E80")), []);
});

test("a search for a macro finds it by name and by slot", () => {
    assert.deepEqual(values(found("SPOT")), ["MACRO_0"]);
    assert.ok(values(found("M3")).includes("MACRO_3"));
    assert.ok(values(found("Macro 3")).includes("MACRO_3"));
});

test("a search beginning a group's or a section's name lists it", () => {
    assert.deepEqual(values(found("no key")), ["KC_NO", "KC_TRANSPARENT"]);
    for (const query of ["arrow", "Arrows"]) assert.ok(["KC_LEFT", "KC_RIGHT", "KC_UP", "KC_DOWN"].every((key) => values(found(query)).includes(key)), query);
    const fns = values(found("function"));
    assert.equal(fns.filter((value) => /^KC_F\d+$/.test(value)).length, 24);
    assert.ok(values(found("pointing")).includes("PD_MODE_0"));
    assert.ok(values(found("magic")).includes("QK_MAGIC_TOGGLE_NKRO"), "Magic's groups, now in Other QMK");
    assert.equal(values(found("layers")).length, model.layers.length * 6);
    assert.equal(values(found("e")).includes("KC_NO"), false, "not on one letter, which begins too much");
});

test("Keyboard and All keycodes list their keys from five letters, so a short search isn't buried", () => {
    const board = values(found("keyboard"));
    for (const key of PICKER_BOARD.keys) assert.ok(board.includes(model.qmkKeycodeAliases[key.value] || key.value), key.value);
    assert.ok(!board.includes("MACRO_0"), "only what the board draws");
    assert.deepEqual(new Set(values(found("all keycodes"))), new Set(values(listedSections(model, picker()))));
    assert.ok(!values(found("all")).includes("KC_A"), "all alone is any key with those letters");
    assert.ok(!values(found("key")).includes("KC_A"));
    assert.deepEqual(values(found("all keycodes", {allowedKeys: ["KC_A"]})), ["KC_A"], "what the field takes");
});

test("an unnamed macro is written out as a custom key is, and any macro shows its keycode alone", () => {
    const macros = sectionGroups(model, picker(), section("macros"));
    assert.deepEqual(names(macros), ["In use", "Empty"]);
    const empty = macros[1]?.tiles.find((tile) => tile.value === "MACRO_100");
    assert.deepEqual([empty?.words, empty?.sub], ["Macro 100", "MACRO_100"]);
    const used = model.macros.find((slot) => slot.name && !slot.empty);
    const tile = macros[0]?.tiles.find(({value}) => value === used.keycode);
    assert.deepEqual([tile?.words, tile?.sub], [used.name, used.keycode]);
    assert.ok(tile?.tip.includes(used.name), "a long name clips, and its tip says it");
    const noSteps = sectionGroups({...model, macros: model.macros.map((slot) => slot.keycode === "MACRO_100" ? {...slot, name: "Later"} : slot)}, picker(), section("macros"));
    assert.ok(noSteps[0]?.tiles.some(({value}) => value === "MACRO_100"), "named but without steps is in use");
});

test("the grid's columns are the stylesheet's", () => {
    assert.ok(readFileSync(new URL("../../webview/styles.css", import.meta.url), "utf8").includes(`.pk-grid { display: grid; grid-template-columns: repeat(${GRID_COLUMNS}, `));
});

test("a group's tiles share a span wide enough for the widest, and a small group fills its last row", () => {
    /** @param {number} count @param {string} words @param {number} [mark] */
    const tiles = (count, words, mark = 0) => Array.from({length: count}, () => ({words, sub: "KC_A", mark, value: "", tip: "", search: ""}));
    assert.equal(tileSpan(tiles(26, "A")), 1);
    assert.equal(tileSpan(tiles(5, "Backspace")), 2);
    assert.equal(tileSpan(tiles(8, "Backspace")), 3, "eight read as four and four, one step wider");
    assert.equal(tileSpan(tiles(128, "Custom key 127", 18)), 2, "a long run keeps its width, however many it holds");
    assert.equal(tileSpan(tiles(7, "A rather longer pair of words")), 3);
    assert.equal(tileSpan(tiles(5, "Far too long a name for any tile that the grid can hold")), 4, "never wider");
    assert.ok(tileSpan(tiles(5, "Abcdefghijklmnopq", 44)) > tileSpan(tiles(5, "Abcdefghijklmnopq")), "a mark takes room");
});
