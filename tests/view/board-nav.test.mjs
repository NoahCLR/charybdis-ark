// Arrow keys move the picked key by where keys sit; [ ] and digits switch layers.
import assert from "node:assert/strict";
import test from "node:test";
import {neighbour, layerKeyTarget} from "../../webview/view/board-nav.mjs";

const ALL = Array.from({length: 56}, (_, index) => index);

test("arrows move to the next key that way, across the halves and down to the thumbs", () => {
    assert.equal(neighbour(0, "right", ALL), 1);
    assert.equal(neighbour(1, "left", ALL), 0);
    assert.equal(neighbour(0, "down", ALL), 12);
    assert.equal(neighbour(12, "up", ALL), 0);
    assert.equal(neighbour(5, "right", ALL), 6, "the inner columns face each other across the gap");
    assert.equal(neighbour(0, "left", ALL), 0, "the edge stays put");
    assert.equal(neighbour(0, "up", ALL), 0);
    assert.ok([48, 49, 50].includes(neighbour(41, "down", ALL)), "the bottom row reaches the thumbs");
});

test("[ and ] step through the layers and a digit jumps to one", () => {
    assert.equal(layerKeyTarget("]", 0, 16), 1);
    assert.equal(layerKeyTarget("[", 0, 16), null);
    assert.equal(layerKeyTarget("]", 15, 16), null);
    assert.equal(layerKeyTarget("7", 0, 16), 7);
    assert.equal(layerKeyTarget("9", 0, 8), null);
    assert.equal(layerKeyTarget("a", 0, 16), null);
});
