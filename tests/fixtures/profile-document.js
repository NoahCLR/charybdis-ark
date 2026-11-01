// @ts-check
"use strict";
// Test builders edit the actual profile domains, keeping the JSON envelope
// honest. Reading a view never adds fields to the portable document. They
// write what a test needs, a keyboard's own bytes or a payload no editor
// writes included, so unlike editProfileDomains they check nothing.
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {domainCodec} = require("../../core/schema/profile-domains");
/**
 * @typedef {import('../../core/model/types.js').PortableDocument} PortableDocument
 * @typedef {import('../../core/schema/profile-domains-types.js').DomainKey} DomainKey
 * @typedef {import('../../core/schema/profile-domains-types.js').DomainModels} DomainModels
 */
// A profile blob with one domain's payload rewritten, every other domain
// keeping its bytes.
/** @param {Uint8Array} bytes @param {DomainKey} key @param {(payload: Buffer) => Buffer} change */
function withPayload(bytes, key, change) {
    const blob = decodeProfileBlob(bytes), id = domainCodec(key).id;
    if (!blob.domains.some(row => row.id === id)) throw Error(`Missing test domain ${key}`);
    return encodeProfileBlob({...blob, domains: blob.domains.map(domain => domain.id === id ? {...domain, payload: change(domain.payload)} : domain)});
}
/** @template {DomainKey} K @param {PortableDocument} document @param {K} key @returns {DomainModels[K]} */
function profileDomain(document, key) {
    const found = decodeProfileBlob(Buffer.from(document.profile, "base64")).domains.find(row => row.id === domainCodec(key).id);
    if (!found) throw Error(`Missing test domain ${key}`);
    return domainCodec(key).decode(found.payload);
}
// The document with one domain's model changed in place.
/** @template {DomainKey} K @param {PortableDocument} document @param {K} key @param {(value: DomainModels[K]) => unknown} change */
function editDomain(document, key, change) {
    const codec = domainCodec(key);
    document.profile = withPayload(Buffer.from(document.profile, "base64"), key, payload => {
        const value = codec.decode(payload); change(value); return codec.encode(value);
    }).toString("base64");
    return document;
}
/** @param {PortableDocument} document */
const profileLayers = document => profileDomain(document, "keymap");
/** @param {PortableDocument} document */
const profileMacros = document => profileDomain(document, "macros").map(bytes => bytes.toString("base64"));
/** @param {PortableDocument} document @param {(layers: number[][]) => unknown} change */
const editLayers = (document, change) => editDomain(document, "keymap", change);
/** @param {PortableDocument} document @param {(macros: string[]) => unknown} change */
const editMacros = (document, change) => editDomain(document, "macros", slots => {
    const macros = slots.map(bytes => bytes.toString("base64")); change(macros);
    slots.splice(0, slots.length, ...macros.map(value => Buffer.from(value, "base64")));
});
/** @param {PortableDocument} document @param {(settings: import('../../core/schema/types.js').SettingsDomain) => unknown} change */
const editSettingsDomain = (document, change) => editDomain(document, "settings", change);
module.exports = {withPayload, profileDomain, editDomain, profileLayers, profileMacros, editLayers, editMacros, editSettingsDomain};
