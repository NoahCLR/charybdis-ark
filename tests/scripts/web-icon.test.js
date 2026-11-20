"use strict";

// The page's icon (scripts/web-icon.js, D-L104): the board where
// webview/view/geometry.mjs puts it, white on black, drawn to PNG without a
// package. What the build does with it is web-build.test.js's.

const assert = require("node:assert/strict");
const test = require("node:test");
const zlib = require("node:zlib");
const {iconPng, iconSvg, MASKABLE_MARGIN} = require("../../scripts/web-icon");

// A greyscale PNG's pixels, row by row, from its one IDAT chunk.
function pixels(png) {
    const size = png.readUInt32BE(16);
    let at = 8, data;
    while (at < png.length) {
        const length = png.readUInt32BE(at), type = png.toString("ascii", at + 4, at + 8);
        if (type === "IDAT") data = png.subarray(at + 8, at + 8 + length);
        assert.equal(png.readUInt32BE(at + 8 + length), zlib.crc32(png.subarray(at + 4, at + 8 + length)), `${type}'s CRC`);
        at += 12 + length;
    }
    const rows = zlib.inflateSync(data);
    assert.equal(rows.length, size * (size + 1));
    return {size, at: (x, y) => rows[y * (size + 1) + 1 + x]};
}

test("the PNG is the board: the trackball and keys white, the margin black", async () => {
    const {GEO, keyVisual} = await import("../../webview/view/geometry.mjs");
    const image = pixels(await iconPng(512));
    assert.equal(image.size, 512);
    // Board units to pixels, from the SVG's square.
    const [x, y, side] = (await iconSvg()).match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
    const pixel = (bx, by) => image.at(Math.floor(((bx - x) / side) * 512), Math.floor(((by - y) / side) * 512));
    assert.equal(pixel(GEO.trackball.x, GEO.trackball.y), 255, "the trackball's centre");
    for (const index of [0, 11, 48, 50, 55]) {
        const key = keyVisual(index);
        assert.equal(pixel(key.x + GEO.keyW / 2, key.y + GEO.keyH / 2), 255, `key ${index}'s centre`);
    }
    assert.equal(pixel(GEO.leftX[1] - 4, GEO.leftTopY[1] + GEO.yOffset + 20), 0, "the gap between two keys");
    for (const [px, py] of [[0, 0], [511, 0], [0, 511], [511, 511], [256, 10]]) assert.equal(image.at(px, py), 0, `${px},${py} is margin`);
});

test("the maskable icon keeps the whole board inside the circle a launcher keeps", async () => {
    const image = pixels(await iconPng(512, {margin: MASKABLE_MARGIN}));
    const keep = 0.4 * 512;
    let lit = 0;
    for (let py = 0; py < 512; py += 1) {
        for (let px = 0; px < 512; px += 1) {
            if (!image.at(px, py)) continue;
            lit += 1;
            assert.ok(Math.hypot(px + 0.5 - 256, py + 0.5 - 256) <= keep, `${px},${py} is outside the safe circle`);
        }
    }
    assert.ok(lit > 0);
});
