"use strict";
const {profileLayers, profileMacros} = require("../fixtures/profile-document");
const test = require("node:test");
const assert = require("node:assert/strict");
const {document: pdDocument} = require("../fixtures/pd-profile");
const {fingerprint, validateSnapshot} = require("../../core/model/portable-profile");
const {storedKeyboardName, keyboardNameView, editKeyboardName} = require("../../core/model/keyboard-name");
const {profileReview} = require("../../core/model/profile-review");
const {revertUnits} = require("../../core/model/profile-revert");
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 0}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x6fd70b90};
const snapshot = value => ({document: value, fingerprint: fingerprint(value)});

test("a profile stores no keyboard name until one is given, and the view says what stands in", () => {
    const before = snapshot(pdDocument());
    assert.equal(storedKeyboardName(before), "", "the factory default is the built-in name");
    assert.deepEqual(keyboardNameView(before, "Charybdis (4x6) Splinky"), {name: "", builtIn: "Charybdis (4x6) Splinky", identity: before.fingerprint, perName: 32});
    assert.equal(keyboardNameView(before).builtIn, "", "a host that does not know the built-in name says so by leaving it empty");
    for (const missing of [null, undefined, {document: null}, {...before, incomplete: true}]) {
        assert.equal(storedKeyboardName(missing), undefined);
        assert.equal(keyboardNameView(missing), null);
    }
});

test("renaming the keyboard changes its name and nothing else, and is reviewed and discarded on its own", () => {
    const before = snapshot(pdDocument());
    const named = editKeyboardName(before, {name: "  Noah’s Charybdis ", expectedFingerprint: before.fingerprint}, capabilities);
    const after = validateSnapshot(named, capabilities), original = validateSnapshot(before.document, capabilities);
    assert.equal(after.settings.keyboardName, "Noah’s Charybdis", "trimmed");
    for (const field of ["values", "names", "layers", "macroNames", "customKeyNames"]) assert.deepEqual(after.settings[field], original.settings[field], field);
    assert.deepEqual(profileLayers(named), profileLayers(before.document));
    assert.deepEqual(profileMacros(named), profileMacros(before.document));
    const domains = blob => decodeProfileBlob(Buffer.from(blob.profile, "base64")).domains.filter(domain => domain.id !== 0x40);
    assert.deepEqual(domains(named), domains(before.document), "only the settings domain changes");

    const items = profileReview(before, snapshot(named));
    assert.deepEqual(items.map(item => item.unit), ["keyboardName"]);
    assert.deepEqual(items[0], {area: "Settings", unit: "keyboardName", title: "Keyboard name", status: "changed",
        fields: [{label: "Name", status: "changed", before: "built-in name", after: "Noah’s Charybdis"}],
        place: {kind: "settings", section: "keyboard", area: "Settings"}});
    const cleared = snapshot(editKeyboardName(snapshot(named), {name: "", expectedFingerprint: fingerprint(named)}, capabilities));
    assert.deepEqual(profileReview(snapshot(named), cleared)[0].fields, [{label: "Name", status: "changed", before: "Noah’s Charybdis", after: "built-in name"}],
        "clearing it gives the keyboard back its built-in name");

    const reverted = revertUnits(before, snapshot(named), new Set(["keyboardName"]), capabilities);
    assert.equal(fingerprint(reverted), before.fingerprint, "discarded alone, the draft is the keyboard's again");
    assert.deepEqual(profileReview(before, snapshot(reverted)), []);
});

test("stale drafts, long or control names and non-text are refused; an unchanged name is no edit", () => {
    const current = snapshot(pdDocument());
    const message = {name: "Board", expectedFingerprint: current.fingerprint};
    assert.throws(() => editKeyboardName(current, {...message, expectedFingerprint: "stale"}, capabilities), /changed/);
    assert.throws(() => editKeyboardName(current, {name: "Board"}, capabilities), /changed/, "a message must name the draft it was drawn from");
    assert.throws(() => editKeyboardName(current, {...message, name: "x".repeat(33)}, capabilities), error => error.code === "KEYBOARD_NAME_INVALID" && /32 bytes of text/.test(error.message));
    assert.throws(() => editKeyboardName(current, {...message, name: `${"ü".repeat(16)}x`}, capabilities), error => error.code === "KEYBOARD_NAME_INVALID", "limits count bytes");
    assert.equal(validateSnapshot(editKeyboardName(current, {...message, name: "ü".repeat(16)}, capabilities)).settings.keyboardName, "ü".repeat(16));
    for (const name of ["tab\there", "del\u007f", "lone \ud800"]) {
        assert.throws(() => editKeyboardName(current, {...message, name}, capabilities), error => error.code === "KEYBOARD_NAME_INVALID", JSON.stringify(name));
    }
    for (const name of [undefined, 7, null, ["Board"]]) assert.throws(() => editKeyboardName(current, {...message, name}, capabilities), error => error.code === "KEYBOARD_NAME_INVALID");
    assert.equal(editKeyboardName(current, {...message, name: "   "}, capabilities), validateSnapshot(current.document, capabilities).document, "an unchanged name is no edit");
});
