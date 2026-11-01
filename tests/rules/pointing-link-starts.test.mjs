import test from "node:test";
import assert from "node:assert/strict";
import {linkStartHolds} from "../../rules/pointing-link-starts.mjs";

test("a link starts its mode while its starting layer is on and no layer that ends a start from it is", () => {
    const start = {layer: 3, ends: 0b1_0000_0000};
    assert.equal(linkStartHolds(start, 0b1001), true);
    assert.equal(linkStartHolds(start, 0b1), false, "its layer is off");
    assert.equal(linkStartHolds(start, 0b1_0000_1001), false, "a layer that ends it is on");
    assert.equal(linkStartHolds({layer: 15, ends: 0}, 0x8000), true, "the top layer, which nothing ends");
});
