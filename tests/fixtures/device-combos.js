"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {fnv1a32} = require("../../core/schema/profile-blob-v1");

// The firmware's own byte fixtures: version 3, the only one the app reads.
function fixturePages(version = 3) {
    return fs.readFileSync(path.resolve(__dirname, `../../upstream/firmware/tests/fixtures/combo_readback_v${version}.fixture`), "utf8")
        .trim().split("\n").map(line => Buffer.from(line.split(" ")[1], "hex"));
}
// Version 3's digest covers every metadata byte but the digest itself (bytes
// 6..9), then every later page.
function rehash(pages) {
    pages[0].writeUInt32LE(fnv1a32(Buffer.concat([pages[0].subarray(0, 6), pages[0].subarray(10), ...pages.slice(1)])), 6);
    return pages;
}
function responseFor(request, pages) {
    const response = Buffer.alloc(32);
    request.copy(response, 0, 0, 5);
    response[6] = 25;
    pages[request[4] | (request[5] << 8)].copy(response, 7);
    return response;
}
module.exports = {fixturePages, rehash, responseFor};
