"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../upstream/firmware/tests/fixtures/pd_mode_domain_v1.json");
const {PD_DOMAIN, encodePdDomain, decodePdDomain, isPdTapKey, isPdMacro, pdTapProblem} = require("../../core/schema/pd-mode-domain-v1");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
// The firmware's eight-slot record fixture as the 32 slots the keyboard has:
// slot 6 disabled but named, so it keeps a record, and the rest empty. The
// first seven slots are the first seven records, at the offsets the frozen
// eight-slot envelope had them, less Arrow's mouse button overrides, which
// version 4 retired (firmware D-F22).
const slots = () => {
    const value = [...structuredClone(fixture.slots).map(({buttons: _retired, ...slot}) => slot), ...Array.from({length: 24}, (_, index) => ({id: index + 8, kind: 0, name: ""}))];
    value[6] = {id: 6, kind: 0, name: "Spare"};
    return value;
};
const bytes = () => encodePdDomain(slots());
const reject = (fn, code) => assert.throws(fn, error => error.code === code);

test("native PD, layer-lock and custom-key identities sit in their fixed blocks", () => {
    const {resolveNativeQmkExpression} = require("../../core/schema/compiled-profile-v1");
    const model = {layers: Array.from({length: 16}, (_, id) => ({id}))};
    for (let id = 0; id < 16; id++) {
        assert.equal(resolveNativeQmkExpression(`PD_MODE_${id}`, model), 0x7e80 + id);
        assert.equal(resolveNativeQmkExpression(`PD_MODE_${id}_LOCK`, model), 0x7ea0 + id);
        assert.equal(resolveNativeQmkExpression(`LOCK_LAYER(${id})`, model), 0x7ec0 + id);
    }
    assert.equal(resolveNativeQmkExpression("LOCK_LAYER(16)", model), undefined, "only sixteen layers have a lock");
    // Custom keys moved to their own block, 0x7f00 (D-F14).
    for (const id of [0, 3, 63, 64, 127]) assert.equal(resolveNativeQmkExpression(`CUSTOM_KEY_${id}`, model), 0x7f00 + id);
    assert.equal(resolveNativeQmkExpression("CUSTOM_KEY_128", model), undefined);
    assert.equal(resolveNativeQmkExpression("MACRO_0", model), 0x7700, "MACRO_n is a macro slot, no longer a retired user macro");
});

test("the fixture's slots encode as its records and preserve the full preset policies", () => {
    const encoded = encodePdDomain(slots()), frozen = Buffer.from(fixture.hex, "hex");
    assert.equal(encoded.length, 8 + 7 * 128, "six configured slots and one named one");
    // Each record is the frozen one, its name moved to the counted field and
    // its button records (52..69) cleared.
    for (let slot = 0; slot < 6; slot++) {
        const now = encoded.subarray(8 + slot * 128, 8 + (slot + 1) * 128), before = Buffer.from(frozen.subarray(8 + slot * 96, 8 + (slot + 1) * 96)).fill(0, 52, 70);
        assert.deepEqual([now.subarray(0, 8), now.subarray(32, 96)], [before.subarray(0, 8), before.subarray(32, 96)], `slot ${slot}`);
    }
    const decoded = decodePdDomain(encoded);
    assert.deepEqual(encodePdDomain(decoded), encoded);
    assert.equal(decoded[4].directions.up.mask, 0x44);
    assert.ok(frozen.subarray(8 + 4 * 96 + 52, 8 + 4 * 96 + 70).some(Boolean), "the fixture's Arrow had overrides");
    assert.equal(decoded[5].heldModifiers, 8);
    assert.equal(decoded[7].kind, 0);
    assert.deepEqual(decoded[6], {...decodePdDomain(encodePdDomain(slots().map(slot => slot.id === 6 ? {id: 6, kind: 0, name: ""} : slot)))[6], name: "Spare"});
});

test("slot seven accepts a custom media mode and byte-bounded Unicode names", () => {
    const value = slots();
    value[7] = {id: 7, kind: 1, axis: 2, name: "Édition ⌘", thresholdX: 40, thresholdY: 60,
        directions: {left: {keycode: 0xac}, right: {keycode: 0xab}, up: {keycode: 0xa9}, down: {keycode: 0xaa}}};
    assert.equal(decodePdDomain(encodePdDomain(value))[7].name, value[7].name);
    value[7].name = "x".repeat(32); encodePdDomain(value);
    value[7].name += "x"; reject(() => encodePdDomain(value), "INVALID_NAME");
    value[7].name = "é".repeat(16); encodePdDomain(value);
    for (const name of ["\ud800", "\u0000", "x\n", "é".repeat(17)]) {
        value[7].name = name; reject(() => encodePdDomain(value), "INVALID_NAME");
    }
});

test("PD decoder rejects malformed framing, hidden disabled state and noncanonical records", () => {
    reject(() => decodePdDomain(bytes().subarray(0, -1)), "INVALID_LENGTH");
    reject(() => decodePdDomain(Buffer.concat([bytes(), Buffer.from([0])])), "INVALID_LENGTH");
    for (const [offset, value, code] of [[0, 1, "INVALID_HEADER"], [1, 8, "INVALID_HEADER"], [8, 1, "INVALID_ID"],
        [15, 1, "RESERVED"], [98, 1, "RESERVED"], [24, 1, "RESERVED"], [17, 1, "RESERVED"], [8 + 6 * 128 + 4, 100, "INVALID_PARAMETER"],
        [8 + 96, 0xc0, "INVALID_NAME"], [8 + 127, 1, "INVALID_NAME"], [16, 33, "INVALID_NAME"], [9, 3, "INVALID_POLICY"],
        [8 + 4 * 128 + 52, 3, "RESERVED"], [8 + 6 * 128 + 14, 1, "INVALID_PARAMETER"], [8 + 6 * 128 + 12, 1, "INVALID_PARAMETER"]]) {
        const b = bytes(); b[offset] = value;
        reject(() => decodePdDomain(b), code);
    }
    const value = slots(); [value[6], value[7]] = [value[7], value[6]];
    reject(() => encodePdDomain(value), "INVALID_ID");
    const sparse = slots(); delete sparse[7]; reject(() => encodePdDomain(sparse), "INVALID_ARGUMENT");
    reject(() => encodePdDomain(slots().slice(0, 7)), "INVALID_LENGTH");
});

test("directional output vocabulary accepts macros and excludes controls, mouse movement and recursive mode actions", () => {
    for (const key of [4, 0xa4, 0xa5, 0xc2, 0x082e, 0x114f, 0x1f50, 0x7700, 0x777f, 0xd1, 0xd3, 0xd4, 0xd8]) assert.ok(isPdTapKey(key));
    for (const key of [0, 1, 3, 0xc3, 0xcd, 0xd0, 0xd9, 0xdf, 0xe0, 0xd1 + 0.5, 0x01d3, 0x11d1, 0x1004, 0x08aa, 0x2004, 0x5220, 0x7780, 0x7e80, 0x7e40, 0x7c00, -1, 65536, NaN]) assert.equal(isPdTapKey(key), false);
    for (const tap of [{keycode: 0x7e80}, {keycode: 0, mask: 1}, {keycode: 4, modifierPolicy: 1},
        {keycode: 4, modifierPolicy: 2, mask: 8}, {keycode: 4, modifierPolicy: 3}]) {
        const value = slots(); value[1].directions.up = tap;
        reject(() => encodePdDomain(value), "INVALID_ACTION");
    }
    const value = slots(); value[1].directions.left = {keycode: 4};
    reject(() => encodePdDomain(value), "INVALID_PARAMETER");
});

// Firmware D-F22: a tap may click a plain mouse button 1–8, and the record is
// unchanged.
test("mouse buttons 1–8 click from a direction and a diagonal under every modifier policy", () => {
    const value = slots();
    Object.assign(value[4], {axis: 3, thresholdX: 40, thresholdY: 40,
        directions: {up: {keycode: 0xd3}, down: {keycode: 0xd4, modifierPolicy: 1, mask: 2}, left: {keycode: 0xd1, modifierPolicy: 2}, right: {keycode: 0xd8}},
        diagonals: {upLeft: {keycode: 0xd2}, upRight: {keycode: 0xd5, modifierPolicy: 2}, downLeft: {keycode: 0}, downRight: {keycode: 0xd7, modifierPolicy: 1, mask: 0x10}}});
    const decoded = decodePdDomain(encodePdDomain(value));
    assert.deepEqual(decoded[4].directions.up, {keycode: 0xd3, modifierPolicy: 0, mask: 0});
    assert.deepEqual(decoded[4].directions.down, {keycode: 0xd4, modifierPolicy: 1, mask: 2});
    assert.deepEqual(decoded[4].diagonals.downRight, {keycode: 0xd7, modifierPolicy: 1, mask: 0x10});
    assert.deepEqual(encodePdDomain(decoded), encodePdDomain(value), "round trip");
    // The policies are unchanged: masking needs a mask, the others refuse one.
    for (const tap of [{keycode: 0xd3, modifierPolicy: 1}, {keycode: 0xd3, modifierPolicy: 2, mask: 1}, {keycode: 0xd3, modifierPolicy: 3},
        {keycode: 0xcd}, {keycode: 0xd0}, {keycode: 0xd9}, {keycode: 0xdf}, {keycode: 0x01d3}]) {
        const bad = slots(); bad[1].directions.up = tap;
        reject(() => encodePdDomain(bad), "INVALID_ACTION");
    }
});

test("a refused tap is explained by what it is", () => {
    for (const code of [4, 0xa5, 0x0204, 0xd3, 0x7700]) assert.equal(pdTapProblem(code), "", code.toString(16));
    for (const code of [0xcd, 0xd0, 0xd9, 0xdf]) assert.match(pdTapProblem(code), /not move the pointer, scroll or change mouse acceleration/);
    assert.match(pdTapProblem(0x01d3), /cannot carry modifiers/);
    assert.match(pdTapProblem(0x02ae), /Only keyboard keys take modifiers/);
    for (const code of [1, 0x7e80, 0x41d1, 0xe0]) assert.match(pdTapProblem(code), /not layer, pointing-mode or keyboard controls/);
    // Every keycode the problem accepts is one the record takes, and only those.
    for (let code = 1; code <= 0xffff; code++) assert.equal(pdTapProblem(code) === "", isPdTapKey(code), code.toString(16));
});

test("scroll validation rejects bad timing and ratios before they reach arithmetic", () => {
    for (const patch of [{divisorH: 0}, {thresholdV: 0}, {lockMs: 0}, {expireMs: 54}, {startDenominator: 0},
        {startNumerator: 1}, {sustainNumerator: 8}, {decayDivisor: 1}, {invert: 4}, {intervalMs: 65536}, {thresholdH: -1}]) {
        const value = slots(); Object.assign(value[0].scroll, patch);
        reject(() => encodePdDomain(value), "INVALID_PARAMETER");
    }
    const value = slots(); value[0].scroll.intervalMs = 0; value[0].scroll.expireMs = 55;
    encodePdDomain(value); // Inclusive expiry/lock equality and unthrottled wheel output.
    value[0].directions = {up: {keycode: 4}};
    reject(() => encodePdDomain(value), "INVALID_PARAMETER");
});

test("every directional mode stores how often it sends in byte 87; 88 and 89 stay reserved", () => {
    const {PD_DIRECTION_OUTPUT} = require("../../core/schema/pd-mode-domain-v1");
    const record = 8 + 4 * 128;  // Arrow, dominant axis
    for (const axis of [2, 3]) {
        const value = slots();
        Object.assign(value[4], {axis, directionOutput: PD_DIRECTION_OUTPUT.ONCE}, axis === 3 ? {thresholdX: 40, thresholdY: 40} : {});
        const encoded = encodePdDomain(value);
        assert.equal(encoded[record + 87], 1);
        assert.equal(decodePdDomain(encoded)[4].directionOutput, PD_DIRECTION_OUTPUT.ONCE);
        for (const [offset, byte, code] of [[87, 2, "INVALID_POLICY"], [88, 1, "RESERVED"], [89, 1, "RESERVED"]]) {
            const b = Buffer.from(encoded); b[record + offset] = byte;
            reject(() => decodePdDomain(b), code);
        }
    }
    assert.equal(decodePdDomain(bytes())[4].directionOutput, PD_DIRECTION_OUTPUT.REPEAT, "existing records send every step");
    assert.equal(decodePdDomain(bytes())[0].directionOutput, 0, "a scrolling record's byte 87 is its own");
    const value = slots(); value[4].directionOutput = 2;
    reject(() => encodePdDomain(value), "INVALID_POLICY");
});

test("a scrolling mode stores which axes it scrolls in byte 3", () => {
    const {PD_SCROLL_AXES} = require("../../core/schema/pd-mode-domain-v1");
    for (const axis of [PD_SCROLL_AXES.HORIZONTAL, PD_SCROLL_AXES.VERTICAL]) {
        const value = slots(); value[0].axis = axis;
        const encoded = encodePdDomain(value);
        assert.equal(encoded[8 + 3], axis);
        assert.equal(decodePdDomain(encoded)[0].axis, axis);
    }
    assert.equal(decodePdDomain(bytes())[0].axis, PD_SCROLL_AXES.BOTH, "existing scrolling modes scroll both axes");
    const value = slots(); value[0].axis = 3;
    reject(() => encodePdDomain(value), "INVALID_PARAMETER");
});

test("version 3's mouse button records are reserved zero in every slot", () => {
    for (let at = 52; at < 70; at++) {
        const b = bytes(); b[8 + 4 * 128 + at] = 1;
        assert.throws(() => decodePdDomain(b), error => error.code === "RESERVED" && error.offset === 8 + 4 * 128 + 52, `byte ${at}`);
    }
    // A slot has no button field to write them from.
    assert.equal(decodePdDomain(bytes())[4].buttons, undefined);
    const value = slots(); value[4].buttons = [{}, {}, {}];
    reject(() => encodePdDomain(value), "INVALID_ARGUMENT");
});

test("encoder rejects unknown fields and numeric coercion rather than silently dropping edits", () => {
    for (const patch of [{dpi: "400"}, {dpi: null}, {directions: null}, {buttons: null}, {scroll: null}, {thresholdY: 0.5}, {name: null}, {kind: NaN}, {dpi: Infinity}, {unknown: true}]) {
        const value = slots(); Object.assign(value[1], patch);
        assert.throws(() => encodePdDomain(value));
    }
});

test("a profile carries the PD domain only as version 4, and the retired payloads are refused", () => {
    const payload = bytes();
    assert.deepEqual(decodeProfileBlob(encodeProfileBlob({domains: [{id: PD_DOMAIN.ID, version: 4, payload}]})).domains[0].payload, payload);
    for (const version of [1, 2, 3]) reject(() => encodeProfileBlob({domains: [{id: PD_DOMAIN.ID, version, payload}]}), "UNKNOWN_DOMAIN_VERSION");
    const envelope = Buffer.from([0x4e, 0x4c, 0x50, 0x31, 4, 3, 1, 1, 0x50, 1, 8, 3, 0, 0]);
    reject(() => decodeProfileBlob(Buffer.concat([envelope, Buffer.from(fixture.hex, "hex")])), "UNKNOWN_DOMAIN_VERSION");
    assert.throws(() => decodePdDomain(Buffer.from(fixture.hex, "hex")), error => error.code === "INVALID_HEADER" && error.offset === 0);
});

test("macro records round trip every tap place, inherit only", () => {
    for (const keycode of [0x7700, 0x777f]) {
        assert.ok(isPdMacro(keycode));
        const modes = slots();
        modes[7] = {id: 7, kind: 1, name: "Macros", axis: 3, thresholdX: 40, thresholdY: 40,
            directions: {left: {keycode}}, diagonals: {upLeft: {keycode}}};
        const bytes = encodePdDomain(modes);
        assert.deepEqual(encodePdDomain(decodePdDomain(bytes)), bytes);
        for (const at of [36, 70]) for (const [policy, mask] of [[1, 2], [2, 0], [0, 2]]) {
            const bad = Buffer.from(bytes); bad[8 + 7 * 128 + at + 2] = policy; bad[8 + 7 * 128 + at + 3] = mask;
            reject(() => decodePdDomain(bad), "INVALID_ACTION");
        }
    }
    assert.equal(isPdMacro(0x76ff), false); assert.equal(isPdMacro(0x7780), false);
});
