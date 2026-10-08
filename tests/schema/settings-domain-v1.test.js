"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {SETTINGS, encodeSettings, decodeSettings} = require("../../core/schema/settings-domain-v1");
const defaults = () => ({values: [200,150,400,150,1,4,1200,25,1,3,0,0,0,0,0,200,400,900000,1200,200,1,257,0xc8ff00,1,0,200,10,0x76543210],
    names: Array.from({length: 8}, (_, id) => `Layer ${id}`), macroNames: Array(64).fill(""), customKeyNames: Array(64).fill(""), formatVersion: 5});
const full = () => ({...defaults(), macroNames: Array.from({length: 64}, (_, i) => `${i}`.padEnd(20, "~")), customKeyNames: Array.from({length: 64}, (_, i) => `Key ${i}`.padEnd(20, "!"))});

test("settings v5 round-trip Unicode layer names, zero settings and every name", () => {
    const value = defaults(); value.names[1] = "Édition ⌘"; value.macroNames[3] = "Sign-off"; value.customKeyNames[63] = "Last key";
    const bytes = encodeSettings(value);
    assert.deepEqual([...bytes.subarray(0, 8)], [5, 8, 28, 64, 64, 0, 0, 0]);
    assert.equal(bytes.length, SETTINGS.FIXED_SIZE + 128 + "Sign-off".length + "Last key".length);
    assert.deepEqual(decodeSettings(bytes), value);
});

test("settings reject invalid durations, names, padding and the retired pointing DPI", () => {
    const value = defaults(); value.values[16] = 1200; assert.throws(() => encodeSettings(value), /settings/);
    const bytes = encodeSettings(defaults()); bytes[143] = 1; assert.throws(() => decodeSettings(bytes), /padding/);
    const dpi = defaults(); dpi.values[10] = 100; assert.throws(() => encodeSettings(dpi), /retired PD settings/);
});

test("all 64 macro and 64 custom-key names fit at 20 plain characters", () => {
    const bytes = encodeSettings(full());
    assert.equal(bytes.length, SETTINGS.MAX_SIZE);
    assert.deepEqual(decodeSettings(bytes), full());
    for (const name of ["é", "x".repeat(21), "tab\t"]) {
        assert.throws(() => encodeSettings({...full(), macroNames: full().macroNames.map((n, i) => i ? n : name)}), /macro name/);
        assert.throws(() => encodeSettings({...full(), customKeyNames: full().customKeyNames.map((n, i) => i ? n : name)}), /custom key name/);
    }
    assert.throws(() => encodeSettings({...full(), customKeyNames: full().customKeyNames.slice(1)}), /custom key names/);
    assert.throws(() => encodeSettings({...full(), macroNames: undefined}), /macro names/);
    const highByte = Buffer.from(encodeSettings({...defaults(), macroNames: defaults().macroNames.map((n, i) => i ? n : "x")}));
    highByte[SETTINGS.FIXED_SIZE + 1] = 0xe9;
    assert.throws(() => decodeSettings(highByte), /name encoding/);
});

test("only version 5 is read or written: the retired versions are refused", () => {
    assert.throws(() => encodeSettings({...defaults(), formatVersion: 4}), /Unsupported settings format/);
    const bytes = encodeSettings(defaults());
    for (const header of [[4, 8, 28, 64, 0], [3, 8, 28, 64, 0], [2, 8, 28, 16, 0], [1, 8, 28, 16, 0], [5, 8, 28, 64, 0]]) {
        const relabelled = Buffer.from(bytes); relabelled.set(header);
        assert.throws(() => decodeSettings(relabelled), /Unsupported settings format/, header.join());
    }
    assert.throws(() => decodeSettings(Buffer.concat([bytes, Buffer.from([0])])), /Unexpected settings data/);
});
