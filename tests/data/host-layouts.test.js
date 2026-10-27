"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {buildHostLayouts} = require("../../scripts/generate-host-layouts");
const fixture = require("../../upstream/firmware/tests/fixtures/host_layouts_v1.json");
const data = require("../../core/data/host-layouts.json");
const {hostLayout, hostLayouts, layoutTypes, HOST_LAYOUT_COUNT, US_HOST_LAYOUT} = require("../../core/data/host-layouts");

const ASCII = [...Array(95)].map((_, i) => String.fromCharCode(0x20 + i)).concat(["\t", "\n"]);

test("the shipped layouts are generated from the pinned firmware fixture", () => {
    assert.deepEqual(data, buildHostLayouts(fixture));
});

test("layouts keep the catalogue's IDs in order, and US types ASCII only", () => {
    assert.deepEqual(hostLayouts().map((layout) => layout.id), [...Array(HOST_LAYOUT_COUNT).keys()]);
    assert.equal(HOST_LAYOUT_COUNT, 15);
    assert.equal(hostLayout(US_HOST_LAYOUT).chars, ASCII.slice().sort().join(""));
    assert.equal(hostLayout(99), null);
    assert.equal(layoutTypes(99, "a"), false);
});

test("every layout types all printable ASCII, and its own accents", () => {
    for (const layout of hostLayouts()) for (const character of ASCII) assert.ok(layoutTypes(layout.id, character), `${layout.slug} types ${JSON.stringify(character)}`);
    const german = hostLayouts().find((layout) => layout.slug === "windows-german");
    assert.deepEqual(german.keys.KC_Y.slice(0, 2), ["z", "Z"]);
    assert.deepEqual(german.keys.KC_GRV[0], {dead: "^"});
    assert.ok(layoutTypes(german.id, "ö") && !layoutTypes(german.id, "🙂"));
    const dutch = hostLayouts().find((layout) => layout.slug === "macos-dutch");
    for (const character of "é€“”") assert.ok(layoutTypes(dutch.id, character), character);
    // Linux composes dead acute and Space into an apostrophe.
    assert.equal(layoutTypes(hostLayouts().find((layout) => layout.slug === "linux-german").id, "´"), false);
    assert.equal(hostLayouts().find((layout) => layout.slug === "macos-unicode-hex-input").unicodeHexInput, true);
});
