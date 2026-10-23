import {withAnswers} from "../fixtures/layer-answers.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {comboBehaviours, combosInView, combosForKey, comboReferenceLayer, comboGroups, combosAt, combosInPreview, combosShownAt, comboAnswers, comboInputIsKey, comboInputKeys, comboInputShown, combosOnKey, toggleComboInput} from "../../webview/view/combo-reach.mjs";

test("combos follow the device's own input positions before falling back to keycodes", () => {
    const model = {combos: [
        {badge: "C1", inputs: ["KC_D", "KC_F"], inputPositions: [27, 28], output: "KC_ESC"},
        {badge: "C2", inputs: ["KC_J", "KC_K"], output: "KC_TAB"},
    ]};
    assert.deepEqual(combosForKey(model, {layoutIndex: 27, keycode: "KC_D"}).map((c) => c.badge), ["C1"]);
    assert.deepEqual(combosForKey(model, {layoutIndex: 99, keycode: "KC_J"}).map((c) => c.badge), ["C2"]);
    assert.deepEqual(combosForKey(model, {layoutIndex: 99, keycode: "KC_Z"}), []);
});

test("the combo table and the board's badges count the same keys", () => {
    // Real keyboards do not always report per-layer input references, and when
    // they do not, the board matched by keycode while the table looked at the
    // missing field and called every combo unreachable.
    const combo = {badge: "C1", inputs: ["KC_D", "LT(3,KC_F)"], output: "KC_TAB"};
    const layer = {name: "Layer 0", positions: [
        {layoutIndex: 27, keycode: "KC_D"}, {layoutIndex: 28, keycode: "LT(3,KC_F)"}, {layoutIndex: 29, keycode: "KC_G"}]};
    const model = {combos: [combo], layers: [layer]};

    const whole = comboGroups(model, withAnswers([layer]), 0);
    assert.deepEqual(whole.onKeys[0].keys.map((key) => key.position.layoutIndex), [27, 28]);
    assert.deepEqual(combosForKey(model, layer.positions[0]).map((row) => row.badge), ["C1"],
        "the badge and the count come from one predicate");
    assert.deepEqual(combosForKey(model, layer.positions[2]), []);

    const half = {name: "Layer 3", positions: [{layoutIndex: 27, keycode: "KC_D"}]};
    const partial = comboGroups({combos: [combo]}, withAnswers([half]), 0);
    assert.deepEqual(partial.onKeys, [], "a partly present combo is not reachable");
    assert.equal(partial.elsewhere[0].keys.length, 1, "and the table still says how much of it is here");

    // A device that does report positions still wins, on those positions.
    const reported = {badge: "C2", inputs: ["KC_N", "KC_M"], inputPositions: [42]};
    const byPosition = comboGroups({combos: [reported]},
        withAnswers([{positions: [{layoutIndex: 42, keycode: "KC_X"}, {layoutIndex: 43, keycode: "KC_M"}]}]), 0);
    assert.deepEqual(byPosition.elsewhere[0].keys.map((key) => key.position.layoutIndex), [42]);
});

test("combos group by whether this layer produces all of their inputs", () => {
    const combo = {id: 1, badge: "C1", inputs: ["KC_D", "KC_F"], output: "KC_TAB"};
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(27, "KC_D"), at(28, "KC_F")]},
        {index: 1, name: "Numbers", positions: [at(27, "KC_TRANSPARENT"), at(28, "KC_TRANSPARENT")]},
        {index: 2, name: "Symbols", positions: [at(27, "KC_TRANSPARENT"), at(28, "KC_NO")]},
    ]);
    const model = {combos: [combo]};

    assert.equal(comboGroups(model, stack, 0).onKeys.length, 1, "both inputs are stored here");
    const above = comboGroups(model, stack, 1);
    assert.equal(above.onKeys.length, 0);
    assert.equal(above.throughKeys.length, 1, "both inputs fall through, so the combo still fires");
    const blocked = comboGroups(model, stack, 2);
    assert.equal(blocked.throughKeys.length, 0);
    assert.equal(blocked.elsewhere[0].keys.length, 1, "KC_NO takes one input away, so it cannot fire");
});

test("view combos follow the keyboard's reference layer", () => {
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode});
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(0, "KC_A"), at(1, "KC_B")]},
        {index: 1, name: "Numbers", positions: [at(0, "KC_C"), at(1, "KC_D")]},
    ]);
    const model = {
        comboReadback: {layerReferences: [0, 0]},
        combos: [{id: 7, inputs: ["KC_A", "KC_B"], output: "KC_TAB"}],
    };
    const inView = combosInView(model, stack, 1, []);
    assert.deepEqual(inView.map((entry) => entry.combo.id), [7]);
    assert.ok(inView[0].keys.every((key) => key.reference && key.layer.name === "Base"));
});

test("a combo fires only if one activation carries every input at once", () => {
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const combo = {id: 1, badge: "C1", inputs: ["KC_D", "KC_F"], output: "KC_TAB"};
    // KC_D answers only with Numbers held; KC_F only without it. Each input is
    // reachable, the pair never is — which a per-key union would miss.
    const split = [
        {index: 0, name: "Base", positions: [at(27, "KC_X"), at(28, "KC_F")]},
        {index: 1, name: "Numbers", positions: [at(27, "KC_D"), at(28, "KC_NO")]},
        {index: 2, name: "Symbols", positions: [at(27, "KC_TRANSPARENT"), at(28, "KC_TRANSPARENT")]},
    ];
    const never = comboGroups({combos: [combo]}, withAnswers(split), 2);
    assert.deepEqual(never.onKeys, []);
    assert.deepEqual(never.throughKeys, [], "no single hold carries both inputs");
    assert.equal(never.elsewhere.length, 1);
    assert.equal(never.elsewhere[0].keys.length, 1, "and the row says how far any one hold gets");

    // Move KC_F onto Numbers and one hold carries both.
    const together = [
        split[0],
        {index: 1, name: "Numbers", positions: [at(27, "KC_D"), at(28, "KC_F")]},
        split[2],
    ];
    const fires = comboGroups({combos: [combo]}, withAnswers(together), 2);
    assert.deepEqual(fires.elsewhere, []);
    assert.equal(fires.throughKeys.length, 1);
    assert.deepEqual(fires.throughKeys[0].held.map((layer) => layer.name), ["Numbers"],
        "and it names the layer you have to hold as well");
});

test("the combo builder picks the key that answers, and rings its inputs by name on every layer", () => {
    const layer = (index, keycodes) => ({index, positions: keycodes.map((keycode, layoutIndex) => ({layoutIndex, keycode, display: keycode}))});
    const stack = withAnswers([
        layer(0, ["KC_A", "KC_B", "KC_C", "KC_D"]),
        layer(1, ["KC_TRANSPARENT", "KC_BTN1", "KC_COMMA", "KC_TRANSPARENT"]),
        layer(2, ["KC_TRANSPARENT", "KC_TRANSPARENT", "KC_X", "KC_NO"]),
    ]);
    // A transparent key picks what shows through it: the default layer on its
    // own, the highest layer previewed on that is not transparent otherwise.
    assert.equal(comboAnswers({}, stack, 1).get(0).keycode, "KC_A");
    assert.equal(comboAnswers({}, stack, 2).get(1).keycode, "KC_B", "a layer not previewed on neither answers nor blocks");
    assert.equal(comboAnswers({}, stack, 2, [1]).get(1).keycode, "KC_BTN1");
    assert.deepEqual(toggleComboInput([], comboAnswers({}, stack, 2).get(0)), ["KC_A"], "never the raw transparent keycode");

    // Picked on one layer, an input stays that key after the board moves on:
    // Numbers' comma sits where Base has C, and the builder keeps the comma.
    let inputs = toggleComboInput([], comboAnswers({}, stack, 1).get(1));
    inputs = toggleComboInput(inputs, comboAnswers({}, stack, 0).get(3));
    assert.deepEqual(inputs, ["KC_BTN1", "KC_D"]);
    assert.deepEqual(comboInputKeys({}, stack, 0, [], ["KC_COMMA", "KC_A"]), [0],
        "Base rings its own A, not the position Numbers holds the comma at");
    assert.deepEqual(comboInputKeys({}, stack, 1, [], ["KC_COMMA", "KC_A"]), [0, 2]);
    assert.equal(comboInputShown({}, stack, 0, [], "KC_COMMA"), false, "an input no key here presses is kept, not rung");
    assert.equal(comboInputShown({}, stack, 1, [], "KC_COMMA"), true);

    assert.deepEqual(toggleComboInput(["KC_A"], comboAnswers({}, stack, 2).get(3)), ["KC_A"], "a disabled key is not an input");

    // At the keyboard's combo input limit no key joins, but one can still leave.
    assert.deepEqual(toggleComboInput(["KC_A", "KC_B"], comboAnswers({}, stack, 0).get(2), 2), ["KC_A", "KC_B"], "a full combo takes no more");
    assert.deepEqual(toggleComboInput(["KC_A", "KC_B"], comboAnswers({}, stack, 0).get(1), 2), ["KC_A"]);
    assert.deepEqual(toggleComboInput(["KC_A"], comboAnswers({}, stack, 0).get(2), 2), ["KC_A", "KC_C"]);
});

test("the selected key lists the combos it is an input of, as the layers in view answer it", () => {
    const layer = (index, keycodes) => ({index, positions: keycodes.map((keycode, layoutIndex) => ({layoutIndex, keycode, display: keycode}))});
    const stack = withAnswers([
        layer(0, ["KC_A", "KC_B", "KC_C"]),
        layer(1, ["KC_TRANSPARENT", "KC_COMMA", "KC_TRANSPARENT"]),
        layer(2, ["KC_TRANSPARENT", "KC_TRANSPARENT", "KC_TRANSPARENT"]),
    ]);
    const combos = [
        {id: 0, badge: "C0", inputs: ["KC_A", "KC_B"]},
        {id: 1, badge: "C1", inputs: ["KC_COMMA", "KC_A"]},
        {id: 2, badge: "C2", inputs: ["KC_C", "KC_B"]},
    ];
    const ids = (answer) => answer.combos.map((combo) => combo.id);
    assert.deepEqual(ids(combosOnKey({combos}, stack, 0, [], 0)), [0, 1]);
    assert.deepEqual(ids(combosOnKey({combos}, stack, 1, [], 1)), [1], "the layer's own key");
    assert.deepEqual(ids(combosOnKey({combos}, stack, 2, [], 1)), [0, 2], "on its own, a transparent key shows the default layer's");
    const previewed = combosOnKey({combos}, stack, 2, [1], 1);
    assert.equal(previewed.position.keycode, "KC_COMMA");
    assert.deepEqual(ids(previewed), [1], "with a layer previewed on, the highest one that is not transparent");
    const nothing = combosOnKey({combos}, [layer(0, ["KC_TRANSPARENT"])], 0, [], 0);
    assert.equal(nothing.position, null);
    assert.deepEqual(nothing.combos, [], "a key nothing answers takes part in nothing");
});

test("builder inputs keep the combo's stored order; a removed one picked again comes last", () => {
    // QMK's "keys in order" is the stored order, so an edit must not rearrange it.
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode});
    assert.deepEqual(toggleComboInput(["KC_W", "KC_Q"], at(3, "KC_E")), ["KC_W", "KC_Q", "KC_E"], "an added input comes last");
    assert.deepEqual(toggleComboInput(["KC_W", "KC_Q"], at(1, "KC_W")), ["KC_Q"], "clicking an input's key takes it out");
    assert.deepEqual(toggleComboInput(["KC_Q"], at(1, "KC_W")), ["KC_Q", "KC_W"], "a removed input picked again counts as added");
    const semantic = {layoutIndex: 5, keycode: "QK_USER_17", semantic: "VOLUME"};
    assert.deepEqual(toggleComboInput(["VOLUME"], semantic), [], "an input stored by its meaning matches its key");
});

test("an input placed on two keys rings both, and still counts as one input", () => {
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const combo = {id: 7, badge: "C7", inputs: ["G(KC_C)", "G(KC_V)"], output: "G(KC_A)"};
    const layer = {index: 0, name: "Navigation", positions: [
        at(3, "G(KC_C)"), at(4, "G(KC_V)"), at(19, "G(KC_C)"), at(21, "G(KC_V)"), at(20, "KC_UP")]};
    const groups = comboGroups({combos: [combo]}, withAnswers([layer]), 0);
    assert.equal(groups.onKeys.length, 1);
    assert.deepEqual(groups.onKeys[0].keys.map((key) => key.position.layoutIndex), [3, 4, 19, 21],
        "every key carrying an input is where the combo can be pressed");
    assert.equal(groups.onKeys[0].covered, 2);

    const half = {index: 0, name: "Half", positions: [at(3, "G(KC_C)"), at(19, "G(KC_C)")]};
    const partial = comboGroups({combos: [combo]}, withAnswers([half]), 0);
    assert.deepEqual(partial.onKeys, [], "two copies of one input do not complete a two-input combo");
    assert.equal(partial.elsewhere[0].covered, 1);

    assert.deepEqual(comboInputKeys({}, withAnswers([layer]), 0, [], combo.inputs), [3, 4, 19, 21], "the builder rings both");
    assert.deepEqual(toggleComboInput(combo.inputs, layer.positions[2]), ["G(KC_V)"],
        "and either key is the one input, so picking cannot duplicate it");
});

test("combos follow the keyboard's combo layer matching", () => {
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const combo = {id: 1, badge: "C1", inputs: ["KC_Q", "KC_W"], output: "KC_ESC"};
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(13, "KC_Q"), at(14, "KC_W")]},
        {index: 1, name: "Numbers", positions: [at(13, "KC_1"), at(14, "KC_2")]},
    ]);
    const own = comboGroups({combos: [combo]}, stack, 1);
    assert.equal(own.elsewhere.length, 1, "matched on its own keys, Numbers cannot fire a Q+W combo");

    // "Combos on Numbers → Base": the keyboard matches Base's keycodes while Numbers is on top.
    const settings = {configDefaults: [{id: "comboReferences", fields: [{macro: "comboReference1", value: "Layer 0"}]}]};
    const referenced = comboGroups({...settings, combos: [combo]}, stack, 1);
    assert.equal(referenced.onKeys.length, 1);
    assert.deepEqual(referenced.onKeys[0].keys.map((key) => key.position.layoutIndex), [13, 14]);
    assert.ok(referenced.onKeys[0].keys.every((key) => key.reference && key.layer.name === "Base"));
    assert.equal(comboReferenceLayer({comboReadback: {layerReferences: [0, 0]}}, 1), 0, "the readback answers without settings");
    assert.equal(comboReferenceLayer({}, 1), 1, "and each layer matches itself by default");

    assert.deepEqual(comboInputKeys({...settings}, stack, 1, [], combo.inputs), [13, 14], "the builder rings the keys the keyboard matches");
    assert.equal(comboAnswers({...settings}, stack, 1).get(13).keycode, "KC_Q", "and picks the keycode it matches, not Numbers' own");
});

test("a key carries the badges of combos its own keycode fires on this layer, like behaviour dots", () => {
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const combo = {id: 1, badge: "C1", inputs: ["KC_D", "KC_F"], output: "KC_TAB"};
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(1, "KC_D"), at(2, "KC_F")]},
        {index: 1, name: "Numbers", positions: [at(1, "KC_TRANSPARENT"), at(2, "KC_TRANSPARENT")]},
        {index: 2, name: "Symbols", positions: [at(1, "KC_D"), at(2, "KC_NO")]},
    ]);
    const model = {combos: [combo], layers: stack};
    const badges = (layer, key) => combosAt(model, stack, layer, key).map((row) => row.badge);
    assert.deepEqual(badges(0, 1), ["C1"]);
    assert.deepEqual(badges(1, 1), [], "a transparent key shows nothing of the layer below, as behaviours do");
    assert.equal(comboGroups(model, stack, 1).throughKeys.length, 1, "the Combos tab still lists it as reached through");
    assert.deepEqual(badges(2, 1), [], "KC_D is here, but KC_F is not, so C1 never fires and marks nothing");

    const referenced = {...model, configDefaults: [{id: "comboReferences", fields: [{macro: "comboReference2", value: "Layer 0"}]}]};
    assert.deepEqual(combosAt(referenced, stack, 2, 2).map((row) => row.badge), ["C1"],
        "under Combo Layer Matching the keys Base supplies are marked");
    assert.equal(combosAt(model, stack, 0, 1), combosAt(model, stack, 0, 1), "one grouping per model and layer");
});

test("in a layer preview, a key answered from below wears the badges of combos it fires there", () => {
    // Base's layer-tap key stays transparent on Pointing, and C4 chords it with
    // Pointing's own mouse buttons: with Base on, the board shows that key and its badge.
    const at = (layoutIndex, keycode) => ({layoutIndex, keycode, display: keycode});
    const chord = {id: 4, badge: "C4", inputs: ["KC_BTN1", "LT(3,KC_SLASH)"], output: "LGUI(KC_N)"};
    const base = {id: 0, badge: "C0", inputs: ["KC_D", "LT(3,KC_SLASH)"], output: "KC_TAB"};
    const stack = withAnswers([
        {index: 0, name: "Base", positions: [at(1, "KC_D"), at(2, "LT(3,KC_SLASH)"), at(3, "KC_Q")]},
        {index: 1, name: "Numbers", positions: [at(1, "KC_TRANSPARENT"), at(2, "KC_1"), at(3, "KC_TRANSPARENT")]},
        {index: 2, name: "Pointing", positions: [at(1, "KC_BTN1"), at(2, "KC_TRANSPARENT"), at(3, "KC_TRANSPARENT")]},
    ]);
    const model = {combos: [base, chord], layers: stack};
    const badges = (held, key) => combosShownAt(model, stack, 2, held, key).map((row) => row.badge);
    assert.deepEqual(badges([], 2), [], "on its own, a transparent key shows nothing of the layer below");
    assert.deepEqual(badges([0], 2), ["C4"], "over Base, Base's key fires C4 with Pointing's button");
    assert.deepEqual(badges([0], 1), ["C4"], "and the layer's own key keeps its badge");
    assert.deepEqual(badges([0], 3), [], "a key answered from below that is in no combo here");
    assert.deepEqual(badges([1], 2), [], "with Numbers on, its own key answers, and that key is in no combo");
    assert.deepEqual(combosAt(model, stack, 2, 2), [], "the layer's own marks are unchanged");

    // Any layer on underneath answers the same way, not only Base.
    const numbers = {id: 5, badge: "C5", inputs: ["KC_BTN1", "KC_1"], output: "KC_ESC"};
    const both = {id: 6, badge: "C6", inputs: ["KC_BTN1", "KC_1", "KC_Q"], output: "KC_ENT"};
    const more = {combos: [base, chord, numbers, both], layers: stack};
    const shown = (held, key) => combosShownAt(more, stack, 2, held, key).map((row) => row.badge);
    assert.deepEqual(shown([1], 2), ["C5", "C6"], "with Numbers on, its key answers key 2, and Base, always on, key 3");
    assert.deepEqual(shown([0], 2), ["C4"], "with only Base, Base's key answers instead");
    assert.deepEqual(shown([0, 1], 2), ["C5", "C6"], "with both picked, the same as Numbers alone");
    assert.deepEqual(shown([0, 1], 3), ["C6"], "Base's key through two transparent layers fires C6");
    assert.deepEqual(shown([1], 3), ["C6"], "Base is always on, so it answers key 3 under Numbers too");

    const referenced = {...model, configDefaults: [{id: "comboReferences", fields: [{macro: "comboReference2", value: "Layer 0"}]}]};
    assert.equal(combosInPreview(referenced, stack, 2, [0]), combosInPreview(referenced, stack, 2, []),
        "under Combo Layer Matching the reference layer's keys are matched, never an answer from below");
    assert.equal(combosInPreview(model, stack, 2, [0]), combosInPreview(model, stack, 2, [0]), "one grouping per model and preview");
});

test("combo grouping skips irrelevant holds but keeps layers that block transparent answers", () => {
    let reads = 0;
    const stack = withAnswers(Array.from({length: 16}, (_, index) => ({index, get positions() {
        reads++;
        const key = index === 0 ? "KC_A" : index === 7 ? "KC_B" : index === 13 ? "KC_NO" : "KC_TRANSPARENT";
        return [{layoutIndex: 0, keycode: key}, {layoutIndex: 1, keycode: index === 15 ? "KC_C" : "KC_TRANSPARENT"}];
    }})));
    const combo = {id: 0, inputs: ["KC_B", "KC_C"], output: "MACRO_0"};
    const groups = comboGroups({combos: [combo]}, stack, 15);
    assert.deepEqual(groups.throughKeys[0].held, [stack[7]]);
    assert.deepEqual(groups.throughKeys[0].keys.map(key => key.layer.index), [7, 15]);
    assert.ok(reads < 1000, `combo grouping read layers ${reads} times`);
    assert.equal(combosInView({combos: [combo]}, stack, 15, [7, 13]).length, 0, "a disabled key blocks the lower input");
});

test("a combo marks the input the key itself presses, by the same rule as its badge", () => {
    const placed = {badge: "C1", inputs: ["KC_D", "KC_F"], inputPositions: [27, 28], output: "KC_ESC"};
    assert.deepEqual([0, 1].map((at) => comboInputIsKey(placed, at, {layoutIndex: 28, keycode: "KC_Z"})), [false, true],
        "reported positions win over the keycode");
    const named = {badge: "C2", inputs: ["KC_J", "LT(3,KC_K)"], output: "KC_TAB"};
    assert.deepEqual([0, 1].map((at) => comboInputIsKey(named, at, {layoutIndex: 5, keycode: "LT(3,KC_K)"})), [false, true]);
    assert.equal(comboInputIsKey(named, 0, null), false);
});

test("a combo runs the behaviour of the key it sends only while every switch for it is on", () => {
    const combos = [
        {badge: "C2", output: "KC_LEFT_GUI", outputDisplay: "Left Command", useOutputBehavior: true},
        {badge: "C3", output: "LGUI(KC_N)", outputDisplay: "Command+N", useOutputBehavior: true},
        {badge: "C5", output: "KC_LEFT_GUI", outputDisplay: "Left Command", useOutputBehavior: true},
        {badge: "C14", output: "0x7F04", outputDisplay: "VoiceInk", useOutputBehavior: false},
    ];
    const model = {keyBehaviors: [{keycode: "KC_LEFT_GUI", steps: []}, {keycode: "CUSTOM_KEY_4", steps: []}],
        qmkKeycodeAliases: {"0x7F04": "CUSTOM_KEY_4"}, participation: {behaviorsEnabled: true, comboOutputBehaviors: true}};
    assert.deepEqual(comboBehaviours(model, combos), [{keycode: "KC_LEFT_GUI", output: "KC_LEFT_GUI", shown: "Left Command", badges: ["C2", "C5"]}],
        "a plain shortcut runs nothing, two combos sending one key share it, and a bypassed output runs none");
    assert.deepEqual(comboBehaviours(model, [{...combos[3], useOutputBehavior: true}]).map((row) => row.keycode), ["CUSTOM_KEY_4"], "a custom key is found by its name");
    assert.deepEqual(comboBehaviours({...model, participation: {behaviorsEnabled: true, comboOutputBehaviors: false}}, combos), []);
    assert.deepEqual(comboBehaviours({...model, participation: {behaviorsEnabled: false, comboOutputBehaviors: true}}, combos), []);
    // The behaviour's own switches hold for a combo output too.
    const gui = (/** @type {object} */ row) => ({...model, keyBehaviors: [{keycode: "KC_LEFT_GUI", steps: [], ...row}]});
    assert.deepEqual(comboBehaviours(gui({enabled: false}), combos), [], "a disabled behaviour runs for no combo");
    assert.deepEqual(comboBehaviours(gui({allowedLayers: 0b01}), combos, 1), [], "nor on a layer it is not allowed on");
    assert.equal(comboBehaviours(gui({allowedLayers: 0b10}), combos, 1).length, 1, "but does on one it is");
});
