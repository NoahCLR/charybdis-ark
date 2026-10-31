"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {connectedService} = require("../fixtures/connected-service");
const {buildDeviceModel} = require("../../core/session/device-model");
const {baseRgbForView} = require("../../core/model/device-profile-view");

test("base RGB reads Profile Wire settings and preserves earlier errors across optional failure", async t => {
    const {document} = require("../fixtures/portable-profile");
    const {validateSnapshot} = require("../../core/model/portable-profile");
    const {editSettingsDomain} = require("../fixtures/profile-document");
    const doc = editSettingsDomain(document(), settings => {settings.values[21] = 1 | (1 << 8) | (32 << 16); settings.values[22] = (255 << 8) | (200 << 16);});
    const {service, adapter} = await connectedService(t, {document: doc});
    const keyboard = adapter.keyboard;
    let fail = false;
    adapter.keyboard = {...keyboard, answer(request) {
        if (!fail) return keyboard.answer(request);
        const response = Buffer.from(request); response[0] = 0xff; return [response];
    }};
    service.setError(Error("Earlier profile failure"));
    let state = await service.readBaseRgb();
    assert.equal(state.baseRgb.state, "read"); assert.equal(state.error.message, "Earlier profile failure");
    const model = buildDeviceModel({...state, settingsView: {brightnessMax: 200}});
    assert.equal(model.rgb.maximumBrightness, 200);
    assert.equal(model.rgb.baseEffect.brightness, 200);
    assert.equal(model.rgb.baseEffect.brightnessPercent, Math.round(200 * 100 / 255));
    assert.deepEqual(model.rgb.baseEffect.previewColor, {h: "0", s: "255", v: "200"});
    assert.ok(keyboard.requests.every(r => r[0] === 8 && r[1] === 0), "no VIA RGB reads");
    state.baseRgb.hue = 99; assert.equal(service.snapshot().baseRgb.hue, 0);
    fail = true; state = await service.readBaseRgb();
    assert.equal(state.baseRgb.state, "unavailable"); assert.equal(buildDeviceModel(state).rgb.baseEffect.previewColor, undefined);
    assert.equal(state.error.message, "Earlier profile failure");
    adapter.lastConnection().emitDisconnect(Error("Unplugged")); assert.equal(service.snapshot().baseRgb, null);
});

test("off, brightness zero, and unrecognised effects have distinct presentation", () => {
    const state = {state: "read", effectId: 1, brightness: 0, hue: 0, saturation: 255, speed: 0};
    assert.equal(baseRgbForView(state).enabled, true);
    assert.equal(baseRgbForView(state).previewColor.v, "0");
    const off = baseRgbForView({...state, effectId: 0});
    assert.equal(off.enabled, false);
    assert.equal(off.effectName, "Off");
    const unknown = baseRgbForView({...state, effectId: 42});
    assert.equal(unknown.effectName, "Effect 42");
    assert.equal(unknown.previewColor, undefined, "an effect's configured hue is not its rendered frame");
});

test("settings brightness is absolute and is never scaled by the keyboard limit", () => {
    const state = {state: "read", effectId: 1, brightness: 128, hue: 17, saturation: 240, speed: 0};
    for (const maximum of [0, 128, 200, 255, undefined]) assert.deepEqual(baseRgbForView(state, maximum).previewColor, {h: "17", s: "240", v: "128"});
});
