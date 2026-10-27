"use strict";
const {profileLayers, profileMacros} = require("../fixtures/profile-document");
const test = require("node:test"), assert = require("node:assert/strict");
const {revertUnits} = require("../../core/model/profile-revert");
const {profileReview} = require("../../core/model/profile-review");
const {fingerprint, summary, validateSnapshot} = require("../../core/model/portable-profile");
const {settingsEditorView} = require("../../core/model/settings-editor");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {document: pdDocument} = require("../fixtures/pd-profile");

const capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 3}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x67df11b3};
const snapshotOf = (document) => ({document, fingerprint: fingerprint(document), summary: summary(document), limits: {brightnessMax: 200}});

// A draft with one edit of every kind the review describes.
function edited() {
    const draft = new ProfileDraftSession(snapshotOf(pdDocument()), "board", capabilities);
    const stage = (message) => draft.stage({draftId: draft.id, draftRevision: draft.revision, ...message});
    const settings = (id, updates) => {
        const section = settingsEditorView(draft.current).sections.find((row) => row.id === id);
        return {type: "updateConfigDefaults", sectionId: id, expectedFingerprint: draft.current.fingerprint,
            fields: section.fields.map((field) => field.kind === "toggle" ? {macro: field.macro, enabled: updates[field.macro] ?? field.enabled} : {macro: field.macro, value: updates[field.macro] ?? field.value})};
    };
    stage({type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: 3, keycode: "KC_B"}, {layoutIndex: 4, keycode: "KC_C"}]});
    stage({type: "updateMacro", keycode: "MACRO_2", payload: "hello"});
    stage({type: "updateMacro", keycode: "MACRO_5", name: "Greeting", expectedFingerprint: draft.current.fingerprint});
    stage(settings("keyTiming", {tapHoldTerm: "175", multiTapTerm: "190"}));
    stage({type: "retargetBehavior", keycode: "KC_ESCAPE", target: "KC_Q", expectedBase: draft.identity()});
    stage({type: "addCombo", inputs: ["KC_A", "KC_B"], output: "KC_C", termMs: "50", holdTermMs: "200"});
    stage({type: "updateComboDefaultWindow", defaultTermMs: "70"});
    stage({type: "updateLayerColor", layer: "Layer 2", mode: "ALL_KEYS", h: "20", s: "200", v: "100"});
    stage({type: "updateRgbStages", stageEnableMask: validateSnapshot(draft.document).rgb.stageEnableMask ^ 1});
    stage({type: "addRgbLedGroup", group: {target: "layer", owner: "Layer 3", ledIndices: [1, 2, 3], h: "0", s: "0", v: "0"}});
    const slot = validateSnapshot(draft.document).pdModes[1];
    stage({type: "savePdMode", slot: 1, expectedBase: draft.identity(), config: {...slot, name: "Loudness", thresholdY: 90,
        directions: Object.fromEntries(Object.entries(slot.directions).map(([name, tap]) => [name, {...tap, keycode: String(tap.keycode)}])),
        diagonals: Object.fromEntries(Object.entries(slot.diagonals || {}).map(([name, tap]) => [name, {...tap, keycode: String(tap.keycode)}]))}});
    return draft;
}

test("discarding one middle combo deletion restores the full packed table", () => {
    const seeded = new ProfileDraftSession(snapshotOf(pdDocument()), "board", capabilities);
    for (let id = 0; id < 7; id++) seeded.stage({draftId: seeded.id, draftRevision: seeded.revision, type: "addCombo",
        inputs: ["KC_A", `KC_${id + 1}`], output: `KC_${id + 1}`, termMs: "50", holdTermMs: "200"});
    const draft = new ProfileDraftSession(snapshotOf(seeded.document), "board", capabilities);
    draft.stage({draftId: draft.id, draftRevision: draft.revision, type: "saveCombo", id: 2,
        inputs: ["KC_A", "KC_3"], output: "KC_Z", termMs: "50"});
    draft.stage({draftId: draft.id, draftRevision: draft.revision, type: "deleteCombo", id: 2});
    const rows = profileReview(draft.base, draft.current);
    assert.deepEqual(rows.map(row => row.unit), ["combo:2"]);
    assert.deepEqual(draft.changes().map(row => row.unit), ["combo:2"]);
    assert.deepEqual(draft.steps().slice(-2).map(step => step.changes.map(row => row.unit)), [["combo:2"], ["combo:2"]]);
    const restored = revertUnits(draft.base, draft.current, new Set([rows[0].unit]), capabilities);
    assert.deepEqual(validateSnapshot(restored).combos, validateSnapshot(draft.base.document).combos);
    assert.deepEqual(profileReview(draft.base, snapshotOf(restored)), []);
    draft.discard(draft.revision, draft.changes()[0].group);
    assert.deepEqual(draft.changes(), []);
});

test("each unit goes back to the keyboard's value, and nothing else moves", () => {
    const draft = edited(), base = draft.base, current = draft.current;
    const rows = profileReview(base, current);
    const units = [...new Set(rows.map((row) => row.unit))];
    for (const kind of ["layout", "macro", "settings", "behavior", "combo", "rgb", "pd"]) {
        assert.ok(units.some((unit) => unit.startsWith(`${kind}:`)), `the fixture edits a ${kind} unit`);
    }
    assert.ok(units.includes("comboTiming"), "the fixture edits the combo timing");
    for (const unit of units) {
        const document = revertUnits(base, current, new Set([unit]), capabilities);
        const left = profileReview(base, {...current, document, fingerprint: fingerprint(document)});
        assert.deepEqual(left.map(row => row.unit).sort(), rows.filter(row => row.unit !== unit).map(row => row.unit).sort(), unit);
        // Effective timing descriptions legitimately change when a default or
        // one of its followers is restored. Prove isolation against stored
        // bytes instead: putting only this unit back must recover the exact
        // current document, with no other changes hidden by review wording.
        const restored = {...current, document, fingerprint: fingerprint(document)};
        const roundTrip = revertUnits(current, restored, new Set([unit]), capabilities);
        assert.equal(fingerprint(roundTrip), current.fingerprint, unit);
    }
});

test("several units revert together, and every one of them back is the keyboard's profile", () => {
    const draft = edited(), base = draft.base, current = draft.current;
    const units = new Set(profileReview(base, current).map((row) => row.unit));
    const document = revertUnits(base, current, units, capabilities);
    const left = profileReview(base, {...current, document, fingerprint: fingerprint(document)});
    assert.ok(left.every((row) => row.unit === "profile"), "nothing described is left");
    assert.deepEqual(profileLayers(document), profileLayers(validateSnapshot(base.document, capabilities).document));
    assert.deepEqual(profileMacros(document), profileMacros(validateSnapshot(base.document, capabilities).document));
});

test("a unit this module does not know is refused rather than skipped", () => {
    const draft = edited();
    assert.throws(() => revertUnits(draft.base, draft.current, new Set(["mystery:1"]), capabilities), {code: "PROFILE_REVERT_UNSUPPORTED"});
});

test("discarding a default-layer change alone that would put a shortcut on an always-on layer is refused in words", () => {
    const {editSettings} = require("../../core/model/settings-editor");
    const {editCustomKey} = require("../../core/model/custom-key-editor");
    const fields = (snapshot, updates) => settingsEditorView(snapshot).sections.find((row) => row.id === "startupLayers").fields
        .map((field) => ({macro: field.macro, enabled: updates[field.macro] ?? field.enabled}));
    // The keyboard has Navigation (3) as a default layer.
    const plain = snapshotOf(pdDocument());
    const keyboard = snapshotOf(editSettings(plain, {type: "updateConfigDefaults", sectionId: "startupLayers", expectedFingerprint: plain.fingerprint, fields: fields(plain, {startupLayer3: true})}, capabilities));
    // The draft makes it an ordinary layer, then a custom key turns it on.
    const freed = snapshotOf(editSettings(keyboard, {type: "updateConfigDefaults", sectionId: "startupLayers", expectedFingerprint: keyboard.fingerprint, fields: fields(keyboard, {startupLayer3: false})}, capabilities));
    const draft = snapshotOf(editCustomKey(freed, {keycode: "CUSTOM_KEY_9", shortcut: {mods: 0, keys: [], layers: 1 << 3, layerKind: 0}, expectedFingerprint: freed.fingerprint}, capabilities));
    const units = profileReview(keyboard, draft).map((row) => row.unit);
    const startup = units.find((unit) => unit.startsWith("settings:") && unit.includes("startupLayers"));
    assert.ok(startup, units.join());
    assert.throws(() => revertUnits(keyboard, draft, new Set([startup]), capabilities),
        /^Error: These settings cannot be discarded on their own: \S+ is turned on by Custom key 9's shortcut, and a shortcut cannot turn on a default layer/);
    // Discarded together, both go back.
    assert.doesNotThrow(() => revertUnits(keyboard, draft, new Set([startup, "customKey:9"]), capabilities));
});
