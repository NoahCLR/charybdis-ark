// @ts-check
"use strict";
// Test builders edit the actual profile domains, keeping the JSON envelope
// honest. Reading a view never adds fields to the portable document.
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {replaceDomain, domainCodec} = require("../../core/schema/profile-domains");
/** @param {import('../../core/model/types.js').PortableDocument} document */
function profileLayers(document) {
    return domainCodec("keymap").decode(payload(document, 0x60));
}
/** @param {import('../../core/model/types.js').PortableDocument} document */
function profileMacros(document) {
    return domainCodec("macros").decode(payload(document, 0x70)).map(bytes => bytes.toString("base64"));
}
/** @param {import('../../core/model/types.js').PortableDocument} document @param {number} id */
function payload(document, id) {
    const found = decodeProfileBlob(Buffer.from(document.profile, "base64")).domains.find(row => row.id === id);
    if (!found) throw Error(`Missing test domain ${id}`);
    return found.payload;
}
/** @param {import('../../core/model/types.js').PortableDocument} document @param {(layers: number[][]) => unknown} change */
function editLayers(document, change) {
    const layers = profileLayers(document); change(layers);
    document.profile = replaceDomain(Buffer.from(document.profile, "base64"), 0x60, () => domainCodec("keymap").encode(layers)).toString("base64");
    return document;
}
/** @param {import('../../core/model/types.js').PortableDocument} document @param {(macros: string[]) => unknown} change */
function editMacros(document, change) {
    const macros = profileMacros(document); change(macros);
    document.profile = replaceDomain(Buffer.from(document.profile, "base64"), 0x70, () => domainCodec("macros").encode(macros.map(value => Buffer.from(value, "base64")))).toString("base64");
    return document;
}
module.exports = {profileLayers, profileMacros, editLayers, editMacros};
