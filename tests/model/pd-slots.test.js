"use strict";
// The 32 pointing slots: actions reach all of them, and edits keep the sparse
// PD domain and its RGB rows in the formats the keyboard stores.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {validateSnapshot, reorderLayers} = require("../../core/model/portable-profile");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {decodeKeyBehaviorDomain, encodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");
const {CAPABILITIES_32, document32} = require("../fixtures/pd-slots-32");

const domainOf = (doc, id) => decodeProfileBlob(Buffer.from(doc.profile, "base64")).domains.find(domain => domain.id === id);

test("a profile's actions reach every one of the 32 slots", () => {
    const wide = document32();
    const blob = decodeProfileBlob(Buffer.from(wide.profile, "base64"));
    const options = {actionLimits: {maxPdModes: 32}};
    const behaviors = decodeKeyBehaviorDomain(blob.domains[1].payload, options);
    behaviors.rows[0].steps[0] = {tapIndex: 0, tap: {kind: 5, operand: 12}};
    blob.domains[1].payload = encodeKeyBehaviorDomain(behaviors, options);
    const reaching = {...wide, profile: encodeProfileBlob(blob).toString("base64")};
    reaching.layers[0][0] = 0x7e9f; // PD_SLOT_31, an empty slot: allowed, and counted as inert
    const value = validateSnapshot(reaching, CAPABILITIES_32);
    assert.deepEqual(value.behaviors.rows[0].steps[0].tap, {kind: 5, flags: 0, operand: 12});
    assert.equal(value.danglingPdBindings[31], 1);
    assert.equal(value.danglingPdBindings[12], undefined, "slot 12 is configured");
});

test("layer ordering keeps the profile in the formats the keyboard stores", () => {
    const wide = document32();
    const result = validateSnapshot(reorderLayers(wide, [0, 2, 1, 3, 4, 5, 6, 7]), CAPABILITIES_32);
    assert.equal(result.pdModes.length, 32);
    assert.equal(result.rgb.formatVersion, 3);
    assert.equal(domainOf(result.document, 0x50).version, 2);
});

test("the profile meter counts a sparse PD domain by its stored bytes", () => {
    const {profileUsage} = require("../../core/model/profile-usage");
    const wide = document32();
    const usage = profileUsage({document: wide}, {maxProfilePayload: 5088});
    const value = validateSnapshot(wide);
    assert.equal(usage.used, value.profile.length);
    assert.equal(usage.areas.reduce((total, area) => total + area.bytes, 0), usage.used);
    const records = value.pdModes.filter(slot => slot.kind || slot.name).length;
    assert.equal(usage.areas.find(area => area.id === "pointing").bytes, 4 + 8 + 96 * records, "envelope, header and one record per stored slot");
});
