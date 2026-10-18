// The Settings screen's layout, search and firmware facts (view/settings-layout.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {elsewhereWords, firmwareFacts, foldedCount, matchesElsewhere, matchesQuery, noMatchWords, settingsCards} from "../../webview/view/settings-layout.mjs";

const require = createRequire(import.meta.url);
const portable = require("../../core/model/portable-profile");
const {buildSnapshotModel} = require("../../core/session/device-model");
const {DEMO_CAPABILITIES, DEMO_LIMITS, DEMO_OPTIONS} = require("../../core/session/demo-session");
const {document} = require("../fixtures/pd-profile");
const doc = document();
const snapshot = {document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: DEMO_LIMITS, options: DEMO_OPTIONS};
const model = {...buildSnapshotModel(snapshot, DEMO_CAPABILITIES, {editable: true, reason: null}), keyboardName: {name: "", builtIn: "", identity: "", perName: 32}};
const settings = model.configDefaults.filter((section) => section.area === "Settings");

test("Settings draws its cards in the decided order, and keeps any section it does not place", () => {
    const cards = settingsCards(settings);
    assert.deepEqual(cards.map((card) => card.id), ["keyTiming", "where", "comboTiming", "comboReferences", "keyboardOptions", "host", "others", "startupLayers", "builtIn"]);
    assert.deepEqual(cards.find((card) => card.id === "where")?.sections.map((section) => section.id), ["behaviorSettings", "comboSettings"]);
    const placed = cards.flatMap((card) => card.sections.map((section) => section.id));
    assert.deepEqual([...placed].sort(), settings.map((section) => section.id).sort(), "every Settings section is drawn once");
});

test("a folded section counts what it holds in words", () => {
    assert.equal(foldedCount(settings.find((section) => section.id === "startupLayers")), "16 layers");
    assert.equal(foldedCount(settings.find((section) => section.id === "comboReferences")), "16 layers");
    assert.equal(foldedCount(settings.find((section) => section.id === "keyboardOptions")), "13 options");
});

test("search reads hover help and other names, says when nothing matches, and points at other screens", () => {
    assert.ok(matchesQuery({label: "Dual-role", tooltip: "QMK's tapping term"}, "tapping term"));
    assert.equal(noMatchWords(" qwerty "), "No setting matches “qwerty”.");
    const dpi = matchesElsewhere(model, "dpi");
    assert.deepEqual(dpi.map((entry) => entry.screen), ["mouse"]);
    assert.match(elsewhereWords(dpi[0]), /^\d+ match(es)? on Trackball →$/);
    assert.deepEqual(matchesElsewhere(model, "name").map((entry) => entry.screen), ["device"], "the keyboard's name is edited on Keyboard");
    assert.deepEqual(matchesElsewhere(model, ""), []);
});

test("the firmware facts state what the firmware reports, each needing a build", () => {
    const facts = firmwareFacts({...model, firmware: {layers: 16, tapCounts: 5, macros: 128, customKeys: 128, leds: 58, combos: 128, repeatHz: 100}});
    const by = Object.fromEntries(facts.map((fact) => [fact.label, fact.value]));
    assert.equal(by.Layers, "16 layers");
    assert.equal(by["Tap counts"], "5 per behaviour");
    assert.equal(by.LEDs, "58 LEDs");
    assert.equal(by["Repeat ceiling"], "100 Hz");
    assert.equal(by["Brightness ceiling"], String(model.rgb.maximumBrightness));
    assert.ok(facts.every((fact) => /Needs a firmware build/.test(fact.hint)));
    assert.ok(facts.some((fact) => fact.label === "QMK tap-hold options" && /cannot show them/.test(fact.hint)), "what Ark cannot read is said, not guessed");
    assert.ok(!firmwareFacts({...model, firmware: null}).some((fact) => fact.label === "LEDs"), "an unreported ceiling is left out");
});
