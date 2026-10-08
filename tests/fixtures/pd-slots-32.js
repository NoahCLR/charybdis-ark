"use strict";
// The 32 pointing slots of current firmware's compiled profile
// (portable-profile.js), with a slot past the first eight configured.
const {validateSnapshot} = require("../../core/model/portable-profile");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {decodePdDomain, encodePdDomain} = require("../../core/schema/pd-mode-domain-v1");
const {decodeRgbDomainV1, encodeRgbDomainV1} = require("../../core/schema/rgb-domain-v1");
const {compiled, document: backup, CURRENT_CAPABILITIES} = require("./portable-profile");

const CAPABILITIES_32 = CURRENT_CAPABILITIES;
const compiled32 = () => compiled();
const backup32 = () => backup();

// Volume copied into slot 12 as "Tabs", with its own colour, so a screen has
// a high slot that does something.
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

module.exports = {CAPABILITIES_32, backup32, compiled32, document32};
