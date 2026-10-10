"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {hostSettings} = require("../../core/schema/host-settings");
const {validSetting} = require("../../core/schema/settings-domain-v1");
test("host override and Unicode enablement are independent and unknown never guesses", () => {
    for (const selected of [0,1,2,3]) for (const detected of [0,1,2,3]) for (const enabled of [false,true]) {
        const values = []; values[27] = selected | (enabled ? 0x100 : 0);
        assert(validSetting(27, values[27]));
        const host = hostSettings(values, detected);
        assert.equal(host.effective, selected || detected);
        assert.equal(host.unicodeMode, enabled ? selected || detected : 0);
    }
    assert.equal(hostSettings([], 99).effective, 0);
    for (const reserved of [4,128,512,0xffffffff]) assert.equal(validSetting(27, reserved), false);
});
