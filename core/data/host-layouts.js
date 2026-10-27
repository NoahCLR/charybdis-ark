// @ts-check
"use strict";

// The host layouts the keyboard can type macro text through, generated from
// the firmware's pinned fixture by scripts/generate-host-layouts.js. Layout 0
// (US) is the default and types ASCII only.

const data = require("./host-layouts.json");

/** @type {Map<number, import("./types.js").HostLayout>} */
const BY_ID = new Map(data.layouts.map((layout) => [layout.id, {...layout, typeable: new Set(layout.chars)}]));
const US = 0;

/** @param {number} id */
function hostLayout(id) {
    return BY_ID.get(id) || null;
}

function hostLayouts() {
    return [...BY_ID.values()];
}

// Whether the layout types this character (one code point) with its own keys.
/** @param {number} id @param {string} character */
function layoutTypes(id, character) {
    return Boolean(BY_ID.get(id)?.typeable.has(character));
}

module.exports = {US_HOST_LAYOUT: US, HOST_LAYOUT_COUNT: data.layouts.length, hostLayout, hostLayouts, layoutTypes};
