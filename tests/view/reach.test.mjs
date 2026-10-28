import {withAnswers} from "../fixtures/layer-answers.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {keyMeaning, behaviourFor} from "../../webview/view/keyface.mjs";
import {resolvedPositions, reachablePositions} from "../../webview/view/layer-resolution.mjs";
import {combosInView, combosForKey} from "../../webview/view/combo-reach.mjs";
import {reachKeys, reachText, macroKeycodes, pointingSlotFor, pointingAction, macroAction, namedAction, slotKeycodes, slotKeycodeNames, whatReachesSlot, holdKeyName} from "../../webview/view/reach.mjs";
import * as reachViews from "../../webview/view/reach.mjs";
import {createRequire} from "node:module";
import {publishedFor} from "../fixtures/combo-reach.mjs";
// The combo views read the reach core publishes for the stack they are given.
const behavioursInView = publishedFor(reachViews.behavioursInView);
const reachInView = publishedFor(reachViews.reachInView);
const behaviourGroups = publishedFor(reachViews.behaviourGroups);
const behaviourRouteKeys = publishedFor(reachViews.behaviourRouteKeys);
const macroPlacements = publishedFor(reachViews.macroPlacements);
const customKeyPlacements = publishedFor(reachViews.customKeyPlacements);
const macroReach = publishedFor(reachViews.macroReach);
const pointingReach = publishedFor(reachViews.pointingReach);
const pointingReachInView = publishedFor(reachViews.pointingReachInView);
const {PD_MODE_KEYS} = createRequire(import.meta.url)("../../core/data/pd-mode-keys.js");
const slotWith = (fields) => ({...fields, keys: PD_MODE_KEYS[fields.id]});

test("a branch action that sends a pointing mode reads as the mode, held or locked", () => {
    const model = {pdModes: [{id: 0, displayName: "Dragscroll", kind: 2, keys: {hold: "PD_MODE_0", lock: "PD_MODE_0_LOCK", holdCode: 0x7e50, lockCode: 0x7e56}}, {id: 6, name: "", kind: 0, keys: {hold: "PD_MODE_6", lock: "PD_MODE_6_LOCK", holdCode: 0x7ef0, lockCode: 0x7ef1}}]};
    const hold = pointingAction(model, "PD_MODE_0");
    assert.deepEqual([hold.slot.id, hold.name, hold.how, hold.empty], [0, "Dragscroll", "hold", false]);
    assert.equal(pointingAction(model, "PD_MODE_0_LOCK").how, "lock");
    const empty = pointingAction(model, "PD_MODE_6");
    assert.deepEqual([empty.name, empty.how, empty.empty], ["Slot 6", "hold", true], "an unnamed empty slot goes by its number");
    assert.equal(pointingAction(model, "0x7EF1").how, "lock", "the lock keycode as a raw value too");
    assert.equal(pointingAction(model, "KC_A"), null);
});

test("a branch action that plays a macro reads as the macro by the name it was given", () => {
    const model = {macros: [{keycode: "MACRO_0", name: "Sign-off", empty: false}, {keycode: "MACRO_1", name: "", defaultName: "Macro 1", empty: true}]};
    assert.equal(macroAction(model, "MACRO_0").name, "Sign-off");
    const unnamed = macroAction(model, "MACRO_1");
    assert.deepEqual([unnamed.name, unnamed.empty], ["Macro 1", true], "an unnamed macro goes by its number");
    assert.equal(macroAction(model, "LSFT(MACRO_0)"), null, "only a bare macro keycode is the macro itself");
    assert.equal(macroAction(model, "KC_A"), null);
});

test("pointing modes and macros read as what they are; plain keycodes read as themselves", () => {
    const model = {
        pdModes: [{id: 4, displayName: "Arrow", kind: 1, keys: {hold: "PD_MODE_4", lock: "PD_MODE_4_LOCK", holdCode: 0x7e54, lockCode: 0x7e5a}}],
        macros: [{keycode: "MACRO_2", name: "", defaultName: "Macro 2", empty: true}],
    };
    const pd = namedAction(model, "PD_MODE_4_LOCK");
    assert.deepEqual([pd.kind, pd.word, pd.name, pd.tags], ["pointing", "pointing mode", "Arrow", ["lock"]]);
    const macro = namedAction(model, "MACRO_2");
    assert.deepEqual([macro.kind, macro.word, macro.name, macro.tags], ["macro", "macro", "Macro 2", ["empty"]]);
    assert.equal(namedAction(model, "KC_A"), null);
});

test("a layer action reads as its layer, tagged with what it does to it", () => {
    const model = {
        layers: [{index: 0, name: "Base"}, {index: 1, name: "Numbers"}, {index: 2, name: "L2", displayName: "Navigation"}],
        qmkKeyLabels: {"MO(2)": "Hold Navigation", "TG(1)": "Lock Numbers", "LM(1,MOD_LSFT)": "Numbers + Shift", "LT(2,KC_F)": "F / Navigation", QK_LAYER_LOCK: "Layer Lock"},
        qmkKeyLayers: {"MO(2)": 2, "TG(1)": 1, "LM(1,MOD_LSFT)": 1, "LT(2,KC_F)": 2},
        qmkKeyLayerForms: /** @type {Record<string, any>} */ ({"MO(2)": "MO", "TG(1)": "TG", "LM(1,MOD_LSFT)": "LM", "LT(2,KC_F)": "LT"}),
    };
    const hold = namedAction(model, "MO(2)");
    assert.deepEqual([hold.kind, hold.word, hold.name, hold.layer, hold.tags], ["layer", "layer", "Navigation", 2, ["Hold"]]);
    assert.deepEqual(namedAction(model, "TG(1)").tags, ["Lock"]);
    assert.deepEqual(namedAction(model, "LM(1,MOD_LSFT)").tags, ["+ Shift"], "the words after the layer's name tag it too");
    assert.equal(namedAction(model, "LT(2,KC_F)"), null, "a layer-tap is a tap and a layer, not a layer action");
    assert.equal(namedAction(model, "QK_LAYER_LOCK"), null, "a key that names no layer is itself");
});

test("macro and pointing-mode keycodes resolve to the slots the keyboard reported", () => {
    assert.deepEqual(macroKeycodes("MACRO_11"), ["MACRO_11"]);
    assert.deepEqual(macroKeycodes("KC_A"), []);
    const model = {pdModes: [{id: 0, name: "Dragscroll", kind: 2, keys: {hold: "PD_MODE_0", lock: "PD_MODE_0_LOCK", holdCode: 0x7e50, lockCode: 0x7e56}}, {id: 6, name: "", kind: 0, keys: {hold: "PD_MODE_6", lock: "PD_MODE_6_LOCK", holdCode: 0x7ef0, lockCode: 0x7ef1}}]};
    assert.equal(pointingSlotFor(model, "PD_MODE_0").name, "Dragscroll");
    assert.equal(pointingSlotFor(model, "PD_MODE_0_LOCK").name, "Dragscroll", "the lock keycode reaches the same slot");
    assert.equal(pointingSlotFor(model, "PD_MODE_6").id, 6);
    assert.equal(pointingSlotFor(model, "KC_A"), undefined);
});

test("what a key reaches is looked up by what its value means", () => {
    // The keyboard stores a behaviour target, a macro and a pointing mode as
    // plain user keycodes; every domain that refers back to them uses the
    // semantic name. A lookup that matched the stored name would find nothing.
    const model = {
        keyBehaviors: [{keycode: "PD_MODE_0", steps: [{tapCount: 1, hold: {action: "KC_ESC"}}]}],
        combos: [{badge: "C1", inputs: ["MACRO_0", "KC_F"], output: "KC_ESC"}],
        pdModes: [{id: 0, name: "Dragscroll", kind: 2, keys: {hold: "PD_MODE_0", lock: "PD_MODE_0_LOCK", holdCode: 0x7e50, lockCode: 0x7e56}}],
    };
    const pointingKey = {layoutIndex: 3, keycode: "QK_USER_16", semantic: "PD_MODE_0"};
    const macroKey = {layoutIndex: 4, keycode: "QK_MACRO_0", semantic: "MACRO_0"};

    assert.equal(keyMeaning(pointingKey), "PD_MODE_0");
    assert.equal(keyMeaning({keycode: "KC_A"}), "KC_A", "an ordinary key means itself");
    assert.equal(keyMeaning(undefined), "");
    assert.equal(behaviourFor(model, keyMeaning(pointingKey)).keycode, "PD_MODE_0");
    assert.deepEqual(macroKeycodes(keyMeaning(macroKey)), ["MACRO_0"]);
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
        pdModes: [{id: 0, name: "Dragscroll", kind: 2, keys: {hold: "PD_MODE_0", lock: "PD_MODE_0_LOCK", holdCode: 0x7e50, lockCode: 0x7e56}}, {id: 6, name: "", kind: 0, keys: {hold: "PD_MODE_6", lock: "PD_MODE_6_LOCK", holdCode: 0x7ef0, lockCode: 0x7ef1}}],
        qmkKeycodeAliases: {QK_USER_16: "PD_MODE_0", QK_USER_22: "PD_MODE_0_LOCK", "0x7EF0": "PD_MODE_6"},
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
                {layoutIndex: 3, keycode: "PD_MODE_0"}, {layoutIndex: 4, keycode: "KC_A"}]},
            {name: "Layer 3", displayName: "Navigation", positions: [
                {layoutIndex: 3, keycode: "PD_MODE_0_LOCK"}]},
        ],
        keyBehaviors: [
            {keycode: "LEFT_THUMB", steps: [{tapCount: 1, hold: {action: "PD_MODE_0"}}]},
            {keycode: "RIGHT_THUMB", steps: [{tapCount: 0, tap: {action: "KC_ESC"}}]},
        ],
    };
    const found = whatReachesSlot(model, slot);
    assert.equal(found.keys.length, 2, "both the hold and the lock keycode count");
    assert.deepEqual(found.layers, ["Base", "Navigation"]);
    assert.deepEqual(found.behaviours.map((row) => row.keycode), ["LEFT_THUMB"]);
    assert.equal(holdKeyName(slotWith({id: 6})), "PD_MODE_6", "slots past the named six use their number");
    assert.deepEqual(whatReachesSlot(model, undefined).keys, []);
});

test("an empty slot's bindings are found by the keyboard's own values, not by a name it has none of", () => {
    // A cleared slot has no name for the model to resolve, so its keys arrive
    // as whatever the catalogue calls the raw value. The slot still answers to
    // the same two numbers, so that is what the lookup matches on.
    assert.deepEqual(slotKeycodes(slotWith({id: 0})), [0x7e80, 0x7ea0], "hold and toggle for a named slot");
    assert.deepEqual(slotKeycodes(slotWith({id: 6})), [0x7e86, 0x7ea6], "and for a numbered one");
    assert.deepEqual(slotKeycodeNames(slotWith({id: 0})), ["PD_MODE_0", "PD_MODE_0_LOCK"], "and by name, hold then lock");
    const model = {
        qmkKeycodes: [{keycode: 0x7e86, value: "QK_USER_32"}],
        layers: [{name: "Layer 0", displayName: "Base", positions: [
            {layoutIndex: 5, keycode: "QK_USER_32", value: 0x7e86},
            {layoutIndex: 6, keycode: "KC_A", value: 0x0004},
        ]}],
        keyBehaviors: [{keycode: "LEFT_THUMB", steps: [{tapCount: 0, hold: {action: "QK_USER_32"}}]}],
        combos: [{badge: "C1", output: "QK_USER_32"}],
    };
    const found = whatReachesSlot(model, slotWith({id: 6, kind: 0}));
    assert.equal(found.keys.length, 1, "the key bound to the empty slot is found");
    assert.deepEqual(found.behaviours.map((row) => row.keycode), ["LEFT_THUMB"]);
    assert.deepEqual(found.combos.map((row) => row.badge), ["C1"], "a combo output to an empty slot is inert too");
    assert.deepEqual(whatReachesSlot({combos: model.combos, qmkKeycodes: model.qmkKeycodes}, slotWith({id: 6, kind: 0})).combos.map((row) => row.badge), ["C1"],
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
        {index: 0, name: "Base", positions: [at(0, "KC_A"), at(1, "KC_B"), at(2, "MACRO_0")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_C"), at(1, "KC_TRANSPARENT"), at(2, "KC_NO")]},
        {index: 2, name: "Symbols", positions: [at(0, "KC_TRANSPARENT"), at(1, "KC_TRANSPARENT"), at(2, "KC_TRANSPARENT")]},
    ]);
    const model = {
        keyBehaviors: [
            {keycode: "KC_B", steps: [{tapCount: 0, tap: {action: "MACRO_1"}}]},
            {keycode: "KC_C", steps: [{tapCount: 0, hold: {action: "PD_MODE_4"}}]},
        ],
        combos: [
            {id: 1, inputs: ["KC_A", "KC_B"], output: "MACRO_2"},
            {id: 2, inputs: ["KC_C", "KC_B"], output: "MACRO_3"},
        ],
        pdModes: [{id: 4, kind: 1, keys: {hold: "PD_MODE_4", lock: "PD_MODE_4_LOCK"}}],
    };
    const macroNames = (held) => reachInView(model, stack, 2, held, macroKeycodes).map((entry) => entry.name);
    assert.deepEqual(behaviourGroups(model, stack, 2).here, [], "nothing is stored on Symbols");
    // Shown alone, Symbols is the whole view, and every key on it is
    // transparent: base is not on until layers are previewed together.
    assert.deepEqual(behavioursInView(model, stack, 2, []), [], "nothing on Symbols alone");
    assert.deepEqual(combosInView(model, stack, 2, []), []);
    assert.deepEqual(macroNames([]), []);
    assert.deepEqual(behavioursInView(model, stack, 2, [0]).map((entry) => entry.row.keycode), ["KC_B"], "with base previewed on");
    assert.deepEqual(behavioursInView(model, stack, 2, [1]).map((entry) => entry.row.keycode), ["KC_C", "KC_B"]);
    assert.deepEqual(combosInView(model, stack, 2, [0]).map((entry) => entry.combo.id), [1]);
    assert.deepEqual(combosInView(model, stack, 2, [1]).map((entry) => entry.combo.id), [2],
        "a combo's inputs must coexist in this activation");
    assert.deepEqual(macroNames([0]), ["MACRO_1", "MACRO_0", "MACRO_2"]);
    assert.deepEqual(macroNames([1]), ["MACRO_1", "MACRO_3"]);
    const modes = (held) => reachInView(model, stack, 2, held,
        (keycode) => { const slot = pointingSlotFor(model, keycode); return slot ? [String(slot.id)] : []; });
    assert.deepEqual(modes([]), []);
    assert.deepEqual(modes([1]).map((entry) => entry.name), ["4"], "a visible behaviour's branch reaches the mode");
    const branch = reachInView(model, stack, 2, [1], macroKeycodes).find((entry) => entry.name === "MACRO_1");
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
            {id: 0, badge: "C1", inputs: ["KC_J", "KC_K"], output: "QK_USER_30", outputBehaviorLayers: 0xffff},
            {id: 1, badge: "C2", inputs: ["KC_K", "KC_L"], output: "QK_USER_30", outputBehaviorLayers: 0xffff},
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
        combos: [{id: 5, badge: "C6", inputs: ["MS_BTN1", "PD_MODE_1"], output: "KC_LEFT_GUI", outputBehaviorLayers: 0xffff}],
    };
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(48, "KC_LEFT_GUI"), at(30, "KC_N"), at(31, "KC_M")]},
        {index: 4, name: "Pointing", positions: [at(48, "KC_TRANSPARENT"), at(30, "PD_MODE_1"), at(31, "MS_BTN1")]},
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
            {keycode: "MACRO_0", payload: "{KC_A}", bytes: 3, empty: false},
            {keycode: "MACRO_1", payload: "{KC_B}", bytes: 3, empty: false},
            {keycode: "MACRO_2", payload: "{KC_C}", bytes: 3, empty: false},
            {keycode: "MACRO_3", payload: "", bytes: 0, empty: true},
        ],
        keyBehaviors: [
            {keycode: "KC_ESCAPE", steps: [{tapCount: 1, tap: {action: "MACRO_1"}}]},
            {keycode: "KC_B", steps: [{tapCount: 0, longHold: {action: "MACRO_2"}}]},
        ],
    };
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_ESCAPE"), at(1, "MACRO_0"), at(2, "KC_B")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_TRANSPARENT"), at(1, "KC_TRANSPARENT"), at(2, "KC_NO")]},
    ]);

    const base = macroReach(model, stack, 0);
    assert.deepEqual(base.onKeys.map((entry) => entry.name), ["MACRO_0"], "the only macro a key carries");
    assert.deepEqual(base.throughKeys, [], "the base layer has nothing under it to fall through to");
    assert.deepEqual(base.fromBranches.map((entry) => entry.name), ["MACRO_1", "MACRO_2"],
        "both branches are found, tap and long hold alike");
    assert.deepEqual(base.fromBranches[0].behaviours,
        [{keycode: "KC_ESCAPE", action: "MACRO_1", layer: null, whileHeld: false, cells: [{branch: 2, tier: "tap"}]}],
        "named by the behaviour that fires it, the cell that does and what it sends");
    assert.deepEqual(base.fromBranchesBelow, [], "nothing lies under the base layer to reach a behaviour through");
    assert.deepEqual(base.elsewhere, [], "an empty slot is not a macro this layer is missing");

    const above = macroReach(model, stack, 1);
    assert.deepEqual(above.onKeys, [], "no key on Numbers carries a macro itself");
    assert.deepEqual(above.throughKeys.map((entry) => entry.name), ["MACRO_0"],
        "a transparent key lets the macro key underneath answer");
    assert.equal(above.throughKeys[0].keys[0].layer.name, "Base", "and the group names the layer it came from");
    assert.deepEqual(above.fromBranches, [], "no behaviour mapped on Numbers sends a macro");
    assert.equal(above.fromBranchesBelow.find((entry) => entry.name === "MACRO_1").behaviours[0].layer.name,
        "Base", "and the entry names the layer holding that behaviour, since this one does not");
    assert.deepEqual(above.elsewhere, ["MACRO_2"],
        "KC_NO on the layer being viewed is the top answer, so KC_B on Base is not reached");
});


test("a thing reached several ways is listed under each of them", () => {
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const model = {
        macros: [
            {keycode: "MACRO_0", payload: "{KC_A}", bytes: 3, empty: false},
            {keycode: "MACRO_1", payload: "{KC_B}", bytes: 3, empty: false},
        ],
        keyBehaviors: [
            {keycode: "KC_ESCAPE", steps: [{tapCount: 1, tap: {action: "MACRO_0"}}]},
            {keycode: "KC_B", steps: [{tapCount: 1, tap: {action: "MACRO_1"}}]},
        ],
    };
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_ESCAPE"), at(1, "MACRO_1"), at(2, "KC_X")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_ESCAPE"), at(1, "KC_TRANSPARENT"), at(2, "KC_B")]},
    ]);

    // MACRO_1 sits on a key below and is also fired by KC_B, a behaviour
    // mapped on Numbers itself. Both are real ways to reach it, so both are
    // answered — each entry carrying only the route it is filed under.
    const above = macroReach(model, stack, 1);
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
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const clear = (indexes) => indexes.map((i) => at(i, "KC_TRANSPARENT"));
    const model = {
        macros: [0, 1, 2].map((n) => ({keycode: `MACRO_${n}`, payload: "{KC_A}", bytes: 3, empty: false})),
        keyBehaviors: [
            {keycode: "KC_A", steps: [{tapCount: 0, tap: {action: "KC_A"}}]},
            {keycode: "KC_B", steps: [{tapCount: 0, tap: {action: "KC_B"}}]},
            {keycode: "KC_C", steps: [{tapCount: 0, tap: {action: "KC_C"}}]},
        ],
    };
    // Each layer under the top one answers a different position, so the order
    // the rows come back in is the order of the layers that answer them.
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "MACRO_2"), at(1, "KC_NO"), at(2, "KC_NO"), at(3, "KC_C")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_NO"), at(1, "MACRO_1"), at(2, "KC_NO"), at(3, "KC_B")]},
        {index: 2, name: "Symbols", positions: [at(0, "KC_NO"), at(1, "KC_NO"), at(2, "MACRO_0"), at(3, "KC_A")]},
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
        pdModes: [{id: 0, name: "Dragscroll", kind: 2, keys: {hold: "PD_MODE_0", lock: "PD_MODE_0_LOCK", holdCode: 0x7e50, lockCode: 0x7e56}}],
        qmkKeycodeAliases: {},
        keyBehaviors: [{keycode: "PD_MODE_0", steps: [{tapCount: 0, hold: {action: "PD_MODE_0_LOCK"}}]}],
    };
    const stack = withAnswers([{index: 0, name: "Base", positions: [{layoutIndex: 50, keycode: "PD_MODE_0", display: "Dragscroll · hold"}]}]);
    const reach = pointingReach(model, stack, 0);

    assert.deepEqual(reach.onKeys.map((entry) => entry.name), ["0"], "the key holds the mode");
    assert.deepEqual(reach.fromBranches.map((entry) => entry.name), ["0"], "and its own behaviour toggles it");
    assert.deepEqual(reach.fromBranches[0].behaviours,
        [{keycode: "PD_MODE_0", action: "PD_MODE_0_LOCK", layer: null, whileHeld: false, cells: [{branch: 1, tier: "hold"}]}],
        "so the branch keeps the toggle keycode, not just the slot it lands on");
});

test("a branch route names every cell that sends it, once", () => {
    // A row says which cell fires the thing ("2× hold"), so a behaviour that
    // sends it from two cells is one route with both, and a key the stack
    // reaches twice does not list a cell twice.
    const model = {
        pdModes: [{id: 3, name: "Zoom", kind: 1, keys: {hold: "PD_MODE_3", lock: "PD_MODE_3_LOCK", holdCode: 0x7e53, lockCode: 0x7e59}}],
        qmkKeycodeAliases: {},
        keyBehaviors: [
            {keycode: "KC_Q", steps: [{tapCount: 0, longHold: {action: "PD_MODE_3"}}, {tapCount: 1, hold: {action: "PD_MODE_3"}, tap: {action: "PD_MODE_3_LOCK"}}]},
            {keycode: "KC_RIGHT_ALT", steps: [{tapCount: 0, tap: {action: "PD_MODE_3_LOCK"}}]},
        ],
        combos: [{id: 5, badge: "C5", inputs: ["KC_D", "KC_F"], output: "KC_RIGHT_ALT", useOutputBehavior: true, enabled: true, allowedLayers: 0xffff, outputBehaviorLayers: 0xffff}],
    };
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, semantic: keycode, display: keycode});
    const stack = withAnswers([{index: 0, name: "Base", positions: [at(0, "KC_Q"), at(1, "KC_Q"), at(2, "KC_D"), at(3, "KC_F")]}]);
    const names = (keycode) => { const slot = pointingSlotFor(model, keycode); return slot ? [String(slot.id)] : []; };

    const [zoom] = reachInView(model, stack, 0, [], names);
    assert.deepEqual(zoom.behaviours.map(({action, cells}) => [action, cells]), [
        ["PD_MODE_3", [{branch: 1, tier: "long"}, {branch: 2, tier: "hold"}]],
        ["PD_MODE_3_LOCK", [{branch: 2, tier: "tap"}]],
    ], "one route per keycode sent, each with its cells, though two keys carry the behaviour");
    assert.deepEqual(zoom.combos.map(({via, action, cells}) => [via, action, cells]), [["KC_RIGHT_ALT", "PD_MODE_3_LOCK", [{branch: 1, tier: "tap"}]]],
        "a combo through a behaviour names the cell of that behaviour");

    const groups = pointingReach(model, stack, 0);
    assert.deepEqual(groups.fromBranches[0].behaviours.map(({cells}) => cells),
        [[{branch: 1, tier: "long"}, {branch: 2, tier: "hold"}], [{branch: 2, tier: "tap"}]], "the grouped routes carry the same cells");
    assert.deepEqual(groups.fromCombos[0].combos.map(({cells}) => cells), [[{branch: 1, tier: "tap"}]]);
});

test("a combo reaches the macro it sends, and what a behaviour it sends reaches", () => {
    // A combo's output runs through the same stages a key press does: it can
    // fire a macro itself, or fire a behaviour whose branch plays one. Neither
    // is on any key, so without this both read as unreachable.
    const at = (layoutIndex, keycode, semantic) => ({layoutIndex, keycode, semantic, display: keycode});
    const model = {
        macros: [
            {keycode: "MACRO_0", payload: "{KC_A}", empty: false},
            {keycode: "MACRO_1", payload: "{KC_B}", empty: false},
            {keycode: "MACRO_2", payload: "{KC_C}", empty: false},
        ],
        qmkKeycodeAliases: {QK_MACRO_0: "MACRO_0", QK_USER_30: "LEFT_THUMB"},
        keyBehaviors: [{keycode: "LEFT_THUMB", steps: [{tapCount: 1, hold: {action: "MACRO_1"}}]}],
        combos: [
            // A macro has no behaviour; the behaviour C2 sends runs on every layer.
            {id: 0, badge: "C1", inputs: ["KC_J", "KC_K"], output: "QK_MACRO_0", outputBehaviorLayers: 0},
            {id: 1, badge: "C2", inputs: ["KC_J", "KC_L"], output: "QK_USER_30", outputBehaviorLayers: 0xffff},
        ],
    };
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_J"), at(1, "KC_K"), at(2, "KC_L")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_TRANSPARENT"), at(1, "KC_K"), at(2, "KC_1")]},
    ]);

    const base = macroReach(model, stack, 0);
    assert.deepEqual(base.fromCombos.map((entry) => entry.name), ["MACRO_0", "MACRO_1"]);
    assert.deepEqual(base.fromCombos[0].combos.map((route) => [route.combo.badge, route.via, route.action]),
        [["C1", null, "MACRO_0"]], "sent by the combo itself, matched by meaning rather than the catalogue name");
    assert.deepEqual(base.fromCombos[1].combos.map((route) => [route.combo.badge, route.via, route.action]),
        [["C2", "LEFT_THUMB", "MACRO_1"]], "sent by a branch of the behaviour the combo fires");
    assert.deepEqual(base.elsewhere, ["MACRO_2"], "a combo's macro is no longer called unreachable");
    assert.deepEqual(reachKeys(stack, 0, base.fromCombos[0]).sort(), [0, 1], "the board rings the keys chorded to fire it");

    const above = macroReach(model, stack, 1);
    assert.deepEqual(above.fromCombos, [], "on Numbers C1 needs the transparent J, so it is not this layer's own");
    assert.deepEqual(above.fromCombosBelow.map((entry) => entry.name), ["MACRO_0"]);
    assert.deepEqual(above.elsewhere, ["MACRO_1", "MACRO_2"], "C2 needs L, and Numbers stores 1 there");
    // Core publishes no layers while its output behaviour is off
    // (tests/model/participation.test.js says when).
    model.combos[1].outputBehaviorLayers = 0;
    assert.deepEqual(macroReach(model, stack, 0).fromCombos.map(entry => entry.name), ["MACRO_0"]);
    assert.deepEqual(behaviourGroups(model, stack, 0).combos, []);
    assert.deepEqual(behavioursInView(model, stack, 0).filter(entry => entry.combos.length), []);
    assert.deepEqual(macroReach(model, stack, 0).fromCombos.map(entry => entry.name), ["MACRO_0"], "a bypassed output retains the directly sent macro");
    assert.deepEqual(reachInView(model, stack, 0, [], macroKeycodes).map(entry => entry.name), ["MACRO_0"]);
    model.combos[1].outputBehaviorLayers = 0xffff;
    assert.deepEqual(macroReach(model, stack, 0).fromCombos.map(entry => entry.name), ["MACRO_0", "MACRO_1"]);

});

test("a combo reaches the pointing mode it sends", () => {
    const model = {
        pdModes: [{id: 0, name: "Dragscroll", kind: 2, keys: {hold: "PD_MODE_0", lock: "PD_MODE_0_LOCK", holdCode: 0x7e50, lockCode: 0x7e56}}],
        qmkKeycodeAliases: {QK_USER_16: "PD_MODE_0"},
        combos: [{id: 0, badge: "C1", inputs: ["KC_J", "KC_K"], output: "QK_USER_16"}],
    };
    const stack = withAnswers([{index: 0, name: "Base", positions: [{layoutIndex: 0, keycode: "KC_J"}, {layoutIndex: 1, keycode: "KC_K"}]}]);
    const reach = pointingReach(model, stack, 0);
    assert.deepEqual(reach.fromCombos.map((entry) => entry.name), ["0"]);
    assert.deepEqual(reach.elsewhere, []);
});

// A pointing slot as the core publishes it: its link's live starting layers,
// each with the layers that end a start from it (core/model/pointing-links.js).
/** @param {number} id @param {string} name @param {{layer: number, ends?: number}[]} starts */
const linkedSlot = (id, name, starts) => ({id, name, kind: 1, linkedLayers: starts.reduce((mask, start) => mask | 1 << start.layer, 0), linkTurnsOn: 0, linkEnds: 0,
    linkStarts: starts.map((start) => ({ends: 0, ...start})), keys: {hold: `PD_MODE_${id}`, lock: `PD_MODE_${id}_LOCK`, holdCode: 0x7e80 + id, lockCode: 0x7ea0 + id}});

test("a layer that starts a pointing mode reaches it on that layer, with no key", () => {
    // A slot's starting layers start its mode whenever one turns on (firmware
    // D-F62), so the layer reaches the mode by itself. The core leaves out of
    // linkStarts the layers the keyboard ignores in a link.
    const model = {pdModes: [linkedSlot(4, "Arrow", [{layer: 3}]), {...linkedSlot(5, "Zoom", []), linkedLayers: 1 << 2},
        linkedSlot(6, "Scroll", [{layer: 1}, {layer: 3}])], qmkKeycodeAliases: {}, qmkKeyTurnsOn: {}};
    const stack = withAnswers([0, 1, 2, 3].map((index) => ({index, name: `L${index}`,
        positions: [{layoutIndex: 0, keycode: index === 3 ? "PD_MODE_6" : "KC_A"}]})));

    const top = pointingReach(model, stack, 3);
    assert.deepEqual(top.onKeys.map((entry) => entry.name), ["6", "4"], "the key here, then the modes the layer starts");
    assert.deepEqual(top.onKeys.map((entry) => entry.starts?.map((layer) => layer.index)), [[3], [3]],
        "a mode on a key here that the layer also starts names both");
    assert.equal(top.onKeys[1].keys.length, 0, "a started mode rings no key");
    assert.deepEqual(top.elsewhere, ["5"]);
    assert.deepEqual(pointingReach(model, stack, 2).onKeys, [], "a layer the keyboard ignores in a link starts nothing");
    assert.deepEqual(pointingReach(model, stack, 1).onKeys.map((entry) => entry.name), ["6"]);
    assert.deepEqual(pointingReach(model, stack, 0).elsewhere, ["4", "5", "6"]);

    assert.deepEqual(pointingReachInView(model, stack, 1, []).map((entry) => entry.name), ["6"], "a layer shown alone starts its mode");
    assert.deepEqual(pointingReachInView(model, stack, 1, [3]).map((entry) => [entry.name, entry.starts?.map((layer) => layer.index)]),
        [["4", [3]], ["6", [1, 3]]], "in a view, every layer on starts its mode, in slot order");
});

test("a key that turns on a layer starting a pointing mode reaches the mode", () => {
    // Turning the layer on starts the mode, whatever turns it on: a layer key,
    // a custom key's shortcut layers, a pointing-mode key's link, a behaviour
    // branch or a combo sending one. What each keycode turns on is the core's
    // (qmkKeyTurnsOn), which leaves out DF and PDF.
    const model = {
        pdModes: [linkedSlot(4, "Arrow", [{layer: 3}]), {...linkedSlot(5, "Zoom", []), linkTurnsOn: 1 << 3}],
        qmkKeycodeAliases: {},
        qmkKeyTurnsOn: {"MO(3)": 1 << 3, "TG(3)": 1 << 3, "TO(3)": 1 << 3, "CUSTOM_KEY_2": 1 << 3, "PD_MODE_5": 1 << 3, "MO(2)": 1 << 2},
        keyBehaviors: [{keycode: "KC_B", steps: [{tapCount: 0, hold: {action: "TG(3)"}}]}],
        combos: [{id: 0, badge: "C1", inputs: ["KC_J", "KC_K"], output: "TO(3)"}],
    };
    const keys = ["MO(3)", "CUSTOM_KEY_2", "KC_B", "DF(3)", "MO(2)", "KC_J", "KC_K", "PD_MODE_5"];
    const stack = withAnswers([0, 1, 2, 3].map((index) => ({index, name: `L${index}`,
        positions: index ? [] : keys.map((keycode, layoutIndex) => ({layoutIndex, keycode}))})));

    const reach = pointingReach(model, stack, 0);
    const arrow = reach.onKeys.find((entry) => entry.name === "4");
    assert.deepEqual(arrow?.keys.map((key) => key.position.keycode), ["MO(3)", "CUSTOM_KEY_2", "PD_MODE_5"],
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
    const higher = (layer) => (0xffff << (layer + 1)) & 0xffff;
    const model = {pdModes: [linkedSlot(4, "Arrow", [{layer: 2, ends: higher(2)}])], qmkKeycodeAliases: {},
        qmkKeyTurnsOn: {"MO(2)": 1 << 2, "CUSTOM_KEY_1": (1 << 2) | (1 << 5)}};
    const stack = withAnswers([0, 1, 2, 3].map((index) => ({index, name: `L${index}`,
        positions: index === 0 ? [{layoutIndex: 0, keycode: "MO(2)"}, {layoutIndex: 1, keycode: "CUSTOM_KEY_1"}]
            : index === 1 ? [{layoutIndex: 0, keycode: "MO(2)"}, {layoutIndex: 1, keycode: "KC_TRNS"}]
                : [{layoutIndex: 0, keycode: "MO(2)"}, {layoutIndex: 1, keycode: "KC_TRNS"}]})));

    const base = pointingReach(model, stack, 0).onKeys.find((entry) => entry.name === "4");
    assert.deepEqual(base?.keys.map((key) => key.position.keycode), ["MO(2)"], "MO(2) on Base starts it; a key also turning on a higher layer ends it");
    assert.deepEqual(pointingReach(model, stack, 1).onKeys.map((entry) => entry.name), ["4"], "on a layer below the starting layer");
    assert.deepEqual(pointingReach(model, stack, 3).onKeys, [], "on a higher layer, which ends it");
    assert.ok(pointingReach(model, stack, 3).elsewhere.includes("4"));
    assert.deepEqual(pointingReachInView(model, stack, 1, [3]).map((entry) => entry.name), [], "a view with a higher layer on ends it");
    assert.deepEqual(pointingReachInView(model, stack, 2, []).map((entry) => entry.name), ["4"], "the starting layer shown alone starts it");
    assert.deepEqual(pointingReachInView(model, stack, 2, [3]), [], "and not with a higher layer held");
});

test("cold macro placement lookup avoids combinations of layers that cannot change combo answers", () => {
    for (const combos of [[], [{id: 0, inputs: ["KC_A", "KC_B"], output: "MACRO_0"}]]) {
        let reads = 0;
        const stack = withAnswers(Array.from({length: 16}, (_, index) => ({index, get positions() {
            reads++;
            return [{layoutIndex: 0, keycode: "KC_A"}, {layoutIndex: 1, keycode: "KC_B"}];
        }})));
        const placements = macroPlacements({combos}, stack, "MACRO_0");
        assert.equal(placements.length, combos.length ? 16 : 0);
        assert.ok(reads < 1000, `cold lookup read layers ${reads} times`);
    }
});

test("a macro's layers are the ones that hold a way to it themselves", () => {
    const at = (layoutIndex, keycode, semantic) => ({layoutIndex, keycode, semantic, display: keycode});
    const model = {
        macros: [1, 2, 3, 10].map((n) => ({keycode: `MACRO_${n}`, payload: "{KC_A}", empty: false})),
        qmkKeycodeAliases: {QK_MACRO_3: "MACRO_3"},
        keyBehaviors: [{keycode: "KC_ESCAPE", steps: [{tapCount: 1, tap: {action: "MACRO_2"}}]}],
        combos: [{id: 0, badge: "C1", inputs: ["KC_B", "KC_C"], output: "QK_MACRO_3"}],
    };
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "QK_MACRO_1", "MACRO_1"), at(1, "KC_A"), at(2, "QK_MACRO_1", "MACRO_1")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_TRANSPARENT"), at(1, "KC_ESCAPE"), at(2, "KC_NO")]},
        {index: 4, name: "Symbols", positions: [at(0, "KC_B"), at(1, "QK_MACRO_1", "MACRO_1"), at(2, "KC_C")]},
    ]);
    const summary = (keycode) => macroPlacements(model, stack, keycode)
        .map((entry) => [entry.layer.name, entry.at, entry.routes.map((route) => [route.group, route.keys.sort()])]);

    assert.deepEqual(summary("MACRO_1"), [["Base", 0, [["here", [0, 2]]]], ["Symbols", 2, [["here", [1]]]]],
        "a key naming it, with the stack position a screen selects; Numbers only falls through to Base's");
    assert.deepEqual(summary("MACRO_2"), [["Numbers", 1, [["branches", [1]]]]],
        "a behaviour mapped there sends it, and the board rings the behaviour's key");
    assert.deepEqual(summary("MACRO_3"), [["Symbols", 2, [["combos", [0, 2]]]]],
        "a combo firing from that layer's keys sends it");
    assert.deepEqual(summary("MACRO_10"), [], "MACRO_1 does not match MACRO_10");
    assert.deepEqual(macroPlacements(model, undefined, "MACRO_1"), []);
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
        customKeys: [0, 1].map((slot) => ({slot, keycode: `CUSTOM_KEY_${slot}`, name: "", hasBehavior: false, shortcut: {mods: slot ? 0 : 0x41, keys: [slot ? 0 : 0x0e]}})),
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
        steps: [{tapCount: 1, tap: {action: "MACRO_0"}}]};
    // The layers core publishes for its output: the row's own.
    const combo = {id: 0, inputs: ["KC_A", "KC_B"], output: "CUSTOM_KEY_0", outputBehaviorLayers: 1};
    const model = {keyBehaviors: [row], combos: [combo],
        participation: {behaviorsEnabled: true, comboOutputBehaviors: true, layers: []},
        macros: [{keycode: "MACRO_0", empty: false}]};
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_C"), at(1, "KC_B")]},
        {index: 1, name: "Overlay", positions: [at(0, "KC_A"), at(1, "KC_TRANSPARENT")]},
        {index: 2, name: "Reference", positions: [at(0, "KC_A"), at(1, "KC_B")]},
    ]);
    // Base previewed on under Overlay, so B answers from it in the view.
    const view = () => behavioursInView(model, stack, 1, [0]);
    assert.equal(view().length, 1, "B owns Base policy despite A coming from Overlay");
    combo.inputs.reverse();
    assert.equal(view().length, 0, "A becomes the declared owner, so B cannot lend its allowance");
    combo.inputs.reverse();
    model.comboReferenceLayers = Object.assign(Array.from({length: 16}, (_, layer) => layer), {1: 2});
    assert.equal(view().length, 1, "reference remapping retains Base's physical origin");
    combo.outputBehaviorLayers = 4;
    assert.equal(view().length, 0, "a reference-layer allowance cannot enable the output");
    combo.outputBehaviorLayers = 0;
    assert.equal(view().length, 0, "no layers, as with the behaviour or the behaviours switch off");
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
