import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {resolvedPositions, reachablePositions, viewPositions} from "../../webview/view/layer-resolution.mjs";
import {pointingReach} from "../../webview/view/pointing-reach.mjs";
import * as edits from "../../webview/view/edits.mjs";

const require = createRequire(import.meta.url);
const {profileDocument, publishedModel} = require("../fixtures/published-model.js");
const {SETTING} = require("../../core/schema/settings-domain-v1");

// The answers among these layout indexes: the profile's other keys are empty.
const at = (entries, ...indexes) => entries.filter((entry) => indexes.includes(entry.position.layoutIndex));
const named = (entry) => entry.layer.displayName;

test("a transparent key can be answered by any layer below that is held with this one", () => {
    // The real stack: Base, Numbers, Symbols, with LT(NUM,SPC) on a thumb and
    // LT(SYM,J) on the other hand, so {Base, Numbers, Symbols} is a real hold.
    // Base's Right Alt holds pointing mode 4 (Arrow).
    const hold = edits.saveBehaviour({keycode: "KC_RIGHT_ALT", steps: []},
        {change: {tapCount: 0, kind: "hold", branch: edits.cellBranch("hold", {action: "PD_MODE_4", style: "PRESS_AND_HOLD_UNTIL_RELEASE"})}});
    const model = publishedModel(profileDocument({keys: {
        0: {0: "KC_8", 1: "KC_RIGHT_ALT", 2: "MACRO_0"},
        1: {0: "KC_P7", 1: "KC_NO", 2: "KC_TRANSPARENT"},
        2: {0: "KC_TRANSPARENT", 1: "KC_TRANSPARENT", 2: "KC_TRANSPARENT"},
    }}), {edits: [hold]});
    const stack = model.layers;

    // Symbols alone: the default layer answers everything.
    assert.deepEqual(at(resolvedPositions(stack, 2, []), 0, 1, 2).map((entry) => entry.position.semantic),
        ["KC_8", "KC_RIGHT_ALT", "MACRO_0"]);
    // Symbols with Numbers held: Numbers wins where it has a key, KC_NO included.
    assert.deepEqual(at(resolvedPositions(stack, 2, [1]), 0, 1, 2).map((entry) => entry.position.semantic),
        ["KC_KP_7", "KC_NO", "MACRO_0"], "and its transparent position still falls to Base");

    // Both are real, so both are reachable, each named with what it needs.
    const reachable = reachablePositions(stack, 2);
    assert.deepEqual(at(reachable, 0).map((entry) => [entry.position.keycode, named(entry), entry.whileHeld]),
        [["KC_KP_7", "Numbers", true], ["KC_8", "Base", false]],
        "Numbers answers only while held; Base always does");

    // An intermediate KC_NO is one real outcome — the key does nothing while
    // Numbers is held — but it takes nothing away, because dropping Numbers
    // leaves Base answering. It names nothing, so no group ever lists it.
    assert.deepEqual(at(reachable, 1).map((entry) => [entry.position.keycode, entry.whileHeld]),
        [["KC_NO", true], ["KC_RIGHT_ALT", false]]);
    assert.deepEqual(pointingReach(model, stack, 2).fromBranchesBelow.map((entry) => entry.name), ["4"],
        "so the behaviour on Base is reached, and the mode its branch sends with it");
});

test("a view has only the layers on in it: base joins a preview, never a layer shown alone", () => {
    const stack = publishedModel(profileDocument({keys: {
        0: {0: "KC_A", 1: "KC_B"},
        1: {0: "KC_1", 1: "KC_TRANSPARENT"},
        2: {0: "KC_TRANSPARENT", 1: "KC_TRANSPARENT"},
    }})).layers;
    const answers = (resolve, top, held) => at(resolve(stack, top, held), 0, 1).map((key) => `${key.position.keycode} from ${named(key)}`);
    assert.deepEqual(answers(viewPositions, 1, []), ["KC_1 from Numbers"], "Numbers alone: its transparent key answers nothing");
    assert.deepEqual(answers(viewPositions, 2, []), [], "Symbols alone is all transparent");
    assert.deepEqual(answers(viewPositions, 0, []), ["KC_A from Base", "KC_B from Base"], "base shown alone is base");
    assert.deepEqual(answers(viewPositions, 2, [0]), ["KC_A from Base", "KC_B from Base"], "base previewed on under Symbols");
    assert.deepEqual(answers(viewPositions, 2, [1]), ["KC_1 from Numbers", "KC_B from Base"], "a preview has base on, as the layer bar shows");
    // The keyboard always has base on: what a transparent key does when pressed.
    assert.deepEqual(answers(resolvedPositions, 1, []), ["KC_1 from Numbers", "KC_B from Base"]);
});

test("resolution consumes published facts, including native transparency whose name is unknown", () => {
    const stack = publishedModel(profileDocument({keys: {0: {7: "KC_A"}, 1: {7: "KC_TRANSPARENT"}}})).layers;
    // Resolution reads the published answers, never the key's name.
    const transparent = stack[1].positions.find((position) => position.layoutIndex === 7);
    transparent.keycode = "0x0001";
    assert.equal(at(resolvedPositions(stack, 1), 7)[0].position.keycode, "KC_A");
    assert.equal(at(reachablePositions(stack, 1), 7)[0].layer, stack[0]);
    assert.deepEqual(resolvedPositions([{positions: [{layoutIndex: 7, keycode: "KC_A"}]}], 0), [],
        "an incomplete model supplies no inferred resolution facts");
});

// A keyboard can keep default layers on beside base (QMK's default layer
// state); core marks them alwaysOn, and they answer without being held.
test("a default layer the keyboard keeps on answers without being held, like base", () => {
    const stack = publishedModel(profileDocument({
        keys: {
            0: {0: "KC_A", 1: "KC_B"},
            1: {0: "KC_TRANSPARENT", 1: "KC_1"},
            2: {0: "KC_Q", 1: "KC_TRANSPARENT"},
            3: {0: "KC_TRANSPARENT", 1: "KC_TRANSPARENT"},
        },
        settings: (settings) => {settings.values[SETTING.DEFAULT_LAYERS] = 1 | (1 << 2); settings.names[2] = "Colemak"; settings.names[3] = "Top";},
    })).layers;
    assert.equal(stack[2].alwaysOn, true);
    assert.deepEqual(at(resolvedPositions(stack, 3), 0, 1).map((entry) => [entry.position.keycode, named(entry), entry.whileHeld]),
        [["KC_Q", "Colemak", false], ["KC_B", "Base", false]], "the default layer answers with nothing held");
    assert.deepEqual(at(reachablePositions(stack, 3), 0, 1).filter((entry) => named(entry) === "Colemak").map((entry) => entry.whileHeld), [false]);
    assert.deepEqual(at(viewPositions(stack, 3), 0, 1).map((entry) => entry.position.keycode), [], "a layer shown alone is the view by itself");
    assert.deepEqual(at(viewPositions(stack, 3, [1]), 0, 1).map((entry) => entry.position.keycode), ["KC_Q", "KC_1"], "held with another, the default layer joins as base does");
});
