import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {GROUP_ORDER, GROUP_TITLES, inGroupOrder, initialReachGroups, placementChips, placementOpening, reachRowId, reachRowOf, setReachGroupOpen} from "../../webview/view/reach-groups.mjs";
import {placementsOf} from "../../webview/view/reach.mjs";
import {macroMessage} from "../../webview/view/edits.mjs";

const {profileDocument, publishedModel} = createRequire(import.meta.url)("../fixtures/published-model.js");

// Base holds a macro key, a chord for a combo sending another macro, a custom
// key and a pointing-mode key; Numbers is transparent over all of them.
const T = "KC_TRANSPARENT";
const model = publishedModel(profileDocument({keys: {0: {0: "MACRO_0", 1: "KC_J", 2: "KC_K", 3: "CUSTOM_KEY_0", 4: "PD_MODE_0"}, 1: {0: T, 1: T, 2: T, 3: T, 4: T}},
    combos: [{inputs: ["KC_J", "KC_K"], output: "MACRO_1"}]}), {edits: [macroMessage("MACRO_0", "{KC_A}"), macroMessage("MACRO_1", "{KC_B}")]});

test("every reach group has a title and a place in the one order", () => {
    assert.deepEqual(Object.keys(GROUP_TITLES).sort(), [...GROUP_ORDER].sort());
    assert.deepEqual(inGroupOrder([{id: "elsewhere"}, {id: "here"}, {id: "through"}]).map((group) => group.id), ["here", "through", "elsewhere"],
        "a tab's groups come out in the shared order whatever order it lists them in");
    assert.equal(GROUP_ORDER[0], "key", "the selected key's combos lead, above what the layer reaches");
    assert.deepEqual(GROUP_ORDER.slice(1, 3), ["view", "here"], "the composed view precedes the strict layer routes");
});

test("reach sections share one state across Keys tabs and open independently", () => {
    const initial = initialReachGroups();
    assert.deepEqual(Object.keys(initial), GROUP_ORDER);
    assert.equal(initial.view, true);
    assert.equal(initial.here, false);
    const withLayer = setReachGroupOpen(initial, "here", true);
    const withCombos = setReachGroupOpen(withLayer, "combos", true);
    assert.equal(withCombos.view, true, "opening another route leaves the view open");
    assert.equal(withCombos.here, true, "opening a third route leaves this layer open");
    assert.equal(withCombos.combos, true);
    assert.equal(setReachGroupOpen(withCombos, "here", false).here, false,
        "collapsing a shared route is visible to every tab that has it");
    assert.equal(initial.here, false, "the initial state is not changed");
});

test("a picked row names the group it was picked under and what it lists", () => {
    assert.equal(reachRowId("here", "MACRO_0"), "here:MACRO_0");
    assert.equal(reachRowId("view", 4), "view:4");
    assert.deepEqual(reachRowOf(reachRowId("through", "MACRO_0")), {group: "through", name: "MACRO_0"});
    assert.deepEqual(reachRowOf("here:a:b"), {group: "here", name: "a:b"}, "a name may hold the separator");
});

test("a macro's or custom key's layers read as chips saying how each reaches it, and open on the route's row", () => {
    // Two keys carry MACRO_2 on Base and a combo on its keys sends it.
    const placed = publishedModel(profileDocument({keys: {0: {0: "MACRO_2", 1: "MACRO_2", 2: "KC_J", 3: "KC_K"}},
        combos: [{inputs: ["KC_J", "KC_K"], output: "MACRO_2"}]}), {edits: [macroMessage("MACRO_2", "{KC_A}")]});
    const placements = placementsOf(placed, "macros", "MACRO_2");
    assert.deepEqual(placementChips(placements).map(({at, how}) => [at, how]), [[0, "key ×2 · combo"]]);
    assert.deepEqual(placementOpening(placements, "MACRO_2", 0), {layer: 0, selected: 0, group: "here", row: "here:MACRO_2"},
        "the first route's row, with its first key picked");
    assert.equal(placementOpening(placements, "MACRO_2", 1), null, "a layer it is not placed on opens nothing");
    // A custom key reached on Numbers only through Base's key, under a
    // transparent one, is placed on Base alone, by its one key.
    const custom = placementsOf(model, "customKeys", "CUSTOM_KEY_0");
    assert.deepEqual(placementChips(custom).map(({layer, at, how}) => [layer.index, at, how]), [[0, 0, "key"]]);
    assert.deepEqual(placementOpening(custom, "CUSTOM_KEY_0", 0), {layer: 0, selected: 3, group: "here", row: reachRowId("here", "CUSTOM_KEY_0")});
});
