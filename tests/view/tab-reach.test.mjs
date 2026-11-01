import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {tabReach} from "../../webview/view/tab-reach.mjs";
import {layerView} from "../../webview/view/layer-view.mjs";
import {GROUP_ORDER, reachRowId} from "../../webview/view/reach-groups.mjs";
import {macroMessage} from "../../webview/view/edits.mjs";
import {published} from "../fixtures/published-behaviours.mjs";

const {profileDocument, publishedModel} = createRequire(import.meta.url)("../fixtures/published-model.js");

// Base holds a macro key, a chord for a combo sending another macro, a custom
// key and a pointing-mode key; Numbers is transparent over all of them.
const T = "KC_TRANSPARENT";
const model = publishedModel(profileDocument({keys: {0: {0: "MACRO_0", 1: "KC_J", 2: "KC_K", 3: "CUSTOM_KEY_0", 4: "PD_MODE_0"}, 1: {0: T, 1: T, 2: T, 3: T, 4: T}},
    combos: [{inputs: ["KC_J", "KC_K"], output: "MACRO_1"}]}), {edits: [macroMessage("MACRO_0", "{KC_A}"), macroMessage("MACRO_1", "{KC_B}")]});
// A behaviour on A, on Base; Numbers is transparent over it.
const behaviours = published({keys: {0: {0: "KC_A", 1: "KC_B"}, 1: {0: T, 1: "KC_B"}},
    behaviours: [{keycode: "KC_A", steps: [{tapCount: 1, tap: {action: "KC_X"}}]}]});

/** @param {import("../../webview/view/keyface-types.js").ViewModel} profile @param {number} at @param {number[]} held @param {string} tab */
const reachOf = (profile, at, held, tab) => tabReach(layerView(profile, at, held), tab);

test("each tab lists its groups in the one order, each saying what it lists when it lists nothing", () => {
    /** @param {string} tab */
    const ids = (tab) => reachOf(model, 0, [], tab).groups.map((group) => group.id);
    for (const tab of ["macros", "customKeys", "pointing"]) {
        assert.deepEqual(ids(tab), ["view", "here", "branches", "combos", "through", "belowBranches", "belowCombos", "elsewhere"], tab);
    }
    assert.deepEqual(ids("behaviours"), ["view", "here", "combos", "through", "belowCombos", "elsewhere"]);
    assert.deepEqual(ids("combos"), ["view", "here", "through", "elsewhere"], "the selected key's combos are the Combos tab's own cut");
    for (const tab of ["macros", "customKeys", "pointing", "behaviours", "combos"]) {
        assert.ok(ids(tab).every((id) => GROUP_ORDER.includes(id)), tab);
        assert.ok(reachOf(model, 0, [], tab).groups.every((group) => group.empty), `${tab}: every group says something when empty`);
    }
    assert.equal(reachOf(model, 0, [], "macros").groups.find((group) => group.id === "through")?.empty, "No transparent key falls through to a macro key.");
    assert.equal(reachOf(model, 0, [], "pointing").groups.find((group) => group.id === "through")?.empty, "No transparent key falls through to a pointing-mode key.");
    const here = (/** @type {import("../../webview/view/keyface-types.js").ViewModel} */ profile) => reachOf(profile, 0, [], "combos").groups.find((group) => group.id === "here")?.empty;
    assert.equal(here(model), "No combo has all of its inputs on this layer.");
    assert.equal(here({...model, comboReadback: {state: "unread"}}), "Combos have not been read from this keyboard.",
        "before the combos are read, not that none is there");
    assert.deepEqual(reachOf(model, 0, [], "key").groups, [], "a tab with no reach rows lists nothing");
});

test("a group lists what it reaches by name, and what the layer reaches no way as entries with no route", () => {
    const groups = Object.fromEntries(reachOf(model, 1, [], "macros").groups.map((group) => [group.id, group.entries.map((entry) => entry.name)]));
    assert.deepEqual(groups.through, ["MACRO_0"]);
    assert.deepEqual(groups.belowCombos, ["MACRO_1"]);
    assert.deepEqual(groups.here, []);
    assert.deepEqual(reachOf(model, 0, [], "macros").groups.find((group) => group.id === "elsewhere")?.entries, []);
    const combos = reachOf(model, 1, [], "combos").groups;
    assert.deepEqual(combos.find((group) => group.id === "through")?.entries.map((entry) => [entry.name, entry.combo.id]), [["0", 0]], "a combo is named by its id");
    const rows = reachOf(behaviours, 1, [], "behaviours").groups;
    assert.deepEqual(rows.find((group) => group.id === "through")?.entries.map((entry) => [entry.name, entry.layer?.index]), [["KC_A", 0]],
        "a behaviour by its keycode, with the layer answering for it");
    assert.equal(reachOf(model, 0, [], "macros"), reachOf(model, 0, [], "macros"), "one view's reach is worked out once");
});

test("a picked row rings the keys of the route it was picked under", () => {
    /** @param {number} at @param {number[]} held @param {string} tab @param {string | null} picked */
    const rings = (at, held, tab, picked) => reachOf(model, at, held, tab).keysFor(picked);
    assert.deepEqual(rings(0, [], "macros", "here:MACRO_0"), [0]);
    assert.deepEqual(rings(0, [], "macros", "combos:MACRO_1"), [1, 2], "the chord of the combo sending it");
    assert.deepEqual(rings(1, [], "macros", "through:MACRO_0"), [0], "the transparent key it falls through");
    assert.deepEqual(rings(1, [], "macros", "here:MACRO_0"), [], "a route the layer does not have");
    assert.deepEqual(rings(1, [], "macros", "belowCombos:MACRO_1"), [1, 2]);
    assert.deepEqual(rings(1, [], "macros", "view:MACRO_0"), [], "On this view: Numbers alone has no macro key");
    assert.deepEqual(rings(1, [0, 1], "macros", "view:MACRO_0"), [0], "with Base on in the view");
    assert.deepEqual(rings(0, [], "combos", "here:0"), [1, 2]);
    assert.deepEqual(rings(1, [], "combos", "through:0"), [1, 2]);
    assert.deepEqual(rings(1, [], "combos", "key:0"), [1, 2], "a combo is found by its id under any group of the layer");
    assert.deepEqual(rings(1, [], "combos", "view:0"), []);
    assert.deepEqual(rings(1, [0, 1], "combos", "view:0"), [1, 2]);
    assert.deepEqual(rings(0, [], "customKeys", "here:CUSTOM_KEY_0"), [3]);
    assert.deepEqual(rings(0, [], "pointing", "here:0"), [4]);
    assert.deepEqual(rings(1, [], "pointing", "through:0"), [4]);
    assert.deepEqual(rings(0, [], "macros", "here:MACRO_9"), [], "a row the layer does not list");
    assert.deepEqual(rings(0, [], "macros", "elsewhere:MACRO_0"), [], "a row reached no way rings nothing");
    assert.deepEqual(rings(0, [], "macros", null), [], "nothing picked");
    assert.deepEqual(rings(0, [], "key", "here:0"), [], "a tab with no reach rows");
});

test("a behaviour rings by the route it was picked under, and every way to it when picked under none", () => {
    /** @param {number} at @param {string} picked */
    const rings = (at, picked) => reachOf(behaviours, at, [], "behaviours").keysFor(picked);
    assert.deepEqual(rings(0, reachRowId("here", "KC_A")), [0]);
    assert.deepEqual(rings(1, reachRowId("here", "KC_A")), [], "Numbers does not carry it");
    assert.deepEqual(rings(1, reachRowId("through", "KC_A")), [0], "the transparent key it falls through");
    assert.deepEqual(rings(1, reachRowId("", "KC_A")), [0], "a behaviour selected anywhere but its row");
    assert.deepEqual(rings(1, reachRowId("elsewhere", "KC_A")), []);
});

test("a tab counts what the layer stores, not what it reaches under a transparent key", () => {
    /** @param {import("../../webview/view/keyface-types.js").ViewModel} profile @param {number} at @param {string} tab */
    const count = (profile, at, tab) => reachOf(profile, at, [], tab).count;
    assert.equal(count(model, 0, "macros"), 2, "a macro on a key and one a combo sends");
    assert.equal(count(model, 1, "macros"), 0, "Numbers stores none of them");
    assert.equal(count(model, 0, "customKeys"), 1);
    assert.equal(count(model, 0, "pointing"), 1);
    assert.equal(count(model, 1, "pointing"), 0);
    assert.equal(count(model, 0, "combos"), 1);
    assert.equal(count(model, 1, "combos"), 0, "a combo completed through a transparent key");
    assert.equal(count(behaviours, 0, "behaviours"), 1);
    assert.equal(count(behaviours, 1, "behaviours"), 0);
    assert.equal(count(model, 0, "key"), 0, "a tab with no reach rows");
    // MACRO_1 on a key of Base and sent by a behaviour on another.
    const twice = published({keys: {0: {0: "MACRO_1", 1: "KC_B"}}, behaviours: [{keycode: "KC_B", steps: [{tapCount: 1, tap: {action: "MACRO_1"}}]}],
        edits: [macroMessage("MACRO_1", "{KC_A}")]});
    assert.deepEqual(reachOf(twice, 0, [], "macros").groups.filter((group) => group.entries.length).map((group) => group.id), ["view", "here", "branches"]);
    assert.equal(count(twice, 0, "macros"), 1, "one thing reached two ways counts once");
});

test("a row asked for by name is found under the first group listing it", () => {
    assert.equal(reachOf(model, 1, [], "combos").groupOf(0), "through");
    assert.equal(reachOf(model, 1, [0, 1], "combos").groupOf("0"), "view", "On this view comes first");
    assert.equal(reachOf(model, 0, [], "combos").groupOf(7), undefined, "a combo the profile does not have");
    assert.equal(reachOf(behaviours, 1, [], "behaviours").groupOf("KC_A"), "through");
    assert.equal(reachOf(behaviours, 1, [0], "behaviours").groupOf("KC_A"), "view");
    assert.equal(reachOf(model, 0, [], "macros").groupOf("MACRO_1"), "view");
    assert.equal(reachOf(model, 0, [], "key").groupOf("MACRO_1"), undefined);
});
