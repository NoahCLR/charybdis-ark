// @ts-check
"use strict";
const fixture = require("./device-profile-readback.json");
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {decodeLightingDomain} = require("../../core/schema/lighting-domain-v1");
const {decodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");
const bytes = Buffer.from(fixture.profileHex, "hex");
function decodedDeviceProfile() {
    const blob = decodeProfileBlob(bytes);
    return {
        state: "read", source: "compiled", generation: 0, digest: blob.digest,
        byteLength: bytes.length, failures: [],
        domains: {
            rgb: decodeLightingDomain(blob.domains[0].payload),
            keyBehaviors: decodeKeyBehaviorDomain(blob.domains[1].payload),
        },
    };
}
module.exports = {bytes, capabilities: fixture.capabilities, decodedDeviceProfile};
