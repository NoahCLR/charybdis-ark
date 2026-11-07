import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {SECTION_ROWS, activeBlockers, categorySummary, changesKept, discardLabel, draftDot, draftMarks, groupNote, placeState, reviewBlocks, saveOffReason, statusBesideCount, statusSummary, stillShown} from "../../webview/view/review.mjs";
import {LIVE, LIVE_REVIEW} from "../../webview/view/edit-mode.mjs";

const {VOCABULARY} = createRequire(import.meta.url)("../../core/model/vocabulary");
const words = {vocabulary: VOCABULARY};

const item = (area, title, group, extra = {}) => ({area, title, group, status: "changed", fields: [], ...extra});

test("every item sits under its own area; a group that spans areas shows its part in each", () => {
    const changes = [
        item("Behaviours", "Esc", 0, {groupTitle: "Moved a behaviour", status: "removed"}),
        item("Keys", "Base · Left · row 1, column 1", 0, {groupTitle: "Moved a behaviour"}),
        item("Behaviours", "Q", 0, {groupTitle: "Moved a behaviour", status: "added"}),
        item("Keys", "Base · Left thumb 1", 1),
        item("Macros", "Macro 3", 2),
        item("Lighting", "Navigation colour", 0, {groupTitle: "Moved a behaviour"}),
    ];
    const sections = reviewBlocks(changes);
    assert.deepEqual(sections.map((section) => section.area), ["Keys", "Behaviours", "Macros", "Lighting"], "areas in rail order");
    const [layout, behaviours, , lighting] = sections;
    assert.deepEqual(layout.blocks.map((block) => block.items.map((entry) => entry.title)),
        [["Base · Left · row 1, column 1"], ["Base · Left thumb 1"]], "the group's key sits with the other keys, in the core's order");
    assert.equal(layout.count, 2);
    assert.deepEqual(behaviours.blocks[0].items.map((entry) => entry.title), ["Esc", "Q"], "a group's items in one area stay one block");
    assert.equal(behaviours.count, 2);
    for (const part of [layout.blocks[0], behaviours.blocks[0], lighting.blocks[0]]) {
        assert.equal(part.group, 0);
        assert.equal(part.title, "Moved a behaviour");
        assert.equal(part.size, 4, "every part knows the whole group, for its Discard");
    }
    assert.deepEqual(behaviours.blocks[0].elsewhere, ["Keys", "Lighting"], "the other areas it reaches, in rail order");
    assert.equal(layout.blocks[1].size, 1);
    assert.deepEqual(layout.blocks[1].elsewhere, []);
});

test("a recovery item with no group is a block of its own", () => {
    const sections = reviewBlocks([item("Recovery", "Complete profile", null), item("Recovery", "Other", null)]);
    assert.deepEqual(sections[0].blocks.map((block) => block.size), [1, 1]);
});

test("a group's header says how much of it is here and where the rest is", () => {
    const [layout, behaviours] = reviewBlocks([
        item("Keys", "a", 0), item("Behaviours", "b", 0), item("Behaviours", "c", 0), item("Combos", "d", 0), item("Lighting", "e", 0),
        item("Keys", "f", 1), item("Keys", "g", 1),
    ]);
    assert.equal(groupNote(layout.blocks[0]), "1 of 5 here, the rest in Behaviours, Combos and Lighting · discarded together");
    assert.equal(groupNote(behaviours.blocks[0]), "2 of 5 here, the rest in Keys, Combos and Lighting · discarded together");
    assert.equal(groupNote(layout.blocks[1]), "2 changes, discarded together");
});

test("the header counts items by what happened to them", () => {
    const changes = [item("Keys", "a", 0), item("Keys", "b", 1, {status: "added"}), item("Macros", "c", 2, {status: "added"})];
    assert.equal(statusSummary(changes), "2 added · 1 changed");
    assert.equal(statusBesideCount(changes), "2 added · 1 changed", "a mix says what kinds");
    assert.equal(statusBesideCount([{status: "changed"}, {status: "changed"}]), "", "only changes repeat the count beside it");
    assert.equal(statusBesideCount([{status: "removed"}]), "1 removed", "a removal still says so");
});

test("a Discard says how much it takes back", () => {
    assert.equal(discardLabel({size: 1, items: [1]}), "Discard");
    assert.equal(discardLabel({size: 2, items: [1, 2]}), "Discard both");
    assert.equal(discardLabel({size: 81, items: [1, 2, 3]}), "Discard all 81", "a part of a group names the whole group");
});

test("Show goes to where each kind of item is edited", () => {
    const layers = [{index: 0}, {index: 1}, {index: 2}];
    assert.deepEqual(placeState({kind: "key", layer: 2, layoutIndex: 13}, layers), {screen: "keys", tab: "key", layer: 2, selected: 13});
    assert.equal(placeState({kind: "behaviour", keycode: "KC_ESCAPE"}).behaviourRow, "KC_ESCAPE");
    assert.equal(placeState({kind: "macro", index: 4, keycode: "MACRO_4"}).macroSlot, "MACRO_4");
    assert.deepEqual(placeState({kind: "customKey", index: 2, keycode: "CUSTOM_KEY_2"}), {screen: "customKeys", customKey: "CUSTOM_KEY_2"});
    assert.ok(draftMarks([{place: {kind: "customKey", index: 2, keycode: "CUSTOM_KEY_2"}, status: "changed"}]).customKeys.has("CUSTOM_KEY_2"));
    assert.deepEqual(categorySummary(words, [{place: {kind: "customKey", index: 2, keycode: "CUSTOM_KEY_2"}, status: "changed"}]).map(({category, rows}) => [category, rows]),
        [["Keys", [{label: "Custom keys", count: 1}]]], "names and shortcuts alike");
    assert.equal(placeState({kind: "pointing", slot: 6}).pointingSlot, 6);
    // A bank's order (D-L81) opens its screen on the lowest slot that moved.
    assert.deepEqual(placeState({kind: "slots", bank: "macros", keycodes: ["MACRO_2", "MACRO_10"]}), {screen: "macros", macroSlot: "MACRO_2"});
    assert.deepEqual(placeState({kind: "slots", bank: "customKeys", keycodes: ["CUSTOM_KEY_3", "CUSTOM_KEY_20"]}), {screen: "customKeys", customKey: "CUSTOM_KEY_3"});
    assert.deepEqual(placeState({kind: "slots", bank: "pdModes", slots: [1, 6]}), {screen: "pointing", pointingSlot: 1, pdKind: null, pdTaps: null});
    assert.equal(placeState({kind: "lighting", stage: "pd"}).stage, "pd");
    assert.equal(placeState(null), null, "the profile fallback has nowhere to go");
    const combo = placeState({kind: "combo", index: 3});
    assert.equal(combo.pickCombo, 3, "a combo is asked for by id, since its group depends on the layer");
    assert.equal(combo.reveal, '[data-reach][data-picked="true"]');
    assert.equal(placeState({kind: "behaviour", keycode: "KC_A"}).reveal, 'tr[data-row][data-picked="true"]',
        "a behaviour is revealed at its picked row in the Behaviours table");
    // A section opens the Settings screen that draws it, at that section.
    const lands = (section, area = "Settings") => placeState({kind: "settings", section, area});
    assert.deepEqual(lands("keyTiming"), {screen: "behaviours", reveal: '.settings-group[data-section="keyTiming"]'});
    assert.equal(lands("behaviorSettings").screen, "behaviours");
    assert.equal(lands("comboSettings").screen, "combos", "the combo timing too, saved with the combos");
    assert.equal(lands("comboReferences").screen, "combos");
    assert.equal(lands("host").screen, "host");
    assert.equal(lands("keyboardOptions").screen, "host");
    for (const section of ["normalPointerSpeed", "sniping", "autoMouse"]) {
        assert.deepEqual(lands(section, "Pointer"), {screen: "pointer", reveal: `.settings-group[data-section="${section}"]`}, `${section} is a pointer setting`);
    }
    assert.deepEqual(lands("keyboard"), {screen: "device"}, "the keyboard's name is the Keyboard screen's title");
    assert.equal(lands("startupLayers"), null, "Default layers has no editor, so its row has no Show");
    assert.equal(placeState({kind: "settings"}), null, "stored key options Ark has no switch for have nowhere to go");
    assert.deepEqual(placeState({kind: "settings", section: "automouseFade", area: "Lighting", stage: "auto"}), {screen: "lighting", stage: "auto"},
        "a section timed on a lighting stage opens that stage");
    assert.deepEqual(placeState({kind: "settings", section: "lightingPower", area: "Lighting"}), {screen: "lighting", reveal: '.settings-group[data-section="lightingPower"]'},
        "a Lighting section above every stage opens Lighting at it");
});

test("a removed thing keeps its mark and its Show only where it is still on screen", () => {
    const removed = (place) => ({status: "removed", place});
    assert.equal(stillShown(removed({kind: "pointing", slot: 4})), true, "a cleared slot is still a card");
    assert.equal(stillShown(removed({kind: "macro", index: 2, keycode: "MACRO_2"})), true, "an emptied macro is still a slot");
    assert.equal(stillShown(removed({kind: "behaviour", keycode: "KC_2"})), false, "a removed behaviour has no row left");
    assert.equal(stillShown(removed({kind: "combo", index: 1})), false);
    const marks = draftMarks([removed({kind: "pointing", slot: 4}), removed({kind: "behaviour", keycode: "KC_2"})]);
    assert.deepEqual([...marks.pointing], [4]);
    assert.equal(marks.behaviours.size, 0);
});

test("a reorder marks the layers it moved, not their keys", () => {
    const marks = draftMarks([{status: "changed", place: {kind: "layers", layers: [2, 3]}}]);
    assert.deepEqual([...marks.layers], [2, 3]);
    assert.equal(marks.keys.size, 0);
    assert.equal(marks.layerNames, true);
});

test("a settings section timed on a lighting stage marks that stage's tab too", () => {
    const marks = draftMarks([{status: "changed", place: {kind: "settings", section: "automouseFade", area: "Lighting", stage: "auto"}}]);
    assert.deepEqual([...marks.settings], ["automouseFade"]);
    assert.deepEqual([...marks.lighting], ["auto"]);
});

test("a profile file's differences are counted by what they configure, split as each screen is", () => {
    const at = (place, extra = {}) => ({status: "changed", place, ...extra});
    const groups = categorySummary(words, [
        at({kind: "pointing", slot: 2}), at({kind: "settings", section: "sniping"}), at({kind: "settings", section: "autoMouse"}),
        at({kind: "lighting", stage: "key"}), at({kind: "settings", section: "lightingFeedback", area: "Lighting", stage: "key"}), at({kind: "lighting", stage: "layers", layer: 3}),
        at({kind: "lighting", stage: null}), at({kind: "settings", section: "rgbAppearance", area: "Lighting", stage: "base"}), at({kind: "settings", section: "lightingPower", area: "Lighting"}),
        at({kind: "settings", section: "automouseFade", area: "Lighting", stage: "auto"}),
        at({kind: "combo", index: 7}, {status: "removed"}), at({kind: "key", layer: 3}), at({kind: "key", layer: 0}), at({kind: "key", layer: 3}),
        at({kind: "settings", section: "keyTiming"}), at({kind: "behaviour"}, {status: "added"}), at({kind: "layers"}, {unit: "layerName:2"}),
        at({kind: "settings"}, {unit: "settings:otherKeyOptions"}), at({kind: "macro", index: 4, keycode: "MACRO_4"}), at(null, {unit: "profile", title: "Stored profile"}),
    ], {names: ["Base", "Numbers", "Symbols", "Navigation"]});
    assert.deepEqual(groups.map((group) => [group.category, group.count]),
        [["Keys", 8], ["Lighting", 7], ["Macros", 1], ["Pointer", 2], ["Pointing modes", 1], ["Other", 1]], "the rail's order");
    const rows = (category) => groups.find((group) => group.category === category).rows.map((row) => `${row.label} ${row.count}`);
    assert.deepEqual(rows("Keys"), ["Keys on Base 1", "Keys on Navigation 2", "Layer names 1", "Behaviours 1", "Tap & hold timing 1", "Combos 1", "Key swaps & typing 1"],
        "the board's keys by layer first, then the rest of the Keys screen");
    assert.deepEqual(rows("Lighting"), ["All lighting 1", "Stages on or off 1", "Background effect 1", "Layer colours 1", "Auto-mouse fade 1", "Key feedback 2"],
        "all lighting first, then stages in paint order; a setting edited on a stage counts with it");
    assert.deepEqual(rows("Pointer"), ["Auto-sniping 1", "Auto-mouse 1"], "the pointer's settings are filed with Pointer, the screen that edits them");
    assert.deepEqual(rows("Pointing modes"), [], "the slots are the whole category");
    assert.deepEqual(rows("Other"), ["Stored profile 1"]);
    assert.deepEqual(rows("Macros"), [], "a category that is its one row shows no rows");
    assert.equal(groups[0].status, "1 added · 6 changed · 1 removed");
});

// The summary's own words for settings sections, as it has always shown them;
// three differ from the Settings screens' section labels.
test("a profile file's settings sections are counted under the vocabulary's words, each in its category", () => {
    assert.deepEqual(Object.keys(SECTION_ROWS).sort(), Object.keys(VOCABULARY.fileSections).sort(), "every section placed has words, and only those");
    const at = (section) => ({status: "changed", place: {kind: "settings", section}});
    const labels = Object.fromEntries(categorySummary(words, Object.keys(SECTION_ROWS).map(at))
        .flatMap((group) => group.rows.map((row) => [row.label, group.category])));
    assert.deepEqual(labels, {
        "Tap & hold timing": "Keys", "Default layers": "Keys", "Behaviour settings": "Keys", "Combo settings": "Keys", "Combo layer matching": "Keys",
        "Key swaps & typing": "Keys", "All lighting": "Lighting", "Background effect": "Lighting", "Key feedback": "Lighting",
        "Pointer speed": "Pointer", "Auto-sniping": "Pointer", "Auto-mouse": "Pointer",
    });
});

test("a stale draft says how many changes it keeps, in agreement", () => {
    assert.equal(changesKept(1), "your 1 change is kept");
    assert.equal(changesKept(2), "your 2 changes are kept");
});

test("a Save that is off says why beside it, a blocker by its own title", () => {
    const ready = {connected: true, stale: false, reviewed: true, checks: []};
    const blocker = (title, status = "existing") => ({level: "blocker", status, title, key: title});
    assert.equal(saveOffReason(words, ready), "", "nothing to say while it can save");
    assert.equal(saveOffReason(words, {...ready, connected: false}), "Connect the keyboard to save.");
    assert.match(saveOffReason(words, {...ready, stale: true}), /^The keyboard changed since this draft began\. Close Review and review against the keyboard\.$/);
    assert.equal(saveOffReason(words, {...ready, checks: [blocker("Background effect 9 is unavailable on this keyboard")]}),
        "Fix the blocker first: Background effect 9 is unavailable on this keyboard.");
    assert.equal(saveOffReason(words, {...ready, checks: [blocker("A"), blocker("B", "new"), blocker("C", "fixed")]}), "Fix the 2 blockers in Checks first.",
        "a blocker the draft fixes keeps nothing off");
    assert.deepEqual(activeBlockers([blocker("A"), blocker("C", "fixed")]).map((check) => check.title), ["A"]);
    assert.equal(saveOffReason(words, {...ready, reviewed: false}), "Getting the review ready…");
});

// The mark says a change in the edit mode's words (edit-mode.mjs editWords):
// in the draft in Review and save, unsaved in the live modes.
test("a change's mark says it is in the draft, or in the live modes unsaved", () => {
    assert.equal(draftDot(null), '<i class="draft-dot " data-tip="Changed in your draft" aria-label="Changed in your draft"></i>');
    assert.equal(draftDot(/** @type {any} */ ({live: {mode: LIVE_REVIEW}}), "corner"), '<i class="draft-dot corner" data-tip="Unsaved change" aria-label="Unsaved change"></i>');
    assert.match(draftDot(/** @type {any} */ ({live: {mode: LIVE}}), "", {holds: true}), /data-tip="Holds an unsaved change"/);
    assert.match(draftDot({live: null}, "", {holds: true}), /data-tip="Holds a change in your draft"/);
});

test("a swap marks the slots it moved on their screen, a pointing mode's on Lighting's list too, and counts under its bank's order (D-L81)", () => {
    const macros = draftMarks([{status: "changed", place: {kind: "slots", bank: "macros", keycodes: ["MACRO_2", "MACRO_10"]}}]);
    assert.deepEqual([...macros.macros], ["MACRO_2", "MACRO_10"]);
    const keys = draftMarks([{status: "changed", place: {kind: "slots", bank: "customKeys", keycodes: ["CUSTOM_KEY_3"]}}]);
    assert.deepEqual([...keys.customKeys], ["CUSTOM_KEY_3"]);
    const pointing = draftMarks([{status: "changed", place: {kind: "slots", bank: "pdModes", slots: [1, 6]}}]);
    assert.deepEqual([[...pointing.pointing], [...pointing.lightingSlots]], [[1, 6], [1, 6]], "its colour went with it");
    assert.deepEqual(categorySummary(words, [
        {place: {kind: "slots", bank: "macros", keycodes: ["MACRO_2", "MACRO_10"]}, status: "changed"},
        {place: {kind: "slots", bank: "customKeys", keycodes: ["CUSTOM_KEY_3", "CUSTOM_KEY_20"]}, status: "changed"},
        {place: {kind: "slots", bank: "pdModes", slots: [1, 6]}, status: "changed"},
    ]).map(({category, rows}) => [category, rows.map((row) => row.label)]), [["Keys", ["Custom key order"]], ["Macros", ["Macro order"]], ["Pointing modes", ["Pointing mode order"]]]);
});
