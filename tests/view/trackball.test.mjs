import assert from "node:assert/strict";
import test from "node:test";
import {SCROLL_STARTER, KIND, AXIS} from "../../webview/view/pointing-config.mjs";
import {countsToMm, fixedSummaries, followsNormal, keycodePlacements, mmToCounts, modeProblems, reachLine, runningDpi, sendsLine, stepAside, SCROLL_HELP, TEMPLATES} from "../../webview/view/trackball.mjs";

test("a step converts between sensor counts and millimetres at the DPI it runs at", () => {
    assert.equal(countsToMm(60, 400), 3.8);
    assert.equal(countsToMm(0, 400), null);
    assert.equal(countsToMm(60, 0), null);
    assert.equal(mmToCounts("3.8", 400), 60);
    assert.equal(mmToCounts("3,8", 400), 60, "a decimal comma reads as a point");
    assert.equal(mmToCounts("0.01", 400), 1, "never below one count");
    assert.equal(mmToCounts("99999", 12000), 65535, "never past what the keyboard stores");
    for (const bad of ["", "0", "-1", "abc"]) assert.equal(mmToCounts(bad, 400), null, bad);
    assert.equal(runningDpi({dpi: 0}, 400), 400, "a mode at normal speed runs at the normal DPI");
    assert.equal(runningDpi({dpi: 100}, 400), 100);
});

test("the counts beside a step say the DPI, and for a directional mode that sniping lengthens it", () => {
    assert.equal(stepAside(60, 400, {directional: false, sniping: 100}), "60 counts at 400 DPI");
    assert.equal(stepAside(60, 400, {directional: true, sniping: 100}), "60 counts at 400 DPI · longer while sniping (≈ 15.2 mm at 100 DPI)");
    assert.equal(stepAside(60, 100, {directional: true, sniping: 100}), "60 counts at 100 DPI");
});

const model = {
    layers: [{index: 0, name: "Base", positions: [{keycode: "SNIPING", value: 32260}]},
        {index: 3, name: "Navigation", displayName: "Navigation", positions: [{keycode: "QK_KB_5", value: 32261}, {keycode: "PD_SLOT_4", value: 32388}]}],
    qmkKeycodes: [{value: "SNIPING", keycode: 32260}, {value: "SNP_TOG", keycode: 32261}, {value: "KC_AUDIO_VOL_UP", keycode: 169}, {value: "KC_AUDIO_VOL_DOWN", keycode: 170}],
    qmkKeyLabels: {KC_AUDIO_VOL_UP: "Volume up", KC_AUDIO_VOL_DOWN: "Volume down"},
    keyBehaviors: [{keycode: "KC_RIGHT_ALT", steps: [{hold: {action: "SNP_TOG"}}]}],
    combos: [{output: "SNIPING"}],
    configDefaults: [
        {id: "normalPointerSpeed", fields: [{macro: "normalDpi", value: 400}, {macro: "snipingDpi", value: 100}]},
        {id: "sniping", fields: [{macro: "autoSniping", kind: "toggle", enabled: true}, {macro: "snipingLayer", kind: "layer", value: "Layer 3"}]},
        {id: "autoMouse", fields: [{macro: "autoMouse", kind: "toggle", enabled: true}, {macro: "mouseLayer", kind: "layer", value: "Layer 0"}, {macro: "mouseTimeout", value: 1200}]},
    ],
};

test("a key is found on layers, behaviours and combos, by its name or the value the keyboard stores", () => {
    const found = keycodePlacements(model, ["SNIPING", "SNP_TOG"]);
    assert.equal(found.keys.length, 2, "QK_KB_5 is SNP_TOG by value");
    assert.equal(found.behaviours.length, 1);
    assert.equal(found.combos.length, 1);
    assert.equal(reachLine(found), "Base · 1 key, Navigation · 1 key, 1 behaviour, 1 combo");
    assert.equal(reachLine({keys: [], behaviours: [], combos: [], layers: []}), "Not placed");
});

test("the fixed entries summarise the stored settings in words", () => {
    assert.deepEqual(fixedSummaries(model), {pointer: "400 DPI", sniping: "100 DPI · auto on Navigation", mouseLayer: "Base · 1.2 s"});
    const off = structuredClone(model);
    off.configDefaults[2].fields[0].enabled = false;
    assert.equal(fixedSummaries(off).mouseLayer, "Off");
    assert.deepEqual(followsNormal([{id: 0, kind: 2, dpi: 100}, {id: 1, kind: 1, dpi: 0}, {id: 2, kind: 0, dpi: 0}]).map((slot) => slot.id), [1]);
});

test("a mode reads as what it sends", () => {
    const volume = {kind: KIND.DIRECTIONAL, axis: AXIS.VERTICAL, directions: {up: {keycode: 169}, down: {keycode: 170}}};
    assert.equal(sendsLine(model, volume), "↑ Volume up  ↓ Volume down");
    assert.equal(sendsLine(model, {kind: KIND.SCROLLING, axis: 2}), "Scrolls up and down");
    assert.equal(sendsLine(model, {kind: KIND.DIRECTIONAL, axis: AXIS.DOMINANT, directions: {}}), "No shortcuts yet");
});

test("each scroll rule the firmware checks is named on the field that breaks it", () => {
    const good = {kind: KIND.SCROLLING, scroll: {...SCROLL_STARTER}};
    assert.deepEqual(modeProblems(good), {});
    const bad = (patch) => Object.keys(modeProblems({kind: KIND.SCROLLING, scroll: {...SCROLL_STARTER, ...patch}}));
    assert.deepEqual(bad({divisorV: 0}), ["divisorV"]);
    assert.deepEqual(bad({thresholdH: 0}), ["thresholdH"]);
    assert.deepEqual(bad({lockMs: 0}), ["lockMs"]);
    assert.deepEqual(bad({expireMs: 50}), ["expireMs"], "expiry under the lock timeout");
    assert.deepEqual(bad({startNumerator: 3, startDenominator: 4}), ["startNumerator"], "a ratio under 1:1");
    assert.deepEqual(bad({sustainNumerator: 2, sustainDenominator: 1}), ["sustainNumerator"], "retention past selection");
    assert.deepEqual(bad({decayDivisor: 1}), ["decayDivisor"]);
    assert.deepEqual(Object.keys(modeProblems({kind: KIND.DIRECTIONAL, axis: AXIS.VERTICAL, thresholdY: 0})), ["thresholdY"]);
    assert.deepEqual(modeProblems({kind: KIND.DIRECTIONAL, axis: AXIS.HORIZONTAL, thresholdX: 40, thresholdY: 0}), {});
    for (const key of ["thresholdH", "divisorV", "expireMs", "startNumerator", "sustainNumerator", "decayDivisor"]) assert.ok(SCROLL_HELP[key].help && SCROLL_HELP[key].range, key);
});

test("the templates are the eight the decision names, the shipped ones first", () => {
    assert.deepEqual(TEMPLATES.map((entry) => entry.label), ["Volume", "Brightness", "Zoom", "Scroll", "Arrows", "Undo / Redo", "Back / Forward", "Tabs"]);
    assert.deepEqual(TEMPLATES.filter((entry) => !entry.shipped).map((entry) => entry.id), ["backForward", "tabs"]);
});
