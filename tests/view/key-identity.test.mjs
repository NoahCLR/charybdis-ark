import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {keyIdentity, keycodeName, macroIndex, sameKey, slotKeycodeNames, slotKeycodes} from "../../webview/view/key-identity.mjs";
import {keyMeaning} from "../../webview/view/keyface.mjs";
import {published} from "../fixtures/published-behaviours.mjs";

const require = createRequire(import.meta.url);
const {keyAt, publishedModel} = require("../fixtures/published-model.js");

// Which key a spelling is reads what core publishes: its alias table, the
// kinds of key it treats apart, its behaviours, macros, custom keys and
// pointing slots. The test profile as it ships has Dragscroll, Volume,
// Brightness, Zoom, Arrow and Pinch in pointing slots 0 to 5, every later
// slot empty.
const profile = published();

test("a spelling reads by the name the profile knows it by, and a name nothing knows stays as written", () => {
    const model = publishedModel();
    assert.equal(keyIdentity(model, "KC_ENT").name, "KC_ENTER");
    assert.equal(keyIdentity(model, "KC_ENTER").name, "KC_ENTER");
    assert.equal(keyIdentity(model, "QK_MACRO_3").name, "MACRO_3");
    assert.equal(keyIdentity(model, "0x7F00").name, "CUSTOM_KEY_0", "a bare value the keyboard names");
    assert.equal(keyIdentity(model, "NOT_A_KEY").name, "NOT_A_KEY");
    assert.equal(keyIdentity(model, "LGUI(KC_ENT)").name, "LGUI(KC_ENT)", "the name is the table's, not the expression read again");
    assert.equal(keyIdentity(null, "KC_ENT").name, "KC_ENT", "without a model, nothing is resolved");
    assert.equal(keyIdentity(model, undefined).spelling, "");
    // Every name core publishes is a name, so a table read with ?? and one
    // read with || answer alike.
    assert.deepEqual(Object.entries(model.qmkKeycodeAliases).filter(([, name]) => !name), []);
});

test("a key's catalogue entry is found by its name or any alias the catalogue lists", () => {
    const model = publishedModel();
    const enter = model.qmkKeycodes.find((/** @type {{value: string}} */ row) => row.value === "KC_ENTER");
    assert.ok(enter);
    assert.equal(keyIdentity(model, "KC_ENTER").entry, enter);
    assert.equal(keyIdentity(model, "KC_ENT").entry, enter, "an alias");
    assert.equal(keyIdentity(model, "NOT_A_KEY").entry, undefined);
    // A model whose alias table lacks a spelling still finds the entry that lists it.
    assert.equal(keyIdentity({qmkKeycodes: [enter]}, "KC_ENT").entry?.keycode, enter.keycode);
});

test("one key is one canonical spelling, however its expression is spelled", () => {
    const model = {qmkKeycodeAliases: {KC_C: "KC_C", KC_ENT: "KC_ENTER", KC_ENTER: "KC_ENTER", KC_SLSH: "KC_SLASH", KC_SLASH: "KC_SLASH"}};
    assert.equal(keyIdentity(model, "KC_ENT").canonical, "KC_ENTER");
    assert.equal(keyIdentity(model, "LT(3, KC_SLSH)").canonical, "LT(3,KC_SLASH)");
    assert.equal(keyIdentity(model, "G(KC_C)").canonical, "LGUI(KC_C)", "the picker's Cmd wrapper");
    assert.ok(sameKey(model, "LCMD(KC_C)", "LGUI(KC_C)"));
    assert.ok(sameKey(model, "S(C(KC_ENT))", "LCTL(LSFT(KC_ENTER))"), "nesting order and aliases");
    assert.ok(sameKey(model, "LCS(KC_ENT)", "LCTL(LSFT(KC_ENTER))"), "a combined wrapper");
    assert.ok(!sameKey(model, "C(KC_C)", "LGUI(KC_C)"), "a different modifier is a different key");
    assert.ok(!sameKey(model, "KC_A", "KC_B"));
});

test("a value the keyboard names by its hex is the key core knows it as, however the hex is written", () => {
    const model = publishedModel();
    assert.equal(keyIdentity(model, "0x7F00").canonical, "CUSTOM_KEY_0");
    assert.equal(keyIdentity(model, "0x7f00").canonical, "CUSTOM_KEY_0");
    assert.equal(keyIdentity(model, "LSFT(0x7F00)").canonical, "LSFT(CUSTOM_KEY_0)", "inside an expression too");
    assert.equal(keyIdentity(model, "0x7E86").canonical, "PD_MODE_6");
    assert.equal(keyIdentity(model, "0x7F7F").canonical, "CUSTOM_KEY_127");
    assert.equal(keyIdentity(model, "0x0041").canonical, "0x0041", "a value nothing names stays as written");
    assert.deepEqual(keyIdentity(model, "0x7f00").spellings, ["0x7f00", "CUSTOM_KEY_0", "0x7F00"],
        "the names a fact may be published under: as written, as resolved, and the bare number as core keys it");
});

test("a behaviour row is keyed exactly; a picked key finds the row listening to it however either is spelled", () => {
    const model = {
        qmkKeycodeAliases: {KC_ENT: "KC_ENTER", KC_ENTER: "KC_ENTER", KC_SLSH: "KC_SLASH", KC_SLASH: "KC_SLASH", KC_C: "KC_C"},
        keyBehaviors: [{keycode: "KC_ENTER"}, {keycode: "LT(3,KC_SLASH)"}, {keycode: "PD_MODE_0"}, {keycode: "LGUI(KC_C)"}],
    };
    const [enter, layerTap, pointing, command] = model.keyBehaviors;
    assert.equal(keyIdentity(model, "KC_ENTER").behaviour, enter);
    assert.equal(keyIdentity(model, "KC_ENT").behaviour, undefined, "a row is keyed by the name it was saved under");
    assert.equal(keyIdentity(model, "KC_ENT").listening, enter);
    assert.equal(keyIdentity(model, "LT(3, KC_SLSH)").behaviour, undefined);
    assert.equal(keyIdentity(model, "LT(3, KC_SLSH)").listening, layerTap);
    assert.equal(keyIdentity(model, "PD_MODE_0").listening, pointing);
    assert.equal(keyIdentity(model, "G(KC_C)").listening, command);
    assert.equal(keyIdentity(model, "KC_A").behaviour, undefined);
    assert.equal(keyIdentity(model, "KC_A").listening, undefined);
    const custom = {...publishedModel(), keyBehaviors: [{keycode: "CUSTOM_KEY_0"}]};
    assert.equal(keyIdentity(custom, "0x7f00").listening?.keycode, "CUSTOM_KEY_0");
    assert.equal(keyIdentity(custom, "0x7f00").behaviour, undefined);
});

test("a spelling nothing knows is no key the interface treats apart", () => {
    const key = keyIdentity(profile, "NOT_A_KEY");
    assert.deepEqual({name: key.name, canonical: key.canonical, kind: key.kind, value: key.value, macro: key.macro, customKey: key.customKey,
        behaviour: key.behaviour, listening: key.listening, pointing: key.pointing, variant: key.variant},
    {name: "NOT_A_KEY", canonical: "NOT_A_KEY", kind: undefined, value: undefined, macro: "", customKey: "",
        behaviour: undefined, listening: undefined, pointing: undefined, variant: "hold"});
    assert.equal(keyIdentity(profile, "").macro, "");
});

test("a macro and a custom key are named as the profile lists them, under any name they are read by", () => {
    const model = profile;
    assert.equal(keyIdentity(model, "MACRO_11").macro, "MACRO_11");
    assert.equal(keyIdentity(model, "QK_MACRO_11").macro, "MACRO_11", "by the name the profile knows it by");
    assert.equal(keyIdentity(model, "KC_A").macro, "");
    assert.equal(keyIdentity({}, "MACRO_11").macro, "", "which keycodes are macros' is core's (qmkKeyKinds), not read out of a name");
    for (const name of ["MC_11", "0x770B", "0x770b"]) assert.equal(keyIdentity(model, name).macro, "MACRO_11", `${name}: any name the keycode is read by`);
    assert.equal(keyIdentity(model, "0x7728").macro, "MACRO_40", "a slot QMK names nothing by its number");
    for (const name of ["CUSTOM_KEY_5", "0x7F05", "0x7f05"]) assert.equal(keyIdentity(model, name).customKey, "CUSTOM_KEY_5", `${name}: a custom key by any spelling`);
    assert.equal(keyIdentity(model, "0x770B").customKey, "", "a macro is no custom key");
    assert.equal(keyIdentity(model, "LSFT(CUSTOM_KEY_1)").customKey, "", "a wrapped custom key is not the key itself");
    assert.equal(keyIdentity(model, "0x770B").kind, "macro");
    assert.equal(keyIdentity(model, "0x7f05").kind, "customKey");
});

test("a pointing key is its slot, held or locked, however the keyboard names it", () => {
    assert.equal(keyIdentity(profile, "PD_MODE_0").pointing?.name, "Dragscroll");
    assert.equal(keyIdentity(profile, "PD_MODE_0_LOCK").pointing?.name, "Dragscroll", "the lock keycode reaches the same slot");
    assert.equal(keyIdentity(profile, "PD_MODE_6").pointing?.id, 6);
    assert.equal(keyIdentity(profile, "KC_A").pointing, undefined);
    // Layout positions carry the device's own name for the value: plain hex
    // for a mode key, named slot or not. Both reach the slot, or a bound key
    // would read as an ordinary key on the board and in the hover card.
    const model = published({keys: {0: {0: "PD_MODE_0", 1: "PD_MODE_0_LOCK", 2: "PD_MODE_6", 3: "PD_MODE_6_LOCK"}}});
    const stored = [0, 1, 2, 3].map((layoutIndex) => keyAt(model, 0, layoutIndex).keycode);
    assert.deepEqual(stored.map((keycode) => keyIdentity(model, keycode).pointing?.id), [0, 0, 6, 6], "the lock keycode of an unnamed slot too");
    assert.deepEqual(stored.map((keycode) => keyIdentity(model, keycode).variant), ["hold", "lock", "hold", "lock"], "by the keyboard's own names");
    assert.deepEqual(["PD_MODE_0", "PD_MODE_0_LOCK"].map((keycode) => keyIdentity(model, keycode).variant), ["hold", "lock"], "by the app's");
    const [hold, lock] = slotKeycodes(model.pdModes[6]);
    const hex = (/** @type {number} */ value) => `0x${value.toString(16)}`;
    assert.deepEqual([hold, lock].map((value) => keyIdentity(model, hex(value)).pointing?.id), [6, 6], "an empty slot's by its numbers");
    assert.deepEqual([hold, lock].map((value) => keyIdentity(model, hex(value)).variant), ["hold", "lock"]);
    assert.equal(keyIdentity(model, "0x0041").pointing, undefined, "an ordinary value is not a pointing key");
    assert.deepEqual(slotKeycodes(profile.pdModes[0]), [0x7e80, 0x7ea0], "hold and toggle for a named slot");
    assert.deepEqual(slotKeycodes(profile.pdModes[6]), [0x7e86, 0x7ea6], "and for a numbered one");
    assert.deepEqual(slotKeycodeNames(profile.pdModes[0]), ["PD_MODE_0", "PD_MODE_0_LOCK"], "and by name, hold then lock");
});

test("what a key reaches is looked up by what its value means", () => {
    // The keyboard stores a behaviour target, a macro and a pointing mode as
    // plain user keycodes; every domain that refers back to them uses the
    // semantic name. A lookup that matched the stored name would find nothing.
    const model = published({keys: {0: {3: "PD_MODE_0", 4: "MACRO_0"}},
        behaviours: [{keycode: "PD_MODE_0", steps: [{tapCount: 1, hold: {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: "KC_ESC"}}]}]});
    const pointingKey = keyAt(model, 0, 3), macroKey = keyAt(model, 0, 4);
    assert.notEqual(pointingKey.keycode, "PD_MODE_0", "the keyboard's own name for the value");
    assert.equal(keyIdentity(model, keyMeaning(pointingKey)).behaviour?.keycode, "PD_MODE_0");
    assert.equal(keyIdentity(model, keyMeaning(macroKey)).macro, "MACRO_0");
    assert.equal(keyIdentity(model, keyMeaning(pointingKey)).pointing?.name, "Dragscroll");
});

test("a key is worked out once per model and spelling", () => {
    const model = publishedModel();
    assert.equal(keyIdentity(model, "KC_ENT"), keyIdentity(model, "KC_ENT"));
    assert.notEqual(keyIdentity(model, "KC_ENT"), keyIdentity(model, "KC_ENTER"));
    assert.notEqual(keyIdentity(model, "KC_ENT"), keyIdentity({...model}, "KC_ENT"), "a new model answers afresh");
});

const catalogue = {qmkKeycodes: [
    {keycode: 0x0004, value: "KC_A"},
    {keycode: 0x0006, value: "KC_C"},
    {keycode: 0x00a9, value: "KC_VOLU"},
    {keycode: 0x7e50, value: "PD_MODE_0"},
]};

test("a stored number is named from the keyboard's own catalogue", () => {
    assert.equal(keycodeName(catalogue, 0x00a9), "KC_VOLU");
    assert.equal(keycodeName(catalogue, 0x7e50), "PD_MODE_0");
    assert.equal(keycodeName(catalogue, 0), "", "zero means no shortcut, not a keycode");
    assert.equal(keycodeName(catalogue, 0x777f), "MACRO_127", "a macro by its name");
});

test("modifier-wrapped values are unwrapped the way the keyboard encodes them", () => {
    assert.equal(keycodeName(catalogue, 0x0806), "G(KC_C)", "left GUI + C");
    assert.equal(keycodeName(catalogue, 0x0a04), "S(G(KC_A))", "left GUI + shift + A");
    assert.equal(keycodeName(catalogue, 0x1806), "RGUI(KC_C)", "the right-hand bit switches the wrappers");
});

test("an unknown value keeps its number rather than gaining an invented name", () => {
    assert.equal(keycodeName(catalogue, 0x7e61), "0x7E61");
    assert.equal(keycodeName({}, 0x0004), "0x4", "with no catalogue, nothing is claimed");
});

test("a macro slot is read from any name or number the writer takes for it", () => {
    for (const code of [0x7700, "MACRO_0", "VIA_MACRO_0", "0x7700", "30464"]) assert.equal(macroIndex(code), 0);
    assert.equal(macroIndex("MACRO_127"), 127);
    assert.equal(macroIndex("VIA_MACRO_127"), 127, "the former name reaches every slot");
    // QMK's own names for the first 32 slots are the keycode catalog's, so
    // they are read through the model core publishes.
    const model = publishedModel();
    for (const code of ["QK_MACRO_0", "MC_0"]) assert.equal(macroIndex(code, model), 0, code);
    assert.equal(macroIndex("MC_31", model), 31);
    for (const code of [0x7780, "MACRO_128", "VIA_MACRO_128", "QK_MACRO_32", "C(MACRO_0)", "KC_A", ""]) assert.equal(macroIndex(code, model), null, String(code));
});
