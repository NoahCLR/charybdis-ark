// @ts-check
"use strict";
const fixture = require("./device-profile-readback.json");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {decodeRgbDomainV1} = require("../../core/schema/rgb-domain-v1");
const {decodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");
const bytes = Buffer.from(fixture.profileHex, "hex");
// The combo table this keyboard's readback reports (device-combos.js).
function comboRead() {
    const {decodeComboPages} = require("../../core/protocol/combo-readback-v1");
    const pages = require("./device-combos").fixturePages();
    return {state: /** @type {const} */ ("read"), ...decodeComboPages(pages[0], pages.slice(1))};
}
// A complete document as a draft holds one: this keyboard's lighting and
// behaviours and the combos it reports, around the test profile's other
// domains (portable-profile.js).
/** @returns {import("../../core/model/types.js").PortableDocument} */
function deviceDocument() {
    const document = require("./portable-profile").compiled({combos: comboRead().rows});
    const blob = decodeProfileBlob(Buffer.from(document.profile, "base64")), device = decodeProfileBlob(bytes).domains;
    return {...document, profile: encodeProfileBlob({...blob, domains: blob.domains.map(domain => device.find(row => row.id === domain.id) ?? domain)}).toString("base64")};
}
function decodedDeviceProfile() {
    const blob = decodeProfileBlob(bytes);
    return {
        state: "read", source: "compiled", generation: 0, digest: blob.digest,
        byteLength: bytes.length, failures: [],
        domains: {
            rgb: decodeRgbDomainV1(blob.domains[0].payload),
            keyBehaviors: decodeKeyBehaviorDomain(blob.domains[1].payload),
        },
    };
}
module.exports = {bytes, capabilities: fixture.capabilities, decodedDeviceProfile, comboRead, deviceDocument};
