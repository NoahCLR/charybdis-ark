"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {checkRestorable} = require("../../core/session/restore-checks");
const {baseLighting} = require("../../core/model/settings-editor");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {compiled, document, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");

test("a restore says what the keyboard would refuse before anything is sent", () => {
    const profile = document();
    const {brightness, effect} = baseLighting(validateSnapshot(profile).settings.values);
    const accepts = {limits: {brightnessMax: brightness}, options: {effects: [{id: effect}]}};
    assert.equal(checkRestorable(profile, accepts, CURRENT_CAPABILITIES), undefined, "a profile the keyboard takes");
    assert.equal(checkRestorable(profile, {}, CURRENT_CAPABILITIES), undefined, "limits and effects the keyboard did not report check nothing");
    assert.throws(() => checkRestorable(profile, {...accepts, limits: {brightnessMax: brightness - 1}}, CURRENT_CAPABILITIES),
        {code: "SETTINGS_LIMIT_EXCEEDED", message: `This profile's brightness exceeds the keyboard's reported limit of ${brightness - 1}. Lower the brightness before restoring it.`});
    assert.throws(() => checkRestorable(profile, {...accepts, options: {effects: [{id: effect + 1}]}}, CURRENT_CAPABILITIES),
        {code: "SETTINGS_LIMIT_EXCEEDED", message: "This profile uses a lighting effect unavailable on this keyboard."});
    // DF(1) is a layer keycode the keyboard does not run; a combo cannot send it.
    const misplaced = compiled({combos: [{id: 0, inputs: [4, 5], output: 0x5241, termMs: 50, followsDefault: true, mustHold: false, mustTap: false, ordered: false}]});
    assert.throws(() => checkRestorable(misplaced, accepts, CURRENT_CAPABILITIES), {code: "PLACEMENT_REFUSED", message: /^C0: .* Fix it before saving this profile\.$/});
});

test("a profile the keyboard cannot take at all is refused before its lighting is looked at", () => {
    const refusesAll = {limits: {brightnessMax: 0}, options: {effects: []}};
    assert.throws(() => checkRestorable({...document(), profile: "AAAA"}, refusesAll, CURRENT_CAPABILITIES),
        {code: "INVALID_PORTABLE_PROFILE", message: "The profile in this file is damaged, so Ark cannot read it."});
    assert.throws(() => checkRestorable({...document(), actionAbiDigest: "00"}, refusesAll, CURRENT_CAPABILITIES), {code: "INVALID_PORTABLE_PROFILE"});
});

test("a limit the keyboard did not report is not checked, and without its capabilities every layer of the layout may be reached", () => {
    const profile = document();
    const {effect} = baseLighting(validateSnapshot(profile).settings.values);
    assert.equal(checkRestorable(profile, {limits: {}, options: {effects: [{id: effect}]}}, CURRENT_CAPABILITIES), undefined, "no brightness limit reported");
    // MO(10): a layer key a combo may send, on a layer the layout has.
    const layerTen = compiled({combos: [{id: 0, inputs: [4, 5], output: 0x522a, termMs: 50, followsDefault: true, mustHold: false, mustTap: false, ordered: false}]});
    assert.equal(checkRestorable(layerTen, {}, undefined), undefined);
    assert.equal(checkRestorable(layerTen, {}, CURRENT_CAPABILITIES), undefined);
    const misplaced = compiled({combos: [{id: 0, inputs: [4, 5], output: 0x5241, termMs: 50, followsDefault: true, mustHold: false, mustTap: false, ordered: false}]});
    assert.throws(() => checkRestorable(misplaced, {}, undefined), {code: "PLACEMENT_REFUSED"}, "placement is checked without capabilities too");
});
