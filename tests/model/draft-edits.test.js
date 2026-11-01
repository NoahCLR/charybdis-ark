"use strict";
const {profileLayers} = require("../fixtures/profile-document");
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const {DRAFT_EDIT_TYPES, DRAFT_EDITS, draftEditLabel} = require("../../core/model/draft-edits");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const portable = require("../../core/model/portable-profile");
const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require("../../core/data/charybdis-layout");
const keycodes = require("../../core/schema/keycodes");
const {document: pdDocument} = require("../fixtures/pd-profile");

const ROOT = path.join(__dirname, "..", "..");
// Posted beside the edits but never staged: a dropped profile opens an import
// review, and a macro check is answered without touching the draft.
const NOT_DRAFT_EDITS = ["reviewPortableProfile", "validateMacro"];

// The contract is declarations only, so its keys are read from the text: each
// `name:` that opens a line of the EditPayloads interface.
function contractTypes() {
    const text = fs.readFileSync(path.join(ROOT, "contracts", "edits.d.ts"), "utf8");
    const body = /export interface EditPayloads \{\n([\s\S]*?)\n\}/.exec(text);
    assert.ok(body, "contracts/edits.d.ts declares EditPayloads");
    const excluded = /export type DraftEditType = Exclude<keyof EditPayloads, ([^>]*)>/.exec(text);
    assert.ok(excluded, "contracts/edits.d.ts declares DraftEditType");
    const then = /then\?: Extract<PanelEdit, \{type: ([^}]*)\}>/.exec(text);
    assert.ok(then, "contracts/edits.d.ts names the edits a custom key made for a shortcut carries");
    return {
        payloads: [...body[1].matchAll(/^ {4}(\w+):/gm)].map(match => match[1]).sort(),
        notDraft: [...excluded[1].matchAll(/'(\w+)'/g)].map(match => match[1]).sort(),
        follows: [...then[1].matchAll(/'(\w+)'/g)].map(match => match[1]).sort(),
    };
}
// What the interface's builders post: every message literal's type.
function builderTypes() {
    const text = fs.readFileSync(path.join(ROOT, "webview", "view", "edits.mjs"), "utf8");
    return [...new Set([...text.matchAll(/\btype: "(\w+)"/g)].map(match => match[1]))].sort();
}

test("the registry, the contract and the interface's builders name the same edits", () => {
    const {payloads, notDraft} = contractTypes();
    assert.deepEqual(notDraft, [...NOT_DRAFT_EDITS].sort(), "the contract's DraftEditType leaves out exactly the panel messages that are not edits");
    assert.deepEqual([...Object.keys(DRAFT_EDIT_TYPES), ...NOT_DRAFT_EDITS].sort(), payloads, "every EditPayloads entry is registered, or named here as not a draft edit");
    assert.deepEqual(builderTypes(), payloads, "webview/view/edits.mjs builds every EditPayloads message and nothing else");
    assert.deepEqual([...DRAFT_EDITS].sort(), Object.keys(DRAFT_EDIT_TYPES).sort());
});

test("every registered edit names its editor, its words and, on the profile, its domain", () => {
    for (const [type, entry] of Object.entries(DRAFT_EDIT_TYPES)) {
        assert.ok(["keymap", "settings", "macro", "customKey", "keyboardName", "profile"].includes(entry.editor), type);
        assert.equal("domain" in entry, entry.editor === "profile", type);
        if (entry.editor === "profile") assert.ok(["placement", "pointing", "combos", "behaviours", "lighting"].includes(entry.domain), type);
        assert.ok(typeof entry.label === "function" || (typeof entry.label === "string" && entry.label), type);
    }
    for (const type of ["applyAllChanges", "constructor", "toString", ...NOT_DRAFT_EDITS]) assert.equal(DRAFT_EDITS.has(type), false, type);
    assert.deepEqual(Object.keys(DRAFT_EDIT_TYPES).filter(type => "follows" in DRAFT_EDIT_TYPES[type]).sort(), contractTypes().follows,
        "the edits that may follow a custom key made for a shortcut are the ones the contract lets it carry (D-L63)");
});

function draft() {
    const doc = pdDocument();
    const snapshot = {document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: {brightnessMax: 200}};
    return new ProfileDraftSession(snapshot, "test-device", {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 3}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x67df11b3});
}

test("each edit is recorded in its own words", () => {
    const session = draft(), document = session.document;
    const stored = (layoutIndex) => keycodes.resolve(profileLayers(document)[1][CHARYBDIS_4X6_LAYOUT_MATRIX[layoutIndex][0] * 6 + CHARYBDIS_4X6_LAYOUT_MATRIX[layoutIndex][1]]).name;
    const layout = (changes) => draftEditLabel({type: "updateLayoutKeys", layer: "Layer 1", changes}, document);
    assert.equal(layout([{layoutIndex: 0, keycode: "KC_A"}]), "Changed a key");
    assert.equal(layout([{layoutIndex: 0, keycode: "KC_A"}, {layoutIndex: 1, keycode: "KC_B"}, {layoutIndex: 2, keycode: "KC_C"}]), "Changed 3 keys at once");
    assert.equal(layout([{layoutIndex: 0, keycode: stored(1)}, {layoutIndex: 1, keycode: stored(0)}]), "Swapped two keys");
    const behaviours = require("../../core/model/portable-profile").validateSnapshot(document).behaviors.rows;
    const saved = keycodes.resolve(behaviours[0].target.operand).name;
    const unused = ["KC_F24", "KC_F23", "KC_F22"].find(key => !behaviours.some(row => keycodes.resolve(row.target.operand)?.name === key));
    assert.equal(draftEditLabel({type: "saveBehavior", behavior: {keycode: saved, steps: []}}, document), "Edited a behaviour", "a key that has one");
    assert.equal(draftEditLabel({type: "saveBehavior", behavior: {keycode: unused, steps: []}}, document), "Added a behaviour", "a key that had none");
    assert.equal(draftEditLabel({type: "retargetBehavior", keycode: "KC_A", target: "KC_B", conflict: "swap"}, document), "Swapped two behaviours");
    assert.equal(draftEditLabel({type: "retargetBehavior", keycode: "KC_A", target: "KC_B"}, document), "Moved a behaviour");
    assert.equal(draftEditLabel({type: "updateRgbStages", stageEnableMask: 0}, document), "Edited lighting");
    assert.equal(draftEditLabel({type: "updateCustomKey", keycode: "CUSTOM_KEY_0", name: "Thumb"}, document), "Renamed a custom key");
    assert.equal(draftEditLabel({type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_0", shortcut: {mods: 1, keys: [], layers: 0, layerKind: 0}}, document), "Changed a custom key's shortcut");
    assert.equal(draftEditLabel({type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_0", shortcut: {mods: 0, keys: [], layers: 0, layerKind: 0}}, document), "Cleared a custom key's shortcut");
    assert.equal(draftEditLabel({type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_0", shortcut: {mods: 0, keys: [], layers: 8, layerKind: 0}}, document), "Changed a custom key's shortcut", "layers alone");
    assert.equal(draftEditLabel({type: "renameKeyboard", name: "Board"}, document), "Renamed the keyboard");

    session.stage({type: "updateLayoutKeys", draftRevision: session.revision, layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_A"}]});
    assert.equal(session.view({}).undoLabel, "Changed a key", "the draft records the step in the same words");
});
