// What this firmware was built with, as the Keyboard screen states it (view/firmware-facts.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {firmwareFacts} from "../../webview/view/firmware-facts.mjs";

const require = createRequire(import.meta.url);
const portable = require("../../core/model/portable-profile");
const {buildSnapshotModel} = require("../../core/session/device-model");
const {DEMO_CAPABILITIES, DEMO_LIMITS, DEMO_OPTIONS} = require("../../core/session/demo-session");
const {document} = require("../fixtures/pd-profile");
const doc = document();
const snapshot = {document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: DEMO_LIMITS, options: DEMO_OPTIONS};
const model = buildSnapshotModel(snapshot, DEMO_CAPABILITIES, {editable: true, reason: null});

test("the firmware facts state what the firmware reports, each needing a build", () => {
    const facts = firmwareFacts({...model, firmware: {layers: 16, tapCounts: 5, macros: 128, customKeys: 128, leds: 58, combos: 128, repeatHz: 100}});
    const by = Object.fromEntries(facts.map((fact) => [fact.label, fact.value]));
    assert.equal(by.Layers, "16 layers");
    assert.equal(by["Tap counts"], "5 per behaviour");
    assert.equal(by.LEDs, "58 LEDs");
    assert.equal(by["Repeat ceiling"], "100 Hz");
    assert.equal(by["Brightness ceiling"], String(model.rgb.maximumBrightness));
    assert.ok(facts.every((fact) => /Needs a firmware build/.test(fact.hint)));
    assert.equal(by["QMK tap-hold options"], "Not used", "the keyboard decides every key's tap or hold itself (firmware D-F27)");
    assert.ok(!firmwareFacts({...model, firmware: null}).some((fact) => fact.label === "LEDs"), "an unreported ceiling is left out");
});
