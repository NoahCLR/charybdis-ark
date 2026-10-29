import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {keyMeaning} from "../../webview/view/keyface.mjs";
import {reachKeys} from "../../webview/view/reach.mjs";
import {holdKeyName, pointingReach, pointingReachInView, pointingSlotFor, pointingVariant, slotKeycodeNames, slotKeycodes, whatReachesSlot} from "../../webview/view/pointing-reach.mjs";
import {customKeyShortcutMessage} from "../../webview/view/edits.mjs";
import {published} from "../fixtures/published-behaviours.mjs";

const require = createRequire(import.meta.url);
const {keyAt} = require("../fixtures/published-model.js");
const {SHORTCUT_LAYER_KINDS} = require("../../core/schema/settings-domain-v1");
const {PD_LINK_ENDS} = require("../../core/schema/pd-mode-domain-v1");

// The reach views read what core publishes for a profile (published): its
// layers with their answers, its combos and the reach core works out for
// them, its behaviours, macros and pointing slots.
// A pointing slot with no mode, as the slot editor clears one.
const cleared = (/** @type {{id: number}} */ record) => ({id: record.id, kind: 0, name: ""});
// Only the slots named stay configured.
const onlySlots = (/** @type {number[]} */ ids) => (/** @type {any[]} */ records) => records.forEach((record, at) => { if (!ids.includes(record.id)) records[at] = cleared(record); });
// A branch held: the tier runs while the key is held.
const held = (/** @type {string} */ action) => ({style: "PRESS_AND_HOLD_UNTIL_RELEASE", action});
// The test profile as it ships: Dragscroll, Volume, Brightness, Zoom, Arrow
// and Pinch in slots 0 to 5, every later slot empty, no macros.
const profile = published();

test("a pointing key is recognised as the keyboard names it, not only as the app labels it", () => {
    // Layout positions carry the device's own name for the value: plain hex
    // for a mode key, named slot or not. Both must reach the slot, or a bound
    // key would read as an ordinary key on the board and in the hover card.
    const model = published({keys: {0: {0: "PD_MODE_0", 1: "PD_MODE_0_LOCK", 2: "PD_MODE_6", 3: "PD_MODE_6_LOCK"}}});
    const stored = [0, 1, 2, 3].map((layoutIndex) => keyAt(model, 0, layoutIndex).keycode);
    assert.equal(pointingSlotFor(model, stored[0]).name, "Dragscroll");
    assert.equal(pointingSlotFor(model, stored[1]).name, "Dragscroll");
    assert.equal(pointingSlotFor(model, stored[2]).id, 6);
    assert.equal(pointingSlotFor(model, stored[3]).id, 6, "the lock keycode of an unnamed slot too");
    assert.equal(pointingSlotFor(model, keyAt(model, 0, 2).value).id, 6);
    assert.equal(pointingSlotFor(model, "0x0041"), undefined, "an ordinary value is not a pointing key");
});

test("a pointing key holds its mode or locks it, however the keyboard names it", () => {
    const model = published({keys: {0: {0: "PD_MODE_0", 1: "PD_MODE_0_LOCK", 2: "PD_MODE_6", 3: "PD_MODE_6_LOCK"}}});
    const stored = [0, 1, 2, 3].map((layoutIndex) => keyAt(model, 0, layoutIndex).keycode);
    assert.deepEqual(stored.map((keycode) => pointingVariant(model, keycode)), ["hold", "lock", "hold", "lock"], "by the keyboard's own names");
    assert.deepEqual(["PD_MODE_0", "PD_MODE_0_LOCK"].map((keycode) => pointingVariant(model, keycode)), ["hold", "lock"], "by the app's");
    const [hold, lock] = slotKeycodes(model.pdModes[6]);
    assert.deepEqual([hold, lock].map((value) => pointingVariant(model, value)), ["hold", "lock"], "an empty slot's by its numbers");
    assert.deepEqual([hold, lock].map((value) => pointingVariant(model, `0x${value.toString(16)}`)), ["hold", "lock"], "and by them in hex");
    assert.equal(pointingVariant(model, "KC_A"), "hold", "anything else holds");
});

test("what still reaches a pointing slot is listed, so an inert key can be named", () => {
    const model = published({keys: {0: {3: "PD_MODE_0", 4: "KC_A"}, 3: {3: "PD_MODE_0_LOCK"}},
        behaviours: [
            {keycode: "CUSTOM_KEY_0", steps: [{tapCount: 1, hold: held("PD_MODE_0")}]},
            {keycode: "CUSTOM_KEY_1", steps: [{tapCount: 0, tap: {action: "KC_ESC"}}]},
        ]});
    const found = whatReachesSlot(model, model.pdModes[0]);
    assert.equal(found.keys.length, 2, "both the hold and the lock keycode count");
    assert.deepEqual(found.layers, ["Base", "Navigation"]);
    assert.deepEqual(found.behaviours.map((row) => row.keycode), ["CUSTOM_KEY_0"]);
    assert.equal(holdKeyName(model.pdModes[6]), "PD_MODE_6", "slots past the named six use their number");
    assert.deepEqual(whatReachesSlot(model, undefined).keys, []);
});

test("an empty slot's bindings are found by the keyboard's own values, not by a name it has none of", () => {
    // A cleared slot has no name for the model to resolve, so its keys arrive
    // as whatever the catalogue calls the raw value. The slot still answers to
    // the same two numbers, so that is what the lookup matches on.
    assert.deepEqual(slotKeycodes(profile.pdModes[0]), [0x7e80, 0x7ea0], "hold and toggle for a named slot");
    assert.deepEqual(slotKeycodes(profile.pdModes[6]), [0x7e86, 0x7ea6], "and for a numbered one");
    assert.deepEqual(slotKeycodeNames(profile.pdModes[0]), ["PD_MODE_0", "PD_MODE_0_LOCK"], "and by name, hold then lock");
    const model = published({keys: {0: {5: "PD_MODE_6", 6: "KC_A"}},
        behaviours: [{keycode: "CUSTOM_KEY_0", steps: [{tapCount: 0, hold: held("PD_MODE_6")}]}]});
    const empty = model.pdModes[6];
    assert.equal(empty.kind, 0);
    const found = whatReachesSlot(model, empty);
    assert.equal(found.keys.length, 1, "the key bound to the empty slot is found");
    assert.deepEqual(found.behaviours.map((row) => row.keycode), ["CUSTOM_KEY_0"]);
});

// Core publishes a combo's output by the keyboard's name for the value (hex
// for a mode key) and its meaning in qmkKeycodeAliases, which comboOutput
// reads.
test("a combo sending an empty slot's key is found by what its output means", () => {
    const model = published({combos: [{inputs: ["KC_J", "KC_K"], output: "PD_MODE_6"}]});
    const empty = model.pdModes[6];
    assert.deepEqual(whatReachesSlot(model, empty).combos.map((row) => row.badge), ["C0"], "a combo output to an empty slot is inert too");
    assert.deepEqual(whatReachesSlot({combos: model.combos, qmkKeycodes: model.qmkKeycodes}, empty).combos.map((row) => row.badge), ["C0"],
        "a combo-only binding is still shown for an empty slot");
});

test("a branch keeps which of a pointing mode's two keycodes it sends", () => {
    // A slot answers to both a hold and a toggle keycode. Collapsing them to the
    // slot is right for saying which mode is reached, but the row has to keep
    // the difference or holding and toggling read the same.
    const model = published({keys: {0: {50: "PD_MODE_0"}}, behaviours: [{keycode: "PD_MODE_0", steps: [{tapCount: 0, hold: held("PD_MODE_0_LOCK")}]}]});
    const reach = pointingReach(model, model.layers, 0);

    assert.deepEqual(reach.onKeys.map((entry) => entry.name), ["0"], "the key holds the mode");
    assert.deepEqual(reach.fromBranches.map((entry) => entry.name), ["0"], "and its own behaviour toggles it");
    assert.deepEqual(reach.fromBranches[0].behaviours,
        [{keycode: "PD_MODE_0", action: "PD_MODE_0_LOCK", layer: null, whileHeld: false, cells: [{branch: 1, tier: "hold"}]}],
        "so the branch keeps the toggle keycode, not just the slot it lands on");
});

test("a combo reaches the pointing mode it sends", () => {
    const model = published({keys: {0: {0: "KC_J", 1: "KC_K"}}, combos: [{inputs: ["KC_J", "KC_K"], output: "PD_MODE_0"}], slots: onlySlots([0])});
    const reach = pointingReach(model, model.layers, 0);
    assert.deepEqual(reach.fromCombos.map((entry) => entry.name), ["0"]);
    assert.deepEqual(reach.elsewhere, []);
});

// Slot `id` set up as a mode called `name` (with the Arrow slot's settings)
// and this link: the layers that start it, the layers its key turns on and
// what ends a start (core/model/pointing-links.js publishes each slot's
// live starts from these, as linkStarts).
/** @param {number} id @param {string} name @param {{linkedLayers?: number, linkTurnsOn?: number, linkEnds?: number}} link */
const linkedMode = (id, name, link) => (/** @type {any[]} */ records) => {
    records[id] = {...structuredClone(records.find((record) => record.name === "Arrow") || records[4]), id, name, linkedLayers: 0, linkTurnsOn: 0, linkEnds: 0, ...link};
};
// Only the slots `ids`, each set up as given.
/** @param {number[]} ids @param {((records: any[]) => void)[]} modes */
const slotsOf = (ids, ...modes) => (/** @type {any[]} */ records) => { modes.forEach((mode) => mode(records)); onlySlots(ids)(records); };
// A custom key that turns on these layers, held.
const turningOn = (/** @type {string} */ keycode, /** @type {number} */ layers) => customKeyShortcutMessage(keycode, {layers, layerKind: SHORTCUT_LAYER_KINDS.HOLD});

test("a layer that starts a pointing mode reaches it on that layer, with no key", () => {
    // A slot's starting layers start its mode whenever one turns on (firmware
    // D-F62), so the layer reaches the mode by itself. The core leaves out of
    // linkStarts the layers the keyboard ignores in a link: here the pointer layer.
    const pointer = 4; // the test profile's pointer layer
    const model = published({keys: {0: {0: "KC_A"}, 1: {0: "PD_MODE_6"}, 2: {0: "KC_A"}, 3: {0: "PD_MODE_6"}, [pointer]: {0: "KC_A"}},
        slots: slotsOf([4, 5, 6], linkedMode(4, "Arrow", {linkedLayers: 1 << 3}), linkedMode(5, "Zoom", {linkedLayers: 1 << pointer}),
            linkedMode(6, "Scroll", {linkedLayers: (1 << 1) | (1 << 2)}))});
    const stack = model.layers;
    assert.deepEqual(model.pdModes[5].linkStarts, [], "the pointer layer starts nothing");

    const top = pointingReach(model, stack, 3);
    assert.deepEqual(top.onKeys.map((entry) => entry.name), ["6", "4"], "the key here, then the modes the layer starts");
    assert.deepEqual(top.onKeys.map((entry) => entry.starts?.map((layer) => layer.index)), [undefined, [3]]);
    assert.equal(top.onKeys[1].keys.length, 0, "a started mode rings no key");
    assert.deepEqual(top.elsewhere, ["5"]);
    assert.deepEqual(pointingReach(model, stack, pointer).onKeys, [], "a layer the keyboard ignores in a link starts nothing");
    const numbers = pointingReach(model, stack, 1).onKeys;
    assert.deepEqual(numbers.map((entry) => [entry.name, entry.keys.length, entry.starts?.map((layer) => layer.index)]), [["6", 1, [1]]],
        "a mode on a key here that the layer also starts names both");
    assert.deepEqual(pointingReach(model, stack, 2).onKeys.map((entry) => entry.name), ["6"]);
    assert.deepEqual(pointingReach(model, stack, 0).elsewhere, ["4", "5", "6"]);

    assert.deepEqual(pointingReachInView(model, stack, 2, []).map((entry) => entry.name), ["6"], "a layer shown alone starts its mode");
    assert.deepEqual(pointingReachInView(model, stack, 2, [3]).map((entry) => [entry.name, entry.starts?.map((layer) => layer.index)]),
        [["4", [3]], ["6", [2]]], "in a view, every layer on starts its mode, in slot order");
    assert.deepEqual(pointingReachInView(model, stack, 2, [1]).map((entry) => [entry.name, entry.starts?.map((layer) => layer.index)]),
        [["6", [1, 2]]], "a mode started by two layers both in view lists both");
});

test("a key that turns on a layer starting a pointing mode reaches the mode", () => {
    // Turning the layer on starts the mode, whatever turns it on: a layer key,
    // a custom key's shortcut layers, a pointing-mode key's link, a behaviour
    // branch or a combo sending one. What each keycode turns on is the core's
    // (qmkKeyTurnsOn), which leaves out DF and PDF.
    const keys = ["MO(3)", "CUSTOM_KEY_2", "KC_B", "DF(3)", "MO(2)", "KC_J", "KC_K", "PD_MODE_5"];
    const model = published({keys: {0: Object.fromEntries(keys.entries())},
        combos: [{inputs: ["KC_J", "KC_K"], output: "TO(3)"}],
        behaviours: [{keycode: "KC_B", steps: [{tapCount: 0, hold: held("TG(3)")}]}],
        slots: slotsOf([4, 5], linkedMode(4, "Arrow", {linkedLayers: 1 << 3}), linkedMode(5, "Zoom", {linkTurnsOn: 1 << 3})),
        edits: [turningOn("CUSTOM_KEY_2", 1 << 3)]});
    const stack = model.layers;
    for (const keycode of ["MO(3)", "TG(3)", "TO(3)", "CUSTOM_KEY_2", "PD_MODE_5"]) assert.equal(model.qmkKeyTurnsOn[keycode], 1 << 3, `core publishes what ${keycode} turns on`);

    const reach = pointingReach(model, stack, 0);
    const arrow = reach.onKeys.find((entry) => entry.name === "4");
    assert.deepEqual(arrow?.keys.map((key) => keyMeaning(key.position)), ["MO(3)", "CUSTOM_KEY_2", "PD_MODE_5"],
        "a layer key, a custom key's layers and another mode's key start it; DF and another layer do not");
    assert.deepEqual(arrow?.startVia, {"MO(3)": 1 << 3, "CUSTOM_KEY_2": 1 << 3, "PD_MODE_5": 1 << 3}, "each route says the layer it starts the mode through");
    assert.deepEqual(reach.fromBranches.find((entry) => entry.name === "4")?.behaviours.map((row) => row.action), ["TG(3)"]);
    assert.deepEqual(reach.fromCombos.find((entry) => entry.name === "4")?.combos.map((route) => route.action), ["TO(3)"]);
    assert.deepEqual(reach.onKeys.find((entry) => entry.name === "5")?.startVia, undefined, "Zoom's own key holds Zoom");
    assert.deepEqual(reachKeys(stack, 0, arrow), [0, 1, 7], "the board rings the keys that turn the layer on");
});

test("a route reaches a mode its layer starts only while no layer ending that start is on", () => {
    // What ends a mode its layers started (linkEnds, published as each start's
    // `ends`): a key pressed on a layer that ends the start, or one turning on
    // such a layer with it, starts nothing, as the keyboard runs it. A key a
    // transparent key answers from a layer held below has that layer on too.
    const model = published({keys: {0: {0: "MO(2)", 1: "CUSTOM_KEY_1"}, 1: {0: "MO(2)", 1: "KC_TRNS"}, 2: {0: "MO(2)", 1: "KC_TRNS"}, 3: {0: "MO(2)", 1: "KC_TRNS"}},
        slots: slotsOf([4], linkedMode(4, "Arrow", {linkedLayers: 1 << 2, linkEnds: PD_LINK_ENDS.HIGHER_LAYER})),
        edits: [turningOn("CUSTOM_KEY_1", (1 << 2) | (1 << 5))]});
    const stack = model.layers;
    assert.ok(model.pdModes[4].linkStarts[0].ends & (1 << 3), "a higher layer ends a start from layer 2");

    const base = pointingReach(model, stack, 0).onKeys.find((entry) => entry.name === "4");
    assert.deepEqual(base?.keys.map((key) => key.position.keycode), ["MO(2)"], "MO(2) on Base starts it; a key also turning on a higher layer ends it");
    assert.deepEqual(pointingReach(model, stack, 1).onKeys.map((entry) => entry.name), ["4"], "on a layer below the starting layer");
    assert.deepEqual(pointingReach(model, stack, 3).onKeys, [], "on a higher layer, which ends it");
    assert.ok(pointingReach(model, stack, 3).elsewhere.includes("4"));
    assert.deepEqual(pointingReachInView(model, stack, 1, [3]).map((entry) => entry.name), [], "a view with a higher layer on ends it");
    assert.deepEqual(pointingReachInView(model, stack, 2, []).map((entry) => entry.name), ["4"], "the starting layer shown alone starts it");
    assert.deepEqual(pointingReachInView(model, stack, 2, [3]), [], "and not with a higher layer held");
});
