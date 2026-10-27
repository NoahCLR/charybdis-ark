"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {effectiveTimings, releaseHoldUnreachable, gestureTimingFindings} = require("../../core/model/gesture-timing");
const code = operand => ({kind: 1, flags: 0, operand});
const held = (style, operand = 5) => ({style, action: code(operand), repeatHz: style === 3 ? 10 : 0});
const row = (hold = 100, long = 100, style = 4) => ({target: code(4), tapHoldTerm: hold, longHoldTerm: long,
    steps: [{tapIndex: 0, hold: held(style), longHold: held(4, 6)}]});
const findings = r => gestureTimingFindings({behaviors: {rows: [r]}, settings: {values: [200, 150, 400, 150]}});
test("effective terms follow per-row overrides and the LT default", () => {
    assert.deepEqual(effectiveTimings({...row(0, 0), target: code(0x432f)}, [200,150,400,150]), {hold:200,long:400,repeat:150});
    assert.deepEqual(effectiveTimings(row(0,0), [200,150,400,150]), {hold:150,long:400,repeat:150});
});
test("a custom key whose shortcut taps-toggles or one-shots its layers waits the dual-role term, as TT() and OSL() do", () => {
    const shortcuts = Array.from({length: 128}, () => ({mods: 0, keys: [], layers: 0, layerKind: 0}));
    const custom = {target: {kind: 7, flags: 0, operand: 9}};
    const terms = [200, 150, 400, 150];
    /** @param {number} layerKind @param {number} [layers] */
    const hold = (layerKind, layers = 1 << 3) => { shortcuts[9] = {mods: 0, keys: [], layers, layerKind}; return effectiveTimings(custom, terms, shortcuts).hold; };
    assert.deepEqual([0, 1, 2, 3, 4].map((kind) => hold(kind)), [150, 150, 150, 200, 200]);
    assert.equal(effectiveTimings(custom, terms).hold, 150, "no shortcuts given: the behaviour term");
});
test("release hold has an empty interval at equality and below, but not above", () => {
    for (const long of [99,100,101]) {
        const r = row(100,long);
        assert.equal(releaseHoldUnreachable(r.steps[0], effectiveTimings(r, [])), long <= 100);
        assert.equal(findings(r).some(f => f.title.includes("cannot send")), long <= 100);
    }
});
test("other hold styles and transparent actions are not declared impossible", () => {
    for (const style of [1,2,3]) assert.equal(findings(row(100,100,style)).some(f => f.title.includes("cannot send")), false);
    const r = row(); r.steps[0].hold.action = code(1);
    assert.equal(findings(r).some(f => f.title.includes("cannot send")), false);
});
test("narrow and short windows are advice, with no subtraction of combo waits", () => {
    assert.equal(findings(row(100,149))[0].level, "notice");
    assert.deepEqual(findings(row(100,150)), []);
    const r = row(40,400); r.multiTapTerm = 30; r.steps[0].tapIndex = 1;
    assert.equal(findings(r).filter(f => f.level === "notice").length, 2);
});

test("short combo windows use inherited values and respect the enable switch", () => {
    const decoded = {settings: {values: []}, combos: {defaultTermMs: 20, rows: [{termMs: null, inputs: [code(4),code(5)]}]}};
    decoded.settings.values[20] = 1;
    assert.equal(gestureTimingFindings(decoded)[0].kind, "comboTiming");
    decoded.settings.values[20] = 0;
    assert.deepEqual(gestureTimingFindings(decoded), []);
});

test("an empty long action cannot shadow a release hold", () => {
    const r = row(); r.steps[0].longHold.action = code(0);
    assert.equal(releaseHoldUnreachable(r.steps[0], effectiveTimings(r, [])), false);
});
test("every dual-role key follows the dual-role term, row or not; any other row the behaviour term", () => {
    const values = [200, 150, 400, 150];
    // MT(), LT(), OSL(), OSM() and TT() (firmware D-F27, bit 31).
    for (const operand of [0x2204, 0x3fff, 0x432f, 0x5281, 0x52a2, 0x52c2, 0x52df]) {
        assert.equal(effectiveTimings({target: code(operand)}, values).hold, 200, operand.toString(16));
        assert.equal(effectiveTimings({target: code(operand), tapHoldTerm: 180}, values).hold, 180, "a row's own time wins");
    }
    for (const operand of [4, 0x5201, 0x5221, 0x5261, 0x52e0]) assert.equal(effectiveTimings({target: code(operand)}, values).hold, 150, operand.toString(16));
});
