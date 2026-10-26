// The How it starts card's rows, from the rule the core publishes
// (model.pdModeEditing.linkTargets).
import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {linkIgnored, linkRows, pointerLayerCovers} from "../../webview/view/pointing-link.mjs";

const require = createRequire(import.meta.url);
const {linkTargets} = require("../../core/model/pointing-links");
const {VOCABULARY} = require("../../core/model/vocabulary");
const {settings} = require("../fixtures/portable-profile");

const NAMES = ["Base", "Numbers", "Symbols", "Navigation", "Pointer", "Extra 1", "Extra 2"];
const unlinked = {linkedLayers: 0, linkTurnsOn: 0, linkEnds: 0};
// Extra 1 and Extra 2 start Volume; Brightness's key turns on Symbols and Extra 1.
const slots = [
    {id: 1, kind: 1, name: "Volume", ...unlinked, linkedLayers: 0b1100000},
    {id: 2, kind: 1, name: "Brightness", ...unlinked, linkTurnsOn: (1 << 2) | (1 << 5)},
    {id: 3, kind: 1, name: "Zoom", ...unlinked},
];
const model = (values = settings()) => ({
    vocabulary: VOCABULARY,
    layers: NAMES.map((name, index) => ({index, name: `Layer ${index}`, displayName: name})),
    pdModeEditing: {linkTargets: linkTargets(values, slots), pointerLayer: values.values[5]},
});
const slot = (id, link = {}) => ({...slots.find((entry) => entry.id === id), pointerLayer: 0, ...link});
const row = (rows, layer) => rows.find((entry) => entry.layer === layer);

test("one row per layer, in the tab order, with both switches as stored", () => {
    const rows = linkRows(model(), slot(2, {linkedLayers: 1 << 3}));
    assert.deepEqual(rows.map((entry) => entry.name), NAMES);
    assert.deepEqual(rows.filter((entry) => entry.starts).map((entry) => entry.layer), [3]);
    assert.deepEqual(rows.filter((entry) => entry.key).map((entry) => entry.layer), [2, 5]);
});

test("the default and pointer layers are unusable rows that say why in the row", () => {
    const rows = linkRows(model(), slot(3));
    const base = row(rows, 0), pointer = row(rows, 4);
    assert.deepEqual([base.why, base.unusable, base.startLocked, base.keyLocked], ["default layer, always on", true, true, true]);
    assert.deepEqual([pointer.why, pointer.unusable, pointer.startLocked, pointer.keyLocked], ["pointer layer, follows the trackball", true, true, true]);
    assert.match(pointer.tip, /^Pointer is the pointer layer/, "the whole reason as its tip");
    assert.deepEqual(rows.filter((entry) => entry.unusable).map((entry) => entry.layer), [0, 4]);
});

test("a layer that starts another mode cannot start this one, says which in the row, and its key switch stays usable", () => {
    const extra = row(linkRows(model(), slot(3)), 5);
    assert.deepEqual([extra.unusable, extra.startLocked, extra.keyLocked, extra.startsOther], [false, true, false, "already starts Volume"]);
    assert.match(extra.startTip, /^Extra 1 already starts Volume/);
    const own = row(linkRows(model(), slot(1)), 5);
    assert.deepEqual([own.starts, own.startLocked, own.startsOther], [true, false, ""], "its own layers stay switchable");
    assert.equal(row(linkRows(model(), slot(3)), 2).startLocked, false, "a layer another key turns on may start this mode");
});

test("a stored layer the keyboard now ignores stays switchable off, and is said beside it", () => {
    const values = settings(); values.values[5] = 5;  // Extra 1 became the pointer layer.
    const extra = row(linkRows(model(values), slot(1)), 5);
    assert.deepEqual([extra.unusable, extra.starts, extra.startLocked, extra.keyLocked], [true, true, false, true]);
    assert.match(linkIgnored(model(values), slot(1)), /^Extra 1 is the pointer layer/);
    assert.match(linkIgnored(model(values), slot(2)), /^Extra 1 is the pointer layer/, "a key layer too");
    assert.equal(linkIgnored(model(), slot(1)), "");
    assert.equal(linkIgnored(model(values), slot(3)), "", "no link, nothing to ignore");
});

test("the layers the core says the pointer layer covers, named", () => {
    assert.deepEqual(pointerLayerCovers(model(), {pointerCovers: 1 << 3}), {pointer: "Pointer", covered: ["Navigation"]});
    assert.deepEqual(pointerLayerCovers(model(), {pointerCovers: 0b1010}), {pointer: "Pointer", covered: ["Numbers", "Navigation"]});
    assert.equal(pointerLayerCovers(model(), {pointerCovers: 0}), null);
    assert.equal(pointerLayerCovers(model(), {}), null);
});
