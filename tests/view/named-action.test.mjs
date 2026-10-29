import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {layerTapAction, macroAction, namedAction, pointingAction} from "../../webview/view/named-action.mjs";
import {macroMessage, macroNameMessage} from "../../webview/view/edits.mjs";

const require = createRequire(import.meta.url);
const {profileDocument, publishedModel} = require("../fixtures/published-model.js");

// A profile as core publishes it, with these keys and settings
// (profileDocument) and whatever `edits` stages.
/** @param {Parameters<typeof profileDocument>[0] & {edits?: object[]}} [described] @returns {any} */
const published = ({edits = [], ...described} = {}) => publishedModel(profileDocument(described), {edits});
// The test profile as it ships: Dragscroll, Volume, Brightness, Zoom, Arrow
// and Pinch in slots 0 to 5, every later slot empty, no macros.
const profile = published();

test("a branch action that sends a pointing mode reads as the mode, held or locked", () => {
    const model = profile;
    const hold = pointingAction(model, "PD_MODE_0");
    assert.deepEqual([hold.slot.id, hold.name, hold.how, hold.empty], [0, "Dragscroll", "hold", false]);
    assert.equal(pointingAction(model, "PD_MODE_0_LOCK").how, "lock");
    const empty = pointingAction(model, "PD_MODE_6");
    assert.deepEqual([empty.name, empty.how, empty.empty], ["Slot 6", "hold", true], "an unnamed empty slot goes by its number");
    assert.equal(pointingAction(model, "0x7EA6").how, "lock", "the lock keycode as a raw value too");
    assert.equal(pointingAction(model, "KC_A"), null);
});

test("a branch action that plays a macro reads as the macro by the name it was given", () => {
    const model = published({edits: [macroMessage("MACRO_0", "{KC_A}"), macroNameMessage("MACRO_0", "Sign-off")]});
    assert.equal(macroAction(model, "MACRO_0").name, "Sign-off");
    const unnamed = macroAction(model, "MACRO_1");
    assert.deepEqual([unnamed.name, unnamed.empty], ["Macro 1", true], "an unnamed macro goes by its number");
    assert.equal(macroAction(model, "LSFT(MACRO_0)"), null, "only a bare macro keycode is the macro itself");
    // A combo may store a macro by QMK's name or its number: the same keycode,
    // so the same macro.
    for (const action of ["QK_MACRO_0", "MC_0", "0x7700"]) assert.equal(macroAction(model, action)?.name, "Sign-off", action);
    assert.deepEqual([macroAction(model, "QK_MACRO_7")?.keycode, macroAction(model, "0x7707")?.keycode], ["MACRO_7", "MACRO_7"]);
    assert.equal(macroAction(model, "KC_A"), null);
});

test("pointing modes and macros read as what they are; plain keycodes read as themselves", () => {
    const model = profile;
    const pd = namedAction(model, "PD_MODE_4_LOCK");
    assert.deepEqual([pd.kind, pd.word, pd.name, pd.tags], ["pointing", "pointing mode", "Arrow", ["lock"]]);
    const macro = namedAction(model, "MACRO_2");
    assert.deepEqual([macro.kind, macro.word, macro.name, macro.tags], ["macro", "macro", "Macro 2", ["empty"]]);
    assert.equal(namedAction(model, "KC_A"), null);
});

test("a layer action reads as its layer, tagged with what it does to it", () => {
    // Layer 2 renamed, so its keys are named by the name it was given.
    const model = published({keys: {0: {0: "MO(2)", 1: "TG(1)", 2: "LM(1,MOD_LSFT)", 3: "LT(2,KC_F)", 4: "QK_LAYER_LOCK"}},
        settings: (settings) => { settings.names[2] = "Navigation"; }});
    assert.equal(model.layers[2].displayName, "Navigation");
    const hold = namedAction(model, "MO(2)");
    assert.deepEqual([hold.kind, hold.word, hold.name, hold.layer, hold.tags], ["layer", "layer", "Navigation", 2, ["Hold"]]);
    assert.deepEqual(namedAction(model, "TG(1)").tags, ["Lock"]);
    assert.deepEqual(namedAction(model, "LM(1,MOD_LSFT)").tags, ["+ Shift"], "a layer-mod is tagged with the modifiers it holds");
    assert.equal(model.qmkKeyLayerMods["LM(1,MOD_LSFT)"], "Shift", "which core publishes, in the words its name ends in");
    assert.equal(namedAction(model, "LT(2,KC_F)"), null, "a layer-tap is a tap and a layer, not a layer action");
    assert.equal(namedAction(model, "QK_LAYER_LOCK"), null, "a key that names no layer is itself");
});

// A layer-tap is named by its halves, both published by core, so a screen
// marks its layer without cutting its name.
test("a layer-tap reads as the key it taps and the layer it holds, as core names it", () => {
    const model = published({keys: {0: {0: "LT(2,KC_F)", 1: "LT(1,KC_SLASH)", 2: "MO(2)"}}, settings: (settings) => { settings.names[2] = "Navigation"; }});
    assert.equal(model.qmkKeyLayerTaps["LT(2,KC_F)"], "F", "core publishes the key it taps");
    assert.deepEqual(layerTapAction(model, "LT(2,KC_F)"), {tap: "F", layer: 2, name: "Navigation"});
    assert.equal(model.qmkKeyLabels["LT(2,KC_F)"], "F / Navigation");
    assert.deepEqual(layerTapAction(model, "LT(1,KC_SLASH)"), {tap: model.qmkKeyLayerTaps["LT(1,KC_SLASH)"], layer: 1, name: model.layers[1].displayName});
    assert.equal(model.qmkKeyLayerTaps["MO(2)"], undefined);
    assert.equal(layerTapAction(model, "MO(2)"), null, "a layer key that taps nothing");
    assert.equal(layerTapAction(model, "KC_F"), null);
    const renamed = {...model, qmkKeyLabels: {...model.qmkKeyLabels, "LT(2,KC_F)": "F / Nav"}};
    assert.equal(layerTapAction(renamed, "LT(2,KC_F)"), null, "a name core gives in other words is never cut");
});
