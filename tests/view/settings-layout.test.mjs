// The Settings screen's layout, folds and search (view/settings-layout.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {elsewhereWords, fieldParts, foldedSummary, layerSwitchSummary, matchesElsewhere, matchesQuery, noMatchWords, referenceSummary, settingsCards, startsFolded} from "../../webview/view/settings-layout.mjs";

const require = createRequire(import.meta.url);
const portable = require("../../core/model/portable-profile");
const {buildSnapshotModel} = require("../../core/session/device-model");
const {DEMO_CAPABILITIES, DEMO_LIMITS, DEMO_OPTIONS} = require("../../core/session/demo-session");
const {document} = require("../fixtures/pd-profile");
const doc = document();
const snapshot = {document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: DEMO_LIMITS, options: DEMO_OPTIONS};
const model = {...buildSnapshotModel(snapshot, DEMO_CAPABILITIES, {editable: true, reason: null}), keyboardName: {name: "", builtIn: "", identity: "", perName: 32}};
const settings = model.configDefaults.filter((section) => section.area === "Settings");
const byId = (id) => settings.find((section) => section.id === id);
const nameOf = (index) => ["Base", "Numbers", "Symbols", "Navigation"][index] || `Layer ${index}`;

test("Settings draws its cards in the order they are reached for, and keeps any section it does not place", () => {
    const cards = settingsCards(settings);
    assert.deepEqual(cards.map((card) => card.id), ["keyTiming", "keyboardOptions", "behaviorSettings", "comboSettings", "host", "others", "startupLayers"]);
    assert.deepEqual(cards.find((card) => card.id === "comboSettings")?.sections.map((section) => section.id), ["comboSettings", "comboReferences"],
        "every combo setting is one card");
    const placed = cards.flatMap((card) => card.sections.map((section) => section.id));
    assert.deepEqual([...placed].sort(), settings.map((section) => section.id).sort(), "every Settings section is drawn once");
    assert.ok(!settings.some((section) => ["rgbAppearance", "lightingPower", "lightingFeedback"].includes(section.id)), "lighting is set on Lighting");
});

test("what is tuned often starts open; what is set once starts folded, unless it has something to say", () => {
    const cards = Object.fromEntries(settingsCards(settings).map((card) => [card.id, card]));
    assert.equal(startsFolded(cards.keyTiming, byId("keyTiming")), false);
    assert.equal(startsFolded(cards.behaviorSettings, byId("behaviorSettings")), false);
    assert.equal(startsFolded(cards.comboSettings, byId("comboSettings")), false);
    assert.equal(startsFolded(cards.keyboardOptions, byId("keyboardOptions")), true);
    assert.equal(startsFolded(cards.startupLayers, byId("startupLayers")), true);
    assert.equal(startsFolded(cards.host, byId("host")), true);
    assert.equal(startsFolded(cards.host, {...byId("host"), warning: "This layout is not a macOS layout."}), false, "a warning opens Your computer");
});

test("a folded card says what it holds, not how many", () => {
    assert.equal(foldedSummary(byId("startupLayers"), nameOf), "Base");
    const options = byId("keyboardOptions");
    assert.equal(foldedSummary(options, nameOf), "All off");
    const on = (macros) => ({...options, fields: options.fields.map((field) => ({...field, enabled: macros.includes(field.macro)}))});
    const label = (macro) => options.fields.find((field) => field.macro === macro).label;
    const [first, second] = options.fields.filter((field) => !field.notBuilt).map((field) => field.macro);
    assert.equal(foldedSummary(on([first]), nameOf), label(first), "an option on, in the words of its switch");
    assert.equal(foldedSummary(on([first, second]), nameOf), `2 on: ${label(first)}, ${label(second)}`);
    const unbuilt = on([first]);
    assert.equal(foldedSummary({...unbuilt, fields: unbuilt.fields.map((field) => field.macro === first ? {...field, notBuilt: true} : field)}, nameOf), "All off",
        "an option the firmware was built without does nothing, whatever it reads");
    assert.equal(foldedSummary({...options, fields: []}, nameOf), "Not read", "options the keyboard has not reported");
    assert.match(foldedSummary(byId("host"), nameOf), /^Auto · /, "the operating system and layout chosen");
    assert.equal(foldedSummary(byId("comboReferences"), nameOf), "Each layer its own");
});

test("a row of layer switches says which layers it leaves out", () => {
    const fields = (on) => on.map((enabled, layer) => ({kind: "toggle", governs: {kind: "layer", layer}, enabled, macro: `l${layer}`, label: ""}));
    assert.equal(layerSwitchSummary(fields([true, true, true, true]), nameOf), "All 4 layers");
    assert.equal(layerSwitchSummary(fields([true, true, false, true]), nameOf), "Off on Symbols");
    assert.equal(layerSwitchSummary(fields([true, false, false, true]), nameOf), "Off on Numbers and Symbols");
    assert.equal(layerSwitchSummary(fields([true, false, false, false]), nameOf), "Only Base");
    assert.equal(layerSwitchSummary(fields([false, false, false, false]), nameOf), "No layers");
    assert.equal(layerSwitchSummary(fields([true, true, true, false, false, false]), nameOf), "3 of 6 layers");
    const behaviours = byId("behaviorSettings").fields.filter((field) => field.governs?.kind === "layer");
    assert.equal(layerSwitchSummary(behaviours, nameOf), "All 16 layers");
});

test("Combo layer matching names the layers that borrow another's keys", () => {
    const section = byId("comboReferences");
    const borrow = (pairs) => ({...section, fields: section.fields.map((field) => pairs[field.governs.layer] === undefined ? field : {...field, value: `Layer ${pairs[field.governs.layer]}`})});
    assert.equal(referenceSummary(borrow({1: 0}), nameOf), "Numbers uses Base");
    assert.equal(referenceSummary(borrow({1: 0, 2: 0, 3: 0}), nameOf), "Numbers uses Base, Symbols uses Base, +1");
});

test("Key swaps & typing lists its fields under what they change", () => {
    assert.deepEqual(fieldParts(byId("keyboardOptions").fields).map(({part, fields}) => [part, fields.length]), [["Modifiers", 7], ["Keys", 3], ["Typing", 3]]);
    assert.deepEqual(fieldParts(byId("keyTiming").fields).map(({part}) => part), [""], "a section without parts is one");
});

test("search reads hover help and other names, says when nothing matches, and points at other screens", () => {
    assert.ok(matchesQuery({label: "Dual-role", tooltip: "QMK's tapping term"}, "tapping term"));
    assert.equal(noMatchWords(" qwerty "), "No setting matches “qwerty”.");
    const dpi = matchesElsewhere(model, "dpi");
    assert.deepEqual(dpi.map((entry) => entry.screen), ["mouse", "device"], "the pointer's speed, and the DPI steps this firmware was built with");
    assert.match(elsewhereWords(dpi[0]), /^\d+ match(es)? on Mouse →$/);
    assert.deepEqual(matchesElsewhere(model, "name").map((entry) => entry.screen), ["device"], "the keyboard's name is edited on Keyboard");
    assert.deepEqual(matchesElsewhere(model, "idle timeout").map((entry) => entry.screen), ["lighting"], "All lighting is on Lighting");
    assert.deepEqual(matchesElsewhere(model, "base lighting").map((entry) => entry.screen), ["lighting"], "found by the name it had in Settings");
    assert.deepEqual(matchesElsewhere(model, "built into this firmware").map((entry) => entry.screen), ["device"]);
    assert.deepEqual(matchesElsewhere(model, ""), []);
});
