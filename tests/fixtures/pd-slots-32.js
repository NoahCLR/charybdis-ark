// @ts-check
"use strict";
// The 32 pointing slots of current firmware's compiled profile
// (portable-profile.js), with a slot past the first eight configured.
const {validateSnapshot} = require("../../core/model/portable-profile");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {decodePdDomain, encodePdDomain} = require("../../core/schema/pd-mode-domain-v1");
const {decodeLightingDomain, encodeLightingDomain} = require("../../core/schema/lighting-domain-v1");
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
    if (!pd || !rgbDomain) throw new Error("The compiled profile fixture must contain PD and RGB domains.");
    const slots = decodePdDomain(pd.payload);
    slots[12] = {...structuredClone(slots[1]), id: 12, name: "Tabs"};
    pd.payload = encodePdDomain(slots);
    const rgb = decodeLightingDomain(rgbDomain.payload);
    const color = rgb.things.find(t => t.kind === 2)?.records[12];
    if (!color) throw new Error("The compiled RGB fixture must contain pointing slot 12.");
    color[1] = rgb.palette.length;
    rgb.palette.push({h: 200, s: 255, v: 200});
    rgbDomain.payload = encodeLightingDomain(rgb);
    doc.profile = encodeProfileBlob(blob).toString("base64");
    validateSnapshot(doc, CAPABILITIES_32);
    return doc;
}

module.exports = {CAPABILITIES_32, backup32, compiled32, document32};
