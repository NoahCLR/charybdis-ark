"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const {DRAFT_EDIT_TYPES, DRAFT_EDITS, editedBy, inDomain, draftEditLabel} = require("../../core/model/draft-edits");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const portable = require("../../core/model/portable-profile");
const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require("../../core/data/charybdis-layout");
const keycodes = require("../../core/data/keycode-catalog");
const {document: pdDocument} = require("../fixtures/pd-profile");

const ROOT = path.join(__dirname, "..", "..");
// Posted beside the edits but never staged: a dropped profile opens an import
// review, and a macro check is answered without touching the draft.
const NOT_DRAFT_EDITS = ["reviewPortableProfile", "validateViaMacro"];

// The contract is declarations only, so its keys are read from the text: each
// `name:` that opens a line of the EditPayloads interface.
function contractTypes() {
    const text = fs.readFileSync(path.join(ROOT, "contracts", "edits.d.ts"), "utf8");
    const body = /export interface EditPayloads \{\n([\s\S]*?)\n\}/.exec(text);
    assert.ok(body, "contracts/edits.d.ts declares EditPayloads");
    const excluded = /export type DraftEditType = Exclude<keyof EditPayloads, ([^>]*)>/.exec(text);
    assert.ok(excluded, "contracts/edits.d.ts declares DraftEditType");
    return {
        payloads: [...body[1].matchAll(/^ {4}(\w+):/gm)].map(match => match[1]).sort(),
        notDraft: [...excluded[1].matchAll(/'(\w+)'/g)].map(match => match[1]).sort(),
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
        assert.ok(["layout", "settings", "macro", "customKey", "keyboardName", "profile"].includes(entry.editor), type);
        assert.equal("domain" in entry, entry.editor === "profile", type);
        if (entry.editor === "profile") assert.ok(["placement", "pointing", "combos", "behaviours", "lighting"].includes(entry.domain), type);
        assert.ok(typeof entry.label === "function" || (typeof entry.label === "string" && entry.label), type);
        assert.equal(editedBy({type}, entry.editor), true, type);
        if (entry.editor === "profile") assert.equal(inDomain({type}, entry.domain), true, type);
    }
    for (const type of ["applyAllChanges", "constructor", "toString", ...NOT_DRAFT_EDITS]) {
        assert.equal(DRAFT_EDITS.has(type), false, type);
        assert.equal(editedBy({type}, "layout") || editedBy({type}, "profile"), false, type);
    }
});

function draft() {
    const doc = pdDocument();
    const snapshot = {document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: {brightnessMax: 200}};
    return new ProfileDraftSession(snapshot, "test-device", {compiledLayerCount: 16, supportedDomainMask: 31, actionAbiDigest: 0x837cf479});
}

test("every registered edit reaches its editor, and anything else is refused as unsupported", () => {
    for (const type of Object.keys(DRAFT_EDIT_TYPES)) {
        const session = draft();
        // An empty payload is refused by the editor, never by the dispatch.
        try {session.stage({type, draftRevision: session.revision});} catch (error) {
            assert.doesNotMatch(String(error.message), /Unsupported/, type);
        }
    }
    for (const type of ["applyAllChanges", "constructor", ...NOT_DRAFT_EDITS]) {
        const session = draft();
        assert.throws(() => session.stage({type, draftRevision: session.revision, layer: "Layer 0", changes: []}), /Unsupported draft edit/, type);
    }
});

test("each edit is recorded in its own words", () => {
    const session = draft(), document = session.document;
    const stored = (layoutIndex) => keycodes.resolve(document.layers[1][CHARYBDIS_4X6_LAYOUT_MATRIX[layoutIndex][0] * 6 + CHARYBDIS_4X6_LAYOUT_MATRIX[layoutIndex][1]]).name;
    const layout = (changes) => draftEditLabel({type: "updateLayoutKeys", layer: "Layer 1", changes}, document);
    assert.equal(layout([{layoutIndex: 0, keycode: "KC_A"}]), "Changed a key");
    assert.equal(layout([{layoutIndex: 0, keycode: "KC_A"}, {layoutIndex: 1, keycode: "KC_B"}, {layoutIndex: 2, keycode: "KC_C"}]), "Changed 3 keys at once");
    assert.equal(layout([{layoutIndex: 0, keycode: stored(1)}, {layoutIndex: 1, keycode: stored(0)}]), "Swapped two keys");
    assert.equal(draftEditLabel({type: "retargetBehavior", keycode: "KC_A", target: "KC_B", conflict: "swap"}, document), "Swapped two behaviours");
    assert.equal(draftEditLabel({type: "retargetBehavior", keycode: "KC_A", target: "KC_B"}, document), "Moved a behaviour");
    assert.equal(draftEditLabel({type: "updateRgbStages", stageEnableMask: 0}, document), "Edited lighting");
    assert.equal(draftEditLabel({type: "updateCustomKey", keycode: "CUSTOM_KEY_0", name: "Thumb"}, document), "Renamed a custom key");
    assert.equal(draftEditLabel({type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_0", shortcut: {mods: 1, key: 0}}, document), "Changed a custom key's shortcut");
    assert.equal(draftEditLabel({type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_0", shortcut: {mods: 0, key: 0}}, document), "Cleared a custom key's shortcut");
    assert.equal(draftEditLabel({type: "renameKeyboard", name: "Board"}, document), "Renamed the keyboard");

    session.stage({type: "updateLayoutKeys", draftRevision: session.revision, layer: "Layer 1", changes: [{layoutIndex: 0, keycode: "KC_A"}]});
    assert.equal(session.view({}).undoLabel, "Changed a key", "the draft records the step in the same words");
});
