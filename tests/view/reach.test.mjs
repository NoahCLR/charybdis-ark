import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {keyMeaning, behaviourFor} from "../../webview/view/keyface.mjs";
import {combosForKey} from "../../webview/view/combo-reach.mjs";
import {reachKeys, reachText, macroNamesOf, customKeyNamesOf, reachInView, macroPlacements, customKeyPlacements, placementsOf, macroReach} from "../../webview/view/reach.mjs";
import {layerView} from "../../webview/view/layer-view.mjs";
import {pointingReach, pointingSlotFor} from "../../webview/view/pointing-reach.mjs";
import {customKeyNameMessage, customKeyShortcutMessage, macroMessage} from "../../webview/view/edits.mjs";
import {published} from "../fixtures/published-behaviours.mjs";

const {keyAt} = createRequire(import.meta.url)("../fixtures/published-model.js");

// The reach views read what core publishes for a profile (published): its
// layers with their answers, its combos and the reach core works out for
// them, its behaviours, macros and pointing slots.
// A branch held: the tier runs while the key is held.
const held = (/** @type {string} */ action) => ({style: "PRESS_AND_HOLD_UNTIL_RELEASE", action});
// A behaviour on `keycode` that sends X on a double tap: a row that changes something.
const behaviourOn = (/** @type {string} */ keycode) => ({keycode, steps: [{tapCount: 1, tap: {action: "KC_X"}}]});
// The test profile as it ships: Dragscroll, Volume, Brightness, Zoom, Arrow
// and Pinch in slots 0 to 5, every later slot empty, no macros.
const profile = published();

test("macro and pointing-mode keycodes resolve to the slots the keyboard reported", () => {
    const model = profile;
    assert.deepEqual(macroNamesOf(model)("MACRO_11"), ["MACRO_11"]);
    assert.deepEqual(macroNamesOf(model)("QK_MACRO_11"), ["MACRO_11"], "by the name the profile knows it by");
    assert.deepEqual(macroNamesOf(model)("KC_A"), []);
    assert.deepEqual(macroNamesOf({})("MACRO_11"), [], "which keycodes are macros' is core's (qmkKeyKinds), not read out of a name");
    for (const name of ["MC_11", "0x770B", "0x770b"]) assert.deepEqual(macroNamesOf(model)(name), ["MACRO_11"], `${name}: any name the keycode is read by`);
    assert.deepEqual(macroNamesOf(model)("0x7728"), ["MACRO_40"], "a slot QMK names nothing by its number");
    for (const name of ["CUSTOM_KEY_5", "0x7F05", "0x7f05"]) assert.deepEqual(customKeyNamesOf(model)(name), ["CUSTOM_KEY_5"], `${name}: a custom key by any spelling`);
    assert.deepEqual(customKeyNamesOf(model)("0x770B"), [], "a macro is no custom key");
    assert.equal(pointingSlotFor(model, "PD_MODE_0").name, "Dragscroll");
    assert.equal(pointingSlotFor(model, "PD_MODE_0_LOCK").name, "Dragscroll", "the lock keycode reaches the same slot");
    assert.equal(pointingSlotFor(model, "PD_MODE_6").id, 6);
    assert.equal(pointingSlotFor(model, "KC_A"), undefined);
});

test("what a key reaches is looked up by what its value means", () => {
    // The keyboard stores a behaviour target, a macro and a pointing mode as
    // plain user keycodes; every domain that refers back to them uses the
    // semantic name. A lookup that matched the stored name would find nothing.
    const model = published({keys: {0: {3: "PD_MODE_0", 4: "MACRO_0", 5: "KC_F"}}, combos: [{inputs: ["MACRO_0", "KC_F"], output: "KC_ESC"}],
        behaviours: [{keycode: "PD_MODE_0", steps: [{tapCount: 1, hold: held("KC_ESC")}]}]});
    const pointingKey = keyAt(model, 0, 3), macroKey = keyAt(model, 0, 4);
    assert.notEqual(pointingKey.keycode, "PD_MODE_0", "the keyboard's own name for the value");

    assert.equal(keyMeaning(pointingKey), "PD_MODE_0");
    assert.equal(keyMeaning({keycode: "KC_A"}), "KC_A", "an ordinary key means itself");
    assert.equal(keyMeaning(undefined), "");
    assert.equal(behaviourFor(model, keyMeaning(pointingKey)).keycode, "PD_MODE_0");
    assert.deepEqual(macroNamesOf(model)(keyMeaning(macroKey)), ["MACRO_0"]);
    assert.equal(pointingSlotFor(model, keyMeaning(pointingKey)).name, "Dragscroll");
    assert.deepEqual(combosForKey(model, macroKey).map((combo) => combo.badge), ["C0"],
        "a combo on the macro key still finds its key");
});

test("the view follows the exact previewed stack while the layer groups stay strict", () => {
    const model = published({keys: {0: {0: "KC_A", 1: "KC_B", 2: "MACRO_0"}, 1: {0: "KC_C", 1: "KC_TRANSPARENT", 2: "KC_NO"}, 2: {0: "KC_TRANSPARENT", 1: "KC_TRANSPARENT", 2: "KC_TRANSPARENT"}},
        combos: [{inputs: ["KC_A", "KC_B"], output: "MACRO_2"}, {inputs: ["KC_C", "KC_B"], output: "MACRO_3"}],
        behaviours: [{keycode: "KC_B", steps: [{tapCount: 0, tap: {action: "MACRO_1"}}]}, {keycode: "KC_C", steps: [{tapCount: 0, hold: held("PD_MODE_4")}]}]});
    const macroNames = (/** @type {number[]} */ held) => reachInView(layerView(model, 2, held), macroNamesOf(model)).map((entry) => entry.name);
    assert.deepEqual(layerView(model, 2).behaviours.groups.here, [], "nothing is stored on Symbols");
    // Shown alone, Symbols is the whole view, and every key on it is
    // transparent or empty: base is not on until layers are previewed together.
    assert.deepEqual(layerView(model, 2).behaviours.inView, [], "nothing on Symbols alone");
    assert.deepEqual(layerView(model, 2).combos.inView, []);
    assert.deepEqual(macroNames([]), []);
    assert.deepEqual(layerView(model, 2, [0]).behaviours.inView.map((entry) => entry.row.keycode), ["KC_B"], "with base previewed on");
    assert.deepEqual(layerView(model, 2, [1]).behaviours.inView.map((entry) => entry.row.keycode), ["KC_C", "KC_B"]);
    assert.deepEqual(layerView(model, 2, [0]).combos.inView.map((entry) => entry.combo.id), [0]);
    assert.deepEqual(layerView(model, 2, [1]).combos.inView.map((entry) => entry.combo.id), [1],
        "a combo's inputs must coexist in this activation");
    assert.deepEqual(macroNames([0]), ["MACRO_1", "MACRO_0", "MACRO_2"]);
    assert.deepEqual(macroNames([1]), ["MACRO_1", "MACRO_3"]);
    const modes = (/** @type {number[]} */ held) => reachInView(layerView(model, 2, held), (/** @type {string} */ keycode) => { const slot = pointingSlotFor(model, keycode); return slot ? [String(slot.id)] : []; });
    assert.deepEqual(modes([]), []);
    assert.deepEqual(modes([1]).map((entry) => entry.name), ["4"], "a visible behaviour's branch reaches the mode");
    const branch = reachInView(layerView(model, 2, [1]), macroNamesOf(model)).find((entry) => entry.name === "MACRO_1");
    assert.deepEqual(reachKeys(layerView(model, 2, [1]), branch, true), [1], "the view route rings only visible source keys");
    assert.deepEqual(layerView(model, 2, [1]).behaviours.routeKeys("KC_C", "view"), [0]);
    assert.deepEqual(layerView(model, 2).behaviours.routeKeys("KC_C", "view"), []);
});

test("a macro fired from a behaviour branch is reached, though no key shows it", () => {
    const model = published({keys: {0: {0: "KC_ESCAPE", 1: "MACRO_0", 2: "KC_B"}, 1: {0: "KC_TRANSPARENT", 1: "KC_TRANSPARENT", 2: "KC_NO"}},
        behaviours: [{keycode: "KC_ESCAPE", steps: [{tapCount: 1, tap: {action: "MACRO_1"}}]}, {keycode: "KC_B", steps: [{tapCount: 0, longHold: held("MACRO_2")}]}],
        edits: ["{KC_A}", "{KC_B}", "{KC_C}"].map((payload, n) => macroMessage(`MACRO_${n}`, payload))});

    const base = macroReach(layerView(model, 0));
    assert.deepEqual(base.onKeys.map((entry) => entry.name), ["MACRO_0"], "the only macro a key carries");
    assert.deepEqual(base.throughKeys, [], "the base layer has nothing under it to fall through to");
    assert.deepEqual(base.fromBranches.map((entry) => entry.name), ["MACRO_1", "MACRO_2"],
        "both branches are found, tap and long hold alike");
    assert.deepEqual(base.fromBranches[0].behaviours,
        [{keycode: "KC_ESCAPE", action: "MACRO_1", layer: null, whileHeld: false, cells: [{branch: 2, tier: "tap"}]}],
        "named by the behaviour that fires it, the cell that does and what it sends");
    assert.deepEqual(base.fromBranchesBelow, [], "nothing lies under the base layer to reach a behaviour through");
    assert.deepEqual(base.elsewhere, [], "an empty slot is not a macro this layer is missing");

    const above = macroReach(layerView(model, 1));
    assert.deepEqual(above.onKeys, [], "no key on Numbers carries a macro itself");
    assert.deepEqual(above.throughKeys.map((entry) => entry.name), ["MACRO_0"],
        "a transparent key lets the macro key underneath answer");
    assert.equal(above.throughKeys[0].keys[0].layer.displayName, "Base", "and the group names the layer it came from");
    assert.deepEqual(above.fromBranches, [], "no behaviour mapped on Numbers sends a macro");
    assert.equal(above.fromBranchesBelow.find((entry) => entry.name === "MACRO_1").behaviours[0].layer.displayName,
        "Base", "and the entry names the layer holding that behaviour, since this one does not");
    assert.deepEqual(above.elsewhere, ["MACRO_2"],
        "KC_NO on the layer being viewed is the top answer, so KC_B on Base is not reached");
});

test("a thing reached several ways is listed under each of them", () => {
    const model = published({keys: {0: {0: "KC_ESCAPE", 1: "MACRO_1", 2: "KC_X"}, 1: {0: "KC_ESCAPE", 1: "KC_TRANSPARENT", 2: "KC_B"}},
        behaviours: [{keycode: "KC_ESCAPE", steps: [{tapCount: 1, tap: {action: "MACRO_0"}}]}, {keycode: "KC_B", steps: [{tapCount: 1, tap: {action: "MACRO_1"}}]}],
        edits: ["{KC_A}", "{KC_B}"].map((payload, n) => macroMessage(`MACRO_${n}`, payload))});

    // MACRO_1 sits on a key below and is also fired by KC_B, a behaviour
    // mapped on Numbers itself. Both are real ways to reach it, so both are
    // answered — each entry carrying only the route it is filed under.
    const above = macroReach(layerView(model, 1));
    assert.deepEqual(above.onKeys, [], "no macro keycode is on a key of Numbers");
    assert.deepEqual(above.fromBranches.map((entry) => entry.name).sort(), ["MACRO_0", "MACRO_1"]);
    assert.deepEqual(above.throughKeys.map((entry) => entry.name), ["MACRO_1"],
        "the key below is a second way to the same macro, not a lost one");
    assert.deepEqual(above.throughKeys[0].behaviours, [],
        "and that entry answers for the key alone, so picking it rings only that key");
    assert.deepEqual(above.fromBranches.find((entry) => entry.name === "MACRO_1").keys, []);
    assert.deepEqual(above.elsewhere, []);
});

test("reach lists read down the stack, the default layer first", () => {
    // Each layer under the top one answers a different position, so the order
    // the rows come back in is the order of the layers that answer them.
    const model = published({keys: {
        0: {0: "MACRO_2", 1: "KC_NO", 2: "KC_NO", 3: "KC_C"},
        1: {0: "KC_NO", 1: "MACRO_1", 2: "KC_NO", 3: "KC_B"},
        2: {0: "KC_NO", 1: "KC_NO", 2: "MACRO_0", 3: "KC_A"},
        3: {0: "KC_TRANSPARENT", 1: "KC_TRANSPARENT", 2: "KC_TRANSPARENT", 3: "KC_TRANSPARENT"},
    }, behaviours: ["KC_A", "KC_B", "KC_C"].map(behaviourOn), edits: [0, 1, 2].map((n) => macroMessage(`MACRO_${n}`, "{KC_A}"))});
    const stack = model.layers;

    assert.deepEqual(macroReach(layerView(model, 3)).throughKeys.map((entry) => entry.keys[0].layer.displayName),
        ["Base", "Numbers", "Symbols"], "macros answered lower in the stack come first");
    assert.deepEqual(layerView(model, 3).behaviours.groups.through.map((entry) => entry.layer.displayName),
        ["Base", "Numbers", "Symbols"], "and so do behaviours");
});

test("a branch route names every cell that sends it, once", () => {
    // A row says which cell fires the thing ("2× hold"), so a behaviour that
    // sends it from two cells is one route with both, and a key the stack
    // reaches twice does not list a cell twice.
    const model = published({keys: {0: {0: "KC_Q", 1: "KC_Q", 2: "KC_D", 3: "KC_F"}},
        combos: [{inputs: ["KC_D", "KC_F"], output: "KC_RIGHT_ALT", useOutputBehavior: true}],
        behaviours: [
            {keycode: "KC_Q", steps: [{tapCount: 0, longHold: held("PD_MODE_3")}, {tapCount: 1, hold: held("PD_MODE_3"), tap: {action: "PD_MODE_3_LOCK"}}]},
            {keycode: "KC_RIGHT_ALT", steps: [{tapCount: 0, tap: {action: "PD_MODE_3_LOCK"}}]},
        ]});
    const names = (/** @type {string} */ keycode) => { const slot = pointingSlotFor(model, keycode); return slot ? [String(slot.id)] : []; };

    const [zoom] = reachInView(layerView(model, 0), names);
    assert.deepEqual(zoom.behaviours.map(({action, cells}) => [action, cells]), [
        ["PD_MODE_3", [{branch: 1, tier: "long"}, {branch: 2, tier: "hold"}]],
        ["PD_MODE_3_LOCK", [{branch: 2, tier: "tap"}]],
    ], "one route per keycode sent, each with its cells, though two keys carry the behaviour");
    assert.deepEqual(zoom.combos.map(({via, action, cells}) => [via, action, cells]), [["KC_RIGHT_ALT", "PD_MODE_3_LOCK", [{branch: 1, tier: "tap"}]]],
        "a combo through a behaviour names the cell of that behaviour");

    const groups = pointingReach(layerView(model, 0));
    assert.deepEqual(groups.fromBranches[0].behaviours.map(({cells}) => cells),
        [[{branch: 1, tier: "long"}, {branch: 2, tier: "hold"}], [{branch: 2, tier: "tap"}]], "the grouped routes carry the same cells");
    assert.deepEqual(groups.fromCombos[0].combos.map(({cells}) => cells), [[{branch: 1, tier: "tap"}]]);
});

test("a combo reaches the macro it sends, and what a behaviour it sends reaches", () => {
    // A combo's output runs through the same stages a key press does: it can
    // fire a macro itself, or fire a behaviour whose branch plays one. Neither
    // is on any key, so without this both read as unreachable.
    const described = (/** @type {boolean} */ useOutputBehavior) => ({keys: {0: {0: "KC_J", 1: "KC_K", 2: "KC_L"}, 1: {0: "KC_TRANSPARENT", 1: "KC_K", 2: "KC_1"}},
        // A macro has no behaviour; the behaviour C1 sends runs on every layer.
        combos: [{inputs: ["KC_J", "KC_K"], output: "MACRO_0"}, {inputs: ["KC_J", "KC_L"], output: "CUSTOM_KEY_0", useOutputBehavior}],
        behaviours: [{keycode: "CUSTOM_KEY_0", steps: [{tapCount: 1, hold: held("MACRO_1")}]}],
        edits: ["{KC_A}", "{KC_B}", "{KC_C}"].map((payload, n) => macroMessage(`MACRO_${n}`, payload))});
    const model = published(described(true));
    assert.notEqual(model.combos[0].output, "MACRO_0", "the combo's output is the keyboard's name for the value");

    const base = macroReach(layerView(model, 0));
    assert.deepEqual(base.fromCombos.map((entry) => entry.name), ["MACRO_0", "MACRO_1"]);
    assert.deepEqual(base.fromCombos[0].combos.map((route) => [route.combo.badge, route.via, route.action]),
        [["C0", null, "MACRO_0"]], "sent by the combo itself, matched by meaning rather than the catalogue name");
    assert.deepEqual(base.fromCombos[1].combos.map((route) => [route.combo.badge, route.via, route.action]),
        [["C1", "CUSTOM_KEY_0", "MACRO_1"]], "sent by a branch of the behaviour the combo fires");
    assert.deepEqual(base.elsewhere, ["MACRO_2"], "a combo's macro is no longer called unreachable");
    assert.deepEqual(reachKeys(layerView(model, 0), base.fromCombos[0]).sort(), [0, 1], "the board rings the keys chorded to fire it");

    const above = macroReach(layerView(model, 1));
    assert.deepEqual(above.fromCombos, [], "on Numbers C0 needs the transparent J, so it is not this layer's own");
    assert.deepEqual(above.fromCombosBelow.map((entry) => entry.name), ["MACRO_0"]);
    assert.deepEqual(above.elsewhere, ["MACRO_1", "MACRO_2"], "C1 needs L, and Numbers stores 1 there");

    // Core publishes no layers while its output behaviour is off
    // (tests/model/participation.test.js says when).
    const bypassed = published(described(false));
    assert.equal(bypassed.combos[1].outputBehaviorLayers, 0);
    assert.deepEqual(layerView(bypassed, 0).behaviours.groups.combos, []);
    assert.deepEqual(layerView(bypassed, 0).behaviours.inView.filter((entry) => entry.combos.length), []);
    assert.deepEqual(macroReach(layerView(bypassed, 0)).fromCombos.map((entry) => entry.name), ["MACRO_0"], "a bypassed output retains the directly sent macro");
    assert.deepEqual(reachInView(layerView(bypassed, 0), macroNamesOf(bypassed)).map((entry) => entry.name), ["MACRO_0"]);
});

test("cold macro placement lookup avoids combinations of layers that cannot change combo answers", () => {
    const keys = Object.fromEntries(Array.from({length: 16}, (_, layer) => [layer, {0: "KC_A", 1: "KC_B"}]));
    for (const combos of [[], [{inputs: ["KC_A", "KC_B"], output: "MACRO_0"}]]) {
        const model = published({keys, combos});
        let reads = 0;
        // The published layers, counting each read of their keys.
        const counted = {...model, layers: model.layers.map((/** @type {any} */ layer) => Object.defineProperty({...layer}, "positions", {get() { reads++; return layer.positions; }}))};
        const placements = macroPlacements(counted, "MACRO_0");
        assert.equal(placements.length, combos.length ? 16 : 0);
        assert.ok(reads < 1000, `cold lookup read layers ${reads} times`);
    }
});

test("a macro's layers are the ones that hold a way to it themselves", () => {
    const model = published({keys: {0: {0: "MACRO_1", 1: "KC_A", 2: "MACRO_1"}, 1: {0: "KC_TRANSPARENT", 1: "KC_ESCAPE", 2: "KC_NO"}, 2: {0: "KC_B", 1: "MACRO_1", 2: "KC_C"}},
        combos: [{inputs: ["KC_B", "KC_C"], output: "MACRO_3"}],
        behaviours: [{keycode: "KC_ESCAPE", steps: [{tapCount: 1, tap: {action: "MACRO_2"}}]}],
        edits: [1, 2, 3, 10].map((n) => macroMessage(`MACRO_${n}`, "{KC_A}"))});
    const stack = model.layers;
    const summary = (/** @type {string} */ keycode) => macroPlacements(model, keycode)
        .map((entry) => [entry.layer.displayName, entry.at, entry.routes.map((route) => [route.group, route.keys.sort()])]);

    assert.deepEqual(summary("MACRO_1"), [["Base", 0, [["here", [0, 2]]]], ["Symbols", 2, [["here", [1]]]]],
        "a key naming it, with the stack position a screen selects; Numbers only falls through to Base's");
    assert.deepEqual(summary("MACRO_2"), [["Numbers", 1, [["branches", [1]]]]],
        "a behaviour mapped there sends it, and the board rings the behaviour's key");
    assert.deepEqual(summary("MACRO_3"), [["Symbols", 2, [["combos", [0, 2]]]]],
        "a combo firing from that layer's keys sends it");
    assert.deepEqual(summary("MACRO_10"), [], "MACRO_1 does not match MACRO_10");
    assert.deepEqual(macroPlacements({...model, layers: undefined}, "MACRO_1"), []);
});

test("a custom key's layers are the ones where a key carries it or a combo sends it", () => {
    const model = published({keys: {0: {0: "CUSTOM_KEY_0", 1: "KC_B", 2: "KC_C"}, 1: {0: "KC_TRANSPARENT", 1: "CUSTOM_KEY_1", 2: "KC_NO"}},
        combos: [{inputs: ["KC_B", "KC_C"], output: "CUSTOM_KEY_2"}],
        edits: [0, 1, 2].map((slot) => customKeyNameMessage(`CUSTOM_KEY_${slot}`, `Key ${slot}`))});
    const summary = (/** @type {string} */ keycode) => customKeyPlacements(model, keycode)
        .map((entry) => [entry.layer.displayName, entry.at, entry.routes.map((route) => [route.group, route.keys.sort()])]);
    assert.deepEqual(summary("CUSTOM_KEY_0"), [["Base", 0, [["here", [0]]]]], "Numbers only falls through to Base's");
    assert.deepEqual(summary("CUSTOM_KEY_1"), [["Numbers", 1, [["here", [1]]]]]);
    assert.deepEqual(summary("CUSTOM_KEY_2"), [["Base", 0, [["combos", [1, 2]]]]], "a combo firing from Base's keys sends it");
});

test("a macro or custom key is placed by the Keymap tab that lists it", () => {
    const model = published({keys: {0: {0: "MACRO_1", 1: "CUSTOM_KEY_0"}}});
    assert.deepEqual(placementsOf(model, "macros", "MACRO_1"), macroPlacements(model, "MACRO_1"));
    assert.deepEqual(placementsOf(model, "customKeys", "CUSTOM_KEY_0"), customKeyPlacements(model, "CUSTOM_KEY_0"));
    assert.deepEqual(placementsOf(model, "customKeys", "CUSTOM_KEY_0").map((entry) => entry.at), [0]);
    assert.deepEqual(placementsOf(model, "macros", "CUSTOM_KEY_0"), [], "a tab finds only its own kind");
});

test("a custom key is placed wherever it is sent, unnamed and with nothing but a shortcut, or by a behaviour step", () => {
    const model = published({keys: {0: {0: "CUSTOM_KEY_0", 1: "KC_A"}},
        behaviours: [{keycode: "KC_A", steps: [{tapCount: 1, tap: {action: "CUSTOM_KEY_1"}}]}],
        edits: [customKeyShortcutMessage("CUSTOM_KEY_0", {mods: 0x41, keys: [0x0e]})]});
    assert.equal(model.customKeys[0].name, "", "unnamed");
    const groups = (/** @type {string} */ keycode) => customKeyPlacements(model, keycode).map((entry) => entry.routes.map((route) => route.group));
    assert.deepEqual(groups("CUSTOM_KEY_0"), [["here"]], "an unnamed key with only a shortcut is placed");
    assert.deepEqual(groups("CUSTOM_KEY_1"), [["branches"]], "a behaviour step sending it places it");
});

test("a reach says where its keys come from, and a combo reached on this layer alone says so", () => {
    assert.equal(reachText({named: ["A", "B"], sources: ["Base"], matched: []}), "A, B · on Base");
    assert.equal(reachText({named: ["A"], sources: [], matched: ["Nav"]}), "A · matched on Nav");
    assert.equal(reachText({}), "—", "a key list with nothing in it");
    // A combo's row names its inputs already: only where they come from.
    assert.equal(reachText({named: ["A"], sources: ["Base when held"], matched: []}, {names: false}), "on Base when held");
    assert.equal(reachText({named: ["A"], sources: [], matched: ["Nav"]}, {names: false}), "matched on Nav");
    assert.equal(reachText({named: [], sources: [], matched: []}, {names: false}), "this layer", "every input on the layer in view: never blank");
});
