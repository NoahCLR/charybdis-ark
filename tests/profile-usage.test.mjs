import test from "node:test";
import assert from "node:assert/strict";
import {NEARLY_FULL, profileUsageView} from "../webview/view/profile-usage.mjs";

const usage = (used, extra = {}) => ({
    used, capacity: 5088, source: "keyboard",
    areas: [{id: "behaviours", bytes: used - 792}, {id: "pointing", bytes: 780}, {id: "settings", bytes: 12}, {id: "names", bytes: 0}],
    counts: [{id: "behaviours", used: 64, limit: 64}, {id: "combos", used: 3, limit: 32}],
    ...extra,
});

test("the card names its source, its areas and its counted limits", () => {
    const view = profileUsageView(usage(2000));
    assert.equal(view.source, "What the keyboard runs");
    assert.equal(profileUsageView(usage(2000, {source: "draft"})).source, "Your draft");
    assert.equal(view.free, 3088);
    assert.deepEqual(view.areas.map((area) => area.label), ["Behaviours", "Pointing modes", "Settings and headers"],
        "an area the profile does not carry is left out");
    assert.deepEqual(view.areas.map((area) => area.percent), [60, 39, 1]);
    assert.deepEqual(view.counts.map((count) => [count.label, count.full]), [["Behaviours", true], ["Combos", false]]);
});

test("the bar is tinted from nine tenths full, and never past full", () => {
    assert.equal(NEARLY_FULL, 0.9);
    assert.equal(profileUsageView(usage(4579)).nearlyFull, false);
    assert.equal(profileUsageView(usage(4580)).nearlyFull, true);
    assert.equal(profileUsageView(usage(6000)).share, 1);
    assert.equal(profileUsageView(usage(6000)).free, 0);
});

test("the macro bank is its own bar, and nothing is shown without figures", () => {
    assert.deepEqual(profileUsageView(usage(2000), {stored: 719, capacity: 7190}).macros, {used: 719, capacity: 7190, share: 0.1});
    assert.equal(profileUsageView(usage(2000), null).macros, null);
    assert.equal(profileUsageView(null, {stored: 1, capacity: 7191}), null);
});
