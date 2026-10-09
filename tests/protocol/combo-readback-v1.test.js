"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {decodeComboPages, readDeviceCombos} = require("../../core/protocol/combo-readback-v1");
const {fixturePages, rehash, responseFor} = require("../fixtures/device-combos");
const decode = pages => decodeComboPages(pages[0], pages.slice(1));

test("the firmware fixture decodes native inputs, output and timing without a repository lookup", async () => {
    const pages = fixturePages();
    const requests = [];
    const actual = await readDeviceCombos({request: async (request, options) => {
        requests.push(request);
        assert.deepEqual([...request.subarray(0, 3)], [8, 0, 6]);
        assert.ok(request[3] && request.subarray(6).every(byte => byte === 0));
        const response = responseFor(request, pages);
        assert.equal(options.matchResponse(response, request), true);
        const stale = Buffer.from(response); stale[3]++;
        assert.equal(options.matchResponse(stale, request), false);
        return response;
    }});
    assert.deepEqual(actual.rows[0], {id: 0, inputs: [7, 0x4109], output: 0x2b, termMs: 50, followsDefault: true, mustHold: false, mustTap: false, ordered: false, enabled: true, allowedLayers: 0xffff});
    assert.equal(actual.version, 3);
    assert.equal(actual.defaultTermMs, 50);
    assert.equal(actual.holdTermMs, 200);
    assert.deepEqual(actual.rows[1].inputs, [0x0806, 0x0819]);
    assert.equal(actual.rows[1].output, 0x0804);
    assert.deepEqual(actual.layerReferences, Array.from({length: 16}, (_, layer) => layer));
    // Metadata, the reference page, two pages per row, then metadata again.
    assert.deepEqual(requests.map(request => request[4]), [0, 1, 2, 3, 4, 5, 0]);
    assert.equal(new Set(requests.map(request => request[3])).size, 7);
});

test("retired combo readback is rejected before rows are requested", async () => {
    for (const version of [1, 2]) {
        const pages = fixturePages(version);
        assert.throws(() => decode(pages), {code: "COMBO_INCOMPATIBLE"});
        const seen = [];
        await assert.rejects(readDeviceCombos({request: async request => {
            seen.push(request[4]); return responseFor(request, pages);
        }}), {code: "COMBO_INCOMPATIBLE"});
        assert.deepEqual(seen, [0]);
    }
});

test("sixteen inputs fill a row's two pages, and a disabled row keeps its layers", () => {
    const pages = fixturePages();
    const a = pages[2], b = pages[3];
    a[1] = 16;
    for (let input = 0; input < 16; input++) {
        const at = input < 7 ? [a, 11 + 2 * input] : [b, 2 * (input - 7)];
        at[0].writeUInt16LE(0x04 + input, at[1]);
    }
    a[6] |= 16; a.writeUInt32LE(0x8001, 7);
    const row = decode(rehash(pages)).rows[0];
    assert.deepEqual(row.inputs, Array.from({length: 16}, (_, input) => 0x04 + input));
    assert.equal(row.enabled, false);
    assert.equal(row.allowedLayers, 0x8001);
});

test("combo policy flags, callback output, timing zeros and a disabled empty table survive decoding", () => {
    const pages = fixturePages();
    pages[0][4] = 0; pages[0][5] = 63; pages[0].fill(0, 10, 14);
    // A fixed reference uses one layer throughout.
    pages[1].fill(3, 0, 16);
    pages[2].fill(0, 2, 6); pages[2][6] = 7; pages[4][6] &= ~8;
    const actual = decode(rehash(pages));
    assert.equal(actual.enabled, false);
    for (const key of ["noTimer", "strictTimer", "customTrigger", "customRelease", "customRepress", "fixedReference"]) assert.equal(actual[key], true);
    assert.deepEqual(actual.rows[0], {id: 0, inputs: [7, 0x4109], output: 0, termMs: 0, followsDefault: false, mustHold: true, mustTap: true, ordered: true, enabled: true, allowedLayers: 0xffff});
    pages[0][1] = 0;
    assert.deepEqual(decode(rehash(pages.slice(0, 2))).rows, []);
    // Firmware without combos reports no default and no threshold.
    const none = fixturePages(); none[0][1] = 0; none[0].fill(0, 10, 14);
    assert.equal(decode(rehash(none.slice(0, 2))).defaultTermMs, 0);
});

test("malformed limits, row shape, duplicates and reserved bytes are rejected before display", () => {
    for (const mutate of [
        pages => {pages[0][1] = 129;}, pages => {pages[0][2] = 15;}, pages => {pages[0][3] = 0;}, pages => {pages[0][3] = 17;},
        pages => {pages[0][4] = 2;}, pages => {pages[0][5] = 64;}, pages => {pages[0][14] = 1;},
        pages => {pages[0][15] = 1;}, pages => {pages[0][24] = 1;}, pages => {pages.pop();},
        pages => {pages[0][5] = 32;},
        pages => {pages[1][0] = 16;}, pages => {pages[1][16] = 1;},
        pages => {pages[2][0] = 1;}, pages => {pages[2][1] = 1;}, pages => {pages[2][1] = 17;},
        pages => {pages[2][6] = 32;}, pages => {pages[2].writeUInt32LE(0x10000, 7);}, pages => {pages[2][15] = 1;}, pages => {pages[3][24] = 1;}, pages => {pages[3][0] = 1;},
        pages => {pages[2][4] = 51;},
        pages => {pages[2].writeUInt16LE(7, 13);}, pages => {pages[2].writeUInt16LE(0, 11);},
    ]) {
        const pages = fixturePages(); mutate(pages);
        assert.throws(() => decode(rehash(pages)), {code: "COMBO_MALFORMED"});
    }
    const corrupt = fixturePages(); corrupt[2][2]++;
    assert.throws(() => decode(corrupt), {code: "COMBO_CORRUPT"});
    assert.throws(() => decodeComboPages(Buffer.alloc(24), []), {code: "COMBO_MALFORMED"});
    const version = fixturePages(); version[0][0] = 4;
    assert.throws(() => decode(version), {code: "COMBO_INCOMPATIBLE"});
});

test("older firmware is explicitly unsupported and changing readout has a bounded retry", async () => {
    // QMK's unhandled reply echoes the request with byte 0 set to 0xFF; a stray
    // 0xFF report that is not an echo of this request is not an answer to it.
    await assert.rejects(readDeviceCombos({request: async (request) => Object.assign(Buffer.from(request), {0: 0xff})}), {code: "COMBO_UNSUPPORTED"});
    await assert.rejects(readDeviceCombos({request: async (request, options) => {
        assert.equal(options.matchResponse(Buffer.alloc(32, 0xff), request), false, "a foreign 0xFF report is ignored");
        return Object.assign(Buffer.from(request), {0: 0xff});
    }}), {code: "COMBO_UNSUPPORTED"});
    let calls = 0;
    const pages = fixturePages();
    const once = {request: async request => {
        calls++;
        const response = responseFor(request, pages);
        if (calls === 7) response[13] = 0;
        return response;
    }};
    assert.equal((await readDeviceCombos(once)).rows.length, 2);
    assert.equal(calls, 14);
    calls = 0;
    await assert.rejects(readDeviceCombos({request: async request => {
        calls++;
        const response = responseFor(request, pages);
        if (calls % 7 === 0) response[13] = 0;
        return response;
    }}), {code: "COMBO_CHANGED"});
    assert.equal(calls, 14);
});
