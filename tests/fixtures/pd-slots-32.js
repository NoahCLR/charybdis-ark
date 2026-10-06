"use strict";
// The 32-slot firmware: its own compiled profile (the pinned
// compiled_profile_pd_v2.fixture: RGB v3, sparse PD v2, slots 0-6 configured),
// materialized the way pd-profile.js materializes the eight-slot one.
const fs = require("node:fs"), path = require("node:path");
const {settings} = require("./portable-profile");
const {materializeProfile, createSnapshot, validateSnapshot} = require("../../core/model/portable-profile");
const {encodeSettings} = require("../../core/schema/settings-domain-v1");
const {ACTION_ABI_32_SLOTS} = require("../../core/schema/actions");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {decodePdDomain, encodePdDomain} = require("../../core/schema/pd-mode-domain-v1");
const {decodeRgbDomainV1, encodeRgbDomainV1} = require("../../core/schema/rgb-domain-v1");

const CAPABILITIES_32 = Object.freeze({compiledLayerCount: 8, supportedDomainMask: 31, schema: {major: 2}, actionAbiDigest: ACTION_ABI_32_SLOTS});
const FIXTURE = path.resolve(__dirname, "../../upstream/firmware/tests/fixtures/compiled_profile_pd_v2.fixture");

function compiled32() {
    const fixture = fs.readFileSync(FIXTURE, "utf8");
    const compiled = Buffer.from(fixture.match(/^profile.full.hex=(.+)$/m)[1], "hex");
    const policy = settings(); policy.formatVersion = 2; policy.values.fill(0, 10, 15);
    const profile = materializeProfile(compiled, compiled, {version: 2, defaultTermMs: 50, holdTermMs: 200, rows: []}, encodeSettings(policy));
    return createSnapshot({profile, actionAbiDigest: parseInt(fixture.match(/^profile.action_abi=(.+)$/m)[1], 16), via: {layers: 8, layout: Buffer.alloc(960), macros: Buffer.alloc(7191), macroSlots: 64}});
}

// A slot past the first eight, configured: Volume copied into slot 12 as
// "Tabs", with its own colour, so a screen has a high slot that does something.
function document32({highSlot = true} = {}) {
    const doc = compiled32();
    if (!highSlot) return doc;
    const blob = decodeProfileBlob(Buffer.from(doc.profile, "base64"));
    const pd = blob.domains.find(domain => domain.id === 0x50), rgbDomain = blob.domains.find(domain => domain.id === 0x10);
    const slots = decodePdDomain(pd.payload);
    slots[12] = {...structuredClone(slots[1]), id: 12, name: "Tabs"};
    pd.payload = encodePdDomain(slots);
    const rgb = decodeRgbDomainV1(rgbDomain.payload);
    rgb.pdModeColors.find(row => row.pdModeId === 12).color = {h: 200, s: 255, v: 200};
    rgbDomain.payload = encodeRgbDomainV1(rgb);
    doc.profile = encodeProfileBlob(blob).toString("base64");
    validateSnapshot(doc, CAPABILITIES_32);
    return doc;
}

module.exports = {CAPABILITIES_32, compiled32, document32};
