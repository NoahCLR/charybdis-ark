"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {encode, resolve} = require("../../core/schema/keycodes");

// Resolution is what makes readback legible: the device sends a uint16 and the
// user has to see a key. The expected values below were cross-checked against
// the compiled expectations in the via-layout tests.

test("basic keycodes resolve to their catalog entry", () => {
    assert.deepEqual(resolve(0x0004), {value: 0x0004, name: "KC_A", label: "A", group: "basic", kind: "basic", known: true});
    assert.equal(resolve(0x001c).name, "KC_Y");
    assert.equal(resolve(0x0001).name, "KC_TRANSPARENT");
});

test("layer keycodes decode their layer argument", () => {
    assert.equal(resolve(0x5220).name, "MO(0)");
    assert.equal(resolve(0x5222).name, "MO(2)");
    assert.equal(resolve(0x5222).layer, 2);
    assert.equal(resolve(0x5220).kind, "layer");
});

test("layer-tap keycodes decode both the layer and the tapped key", () => {
    const decoded = resolve(0x4005);
    assert.equal(decoded.name, "LT(0,KC_B)");
    assert.equal(decoded.layer, 0);
    assert.equal(decoded.tap, "KC_B");
    assert.equal(decoded.kind, "layer-tap");
    assert.equal(resolve(0x4105).name, "LT(1,KC_B)");
});

test("custom firmware keycodes still resolve, since the device may report them", () => {
    // The authored profile's RIGHT_THUMB compiles to a QK_USER value.
    assert.equal(resolve(0x7e5d).known, true);
    assert.match(resolve(0x7e5d).name, /^QK_USER_/);
});

test("an unrecognised keycode renders as hex rather than a guess", () => {
    const decoded = resolve(0xfffe);
    assert.equal(decoded.known, false);
    assert.equal(decoded.name, "0xFFFE");
    assert.equal(decoded.kind, "unknown");
});

test("out-of-range and non-integer inputs never throw", () => {
    for (const value of [-1, 0x10000, 1.5, undefined, null, "KC_A"]) {
        const decoded = resolve(value);
        assert.equal(decoded.known, false);
        assert.equal(typeof decoded.name, "string");
    }
});

test("shortcuts read from the keyboard include every modifier and basic key", () => {
    for (const [value, name, label] of [
        [0x0204, "LSFT(KC_A)", "Shift+A"],
        [0x0806, "LGUI(KC_C)", "Cmd+C"],
        [0x0a1d, "LSFT(LGUI(KC_Z))", "Shift+Cmd+Z"],
        [0x1104, "RCTL(KC_A)", "Right Ctrl+A"],
        [0x1f04, "RCTL(RSFT(RALT(RGUI(KC_A))))", "Right Ctrl+Right Shift+Right Alt+Right Cmd+A"],
    ]) {
        assert.equal(resolve(value).name, name);
        assert.equal(resolve(value).label, label);
        assert.equal(encode(name), value);
    }
});

test("picker shortcuts and QMK modifier aliases encode identically to device readback", () => {
    for (const [forms, value] of [
        [["C(KC_N)", "LCTL(KC_N)"], 0x0111],
        [["S(KC_N)", "LSFT(KC_N)"], 0x0211],
        [["A(KC_N)", "LALT(KC_N)", "LOPT(KC_N)"], 0x0411],
        [["G(KC_N)", "LGUI(KC_N)", "LCMD(KC_N)", "LWIN(KC_N)"], 0x0811],
        [["ALGR(KC_N)", "ROPT(KC_N)", "RALT(KC_N)"], 0x1411],
        [["RCMD(KC_N)", "RWIN(KC_N)", "RGUI(KC_N)"], 0x1811],
        [["S(G(KC_N))", "LSG(KC_N)"], 0x0a11],
        [["C(A(G(KC_N)))", "LCAG(KC_N)"], 0x0d11],
        [["C(S(A(KC_N)))", "MEH(KC_N)"], 0x0711],
        [["C(S(A(G(KC_N))))", "HYPR(KC_N)"], 0x0f11],
        [["RCTL(RSFT(RGUI(KC_N)))", "RCSG(KC_N)"], 0x1b11],
    ]) {
        for (const form of forms) {
            assert.equal(encode(form), value, form);
            assert.equal(encode(resolve(encode(form)).name), value, form);
        }
    }
    assert.equal(resolve(encode("G(KC_N)")).label, "Cmd+N");
    for (const form of ["G(MO(1))", "G(LT(1,KC_N))", "G(MT(MOD_LCTL,KC_N))", "G(UNKNOWN)", "G(KC_N,KC_C)", "UNKNOWN(KC_N)"]) {
        assert.equal(encode(form), undefined, form);
    }
});

test("tap-hold and layer forms use their distinct QMK ranges", () => {
    assert.equal(resolve(0x2104).name, "MT(MOD_LCTL,KC_A)");
    assert.equal(resolve(0x3804).name, "MT(MOD_RGUI,KC_A)");
    assert.notEqual(resolve(0x6104).kind, "mod-tap");
    assert.equal(resolve(0x52a3).name, "OSM(MOD_LCTL|MOD_LSFT)");
    for (const [base, form] of [[0x5200, "TO"], [0x5220, "MO"], [0x5240, "DF"], [0x5260, "TG"], [0x5280, "OSL"], [0x52c0, "TT"], [0x52e0, "PDF"]]) {
        assert.equal(resolve(base + 3).name, `${form}(3)`);
        assert.equal(encode(`${form}(31)`), base + 31);
        assert.equal(encode(`${form}(32)`), undefined);
    }
    assert.equal(encode("MT(MOD_UNKNOWN,KC_A)"), undefined);
    assert.equal(encode("OSM(MOD_UNKNOWN)"), undefined);
    assert.deepEqual([resolve(0x5022).name, resolve(0x5022).kind, resolve(0x5022).layer], ["LM(1,MOD_LSFT)", "layer-mod", 1]);
    assert.equal(encode("LM(15, MOD_RSFT|MOD_RALT)"), 0x5000 | (15 << 5) | 0x16);
    for (const form of ["LM(16,MOD_LSFT)", "LM(1,MOD_UNKNOWN)", "LM(1,KC_A)"]) assert.equal(encode(form), undefined, form);
    assert.equal(encode("LGUI(MO(1))"), undefined);
});

test("every resolved uint16 can be written back without changing its value", () => {
    for (let value = 0; value <= 0xffff; value++) {
        const decoded = resolve(value);
        assert.equal(encode(decoded.name), value, `${value}: ${decoded.name}`);
    }
});


test("compact keycodes refuse mixed modifier sides without changing valid masks", () => {
    for (const expression of ["RSFT(C(KC_A))", "C(RSFT(KC_A))", "RALT(KC_EXLM)",
        "MT(MOD_LCTL|MOD_RSFT, KC_A)", "OSM(MOD_RSFT|MOD_LCTL)", "LM(1, MOD_LCTL|MOD_RSFT)"]) {
        assert.equal(encode(expression), undefined, expression);
    }
    assert.equal(encode("S(C(KC_A))"), 0x0304);
    assert.equal(encode("RSFT(RCTL(KC_A))"), 0x1304);
    assert.equal(encode("RSFT(KC_RALT)"), 0x12e6, "a basic modifier key can be the key itself");
    assert.equal(encode("MT(MOD_RCTL|MOD_RSFT, KC_A)"), 0x3304);
    assert.equal(encode("OSM(MOD_RCTL|MOD_RSFT)"), 0x52b3);
    assert.equal(encode("LM(1, MOD_RCTL|MOD_RSFT)"), 0x5033);
    assert.equal(encode("0x1304"), 0x1304, "stored numeric keycodes remain accepted");
});

test("QMK's other spellings encode to the keycode QMK compiles them to", () => {
    const {aliasTable} = require("../../core/data/keycode-catalog");
    const legacy = require("../../core/data/keycode-legacy");
    // Mod-tap shorthands are MT() with their modifiers.
    assert.equal(encode("LCTL_T(KC_A)"), encode("MT(MOD_LCTL, KC_A)"));
    assert.equal(encode("LCTL_T(KC_A)"), 0x2104);
    assert.equal(encode("SFT_T(KC_SPC)"), encode("MT(MOD_LSFT, KC_SPC)"));
    assert.equal(encode("RGUI_T(KC_ESC)"), 0x3829);
    assert.equal(encode("MEH_T(KC_F)"), 0x2709);
    assert.equal(encode("HYPR_T(KC_F)"), 0x2f09);
    assert.equal(encode("ALL_T(KC_F)"), encode("HYPR_T(KC_F)"));
    assert.equal(encode("SGUI_T(KC_F)"), encode("LSG_T(KC_F)"));
    // Deprecated wrappers are the wrapper they stand for.
    assert.equal(encode("SGUI(KC_4)"), encode("LSG(KC_4)"));
    assert.equal(encode("SCMD(KC_4)"), 0x0a21);
    assert.equal(encode("SAGR(KC_A)"), encode("RSA(KC_A)"));
    // Older names.
    for (let n = 1; n <= 8; n += 1) assert.equal(encode(`KC_BTN${n}`), encode(`MS_BTN${n}`), `KC_BTN${n}`);
    assert.equal(encode("KC_MS_U"), encode("MS_UP"));
    assert.equal(encode("KC_WH_D"), encode("MS_WHLD"));
    assert.equal(encode("RESET"), encode("QK_BOOT"));
    assert.equal(encode("KC_LCTRL"), encode("KC_LCTL"));
    assert.equal(encode("OS_LSFT"), encode("OSM(MOD_LSFT)"));
    assert.equal(encode("KC_HYPR"), 0x0f00);
    // Every legacy name names something.
    for (const [name, target] of Object.entries(legacy.NAMES)) assert.notEqual(encode(name), undefined, `${name} → ${target}`);
    // A tap may be named any way QMK names a plain key, and must be one.
    assert.equal(encode("LT(2, KC_LCTRL)"), 0x42e0);
    assert.equal(encode("LCTL_T(KC_BTN1)"), encode("MT(MOD_LCTL, MS_BTN1)"));
    assert.equal(encode("LCTL_T(QK_BOOT)"), undefined, "a quantum key is not a plain key");
    assert.equal(encode("LCTL_T(KC_EXLM)"), undefined, "a shifted symbol is not a plain key");
    assert.equal(encode("LCTL_T(S(KC_1))"), undefined);
    assert.equal(encode("LCTL_T(LT(1, KC_A))"), undefined);
    assert.equal(encode("UNKNOWN_T(KC_A)"), undefined);
    // The alias table canonicalises older names for the interface.
    assert.equal(aliasTable().KC_BTN1, aliasTable().MS_BTN1);
    assert.equal(aliasTable().RESET, "QK_BOOTLOADER");
});
