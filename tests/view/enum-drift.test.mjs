// The webview keeps a few wire numbers of its own — pointing kinds, axes,
// what ends a link's mode, modifier bits, edit modes — because its pure modules need them at import
// time and it may not import core/. They are the keyboard's numbers, so they
// are pinned here to the schema that defines them: a change there fails here,
// not on a keyboard.

import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {AXIS, DIAGONALS, DIRECTIONS, KIND, LINK_ENDS, MODIFIER_POLICY, SCROLL_AXES, tapPlaceWord} from "../../webview/view/pointing-config.mjs";
import {modifierBits, modifierNames} from "../../webview/view/keyvalues.mjs";
import {TIER_FIELDS, TIERS} from "../../webview/view/edits.mjs";
import {APPLY, EDIT_MODE, LIVE, LIVE_REVIEW} from "../../webview/view/edit-mode.mjs";
import {POINTING_MODE_IDS} from "../../webview/view/lighting.mjs";
import {NAME_MAX_BYTES} from "../../webview/view/names.mjs";

const require = createRequire(import.meta.url);
const pd = require("../../core/schema/pd-mode-domain-v1");
const {VOCABULARY} = require("../../core/model/vocabulary");
const {RGB_POINTING_MODE_IDS} = require("../../core/schema/rgb-domain-v1");
const {POINTING_SLOT_COUNT} = require("../../core/data/pd-mode-keys");

test("the webview's pointing numbers are the schema's", () => {
    assert.deepEqual(KIND, {DIRECTIONAL: pd.PD_KIND.DIRECTIONAL, SCROLLING: pd.PD_KIND.SCROLLING});
    assert.deepEqual(AXIS, {VERTICAL: pd.PD_AXIS.VERTICAL, HORIZONTAL: pd.PD_AXIS.HORIZONTAL, DOMINANT: pd.PD_AXIS.DOMINANT, EIGHT: pd.PD_AXIS.EIGHT});
    assert.deepEqual(SCROLL_AXES, {...pd.PD_SCROLL_AXES});
    assert.deepEqual(MODIFIER_POLICY, {...pd.PD_MODIFIERS});
    assert.deepEqual(LINK_ENDS, {...pd.PD_LINK_ENDS});
});

test("the webview's shortcut places are the record's, named in the vocabulary's words", () => {
    assert.deepEqual([...DIRECTIONS].sort(), [...pd.DIRECTIONS].sort());
    assert.deepEqual([...DIAGONALS].sort(), [...pd.DIAGONALS].sort());
    const model = {vocabulary: VOCABULARY};
    assert.deepEqual(DIRECTIONS.map((name) => tapPlaceWord(model, "directions", name)), ["Up", "Left", "Right", "Down"], "in the order the editor draws them");
    assert.deepEqual(DIAGONALS.map((name) => tapPlaceWord(model, "diagonals", name)), ["Up-left", "Up-right", "Down-left", "Down-right"]);
});

test("the webview's name limit is the schema's", () => {
    assert.equal(NAME_MAX_BYTES, require("../../core/schema/profile-name").NAME_MAX_BYTES);
});

test("the webview's modifier bits and names are the vocabulary's", () => {
    const model = {vocabulary: VOCABULARY};
    assert.equal(modifierBits(model), VOCABULARY.modifiers);
    assert.deepEqual(modifierNames(model, 0x84), ["Left Alt", "Right GUI"]);
});

test("the webview's tiers are the vocabulary's", () => {
    assert.deepEqual(Object.keys(TIER_FIELDS).sort(), Object.keys(VOCABULARY.tiers).sort());
    assert.deepEqual(TIERS, Object.keys(VOCABULARY.tiers), "in the grid's order");
    assert.deepEqual(TIER_FIELDS, {...require("../../core/schema/key-behavior-domain-v1").KEY_BEHAVIOR_TIER_FIELDS}, "each stored in the schema's field");
});

test("the webview's edit modes are the keyboard's", () => {
    assert.deepEqual(EDIT_MODE, {...require("../../core/protocol/profile-edit-v1").EDIT_MODE});
    assert.deepEqual([APPLY, LIVE, LIVE_REVIEW], [EDIT_MODE.APPLY, EDIT_MODE.LIVE, EDIT_MODE.LIVE_REVIEW]);
});

test("the webview names every pointing slot's lighting row as the RGB schema does", () => {
    assert.equal(POINTING_MODE_IDS.length, POINTING_SLOT_COUNT);
    assert.deepEqual(POINTING_MODE_IDS.map((name) => RGB_POINTING_MODE_IDS[name]), POINTING_MODE_IDS.map((_, id) => id));
    assert.equal(Object.keys(RGB_POINTING_MODE_IDS).length, POINTING_SLOT_COUNT);
});

test("pointing macro identities follow the schema's complete native range", async () => {
    const {macroIndex} = await import("../../webview/view/keyvalues.mjs");
    const {isPdMacro} = require("../../core/schema/pd-mode-domain-v1");
    for (let code = 0; code <= 0xffff; code++) assert.equal(macroIndex(code) !== null, isPdMacro(code), code.toString(16));
});
