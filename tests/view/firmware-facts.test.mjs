// What this firmware was built with, as the Keyboard screen states it (view/firmware-facts.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {firmwareFacts} from "../../webview/view/firmware-facts.mjs";

const require = createRequire(import.meta.url);
const {openDraft, panelModel} = require("../fixtures/published-model");
const {document} = require("../fixtures/pd-profile");
// The panel's model for current firmware, its ceilings as the firmware reports them.
const {draft, state} = openDraft(document());
const model = panelModel(draft, state);

test("the firmware facts state what the firmware reports, each needing a build", () => {
    const facts = firmwareFacts(model);
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
