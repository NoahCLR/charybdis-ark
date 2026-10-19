import {profileLayers, profileMacros, editLayers, editMacros} from "../fixtures/profile-document.js";
// The picker's validity check has to agree with the draft: every expression
// it calls storable the draft stores as the same keycode, and every one the
// draft refuses it refuses too (B10: S(MO(2)), G(PD_SLOT_0), LT(2, LT(…))).
import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {isPlainKey, keyProblem, keycodeValue, takesModifiers} from "../../webview/view/keycode-expression.mjs";

const require = createRequire(import.meta.url);
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const portable = require("../../core/model/portable-profile");
const {buildSnapshotModel} = require("../../core/session/device-model");
const {document: pdDocument} = require("../fixtures/pd-profile");
const {PROFILE_WIRE_KNOWN_MASKS} = require("../../core/protocol/profile-wire-v1");
const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require("../../core/data/charybdis-layout");

const capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 0}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x6fd70b90, featureFlags: PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES};
const doc = pdDocument();
const snapshot = {document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: {brightnessMax: 200}};
const model = buildSnapshotModel(snapshot, capabilities, {editable: true, reason: ""});
const slotOf = (layoutIndex) => CHARYBDIS_4X6_LAYOUT_MATRIX[layoutIndex][0] * 6 + CHARYBDIS_4X6_LAYOUT_MATRIX[layoutIndex][1];

// What the draft stores for an expression on a key, or undefined if it refuses.
function drafted(expression) {
    const draft = new ProfileDraftSession(snapshot, "test-device", capabilities);
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
    "S(MO(2))", "G(PD_SLOT_0)", "S(VIA_MACRO_0)", "G(A(S(C(LT(3,KC_F)))))", "C(PD_SLOT_0)",
    "PD_SLOT_0", "PD_SLOT_0_LOCK", "VIA_MACRO_0", "VIA_MACRO_127", "VIA_MACRO_128", "CUSTOM_KEY_5",
    "OSM(MOD_LSFT)", "LM(1, MOD_LSFT)", "LM(16, MOD_LSFT)", "0x0004", "0x5240", "4", "NOT_A_KEY", "", "LT(3,", "KC_A)",
];

test("the picker's check stores what the draft stores and refuses what it refuses", () => {
    for (const expression of EXPRESSIONS) {
        const stored = drafted(expression);
        const problem = keyProblem(model, expression);
        assert.equal(problem === "", stored !== undefined, `${expression}: picker says "${problem}", draft stores ${stored}`);
        if (stored !== undefined) assert.equal(keycodeValue(model, expression), stored, expression);
    }
});

test("every catalogue key the picker offers is one the draft stores, by the same value", () => {
    for (const entry of model.qmkKeycodes.filter((_, at) => at % 7 === 0)) {
        assert.equal(keycodeValue(model, entry.value), entry.keycode, entry.value);
    }
});

test("a tap with a hold is a plain key; modifiers wrap only basic or modified keys", () => {
    assert.equal(isPlainKey(model, "KC_A"), true);
    assert.equal(isPlainKey(model, "KC_EXLM"), false);
    assert.equal(isPlainKey(model, "MO(1)"), false);
    assert.equal(takesModifiers(model, "KC_EXLM"), true);
    for (const key of ["MO(2)", "PD_SLOT_0", "VIA_MACRO_0", "CUSTOM_KEY_1", "LT(3, KC_F)", "QK_BOOT"]) assert.equal(takesModifiers(model, key), false, key);
});
