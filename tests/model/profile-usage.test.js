"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {profileUsage, AREAS} = require("../../core/model/profile-usage");
const {fingerprint, validateSnapshot} = require("../../core/model/portable-profile");
const {editMacro} = require("../../core/model/macro-editor");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {encodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");
const {encodeComboDomain} = require("../../core/schema/combo-domain-v1");
const {document: pdDocument} = require("../fixtures/pd-profile");

const snapshot = value => ({document: value, fingerprint: fingerprint(value)});
const schema2 = {maxProfilePayload: 5088, maxBehaviorRows: 64, maxPopulatedBehaviorSteps: 128, maxCombos: 32, maxReusableRgbGroups: 16, maxRgbStageGroupRows: 32};
const total = usage => usage.areas.reduce((sum, area) => sum + area.bytes, 0);
const area = (usage, id) => usage.areas.find(entry => entry.id === id).bytes;
const count = (usage, id) => usage.counts.find(entry => entry.id === id);

// The fixture with no behaviours and no combos: what is left is what every
// profile carries.
function emptied(value) {
    const blob = decodeProfileBlob(Buffer.from(value.profile, "base64"));
    const domains = blob.domains.map(domain => domain.id === 0x20 ? {...domain, payload: encodeKeyBehaviorDomain({rows: []})}
        : domain.id === 0x30 ? {...domain, payload: encodeComboDomain({...validateSnapshot(value).combos, rows: []})} : domain);
    return {...value, profile: encodeProfileBlob({schema: blob.schema, domains}).toString("base64")};
}

test("a populated profile's areas add up to the bytes Apply writes", () => {
    const value = pdDocument(), usage = profileUsage(snapshot(value), schema2);
    assert.equal(usage.used, Buffer.from(value.profile, "base64").length);
    assert.equal(usage.capacity, 5088, "the limit is the one the firmware advertises");
    assert.equal(total(usage), usage.used);
    assert.deepEqual(usage.areas.map(entry => entry.id), AREAS);
    const {behaviors, combos, pdModes} = validateSnapshot(value);
    assert.equal(area(usage, "pointing"), 4 + 8 + 96 * pdModes.filter(slot => slot.kind || slot.name).length, "a record per stored slot");
    assert.equal(area(usage, "names"), 8 * 24 + 128, "eight layer names and a length byte for each macro and custom key name");
    assert.deepEqual(count(usage, "behaviours"), {id: "behaviours", used: behaviors.rows.length, limit: 64});
    assert.deepEqual(count(usage, "behaviourSteps"), {id: "behaviourSteps", used: behaviors.populatedStepCount, limit: 128});
    assert.equal(count(usage, "combos").used, combos.rows.length);
});

test("an empty profile still uses its fixed parts", () => {
    const usage = profileUsage(snapshot(emptied(pdDocument())), schema2);
    assert.equal(area(usage, "behaviours"), 4 + 4, "an empty behaviour table is its header");
    assert.equal(area(usage, "combos"), 4 + 8, "an empty combo table keeps its default window");
    assert.equal(count(usage, "behaviours").used, 0);
    assert.equal(count(usage, "combos").used, 0);
    assert.equal(total(usage), usage.used);
});

test("naming a macro moves its bytes into names", () => {
    const before = snapshot(pdDocument());
    const after = snapshot(editMacro(before, {keycode: "VIA_MACRO_3", name: "Zoom mute", expectedFingerprint: before.fingerprint}));
    const a = profileUsage(before, schema2), b = profileUsage(after, schema2);
    // The name adds its 9 characters to the length byte every name has.
    assert.equal(area(b, "names") - area(a, "names"), 9);
    assert.equal(total(b), b.used);
});

test("nothing is shown that the keyboard did not report", () => {
    const value = pdDocument();
    assert.equal(profileUsage(snapshot(value), {}), null, "firmware without an advertised size shows no meter");
    assert.equal(profileUsage(snapshot(value), undefined), null);
    assert.equal(profileUsage({incomplete: true}, schema2), null, "an interrupted read has nothing to measure");
    assert.equal(profileUsage(null, schema2), null);
    const usage = profileUsage(snapshot(value), {maxProfilePayload: 5088, maxCombos: 32});
    assert.deepEqual(usage.counts.map(entry => entry.id), ["combos"], "only limits the firmware advertises are counted");
});
