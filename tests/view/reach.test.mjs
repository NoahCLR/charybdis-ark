import {withAnswers} from "../fixtures/layer-answers.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {keyMeaning, behaviourFor} from "../../webview/view/keyface.mjs";
import {resolvedPositions, reachablePositions} from "../../webview/view/layer-resolution.mjs";
import {combosInView, combosForKey} from "../../webview/view/combo-reach.mjs";
import {reachKeys, reachText, behavioursInView, reachInView, behaviourGroups, behaviourRouteKeys, macroKeycodes, macroPlacements, customKeyPlacements, macroReach, pointingReach, pointingSlotFor, pointingAction, macroAction, namedAction, slotKeycodes, bindingsForSlot, bindingKeycode} from "../../webview/view/reach.mjs";
import {createRequire} from "node:module";
const {PD_SLOT_BINDINGS: PD_BINDINGS} = createRequire(import.meta.url)("../../core/data/pd-bindings.js");
const slotWith = (fields) => ({...fields, binding: PD_BINDINGS[fields.id]});

test("a branch action that sends a pointing mode reads as the mode, held or locked", () => {
    const model = {pdModes: [{id: 0, displayName: "Dragscroll", kind: 2, binding: {hold: "PD_SLOT_0", lock: "PD_SLOT_0_LOCK", holdCode: 0x7e50, lockCode: 0x7e56}}, {id: 6, name: "", kind: 0, binding: {hold: "PD_SLOT_6", lock: "PD_SLOT_6_LOCK", holdCode: 0x7ef0, lockCode: 0x7ef1}}]};
    const hold = pointingAction(model, "PD_SLOT_0");
    assert.deepEqual([hold.slot.id, hold.name, hold.how, hold.empty], [0, "Dragscroll", "hold", false]);
    assert.equal(pointingAction(model, "PD_SLOT_0_LOCK").how, "lock");
    const empty = pointingAction(model, "PD_SLOT_6");
    assert.deepEqual([empty.name, empty.how, empty.empty], ["Slot 6", "hold", true], "an unnamed empty slot goes by its number");
    assert.equal(pointingAction(model, "0x7EF1").how, "lock", "the lock keycode as a raw value too");
    assert.equal(pointingAction(model, "KC_A"), null);
});

test("a branch action that plays a macro reads as the macro by the name it was given", () => {
    const model = {macros: [{keycode: "VIA_MACRO_0", name: "Sign-off", empty: false}, {keycode: "VIA_MACRO_1", name: "", empty: true}]};
    assert.equal(macroAction(model, "VIA_MACRO_0").name, "Sign-off");
    const unnamed = macroAction(model, "VIA_MACRO_1");
    assert.deepEqual([unnamed.name, unnamed.empty], ["Macro 1", true], "an unnamed macro goes by its number");
    assert.equal(macroAction(model, "LSFT(VIA_MACRO_0)"), null, "only a bare macro keycode is the macro itself");
    assert.equal(macroAction(model, "KC_A"), null);
});

test("pointing modes and macros read as what they are; plain keycodes read as themselves", () => {
    const model = {
        pdModes: [{id: 4, displayName: "Arrow", kind: 1, binding: {hold: "PD_SLOT_4", lock: "PD_SLOT_4_LOCK", holdCode: 0x7e54, lockCode: 0x7e5a}}],
        macros: [{keycode: "VIA_MACRO_2", name: "", empty: true}],
    };
    const pd = namedAction(model, "PD_SLOT_4_LOCK");
    assert.deepEqual([pd.kind, pd.word, pd.name, pd.tags], ["pointing", "pointing mode", "Arrow", ["lock"]]);
    const macro = namedAction(model, "VIA_MACRO_2");
    assert.deepEqual([macro.kind, macro.word, macro.name, macro.tags], ["macro", "macro", "Macro 2", ["empty"]]);
    assert.equal(namedAction(model, "KC_A"), null);
});

test("macro and pointing-mode keycodes resolve to the slots the keyboard reported", () => {
    assert.deepEqual(macroKeycodes("VIA_MACRO_11"), ["VIA_MACRO_11"]);
    assert.deepEqual(macroKeycodes("KC_A"), []);
    const model = {pdModes: [{id: 0, name: "Dragscroll", kind: 2, binding: {hold: "PD_SLOT_0", lock: "PD_SLOT_0_LOCK", holdCode: 0x7e50, lockCode: 0x7e56}}, {id: 6, name: "", kind: 0, binding: {hold: "PD_SLOT_6", lock: "PD_SLOT_6_LOCK", holdCode: 0x7ef0, lockCode: 0x7ef1}}]};
    assert.equal(pointingSlotFor(model, "PD_SLOT_0").name, "Dragscroll");
    assert.equal(pointingSlotFor(model, "PD_SLOT_0_LOCK").name, "Dragscroll", "the lock keycode reaches the same slot");
    assert.equal(pointingSlotFor(model, "PD_SLOT_6").id, 6);
    assert.equal(pointingSlotFor(model, "KC_A"), undefined);
});

test("what a key reaches is looked up by what its value means", () => {
    // The keyboard stores a behaviour target, a macro and a pointing mode as
    // plain user keycodes; every domain that refers back to them uses the
    // semantic name. A lookup that matched the stored name would find nothing.
    const model = {
        keyBehaviors: [{keycode: "PD_SLOT_0", steps: [{tapCount: 1, hold: {action: "KC_ESC"}}]}],
        combos: [{badge: "C1", inputs: ["VIA_MACRO_0", "KC_F"], output: "KC_ESC"}],
        pdModes: [{id: 0, name: "Dragscroll", kind: 2, binding: {hold: "PD_SLOT_0", lock: "PD_SLOT_0_LOCK", holdCode: 0x7e50, lockCode: 0x7e56}}],
    };
    const pointingKey = {layoutIndex: 3, keycode: "QK_USER_16", semantic: "PD_SLOT_0"};
    const macroKey = {layoutIndex: 4, keycode: "QK_MACRO_0", semantic: "VIA_MACRO_0"};

    assert.equal(keyMeaning(pointingKey), "PD_SLOT_0");
    assert.equal(keyMeaning({keycode: "KC_A"}), "KC_A", "an ordinary key means itself");
    assert.equal(keyMeaning(undefined), "");
    assert.equal(behaviourFor(model, keyMeaning(pointingKey)).keycode, "PD_SLOT_0");
    assert.deepEqual(macroKeycodes(keyMeaning(macroKey)), ["VIA_MACRO_0"]);
    assert.equal(pointingSlotFor(model, keyMeaning(pointingKey)).name, "Dragscroll");
    assert.deepEqual(combosForKey(model, macroKey).map((combo) => combo.badge), ["C1"],
        "a combo input named semantically still finds its key");
});

test("a pointing key is recognised as the keyboard names it, not only as the app labels it", () => {
    // Layout positions carry the device's own name for the value: a bare user
    // keycode for the six named modes, and plain hex for a slot the shipped
    // vocabulary never named. Both must reach the slot, or a bound key would
    // read as an ordinary key on the board and in the hover card.
    const model = {
        pdModes: [{id: 0, name: "Dragscroll", kind: 2, binding: {hold: "PD_SLOT_0", lock: "PD_SLOT_0_LOCK", holdCode: 0x7e50, lockCode: 0x7e56}}, {id: 6, name: "", kind: 0, binding: {hold: "PD_SLOT_6", lock: "PD_SLOT_6_LOCK", holdCode: 0x7ef0, lockCode: 0x7ef1}}],
        qmkKeycodeAliases: {QK_USER_16: "PD_SLOT_0", QK_USER_22: "PD_SLOT_0_LOCK", "0x7EF0": "PD_SLOT_6"},
    };
    assert.equal(pointingSlotFor(model, "QK_USER_16").name, "Dragscroll");
    assert.equal(pointingSlotFor(model, "QK_USER_22").name, "Dragscroll");
    assert.equal(pointingSlotFor(model, "0x7EF0").id, 6);
    assert.equal(pointingSlotFor(model, "0x7EF1").id, 6, "the lock keycode of an unnamed slot too");
    assert.equal(pointingSlotFor(model, 0x7ef0).id, 6);
    assert.equal(pointingSlotFor(model, "0x0041"), undefined, "an ordinary value is not a pointing key");
});

test("what still reaches a pointing slot is listed, so an inert key can be named", () => {
    const slot = slotWith({id: 0, kind: 0, name: ""});
    const model = {
        layers: [
            {name: "Layer 0", displayName: "Base", positions: [
                {layoutIndex: 3, keycode: "PD_SLOT_0"}, {layoutIndex: 4, keycode: "KC_A"}]},
            {name: "Layer 3", displayName: "Navigation", positions: [
                {layoutIndex: 3, keycode: "PD_SLOT_0_LOCK"}]},
        ],
        keyBehaviors: [
            {keycode: "LEFT_THUMB", steps: [{tapCount: 1, hold: {action: "PD_SLOT_0"}}]},
            {keycode: "RIGHT_THUMB", steps: [{tapCount: 0, tap: {action: "KC_ESC"}}]},
        ],
    };
    const found = bindingsForSlot(model, slot);
    assert.equal(found.keys.length, 2, "both the hold and the lock keycode count");
    assert.deepEqual(found.layers, ["Base", "Navigation"]);
    assert.deepEqual(found.behaviours.map((row) => row.keycode), ["LEFT_THUMB"]);
    assert.equal(bindingKeycode(slotWith({id: 6})), "PD_SLOT_6", "slots past the named six use their number");
    assert.deepEqual(bindingsForSlot(model, undefined).keys, []);
});

test("an empty slot's bindings are found by the keyboard's own values, not by a name it has none of", () => {
    // A cleared slot has no name for the model to resolve, so its keys arrive
    // as whatever the catalogue calls the raw value. The slot still answers to
    // the same two numbers, so that is what the lookup matches on.
    assert.deepEqual(slotKeycodes(slotWith({id: 0})), [0x7e80, 0x7ea0], "hold and toggle for a named slot");
    assert.deepEqual(slotKeycodes(slotWith({id: 6})), [0x7e86, 0x7ea6], "and for a numbered one");
    const model = {
        qmkKeycodes: [{keycode: 0x7e86, value: "QK_USER_32"}],
        layers: [{name: "Layer 0", displayName: "Base", positions: [
            {layoutIndex: 5, keycode: "QK_USER_32", value: 0x7e86},
            {layoutIndex: 6, keycode: "KC_A", value: 0x0004},
        ]}],
        keyBehaviors: [{keycode: "LEFT_THUMB", steps: [{tapCount: 0, hold: {action: "QK_USER_32"}}]}],
        combos: [{badge: "C1", output: "QK_USER_32"}],
    };
    const found = bindingsForSlot(model, slotWith({id: 6, kind: 0}));
    assert.equal(found.keys.length, 1, "the key bound to the empty slot is found");
    assert.deepEqual(found.behaviours.map((row) => row.keycode), ["LEFT_THUMB"]);
    assert.deepEqual(found.combos.map((row) => row.badge), ["C1"], "a combo output to an empty slot is inert too");
    assert.deepEqual(bindingsForSlot({combos: model.combos, qmkKeycodes: model.qmkKeycodes}, slotWith({id: 6, kind: 0})).combos.map((row) => row.badge), ["C1"],
        "a combo-only binding is still shown for an empty slot");
});

test("behaviours group by how this layer reaches them", () => {
    const model = {keyBehaviors: [
        {keycode: "KC_ESCAPE", steps: []},
        {keycode: "LEFT_THUMB", steps: []},
        {keycode: "KC_1", steps: []},
        {keycode: "KC_9", steps: []},
    ]};
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_ESCAPE"), at(1, "KC_1"), at(2, "KC_9"), at(3, "KC_B")]},
        {index: 1, name: "Numbers", positions: [at(0, "LEFT_THUMB"), at(1, "KC_TRANSPARENT"), at(2, "KC_NO"), at(3, "KC_TRANSPARENT")]},
    ]);

    const groups = behaviourGroups(model, stack, 1);
    assert.deepEqual(groups.here.map((row) => row.keycode), ["LEFT_THUMB"], "stored on this layer");
    assert.deepEqual(groups.through.map((entry) => entry.row.keycode), ["KC_1"],
        "a transparent key lets the layer underneath answer");
    assert.equal(groups.through[0].layer.name, "Base", "and the group names the layer that answers");
    assert.deepEqual(groups.elsewhere.map((row) => row.keycode), ["KC_ESCAPE", "KC_9"],
        "KC_ESCAPE is covered on this layer and KC_NO stops the fall-through to KC_9");

    const base = behaviourGroups(model, stack, 0);
    assert.deepEqual(base.here.map((row) => row.keycode), ["KC_ESCAPE", "KC_1", "KC_9"]);
    assert.deepEqual(base.through, [], "nothing lies under the base layer");
    assert.deepEqual(base.elsewhere.map((row) => row.keycode), ["LEFT_THUMB"]);
});

test("the view follows the exact previewed stack while the layer groups stay strict", () => {
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_A"), at(1, "KC_B"), at(2, "VIA_MACRO_0")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_C"), at(1, "KC_TRANSPARENT"), at(2, "KC_NO")]},
        {index: 2, name: "Symbols", positions: [at(0, "KC_TRANSPARENT"), at(1, "KC_TRANSPARENT"), at(2, "KC_TRANSPARENT")]},
    ]);
    const model = {
        keyBehaviors: [
            {keycode: "KC_B", steps: [{tapCount: 0, tap: {action: "VIA_MACRO_1"}}]},
            {keycode: "KC_C", steps: [{tapCount: 0, hold: {action: "PD_SLOT_4"}}]},
        ],
        combos: [
            {id: 1, inputs: ["KC_A", "KC_B"], output: "VIA_MACRO_2"},
            {id: 2, inputs: ["KC_C", "KC_B"], output: "VIA_MACRO_3"},
        ],
        pdModes: [{id: 4, kind: 1, binding: {hold: "PD_SLOT_4", lock: "PD_SLOT_4_LOCK"}}],
    };
    const macroNames = (held) => reachInView(model, stack, 2, held, macroKeycodes).map((entry) => entry.name);
    assert.deepEqual(behaviourGroups(model, stack, 2).here, [], "nothing is stored on Symbols");
    assert.deepEqual(behavioursInView(model, stack, 2, []).map((entry) => entry.row.keycode), ["KC_B"]);
    assert.deepEqual(behavioursInView(model, stack, 2, [1]).map((entry) => entry.row.keycode), ["KC_C", "KC_B"]);
    assert.deepEqual(combosInView(model, stack, 2, []).map((entry) => entry.combo.id), [1]);
    assert.deepEqual(combosInView(model, stack, 2, [1]).map((entry) => entry.combo.id), [2],
        "a combo's inputs must coexist in this activation");
    assert.deepEqual(macroNames([]), ["VIA_MACRO_1", "VIA_MACRO_0", "VIA_MACRO_2"]);
    assert.deepEqual(macroNames([1]), ["VIA_MACRO_1", "VIA_MACRO_3"]);
    const modes = (held) => reachInView(model, stack, 2, held,
        (keycode) => { const slot = pointingSlotFor(model, keycode); return slot ? [String(slot.id)] : []; });
    assert.deepEqual(modes([]), []);
    assert.deepEqual(modes([1]).map((entry) => entry.name), ["4"], "a visible behaviour's branch reaches the mode");
    const branch = reachInView(model, stack, 2, [1], macroKeycodes).find((entry) => entry.name === "VIA_MACRO_1");
    assert.deepEqual(reachKeys(stack, 2, branch, [1]), [1], "the view route rings only visible source keys");
    assert.deepEqual(behaviourRouteKeys(model, stack, 2, "KC_C", "view", [1]), [0]);
    assert.deepEqual(behaviourRouteKeys(model, stack, 2, "KC_C", "view", []), []);
});

test("a behaviour a combo sends is reached, though no key carries it", () => {
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const model = {
        qmkKeycodeAliases: {QK_USER_30: "LEFT_THUMB"},
        keyBehaviors: [{keycode: "LEFT_THUMB", steps: []}, {keycode: "KC_9", steps: []}],
        combos: [
            {id: 0, badge: "C1", inputs: ["KC_J", "KC_K"], output: "QK_USER_30"},
            {id: 1, badge: "C2", inputs: ["KC_K", "KC_L"], output: "QK_USER_30"},
        ],
    };
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_J"), at(1, "KC_K"), at(2, "KC_L")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_TRANSPARENT"), at(1, "KC_K"), at(2, "KC_1")]},
    ]);

    const base = behaviourGroups(model, stack, 0);
    assert.deepEqual(base.here, [], "no key carries it");
    assert.deepEqual(base.combos.map((entry) => [entry.row.keycode, entry.combos.map((route) => route.combo.badge)]),
        [["LEFT_THUMB", ["C1", "C2"]]], "one row, naming every combo that sends it");
    assert.deepEqual(reachKeys(stack, 0, {behaviours: [{keycode: "LEFT_THUMB"}], combos: base.combos[0].combos}).sort(), [0, 1, 2],
        "the board rings the keys chorded for either combo");
    assert.deepEqual(base.elsewhere.map((row) => row.keycode), ["KC_9"], "no longer called unreachable");

    const above = behaviourGroups(model, stack, 1);
    assert.deepEqual(above.combos, [], "C1 needs the transparent J, and C2 needs L, which Numbers covers");
    assert.deepEqual(above.combosBelow.map((entry) => [entry.row.keycode, entry.combos.map((route) => route.combo.badge)]),
        [["LEFT_THUMB", ["C1"]]]);
});

test("a behaviour picked under one route rings only that route's keys", () => {
    // The Pointing layer case: KC_LEFT_GUI sits on Base's thumb, which the
    // Pointing layer leaves transparent, and a combo chorded on two Pointing
    // keys sends it too. Picked under the combo, the thumb is not the answer.
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const model = {
        keyBehaviors: [{keycode: "KC_LEFT_GUI", steps: []}],
        combos: [{id: 5, badge: "C6", inputs: ["MS_BTN1", "PD_SLOT_1"], output: "KC_LEFT_GUI"}],
    };
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(48, "KC_LEFT_GUI"), at(30, "KC_N"), at(31, "KC_M")]},
        {index: 4, name: "Pointing", positions: [at(48, "KC_TRANSPARENT"), at(30, "PD_SLOT_1"), at(31, "MS_BTN1")]},
    ]);
    const groups = behaviourGroups(model, stack, 1);
    assert.deepEqual(groups.through.map((entry) => entry.row.keycode), ["KC_LEFT_GUI"], "listed under the transparent key");
    assert.deepEqual(groups.combos.map((entry) => entry.row.keycode), ["KC_LEFT_GUI"], "and under the combo");
    assert.deepEqual(groups.combosBelow, [], "the combo needs no transparent key");

    const ring = (route) => behaviourRouteKeys(model, stack, 1, "KC_LEFT_GUI", route).sort((a, b) => a - b);
    assert.deepEqual(ring("combos"), [30, 31], "the chord, not the thumb");
    assert.deepEqual(ring("through"), [48], "the thumb that falls through to Base");
    assert.deepEqual(ring("here"), [], "no key on Pointing carries it");
    assert.deepEqual(ring(null), [30, 31, 48], "with no route, every way in");
    assert.deepEqual(behaviourRouteKeys(model, stack, 1, null), []);
});

test("a macro fired from a behaviour branch is reached, though no key shows it", () => {
    const model = {
        macros: [
            {kind: "via", keycode: "VIA_MACRO_0", payload: "{KC_A}", bytes: 3, empty: false},
            {kind: "via", keycode: "VIA_MACRO_1", payload: "{KC_B}", bytes: 3, empty: false},
            {kind: "via", keycode: "VIA_MACRO_2", payload: "{KC_C}", bytes: 3, empty: false},
            {kind: "via", keycode: "VIA_MACRO_3", payload: "", bytes: 0, empty: true},
        ],
        keyBehaviors: [
            {keycode: "KC_ESCAPE", steps: [{tapCount: 1, tap: {action: "VIA_MACRO_1"}}]},
            {keycode: "KC_B", steps: [{tapCount: 0, longHold: {action: "VIA_MACRO_2"}}]},
        ],
    };
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_ESCAPE"), at(1, "VIA_MACRO_0"), at(2, "KC_B")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_TRANSPARENT"), at(1, "KC_TRANSPARENT"), at(2, "KC_NO")]},
    ]);

    const base = macroReach(model, stack, 0);
    assert.deepEqual(base.onKeys.map((entry) => entry.name), ["VIA_MACRO_0"], "the only macro a key carries");
    assert.deepEqual(base.throughKeys, [], "the base layer has nothing under it to fall through to");
    assert.deepEqual(base.fromBranches.map((entry) => entry.name), ["VIA_MACRO_1", "VIA_MACRO_2"],
        "both branches are found, tap and long hold alike");
    assert.deepEqual(base.fromBranches[0].behaviours,
        [{keycode: "KC_ESCAPE", action: "VIA_MACRO_1", layer: null, whileHeld: false}],
        "named by the behaviour that fires it and by what its branch sends");
    assert.deepEqual(base.fromBranchesBelow, [], "nothing lies under the base layer to reach a behaviour through");
    assert.deepEqual(base.elsewhere, [], "an empty slot is not a macro this layer is missing");

    const above = macroReach(model, stack, 1);
    assert.deepEqual(above.onKeys, [], "no key on Numbers carries a macro itself");
    assert.deepEqual(above.throughKeys.map((entry) => entry.name), ["VIA_MACRO_0"],
        "a transparent key lets the macro key underneath answer");
    assert.equal(above.throughKeys[0].keys[0].layer.name, "Base", "and the group names the layer it came from");
    assert.deepEqual(above.fromBranches, [], "no behaviour mapped on Numbers sends a macro");
    assert.equal(above.fromBranchesBelow.find((entry) => entry.name === "VIA_MACRO_1").behaviours[0].layer.name,
        "Base", "and the entry names the layer holding that behaviour, since this one does not");
    assert.deepEqual(above.elsewhere, ["VIA_MACRO_2"],
        "KC_NO on the layer being viewed is the top answer, so KC_B on Base is not reached");
});


test("a thing reached several ways is listed under each of them", () => {
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const model = {
        macros: [
            {kind: "via", keycode: "VIA_MACRO_0", payload: "{KC_A}", bytes: 3, empty: false},
            {kind: "via", keycode: "VIA_MACRO_1", payload: "{KC_B}", bytes: 3, empty: false},
        ],
        keyBehaviors: [
            {keycode: "KC_ESCAPE", steps: [{tapCount: 1, tap: {action: "VIA_MACRO_0"}}]},
            {keycode: "KC_B", steps: [{tapCount: 1, tap: {action: "VIA_MACRO_1"}}]},
        ],
    };
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_ESCAPE"), at(1, "VIA_MACRO_1"), at(2, "KC_X")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_ESCAPE"), at(1, "KC_TRANSPARENT"), at(2, "KC_B")]},
    ]);

    // VIA_MACRO_1 sits on a key below and is also fired by KC_B, a behaviour
    // mapped on Numbers itself. Both are real ways to reach it, so both are
    // answered — each entry carrying only the route it is filed under.
    const above = macroReach(model, stack, 1);
    assert.deepEqual(above.onKeys, [], "no macro keycode is on a key of Numbers");
    assert.deepEqual(above.fromBranches.map((entry) => entry.name).sort(), ["VIA_MACRO_0", "VIA_MACRO_1"]);
    assert.deepEqual(above.throughKeys.map((entry) => entry.name), ["VIA_MACRO_1"],
        "the key below is a second way to the same macro, not a lost one");
    assert.deepEqual(above.throughKeys[0].behaviours, [],
        "and that entry answers for the key alone, so picking it rings only that key");
    assert.deepEqual(above.fromBranches.find((entry) => entry.name === "VIA_MACRO_1").keys, []);
    assert.deepEqual(above.elsewhere, []);
});

test("reach lists read down the stack, the default layer first", () => {
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const clear = (indexes) => indexes.map((i) => at(i, "KC_TRANSPARENT"));
    const model = {
        macros: [0, 1, 2].map((n) => ({kind: "via", keycode: `VIA_MACRO_${n}`, payload: "{KC_A}", bytes: 3, empty: false})),
        keyBehaviors: [
            {keycode: "KC_A", steps: [{tapCount: 0, tap: {action: "KC_A"}}]},
            {keycode: "KC_B", steps: [{tapCount: 0, tap: {action: "KC_B"}}]},
            {keycode: "KC_C", steps: [{tapCount: 0, tap: {action: "KC_C"}}]},
        ],
    };
    // Each layer under the top one answers a different position, so the order
    // the rows come back in is the order of the layers that answer them.
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "VIA_MACRO_2"), at(1, "KC_NO"), at(2, "KC_NO"), at(3, "KC_C")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_NO"), at(1, "VIA_MACRO_1"), at(2, "KC_NO"), at(3, "KC_B")]},
        {index: 2, name: "Symbols", positions: [at(0, "KC_NO"), at(1, "KC_NO"), at(2, "VIA_MACRO_0"), at(3, "KC_A")]},
        {index: 3, name: "Top", positions: clear([0, 1, 2, 3])},
    ]);

    assert.deepEqual(macroReach(model, stack, 3).throughKeys.map((entry) => entry.keys[0].layer.name),
        ["Base", "Numbers", "Symbols"], "macros answered lower in the stack come first");
    assert.deepEqual(behaviourGroups(model, stack, 3).through.map((entry) => entry.layer.name),
        ["Base", "Numbers", "Symbols"], "and so do behaviours");
});

test("a branch keeps which of a pointing mode's two keycodes it sends", () => {
    // A slot answers to both a hold and a toggle keycode. Collapsing them to the
    // slot is right for saying which mode is reached, but the row has to keep
    // the difference or holding and toggling read the same.
    const model = {
        pdModes: [{id: 0, name: "Dragscroll", kind: 2, binding: {hold: "PD_SLOT_0", lock: "PD_SLOT_0_LOCK", holdCode: 0x7e50, lockCode: 0x7e56}}],
        qmkKeycodeAliases: {},
        keyBehaviors: [{keycode: "PD_SLOT_0", steps: [{tapCount: 0, hold: {action: "PD_SLOT_0_LOCK"}}]}],
    };
    const stack = withAnswers([{index: 0, name: "Base", positions: [{layoutIndex: 50, keycode: "PD_SLOT_0", display: "Dragscroll · hold"}]}]);
    const reach = pointingReach(model, stack, 0);

    assert.deepEqual(reach.onKeys.map((entry) => entry.name), ["0"], "the key holds the mode");
    assert.deepEqual(reach.fromBranches.map((entry) => entry.name), ["0"], "and its own behaviour toggles it");
    assert.deepEqual(reach.fromBranches[0].behaviours,
        [{keycode: "PD_SLOT_0", action: "PD_SLOT_0_LOCK", layer: null, whileHeld: false}],
        "so the branch keeps the toggle keycode, not just the slot it lands on");
});

test("a combo reaches the macro it sends, and what a behaviour it sends reaches", () => {
    // A combo's output runs through the same stages a key press does: it can
    // fire a macro itself, or fire a behaviour whose branch plays one. Neither
    // is on any key, so without this both read as unreachable.
    const at = (layoutIndex, keycode, semantic) => ({layoutIndex, keycode, semantic, display: keycode});
    const model = {
        macros: [
            {keycode: "VIA_MACRO_0", payload: "{KC_A}", empty: false},
            {keycode: "VIA_MACRO_1", payload: "{KC_B}", empty: false},
            {keycode: "VIA_MACRO_2", payload: "{KC_C}", empty: false},
        ],
        qmkKeycodeAliases: {QK_MACRO_0: "VIA_MACRO_0", QK_USER_30: "LEFT_THUMB"},
        keyBehaviors: [{keycode: "LEFT_THUMB", steps: [{tapCount: 1, hold: {action: "VIA_MACRO_1"}}]}],
        combos: [
            {id: 0, badge: "C1", inputs: ["KC_J", "KC_K"], output: "QK_MACRO_0"},
            {id: 1, badge: "C2", inputs: ["KC_J", "KC_L"], output: "QK_USER_30"},
        ],
    };
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_J"), at(1, "KC_K"), at(2, "KC_L")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_TRANSPARENT"), at(1, "KC_K"), at(2, "KC_1")]},
    ]);

    const base = macroReach(model, stack, 0);
    assert.deepEqual(base.fromCombos.map((entry) => entry.name), ["VIA_MACRO_0", "VIA_MACRO_1"]);
    assert.deepEqual(base.fromCombos[0].combos.map((route) => [route.combo.badge, route.via, route.action]),
        [["C1", null, "VIA_MACRO_0"]], "sent by the combo itself, matched by meaning rather than the catalogue name");
    assert.deepEqual(base.fromCombos[1].combos.map((route) => [route.combo.badge, route.via, route.action]),
        [["C2", "LEFT_THUMB", "VIA_MACRO_1"]], "sent by a branch of the behaviour the combo fires");
    assert.deepEqual(base.elsewhere, ["VIA_MACRO_2"], "a combo's macro is no longer called unreachable");
    assert.deepEqual(reachKeys(stack, 0, base.fromCombos[0]).sort(), [0, 1], "the board rings the keys chorded to fire it");

    const above = macroReach(model, stack, 1);
    assert.deepEqual(above.fromCombos, [], "on Numbers C1 needs the transparent J, so it is not this layer's own");
    assert.deepEqual(above.fromCombosBelow.map((entry) => entry.name), ["VIA_MACRO_0"]);
    assert.deepEqual(above.elsewhere, ["VIA_MACRO_1", "VIA_MACRO_2"], "C2 needs L, and Numbers stores 1 there");
    model.combos[1].useOutputBehavior = false;
    assert.deepEqual(macroReach(model, stack, 0).fromCombos.map(entry => entry.name), ["VIA_MACRO_0"]);
    assert.deepEqual(behaviourGroups(model, stack, 0).combos, []);
    assert.deepEqual(behavioursInView(model, stack, 0).filter(entry => entry.combos.length), []);
    model.combos[1].useOutputBehavior = true;
    model.participation = {comboOutputBehaviors: false};
    assert.deepEqual(macroReach(model, stack, 0).fromCombos.map(entry => entry.name), ["VIA_MACRO_0"], "global bypass retains the directly sent macro");
    assert.deepEqual(reachInView(model, stack, 0, [], macroKeycodes).map(entry => entry.name), ["VIA_MACRO_0"]);
    model.participation.comboOutputBehaviors = true;
    assert.deepEqual(macroReach(model, stack, 0).fromCombos.map(entry => entry.name), ["VIA_MACRO_0", "VIA_MACRO_1"]);

});

test("a combo reaches the pointing mode it sends", () => {
    const model = {
        pdModes: [{id: 0, name: "Dragscroll", kind: 2, binding: {hold: "PD_SLOT_0", lock: "PD_SLOT_0_LOCK", holdCode: 0x7e50, lockCode: 0x7e56}}],
        qmkKeycodeAliases: {QK_USER_16: "PD_SLOT_0"},
        combos: [{id: 0, badge: "C1", inputs: ["KC_J", "KC_K"], output: "QK_USER_16"}],
    };
    const stack = withAnswers([{index: 0, name: "Base", positions: [{layoutIndex: 0, keycode: "KC_J"}, {layoutIndex: 1, keycode: "KC_K"}]}]);
    const reach = pointingReach(model, stack, 0);
    assert.deepEqual(reach.fromCombos.map((entry) => entry.name), ["0"]);
    assert.deepEqual(reach.elsewhere, []);
});

test("cold macro placement lookup avoids combinations of layers that cannot change combo answers", () => {
    for (const combos of [[], [{id: 0, inputs: ["KC_A", "KC_B"], output: "VIA_MACRO_0"}]]) {
        let reads = 0;
        const stack = withAnswers(Array.from({length: 16}, (_, index) => ({index, get positions() {
            reads++;
            return [{layoutIndex: 0, keycode: "KC_A"}, {layoutIndex: 1, keycode: "KC_B"}];
        }})));
        const placements = macroPlacements({combos}, stack, "VIA_MACRO_0");
        assert.equal(placements.length, combos.length ? 16 : 0);
        assert.ok(reads < 1000, `cold lookup read layers ${reads} times`);
    }
});

test("a macro's layers are the ones that hold a way to it themselves", () => {
    const at = (layoutIndex, keycode, semantic) => ({layoutIndex, keycode, semantic, display: keycode});
    const model = {
        macros: [1, 2, 3, 10].map((n) => ({keycode: `VIA_MACRO_${n}`, payload: "{KC_A}", empty: false})),
        qmkKeycodeAliases: {QK_MACRO_3: "VIA_MACRO_3"},
        keyBehaviors: [{keycode: "KC_ESCAPE", steps: [{tapCount: 1, tap: {action: "VIA_MACRO_2"}}]}],
        combos: [{id: 0, badge: "C1", inputs: ["KC_B", "KC_C"], output: "QK_MACRO_3"}],
    };
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "QK_MACRO_1", "VIA_MACRO_1"), at(1, "KC_A"), at(2, "QK_MACRO_1", "VIA_MACRO_1")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_TRANSPARENT"), at(1, "KC_ESCAPE"), at(2, "KC_NO")]},
        {index: 4, name: "Symbols", positions: [at(0, "KC_B"), at(1, "QK_MACRO_1", "VIA_MACRO_1"), at(2, "KC_C")]},
    ]);
    const summary = (keycode) => macroPlacements(model, stack, keycode)
        .map((entry) => [entry.layer.name, entry.at, entry.routes.map((route) => [route.group, route.keys.sort()])]);

    assert.deepEqual(summary("VIA_MACRO_1"), [["Base", 0, [["here", [0, 2]]]], ["Symbols", 2, [["here", [1]]]]],
        "a key naming it, with the stack position a screen selects; Numbers only falls through to Base's");
    assert.deepEqual(summary("VIA_MACRO_2"), [["Numbers", 1, [["branches", [1]]]]],
        "a behaviour mapped there sends it, and the board rings the behaviour's key");
    assert.deepEqual(summary("VIA_MACRO_3"), [["Symbols", 2, [["combos", [0, 2]]]]],
        "a combo firing from that layer's keys sends it");
    assert.deepEqual(summary("VIA_MACRO_10"), [], "VIA_MACRO_1 does not match VIA_MACRO_10");
    assert.deepEqual(macroPlacements(model, undefined, "VIA_MACRO_1"), []);
});

test("a custom key's layers are the ones where a key carries it or a combo sends it", () => {
    const at = (layoutIndex, keycode, semantic) => ({layoutIndex, keycode, semantic, display: keycode});
    const model = {
        customKeys: [0, 1, 2].map((slot) => ({slot, keycode: `CUSTOM_KEY_${slot}`, name: `Key ${slot}`, hasBehavior: true})),
        qmkKeycodeAliases: {QK_USER_2: "CUSTOM_KEY_2"},
        keyBehaviors: [],
        combos: [{id: 0, badge: "C1", inputs: ["KC_B", "KC_C"], output: "QK_USER_2"}],
    };
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "QK_USER_0", "CUSTOM_KEY_0"), at(1, "KC_B"), at(2, "KC_C")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_TRANSPARENT"), at(1, "QK_USER_1", "CUSTOM_KEY_1"), at(2, "KC_NO")]},
    ]);
    const summary = (keycode) => customKeyPlacements(model, stack, keycode)
        .map((entry) => [entry.layer.name, entry.at, entry.routes.map((route) => [route.group, route.keys.sort()])]);
    assert.deepEqual(summary("CUSTOM_KEY_0"), [["Base", 0, [["here", [0]]]]], "Numbers only falls through to Base's");
    assert.deepEqual(summary("CUSTOM_KEY_1"), [["Numbers", 1, [["here", [1]]]]]);
    assert.deepEqual(summary("CUSTOM_KEY_2"), [["Base", 0, [["combos", [1, 2]]]]], "a combo firing from Base's keys sends it");
});


test("a custom key is placed wherever it is sent, unnamed and with nothing but a shortcut, or by a behaviour step", () => {
    const at = (layoutIndex, keycode, semantic) => ({layoutIndex, keycode, semantic, display: keycode});
    const model = {
        customKeys: [0, 1].map((slot) => ({slot, keycode: `CUSTOM_KEY_${slot}`, name: "", hasBehavior: false, shortcut: {mods: slot ? 0 : 0x41, key: slot ? 0 : 0x0e}})),
        qmkKeycodeAliases: {},
        keyBehaviors: [{keycode: "KC_A", enabled: true, allowedLayers: 0xffff, steps: [{tapCount: 1, tap: {style: "TAP_SENDS", action: "CUSTOM_KEY_1"}}]}],
        combos: [],
    };
    const stack = withAnswers([{index: 0, name: "Base", positions: [at(0, "QK_USER_0", "CUSTOM_KEY_0"), at(1, "KC_A")]}]);
    const groups = (keycode) => customKeyPlacements(model, stack, keycode).map((entry) => entry.routes.map((route) => route.group));
    assert.deepEqual(groups("CUSTOM_KEY_0"), [["here"]], "an unnamed key with only a shortcut is placed");
    assert.deepEqual(groups("CUSTOM_KEY_1"), [["branches"]], "a behaviour step sending it places it");
});
test("generated behaviour lists use the declared owner's physical source rather than reference or other member", () => {
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const row = {keycode: "CUSTOM_KEY_0", enabled: true, allowedLayers: 1,
        steps: [{tapCount: 1, tap: {action: "VIA_MACRO_0"}}]};
    const combo = {id: 0, inputs: ["KC_A", "KC_B"], output: "CUSTOM_KEY_0"};
    const model = {keyBehaviors: [row], combos: [combo],
        participation: {behaviorsEnabled: true, comboOutputBehaviors: true, behaviorLayers: 0, layers: []},
        macros: [{keycode: "VIA_MACRO_0", empty: false}]};
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_C"), at(1, "KC_B")]},
        {index: 1, name: "Overlay", positions: [at(0, "KC_A"), at(1, "KC_TRANSPARENT")]},
        {index: 2, name: "Reference", positions: [at(0, "KC_A"), at(1, "KC_B")]},
    ]);
    assert.equal(behavioursInView(model, stack, 1).length, 1, "B owns Base policy despite A coming from Overlay");
    combo.inputs.reverse();
    assert.equal(behavioursInView(model, stack, 1).length, 0, "A becomes the declared owner, so B cannot lend its allowance");
    combo.inputs.reverse();
    model.configDefaults = [{id: "comboReferences", fields: [{macro: "comboReference1", value: "Layer 2"}]}];
    assert.equal(behavioursInView(model, stack, 1).length, 1, "reference remapping retains Base's physical origin");
    row.allowedLayers = 4;
    assert.equal(behavioursInView(model, stack, 1).length, 0, "a reference-layer allowance cannot enable the output");
    row.allowedLayers = 1; row.enabled = false;
    assert.equal(behavioursInView(model, stack, 1).length, 0);
    row.enabled = true; model.participation.behaviorsEnabled = false;
    assert.equal(behavioursInView(model, stack, 1).length, 0);
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
