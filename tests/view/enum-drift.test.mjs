// The webview keeps a few wire numbers of its own — pointing kinds, axes,
// what ends a link's mode, modifier bits, limits — because its pure modules need them at import
// time and it may not import core/. They are the keyboard's numbers, so they
// are pinned here to the schema that defines them: a change there fails here,
// not on a keyboard.

import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {AXIS, KIND, LINK_ENDS, MODIFIER_POLICY, SCROLL_AXES} from "../../webview/view/pointing-config.mjs";
import {modifierBits, modifierNames} from "../../webview/view/keyvalues.mjs";
import {TIER_FIELDS} from "../../webview/view/edits.mjs";
import {POINTING_MODE_IDS} from "../../webview/view/lighting.mjs";
import {NAME_MAX_BYTES} from "../../webview/view/names.mjs";
import {LED_FLAGS} from "../../webview/view/lighting.mjs";
import {MAX_DELAY, MAX_KEYS} from "../../webview/view/macro.mjs";
import {TAPPING_TOGGLE} from "../../webview/view/custom-key.mjs";
import {ALL_LAYERS} from "../../webview/view/participation.mjs";
import {PROFILE_FILE_MAX_BYTES, PROFILE_FILE_TOO_LARGE} from "../../webview/view/backups.mjs";

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

test("the webview's macro limits are the macro schema's", () => {
    const {MACRO_LIMITS} = require("../../core/schema/macro-payload");
    assert.deepEqual({MAX_DELAY, MAX_KEYS}, {MAX_DELAY: MACRO_LIMITS.maxDelayMs, MAX_KEYS: MACRO_LIMITS.maxHeldKeys});
});

test("the webview's LED classes are the settings schema's", () => {
    const core = require("../../core/schema/settings-domain-v1").LED_FLAGS;
    assert.deepEqual(LED_FLAGS, {ALL: core.ALL, MODIFIER: core.MODIFIER, KEY: core.KEY});
});

test("the webview's every-layer set is the layer bank's", () => {
    assert.equal(ALL_LAYERS, require("../../core/data/charybdis-layout").ALL_LAYERS);
});

test("the webview's tap-toggle count is the one layer reach walks", () => {
    assert.equal(TAPPING_TOGGLE, require("../../core/model/layer-reach").TAPPING_TOGGLE);
});

test("the webview refuses a profile file over core's limit in core's words", () => {
    const {FILE_MAX_BYTES, FILE_TOO_LARGE} = require("../../core/model/portable-profile");
    assert.deepEqual([PROFILE_FILE_MAX_BYTES, PROFILE_FILE_TOO_LARGE], [FILE_MAX_BYTES, FILE_TOO_LARGE]);
});
