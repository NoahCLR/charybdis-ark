import test from "node:test";
import assert from "node:assert/strict";
import {NEARLY_FULL, profileUsageView} from "../../webview/view/profile-usage.mjs";

const usage = (used, extra = {}) => ({
    used, capacity: 5088, source: "keyboard",
    counts: [{id: "behaviours", used: 64, limit: 64}, {id: "combos", used: 3, limit: 32}, {id: "customKeys", used: 5, limit: 128}],
    ...extra,
});

test("the card names its source and counts each thing in its screen's words", () => {
    const view = profileUsageView(usage(2000));
    assert.equal(view.source, "What the keyboard runs");
    assert.equal(profileUsageView(usage(2000, {source: "draft"})).source, "Your draft");
    assert.equal(profileUsageView(usage(2000, {source: "demo"})).source, "The demo setup");
    assert.equal(view.free, 3088);
    assert.ok(!("areas" in view), "no storage breakdown");
    assert.deepEqual(view.counts.map((count) => [count.label, count.share, count.full]),
        [["Behaviours", 1, true], ["Combos", 3 / 32, false], ["Custom keys", 5 / 128, false]]);
    assert.equal(view.counts[0].tip, "Keys with a behaviour. The keyboard holds up to 64 and refuses one more.",
        "a limit says the keyboard refuses past it");
    assert.equal(view.counts[2].tip, "Custom keys with a name, a shortcut or a behaviour. The keyboard always has all 128.",
        "a fixed set of slots says they are always there");
});

test("unavailable macro slots fill the bar's free end and say so", () => {
    const view = profileUsageView(usage(2000, {counts: [{id: "macros", used: 18, limit: 128, unavailable: 97}, {id: "macros", used: 18, limit: 128}]}),
        {stored: 34503, capacity: 34903, reserveTaps: 10});
    const [short, open] = view.counts;
    assert.deepEqual([short.share, short.unavailableShare, short.note, short.full], [18 / 128, 97 / 128, "97 unavailable", false]);
    assert.equal(short.tip, "Macro slots with steps. Every empty slot keeps room in macro memory for 10 key taps; "
        + "when it cannot, the highest empty slots are unavailable until a macro is shortened or cleared. 97 are unavailable now, in red.");
    assert.deepEqual([open.unavailable, open.unavailableShare, open.note], [0, 0, ""], "a bank with room draws no red");
    assert.equal(profileUsageView(usage(2000, {counts: [{id: "macros", used: 31, limit: 128, unavailable: 97}]})).counts[0].full, true,
        "no free slot left once the open ones are used");
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
