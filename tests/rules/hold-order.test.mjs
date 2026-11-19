import assert from "node:assert/strict";
import test from "node:test";
import {holdOrderReason, holdsOutOfOrder} from "../../rules/hold-order.mjs";

test("a Long hold at or before the Tap / hold is out of order; unknown values never are (D-L82)", () => {
    assert.deepEqual([99, 100, 101].map((long) => holdsOutOfOrder(100, long)), [true, true, false]);
    for (const [hold, long] of [[undefined, 100], [100, undefined], [100, NaN], ["100", 50], [100.5, 50]]) assert.equal(holdsOutOfOrder(hold, long), false, `${hold}/${long}`);
});

test("the reason names both thresholds and their values after whose they are", () => {
    const names = {tapHoldTerm: "tap / hold threshold", longHoldTerm: "long hold threshold"};
    assert.equal(holdOrderReason({hold: 800, long: 500}, names, "its"), "its Long hold threshold, 500 ms, must be later than its Tap / hold threshold, 800 ms.");
    assert.equal(holdOrderReason({hold: 700, long: 400}, names, "the"), "the Long hold threshold, 400 ms, must be later than the Tap / hold threshold, 700 ms.");
});
