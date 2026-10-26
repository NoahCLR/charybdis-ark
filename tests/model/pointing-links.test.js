"use strict";
// A pointing slot's link (firmware D-F62): which layers may start its mode or
// be turned on by its key, and why not, as the editor offers them and a staged
// edit is judged.
const test = require("node:test"), assert = require("node:assert/strict");
const {inertLinkLayers, inertLinkReason, linkTargets, linkRefusal, pointerCoveredLayers, reorderLinkRefusal, settingsLinkRefusal} = require("../../core/model/pointing-links");
const {settings} = require("../fixtures/portable-profile");

// The test profile's settings: Base the one default layer, Pointer (4) the
// pointer layer. Extra 1 and Extra 2 (5, 6) start Volume; Brightness's key
// turns on Navigation (3) and Extra 1. The empty slot 3 names layer 9, which
// the pointing domain would refuse, so the rule's own check that an empty
// slot starts nothing is what keeps layer 9 free.
const unlinked = {linkedLayers: 0, linkTurnsOn: 0, linkEnds: 0};
const slots = () => [
    {id: 0, kind: 2, name: "Dragscroll", ...unlinked},
    {id: 1, kind: 1, name: "Volume", ...unlinked, linkedLayers: 0b1100000},
    {id: 2, kind: 1, name: "Brightness", ...unlinked, linkTurnsOn: (1 << 3) | (1 << 5)},
    {id: 3, kind: 0, name: "", ...unlinked, linkedLayers: 1 << 9},
];

test("the keyboard ignores a default layer or the pointer layer in a link, and says so by name", () => {
    const value = settings();
    assert.match(inertLinkReason(value, 0), /^Base is a default layer: it is always on, so the mode would run all the time/);
    assert.match(inertLinkReason(value, 4), /^Pointer is the pointer layer: moving the trackball turns it on/);
    assert.equal(inertLinkReason(value, 3), "");
    value.values[23] = (1 << 0) | (1 << 2);
    assert.match(inertLinkReason(value, 2), /^Symbols is a default layer/, "every default layer");
    value.values[5] = 7;
    assert.equal(inertLinkReason(value, 4), "", "the pointer layer as the settings name it");
    assert.match(inertLinkReason(value, 7), /pointer layer/);
});

test("every layer is a target, with why it is refused and the slot it starts", () => {
    const targets = linkTargets(settings(), slots());
    assert.equal(targets.length, 16);
    assert.deepEqual(targets.filter(target => target.refusal).map(target => target.layer), [0, 4]);
    assert.deepEqual(targets[5], {layer: 5, refusal: "", inert: "", linkedBy: 1, linkedByName: "Volume"});
    assert.deepEqual(targets[3], {layer: 3, refusal: "", inert: "", linkedBy: null, linkedByName: ""}, "a layer a key turns on starts nothing");
    assert.deepEqual([targets[0].inert, targets[4].inert], ["default", "pointer"], "which kind of layer the keyboard ignores, for the editor's words");
    assert.deepEqual(targets.filter(target => target.linkedBy !== null).map(target => target.layer), [5, 6], "an empty slot starts nothing");
});

test("a changed link is refused on a layer another mode starts from, the pointer layer or a default layer", () => {
    const value = settings(), all = slots();
    const link = (id, fields) => ({...all[id], ...fields});
    assert.equal(linkRefusal(value, all, link(0, {linkedLayers: 1 << 7}), all[0]), "");
    assert.equal(linkRefusal(value, all, link(0, unlinked), all[0]), "", "no link");
    assert.match(linkRefusal(value, all, link(0, {linkedLayers: (1 << 7) | (1 << 6)}), all[0]), /^Extra 2 already starts Volume; a layer starts one pointing mode/);
    assert.equal(linkRefusal(value, all, link(0, {linkTurnsOn: (1 << 5) | (1 << 3)}), all[0]), "", "a key may turn on a layer that starts another mode, or one another key turns on");
    assert.equal(linkRefusal(value, all, link(0, {linkedLayers: 1 << 3}), all[0]), "", "a layer another key turns on may start this mode");
    assert.equal(linkRefusal(value, all, link(1, {linkedLayers: 0b1100000, linkTurnsOn: 1 << 5, linkEnds: 2}), all[1]), "", "its own layers, its key turning one on");
    assert.match(linkRefusal(value, all, link(0, {linkedLayers: 1 << 4}), all[0]), /pointer layer/);
    assert.match(linkRefusal(value, all, link(0, {linkTurnsOn: 1}), all[0]), /default layer/, "the key's layers are judged too");
});

test("a layer the slot already names is kept, even once the keyboard ignores it", () => {
    const value = settings(), all = slots();
    value.values[5] = 5;  // Extra 1 became the pointer layer under Volume's link and Brightness's key.
    assert.match(inertLinkReason(value, 5), /pointer layer/);
    assert.equal(linkRefusal(value, all, {...all[1], linkEnds: 1}, all[1]), "", "saving another field of the slot");
    assert.equal(linkRefusal(value, all, {...all[2], linkTurnsOn: 1 << 5}, all[2]), "", "a key layer it keeps");
    assert.match(linkRefusal(value, all, {...all[1], linkedLayers: 0b1100000 | 1}, all[1]), /^Base is a default layer/, "a layer it adds is judged");
    assert.match(linkRefusal(value, all, {...all[2], linkedLayers: 1 << 6}, all[2]), /already starts Volume/, "a second mode is refused all the same");
});

test("the layers of a link the keyboard ignores, as a mask", () => {
    const value = settings();
    assert.equal(inertLinkLayers(value, 0b1111111), 0b10001, "Base, the default layer, and Pointer");
    assert.equal(inertLinkLayers(value, 0b1100000), 0);
    value.values[5] = 5;
    assert.equal(inertLinkLayers(value, 0b1100000), 1 << 5, "follows the pointer layer setting");
});

test("the pointer layer covers the lower layers a mode's key turns on while the mode keeps it", () => {
    const value = settings();
    const covers = (fields) => pointerCoveredLayers(value, {id: 2, kind: 1, name: "Brightness", ...unlinked, pointerLayer: 0, ...fields});
    assert.equal(covers({linkTurnsOn: 1 << 3}), 1 << 3);
    assert.equal(covers({linkTurnsOn: 0b101010}), 0b1010, "every one below it, none above");
    assert.equal(covers({linkedLayers: 1 << 3}), 0, "a mode its layers started never turns the pointer layer on");
    assert.equal(covers({linkTurnsOn: 1 << 3, pointerLayer: 1}), 0, "the mode returns to the typing layer");
    assert.equal(covers({linkTurnsOn: 1 << 3, kind: 0}), 0, "an empty slot");
});

test("settings never make a layer a link names the pointer layer or a default layer", () => {
    const before = settings();
    /** @param {(values: number[]) => void} change */
    const after = change => { const value = settings(); change(value.values); return value; };
    assert.equal(settingsLinkRefusal(before, before, slots()), "");
    assert.equal(settingsLinkRefusal(before, after(values => { values[5] = 3; }), slots()),
        "Navigation is in Brightness's link, and the keyboard ignores the pointer layer in a link. Take it out of Brightness's link first.",
        "a layer a key turns on");
    assert.match(settingsLinkRefusal(before, after(values => { values[23] |= 1 << 6; }), slots()), /^Extra 2 is in Volume's link, and the keyboard ignores a default layer/, "a layer that starts a mode");
    assert.equal(settingsLinkRefusal(before, after(values => { values[5] = 7; values[23] |= 1 << 2; }), slots()), "", "layers no link names");
    assert.equal(settingsLinkRefusal(before, after(values => { values[5] = 9; }), slots()), "", "an empty slot names nothing");
    // A layer a link names that the keyboard already ignored is left as it is.
    const ignored = slots();
    ignored[1].linkedLayers |= 1 << 4;
    assert.equal(settingsLinkRefusal(before, after(values => { values[17] = 1; }), ignored), "");
});

test("a reorder that would leave a link ignored, or one layer starting two modes, says why", () => {
    const value = settings();
    const same = (/** @type {number} */ mask) => mask;
    assert.equal(reorderLinkRefusal(value, value, slots(), slots(), same, true), "");
    // Keys keeping their numbers, Pointer's contents moved to 6, which Volume
    // starts from.
    const after = settings();
    after.values[5] = 6;
    assert.equal(reorderLinkRefusal(value, after, slots(), slots(), same, false),
        "This move would put Volume's link on Extra 2, the pointer layer, which the keyboard ignores in a link. Turn on Keys follow their layers, or change the link first.");
    // Two modes starting from one layer.
    const now = slots();
    now[2].linkedLayers = 1 << 6;
    assert.match(reorderLinkRefusal(value, value, slots(), now, same, true), /^This move would have Extra 2 start both Volume and Brightness, and a layer starts one pointing mode\. Change the link first\.$/);
    // A layer the link names that was ignored before stays as it was.
    const ignored = slots();
    ignored[1].linkedLayers |= 1 << 4;
    assert.equal(reorderLinkRefusal(value, value, ignored, ignored, same, false), "");
    // Two of a link's layers landing on one (keys keeping their numbers, Make
    // base) would merge them: refused, naming both.
    const merge = (/** @type {number} */ mask) => (mask & (1 << 5) ? (mask & ~(1 << 5)) | (1 << 3) : mask);
    const merged = slots().map((slot) => ({...slot, linkedLayers: merge(slot.linkedLayers), linkTurnsOn: merge(slot.linkTurnsOn)}));
    assert.equal(reorderLinkRefusal(value, value, slots(), merged, merge, false),
        "This move would put Navigation and Extra 1 of Brightness's link on one layer, Navigation. Turn on Keys follow their layers, or change the link first.");
});
