"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
    CHARYBDIS_4X6_LAYOUT_MATRIX,
    VIA_LAYOUT_COMMANDS,
    buildViaGetKeycodeRequest,
    decodeViaGetKeycodeResponse,
    readViaLayout,
} = require("../../core/protocol/via-layout-v1");

test("layout matrix stays identical to the pinned QMK keyboard contract", () => {
    const keyboardJsonPath = path.resolve(
        __dirname,
        "../../upstream/qmk/keyboards/bastardkb/charybdis/4x6/keyboard.json"
    );
    const keyboard = JSON.parse(fs.readFileSync(keyboardJsonPath, "utf8"));
    assert.deepEqual(
        CHARYBDIS_4X6_LAYOUT_MATRIX.map((entry) => Array.from(entry)),
        keyboard.layouts.LAYOUT.layout.map((entry) => entry.matrix)
    );
});

test("bulk layout reads preserve every visible coordinate in 69 requests", async () => {
    const bytes = Buffer.alloc(16 * 10 * 6 * 2);
    for (let layer = 0; layer < 16; layer++) for (let row = 0; row < 10; row++) for (let column = 0; column < 6; column++) {
        bytes.writeUInt16BE((layer << 12) | (row << 4) | column, ((layer * 10 + row) * 6 + column) * 2);
    }
    const requests = [], progress = [];
    const device = {request: async request => {
        assert.equal(request[0], 0x12, "only existing VIA buffer reads");
        requests.push(Buffer.from(request));
        const response = Buffer.from(request), offset = request.readUInt16BE(1);
        bytes.copy(response, 4, offset, offset + request[3]); return response;
    }};
    const layers = await readViaLayout(device, {layerCount: 16, onProgress: value => progress.push(value)});
    assert.equal(requests.length, 69);
    assert.deepEqual(layers, await readViaLayout(layoutDevice(), {layerCount: 16}));
    assert.deepEqual(progress.at(-1), {done: 896, total: 896, layer: 15});
    assert.ok(progress.every((value, index) => !index || value.done >= progress[index - 1].done));
    const unused = new Set(layers.flatMap(({layer, positions}) => positions.map(({row, column}) => ((layer * 10 + row) * 6 + column) * 2)));
    assert.equal(unused.size, 896, "unused matrix coordinates do not become visible keys");
});

test("bulk reads reject invalid layer counts and malformed echoes", async () => {
    for (const layerCount of [0, 17, 1.5, undefined, "16"]) {
        await assert.rejects(readViaLayout({request: async () => {throw Error("must not read");}}, {layerCount}), /layerCount/);
    }
    await assert.rejects(readViaLayout({request: async request => {
        const response = Buffer.from(request); response[2]++; return response;
    }}, {layerCount: 16}), /chunk/);
});

test("encodes and decodes standard VIA keycode reads", () => {
    const entry = {layer: 2, row: 7, column: 4, keycode: 0x4005};
    const get = buildViaGetKeycodeRequest(entry);
    assert.deepEqual(Array.from(get.subarray(0, 6)), [0x04, 2, 7, 4, 0, 0]);
    const response = Buffer.from(get);
    response[4] = 0x40;
    response[5] = 0x05;
    assert.equal(decodeViaGetKeycodeResponse(response, get), 0x4005);
});

// A keyboard that answers buffer reads with values derived from their
// coordinates, so a wrong layer or position is visible in the result.
function layoutDevice() {
    const reads = [];
    return {
        reads,
        async request(request) {
            assert.equal(request[0], 0x12);
            reads.push(Buffer.from(request));
            const response = Buffer.from(request);
            const offset = request.readUInt16BE(1);
            for (let index = 0; index < request[3]; index += 2) {
                const position = (offset + index) / 2;
                const layer = Math.floor(position / 60), row = Math.floor(position % 60 / 6), column = position % 6;
                response.writeUInt16BE((layer << 12) | (row << 4) | column, 4 + index);
            }
            return response;
        },
    };
}

test("reads every position of every layer from the device", async () => {
    const device = layoutDevice();
    const layers = await readViaLayout(device, {layerCount: 3});

    assert.equal(layers.length, 3);
    assert.equal(device.reads.length, Math.ceil(3 * 120 / 28));
    for (const {layer, positions} of layers) {
        assert.equal(positions.length, CHARYBDIS_4X6_LAYOUT_MATRIX.length);
        positions.forEach((position, layoutIndex) => {
            const [row, column] = CHARYBDIS_4X6_LAYOUT_MATRIX[layoutIndex];
            assert.equal(position.layoutIndex, layoutIndex);
            assert.equal(position.row, row);
            assert.equal(position.column, column);
            assert.equal(position.keycode, (layer << 12) | (row << 4) | column);
        });
    }
});

test("layout reads report monotonic progress against a known total", async () => {
    const seen = [];
    await readViaLayout(layoutDevice(), {layerCount: 2, onProgress: (value) => seen.push(value)});

    const total = 2 * CHARYBDIS_4X6_LAYOUT_MATRIX.length;
    assert.equal(seen.length, Math.ceil(2 * 120 / 28));
    assert.equal(seen.at(0).total, total);
    assert.deepEqual(seen.at(-1), {done: total, total, layer: 1});
    assert.ok(seen.every((value, index) => !index || value.done >= seen[index - 1].done));
});

test("layout reads refuse an implausible layer count instead of hammering the device", async () => {
    const device = layoutDevice();
    for (const layerCount of [0, -1, 17, 1.5, undefined, "5"]) {
        await assert.rejects(readViaLayout(device, {layerCount}), /layerCount/);
    }
    assert.equal(device.reads.length, 0);
});
