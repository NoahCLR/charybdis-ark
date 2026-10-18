// @ts-check
// Moving the picked key with the arrow keys, by where keys sit on the board:
// the nearest key in that direction, preferring one in line with this one,
// so Right from the left half's inner column crosses to the right half and
// Down from the bottom row reaches the thumbs.

import {GEO, keyVisual} from "./geometry.mjs";

/** @typedef {"left" | "right" | "up" | "down"} Direction */
/** @type {Readonly<Record<string, Direction>>} */
export const ARROWS = Object.freeze({ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down"});

/** @param {number} index */
const centre = (index) => {
    const visual = keyVisual(index);
    return {x: visual.x + GEO.keyW / 2, y: visual.y + GEO.keyH / 2};
};

// The key to move to from `index`, among `indices` (the board's keys), or
// `index` itself when there is none that way.
/** @param {number} index @param {Direction} direction @param {readonly number[]} indices */
export function neighbour(index, direction, indices) {
    const from = centre(index);
    let best = index, score = Infinity;
    for (const other of indices) {
        if (other === index) continue;
        const to = centre(other), dx = to.x - from.x, dy = to.y - from.y;
        const along = direction === "right" ? dx : direction === "left" ? -dx : direction === "down" ? dy : -dy;
        const across = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
        // Only keys ahead, and not more off to the side than ahead.
        if (along < GEO.keyW / 3 || across > along * 1.2 + GEO.keyH / 2) continue;
        const value = along + across * 2.5;
        if (value < score) { score = value; best = other; }
    }
    return best;
}

// The layer a key press on the focused board switches to, or null: "[" and "]"
// step through the stack, a digit jumps to that layer.
/** @param {string} key @param {number} current @param {number} count */
export function layerKeyTarget(key, current, count) {
    if (key === "[") return current > 0 ? current - 1 : null;
    if (key === "]") return current + 1 < count ? current + 1 : null;
    if (/^[0-9]$/.test(key)) return Number(key) < count ? Number(key) : null;
    return null;
}
