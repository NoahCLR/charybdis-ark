import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {said} from "../../webview/view/vocabulary.mjs";
import {ACCENT_STAGES, accentBudget, accentOwner, accentRows, accentsFor, accentsWhen, allAccents, everyOwner, feedbackOwner, feedbackRowOf, ownerCalled, ownerMark, ownerPlace, replacementOwner, replacementRowOf, stageShade} from "../../webview/view/accents.mjs";

const require = createRequire(import.meta.url);
const {publishedModel} = require("../fixtures/published-model.js");
const {RGB_AUTOCORRECT_SEMANTICS, RGB_EVERY_OWNER, RGB_KEY_SEMANTICS} = require("../../core/schema/rgb-domain-v1");
const {VOCABULARY} = require("../../core/model/vocabulary");
const {rgbForView} = require("../../core/model/device-profile-view");
const {decodedDeviceProfile} = require("../fixtures/device-profile");

const colour = (h, s, v) => ({h: String(h), s: String(s), v: String(v)});
const accent = (index, owner, ledIndices, color = colour(0, 255, 200)) => ({index, owner, color, ledIndices, leds: `LEDs ${ledIndices.join(", ")}`});

// The fixture keyboard, with accents on Base, Symbol (Layer 2) and every layer.
function model() {
    const published = publishedModel();
    published.rgb.layerAccents = [
        accent(0, "Layer 0", [24, 25]),
        accent(1, "Layer 2", [39, 42], colour(0, 0, 0)),
        accent(2, "RGB_LAYER_GROUP_ALL", [56]),
        accent(3, "Layer 2", [51]),
    ];
    published.portable = {...published.portable, usage: {used: 1, capacity: 2, source: "draft", counts: [
        {id: "lightingGroupRows", used: 6, limit: 32}, {id: "lightingGroups", used: 4, limit: 16}, {id: "macros", used: 1, limit: 128}]}};
    return published;
}

test("the owner a stage's tab shows: its layer, slot or behaviour state", () => {
    const published = model();
    assert.deepEqual(accentOwner(published, "layers", {layer: 2}), {target: "layer", owner: "Layer 2"});
    assert.deepEqual(accentOwner(published, "pd", {pointingSlot: 1}), {target: "pdMode", owner: "POINTING_MODE_VOLUME"});
    assert.deepEqual(accentOwner(published, "combo", {}), {target: "combo", owner: ""}, "combo accents have one owner, every combo");
    assert.deepEqual(accentOwner(published, "key", {feedbackRow: "holdActiveColor"}), {target: "keyBehavior", owner: "KEY_FEEDBACK_GROUP_HOLD_ACTIVE"});
    assert.deepEqual(accentOwner(published, "autocorrect", {replacementRow: "undoColor"}), {target: "autocorrect", owner: "AUTOCORRECT_FEEDBACK_GROUP_UNDO"});
    assert.deepEqual(accentOwner(published, "autocorrect", {}), {target: "autocorrect", owner: "AUTOCORRECT_FEEDBACK_GROUP_TEXT"}, "the first case, as its tab picks it");
    assert.equal(accentOwner(published, "base", {}), null, "the background effect and the fade have none");
    assert.equal(accentOwner(published, "auto", {}), null);
});

test("every owner the interface names is one the core publishes and reads", () => {
    // The owner that is all of a table's, as core publishes a row with the all selector.
    const domain = decodedDeviceProfile().domains.rgb;
    const black = {h: 0, s: 0, v: 0};
    domain.layerGroupRows = [{selector: 255, groupId: 0, color: black}];
    domain.pdModeGroupRows = [{selector: 255, groupId: 0, color: black}];
    domain.keyGroupRows = [{semantic: RGB_KEY_SEMANTICS.KEY_FEEDBACK_GROUP_ALL, groupId: 0, color: black}];
    domain.autocorrectGroupRows = [{semantic: RGB_AUTOCORRECT_SEMANTICS.AUTOCORRECT_FEEDBACK_GROUP_ALL, groupId: 0, color: black}];
    const all = rgbForView(domain);
    const published = model();
    assert.deepEqual([all.layerAccents[0].owner, all.pdModeAccents[0].owner, all.keyFeedbackAccents[0].owner, all.autocorrectFeedbackAccents[0].owner],
        [everyOwner(published, "layer"), everyOwner(published, "pdMode"), everyOwner(published, "keyBehavior"), everyOwner(published, "autocorrect")]);
    // Each Replacement feedback row is a case the keyboard knows, and each case opens on the row that shows it.
    for (const row of Object.keys(published.rgb.autocorrectFeedback).filter((field) => field !== "locality")) {
        assert.ok(Object.keys(RGB_AUTOCORRECT_SEMANTICS).includes(replacementOwner(published, row)), row);
        assert.equal(replacementRowOf(published, replacementOwner(published, row)), row);
    }
    assert.equal(replacementOwner(published, "nothing"), "AUTOCORRECT_FEEDBACK_GROUP_TEXT", "a row the tab lacks reads as its first");
    assert.equal(everyOwner(published, "combo"), undefined, "every combo shares the combo accents, so none stands for all of them");
    for (const row of ["tapCommittedColor", "holdActiveColor", "longHoldActiveColor", "branch:0", "branch:3"]) {
        assert.ok(Object.keys(RGB_KEY_SEMANTICS).includes(feedbackOwner(published, row)), row);
    }
    assert.equal(feedbackOwner(published, "branch:2"), "KEY_FEEDBACK_GROUP_TAP_BRANCH_PENDING", "every tap branch waits as one state");
    for (const owner of ["KEY_FEEDBACK_GROUP_TAP_COMMITTED", "KEY_FEEDBACK_GROUP_HOLD_ACTIVE", "KEY_FEEDBACK_GROUP_LONG_HOLD_ACTIVE", "KEY_FEEDBACK_GROUP_TAP_BRANCH_PENDING"]) {
        assert.equal(feedbackOwner(published, feedbackRowOf(published, owner)), owner, `${owner} opens on a row that shows it`);
    }
});

test("each Lighting stage with accents edits one of core's accent tables", () => {
    assert.deepEqual(new Set(Object.values(ACCENT_STAGES)), new Set(Object.keys(VOCABULARY.accents)));
    assert.deepEqual(Object.keys(RGB_EVERY_OWNER).every((target) => Object.values(ACCENT_STAGES).includes(/** @type {any} */ (target))), true);
});

test("an owner's place and mark on its stage: its layer, slot or feedback row, or every one of them", () => {
    const published = model();
    assert.deepEqual(ownerPlace(published, "layer", "Layer 2"), {every: false, layer: 2});
    assert.deepEqual(ownerPlace(published, "layer", "RGB_LAYER_GROUP_ALL"), {every: true});
    assert.deepEqual(ownerPlace(published, "pdMode", "POINTING_MODE_VOLUME"), {every: false, slot: 1});
    assert.deepEqual(ownerPlace(published, "keyBehavior", "KEY_FEEDBACK_GROUP_HOLD_ACTIVE"), {every: false, feedbackRow: "holdActiveColor"});
    assert.deepEqual(ownerPlace(published, "keyBehavior", "KEY_FEEDBACK_GROUP_ALL"), {every: true});
    assert.deepEqual(ownerPlace(published, "autocorrect", "AUTOCORRECT_FEEDBACK_GROUP_MACRO"), {every: false, replacementRow: "macroColor"});
    assert.deepEqual(ownerPlace(published, "autocorrect", "AUTOCORRECT_FEEDBACK_GROUP_ALL"), {every: true});
    assert.equal(ownerMark(published, "autocorrect", "AUTOCORRECT_FEEDBACK_GROUP_MACRO"), null, "a replacement case has no mark of its own");
    assert.deepEqual(ownerMark(published, "layer", "Layer 2"), {kind: "layer", layer: 2});
    assert.deepEqual(ownerMark(published, "pdMode", "POINTING_MODE_VOLUME"), {kind: "pointing", slot: 1});
    assert.deepEqual(ownerMark(published, "keyBehavior", "KEY_FEEDBACK_GROUP_HOLD_ACTIVE"), {kind: "tier", tier: "hold"});
    assert.equal(ownerMark(published, "layer", "RGB_LAYER_GROUP_ALL"), null, "every layer's has no one mark");
    assert.equal(ownerMark(published, "combo", ""), null);
});

test("a layer's tab edits its own accents and every layer's, in paint order, and shows Base's beneath", () => {
    const published = model();
    const symbol = accentsFor(published, "layer", "Layer 2");
    assert.deepEqual(symbol.here.map((row) => row.index), [1, 2, 3], "its own and every layer's, by their place in the table, which an edit names");
    assert.deepEqual(symbol.beneath.map((row) => row.index), [0], "Base's accents stay lit over the layers above");
    const base = accentsFor(published, "layer", "Layer 0");
    assert.deepEqual([base.here.map((row) => row.index), base.beneath], [[0, 2], []], "Base has nothing beneath it");
    const combo = accentsFor(published, "combo", "");
    assert.deepEqual([combo.here, combo.beneath], [accentRows(published, "combo"), []], "every combo accent is the combo tab's own");
});

test("owners and when their accents light read in the vocabulary's words", () => {
    const published = model();
    assert.equal(ownerCalled(published, "layer", "Layer 2"), "Symbol");
    assert.equal(ownerCalled(published, "layer", "RGB_LAYER_GROUP_ALL"), "Every layer");
    assert.equal(ownerCalled(published, "pdMode", "POINTING_MODE_DRAGSCROLL"), "Dragscroll");
    assert.equal(ownerCalled(published, "keyBehavior", "KEY_FEEDBACK_GROUP_HOLD_ACTIVE"), "Hold active");
    assert.equal(ownerCalled(published, "autocorrect", "AUTOCORRECT_FEEDBACK_GROUP_UNDO"), "Replacement undone");
    assert.equal(ownerCalled(published, "autocorrect", "AUTOCORRECT_FEEDBACK_GROUP_ALL"), "Every case");
    assert.equal(ownerCalled(published, "autocorrect", "AUTOCORRECT_FEEDBACK_GROUP_LEADING"), "Leader waiting", "the case the leader holds while it waits (D-L92)");
    assert.equal(said(accentsWhen(published, "autocorrect", "AUTOCORRECT_FEEDBACK_GROUP_TEXT")),
        "LEDs that light in a colour of their own while the keyboard shows Replaced with text, with those for every case: the same LEDs whichever key caused it, or none.");
    assert.match(said(accentsWhen(published, "layer", "Layer 2")), /while Symbol is on, with those for every layer\..*lower layer stays lit/);
    assert.match(said(accentsWhen(published, "combo", "")), /same LEDs for every combo/);
    assert.doesNotMatch(said(accentsWhen(published, "keyBehavior", "KEY_FEEDBACK_GROUP_HOLD_ACTIVE")), /\{owner\}/);
});

test("an accent that takes its stage's colour takes the layer's where it paints, and the mode's or feedback's", () => {
    const published = model();
    published.rgb.layerColors = [{layer: "Layer 0", layerId: 0, color: colour(0, 0, 0), mode: "ALL_KEYS"}, {layer: "Layer 2", layerId: 2, color: colour(90, 255, 200), mode: "ALL_KEYS"}];
    assert.deepEqual(stageShade(published, "layer", "Layer 2", {}), colour(90, 255, 200));
    assert.equal(stageShade(published, "layer", "Layer 0", {}), null, "a layer with no colour paints nothing");
    assert.deepEqual(stageShade(published, "layer", "RGB_LAYER_GROUP_ALL", {layer: 2}), colour(90, 255, 200), "every layer's takes the shown layer's");
    assert.deepEqual(stageShade(published, "keyBehavior", "KEY_FEEDBACK_GROUP_HOLD_ACTIVE", {}), published.rgb.keyBehaviorFeedback.holdActiveColor);
    assert.deepEqual(stageShade(published, "combo", "", {}), published.rgb.comboFeedback.color);
    // A replacement case's colour, the picked case's for every flash, and nothing for a case that is off.
    published.rgb.autocorrectFeedback = {textColor: colour(106, 255, 200), macroColor: colour(9, 0, 0), undoColor: colour(0, 255, 0), locality: "RGB_KEY_HALF"};
    assert.deepEqual(stageShade(published, "autocorrect", "AUTOCORRECT_FEEDBACK_GROUP_TEXT", {}), colour(106, 255, 200));
    assert.deepEqual(stageShade(published, "autocorrect", "AUTOCORRECT_FEEDBACK_GROUP_ALL", {replacementRow: "textColor"}), colour(106, 255, 200), "every flash's takes the picked case's");
    assert.equal(stageShade(published, "autocorrect", "AUTOCORRECT_FEEDBACK_GROUP_MACRO", {}), null, "a case that is off paints nothing, at any hue");
    assert.equal(stageShade(published, "autocorrect", "AUTOCORRECT_FEEDBACK_GROUP_ALL", {replacementRow: "macroColor"}), null);
    assert.deepEqual(stageShade(published, "autocorrect", "AUTOCORRECT_FEEDBACK_GROUP_UNDO", {}), colour(0, 255, 0), "brightness alone at zero is black, which is painted");
});

test("the budget counts accents and LED sets against the keyboard, and All accents lists every one by stage and owner", () => {
    const published = model();
    assert.deepEqual(accentBudget(published).map(({id, label, used, limit}) => ({id, label, used, limit})), [{id: "lightingGroupRows", label: "Accents", used: 6, limit: 32}, {id: "lightingGroups", label: "LED sets", used: 4, limit: 16}]);
    assert.deepEqual(accentBudget(published).map((count) => count.what), [VOCABULARY.usageCounts.lightingGroupRows.what, VOCABULARY.usageCounts.lightingGroups.what], "with what each counts, as the Memory card says it");
    assert.deepEqual(accentBudget({...published, portable: {...published.portable, usage: null}}), [], "nothing when the core sent no usage");
    const listed = allAccents(published);
    assert.deepEqual(listed.map((entry) => entry.stage), ["layers", "pd", "combo", "key", "autocorrect"].filter((stage) => listed.some((entry) => entry.stage === stage)));
    assert.deepEqual(listed.find((entry) => entry.stage === "autocorrect"), {stage: "autocorrect", target: "autocorrect",
        owners: [{owner: "AUTOCORRECT_FEEDBACK_GROUP_ALL", rows: published.rgb.autocorrectFeedbackAccents}]}, "the demo's accent for every replacement flash");
    assert.deepEqual(listed[0].owners.map((entry) => [entry.owner, entry.rows.map((row) => row.index)]),
        [["Layer 0", [0]], ["Layer 2", [1, 3]], ["RGB_LAYER_GROUP_ALL", [2]]]);
});
