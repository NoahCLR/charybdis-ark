import assert from "node:assert/strict";
import test from "node:test";
import {HOVER_COOL_MS, HOVER_DELAY_MS, coldHover, hoverClosed, hoverShown, hoverWait} from "../../webview/view/hover-timing.mjs";

test("the first card on a cold board waits 300 ms", () => {
    assert.equal(HOVER_DELAY_MS, 300);
    assert.equal(hoverWait(coldHover(), 1000), 300);
});

test("while a card is open, another key's card swaps in at once", () => {
    const open = hoverShown(coldHover());
    assert.equal(hoverWait(open, 5000), 0);
});

test("after the card closes the board stays warm for 300 ms, then cools", () => {
    assert.equal(HOVER_COOL_MS, 300);
    const closed = hoverClosed(hoverShown(coldHover()), 1000);
    assert.equal(closed.open, false);
    assert.equal(hoverWait(closed, 1200), 0, "coming straight back is instant");
    assert.equal(hoverWait(closed, 1300), 300, "after the cool-down it waits again");
    assert.deepEqual(hoverClosed(coldHover(), 1000), coldHover(), "closing with nothing open warms nothing");
});
