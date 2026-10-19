"use strict";
const {profileMacros, editMacros} = require("../fixtures/profile-document");
const test = require("node:test");
const assert = require("node:assert/strict");
const {profileUsage} = require("../../core/model/profile-usage");
const {fingerprint, validateSnapshot} = require("../../core/model/portable-profile");
const {editMacro} = require("../../core/model/macro-editor");
const {editCustomKey} = require("../../core/model/custom-key-editor");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {encodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");
const {encodeComboDomain} = require("../../core/schema/combo-domain-v1");
const {document: pdDocument} = require("../fixtures/pd-profile");

const snapshot = value => ({document: value, fingerprint: fingerprint(value)});
const schema2 = {maxProfilePayload: 130048, maxBehaviorRows: 64, maxPopulatedBehaviorSteps: 128, maxCombos: 32, maxReusableRgbGroups: 16, maxRgbStageGroupRows: 32};
const customKeyCapabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 0}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x6fd70b90};
const count = (usage, id) => usage.counts.find(entry => entry.id === id);

// The fixture with no behaviours and no combos.
function emptied(value) {
    const blob = decodeProfileBlob(Buffer.from(value.profile, "base64"));
    const domains = blob.domains.map(domain => domain.id === 0x20 ? {...domain, payload: encodeKeyBehaviorDomain({rows: []})}
        : domain.id === 0x30 ? {...domain, payload: encodeComboDomain({...validateSnapshot(value).combos, rows: []})} : domain);
    return {...value, profile: encodeProfileBlob({schema: blob.schema, domains}).toString("base64")};
}

test("the bar is the bytes Apply writes, and each count is what its screen sets up", () => {
    const value = pdDocument(), usage = profileUsage(snapshot(value), schema2);
    assert.equal(usage.used, validateSnapshot(value).candidate.length);
    assert.equal(usage.capacity, 130048, "the size is the one the firmware advertises");
    assert.deepEqual(usage.counts.map(entry => entry.id),
        ["behaviours", "behaviourSteps", "combos", "lightingGroups", "lightingGroupRows", "macros", "customKeys", "pointingModes"], "in the rail's order");
    const {behaviors, combos, pdModes, settings} = validateSnapshot(value);
    assert.deepEqual(count(usage, "behaviours"), {id: "behaviours", used: behaviors.rows.length, limit: 64});
    assert.deepEqual(count(usage, "behaviourSteps"), {id: "behaviourSteps", used: behaviors.populatedStepCount, limit: 128});
    assert.equal(count(usage, "combos").used, combos.rows.length);
    assert.deepEqual(count(usage, "pointingModes"), {id: "pointingModes", used: pdModes.filter(slot => slot.kind).length, limit: 32},
        "slots that hold a mode, out of every slot");
    assert.equal(count(usage, "customKeys").limit, settings.customKeyNames.length, "every custom key the keyboard has");
    assert.ok(!("areas" in usage), "no storage breakdown: the counts are what an edit runs into");
});

test("a custom key is in use once it has a name, a shortcut or a behaviour", () => {
    const before = snapshot(pdDocument());
    const behaved = profileUsage(before, schema2);
    // The compiled profile gives CUSTOM_KEY_2 a behaviour and no name.
    assert.equal(validateSnapshot(before.document).settings.customKeyNames[2], "");
    assert.ok(count(behaved, "customKeys").used >= 1, "a behaviour alone puts a key in use");

    const named = snapshot(editCustomKey(before, {keycode: "CUSTOM_KEY_100", name: "Zoom", expectedFingerprint: before.fingerprint}, customKeyCapabilities));
    assert.equal(count(profileUsage(named, schema2), "customKeys").used, count(behaved, "customKeys").used + 1, "a name");
    const shortcut = snapshot(editCustomKey(named, {keycode: "CUSTOM_KEY_101", shortcut: {mods: 1, key: 0x1d}, expectedFingerprint: named.fingerprint}, customKeyCapabilities));
    assert.equal(count(profileUsage(shortcut, schema2), "customKeys").used, count(behaved, "customKeys").used + 2, "a shortcut");
    const both = snapshot(editCustomKey(shortcut, {keycode: "CUSTOM_KEY_100", shortcut: {mods: 2, key: 0x04}, expectedFingerprint: shortcut.fingerprint}, customKeyCapabilities));
    assert.equal(count(profileUsage(both, schema2), "customKeys").used, count(behaved, "customKeys").used + 2, "a key is counted once");
});

test("macro slots in use are the ones with steps; the highest empty ones are unavailable when macro memory runs short", () => {
    const value = pdDocument();
    assert.deepEqual(count(profileUsage(snapshot(value), schema2), "macros"), {id: "macros", used: 0, limit: 128}, "nothing unavailable, nothing said");
    // Three long text macros leave room for fewer empty slots than there are.
    const capacity = 34903, text = Buffer.alloc(11000, "a");
    const macros = profileMacros(value).map((slot, index) => index < 3 ? text.toString("base64") : slot);
    const stored = 3 * (text.length + 1) + 125;
    const open = Math.floor((capacity - stored) / 30);
    const usage = profileUsage(snapshot(editMacros(value, slots => slots.splice(0, slots.length, ...macros))), {...schema2, macroBytes: capacity});
    assert.deepEqual(count(usage, "macros"), {id: "macros", used: 3, limit: 128, unavailable: 125 - open},
        "every empty slot keeps room for ten 3-byte taps; the rest are unavailable");
});

test("an empty profile sets up nothing it can grow", () => {
    const usage = profileUsage(snapshot(emptied(pdDocument())), schema2);
    assert.equal(count(usage, "behaviours").used, 0);
    assert.equal(count(usage, "behaviourSteps").used, 0);
    assert.equal(count(usage, "combos").used, 0);
});

test("naming a macro or the keyboard grows the bar, not the counts", () => {
    const {editKeyboardName} = require("../../core/model/keyboard-name");
    const before = snapshot(pdDocument());
    const macro = snapshot(editMacro(before, {keycode: "VIA_MACRO_3", name: "Zoom mute", expectedFingerprint: before.fingerprint}));
    const keyboard = snapshot(editKeyboardName(before, {name: "Noah’s board", expectedFingerprint: before.fingerprint}));
    const a = profileUsage(before, schema2), b = profileUsage(macro, schema2), c = profileUsage(keyboard, schema2);
    assert.equal(b.used - a.used, 9, "the name's text, beside the length byte every name has");
    assert.equal(c.used - a.used, Buffer.byteLength("Noah’s board"));
    assert.deepEqual(b.counts, a.counts);
    assert.deepEqual(c.counts, a.counts);
});

test("nothing is shown that the keyboard did not report", () => {
    const value = pdDocument();
    assert.equal(profileUsage(snapshot(value), {}), null, "firmware without an advertised size shows no meter");
    assert.equal(profileUsage(snapshot(value), undefined), null);
    assert.equal(profileUsage({incomplete: true}, schema2), null, "an interrupted read has nothing to measure");
    assert.equal(profileUsage(null, schema2), null);
    const usage = profileUsage(snapshot(value), {maxProfilePayload: 130048, maxCombos: 32});
    assert.deepEqual(usage.counts.map(entry => entry.id), ["combos", "macros", "customKeys", "pointingModes"],
        "only limits the firmware advertises are counted; the fixed slots always are");
});
