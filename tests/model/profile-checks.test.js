"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {profileFindings, draftProfileChecks} = require("../../core/model/profile-checks");
const {document} = require("../fixtures/portable-profile");

test("whole-profile checks report inert actions and destination blockers", () => {
    const decoded = validateSnapshot(document());
    decoded.danglingPointingKeys = {7: 2};
    // Text the US layout cannot type, with Unicode playback off.
    decoded.macroSlots[0] = Buffer.from("é");
    const checks = profileFindings(decoded, {brightnessMax: 100, effects: [{id: 2}]});
    assert.equal(checks.find(row => row.kind === "inertPointing")?.count, 2);
    assert.equal(checks.find(row => row.kind === "inertPointing")?.title, "2 actions reach Pointing mode 7, an empty slot", "the slot as Pointing modes names it");
    const unplayable = checks.find(row => row.kind === "unplayableMacro");
    assert.equal(unplayable?.place.index, 0);
    assert.equal(unplayable?.title, "Macro 0 cannot play with the settings in Your computer");
    assert.equal(unplayable?.fix, "Fix the macro or change Host settings → Your computer before playing it.");
    // The fixture's lighting colours are brighter than 100 too.
    assert.deepEqual([...new Set(checks.filter(row => row.level === "blocker").map(row => row.kind))], ["brightnessBlocker", "colourBrightnessBlocker", "effectBlocker"]);
});

test("a lighting colour brighter than the keyboard's limit is a blocker on its stage, naming where it is", () => {
    const decoded = validateSnapshot(document());
    const {rgb} = decoded;
    rgb.layerColors[1].color.v = 255; rgb.layerColors[3].color.v = 230;
    rgb.layerGroupRows.push({selector: 2, color: {h: 0, s: 255, v: 201}, groupId: 0});
    rgb.pdModeColors[1].color.v = 255;
    rgb.keyFeedback.tapBranches[0].color.v = 210;
    rgb.autocorrectFeedback.macroColor = {h: 10, s: 255, v: 250};
    const blockers = profileFindings(decoded, {brightnessMax: 200}).filter(row => row.kind === "colourBrightnessBlocker");
    assert.deepEqual(blockers.map(row => [row.level, row.place.stage, row.count]), [["blocker", "layers", 3], ["blocker", "pd", 1], ["blocker", "key", 1], ["blocker", "autocorrect", 1]]);
    const [layers, pointing] = blockers;
    assert.equal(layers.title, "Layer colours: 3 colours are brighter than this keyboard's limit of 200");
    assert.equal(layers.detail, "Numbers colour, Navigation colour and Accent · Symbols store brightness up to 255; the keyboard accepts at most 200, so it refuses the profile.");
    assert.equal(layers.fix, "Lower their brightness to 200 or less in Lighting.");
    assert.deepEqual(layers.place, {kind: "settings", area: "Lighting", stage: "layers"});
    assert.equal(pointing.title, "Pointing modes: 1 colour is brighter than this keyboard's limit of 200");
    assert.equal(pointing.detail, "Volume colour stores brightness 255; the keyboard accepts at most 200, so it refuses the profile.");
    assert.equal(pointing.fix, "Lower its brightness to 200 or less in Lighting.");
    assert.match(blockers[2].detail, /^Double tap colour /);
    assert.match(blockers[3].detail, /^Replaced by a macro colour /);
    assert.deepEqual(profileFindings(decoded, {brightnessMax: 255}).filter(row => row.kind === "colourBrightnessBlocker"), [], "at the limit is accepted");
    assert.deepEqual(profileFindings(decoded, {}).filter(row => row.kind === "colourBrightnessBlocker"), [], "a limit the keyboard did not report checks nothing");
});

test("whole-profile findings retain new and fixed status beside the keyboard", () => {
    const keyboard = validateSnapshot(document());
    const draft = validateSnapshot(document());
    draft.danglingPointingKeys = {7: 1};
    const checks = draftProfileChecks(keyboard, draft, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], {});
    assert.equal(checks.find(row => row.kind === "inertPointing")?.status, "new");
    assert.equal(checks.find(row => row.kind === "inertPointing")?.title, "1 action reaches Pointing mode 7, an empty slot");
});

test("timing changes report new, existing and fixed findings, including inherited defaults", () => {
    const keyboard = validateSnapshot(document());
    const action = operand => ({kind: 1, flags: 0, operand});
    keyboard.behaviors.rows = [{target: action(4), tapHoldTerm: 0, longHoldTerm: 0,
        steps: [{tapIndex: 0, hold: {style: 4, action: action(5)}, longHold: {style: 4, action: action(6)}}]}];
    keyboard.settings.values[1] = 100; keyboard.settings.values[2] = 200;
    const draft = structuredClone(keyboard); draft.settings.values[2] = 100;
    const checks = (before, after) => draftProfileChecks(before, after, undefined, {})
        .filter(f => f.kind === "gestureTiming" && f.title.includes("cannot send"));
    assert.equal(checks(keyboard, draft)[0].status, "new");
    assert.equal(checks(draft, draft)[0].status, "existing");
    assert.equal(checks(draft, keyboard)[0].status, "fixed");
});

test("a behaviour step that sends a custom key without a shortcut is flagged, and one with a shortcut is not", () => {
    const decoded = validateSnapshot(document());
    const customKey = operand => ({kind: 7, flags: 0, operand});
    decoded.behaviors.rows = [{target: {kind: 1, flags: 0, operand: 4}, steps: [
        {tapIndex: 0, tap: customKey(3), hold: {style: 0, repeatHz: 0, action: customKey(5)}},
        {tapIndex: 1, longHold: {style: 0, repeatHz: 0, action: customKey(3)}},
    ]}];
    decoded.settings.customKeyShortcuts[5] = {mods: 0, keys: [0xd1], layers: 0, layerKind: 0};
    decoded.settings.customKeyNames[3] = "";
    const flagged = profileFindings(decoded, {}).filter(row => row.kind === "shortcutlessCustomKeyStep");
    assert.deepEqual(flagged.map(row => [row.level, row.title]), [
        ["warning", "KC_A: press 1 tap sends custom key 3, which has no shortcut"],
        ["warning", "KC_A: press 2 long hold sends custom key 3, which has no shortcut"],
    ]);
    decoded.settings.customKeyNames[3] = "Hyper";
    assert.equal(profileFindings(decoded, {}).find(row => row.kind === "shortcutlessCustomKeyStep")?.title,
        "KC_A: press 1 tap sends custom key “Hyper”, which has no shortcut", "the custom key by its name");
    assert.deepEqual(flagged[0].place, {kind: "behaviour", keycode: "KC_A"});
    decoded.settings.customKeyShortcuts[3] = {mods: 0x0f, keys: [], layers: 0, layerKind: 0};
    assert.ok(!profileFindings(decoded, {}).some(row => row.kind === "shortcutlessCustomKeyStep"), "modifiers alone are a shortcut");
    decoded.settings.customKeyShortcuts[3] = {mods: 0, keys: [], layers: 1 << 3, layerKind: 0};
    assert.ok(!profileFindings(decoded, {}).some(row => row.kind === "shortcutlessCustomKeyStep"), "so are layers alone (firmware D-F26)");
});
