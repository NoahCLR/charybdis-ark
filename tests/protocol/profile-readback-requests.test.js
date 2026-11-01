// @ts-check
"use strict";
// What a readback asks the keyboard for, page by page, and what the layout
// read makes of it: the protocol half of browser-tests/device-progress.spec.js,
// which keeps what the page shows while the read runs.

const assert = require("node:assert/strict");
const test = require("node:test");

const {PROFILE_WIRE_V1: WIRE} = require("../../core/protocol/profile-wire-v1");
const {PROFILE_PAYLOAD_V1: PAYLOAD} = require("../../core/protocol/profile-payload-v1");
const portable = require("../../core/model/portable-profile");
const {connectedService} = require("../fixtures/connected-service");
const {document} = require("../fixtures/pd-profile");

// A 25-byte page of a payload reply (a Raw HID report less its header).
const CHUNK = 25;

for (const method of /** @type {const} */ (["readLayout", "readCommittedProfile"])) {
    test(`${method} reads status, the payload's metadata, every chunk, the metadata again and status again`, async (t) => {
        const doc = document();
        const {service, keyboard} = await connectedService(t, {document: doc});
        const bytes = portable.validateSnapshot(doc).candidate;
        keyboard.requests.length = 0;
        await service[method]();
        const pages = keyboard.requests.map((request) => [request[0], request[2], request[4] | request[5] << 8]);
        const status = Array.from({length: WIRE.STATUS_PAGE_COUNT}, (_, page) => [WIRE.COMMAND_GET, WIRE.VALUE_STATUS, page]);
        const chunks = Array.from({length: Math.ceil(bytes.length / CHUNK)}, (_, at) => [WIRE.COMMAND_GET, PAYLOAD.VALUE, at + 1]);
        const metadata = [WIRE.COMMAND_GET, PAYLOAD.VALUE, PAYLOAD.METADATA_PAGE];
        assert.deepEqual(pages, [...status, metadata, ...chunks, metadata, ...status]);
        assert.equal(pages.length, Math.ceil(bytes.length / CHUNK) + 6, "two metadata pages, and status before and after the read");
        if (method === "readLayout") {
            const {layers} = portable.validateSnapshot(doc);
            assert.ok(service.snapshot().layout.layers.every(({layer, keys}) => keys.every((key) => key.keycode === layers[layer][key.row * 6 + key.column])),
                "every key is the profile's");
        }
    });
}
