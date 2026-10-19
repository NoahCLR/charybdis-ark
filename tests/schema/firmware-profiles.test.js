"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {PROFILE_DOMAIN_VERSIONS, decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {decodeKeyBehaviorDomain, encodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");
const {decodeRgbDomainV1, encodeRgbDomainV1} = require("../../core/schema/rgb-domain-v1");
const {decodeComboDomain, encodeComboDomain} = require("../../core/schema/combo-domain-v1");
const {decodeSettings, encodeSettings} = require("../../core/schema/settings-domain-v1");
const {decodePdDomain, encodePdDomain} = require("../../core/schema/pd-mode-domain-v1");

// Each domain's own codec, which must write back exactly what it read.
const {decodeKeymapDomain, encodeKeymapDomain} = require("../../core/schema/keymap-domain-v1");
const {decodeMacroDomain, encodeMacroDomain} = require("../../core/schema/macro-domain-v1");
const CODECS = new Map([
    [0x10, payload => encodeRgbDomainV1(decodeRgbDomainV1(payload))],
    [0x20, payload => encodeKeyBehaviorDomain(decodeKeyBehaviorDomain(payload))],
    [0x30, payload => encodeComboDomain(decodeComboDomain(payload))],
    [0x40, payload => encodeSettings(decodeSettings(payload))],
    [0x50, payload => encodePdDomain(decodePdDomain(payload))],
    [0x60, payload => encodeKeymapDomain(decodeKeymapDomain(payload))],
    // Macro domain accepts unused capacity after slot 127. Re-encoding the
    // streams drops that tail; this fixture guard separately preserves it.
    [0x70, payload => {
        const canonical = encodeMacroDomain(decodeMacroDomain(payload));
        assert.deepEqual(canonical, payload.subarray(0, canonical.length));
        return Buffer.concat([canonical, payload.subarray(canonical.length)]);
    }],
]);

/** @param {string} name */
function fixture(name) {
    return new Map(fs.readFileSync(path.resolve(__dirname, `../../upstream/firmware/tests/fixtures/${name}`), "utf8")
        .split(/\r?\n/).filter(line => line && !line.startsWith("#"))
        .map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
}

// The firmware's whole current profiles: every table at its maximum, and one
// populated as a keyboard holds it, with every macro and custom key named.
for (const name of ["maximum_profile_v4.fixture", "populated_profile_v4.fixture"]) {
    test(`${name} decodes as the firmware describes it and every domain writes back exactly its bytes`, () => {
        const values = fixture(name), bytes = Buffer.from(values.get("profile.hex"), "hex");
        const decoded = decodeProfileBlob(bytes);
        assert.equal(bytes.length, Number(values.get("profile.byte_length")));
        assert.equal(decoded.crc32, Number.parseInt(values.get("profile.crc32"), 16));
        assert.deepEqual(decoded.domains.map(domain => domain.id), [...CODECS.keys()]);
        for (const domain of decoded.domains) {
            const id = domain.id.toString(16);
            assert.equal(domain.version, Number(values.get(`domain.${id}.version`)), `domain 0x${id} version`);
            assert.equal(domain.version, PROFILE_DOMAIN_VERSIONS[domain.id], `domain 0x${id} is the version Ark reads`);
            assert.equal(domain.payload.length, Number(values.get(`domain.${id}.length`)), `domain 0x${id} length`);
            assert.deepEqual(CODECS.get(domain.id)(domain.payload), domain.payload, `domain 0x${id}`);
        }
        assert.deepEqual(encodeProfileBlob({domains: decoded.domains}), bytes);
    });
}
