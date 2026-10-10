"use strict";
const assert = require("node:assert/strict");
const {RAW_HID_REPORT_SIZE} = require("../../core/transport/device-adapter");
const {PROFILE_WIRE_STATUS, PROFILE_WIRE_V1} = require("../../core/protocol/profile-wire-v1");
const {PROFILE_PAYLOAD_V1} = require("../../core/protocol/profile-payload-v1");
const {crc32, fnv1a32} = require("../../core/schema/profile-blob-v1");

// A reference encoder for the firmware page layout in
// users/noah/lib/compat/qmk_via_profile_channel.c. Written independently of
// the decoder so these tests check the contract rather than restate the code.
function metadataPage(state) {
    const page = Buffer.alloc(PROFILE_WIRE_V1.PAYLOAD_SIZE);
    page[0] = state.layoutVersion ?? PROFILE_PAYLOAD_V1.LAYOUT_VERSION;
    page[1] = state.chunkSize ?? PROFILE_WIRE_V1.PAYLOAD_SIZE;
    page.writeUInt16LE(state.payloadLength ?? state.bytes.length, 2);
    page.writeUInt32LE(state.generation, 4);
    page.writeUInt32LE(state.digest ?? fnv1a32(state.bytes), 8);
    page.writeUInt32LE(state.crc ?? crc32(state.bytes), 12);
    page[16] = state.schemaMajor ?? 1;
    page[17] = state.schemaMinor ?? 0;
    page[18] = state.domainMask ?? 0x30;
    page[19] = state.originHalf ?? 1;
    page[20] = state.flags ?? 0;
    return page;
}

function payloadOf(length) {
    return Buffer.from(Array.from({length}, (unused, index) => (index * 7 + 3) & 0xff));
}

// Serves pages the way the firmware does, including a short final chunk.
function payloadDevice(states, value = PROFILE_PAYLOAD_V1.VALUE) {
    const snapshots = Array.isArray(states) ? states : [states];
    const requests = [];
    let served = 0;
    return {
        requests,
        async request(report) {
            const request = Buffer.from(report);
            assert.equal(request[2], value);
            assert.notEqual(request[3], 0);
            const page = request[4];
            requests.push(page);
            const state = snapshots[Math.min(served, snapshots.length - 1)];
            if (page === 0) {
                served += 1;
            }

            let payload;
            if (page === 0) {
                payload = metadataPage(state);
            } else {
                const chunkSize = state.chunkSize ?? PROFILE_WIRE_V1.PAYLOAD_SIZE;
                const offset = (page - 1) * chunkSize;
                payload = state.bytes.subarray(offset, Math.min(offset + chunkSize, state.bytes.length));
            }

            const response = Buffer.alloc(RAW_HID_REPORT_SIZE);
            request.copy(response, 0, 0, 5);
            response[5] = PROFILE_WIRE_STATUS.OK;
            response[6] = payload.length;
            payload.copy(response, PROFILE_WIRE_V1.PAYLOAD_OFFSET);
            return response;
        },
    };
}


module.exports = {metadataPage, payloadOf, payloadDevice};
