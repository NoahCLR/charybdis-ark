// The QMK expression grammar and its two dialects: each row of DIALECTS'
// differences pinned by an example. What each reader accepts as a whole is
// held by its callers' tests (tests/schema/keycodes.test.js,
// tests/schema/compiled-profile-v1.test.js, tests/view/keycode-expression.test.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import {DIALECTS, callParts, encodeExpression, normalizeExpression, splitArguments} from "../../rules/keycode-expression.mjs";

const NAMES = new Map([["KC_A", 0x04], ["KC_NO", 0x00], ["KC_ENT", 0x28], ["KC_1", 0x1e], ["MS_BTN1", 0xcd], ["QK_BOOT", 0x7c00]]);
/** @type {import("../../rules/keycode-expression.mjs").ExpressionTables} */
const tables = {
    names: (name) => NAMES.get(name),
    spellings: {names: {KC_BTN1: "MS_BTN1", OS_LSFT: "OSM(MOD_LSFT)"}, modTaps: {LSFT_T: "MOD_LSFT"}, wrappers: {SGUI: "LSG"}},
    layers: [{name: "Base"}, {name: "Nav"}],
    layerLocks: {first: 0x7ec0, count: 16},
};
const {qmk, keyboard} = DIALECTS;
/** @param {string} text @param {import("../../rules/keycode-expression.mjs").Dialect} dialect */
const read = (text, dialect) => encodeExpression(text, tables, dialect);
const both = (/** @type {string} */ text) => [read(text, qmk), read(text, keyboard)];

test("both read names, calls, wrappers, QMK's other spellings and the tap keys QMK packs", () => {
    assert.deepEqual(both("KC_A"), [0x04, 0x04]);
    assert.deepEqual(both("LCTL(KC_A)"), [0x0104, 0x0104]);
    assert.deepEqual(both("LCTL(RSFT(KC_A))"), [undefined, undefined], "one side flag for every modifier");
    assert.deepEqual(both("MT(MOD_LSFT, KC_A)"), [0x2204, 0x2204]);
    assert.deepEqual(both("MT(MOD_LSFT, KC_BTN1)"), [0x22cd, 0x22cd], "a name QMK spells otherwise is still a name");
    assert.deepEqual(both("LT(1, KC_A)"), [0x4104, 0x4104]);
    assert.deepEqual(both("LT(16, KC_A)"), [undefined, undefined], "four layer bits");
    assert.deepEqual(both("LT(1, 4)"), [undefined, undefined], "a tap is a key's name");
    assert.deepEqual(both("MO(3)"), [0x5223, 0x5223]);
    assert.deepEqual(both("TT(2)"), [0x52c2, 0x52c2]);
    assert.deepEqual(both("MO(32)"), [undefined, undefined]);
    assert.deepEqual(both("OSM(MOD_LSFT|MOD_LGUI)"), [0x52aa, 0x52aa]);
    assert.deepEqual(both("OSM(MOD_HYPR)"), [0x52af, 0x52af], "QMK's MOD_ names, MOD_HYPR and MOD_MEH among them");
    assert.deepEqual(both("MT(MOD_MEH, KC_A)"), [0x2704, 0x2704]);
    assert.deepEqual(both("OSM(MOD_MEH|MOD_RSFT)"), [undefined, undefined], "left and right never mix");
    assert.deepEqual(both("LM(1, MOD_LSFT)"), [0x5022, 0x5022]);
    assert.deepEqual(both("RCS(KC_A)"), [0x1304, 0x1304], "all of QMK's wrappers");
    assert.deepEqual(both("LAS(KC_A)"), [undefined, undefined], "and only QMK's");
    assert.deepEqual(both("KC_BTN1"), [0xcd, 0xcd]);
    assert.deepEqual(both("LSFT_T(KC_A)"), [0x2204, 0x2204]);
    assert.deepEqual(both("SGUI(KC_A)"), [0x0a04, 0x0a04]);
    assert.deepEqual(both("LCTL(QK_BOOT)"), [undefined, undefined], "a wrapper wraps only a basic or modified key");
});

test("line breaks: QMK's own dialect takes them only at an argument's edges, the keyboard anywhere", () => {
    assert.deepEqual(both("LCTL(\nKC_A\n)"), [0x0104, 0x0104]);
    assert.deepEqual(both("LCTL(LSFT(\nKC_A))"), [undefined, 0x0304]);
    assert.deepEqual(both("MT(MOD_LSFT\n|MOD_LGUI, KC_A)"), [0x2a04, 0x2a04], "or among MT()'s modifiers");
});

test("numbers: four hex digits, never decimal", () => {
    assert.deepEqual(both("0x0104"), [0x0104, 0x0104]);
    assert.deepEqual(both("260"), [undefined, undefined]);
    assert.deepEqual(both("0x00004"), [undefined, undefined]);
    assert.deepEqual(both("65536"), [undefined, undefined]);
});

test("the keyboard reads its own names: MACRO_n, LOCK_LAYER(n), and a layer by name where it knows the layers", () => {
    assert.deepEqual(both("MACRO_3"), [undefined, 0x7703]);
    assert.deepEqual(both("VIA_MACRO_3"), [undefined, 0x7703]);
    assert.deepEqual(both("LOCK_LAYER(2)"), [undefined, 0x7ec2]);
    assert.deepEqual(both("LOCK_LAYER(16)"), [undefined, undefined]);
    assert.deepEqual(both("MO(Nav)"), [undefined, 0x5221]);
    assert.deepEqual(both("LT(Nav, KC_A)"), [undefined, 0x4104]);
    assert.equal(encodeExpression("MO(Nav)", {...tables, layers: []}, keyboard), undefined, "not where it does not");
});

test("the keyboard's tidy form, and the shared call parts", () => {
    assert.equal(normalizeExpression("  MT( MOD_LSFT ,\n KC_A )"), "MT(MOD_LSFT, KC_A)");
    assert.deepEqual(callParts("LT(1, LCTL(KC_A))"), {name: "LT", inner: "1, LCTL(KC_A)"});
    assert.equal(callParts("lt(1, KC_A)"), undefined);
    assert.deepEqual(splitArguments("1, LCTL(KC_A, KC_B)", (text) => text.trim()), ["1", "LCTL(KC_A, KC_B)"]);
    assert.deepEqual(splitArguments("1, LCTL(KC_A", (text) => text.trim()), [], "unbalanced");
});
