"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {readHostOs} = require("../../core/protocol/host-os-v1");
function connection(os, length = 2, version = 1) {
    return {async request(request, options) {
        assert.equal(request[2], 0x0b); assert.equal(request[4], 0);
        const reply = Buffer.alloc(32); request.copy(reply, 0, 0, 5);
        reply[6] = length; if (length) reply[7] = version; if (length > 1) reply[8] = os;
        assert(options.matchResponse(reply, request)); return reply;
    }};
}
test("reads unknown and all supported OS values without inferring host configuration", async () => {
    for (const detected of [0, 1, 2, 3]) assert.deepEqual(await readHostOs(connection(detected), {next: () => 1}), {detected});
});
test("rejects invalid host telemetry instead of choosing an OS", async () => {
    for (const value of [connection(4), connection(1, 1), connection(1, 2, 2)]) await assert.rejects(readHostOs(value, {next: () => 1}), error => error.code === "INVALID_HOST_OS");
});
