"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {hostSettings, supportsHostLayouts, MACOS_ISO, HOST_LAYOUT_FEATURE} = require("../../core/schema/host-settings");
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

test("the host layout and ISO bits are validated against the catalogue", () => {
    for (let layout = 0; layout < 15; layout++) assert(validSetting(27, 1 | 0x100 | MACOS_ISO | (layout << 16)));
    for (const invalid of [15 << 16, 0xff0000, 0x2000000, 0x8000]) assert.equal(validSetting(27, invalid), false);
    assert.equal(supportsHostLayouts({featureFlags: HOST_LAYOUT_FEATURE}), true);
    assert.equal(supportsHostLayouts({featureFlags: 1 << 21}), false);
});

test("Unicode entry follows the layout: on macOS only Unicode Hex Input, or US with the switch", () => {
    const host = (os, layout, enabled, detected = 0) => hostSettings(Object.assign([], {27: os | (layout << 16) | (enabled ? 0x100 : 0)}), detected);
    assert.equal(host(1, 3, false).unicodeMode, 1, "Unicode Hex Input needs no switch");
    assert.equal(host(1, 0, true).unicodeMode, 1, "US with the switch keeps hex entry");
    assert.equal(host(1, 2, true).unicodeMode, 0, "Dutch's Option keys type characters");
    assert.equal(host(2, 9, true).unicodeMode, 2);
    assert.equal(host(3, 13, false).unicodeMode, 0);
    assert.equal(host(0, 9, true).unicodeMode, 0, "an unknown OS has no entry method");
    assert.equal(host(0, 9, true, 2).unicodeMode, 2);
    assert.deepEqual([host(1, 5, false).layout, hostSettings(Object.assign([], {27: MACOS_ISO})).macosIso], [5, true]);
});
