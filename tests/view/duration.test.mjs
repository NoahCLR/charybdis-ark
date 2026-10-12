import assert from "node:assert/strict";
import test from "node:test";
import {durationMilliseconds, durationUnit, durationValue} from "../../webview/view/duration.mjs";

test("idle timeouts use whole minutes when possible and preserve millisecond precision", () => {
    for (const ms of [0, 1, 777, 999, 1000, 59999, 60000, 60001, 777777, 86400000]) {
        const stored = String(ms);
        assert.equal(durationUnit(stored), ms >= 60000 && ms % 60000 === 0 ? "minutes" : "seconds");
        for (const unit of ["seconds", "minutes"]) assert.equal(durationMilliseconds(durationValue(stored, unit), unit), stored);
    }
    assert.equal(durationValue("60000", "minutes"), "1");
    assert.equal(durationMilliseconds("1.5", "minutes"), "90000");
    assert.equal(durationMilliseconds("0.777", "seconds"), "777");
    assert.equal(durationMilliseconds("0", "minutes"), "0");
    assert.equal(durationMilliseconds(".5", "seconds"), "500");
    assert.equal(durationMilliseconds("0.0006", "seconds"), "1");
    for (const bad of ["", " ", "-1", "NaN", "Infinity", "1e3", "1:30", "0x10", "1.2.3", "9007199254740992"]) assert.equal(durationMilliseconds(bad, "seconds"), null);
});
