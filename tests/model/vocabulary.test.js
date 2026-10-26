"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {VOCABULARY, EDIT_MODE_WORDS, editModeWords, heldWords, quietWords, word, layerName, slotName, branchName, modifierNames} = require("../../core/model/vocabulary");
const rgb = require("../../core/schema/rgb-domain-v1");
const pd = require("../../core/schema/pd-mode-domain-v1");
const {KEY_BEHAVIOR_HOLD_STYLES} = require("../../core/schema/key-behavior-domain-v1");

// Every value the keyboard can store has a word, so a new one cannot reach
// the review or an editor unnamed — "Eight directions" once read `undefined`.
const covers = (list, values, label) => assert.deepEqual(list.map(([id]) => id).sort(), Object.keys(values).sort(), label);
const coversNumbers = (list, values, label) => assert.deepEqual(list.map(([id]) => id).sort(), Object.values(values).sort(), label);

test("every stored enum value has a word", () => {
    coversNumbers(VOCABULARY.macroProtection, require("../../core/schema/macro-payload").MACRO_PROTECTION, "macro protection");
    covers(VOCABULARY.holdStyles.hold, KEY_BEHAVIOR_HOLD_STYLES, "hold styles under Hold");
    covers(VOCABULARY.holdStyles.long, KEY_BEHAVIOR_HOLD_STYLES, "hold styles under Long hold");
    covers(VOCABULARY.holdWithoutLongHold, KEY_BEHAVIOR_HOLD_STYLES, "holds without a long hold");
    covers(VOCABULARY.localities, rgb.RGB_LOCALITIES, "localities");
    covers(VOCABULARY.paintModes, rgb.RGB_LAYER_MODES, "layer paint modes");
    covers(VOCABULARY.fadeModes, rgb.RGB_AUTOMOUSE_MODES, "auto-mouse fades");
    covers(VOCABULARY.tapCommit, rgb.RGB_TAP_COMMIT_MODES, "tap commit");
    covers(VOCABULARY.feedbackOwners, rgb.RGB_KEY_SEMANTICS, "feedback owners");
    assert.deepEqual(VOCABULARY.stages.filter((stage) => stage.bit).map((stage) => stage.bit).sort(), Object.values(rgb.RGB_STAGE_BITS).sort(), "stages");
    coversNumbers(VOCABULARY.pointing.kinds, pd.PD_KIND, "pointing kinds");
    coversNumbers(VOCABULARY.pointing.axes, pd.PD_AXIS, "axes");
    coversNumbers(VOCABULARY.pointing.linkEnds, pd.PD_LINK_ENDS, "what ends a link's mode");
    assert.deepEqual(Object.keys(VOCABULARY.pointing.linkInert).sort(), ["default", "pointer"], "each layer a link ignores, in the editor's row");
    coversNumbers(VOCABULARY.pointing.emptyDirection, pd.PD_EMPTY_DIRECTION, "empty direction");
    coversNumbers(VOCABULARY.pointing.directionOutput, pd.PD_DIRECTION_OUTPUT, "directional output");
    coversNumbers(VOCABULARY.pointing.scrollAxes, pd.PD_SCROLL_AXES, "scroll axes");
    coversNumbers(VOCABULARY.pointing.modifierPolicy, pd.PD_MODIFIERS, "modifier policy");
    coversNumbers(VOCABULARY.physicalHalves, require("../../core/protocol/flash-pauses-v1").FLASH_PAUSES_V1.PHYSICAL_HALVES, "physical halves");
    assert.deepEqual(VOCABULARY.hostLayouts.map(([id]) => id), require("../../core/data/host-layouts").hostLayouts().map((layout) => layout.id), "host layouts");
    assert.ok(VOCABULARY.hostLayouts.some(([, name]) => name === "German (Windows)") && VOCABULARY.hostLayouts[0][1] === "US");
});

test("every LED group row table has a word, by the target its edits name", () => {
    assert.deepEqual(VOCABULARY.ledTables.map(([id]) => id), ["layer", "pdMode", "combo", "keyBehavior"]);
});

test("tap commit names the taps it flashes for: a double tap or more", () => {
    assert.equal(word(VOCABULARY.tapCommit, "KEY_FEEDBACK_TAP_COMMIT_NON_BASE_TAPS"), "Double taps and more");
});

test("an unknown value reads as itself, never as nothing", () => {
    assert.equal(word(VOCABULARY.localities, "RGB_LEFT_HALF"), "Left half");
    assert.equal(word(VOCABULARY.localities, "RGB_SOMEWHERE"), "RGB_SOMEWHERE");
    assert.equal(word(VOCABULARY.pointing.axes, 3), "Eight directions");
});

test("one rule names an unnamed layer, slot, branch and modifier set", () => {
    assert.equal(layerName(["", "Numbers"], 0), "Base", "layer 0 is the base layer");
    assert.equal(layerName(["", ""], 3), "Layer 3");
    assert.equal(layerName(["", "Numbers"], 1), "Numbers");
    assert.equal(slotName({id: 4, kind: 0, name: "Arrow"}), "Slot 4", "an empty slot is not called by the name it kept");
    assert.equal(slotName({id: 4, kind: 1, name: "Arrow"}), "Arrow");
    assert.equal(branchName(2), "Double tap");
    assert.deepEqual(modifierNames(2 | 128), ["Left Shift", "Right GUI"]);
});


test("macro playback statuses have one set of presentation words", () => {
    assert.deepEqual(VOCABULARY.macroPlayback, {setup: "setup", blocked: "blocked", unavailable: "unavailable"});
});


test("every stable device phase has immutable words and matches the posted PhaseId contract", () => {
    const {PHASE, PHASE_WORDS} = require("../../core/model/vocabulary");
    const fs = require("node:fs"), path = require("node:path");
    const declarations = fs.readFileSync(path.join(__dirname, "../../contracts/model.d.ts"), "utf8");
    const declaration = /export type PhaseId = ([^;]+);/.exec(declarations);
    assert.ok(declaration);
    const ids = [...declaration[1].matchAll(/'([^']+)'/g)].map(match => match[1]).sort();
    assert.deepEqual(Object.values(PHASE).sort(), ids);
    assert.deepEqual(Object.keys(PHASE_WORDS).sort(), ids);
    assert.equal(VOCABULARY.phases, PHASE_WORDS);
    for (const id of ids) {
        const words = PHASE_WORDS[id];
        assert.ok(words.label.trim(), id);
        assert.equal(typeof words.writes, "boolean", id);
        assert.ok(Object.isFrozen(words), id);
        if (words.read) assert.ok(words.read.trim(), id);
        if (words.busy) assert.ok(words.busy.trim(), id);
    }
    // Apply and Save write flash; a live edit, a Revert and a mode change
    // touch only the keyboard's RAM and a small record.
    assert.deepEqual(ids.filter(id => PHASE_WORDS[id].writes).sort(), [PHASE.LIVE_SAVE, PHASE.RESTORE_COMPLETE].sort());
});

test("every edit mode the keyboard stores has words, and the result words finish a sentence", () => {
    const {EDIT_MODE, EDIT_RESULT} = require("../../core/protocol/profile-edit-v1");
    const {LIVE_RESULT_WORDS} = require("../../core/model/vocabulary");
    for (const mode of Object.values(EDIT_MODE)) {
        const words = VOCABULARY.editModes[mode];
        assert.ok(words?.label && words.detail && words.id, String(mode));
    }
    assert.equal(VOCABULARY.editModes[EDIT_MODE.LIVE_REVIEW].label, "Live + review");
    assert.match(VOCABULARY.editModes[EDIT_MODE.LIVE_REVIEW].detail, /unplugging/);
    for (const name of Object.keys(EDIT_RESULT).filter(name => !["OK", "QUEUED"].includes(name))) assert.match(LIVE_RESULT_WORDS[name] || "", /^[a-z].*\.$/, name);
});

test("device phase identities are independent of their existing display labels", () => {
    const {PHASE, PHASE_WORDS} = require("../../core/model/vocabulary");
    assert.equal(PHASE_WORDS[PHASE.READ_LAYOUT].label, "reading layout");
    assert.equal(PHASE_WORDS[PHASE.RESTORE_COMPLETE].label, "restoring complete profile");
    assert.notEqual(PHASE.READ_LAYOUT, PHASE_WORDS[PHASE.READ_LAYOUT].label);
    assert.notEqual(PHASE.RESTORE_COMPLETE, PHASE_WORDS[PHASE.RESTORE_COMPLETE].label);
    assert.equal(PHASE_WORDS[PHASE.READ_COMBOS].read, "Checking active combos");
    assert.equal(PHASE_WORDS[PHASE.READ_BASE_RGB].read, "Checking base lighting");
});

test("every state of the two halves has a label and words saying what to do", () => {
    assert.deepEqual(Object.keys(VOCABULARY.halves).sort(), ["agree", "alone", "apart", "unread"]);
    for (const [id, {label, detail}] of Object.entries(VOCABULARY.halves)) {
        assert.ok(label && detail, id);
        assert.doesNotMatch(`${label} ${detail}`, /converge|generation|peer|digest/i, `${id} is said without the protocol's words`);
    }
    assert.match(VOCABULARY.halves.alone.detail, /cable between the halves/);
});

test("Live's quiet interval is the one the keyboard reports, 3 seconds until it has", () => {
    assert.equal(quietWords(5000), "5 seconds");
    assert.equal(quietWords(1000), "1 second");
    assert.equal(quietWords(undefined), "3 seconds");
    assert.equal(quietWords(0), "3 seconds", "nothing reported");
    assert.match(editModeWords(5000)[1].detail, /after 5 seconds with no edit/);
    assert.match(EDIT_MODE_WORDS[1].detail, /after 3 seconds with no edit/);
    assert.equal(editModeWords(5000)[0].detail, EDIT_MODE_WORDS[0].detail, "only Live's words carry it");
});

// Page 2's safe-boundary bits that a person lets go of are named; the rest
// are said as held keys alone (profile-wire-v1/live-edits.md).
test("an edit held for released keys says what to let go of, and a Revert says it too", () => {
    const edit = heldWords({kind: "edit", reasons: 1 | 1 << 4 | 1 << 6 | 1 << 7, cancelling: false});
    assert.equal(edit.title, "Let go of the held keys to finish the edit");
    assert.match(edit.detail, /^Held now: a key, a locked layer or pointer mode, a modifier or one-shot and a one-shot layer\. /);
    assert.equal(heldWords({kind: "edit", reasons: 1 << 9, cancelling: false}).detail, "The keyboard takes the edit the moment nothing is held; Ark waits for it.", "a combo is not named");
    assert.equal(heldWords({kind: "edit", reasons: 1, cancelling: true}).title, "Cancelling the edit");
    const revert = heldWords({kind: "revert", reasons: 1, cancelling: false});
    assert.equal(revert.title, "Let go of the held keys to finish reverting");
    assert.match(revert.refusal, /still reverting/);
});
