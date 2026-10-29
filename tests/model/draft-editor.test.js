"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {applyDraftEdit} = require("../../core/model/draft-editor");
const {DRAFT_EDIT_TYPES} = require("../../core/model/draft-edits");
const portable = require("../../core/model/portable-profile");
const {matrixPosition} = require("../../core/data/charybdis-layout");
const {document: pdDocument} = require("../fixtures/pd-profile");

const capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 3}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x67df11b3};
// The draft as it stands, and the identity a profile form is read with.
function draft() {
    const document = pdDocument();
    const snapshot = {document, fingerprint: portable.fingerprint(document), summary: portable.summary(document), limits: {brightnessMax: 200}};
    return {snapshot, identity: {source: "draft", generation: 3, digest: snapshot.fingerprint, originHalf: "board"}};
}
const settled = document => portable.validateSnapshot(document, capabilities);

test("every registered edit reaches its editor, and anything else is refused as unsupported", () => {
    const {snapshot, identity} = draft();
    for (const type of Object.keys(DRAFT_EDIT_TYPES)) {
        // An empty payload is refused by the editor, never by the dispatch.
        try {applyDraftEdit(snapshot, {type}, {capabilities, identity});} catch (error) {
            assert.doesNotMatch(String(error.message), /Unsupported/, type);
        }
    }
    for (const type of ["applyAllChanges", "constructor", "reviewPortableProfile", "validateMacro"]) {
        assert.throws(() => applyDraftEdit(snapshot, {type, layer: "Layer 0", changes: []}, {capabilities, identity}), {code: "PROFILE_DRAFT_CONFLICT", message: "Unsupported draft edit."}, type);
    }
});

test("a whole-document form drawn from another revision is refused in its editor's words; one naming this revision, or none, is taken", () => {
    const {snapshot, identity} = draft();
    const edit = message => applyDraftEdit(snapshot, message, {capabilities, identity});
    const draftWords = "The keyboard changed since this draft was opened. Read the keyboard and review the draft before saving again.";
    for (const [message, code, words] of [
        [{type: "updateConfigDefaults", sectionId: "autoMouse", fields: []}, "INVALID_SETTINGS_EDIT", "The keyboard changed since these settings were opened. Read the keyboard and review your changes before saving again."],
        [{type: "updateMacro", keycode: "MACRO_0", payload: "hello"}, "MACRO_EDIT_CONFLICT", "The keyboard changed since this macro draft was opened. Read the keyboard and review the draft before saving again."],
        [{type: "updateCustomKey", keycode: "CUSTOM_KEY_0", name: "Thumb"}, "CUSTOM_KEY_EDIT_CONFLICT", draftWords],
        [{type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_0", shortcut: {mods: 1, keys: [], layers: 0, layerKind: 0}}, "CUSTOM_KEY_EDIT_CONFLICT", draftWords],
        [{type: "renameKeyboard", name: "Board"}, "KEYBOARD_NAME_EDIT_CONFLICT", draftWords],
    ]) assert.throws(() => edit({...message, expectedFingerprint: "stale"}), {code, message: words}, message.type);
    for (const expectedFingerprint of [snapshot.fingerprint, undefined]) {
        assert.equal(settled(edit({type: "renameKeyboard", name: "Board", expectedFingerprint})).settings.keyboardName, "Board");
        assert.equal(settled(edit({type: "updateCustomKey", keycode: "CUSTOM_KEY_0", name: "Thumb", expectedFingerprint})).settings.customKeyNames[0], "Thumb");
        assert.equal(Buffer.from(settled(edit({type: "updateMacro", keycode: "MACRO_0", payload: "hello", expectedFingerprint})).document.profile, "base64").includes("hello"), true);
    }
    assert.equal(settled(edit({type: "renameKeyboard", name: "Board", expectedBase: {...identity, generation: 2}})).settings.keyboardName, "Board", "a whole-document form is never checked by identity");
});

test("a profile form read from an older draft is refused; one read from this draft, or naming none, is taken; a layout edit is never checked", () => {
    const {snapshot, identity} = draft();
    const edit = message => applyDraftEdit(snapshot, message, {capabilities, identity});
    const lighting = {type: "updateRgbStages", stageEnableMask: 0};
    const older = {code: "PROFILE_DRAFT_CONFLICT", message: "This form belongs to an older draft. Reload it before keeping changes."};
    for (const key of Object.keys(identity)) assert.throws(() => edit({...lighting, expectedBase: {...identity, [key]: "other"}}), older, key);
    assert.throws(() => edit({...lighting, expectedBase: {generation: 3}}), older, "a form names the whole identity it was read with");
    for (const expectedBase of [identity, undefined]) assert.equal(settled(edit({...lighting, expectedBase})).rgb.stageEnableMask, 0);
    const key = settled(edit({type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_B"}], expectedBase: {...identity, generation: 2}}));
    assert.equal(key.layers[0][matrixPosition(0)], 0x05);
});

test("the edit a custom key carries is checked as its own: an older profile form refuses the whole step", () => {
    const {snapshot, identity} = draft();
    const made = {type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_9", shortcut: {mods: 0x11, keys: [], layers: 0, layerKind: 0}, name: "Left Ctrl + Right Ctrl"};
    const then = {type: "addCombo", inputs: ["KC_A", "KC_B"], output: "CUSTOM_KEY_9", termMs: ""};
    assert.throws(() => applyDraftEdit(snapshot, {...made, then: {...then, expectedBase: {...identity, generation: 2}}}, {capabilities, identity}), /older draft/);
    const both = settled(applyDraftEdit(snapshot, {...made, then: {...then, expectedBase: identity}}, {capabilities, identity}));
    assert.equal(both.settings.customKeyNames[9], "Left Ctrl + Right Ctrl");
    assert.deepEqual(both.combos.rows.at(-1).output, {kind: 7, flags: 0, operand: 9});
});
