import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {isOff} from "../../webview/lib/colour.mjs";
import {baseColour, feedbackColours, inheritsStageColour, keyLed, layerPaints, keyLight, mappedKeyCount, offWording, ownLight, pdColourRow, replacementPaints, replacementTrigger, stageEnabled, stageHeldOffBy, stageIdle, stageInEffect, trackballLed, trackballLight} from "../../webview/view/lighting.mjs";

const colour = (h, s, v) => ({h: String(h), s: String(s), v: String(v)});
const position = (layoutIndex, keycode) => ({layoutIndex, keycode});

test("mapped-key count follows the selected layer, excluding transparent and disabled keys", () => {
    const layer = {positions: [position(0, "KC_A"), position(1, "KC_B"), position(2, "KC_TRANSPARENT"),
        position(3, "KC_TRNS"), position(4, "_______"), position(5, "KC_NO"), position(6, "XXXXXXX"), position(7, "")]};
    assert.equal(mappedKeyCount(model(), layer), 2);
    assert.equal(mappedKeyCount(model(), {positions: [position(0, "KC_TRANSPARENT")]}), 0);
    assert.equal(mappedKeyCount(model(), null), 0);
});

// The LED map as core publishes it (model.leds), and which keys are
// transparent or disabled (qmkKeyKinds).
const {KEY_LEDS, TRACKBALL_LED} = createRequire(import.meta.url)("../../core/data/charybdis-layout");
const {profileDocument, publishedModel} = createRequire(import.meta.url)("../fixtures/published-model.js");
// The vocabulary too, which names the owner that is every layer's or mode's.
const {qmkKeyKinds, vocabulary} = publishedModel();
const {SETTING} = createRequire(import.meta.url)("../../core/schema/settings-domain-v1");
function model(overrides = {}) {
    return {
        leds: {keys: [...KEY_LEDS], trackball: TRACKBALL_LED},
        qmkKeyKinds, vocabulary,
        rgb: {
            baseEffect: {state: "read", enabled: true, effectId: 1, previewColor: colour(140, 210, 180)},
            stages: [
                {id: "layers", label: "Layer colours", enabled: true},
                {id: "auto", label: "Auto-mouse fade", enabled: true},
                {id: "pd", label: "Pointing modes", enabled: true},
                {id: "combo", label: "Combo feedback", enabled: false},
                {id: "key", label: "Behaviour feedback", enabled: true},
            ],
            layerColors: [
                {layer: "Layer 0", layerId: 0, color: colour(0, 0, 0), mode: "ALL_KEYS"},
                {layer: "Layer 3", layerId: 3, color: colour(180, 255, 200), mode: "KEYS_MAPPED_ON_THIS_LAYER_ONLY"},
                {layer: "Layer 4", layerId: 4, color: colour(0, 0, 158), mode: "ALL_KEYS"},
            ],
            pdModeColors: [{pointingMode: "POINTING_MODE_DRAGSCROLL", color: colour(21, 255, 200), locality: "RGB_RIGHT_HALF"}],
            comboFeedback: {color: colour(0, 0, 0), locality: "RGB_KEYS_ONLY"},
            keyBehaviorFeedback: {
                tapCommittedColor: colour(0, 0, 158), holdActiveColor: colour(18, 255, 200),
                longHoldActiveColor: colour(148, 255, 200), tapBranchColors: [colour(169, 255, 200)],
            },
            ...overrides.rgb,
        },
        ...overrides,
    };
}

test("stages report what the device said, and the base effect is its own read", () => {
    const m = model();
    assert.equal(stageEnabled(m, "layers"), true);
    assert.equal(stageEnabled(m, "combo"), false);
    assert.equal(stageEnabled(m, "base"), true);
    assert.deepEqual(baseColour(m), colour(140, 210, 180));
    const unread = model({rgb: {baseEffect: {state: "unread"}}});
    assert.equal(baseColour(unread), null, "an unread base effect has no colour to draw");
    const animated = model({rgb: {baseEffect: {state: "read", enabled: true, effectId: 3}}});
    assert.equal(baseColour(animated), null, "an animated effect has no single colour");
});

test("combo and behaviour feedback are in effect only while what they light can run", () => {
    const switched = (/** @type {{behaviors?: string[], combos?: string[]}} */ reasons) => {
        const m = model();
        m.rgb.stages = m.rgb.stages.map((row) => ({...row, enabled: true}));
        return {...m, participation: {layers: [{behaviors: [], combos: [], bypass: [], exclude: [], ...reasons}]}};
    };
    const combosOff = switched({combos: ["master"]});
    assert.match(stageIdle(combosOff, "combo"), /combos are off/i);
    assert.equal(stageInEffect(combosOff, "combo"), false);
    assert.equal(stageEnabled(combosOff, "combo"), true, "the stored switch is left as it is");
    assert.equal(stageInEffect(combosOff, "key"), true, "behaviour feedback does not depend on combos");
    const behavioursOff = switched({behaviors: ["master"]});
    assert.match(stageIdle(behavioursOff, "key"), /behaviours are off/i);
    assert.equal(stageInEffect(behavioursOff, "combo"), true, "combo feedback does not depend on behaviours");
    assert.equal(stageIdle(switched({combos: ["layer"], behaviors: ["layer"]}), "combo"), null, "one layer's switch leaves the stage for the others");
    assert.equal(stageIdle(model(), "combo"), null, "without settings readback nothing is claimed");
    const stageOff = switched({combos: ["master"]});
    stageOff.rgb.stages = stageOff.rgb.stages.map((row) => row.id === "combo" ? {...row, enabled: false} : row);
    assert.equal(stageIdle(stageOff, "combo"), null, "a stage switched off is off, not idle");
    assert.equal(stageHeldOffBy(combosOff, "combo"), "combo");
    assert.equal(stageHeldOffBy(behavioursOff, "key"), "behaviour");
    assert.equal(stageHeldOffBy(combosOff, "layers"), null, "no global switch stops this stage");
});

// The fade runs only while auto-mouse moves the layer, so with auto-mouse off
// in the draft the stage paints nothing, whatever its stored switch says.
test("the auto-mouse fade is in effect only while auto-mouse is on", () => {
    const withAutoMouse = (enabled) => ({...model(), configDefaults: [
        {id: "autoMouse", area: "Pointer", fields: [{macro: "autoMouse", kind: "toggle", value: enabled ? "1" : "0", enabled}]}]});
    assert.equal(stageInEffect(withAutoMouse(true), "auto"), true);
    assert.equal(stageIdle(withAutoMouse(true), "auto"), null);
    const off = withAutoMouse(false);
    assert.equal(stageEnabled(off, "auto"), true, "the stored switch is left as it is");
    assert.equal(stageInEffect(off, "auto"), false);
    assert.match(stageIdle(off, "auto"), /auto-mouse is off/i);
    assert.equal(stageInEffect(off, "layers"), true, "other stages do not depend on auto-mouse");
    const stored = model();
    stored.rgb.stages = stored.rgb.stages.map((row) => row.id === "auto" ? {...row, enabled: false} : row);
    assert.equal(stageIdle({...stored, configDefaults: off.configDefaults}, "auto"), null, "a stage switched off is off, not idle");
    assert.equal(stageInEffect(model(), "auto"), true, "without settings readback nothing is claimed");
});

// A replacement flashes only while the keyboard replaces, so with Text
// replacement off in the draft the stage paints nothing, whatever its stored
// switch says.
test("replacement feedback is in effect only while Text replacement is on", () => {
    const withSwitch = (enabled) => {
        const m = model();
        m.rgb.stages = [...m.rgb.stages, {id: "autocorrect", label: "Replacement feedback", bit: 32, enabled: true}];
        return {...m, configDefaults: [{id: "autocorrect", area: "Settings", fields: [{macro: "autocorrect", kind: "toggle", value: enabled ? "1" : "0", enabled}]}]};
    };
    assert.equal(stageInEffect(withSwitch(true), "autocorrect"), true);
    assert.equal(stageIdle(withSwitch(true), "autocorrect"), null);
    const off = withSwitch(false);
    assert.equal(stageEnabled(off, "autocorrect"), true, "the stored switch is left as it is");
    assert.equal(stageInEffect(off, "autocorrect"), false);
    assert.equal(stageHeldOffBy(off, "autocorrect"), "autocorrect");
    assert.equal(stageIdle(off, "autocorrect"), "Text replacement is off. This stage paints nothing.");
    assert.equal(stageInEffect(off, "key"), true, "behaviour feedback does not depend on text replacement");
    const stored = {...off, rgb: {...off.rgb, stages: off.rgb.stages.map((row) => row.id === "autocorrect" ? {...row, enabled: false} : row)}};
    assert.equal(stageIdle(stored, "autocorrect"), null, "a stage switched off is off, not idle");
    const unread = withSwitch(true); delete unread.configDefaults;
    assert.equal(stageInEffect(unread, "autocorrect"), true, "without settings readback nothing is claimed");
});

// QMK skips the hooks every stage paints from while its matrix is off, so
// with All lighting off no stage is in effect, whatever its own switch says.
test("with All lighting off, no stage is in effect", async () => {
    const {lightingOff} = await import("../../webview/view/lighting.mjs");
    const dark = model({rgb: {...model().rgb, baseEffect: {state: "read", enabled: false, effectId: 0}}});
    assert.equal(lightingOff(dark), true);
    assert.equal(stageEnabled(dark, "layers"), true, "the stored stage switch is left as it is");
    for (const id of ["base", "layers", "key"]) assert.equal(stageInEffect(dark, id), false, id);
    assert.equal(lightingOff(model()), false);
    assert.equal(lightingOff(model({rgb: {...model().rgb, baseEffect: {state: "unread"}}})), false, "an unread effect claims nothing");
});

test("a mapped-keys-only layer paints its own keys and leaves the rest on the base", () => {
    const m = model();
    const layer = {index: 3};
    const mapped = keyLight(m, layer, position(13, "KC_UP"));
    assert.deepEqual(mapped.colour, colour(180, 255, 200));
    assert.equal(mapped.source, "layer");
    const through = keyLight(m, layer, position(14, "KC_TRANSPARENT"));
    assert.deepEqual(through.colour, colour(140, 210, 180), "a transparent key shows the base effect");
    assert.equal(through.source, "base");
});

test("layers previewed on paint in the same ascending pass, under the viewed layer", () => {
    const m = model();
    m.rgb.layerColors = [...m.rgb.layerColors, {layer: "Layer 1", layerId: 1, color: colour(85, 255, 200), mode: "ALL_KEYS"}];
    const layer = {index: 3};
    assert.equal(keyLight(m, layer, position(14, "KC_TRANSPARENT")).source, "base", "alone, layer 3 leaves an unmapped key on the base");
    assert.deepEqual(keyLight(m, layer, position(14, "KC_TRANSPARENT"), {held: [1]}).colour, colour(85, 255, 200),
        "with layer 1 on, its all-keys wash shows under layer 3's unmapped key");
    assert.deepEqual(keyLight(m, layer, position(13, "KC_UP"), {held: [1]}).colour, colour(180, 255, 200),
        "layer 3 still paints its own keys over layer 1");
    assert.deepEqual(trackballLight(m, layer, {held: [1]}).colour, colour(85, 255, 200), "an all-keys wash reaches the trackball LED");
});

test("the trackball LED says which layer painted it, so the board can tell its own from what shows through", () => {
    const m = model();
    assert.deepEqual(trackballLight(m, {index: 4}), {colour: colour(0, 0, 158), source: "layer", layer: 4},
        "an all-keys layer paints the trackball itself");
    assert.deepEqual(trackballLight(m, {index: 3}), {colour: colour(140, 210, 180), source: "base", layer: null},
        "a mapped-keys-only layer never reaches it, so the base effect shows");
    assert.equal(trackballLight(m, {index: 3}, {held: [4]}).layer, 4, "a lower layer on in a preview paints it from underneath");
    const grouped = model({rgb: {...model().rgb, layerAccents: [{owner: "Layer 3", ownerLayer: 3, ledIndices: [56], color: colour(0, 0, 0)}]}});
    const light = trackballLight(grouped, {index: 3});
    assert.equal(light.source, "layer");
    assert.equal(light.layer, 3, "a layer's LED group containing LED 56 paints it as that layer");
});

test("the trackball's light is the viewed layer's own unless it is seen through from beneath", () => {
    const m = model();
    assert.equal(ownLight(trackballLight(m, {index: 0}), 0), true, "on base the base effect is base's own floor, not something below");
    assert.equal(ownLight(trackballLight(m, {index: 4}), 4), true, "an all-keys layer paints it itself");
    assert.equal(ownLight(trackballLight(m, {index: 3}), 3), false, "above base, the base effect is seen through a mapped-keys-only layer");
    assert.equal(ownLight(trackballLight(m, {index: 3}, {held: [4]}), 3), false, "a lower layer's paint is seen through too");
    assert.equal(ownLight({source: "pointing", layer: null}, 3), true, "a previewed pointing mode is what is being shown");
    assert.equal(ownLight({source: "replacement", layer: null}, 3), true, "and so is a previewed replacement flash, which paints over every layer");
});

test("an all-keys layer paints transparent positions too", () => {
    const light = keyLight(model(), {index: 4}, position(14, "KC_TRANSPARENT"));
    assert.deepEqual(light.colour, colour(0, 0, 158));
    assert.equal(light.source, "layer");
});

test("a layer stored as black paints nothing, and a disabled stage paints nothing", () => {
    const m = model();
    assert.equal(keyLight(m, {index: 0}, position(13, "KC_A")).source, "base", "HSV value zero is not a colour");
    const off = model({rgb: {...model().rgb, stages: [{id: "layers", label: "Layer colours", enabled: false}]}});
    const light = keyLight(off, {index: 3}, position(13, "KC_UP"));
    assert.equal(light.source, "base", "with the stage off the layer colour is not painted");
});

test("with no base effect and nothing else painting, a key is simply unlit", () => {
    const dark = model({rgb: {...model().rgb, baseEffect: {state: "read", enabled: false}}});
    const light = keyLight(dark, {index: 0}, position(13, "KC_A"));
    assert.equal(isOff(light.colour), true);
    assert.equal(light.source, "off");
});

test("a pointing mode is an overlay on its locality, never on the key that binds it", () => {
    const m = model();
    const row = pdColourRow(m, 0);
    assert.deepEqual(row.color, colour(21, 255, 200));
    const preview = {color: row.color, locality: row.locality, triggerIndex: 0};

    const bindingKey = keyLight(m, {index: 3}, position(0, "PD_MODE_0"));
    assert.notDeepEqual(bindingKey.colour, row.color, "binding a mode does not colour its key");

    const right = keyLight(m, {index: 3}, position(7, "KC_TRANSPARENT"), {pdActive: preview});
    assert.deepEqual(right.colour, row.color, "the right half takes the overlay");
    assert.equal(right.source, "pointing");

    const left = keyLight(m, {index: 3}, position(0, "KC_TRANSPARENT"), {pdActive: preview});
    assert.equal(left.source, "base", "the left half is outside this locality");
    const leftMapped = keyLight(m, {index: 3}, position(0, "PD_MODE_0"), {pdActive: preview});
    assert.equal(leftMapped.source, "layer", "and there the layer still owns its own keys");

    const stageOff = model({rgb: {...model().rgb, stages: [{id: "pd", label: "Pointing modes", enabled: false}]}});
    assert.equal(keyLight(stageOff, {index: 3}, position(7, "KC_NO"), {pdActive: preview}).source, "base");
});

test("feedback colours come back per semantic, missing ones as black", () => {
    const colours = feedbackColours(model());
    assert.deepEqual(colours.hold, colour(18, 255, 200));
    assert.deepEqual(colours.branches[0], colour(169, 255, 200));
    assert.equal(isOff(feedbackColours({}).tap), true);
});

test("the trackball LED is lit like any other: base effect, and an all-keys wash", () => {
    const m = model();
    const base = trackballLight(m, {index: 3});
    assert.deepEqual(base.colour, colour(140, 210, 180), "a mapped-keys-only layer never reaches it");
    assert.equal(base.source, "base");

    const wash = trackballLight(m, {index: 4});
    assert.deepEqual(wash.colour, colour(0, 0, 158), "an all-keys layer paints every LED, this one too");
    assert.equal(wash.source, "layer");

    const dark = model({rgb: {...model().rgb, baseEffect: {state: "read", enabled: false}}});
    assert.equal(isOff(trackballLight(dark, {index: 3}).colour), true);

    const row = pdColourRow(m, 0);
    const held = trackballLight(m, {index: 3}, {pdActive: {color: row.color, locality: row.locality}});
    assert.deepEqual(held.colour, row.color, "a right-half overlay covers the trackball LED");
    assert.equal(held.source, "pointing");
});

// The fixture model with some rgb fields replaced and the rest (stages, base
// effect) kept, which model({rgb}) does not do.
const withRgb = (rgb) => { const m = model(); Object.assign(m.rgb, rgb); return m; };

test("with the matrix off the keyboard is dark, whatever the layers hold", () => {
    const m = withRgb({baseEffect: {state: "read", enabled: false, effectId: 0}});
    assert.equal(keyLight(m, {index: 4}, position(13, "KC_UP")).source, "off", "an all-keys layer does not paint");
    assert.equal(isOff(trackballLight(m, {index: 4}).colour), true);
});

test("the default layer's colour shows under a mapped-keys-only layer", () => {
    const m = withRgb({layerColors: [
        {layer: "Layer 0", layerId: 0, color: colour(0, 0, 80), mode: "ALL_KEYS"},
        {layer: "Layer 1", layerId: 1, color: colour(85, 255, 200), mode: "KEYS_MAPPED_ON_THIS_LAYER_ONLY"},
    ]});
    const layer = {index: 1};
    assert.deepEqual(keyLight(m, layer, position(13, "KC_1")).colour, colour(85, 255, 200), "the viewed layer wins on its own keys");
    assert.deepEqual(keyLight(m, layer, position(14, "KC_TRANSPARENT")).colour, colour(0, 0, 80), "layer 0 paints the rest");
    assert.deepEqual(trackballLight(m, layer).colour, colour(0, 0, 80), "and the trackball, since it is all keys");
    // HSV(85, 255, 0) is solid to the firmware — it paints black, not through.
    const black = withRgb({layerColors: [{layer: "Layer 2", layerId: 2, color: colour(85, 255, 0), mode: "ALL_KEYS"}]});
    assert.deepEqual(keyLight(black, {index: 2}, position(13, "KC_1")).colour, colour(85, 255, 0));
});

test("accents paint their LEDs, taking their stage colour when stored as HSV(0, 0, 0)", () => {
    const m = withRgb({
        layerColors: [{layer: "Layer 3", layerId: 3, color: colour(180, 255, 200), mode: "KEYS_MAPPED_ON_THIS_LAYER_ONLY"}],
        // LED 6 is key 13; LED 9 is key 14; LED 56 is the trackball
        layerAccents: [
            {owner: "Layer 3", ownerLayer: 3, color: colour(0, 0, 0), ledIndices: [9]},
            {owner: "RGB_LAYER_GROUP_ALL", color: colour(40, 255, 120), ledIndices: [56]},
            {owner: "Layer 5", ownerLayer: 5, color: colour(10, 255, 255), ledIndices: [6]},
        ],
        pdModeAccents: [{owner: "RGB_POINTING_MODE_GROUP_ALL", color: colour(0, 0, 0), ledIndices: [6]}],
    });
    const layer = {index: 3};
    assert.deepEqual(keyLight(m, layer, position(14, "KC_TRANSPARENT")).colour, colour(180, 255, 200), "inherits the layer colour on an unmapped key");
    assert.deepEqual(trackballLight(m, layer).colour, colour(40, 255, 120), "an accent can reach the trackball");
    assert.deepEqual(keyLight(m, layer, position(13, "KC_UP")).colour, colour(180, 255, 200), "a row for an inactive layer does not paint");
    const pdActive = {mode: "POINTING_MODE_DRAGSCROLL", color: colour(21, 255, 200), locality: "RGB_RIGHT_HALF"};
    assert.deepEqual(keyLight(m, layer, position(13, "KC_UP"), {pdActive}).colour, colour(21, 255, 200),
        "a pointing mode's accent paints the mode colour on the left half too");
});


test("zero brightness keeps explicit black distinct from layer pass-through and group inheritance", () => {
    const black = colour(140, 255, 0), skipped = colour(140, 0, 0);
    assert.equal(layerPaints(black), true);
    assert.equal(layerPaints(skipped), false);
    assert.equal(inheritsStageColour(black), false);
    assert.equal(inheritsStageColour(skipped), false, "group inheritance requires all three channels zero");
    assert.equal(inheritsStageColour(colour(0, 0, 0)), true);
    const m = model();
    m.rgb.layerColors[1].color = black;
    assert.deepEqual(keyLight(m, {index: 3}, position(13, "KC_A")), {colour: black, source: "layer", layer: 3});
});

// The background effect's LED classes, as the draft's Lighting · Background effect stores them.
const baseSettings = (leds) => ({id: "rgbAppearance", area: "Lighting", stage: "base", label: "Background effect", fields: [{macro: "effectLeds", label: "LEDs", value: String(leds)}]});
test("a base-effect LED class the effect skips stays unlit; an animated effect is drawn lit", async () => {
    const {trackballLight} = await import("../../webview/view/lighting.mjs");
    // With no layer colours, each LED shows what the background effect does there.
    const unlayered = model({rgb: {...model().rgb, layerColors: []}});
    const base = {index: 0, positions: [position(0, "KC_A")]};
    const keysOnly = {...unlayered, configDefaults: [baseSettings(4)]};
    assert.equal(keyLight(keysOnly, base, position(0, "KC_A")).source, "base");
    assert.equal(keyLight(keysOnly, base, position(50, "KC_SPC")).source, "off", "a thumb key is not a main key");
    assert.equal(trackballLight(keysOnly, base).source, "off", "nor is the trackball LED");
    assert.equal(keyLight(unlayered, base, position(50, "KC_SPC")).source, "base", "without the setting every LED is reached");
    assert.equal(keyLight(unlayered, base, position(0, "KC_A")).source, "base", "Solid colour does not animate");
    const animated = model({rgb: {...model().rgb, layerColors: [], baseEffect: {state: "read", enabled: true, effectId: 13, hue: 10, saturation: 200, brightness: 255, previewColor: undefined}}});
    const light = keyLight(animated, base, position(0, "KC_A"));
    assert.equal(light.source, "animated");
    assert.ok(!isOff(light.colour), "lit, never drawn as off");
    const skipped = {...model({rgb: {...model().rgb, layerColors: []}}), configDefaults: [baseSettings(4)]};
    assert.equal(keyLight(skipped, {index: 0, positions: []}, position(50, "KC_SPC")).source, "off");
    assert.equal(keyLight(skipped, {index: 0, positions: []}, position(0, "KC_A")).source, "base");
});

test("a trackball mode previews from its first placed key, and black paints dark", async () => {
    const {pdTrigger} = await import("../../webview/view/lighting.mjs");
    const pd = {pdModes: [{id: 0, kind: 2, keys: {slot: 0, hold: "PD_MODE_0", lock: "PD_LOCK_0"}}]};
    const base = {index: 0, positions: [position(0, "KC_A"), {layoutIndex: 40, keycode: "QK_USER_16", semantic: "PD_MODE_0"}]};
    const other = {index: 3, positions: [{layoutIndex: 5, keycode: "QK_USER_17", semantic: "PD_LOCK_0"}]};
    const m = {...model(), ...pd, layers: [base, other]};
    assert.deepEqual(pdTrigger(m, base, 0), {layoutIndex: 40, layer: 0});
    assert.deepEqual(pdTrigger(m, other, 0), {layoutIndex: 5, layer: 3}, "the viewed layer's key first");
    assert.equal(pdTrigger(m, base, 1), null);
    const black = {mode: "POINTING_MODE_DRAGSCROLL", color: colour(0, 0, 0), locality: "RGB_RIGHT_HALF"};
    const light = keyLight(model(), {index: 0, positions: []}, position(11, "KC_A"), {pdActive: black});
    assert.equal(light.source, "pointing");
    assert.ok(isOff(light.colour), "the right half goes dark");
});

const words = {vocabulary: createRequire(import.meta.url)("../../core/model/vocabulary").VOCABULARY};

test("Turn off says what black does: literal black for modes and feedback, nothing for a layer", () => {
    for (const stage of ["pd", "combo", "key"]) {
        const {offTip, offNote} = offWording(words, stage);
        for (const words of [offTip, offNote]) {
            assert.match(words, /black/);
            assert.match(words, /Stage on/);
            assert.doesNotMatch(words, /paints nothing|underneath|not repainted|flashes nothing/);
        }
    }
    assert.match(offWording(words, "auto").offTip, /black/);
    assert.match(offWording(words, "layers").offTip, /paints nothing/);
    assert.match(offWording(words, "layers").offNote, /passthrough.*shows through/);
    assert.deepEqual([offWording(words, "layers").offAction, offWording(words, "layers").offWord], ["Make passthrough", "Passthrough"]);
    for (const stage of ["auto", "pd", "combo", "key"]) assert.equal(offWording(words, stage).offWord, undefined, `${stage}: off is black, so it keeps Turn off and Off`);
    assert.deepEqual(offWording(words, "base"), {});
});

test("Turn off switches a replacement case off: it does not flash, and off keeps its own words", () => {
    const {offTip, offNote, offAction, offWord} = offWording(words, "autocorrect");
    assert.match(offTip, /does not flash for this case/);
    assert.match(offNote, /This case is off.*other two cases still flash/);
    for (const text of [offTip, offNote]) assert.doesNotMatch(text, /black|Stage on/, "off here is no black flash, and needs no stage switch");
    assert.deepEqual([offAction, offWord], [undefined, undefined], "the colour editor's Turn off and Off");
});

test("a replacement flash paints its case's colour over everything, where its locality reaches against the key that caused it", () => {
    const text = colour(106, 255, 200);
    const base = model();
    base.rgb = {...base.rgb, stages: [...base.rgb.stages.map((stage) => ({...stage, enabled: true})), {id: "autocorrect", label: "Replacement feedback", bit: 32, enabled: true}],
        comboFeedback: {color: colour(190, 255, 200), locality: "RGB_BOTH_HALVES"}};
    const layer = {index: 4};
    const flash = (locality, ...key) => ({replacementActive: {owner: "AUTOCORRECT_FEEDBACK_GROUP_TEXT", color: text, locality, triggerIndex: key.length ? key[0] : 49}});
    // Key 49 is a left thumb key; 7 is on the right half, 13 on the left.
    assert.deepEqual(keyLight(base, layer, position(13, "KC_A"), flash("RGB_KEY_HALF")), {colour: text, source: "replacement", layer: null}, "the half of the key");
    assert.notEqual(keyLight(base, layer, position(7, "KC_U"), flash("RGB_KEY_HALF")).source, "replacement", "and not the other half");
    assert.equal(keyLight(base, layer, position(49, "KC_SPC"), flash("RGB_KEYS_ONLY")).source, "replacement", "only the key");
    assert.notEqual(keyLight(base, layer, position(13, "KC_A"), flash("RGB_KEYS_ONLY")).source, "replacement");
    for (const index of [7, 13]) assert.equal(keyLight(base, layer, position(index, "KC_A"), flash("RGB_BOTH_HALVES")).source, "replacement");
    assert.equal(keyLight(base, layer, position(7, "KC_U"), flash("RGB_RIGHT_HALF")).source, "replacement");
    assert.notEqual(keyLight(base, layer, position(13, "KC_A"), flash("RGB_RIGHT_HALF")).source, "replacement");
    // With no known key it paints both halves, or every key, as the keyboard does.
    for (const locality of ["RGB_KEY_HALF", "RGB_KEYS_ONLY"]) for (const index of [7, 13]) {
        assert.equal(keyLight(base, layer, position(index, "KC_A"), flash(locality, undefined)).source, "replacement", `${locality} at ${index}`);
    }
    // The trackball is on the right half and is no key.
    assert.equal(trackballLight(base, layer, flash("RGB_KEY_HALF", 51)).source, "replacement");
    assert.notEqual(trackballLight(base, layer, flash("RGB_KEY_HALF", 49)).source, "replacement");
    assert.notEqual(trackballLight(base, layer, flash("RGB_KEYS_ONLY", 51)).source, "replacement");
    // It paints last: over a held combo's feedback too.
    const held = {comboActive: {color: colour(190, 255, 200), locality: "RGB_BOTH_HALVES", inputs: [13]}};
    assert.equal(keyLight(base, layer, position(13, "KC_A"), held).source, "combo");
    assert.equal(keyLight(base, layer, position(13, "KC_A"), {...held, ...flash("RGB_BOTH_HALVES")}).source, "replacement");
    const off = {...base, rgb: {...base.rgb, stages: base.rgb.stages.map((stage) => stage.id === "autocorrect" ? {...stage, enabled: false} : stage)}};
    assert.notEqual(keyLight(off, layer, position(13, "KC_A"), flash("RGB_BOTH_HALVES")).source, "replacement", "with the stage off nothing of it paints");
});

test("a replacement flash's accents light for every case and then for its own; a case that is off paints only accents in a colour of their own", () => {
    const text = colour(106, 255, 200), own = colour(20, 255, 200), narrower = colour(30, 255, 200);
    const base = model();
    // LED 6 is key 13, LED 9 is key 14, LED 0 is key 0.
    base.rgb = {...base.rgb, stages: [...base.rgb.stages, {id: "autocorrect", label: "Replacement feedback", bit: 32, enabled: true}],
        autocorrectFeedbackAccents: [
            {index: 0, owner: "AUTOCORRECT_FEEDBACK_GROUP_TEXT", color: narrower, ledIndices: [6], leds: "LED 6"},
            {index: 1, owner: "AUTOCORRECT_FEEDBACK_GROUP_ALL", color: own, ledIndices: [6, 9], leds: "LEDs 6, 9"},
            {index: 2, owner: "AUTOCORRECT_FEEDBACK_GROUP_UNDO", color: colour(0, 255, 200), ledIndices: [9], leds: "LED 9"},
            {index: 3, owner: "AUTOCORRECT_FEEDBACK_GROUP_ALL", color: colour(0, 0, 0), ledIndices: [0], leds: "LED 0"},
        ]};
    const layer = {index: 4};
    const flash = (color, owner = "AUTOCORRECT_FEEDBACK_GROUP_TEXT") => ({replacementActive: {owner, color, locality: "RGB_RIGHT_HALF", triggerIndex: 49}});
    assert.deepEqual(keyLight(base, layer, position(13, "KC_A"), flash(text)).colour, narrower, "the accent naming the case repaints the one for every case, though stored before it");
    assert.deepEqual(keyLight(base, layer, position(14, "KC_B"), flash(text)).colour, own, "another case's accent does not light");
    assert.deepEqual(keyLight(base, layer, position(0, "KC_ESC"), flash(text)).colour, text, "a black accent takes the case's colour, outside its locality too");
    assert.deepEqual(keyLight(base, layer, position(14, "KC_B"), flash(colour(0, 255, 200), "AUTOCORRECT_FEEDBACK_GROUP_UNDO")).colour, colour(0, 255, 200));
    const dark = flash(colour(77, 0, 0));
    assert.equal(replacementPaints(dark.replacementActive.color), false);
    assert.notEqual(keyLight(base, layer, position(7, "KC_U"), dark).source, "replacement", "a case that is off does not flash");
    assert.notEqual(keyLight(base, layer, position(0, "KC_ESC"), dark).source, "replacement", "nor does its black accent");
    assert.deepEqual(keyLight(base, layer, position(13, "KC_A"), dark).colour, narrower, "an accent in a colour of its own still lights");
});

test("a replacement flash previews from the first key that sends Space, or Backspace for an undo", () => {
    const base = {index: 0, positions: [position(0, "KC_A"), position(49, "KC_SPC"), position(54, "KC_BSPC"), position(55, "KC_BACKSPACE")]};
    const other = {index: 3, positions: [position(49, "KC_TRANSPARENT"), position(5, "KC_SPACE")]};
    const m = {...publishedModel(), layers: [base, other]};
    assert.deepEqual(replacementTrigger(m, base, false), {layoutIndex: 49, layer: 0}, "Space, under any of its names");
    assert.deepEqual(replacementTrigger(m, base, true), {layoutIndex: 54, layer: 0}, "Backspace for an undo");
    assert.deepEqual(replacementTrigger(m, other, false), {layoutIndex: 5, layer: 3}, "the viewed layer's key first");
    assert.deepEqual(replacementTrigger(m, other, true), {layoutIndex: 54, layer: 0}, "else from layer 0 up");
    assert.equal(replacementTrigger({...m, layers: [other]}, other, true), null, "no key stands in where none sends it");
});

test("a key's LED and the trackball's are the ones core publishes", () => {
    const m = model();
    assert.equal(keyLed(m, 0), 0);
    assert.equal(keyLed(m, 51), 53, "right thumb keys carry right-half LEDs");
    assert.equal(new Set(KEY_LEDS.map((_, index) => keyLed(m, index))).size, 56, "every position has its own LED");
    assert.equal(trackballLed(m), 56);
    assert.equal(keyLed(m, undefined), undefined);
});

test("a default layer the keyboard keeps on paints nothing unless it is shown or previewed, as on the keyboard", () => {
    const m = withRgb({layerColors: [{layer: "Layer 2", layerId: 2, color: colour(170, 255, 200), mode: "ALL_KEYS"}]});
    // The layers core publishes with layer 2 a default layer, which it marks alwaysOn.
    m.layers = publishedModel(profileDocument({settings: (/** @type {any} */ domain) => { domain.values[SETTING.DEFAULT_LAYERS] |= 1 << 2; }})).layers;
    assert.equal(m.layers[2].alwaysOn, true);
    assert.notDeepEqual(keyLight(m, {index: 3}, position(13, "KC_TRANSPARENT")).colour, colour(170, 255, 200),
        "the keyboard's lighting reads the layers that are on, not its default layers");
    assert.deepEqual(keyLight(m, {index: 3}, position(13, "KC_TRANSPARENT"), {held: [2]}).colour, colour(170, 255, 200), "previewed on, it paints");
});

test("a combo held lights its feedback where its locality reaches against its held keys, then combo accents", () => {
    const feedback = {color: colour(190, 255, 200), locality: "RGB_KEYS_ONLY"};
    const base = model();
    base.rgb = {...base.rgb, comboFeedback: feedback, stages: base.rgb.stages.map((stage) => ({...stage, enabled: true})),
        comboAccents: [{index: 0, owner: "", color: colour(20, 255, 200), ledIndices: [keyLed(base, 0)], leds: "LED 0"}]};
    const layer = {index: 3};
    const options = {comboActive: {color: feedback.color, locality: feedback.locality, inputs: [7, 9]}};
    assert.deepEqual(keyLight(base, layer, position(7, "KC_U"), options), {colour: feedback.color, source: "combo", layer: null}, "a held key wears the feedback");
    assert.notEqual(keyLight(base, layer, position(8, "KC_I"), options).source, "combo", "a key not held does not, under Only the trigger key");
    assert.deepEqual(keyLight(base, layer, position(0, "KC_ESC"), options).colour, colour(20, 255, 200), "a combo accent paints its LEDs");
    const off = {...base, rgb: {...base.rgb, stages: base.rgb.stages.map((stage) => stage.id === "combo" ? {...stage, enabled: false} : stage)}};
    assert.notEqual(keyLight(off, layer, position(7, "KC_U"), options).source, "combo", "with the stage off nothing of it paints");
});
