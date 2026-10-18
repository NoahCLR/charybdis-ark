// What the Keyboard screen and the halves banner say (view/keyboard-view.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import {firmwareLine, halvesBanner, halvesRows} from "../../webview/view/keyboard-view.mjs";

const keyboard = (halves, extra = {}) => ({device: {connected: true, health: {halves}}, ...extra});

test("the halves are named by side, with the master on the right", () => {
    assert.deepEqual(halvesRows(keyboard("agree")).map((half) => [half.side, half.role, half.ok]),
        [["Right half (USB, trackball)", "master", true], ["Left half", "slave", true]]);
    assert.equal(halvesRows(keyboard("alone"))[1].ok, false);
    assert.match(halvesRows(keyboard("alone"))[1].words, /cable between the halves/);
    assert.deepEqual(halvesRows({device: {connected: false}}).map((half) => half.ok), [false, false]);
});

test("the banner shows only while a half is missing or the halves disagree, never in the demo", () => {
    assert.equal(halvesBanner(keyboard("agree")), "");
    assert.match(halvesBanner(keyboard("alone")), /left half isn't answering/);
    assert.match(halvesBanner(keyboard("apart")), /different saved settings/);
    assert.equal(halvesBanner(keyboard("alone", {demo: {active: true}})), "");
    assert.equal(halvesBanner({device: {connected: false, health: {halves: "alone"}}}), "");
});

test("the firmware line says whether this Ark works with it, or what to do", () => {
    assert.deepEqual(firmwareLine({firmware: {version: "1.0.0", worksWithArk: true}}), {version: "charybdis-4x6 firmware 1.0.0", works: true, words: "works with this Ark ✓"});
    assert.match(firmwareLine({firmware: {version: null, worksWithArk: false}}).words, /Update both halves/);
    assert.equal(firmwareLine(null).works, false);
});
