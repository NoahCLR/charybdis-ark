// @ts-check
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {diffProfiles, applySplices, liveEditPlan} = require("../../core/schema/profile-splices");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {PROFILE_DOMAIN_VERSIONS, PROFILE_DOMAIN_IDS} = require("../../core/schema/profile-domains");
const {document} = require("../fixtures/portable-profile");

const blob = () => Buffer.from(document().profile, "base64");
/** @param {Buffer} bytes @param {number} id @param {(payload: Buffer) => Buffer} change */
const withDomain = (bytes, id, change) => {
    const decoded = decodeProfileBlob(bytes);
    return encodeProfileBlob({...decoded, domains: decoded.domains.map(domain => domain.id === id ? {...domain, payload: change(Buffer.from(domain.payload))} : domain)});
};
/** @param {Buffer} bytes @param {number} id */
const without = (bytes, id) => {
    const decoded = decodeProfileBlob(bytes);
    return encodeProfileBlob({...decoded, domains: decoded.domains.filter(domain => domain.id !== id)});
};

test("an unchanged profile needs no splice", () => {
    assert.deepEqual(diffProfiles(blob(), blob()), {splices: [], stream: Buffer.alloc(0)});
});

test("one changed key sends only the bytes between the common prefix and suffix", () => {
    const from = blob();
    const to = withDomain(from, 0x60, payload => {payload.writeUInt16LE(0x0004, 10); return payload;});
    const edit = diffProfiles(from, to);
    assert.equal(edit.splices.length, 1);
    assert.equal(edit.splices[0].domainId, 0x60);
    assert.ok(edit.splices[0].insert <= 2 && edit.splices[0].remove === edit.splices[0].insert);
    assert.ok(applySplices(from, edit).equals(to));
});

test("a compound change across domains is one edit, in domain order, that rebuilds the target", () => {
    const from = blob();
    let to = withDomain(from, 0x70, payload => Buffer.concat([Buffer.from([0x01, 0x04]), payload]));
    to = withDomain(to, 0x10, payload => {payload[payload.length - 1] ^= 1; return payload;});
    to = withDomain(to, 0x40, payload => {payload[payload.length - 3] ^= 0x10; return payload;});
    const edit = diffProfiles(from, to);
    assert.deepEqual(edit.splices.map(splice => splice.domainId), [0x10, 0x40, 0x70]);
    assert.equal(edit.stream.length, edit.splices.reduce((total, splice) => total + splice.insert, 0));
    assert.ok(applySplices(from, edit).equals(to));
    // Growing and shrinking both rebuild.
    assert.ok(applySplices(to, diffProfiles(to, from)).equals(from));
});

test("a domain the working copy lacks is created, unless the target is the compiled default", () => {
    const full = blob(), lacking = without(full, 0x30);
    const create = diffProfiles(lacking, full);
    assert.deepEqual(create.splices.map(({domainId, create: made}) => [domainId, made]), [[0x30, true]]);
    assert.ok(applySplices(lacking, create, {versions: PROFILE_DOMAIN_VERSIONS}).equals(full));
    assert.deepEqual(diffProfiles(lacking, full, {defaults: full}).splices, []);
    const drop = diffProfiles(full, lacking);
    assert.deepEqual(drop.splices, [{domainId: 0x30, offset: 0, remove: drop.splices[0].remove, insert: 0, drop: true}]);
    assert.ok(applySplices(full, drop).equals(lacking));
    assert.throws(() => diffProfiles(full, lacking, {required: [0x30]}), {code: "REQUIRED_DOMAIN"});
});

test("applying refuses what the keyboard refuses", () => {
    const from = blob();
    assert.throws(() => applySplices(from, {splices: [{domainId: 0x60, offset: 0, remove: 1e6, insert: 0}], stream: Buffer.alloc(0)}), {code: "INVALID_SPLICE"});
    assert.throws(() => applySplices(from, {splices: [{domainId: 0x60, offset: 4, remove: 0, insert: 2}, {domainId: 0x10, offset: 0, remove: 0, insert: 0}], stream: Buffer.alloc(2)}), {code: "INVALID_SPLICE"});
    assert.throws(() => applySplices(from, {splices: [{domainId: 0x60, offset: 0, remove: 0, insert: 2}], stream: Buffer.alloc(3)}), {code: "INVALID_SPLICE"});
});

test("a live edit sends nothing, its splices, or the whole profile when the splices do not fit beside it", () => {
    const from = blob(), lacking = without(from, 0x30);
    assert.deepEqual(liveEditPlan(from, from, {capacity: 1}), {kind: "unchanged"});
    assert.deepEqual(liveEditPlan(lacking, from, {defaults: from, capacity: 1}), {kind: "unchanged"});
    const to = withDomain(from, 0x70, payload => Buffer.concat([Buffer.from([0x01, 0x04]), payload]));
    const {splices, stream} = diffProfiles(from, to);
    // The inserted bytes are staged above both the current and the resulting
    // profile (firmware D-F32).
    const room = stream.length + Math.max(from.length, to.length);
    assert.deepEqual(liveEditPlan(from, to, {capacity: room}), {kind: "splices", splices, stream, bytes: to});
    assert.deepEqual(liveEditPlan(from, to, {capacity: room - 1}), {kind: "replace", stream: to, bytes: to});
});

test("a live edit never drops a domain the firmware requires", () => {
    const from = blob();
    for (const id of [PROFILE_DOMAIN_IDS.RGB, PROFILE_DOMAIN_IDS.KEY_BEHAVIORS]) {
        assert.throws(() => liveEditPlan(from, without(from, id), {capacity: 1 << 20}), {code: "REQUIRED_DOMAIN"});
    }
    assert.equal(liveEditPlan(from, without(from, 0x30), {capacity: 1 << 20}).kind, "splices");
});
