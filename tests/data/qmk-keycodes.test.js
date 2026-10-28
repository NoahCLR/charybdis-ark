"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const qmk = require("../../core/data/qmk-keycodes");
const legacy = require("../../core/data/keycode-legacy");

// The blocks QMK's keycode definitions declare, the later versions over the
// earlier, as {QK_NAME: [first, last]}.
function declaredBlocks() {
    const dir = path.join(__dirname, "../../upstream/qmk/data/constants/keycodes");
    const version = (/** @type {string} */ name) => name.match(/(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number) ?? [];
    const files = fs.readdirSync(dir).filter(name => /^keycodes_\d+\.\d+\.\d+\.hjson$/.test(name))
        .sort((a, b) => version(a).reduce((order, part, i) => order || part - version(b)[i], 0));
    /** @type {Record<string, [number, number]>} */
    const blocks = {};
    for (const file of files) {
        const text = fs.readFileSync(path.join(dir, file), "utf8");
        for (const [, first, size, name] of text.matchAll(/"0x([0-9A-F]+)\/0x([0-9A-F]+)":\s*\{\s*"define":\s*"(QK_\w+)"/g)) {
            blocks[name] = [parseInt(first, 16), parseInt(first, 16) + parseInt(size, 16)];
        }
    }
    return blocks;
}

test("every block is where QMK's keycode definitions put it", () => {
    const declared = declaredBlocks();
    for (const [name, block] of Object.entries(qmk.QK)) {
        assert.deepEqual([block.first, block.last], declared[`QK_${name}`], name);
    }
});

test("each layer form is its block's base, its layer in the low five bits", () => {
    assert.deepEqual({...qmk.LAYER_FORMS}, {TO: 0x5200, MO: 0x5220, DF: 0x5240, TG: 0x5260, OSL: 0x5280, TT: 0x52c0, PDF: 0x52e0});
    for (const base of Object.values(qmk.LAYER_FORMS)) {
        assert.equal(qmk.layerFormBase(base + 31), base);
        assert.equal(qmk.layerFormLayer(base + 31), 31);
    }
});

test("the packed forms put their arguments where QMK does", () => {
    assert.equal(qmk.layerTap(3, 0x04), 0x4304);
    assert.equal(qmk.layerTapLayer(0x4f04), 15);
    assert.equal(qmk.withLayerTapLayer(0x4304, 9), 0x4904);
    assert.equal(qmk.layerMod(2, qmk.MODS.LSFT), 0x5042);
    assert.equal(qmk.layerModLayer(0x5042), 2);
    assert.equal(qmk.withLayerModLayer(0x5042, 15), 0x51e2);
    assert.equal(qmk.modTap(qmk.MODS.RCTL, 0x04), 0x3104);
    assert.equal(qmk.modified(qmk.MODS.LSFT, 0x1e), 0x021e);
    assert.equal(qmk.modsOf(0x3104), 0x11);
    assert.equal(qmk.keyOf(0x3104), 0x04);
    assert.equal(qmk.oneShotMod(qmk.MODS.RSFT), 0x52b2);
});

test("a compact keycode keeps its modifiers on one side", () => {
    assert.equal(qmk.combineModifiers(qmk.MODS.LCTL, qmk.MODS.LSFT), 0x03);
    assert.equal(qmk.combineModifiers(qmk.MODS.RCTL, qmk.MODS.RSFT), 0x13);
    assert.equal(qmk.combineModifiers(qmk.MODS.LCTL, qmk.MODS.RSFT), undefined);
    assert.equal(qmk.combineModifiers(0, qmk.MODS.RGUI), 0x18);
});

// The wrapper table is checked against the mod-tap shorthands, written out
// separately as MOD_ names: LCSG_T holds what LCSG wraps.
test("every wrapper adds the modifiers its mod-tap shorthand holds", () => {
    let checked = 0;
    for (const [wrapper, mods] of Object.entries(qmk.MODIFIER_WRAPPERS)) {
        const shorthand = legacy.MOD_TAP_SHORTHANDS[`${wrapper}_T`];
        if (shorthand === undefined) continue;
        const bits = shorthand.split("|").reduce((all, name) => all | qmk.MODS[/** @type {keyof typeof qmk.MODS} */ (name.replace(/^MOD_/, ""))], 0);
        assert.equal(mods, bits, wrapper);
        checked++;
    }
    assert.ok(checked >= 30, `${checked} wrappers checked`);
    for (const name of Object.keys(legacy.WRAPPER_ALIASES)) assert.equal(qmk.MODIFIER_WRAPPERS[name], undefined, `${name} is a deprecated alias`);
});

test("the picker's spelling of each single modifier is its first", () => {
    assert.deepEqual(Object.values(qmk.MODS).map(qmk.wrapperOf), ["C", "S", "A", "G", "RCTL", "RSFT", "RALT", "RGUI"]);
    assert.equal(qmk.wrapperOf(qmk.MODS.LCTL | qmk.MODS.LSFT), "LCS");
    assert.equal(qmk.wrapperOf(0x10), undefined);
});
