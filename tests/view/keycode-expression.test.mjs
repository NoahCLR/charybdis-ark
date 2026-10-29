import {profileLayers, profileMacros, editLayers, editMacros} from "../fixtures/profile-document.js";
// The picker's validity check has to agree with the draft: every expression
// it calls storable the draft stores as the same keycode, and every one the
// draft refuses it refuses too (B10: S(MO(2)), G(PD_MODE_0), LT(2, LT(…))).
import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {comboOutputProblem, keyProblem, keycodeValue} from "../../webview/view/keycode-expression.mjs";
import {compactModifierMask, keyName} from "../../webview/view/keyvalues.mjs";
import {canonicalKeycode, visibleKeycode} from "../../webview/view/keyface.mjs";

const require = createRequire(import.meta.url);
const {openDraft, publishedModel} = require("../fixtures/published-model");
const {document: pdDocument} = require("../fixtures/pd-profile");
const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require("../../core/data/charybdis-layout");
const qmk = require("../../rules/qmk-keycodes.mjs");
const catalog = require("../../core/data/keycode-catalog");
const keycodes = require("../../core/schema/keycodes");

const doc = pdDocument();
const model = publishedModel(doc);
const slotOf = (layoutIndex) => CHARYBDIS_4X6_LAYOUT_MATRIX[layoutIndex][0] * 6 + CHARYBDIS_4X6_LAYOUT_MATRIX[layoutIndex][1];

// What the draft stores for an expression on a key, or undefined if it refuses.
function drafted(expression) {
    const {draft} = openDraft(doc);
    try {
        draft.stage({draftId: draft.id, draftRevision: draft.revision, type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: 5, keycode: expression}]});
    } catch { return undefined; }
    return profileLayers(draft.document)[1][slotOf(5)];
}

const EXPRESSIONS = [
    "KC_A", "KC_ESC", "KC_EXLM", "KC_NO", "KC_TRNS", "_______", "XXXXXXX", "QK_BOOT", "EE_CLR", "MS_BTN1",
    "KC_BTN1", "KC_MS_U", "RESET", "KC_LCTRL", "OS_LSFT", "KC_HYPR", "KC_MEH",
    "LCTL_T(KC_A)", "SFT_T(KC_SPC)", "RGUI_T(KC_ESC)", "MEH_T(KC_F)", "HYPR_T(KC_F)", "ALL_T(KC_F)", "LCTL_T(KC_EXLM)", "LCTL_T(QK_BOOT)",
    "SGUI(KC_4)", "SCMD(KC_4)", "SAGR(KC_A)", "LSG(KC_4)", "G(KC_C)", "S(C(KC_A))", "RSFT(C(KC_A))", "RALT(KC_EXLM)",
    "MT(MOD_LCTL, KC_A)", "MT(MOD_LCTL|MOD_RSFT, KC_A)", "MT(MOD_LCTL, S(KC_1))", "MT(MOD_LCTL, KC_EXLM)",
    "LT(3, KC_F)", "LT(3,KC_F)", "LT(2, LT(3, KC_F))", "LT(16, KC_A)", "LT(3, CUSTOM_KEY_1)", "LT(1, KC_LCTRL)",
    "MO(2)", "MO(15)", "MO(16)", "TG(1)", "TO(0)", "TT(3)", "OSL(4)", "DF(1)", "PDF(1)", "LOCK_LAYER(1)", "LOCK_LAYER(16)",
    "S(MO(2))", "G(PD_MODE_0)", "S(MACRO_0)", "G(A(S(C(LT(3,KC_F)))))", "C(PD_MODE_0)",
    "PD_MODE_0", "PD_MODE_0_LOCK", "PD_SLOT_0", "PD_SLOT_0_LOCK", "PD_SLOT_32", "MACRO_0", "MACRO_127", "MACRO_128", "CUSTOM_KEY_5",
    "OSM(MOD_LSFT)", "OSM(MOD_RSFT)", "OSM(MOD_RCTL|MOD_RALT)", "OS_RSFT", "OS_RCS", "RCS(KC_A)", "LCSG(KC_A)", "RSAG(KC_A)", "LSA(KC_A)", "LAS(KC_A)",
    "LM(1, MOD_LSFT)", "LM(16, MOD_LSFT)", "0x0004", "0x5240", "4", "NOT_A_KEY", "", "LT(3,", "KC_A)",
];

test("the picker's check stores what the draft stores and refuses what it refuses", () => {
    for (const expression of EXPRESSIONS) {
        const stored = drafted(expression);
        const problem = keyProblem(model, expression);
        assert.equal(problem === "", stored !== undefined, `${expression}: picker says "${problem}", draft stores ${stored}`);
        if (stored !== undefined) assert.equal(keycodeValue(model, expression), stored, expression);
    }
});

// VIA_MACRO_n was the macro keycodes' name before firmware D-F31: typed, it
// still reaches its macro, and the key then reads by today's name.
test("every name for a macro slot stores the same keycode, which reads as MACRO_n", () => {
    for (const expression of ["MACRO_3", "VIA_MACRO_3", "QK_MACRO_3", "MC_3"]) {
        assert.equal(drafted(expression), 0x7703, expression);
        assert.equal(keycodeValue(model, expression), 0x7703, expression);
    }
    assert.equal(keyName(model, 0x7703), "MACRO_3");
    assert.equal(drafted("VIA_MACRO_127"), 0x777f);
    assert.equal(keyProblem(model, "VIA_MACRO_128"), "VIA_MACRO_128 is not a key this keyboard can store.");
    assert.equal(drafted("VIA_MACRO_128"), undefined);
});

// PD_SLOT_n was the pointing keys' name before PD_MODE_n: typed, it still
// reaches its slot, and the key then reads by today's name.
test("a pointing key typed by its former name stores its slot's keycode, which reads as PD_MODE_n", () => {
    for (const [expression, code] of [["PD_SLOT_3", 0x7e83], ["PD_SLOT_3_LOCK", 0x7ea3], ["PD_MODE_3", 0x7e83]]) {
        assert.equal(keyProblem(model, expression), "", expression);
        assert.equal(keycodeValue(model, expression), code, expression);
        assert.equal(drafted(expression), code, expression);
    }
    assert.equal(keyName(model, 0x7e83), "PD_MODE_3");
    assert.equal(keyName(model, 0x7ea3), "PD_MODE_3_LOCK");
});

// What the draft stores as a new combo's output, or undefined if it refuses it.
function comboDrafted(expression) {
    const {draft} = openDraft(doc);
    try {
        draft.stage({draftId: draft.id, draftRevision: draft.revision, type: "addCombo", inputs: ["KC_Q", "KC_W"], output: expression, termMs: "50", holdTermMs: "200"});
    } catch { return undefined; }
    return draft.view({}).changes.length;
}

test("the combo output picker's check refuses what the draft refuses as a combo output, Tap-hold among it", () => {
    for (const expression of EXPRESSIONS) {
        const stored = comboDrafted(expression);
        const problem = comboOutputProblem(model, expression);
        assert.equal(problem === "", stored !== undefined, `${expression}: picker says "${problem}", draft ${stored === undefined ? "refuses" : "stores"} it`);
    }
    assert.match(comboOutputProblem(model, "LT(3, KC_F)"), /Tap-hold/);
    assert.equal(comboOutputProblem(model, "MO(2)"), "", "Hold is a combo output");
});

test("every catalogue key the picker offers is one the draft stores, by the same value", () => {
    for (const entry of model.qmkKeycodes.filter((_, at) => at % 7 === 0)) {
        assert.equal(keycodeValue(model, entry.value), entry.keycode, entry.value);
    }
});

test("a tap with a hold is a plain key; modifiers wrap only basic or modified keys", () => {
    // The shared grammar refuses the rest, so the draft never stores them.
    for (const dual of ["LT(1,KC_A)", "MT(MOD_LSFT,KC_A)"]) assert.notEqual(keycodeValue(model, dual), undefined, dual);
    for (const dual of ["LT(1,KC_EXLM)", "LT(1,MO(1))", "MT(MOD_LSFT,KC_EXLM)"]) assert.equal(keycodeValue(model, dual), undefined, dual);
    assert.notEqual(keycodeValue(model, "LSFT(KC_EXLM)"), undefined);
    for (const key of ["MO(2)", "PD_MODE_0", "MACRO_0", "CUSTOM_KEY_1", "LT(3, KC_F)", "QK_BOOT"]) assert.equal(keycodeValue(model, `LSFT(${key})`), undefined, key);
});

// The interface reads QMK's keycode layout from the shared rules
// (rules/qmk-keycodes.mjs), as core does; these hold its readers to what the
// keyboard reads back.
const names = {
    qmkKeycodes: catalog.entries().map((entry) => ({value: entry.name, keycode: entry.value, aliases: entry.aliases})),
    qmkKeycodeAliases: catalog.aliasTable(),
};

// A behaviour row is keyed by the name the keyboard reads back, one long
// wrapper per modifier (RCTL(RSFT(KC_A))); a picked expression finds that row
// however it is spelled.
test("every wrapper spelling reads as the keycode the keyboard reads back", () => {
    for (const wrapper of Object.keys(qmk.MODIFIER_WRAPPERS)) {
        const expression = `${wrapper}(KC_A)`;
        const readBack = keycodes.resolve(/** @type {number} */ (keycodes.encode(expression))).name;
        assert.equal(canonicalKeycode(names, expression), canonicalKeycode(names, readBack), expression);
        assert.equal(keycodeValue(names, expression), keycodes.encode(expression), expression);
    }
});

test("a stored modified key is named with wrappers core encodes back to it", () => {
    for (let code = qmk.QK.MODS.first; code <= qmk.QK.MODS.last; code++) {
        // The side flag alone holds no modifier: no pointing tap stores it.
        const name = keyName(names, code);
        if (name.startsWith("0x") || !(qmk.modsOf(code) & 0x0f)) continue;
        assert.equal(keycodes.encode(name), code, name);
        const mods = qmk.modsOf(code);
        assert.equal(compactModifierMask(code), mods & qmk.MOD_RIGHT ? (mods & 0x0f) << 4 : mods & 0x0f);
    }
});

test("every macro slot in QMK's macro block reads by its macro name", () => {
    const slots = qmk.QK.MACRO.last - qmk.QK.MACRO.first + 1;
    for (let slot = 0; slot < slots; slot++) {
        const stored = keycodes.resolve(qmk.QK.MACRO.first + slot).name;
        assert.equal(visibleKeycode(model, stored), `MACRO_${slot}`, stored);
        assert.equal(qmk.macroOfName(`MACRO_${slot}`), slot);
    }
    assert.equal(qmk.macroOfName(`MACRO_${slots}`), undefined);
});
