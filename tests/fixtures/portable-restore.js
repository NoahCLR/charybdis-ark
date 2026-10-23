// @ts-check
"use strict";
const {editLayers, editMacros} = require("./profile-document");
const assert = require("node:assert/strict");
const {document32: document} = require("./pd-slots-32");
const {fingerprint, validateSnapshot} = require("../../core/model/portable-profile");
const {snapshotProfile, restoreProfile} = require("../../core/session/portable-profile-session");
const {writableKeyboard} = require("./writable-keyboard");
const {fakeKeyboard} = require("./fake-keyboard");
const {buildProfileGetRequest, decodeProfileResponse, decodeCapabilityPages} = require("../../core/protocol/profile-wire-v1");
const capabilityKeyboard = fakeKeyboard({document: document()});
const capabilities = {...decodeCapabilityPages([0, 1, 2].map(page => {
    const request = buildProfileGetRequest(1, page, page + 1);
    return decodeProfileResponse(capabilityKeyboard.answer(request)[0], request);
}))};

/** @param {{source?: import('../../core/model/types.js').PortableDocument, generation?: number, compiledOnly?: boolean}} [input] */
function fixture({source = document(), generation = 4, compiledOnly = false} = {}) {
    const targetDocument = structuredClone(source);
    editLayers(targetDocument, layers => layers[0][0] ^= 1); editMacros(targetDocument, macros => macros[0] = Buffer.from("hello").toString("base64"));
    const target = validateSnapshot(targetDocument);
    const keyboard = writableKeyboard({document: source, generation, compiledOnly});
    let id = 0;
    const ids = {next: () => (id = id % 255 + 1)};
    /** @type {import('../../core/transport/types.js').RequestConnection} */
    const connection = {request: async (report, options) => {
        const response = keyboard.answer(report)[0];
        if (options?.matchResponse) assert.ok(options.matchResponse(response, Buffer.from(report)), "the response matches the real request matcher");
        return response;
    }};
    /** @type {import('../../core/session/types.js').RestoreOptions} */
    const options = {expectedFingerprint: fingerprint(source), sleep: async () => {}, saveRecovery: async backup => {
        assert.equal(fingerprint(backup), fingerprint(source));
        assert.equal(keyboard.mutations.length, 0, "the recovery copy precedes every mutation");
        keyboard.events.push("backup"); return "/recovery.json";
    }};
    const f = {source, targetDocument, target, keyboard, connection, ids, options,
        snapshot: () => snapshotProfile(connection, ids, capabilities, undefined, false, true),
        restore: () => restoreProfile(connection, ids, capabilities, f.targetDocument, options)};
    return f;
}
module.exports = {capabilities, fixture};
