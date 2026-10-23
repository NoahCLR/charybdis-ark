"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {snapshotLive} = require("../../core/session/live-profile-session");
const {connectedService} = require("../fixtures/connected-service");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {editLayers} = require("../fixtures/profile-document");
const {EDIT_MODE} = require("../../core/protocol/profile-edit-v1");

/** @param {import("node:test").TestContext} t @param {object} [options] */
async function live(t, options = {}) {
    const keyboard = liveKeyboard({document: document(), ...options});
    const {service} = await connectedService(t, {keyboard}, {sleep: async () => {}});
    return {service, keyboard, snapshot: () => snapshotLive(service.connection, service.requestIds, service.capabilities)};
}

test("over compiled defaults, the saved profile is the compiled one", async t => {
    const {keyboard, snapshot} = await live(t, {compiledOnly: true});
    const edited = document(); editLayers(edited, layers => {layers[0][1] = 0x05;});
    keyboard.externalEdit(Buffer.from(edited.profile, "base64"));
    const read = await snapshot();
    assert.equal(read.live.savedGeneration, 0);
    assert.ok(read.live.saved.equals(read.live.defaults));
    assert.equal(read.live.unsaved, true);
    assert.equal(read.live.mode, EDIT_MODE.LIVE_REVIEW);
    assert.notEqual(read.fingerprint, read.saved.fingerprint);
    assert.ok(read.live.working.equals(keyboard.working), "the working copy's own bytes, for splices");
});

// Connecting reads what the keyboard runs; with nothing unsaved that is the
// saved record itself, served from flash, so the saved profile's read takes
// those bytes once they pass its checks instead of downloading them again.
test("with nothing unsaved the saved profile is not downloaded again", async t => {
    const {PROFILE_PAYLOAD_V1} = require("../../core/protocol/profile-payload-v1");
    const {keyboard, snapshot} = await live(t);
    const savedChunks = () => keyboard.requests.filter(r => r[0] === 0x08 && r[2] === PROFILE_PAYLOAD_V1.VALUE && (r[4] | r[5] << 8) > 0).length;
    keyboard.requests.length = 0;
    const read = await snapshot();
    assert.equal(read.live.unsaved, false);
    assert.equal(savedChunks(), 0);
    assert.ok(read.live.saved.equals(read.live.working));
    const edited = document(); editLayers(edited, layers => {layers[0][1] = 0x05;});
    keyboard.externalEdit(Buffer.from(edited.profile, "base64"));
    keyboard.requests.length = 0;
    const unsaved = await snapshot();
    assert.equal(unsaved.live.unsaved, true);
    assert.ok(savedChunks() > 0, "with unsaved edits the saved profile is downloaded");
    assert.ok(!unsaved.live.saved.equals(unsaved.live.working));
    assert.ok(unsaved.live.saved.equals(read.live.saved));
});

test("a working copy that moves during the read is refused, never mixed", async t => {
    const {keyboard, snapshot} = await live(t);
    const edited = document(); editLayers(edited, layers => {layers[0][1] = 0x05;});
    const answer = keyboard.answer;
    let moved = false;
    keyboard.answer = report => {
        // Another client's edit lands once the bytes have been read.
        if (!moved && report[0] === 0x08 && report[2] === 0x06) {moved = true; keyboard.externalEdit(Buffer.from(edited.profile, "base64"));}
        return answer(report);
    };
    await assert.rejects(snapshot(), {code: "PROFILE_CHANGED"});
});

test("a read waits while the keyboard is still taking an edit, then reads what it settled on", async t => {
    const keyboard = liveKeyboard({document: document()});
    const {service} = await connectedService(t, {keyboard}, {sleep: async () => {}});
    const {buildEditBeginRequest, buildEditAbortRequest} = require("../../core/protocol/profile-edit-v1");
    keyboard.answer(buildEditBeginRequest(9, {session: keyboard.session, revision: keyboard.revision, splices: 1, insertTotal: 1}));
    let waits = 0;
    const read = await snapshotLive(service.connection, service.requestIds, service.capabilities, {
        // Someone releases the held key: the edit ends after a few polls.
        sleep: async () => {if (++waits === 3) keyboard.answer(buildEditAbortRequest(9));},
    });
    assert.equal(waits, 3);
    assert.equal(read.live.unsaved, false);
});
