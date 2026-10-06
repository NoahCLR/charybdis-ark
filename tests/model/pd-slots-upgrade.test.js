"use strict";
// Restoring an eight-slot backup onto the 32-slot firmware, and the documents
// of each firmware staying apart.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {validateSnapshot, upgradePdSlots, reorderLayers} = require("../../core/model/portable-profile");
const {ACTION_ABI, ACTION_ABI_32_SLOTS} = require("../../core/schema/actions");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {decodeKeyBehaviorDomain, encodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");
const {decodePdDomain, encodePdDomain} = require("../../core/schema/pd-mode-domain-v1");
const {document} = require("../fixtures/pd-profile");
const {CAPABILITIES_32, document32} = require("../fixtures/pd-slots-32");

const EIGHT = {compiledLayerCount: 8, supportedDomainMask: 31, schema: {major: 2}, actionAbiDigest: ACTION_ABI};
const domainOf = (doc, id) => decodeProfileBlob(Buffer.from(doc.profile, "base64")).domains.find(domain => domain.id === id);

test("an eight-slot backup restores onto the 32-slot firmware: slots, lighting and vocabulary move, nothing else", () => {
    const source = document();
    // A named, disabled slot is kept; the empty nameless ones are dropped.
    const blob = decodeProfileBlob(Buffer.from(source.profile, "base64"));
    const pd = blob.domains.find(domain => domain.id === 0x50), slots = decodePdDomain(pd.payload);
    slots[7] = {id: 7, kind: 0, name: "Spare"};
    pd.payload = encodePdDomain(slots);
    source.profile = encodeProfileBlob(blob).toString("base64");
    const before = validateSnapshot(source);

    const result = validateSnapshot(source, CAPABILITIES_32);
    assert.equal(result.document.actionAbiDigest, ACTION_ABI_32_SLOTS);
    assert.equal(result.document.version, 2, "the portable document version stays 2");
    assert.deepEqual(result.document.layers, source.layers, "keycodes are the same in both vocabularies");
    assert.deepEqual(result.document.macros, source.macros);
    assert.deepEqual(result.settings, before.settings);
    assert.deepEqual(result.behaviors, before.behaviors);
    assert.deepEqual(result.combos, before.combos);

    assert.equal(result.pdModes.length, 32);
    assert.deepEqual(result.pdModes.slice(0, 8), before.pdModes, "the eight slots keep everything");
    assert.ok(result.pdModes.slice(8).every(slot => slot.kind === 0 && slot.name === ""));
    const stored = domainOf(result.document, 0x50);
    assert.equal(stored.version, 2);
    assert.deepEqual([...stored.payload.subarray(0, 4)], [2, 32, 96, 7], "six modes and the named spare; slot 6 is left out");

    const rgb = domainOf(result.document, 0x10);
    assert.equal(rgb.version, 3);
    assert.equal(result.rgb.formatVersion, 3);
    assert.deepEqual(result.rgb.pdModeColors.slice(0, 8), before.rgb.pdModeColors);
    assert.deepEqual(result.rgb.pdModeColors.slice(8), Array.from({length: 24}, (_, index) => ({pdModeId: index + 8, color: {h: 0, s: 0, v: 0}, locality: 2})));
    assert.deepEqual(result.rgb.pdModeGroupRows, before.rgb.pdModeGroupRows);
    assert.equal(result.profile.length <= 5088, true);
});

test("the eight-slot firmware keeps importing its own documents, and neither firmware takes the other's", () => {
    const eight = document(), wide = document32();
    assert.equal(validateSnapshot(eight, EIGHT).document, eight, "unchanged, as before");
    assert.equal(validateSnapshot(wide, CAPABILITIES_32).pdModes[12].name, "Tabs");
    assert.throws(() => validateSnapshot(wide, EIGHT), /action vocabulary/, "no way back to eight slots");
    // A document whose PD format disagrees with its vocabulary is refused.
    assert.throws(() => validateSnapshot({...wide, actionAbiDigest: ACTION_ABI}), /pointing slots do not match/);
    assert.throws(() => validateSnapshot({...eight, actionAbiDigest: ACTION_ABI_32_SLOTS}), /pointing slots do not match/);
    // So is one whose RGB format does not colour its slots.
    const blob = decodeProfileBlob(Buffer.from(wide.profile, "base64"));
    blob.domains[0] = decodeProfileBlob(Buffer.from(eight.profile, "base64")).domains[0];
    assert.throws(() => validateSnapshot({...wide, profile: encodeProfileBlob(blob).toString("base64")}), /versions disagree/);
    assert.throws(() => upgradePdSlots(wide), /eight-slot action vocabulary/);
});

test("a 32-slot profile's actions reach slots past eight; an eight-slot one's cannot", () => {
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
    assert.throws(() => encodeKeyBehaviorDomain(behaviors, {actionLimits: {maxPdModes: 8}}));
});

test("layer ordering keeps a 32-slot profile in its own formats", () => {
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

test("a backup that no longer fits once translated is refused with that reason, never trimmed", () => {
    const {fingerprint} = require("../../core/model/portable-profile");
    const {editMacro} = require("../../core/model/macro-editor");
    const {editCustomKey} = require("../../core/model/custom-key-editor");
    let doc = document();
    // All eight slots configured, so translation drops none and adds 24 RGB
    // rows: 120 bytes more.
    let blob = decodeProfileBlob(Buffer.from(doc.profile, "base64"));
    let pd = blob.domains.find(domain => domain.id === 0x50);
    const slots = decodePdDomain(pd.payload);
    slots[6] = {...structuredClone(slots[1]), id: 6, name: "Six"};
    slots[7] = {...structuredClone(slots[1]), id: 7, name: "Seven"};
    pd.payload = encodePdDomain(slots);
    doc.profile = encodeProfileBlob(blob).toString("base64");
    for (let slot = 0; slot < 64; slot++) doc = editMacro({document: doc, fingerprint: fingerprint(doc)}, {keycode: `VIA_MACRO_${slot}`, name: `Macro ${slot}`.padEnd(20, "!"), expectedFingerprint: fingerprint(doc)});
    for (let slot = 0; slot < 64; slot++) doc = editCustomKey({document: doc, fingerprint: fingerprint(doc)}, {keycode: `CUSTOM_KEY_${slot}`, name: `Key ${slot}`.padEnd(20, "?"), expectedFingerprint: fingerprint(doc)}, EIGHT);
    // Then behaviours until the eight-slot profile sits within 120 bytes of the ceiling.
    const options = {actionLimits: {maxPdModes: 8}};
    for (let key = 0x68; validateSnapshot(doc).profile.length <= 5088 - 120; key++) {
        blob = decodeProfileBlob(Buffer.from(doc.profile, "base64"));
        const domain = blob.domains.find(entry => entry.id === 0x20), table = decodeKeyBehaviorDomain(domain.payload, options);
        table.rows.push({target: {kind: 1, operand: key}, tapHoldTerm: 0, longerHoldTerm: 0, multiTapTerm: 0, keepsAutoMouseAnchored: false, steps: [{tapIndex: 0, tap: {kind: 1, operand: 4}}]});
        domain.payload = encodeKeyBehaviorDomain(table, options);
        doc = {...doc, profile: encodeProfileBlob(blob).toString("base64")};
    }
    const size = validateSnapshot(doc, EIGHT).profile.length;
    assert.ok(size > 5088 - 120 && size <= 5088, `the eight-slot profile is ${size} bytes and still restores onto its own firmware`);
    assert.throws(() => validateSnapshot(doc, CAPABILITIES_32), error => error.code === "INVALID_PORTABLE_PROFILE" && /does not fit the 32-slot firmware/.test(error.message));
});
