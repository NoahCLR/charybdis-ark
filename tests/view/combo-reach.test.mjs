import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {comboBehaviours, comboInputIsKey, toggleComboInput} from "../../webview/view/combo-reach.mjs";
import {layerView} from "../../webview/view/layer-view.mjs";
import {comboMessage, saveBehaviour} from "../../webview/view/edits.mjs";

const require = createRequire(import.meta.url);
const {demoDocument, keyAt, profileDocument, publishedModel} = require("../fixtures/published-model");
const {comboReach} = require("../../core/model/combo-reach");
const {SETTING} = require("../../core/schema/settings-domain-v1");
const {ALL_LAYERS, matrixPosition} = require("../../core/data/charybdis-layout");

// The combo views read what core publishes for a profile: these keys, by
// layer and layout index, and these combos; each layer's Combo Layer Matching
// (`references`, layer to the layer it matches), names, and the keys whose
// Join combos (`exclude`) or Use behaviour (`bypass`) is off, by layer, by
// layout index. The layers are the test profile's: Base, Numbers, Symbols …
/**
 * @param {{keys?: Record<number, Record<number, string>>, combos?: Parameters<typeof profileDocument>[0]["combos"], references?: Record<number, number>, names?: Record<number, string>,
 *   exclude?: Record<number, number[]>, bypass?: Record<number, number[]>, settings?: (settings: any) => void}} described
 */
const modelOf = ({keys, combos, references = {}, names = {}, exclude = {}, bypass = {}, settings}) => publishedModel(profileDocument({keys, combos, settings: (domain) => {
    for (const [layer, reference] of Object.entries(references)) domain.layers[Number(layer)].reference = reference;
    for (const [layer, name] of Object.entries(names)) domain.names[Number(layer)] = name;
    for (const [layer, placed] of Object.entries(exclude)) domain.layers[Number(layer)].exclude = placed.map(matrixPosition);
    for (const [layer, placed] of Object.entries(bypass)) domain.layers[Number(layer)].bypass = placed.map(matrixPosition);
    settings?.(domain);
}}));
// A keyboard that reports where each combo's inputs are carries them on the
// combo (inputPositions), and core's reach follows them. Nothing a profile
// holds says where they are, so these tests add them to the published combos
// and work the reach out again by core's rule; the contract test below holds
// this to what core publishes.
/** @param {any} model @param {(number[] | undefined)[]} positions */
const reporting = (model, positions) => {
    const combos = model.combos.map((/** @type {any} */ combo, /** @type {number} */ index) => positions[index] ? {...combo, inputPositions: positions[index]} : combo);
    return {...model, combos, comboReach: comboReach(model.layers, combos, model.comboReferenceLayers)};
};

test("a combo's reported input positions are the one shape these tests add to what core publishes, and core's reach reads them", () => {
    const model = modelOf({keys: {0: {27: "KC_D", 28: "KC_F"}}, combos: [{inputs: ["KC_D", "KC_F"], output: "KC_ESC"}]});
    const [combo] = model.combos;
    for (const field of ["id", "badge", "inputs", "inputDisplays", "output", "outputDisplay", "enabled", "allowedLayers", "outputBehaviorLayers"]) {
        assert.ok(field in combo, `core publishes each combo's ${field}`);
    }
    assert.equal("inputPositions" in combo, false, "a profile says nothing of where a combo's inputs are");
    assert.deepEqual(model.comboReach, comboReach(model.layers, model.combos, model.comboReferenceLayers), "the reach `reporting` works out is core's own");
    assert.equal(model.comboReach[0][0].fires, true);
    assert.equal(reporting(model, [[27]]).comboReach[0][0].fires, false, "and it follows the positions a keyboard reports");
});

test("combos follow the device's own input positions before falling back to keycodes", () => {
    const model = reporting(modelOf({keys: {0: {27: "KC_D", 40: "KC_J", 41: "KC_Z"}},
        combos: [{inputs: ["KC_D", "KC_F"], output: "KC_ESC"}, {inputs: ["KC_J", "KC_K"], output: "KC_TAB"}]}), [[27, 28]]);
    const [placed, named] = model.combos.map((/** @type {any} */ combo) => combo.badge);
    const onKey = (/** @type {number} */ layoutIndex) => layerView(model, 0).combos.onKey(layoutIndex).combos.map((c) => c.badge);
    assert.deepEqual(onKey(27), [placed]);
    assert.deepEqual(onKey(40), [named], "a combo with no reported positions finds its key by keycode, wherever it is");
    assert.deepEqual(onKey(41), []);
});

test("the combo table and the board's badges count the same keys", () => {
    // Real keyboards do not always report per-layer input references, and when
    // they do not, the board matched by keycode while the table looked at the
    // missing field and called every combo unreachable.
    const combos = [{inputs: ["KC_D", "LT(3,KC_F)"], output: "KC_TAB"}];
    const model = modelOf({keys: {0: {27: "KC_D", 28: "LT(3,KC_F)", 29: "KC_G"}}, combos});

    const whole = layerView(model, 0).combos.groups;
    assert.deepEqual(whole.onKeys[0].keys.map((key) => key.position.layoutIndex), [27, 28]);
    assert.deepEqual(layerView(model, 0).combos.onKey(27).combos.map((row) => row.badge), ["C0"],
        "the badge and the count come from one predicate");
    assert.deepEqual(layerView(model, 0).combos.onKey(29).combos, []);

    const half = modelOf({keys: {0: {27: "KC_D"}}, combos});
    const partial = layerView(half, 0).combos.groups;
    assert.deepEqual(partial.onKeys, [], "a partly present combo is not reachable");
    assert.equal(partial.elsewhere[0].keys.length, 1, "and the table still says how much of it is here");

    // A device that does report positions still wins, on those positions.
    const reported = reporting(modelOf({keys: {0: {42: "KC_X", 43: "KC_M"}}, combos: [{inputs: ["KC_N", "KC_M"], output: "KC_ESC"}]}), [[42]]);
    const byPosition = layerView(reported, 0).combos.groups;
    assert.deepEqual(byPosition.elsewhere[0].keys.map((key) => key.position.layoutIndex), [42]);
});

test("combos group by whether this layer produces all of their inputs", () => {
    const model = modelOf({keys: {
        0: {27: "KC_D", 28: "KC_F"},
        1: {27: "KC_TRANSPARENT", 28: "KC_TRANSPARENT"},
        2: {27: "KC_TRANSPARENT", 28: "KC_NO"},
    }, combos: [{inputs: ["KC_D", "KC_F"], output: "KC_TAB"}]});

    assert.equal(layerView(model, 0).combos.groups.onKeys.length, 1, "both inputs are stored here");
    const above = layerView(model, 1).combos.groups;
    assert.equal(above.onKeys.length, 0);
    assert.equal(above.throughKeys.length, 1, "both inputs fall through, so the combo still fires");
    const blocked = layerView(model, 2).combos.groups;
    assert.equal(blocked.throughKeys.length, 0);
    assert.equal(blocked.elsewhere[0].keys.length, 1, "KC_NO takes one input away, so it cannot fire");
});

test("view combos follow the keyboard's reference layer", () => {
    const model = modelOf({keys: {0: {0: "KC_A", 1: "KC_B"}, 1: {0: "KC_C", 1: "KC_D"}}, combos: [{inputs: ["KC_A", "KC_B"], output: "KC_TAB"}], references: {1: 0}});
    const inView = layerView(model, 1).combos.inView;
    assert.deepEqual(inView.map((entry) => entry.combo.id), [model.combos[0].id]);
    assert.ok(inView[0].keys.every((key) => key.reference && key.layer.displayName === "Base"));
});

test("a combo fires only if one activation carries every input at once", () => {
    const combos = [{inputs: ["KC_D", "KC_F"], output: "KC_TAB"}];
    // KC_D answers only with Numbers held; KC_F only without it. Each input is
    // reachable, the pair never is — which a per-key union would miss.
    const split = {0: {27: "KC_X", 28: "KC_F"}, 1: {27: "KC_D", 28: "KC_NO"}, 2: {27: "KC_TRANSPARENT", 28: "KC_TRANSPARENT"}};
    const neverModel = modelOf({keys: split, combos});
    const never = layerView(neverModel, 2).combos.groups;
    assert.deepEqual(never.onKeys, []);
    assert.deepEqual(never.throughKeys, [], "no single hold carries both inputs");
    assert.equal(never.elsewhere.length, 1);
    assert.equal(never.elsewhere[0].keys.length, 1, "and the row says how far any one hold gets");

    // Move KC_F onto Numbers and one hold carries both.
    const firesModel = modelOf({keys: {...split, 1: {27: "KC_D", 28: "KC_F"}}, combos});
    const fires = layerView(firesModel, 2).combos.groups;
    assert.deepEqual(fires.elsewhere, []);
    assert.equal(fires.throughKeys.length, 1);
    assert.deepEqual(fires.throughKeys[0].held.map((layer) => layer.displayName), ["Numbers"],
        "and it names the layer you have to hold as well");
});

test("the combo builder picks the key that answers, and rings its inputs by name on every layer", () => {
    const model = modelOf({keys: {
        0: {0: "KC_A", 1: "KC_B", 2: "KC_C", 3: "KC_D"},
        1: {0: "KC_TRANSPARENT", 1: "QK_MOUSE_BUTTON_1", 2: "KC_COMMA", 3: "KC_TRANSPARENT"},
        2: {0: "KC_TRANSPARENT", 1: "KC_TRANSPARENT", 2: "KC_X", 3: "KC_NO"},
    }});
    // A transparent key picks what shows through it: the default layer on its
    // own, the highest layer previewed on that is not transparent otherwise.
    assert.equal(layerView(model, 1).combos.answers.get(0).keycode, "KC_A");
    assert.equal(layerView(model, 2).combos.answers.get(1).keycode, "KC_B", "a layer not previewed on neither answers nor blocks");
    assert.equal(layerView(model, 2, [1]).combos.answers.get(1).keycode, "QK_MOUSE_BUTTON_1");
    assert.deepEqual(toggleComboInput(model, [], layerView(model, 2).combos.answers.get(0)), ["KC_A"], "never the raw transparent keycode");

    // Picked on one layer, an input stays that key after the board moves on:
    // Numbers' comma sits where Base has C, and the builder keeps the comma.
    let inputs = toggleComboInput(model, [], layerView(model, 1).combos.answers.get(1));
    inputs = toggleComboInput(model, inputs, layerView(model, 0).combos.answers.get(3));
    assert.deepEqual(inputs, ["QK_MOUSE_BUTTON_1", "KC_D"]);
    assert.deepEqual(layerView(model, 0).combos.inputKeys(["KC_COMMA", "KC_A"]), [0],
        "Base rings its own A, not the position Numbers holds the comma at");
    assert.deepEqual(layerView(model, 1).combos.inputKeys(["KC_COMMA", "KC_A"]), [0, 2]);
    assert.equal(layerView(model, 0).combos.inputShown("KC_COMMA"), false, "an input no key here presses is kept, not rung");
    assert.equal(layerView(model, 1).combos.inputShown("KC_COMMA"), true);

    assert.deepEqual(toggleComboInput(model, ["KC_A"], layerView(model, 2).combos.answers.get(3)), ["KC_A"], "a disabled key is not an input");

    // At the keyboard's combo input limit no key joins, but one can still leave.
    assert.deepEqual(toggleComboInput(model, ["KC_A", "KC_B"], layerView(model, 0).combos.answers.get(2), 2), ["KC_A", "KC_B"], "a full combo takes no more");
    assert.deepEqual(toggleComboInput(model, ["KC_A", "KC_B"], layerView(model, 0).combos.answers.get(1), 2), ["KC_A"]);
    assert.deepEqual(toggleComboInput(model, ["KC_A"], layerView(model, 0).combos.answers.get(2), 2), ["KC_A", "KC_C"]);
});

test("the selected key lists the combos it is an input of, as the layers in view answer it", () => {
    const combos = [
        {inputs: ["KC_A", "KC_B"], output: "KC_TAB"},
        {inputs: ["KC_COMMA", "KC_A"], output: "KC_TAB"},
        {inputs: ["KC_C", "KC_B"], output: "KC_TAB"},
    ];
    const model = modelOf({keys: {
        0: {0: "KC_A", 1: "KC_B", 2: "KC_C"},
        1: {0: "KC_TRANSPARENT", 1: "KC_COMMA", 2: "KC_TRANSPARENT"},
        2: {0: "KC_TRANSPARENT", 1: "KC_TRANSPARENT", 2: "KC_TRANSPARENT"},
    }, combos});
    const ids = (answer) => answer.combos.map((combo) => combo.id);
    assert.deepEqual(ids(layerView(model, 0).combos.onKey(0)), [0, 1]);
    assert.deepEqual(ids(layerView(model, 1).combos.onKey(1)), [1], "the layer's own key");
    const alone = layerView(model, 2).combos.onKey(1);
    assert.equal(alone.position, null, "shown alone, a layer's transparent key shows nothing through: base is not on in that view");
    assert.deepEqual(ids(alone), []);
    assert.deepEqual(ids(layerView(model, 2, [0]).combos.onKey(1)), [0, 2], "with base previewed on, the default layer's key");
    const previewed = layerView(model, 2, [1]).combos.onKey(1);
    assert.equal(previewed.position.keycode, "KC_COMMA");
    assert.deepEqual(ids(previewed), [1], "with a layer previewed on, the highest one that is not transparent");
    const empty = modelOf({keys: {0: {0: "KC_TRANSPARENT"}}, combos});
    const nothing = layerView(empty, 0).combos.onKey(0);
    assert.equal(nothing.position, null);
    assert.deepEqual(nothing.combos, [], "a key nothing answers takes part in nothing");
});

test("builder inputs keep the combo's stored order; a removed one picked again comes last", () => {
    // QMK's "keys in order" is the stored order, so an edit must not rearrange it.
    const model = modelOf({keys: {0: {1: "KC_W", 3: "KC_E", 5: "PD_MODE_1"}}});
    assert.deepEqual(toggleComboInput(model, ["KC_W", "KC_Q"], keyAt(model, 0, 3)), ["KC_W", "KC_Q", "KC_E"], "an added input comes last");
    assert.deepEqual(toggleComboInput(model, ["KC_W", "KC_Q"], keyAt(model, 0, 1)), ["KC_Q"], "clicking an input's key takes it out");
    assert.deepEqual(toggleComboInput(model, ["KC_Q"], keyAt(model, 0, 1)), ["KC_Q", "KC_W"], "a removed input picked again counts as added");
    const semantic = keyAt(model, 0, 5);
    assert.notEqual(semantic.keycode, semantic.semantic, "a pointing-mode key stores a bare user keycode");
    assert.deepEqual(toggleComboInput(model, ["PD_MODE_1"], semantic), [], "an input stored by its meaning matches its key");
});

test("an input placed on two keys rings both, and still counts as one input", () => {
    const combos = [{inputs: ["G(KC_C)", "G(KC_V)"], output: "G(KC_A)"}];
    const model = modelOf({keys: {0: {3: "G(KC_C)", 4: "G(KC_V)", 19: "G(KC_C)", 21: "G(KC_V)", 20: "KC_UP"}}, combos});
    const [combo] = model.combos;
    const groups = layerView(model, 0).combos.groups;
    assert.equal(groups.onKeys.length, 1);
    assert.deepEqual(groups.onKeys[0].keys.map((key) => key.position.layoutIndex), [3, 4, 19, 21],
        "every key carrying an input is where the combo can be pressed");
    assert.equal(groups.onKeys[0].covered, 2);

    const half = modelOf({keys: {0: {3: "G(KC_C)", 19: "G(KC_C)"}}, combos});
    const partial = layerView(half, 0).combos.groups;
    assert.deepEqual(partial.onKeys, [], "two copies of one input do not complete a two-input combo");
    assert.equal(partial.elsewhere[0].covered, 1);

    assert.deepEqual(layerView(model, 0).combos.inputKeys(combo.inputs), [3, 4, 19, 21], "the builder rings both");
    assert.deepEqual(toggleComboInput(model, combo.inputs, keyAt(model, 0, 19)), ["LGUI(KC_V)"],
        "and either key is the one input, so picking cannot duplicate it");
});

test("combos follow the keyboard's combo layer matching", () => {
    const described = {keys: {0: {13: "KC_Q", 14: "KC_W"}, 1: {13: "KC_1", 14: "KC_2"}}, combos: [{inputs: ["KC_Q", "KC_W"], output: "KC_ESC"}]};
    const model = modelOf(described);
    const own = layerView(model, 1).combos.groups;
    assert.equal(own.elsewhere.length, 1, "matched on its own keys, Numbers cannot fire a Q+W combo");

    // "Combos on Numbers → Base": the keyboard matches Base's keycodes while Numbers is on top.
    const settings = modelOf({...described, references: {1: 0}});
    const referenced = layerView(settings, 1).combos.groups;
    assert.equal(referenced.onKeys.length, 1);
    assert.deepEqual(referenced.onKeys[0].keys.map((key) => key.position.layoutIndex), [13, 14]);
    assert.ok(referenced.onKeys[0].keys.every((key) => key.reference && key.layer.displayName === "Base"));
    // The view matches the reference layer core publishes for each layer
    // (comboReferenceLayers), and each layer itself without one.
    assert.equal(settings.comboReferenceLayers[1], 0, "as core publishes it");
    assert.ok(layerView(settings, 1).combos.inView[0].keys.every((key) => key.reference && key.layer.displayName === "Base"));
    assert.deepEqual(layerView(model, 1).combos.inView, [], "and each layer matches itself unless set to another");
    const unpublished = {...settings, comboReferenceLayers: undefined};
    assert.deepEqual(layerView(unpublished, 1).combos.inView, [], "and without it");
    assert.equal(layerView(unpublished, 1).combos.answers.get(13)?.keycode, "KC_1");

    assert.deepEqual(layerView(settings, 1).combos.inputKeys(settings.combos[0].inputs), [13, 14], "the builder rings the keys the keyboard matches");
    assert.equal(layerView(settings, 1).combos.answers.get(13).keycode, "KC_Q", "and picks the keycode it matches, not Numbers' own");
});

test("a key carries the badges of combos its own keycode fires on this layer, like behaviour dots", () => {
    const described = {keys: {
        0: {1: "KC_D", 2: "KC_F"},
        1: {1: "KC_TRANSPARENT", 2: "KC_TRANSPARENT"},
        2: {1: "KC_D", 2: "KC_NO"},
    }, combos: [{inputs: ["KC_D", "KC_F"], output: "KC_TAB"}]};
    const model = modelOf(described);
    const badges = (layer, key) => layerView(model, layer).combos.shownAt(key).map((row) => row.badge);
    assert.deepEqual(badges(0, 1), ["C0"]);
    assert.deepEqual(badges(1, 1), [], "a transparent key shows nothing of the layer below, as behaviours do");
    assert.equal(layerView(model, 1).combos.groups.throughKeys.length, 1, "the Combos tab still lists it as reached through");
    assert.deepEqual(badges(2, 1), [], "KC_D is here, but KC_F is not, so C0 never fires and marks nothing");

    const referenced = modelOf({...described, references: {2: 0}});
    assert.deepEqual(layerView(referenced, 2).combos.shownAt(2).map((row) => row.badge), ["C0"],
        "under Combo Layer Matching the keys Base supplies are marked");
    assert.equal(layerView(model, 0).combos.shownAt(1), layerView(model, 0).combos.shownAt(1), "one grouping per model and layer");
});

test("in a layer preview, a key answered from below wears the badges of combos it fires there", () => {
    // Base's layer-tap key stays transparent on Pointing, and C1 chords it with
    // Pointing's own mouse buttons: with Base on, the board shows that key and its badge.
    const keys = {
        0: {1: "KC_D", 2: "LT(3,KC_SLASH)", 3: "KC_Q"},
        1: {1: "KC_TRANSPARENT", 2: "KC_1", 3: "KC_TRANSPARENT"},
        2: {1: "QK_MOUSE_BUTTON_1", 2: "KC_TRANSPARENT", 3: "KC_TRANSPARENT"},
    };
    const base = {inputs: ["KC_D", "LT(3,KC_SLASH)"], output: "KC_TAB"};
    const chord = {inputs: ["QK_MOUSE_BUTTON_1", "LT(3,KC_SLASH)"], output: "LGUI(KC_N)"};
    const names = {2: "Pointing"};
    const model = modelOf({keys, names, combos: [base, chord]});
    const badges = (held, key) => layerView(model, 2, held).combos.shownAt(key).map((row) => row.badge);
    assert.deepEqual(badges([], 2), [], "on its own, a transparent key shows nothing of the layer below");
    assert.deepEqual(badges([0], 2), ["C1"], "over Base, Base's key fires C1 with Pointing's button");
    assert.deepEqual(badges([0], 1), ["C1"], "and the layer's own key keeps its badge");
    assert.deepEqual(badges([0], 3), [], "a key answered from below that is in no combo here");
    assert.deepEqual(badges([1], 2), [], "with Numbers on, its own key answers, and that key is in no combo");
    assert.deepEqual(layerView(model, 2).combos.shownAt(2), [], "the layer's own marks are unchanged");

    // Any layer on underneath answers the same way, not only Base.
    const numbers = {inputs: ["QK_MOUSE_BUTTON_1", "KC_1"], output: "KC_ESC"};
    const both = {inputs: ["QK_MOUSE_BUTTON_1", "KC_1", "KC_Q"], output: "KC_ENT"};
    const more = modelOf({keys, names, combos: [base, chord, numbers, both]});
    const shown = (held, key) => layerView(more, 2, held).combos.shownAt(key).map((row) => row.badge);
    assert.deepEqual(shown([1], 2), ["C2", "C3"], "with Numbers on, its key answers key 2, and Base, always on, key 3");
    assert.deepEqual(shown([0], 2), ["C1"], "with only Base, Base's key answers instead");
    assert.deepEqual(shown([0, 1], 2), ["C2", "C3"], "with both picked, the same as Numbers alone");
    assert.deepEqual(shown([0, 1], 3), ["C3"], "Base's key through two transparent layers fires C3");
    assert.deepEqual(shown([1], 3), ["C3"], "Base is always on, so it answers key 3 under Numbers too");

    const referenced = modelOf({keys, names, combos: [base, chord], references: {2: 0}});
    assert.equal(layerView(referenced, 2, [0]).combos.marks.keys, layerView(referenced, 2).combos.marks.keys,
        "under Combo Layer Matching the reference layer's keys are matched, never an answer from below");
    assert.equal(layerView(model, 2, [0]).combos.marks.keys, layerView(model, 2, [0]).combos.marks.keys, "one grouping per model and preview");
});

test("a key wears a combo's badge only where every switch lets the combo fire", () => {
    const keys = {0: {1: "KC_D", 2: "KC_F"}, 1: {1: "KC_TRANSPARENT", 2: "KC_TRANSPARENT"}};
    const combos = [{inputs: ["KC_D", "KC_F"], output: "KC_TAB"}];
    const model = modelOf({keys, combos});
    const [combo] = model.combos;
    const badges = (m, layer, held, key) => layerView(m, layer, held).combos.badgesAt(key).map((row) => row.badge);
    assert.deepEqual(badges(model, 0, [], 1), ["C0"], "every switch on, the badge shows");
    assert.deepEqual(layerView(model, 0).combos.useAt(1, combo), {fires: true, reasons: []});

    const excluded = modelOf({keys, combos, exclude: {0: [2]}});
    const [excludedCombo] = excluded.combos;
    assert.deepEqual(badges(excluded, 0, [], 2), [], "the excluded key wears no badge");
    assert.deepEqual(layerView(excluded, 0).combos.useAt(2, excludedCombo).reasons, ["Join combos is off for this key on this layer (Base)"]);
    assert.deepEqual(badges(excluded, 0, [], 1), [], "nor does its partner, since the chord cannot form");
    assert.deepEqual(layerView(excluded, 0).combos.useAt(1, excludedCombo).reasons, ["its other key F on Base cannot join it, so it never forms"]);
    assert.deepEqual(layerView(excluded, 0).combos.shownAt(1).map((row) => row.badge), ["C0"], "the key still takes part in it, switched off");
    assert.deepEqual(badges(excluded, 1, [0], 1), [], "a key seen through a preview is judged on the layer that supplies it");

    // Under Combo Layer Matching, Numbers matches Base's keycodes, but the
    // layer that supplies each key still decides whether it may join.
    const matched = modelOf({keys: {0: {1: "KC_D", 2: "KC_F"}, 1: {1: "KC_1", 2: "KC_2"}, 2: {1: "KC_TRANSPARENT", 2: "KC_TRANSPARENT"}}, combos,
        names: {1: "Symbols", 2: "Numbers"}, exclude: {1: [1]}, references: {2: 0}});
    const matchedBadges = (held, key) => layerView(matched, 2, held).combos.badgesAt(key).map((row) => row.badge);
    assert.deepEqual(matchedBadges([], 1), ["C0"], "Base supplies both keys, and Base lets them join");
    assert.deepEqual(matchedBadges([1], 1), [], "with Symbols held under Numbers, Symbols supplies the key, and excludes it");
    assert.deepEqual(layerView(matched, 2, [1]).combos.useAt(1, matched.combos[0]).reasons, ["Join combos is off for this key on this layer (Symbols)"]);

    // An input on two keys needs only one of them: a key that cannot join
    // but whose input another key covers is not why the chord fails.
    const doubled = {0: {1: "KC_D", 2: "KC_F", 3: "KC_D"}};
    const both = modelOf({keys: doubled, combos, exclude: {0: [1, 2]}});
    assert.deepEqual(layerView(both, 0).combos.useAt(3, both.combos[0]).reasons, ["its other key F on Base cannot join it, so it never forms"]);
    const fine = modelOf({keys: doubled, combos, exclude: {0: [1]}});
    assert.deepEqual(layerView(fine, 0).combos.badgesAt(3).map((row) => row.badge), ["C0"], "the other KC_D still covers its input");

    const disabled = modelOf({keys, combos: [{...combos[0], enabled: false}]});
    assert.deepEqual(badges(disabled, 0, [], 1), []);
    assert.deepEqual(layerView(disabled, 0).combos.useAt(1, disabled.combos[0]).reasons, ["Use this combo is off"]);
    const layerOff = modelOf({keys, combos, settings: (settings) => {settings.values[SETTING.LAYER_COMBOS] = ALL_LAYERS ^ 1;}});
    assert.deepEqual(badges(layerOff, 0, [], 1), []);
    const notHere = modelOf({keys, combos: [{...combos[0], allowedLayers: 2}]});
    assert.deepEqual(badges(notHere, 0, [], 1), [], "a combo kept off this layer marks nothing on it");
    const masterOff = modelOf({keys, combos, settings: (settings) => {settings.values[SETTING.COMBOS_ENABLED] = 0;}});
    assert.deepEqual(badges(masterOff, 0, [], 1), []);
    const bypassed = modelOf({keys, combos, bypass: {0: [1, 2]}});
    assert.deepEqual(badges(bypassed, 0, [], 1), ["C0"], "a behaviour bypass leaves combos alone");
});

test("combo grouping skips irrelevant holds but keeps layers that block transparent answers", () => {
    /** @type {Record<number, Record<number, string>>} */
    const keys = {};
    for (let index = 0; index < 16; index++) {
        keys[index] = {0: index === 0 ? "KC_A" : index === 7 ? "KC_B" : index === 13 ? "KC_NO" : "KC_TRANSPARENT", 1: index === 15 ? "KC_C" : "KC_TRANSPARENT"};
    }
    const model = modelOf({keys, combos: [{inputs: ["KC_B", "KC_C"], output: "MACRO_0"}]});
    let reads = 0;
    const stack = model.layers.map((/** @type {any} */ layer) => ({...layer, get positions() {
        reads++;
        return layer.positions;
    }}));
    const counted = {...model, layers: stack};
    const groups = layerView(counted, 15).combos.groups;
    assert.deepEqual(groups.throughKeys[0].held, [stack[7]]);
    assert.deepEqual(groups.throughKeys[0].keys.map(key => key.layer.index), [7, 15]);
    assert.ok(reads < 1000, `combo grouping read layers ${reads} times`);
    assert.equal(layerView(counted, 15, [7, 13]).combos.inView.length, 0, "a disabled key blocks the lower input");
});

test("a combo marks the input the key itself presses, by the same rule as its badge", () => {
    const model = modelOf({keys: {0: {5: "LT(3,KC_K)"}}, combos: [{inputs: ["KC_D", "KC_F"], output: "KC_ESC"}, {inputs: ["KC_J", "LT(3,KC_K)"], output: "KC_TAB"}]});
    const [placed, named] = reporting(model, [[27, 28]]).combos;
    assert.deepEqual([0, 1].map((at) => comboInputIsKey(placed, at, {layoutIndex: 28, keycode: "KC_Z"})), [false, true],
        "reported positions win over the keycode");
    assert.deepEqual([0, 1].map((at) => comboInputIsKey(named, at, keyAt(model, 0, 5))), [false, true]);
    assert.equal(comboInputIsKey(named, 0, null), false);
});

test("a combo runs the behaviour of the key it sends on the layers core publishes for it", () => {
    // Core publishes no layers for a key with no behaviour or a bypassed
    // output (tests/model/participation.test.js says when). The demo's C2 and
    // C5 send Left Command, which has a behaviour; C3 sends Command+N, which
    // has none; C14 a custom key with none; C1 the custom key Click Spam, which has one.
    const demo = publishedModel(demoDocument());
    const badged = (/** @type {any} */ model, /** @type {string[]} */ badges) => badges.map((badge) => model.combos.find((/** @type {any} */ combo) => combo.badge === badge));
    assert.deepEqual(comboBehaviours(demo, badged(demo, ["C2", "C3", "C5", "C14"])), [{keycode: "KC_LEFT_GUI", output: "KC_LEFT_GUI", shown: "Left Command", badges: ["C2", "C5"]}],
        "a plain shortcut runs nothing, two combos sending one key share it, and a key with no behaviour runs none");
    assert.deepEqual(comboBehaviours(demo, badged(demo, ["C1"])).map((row) => row.keycode), ["CUSTOM_KEY_2"], "a custom key is found by its name");

    const [spam] = badged(demo, ["C1"]);
    const bypassed = publishedModel(demoDocument(), {edits: [comboMessage(spam.id, {...spam, useOutputBehavior: false})]});
    assert.deepEqual(comboBehaviours(bypassed, badged(bypassed, ["C1"])), [], "a bypassed output runs none");

    const command = demo.keyBehaviors.find((/** @type {any} */ row) => row.keycode === "KC_LEFT_GUI");
    const onLayers = (/** @type {number} */ allowedLayers) => publishedModel(demoDocument(), {edits: [/** @type {object} */ (saveBehaviour(command, {allowedLayers}))]});
    const baseOnly = onLayers(0b01), numbersOnly = onLayers(0b10);
    assert.deepEqual(comboBehaviours(baseOnly, badged(baseOnly, ["C2"]), 1), [], "nor on a layer it does not run on");
    assert.equal(comboBehaviours(numbersOnly, badged(numbersOnly, ["C2"]), 1).length, 1, "but does on one it does");
});
