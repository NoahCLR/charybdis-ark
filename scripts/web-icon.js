// @ts-check
"use strict";

// The web page's icon (D-L104): the board as the panel draws it, every key and
// the trackball where webview/view/geometry.mjs puts them, white on black and
// centred in a square. One drawing makes all of them: the tab's favicon as
// SVG, and the PNGs a saved web app shows, which iOS and macOS Safari need and
// Chrome's install asks for at 192 and 512 pixels. The maskable one has the
// wider margin Android needs, whose launcher cuts every icon to its own shape
// inside the middle 80 per cent.
//
// The PNGs are drawn here, with no package: each pixel is the share of a 4×4
// grid of points inside a key or the ball, written as 8-bit greyscale.

const zlib = require("node:zlib");

// The board's margin in the square, as a share of the side on each edge.
const MARGIN = 0.08;
// Wide enough that the board's corners stay inside the circle of radius 0.4
// a launcher keeps.
const MASKABLE_MARGIN = 0.15;
const SAMPLES = 4;

/** @typedef {{x: number, y: number, angle: number}} KeyVisual */
/** @typedef {{keys: KeyVisual[], keyW: number, keyH: number, radius: number, ball: {x: number, y: number, r: number}}} Board */

/** @returns {Promise<Board>} */
async function board() {
    const {GEO, keyVisual} = await import("../webview/view/geometry.mjs");
    return {keys: Array.from({length: 56}, (_, index) => keyVisual(index)), keyW: GEO.keyW, keyH: GEO.keyH, radius: GEO.radius, ball: GEO.trackball};
}

// The square, in the board's own units, that holds the board with `margin` on
// every edge.
/** @param {Board} shape @param {number} margin */
function square(shape, margin) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const key of shape.keys) {
        const cx = key.x + shape.keyW / 2, cy = key.y + shape.keyH / 2;
        const turn = (key.angle * Math.PI) / 180;
        for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const px = (dx * shape.keyW) / 2, py = (dy * shape.keyH) / 2;
            const x = cx + px * Math.cos(turn) - py * Math.sin(turn), y = cy + px * Math.sin(turn) + py * Math.cos(turn);
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
    }
    const {ball} = shape;
    x0 = Math.min(x0, ball.x - ball.r); x1 = Math.max(x1, ball.x + ball.r);
    y0 = Math.min(y0, ball.y - ball.r); y1 = Math.max(y1, ball.y + ball.r);
    const side = Math.max(x1 - x0, y1 - y0) / (1 - 2 * margin);
    return {x: (x0 + x1) / 2 - side / 2, y: (y0 + y1) / 2 - side / 2, side};
}

/** @param {number} value */
const unit = (value) => String(Math.round(value * 100) / 100);

/** @param {{margin?: number}} [options] */
async function iconSvg({margin = MARGIN} = {}) {
    const shape = await board();
    const box = square(shape, margin);
    const {keyW, keyH, radius, ball} = shape;
    const keys = shape.keys.map((key) => {
        const turn = key.angle ? ` transform="rotate(${key.angle} ${key.x + keyW / 2} ${key.y + keyH / 2})"` : "";
        return `<rect x="${key.x}" y="${key.y}" width="${keyW}" height="${keyH}" rx="${radius}"${turn}/>`;
    }).join("");
    const viewBox = [box.x, box.y, box.side, box.side].map(unit).join(" ");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`
        + `<rect x="${unit(box.x)}" y="${unit(box.y)}" width="${unit(box.side)}" height="${unit(box.side)}"/>`
        + `<g fill="#fff">${keys}<circle cx="${ball.x}" cy="${ball.y}" r="${ball.r}"/></g></svg>\n`;
}

// The icon as a `size`-pixel square PNG.
/** @param {number} size @param {{margin?: number}} [options] */
async function iconPng(size, {margin = MARGIN} = {}) {
    const shape = await board();
    const box = square(shape, margin);
    const grid = size * SAMPLES, scale = box.side / grid;
    const covered = new Uint8Array(grid * grid);
    // Marks every point of the grid inside `inside`, over the board-unit
    // rectangle that holds the shape.
    /** @param {[number, number, number, number]} bounds @param {(x: number, y: number) => boolean} inside */
    const fill = ([left, top, right, bottom], inside) => {
        /** @param {number} value @param {number} origin */
        const from = (value, origin) => Math.max(0, Math.floor((value - origin) / scale));
        /** @param {number} value @param {number} origin */
        const to = (value, origin) => Math.min(grid - 1, Math.ceil((value - origin) / scale));
        for (let row = from(top, box.y); row <= to(bottom, box.y); row += 1) {
            const y = box.y + (row + 0.5) * scale;
            for (let column = from(left, box.x); column <= to(right, box.x); column += 1) {
                if (inside(box.x + (column + 0.5) * scale, y)) covered[row * grid + column] = 1;
            }
        }
    };
    const {keyW, keyH, radius, ball} = shape;
    const reach = Math.hypot(keyW, keyH) / 2;
    for (const key of shape.keys) {
        const cx = key.x + keyW / 2, cy = key.y + keyH / 2;
        const cos = Math.cos((-key.angle * Math.PI) / 180), sin = Math.sin((-key.angle * Math.PI) / 180);
        fill([cx - reach, cy - reach, cx + reach, cy + reach], (x, y) => {
            const dx = Math.abs((x - cx) * cos - (y - cy) * sin), dy = Math.abs((x - cx) * sin + (y - cy) * cos);
            if (dx > keyW / 2 || dy > keyH / 2) return false;
            const ox = Math.max(0, dx - (keyW / 2 - radius)), oy = Math.max(0, dy - (keyH / 2 - radius));
            return ox * ox + oy * oy <= radius * radius;
        });
    }
    fill([ball.x - ball.r, ball.y - ball.r, ball.x + ball.r, ball.y + ball.r], (x, y) => (x - ball.x) ** 2 + (y - ball.y) ** 2 <= ball.r ** 2);

    // One filter byte (none) before each row of grey levels.
    const rows = Buffer.alloc(size * (size + 1));
    for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
            let sum = 0;
            for (let sy = 0; sy < SAMPLES; sy += 1) {
                const start = (row * SAMPLES + sy) * grid + column * SAMPLES;
                for (let sx = 0; sx < SAMPLES; sx += 1) sum += covered[start + sx];
            }
            rows[row * (size + 1) + 1 + column] = Math.round((sum * 255) / (SAMPLES * SAMPLES));
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header[8] = 8; // bits per sample
    header[9] = 0; // greyscale; compression, filter and interlace stay 0
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(rows, {level: 9})), chunk("IEND", Buffer.alloc(0))]);
}

/** @param {string} type @param {Buffer} data */
function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([length, body, crc]);
}

module.exports = {iconPng, iconSvg, MARGIN, MASKABLE_MARGIN};
