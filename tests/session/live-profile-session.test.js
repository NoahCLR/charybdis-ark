"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {captureLive} = require("../../core/session/live-profile-session");
const {connectedService} = require("../fixtures/connected-service");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {editLayers} = require("../fixtures/profile-document");
const {EDIT_MODE} = require("../../core/protocol/profile-edit-v1");

/** @param {import("node:test").TestContext} t @param {object} [options] */
async function live(t, options = {}) {
    const keyboard = liveKeyboard({document: document(), ...options});
    const {service} = await connectedService(t, {keyboard}, {sleep: async () => {}});
    return {service, keyboard, capture: () => captureLive(service.connection, service.requestIds, service.capabilities)};
}

test("over compiled defaults, the saved profile is the compiled one", async t => {
    const {keyboard, capture} = await live(t, {compiledOnly: true});
    const edited = document(); editLayers(edited, layers => {layers[0][1] = 0x05;});
    keyboard.externalEdit(Buffer.from(edited.profile, "base64"));
    const read = await capture();
    assert.equal(read.live.savedGeneration, 0);
    assert.ok(read.live.saved.equals(read.live.defaults));
    assert.equal(read.live.unsaved, true);
    assert.equal(read.live.mode, EDIT_MODE.LIVE_REVIEW);
    assert.notEqual(read.fingerprint, read.saved.fingerprint);
    assert.ok(read.live.working.equals(keyboard.working), "the working copy's own bytes, for splices");
});

test("a working copy that moves during the read is refused, never mixed", async t => {
    const {keyboard, capture} = await live(t);
    const edited = document(); editLayers(edited, layers => {layers[0][1] = 0x05;});
    const answer = keyboard.answer;
    let moved = false;
    keyboard.answer = report => {
        // Another client's edit lands once the bytes have been read.
        if (!moved && report[0] === 0x08 && report[2] === 0x06) {moved = true; keyboard.externalEdit(Buffer.from(edited.profile, "base64"));}
        return answer(report);
    };
    await assert.rejects(capture(), {code: "PROFILE_CHANGED"});
});

test("a read waits while the keyboard is still taking an edit, then reads what it settled on", async t => {
    const keyboard = liveKeyboard({document: document()});
    const {service} = await connectedService(t, {keyboard}, {sleep: async () => {}});
    const {buildEditBeginRequest, buildEditAbortRequest} = require("../../core/protocol/profile-edit-v1");
    keyboard.answer(buildEditBeginRequest(9, {session: keyboard.session, revision: keyboard.revision, splices: 1, insertTotal: 1}));
    let waits = 0;
    const read = await captureLive(service.connection, service.requestIds, service.capabilities, {
        // Someone releases the held key: the edit ends after a few polls.
        sleep: async () => {if (++waits === 3) keyboard.answer(buildEditAbortRequest(9));},
    });
    assert.equal(waits, 3);
    assert.equal(read.live.unsaved, false);
});
