// The webview keeps its own copy of QMK's keycode layout (core/data/
// qmk-keycodes.js) and of the keyboard's layer-lock block, because it may not
// import core/. They are the keyboard's numbers and spellings, so they are
// pinned here: a change in core fails here, not on a keyboard.

import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import * as view from "../../webview/view/keycode-expression.mjs";
import {canonicalKeycode, visibleKeycode} from "../../webview/view/keyface.mjs";
import {compactModifierMask, keyName} from "../../webview/view/keyvalues.mjs";

const require = createRequire(import.meta.url);
const qmk = require("../../core/data/qmk-keycodes");
const userKeycodes = require("../../core/data/user-keycodes");
const catalog = require("../../core/data/keycode-catalog");

const model = {
    qmkKeycodes: catalog.entries().map((entry) => ({value: entry.name, keycode: entry.value, aliases: entry.aliases})),
    qmkKeycodeAliases: catalog.aliasTable(),
};

test("the webview's keycode blocks are core's", () => {
    for (const [name, block] of Object.entries(view.QK)) assert.deepEqual(block, qmk.QK[name], name);
    assert.deepEqual(Object.entries(view.LAYER_FORMS), Object.entries(qmk.LAYER_FORMS));
    assert.deepEqual([view.LAYER_LOCK_BASE, view.LAYER_LOCKS], [userKeycodes.LAYER_LOCK_BASE, userKeycodes.LAYER_LOCK_SLOTS]);
});

// In order too: the first spelling for a set of modifiers is the one the
// webview writes.
test("the webview's modifier bits and wrapper spellings are core's, in core's order", () => {
    assert.deepEqual(Object.entries(view.MODS), Object.entries(qmk.MODS));
    assert.equal(view.MOD_RIGHT, qmk.MOD_RIGHT);
    assert.deepEqual(Object.entries(view.MODIFIER_WRAPPERS), Object.entries(qmk.MODIFIER_WRAPPERS));
    for (const mods of Object.values(qmk.MODS)) assert.equal(view.wrapperOf(mods), qmk.wrapperOf(mods));
});

// A behaviour row is keyed by the name the keyboard reads back, one long
// wrapper per modifier (RCTL(RSFT(KC_A))); a picked expression finds that row
// however it is spelled.
test("every wrapper spelling reads as the keycode the keyboard reads back", () => {
    for (const wrapper of Object.keys(qmk.MODIFIER_WRAPPERS)) {
        const expression = `${wrapper}(KC_A)`;
        const readBack = catalog.resolve(/** @type {number} */ (catalog.encode(expression))).name;
        assert.equal(canonicalKeycode(model, expression), canonicalKeycode(model, readBack), expression);
        assert.equal(view.keycodeValue(model, expression), catalog.encode(expression), expression);
    }
});

test("a stored modified key is named with wrappers core encodes back to it", () => {
    for (let code = qmk.QK.MODS.first; code <= qmk.QK.MODS.last; code++) {
        // The side flag alone holds no modifier: no pointing tap stores it.
        const name = keyName(model, code);
        if (name.startsWith("0x") || !(qmk.modsOf(code) & 0x0f)) continue;
        assert.equal(catalog.encode(name), code, name);
        const mods = qmk.modsOf(code);
        assert.equal(compactModifierMask(code), mods & qmk.MOD_RIGHT ? (mods & 0x0f) << 4 : mods & 0x0f);
    }
});

test("every macro slot in QMK's macro block reads by its macro name", () => {
    const slots = qmk.QK.MACRO.last - qmk.QK.MACRO.first + 1;
    for (let slot = 0; slot < slots; slot++) {
        const stored = catalog.resolve(qmk.QK.MACRO.first + slot).name;
        assert.equal(visibleKeycode({qmkKeycodeAliases: {[stored]: `MACRO_${slot}`}}, stored), `MACRO_${slot}`, stored);
        assert.equal(view.macroOfName(`MACRO_${slot}`), slot);
    }
    assert.equal(view.macroOfName(`MACRO_${slots}`), undefined);
});
