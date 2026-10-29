"use strict";
// How edits reach the keyboard, as the device service reads it into its own
// state at each status refresh and before a complete read.
const assert = require("node:assert/strict");
const test = require("node:test");
const {connectedService} = require("../fixtures/connected-service");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");
const {testClock} = require("../fixtures/panel-loop");
const {EDIT_MODE} = require("../../core/protocol/profile-edit-v1");
const {PROFILE_ACTIVE_KIND} = require("../../core/protocol/profile-wire-v1");
const {editLayers} = require("../fixtures/profile-document");
const {readServiceEditMode, readLiveFacts, readsLive} = require("../../core/session/edit-mode-reads");

// Only what these reads touch of the service, over a keyboard that fails
// every request with `code`.
/** @param {string} code */
function failing(code) {
    /** @type {string[]} */
    const diagnostics = [];
    let requests = 0;
    const service = {editMode: undefined, editModeUnknown: false, nextRequestId: () => 1, addDiagnostic: (/** @type {string} */ text) => diagnostics.push(text)};
    const connection = {request: async () => {requests++; throw Object.assign(new Error(code), {code});}};
    return {service, connection, diagnostics, requests: () => requests};
}

test("an edit mode that could not be read is tried again; a firmware without one is not", async () => {
    const lost = failing("TIMEOUT");
    await readServiceEditMode(lost.service, lost.connection);
    assert.equal(lost.service.editModeUnknown, true);
    assert.equal(lost.service.editMode, undefined);
    assert.deepEqual(lost.diagnostics, ["The keyboard's edit mode could not be read; Ark tries again."]);
    assert.equal(await readsLive(lost.service, lost.connection), false, "a complete read tries it again first");
    assert.equal(lost.requests(), 2);
    const without = failing("UNHANDLED");
    await readServiceEditMode(without.service, without.connection);
    assert.equal(without.service.editModeUnknown, false);
    assert.deepEqual(without.diagnostics, []);
    await readLiveFacts(without.service, without.connection);
    assert.equal(without.requests(), 1, "without an edit mode nothing more is asked");
});

test("a keyboard reads live outside Review and save, and in it while it runs unsaved edits", async t => {
    const keyboard = liveKeyboard({document: document()});
    const {now, sleep} = testClock();
    const {service} = await connectedService(t, {keyboard}, {now, sleep});
    const connection = service.connectedConnection();
    assert.equal(service.editMode?.mode, EDIT_MODE.LIVE_REVIEW);
    assert.equal(await readsLive(service, connection), true);
    await service.setEditMode(EDIT_MODE.APPLY);
    assert.equal(await readsLive(service, connection), false, "nothing unsaved: Review and save reads the saved profile");
    service.runtime = null;
    await readLiveFacts(service, connection);
    assert.ok(service.runtime, "the toggles a key turned off are read beside the profile");
    assert.equal(service.editMode?.notStored, false);
});

/** @param {import("node:test").TestContext} t */
async function connected(t) {
    const keyboard = liveKeyboard({document: document()});
    const {now, sleep} = testClock();
    const {service} = await connectedService(t, {keyboard}, {now, sleep});
    return {service, keyboard, connection: service.connectedConnection()};
}

test("a mode read again is known again, and keeps whether its last write was stored", async t => {
    const {service, keyboard, connection} = await connected(t);
    service.editMode = {mode: EDIT_MODE.APPLY, counter: 0, conflict: false, notStored: true};
    service.editModeUnknown = true;
    await readServiceEditMode(service, connection);
    assert.equal(service.editModeUnknown, false);
    assert.equal(service.editMode?.mode, keyboard.mode, "the mode the keyboard says");
    assert.equal(service.editMode?.notStored, true, "a read of the mode alone does not say whether it was stored");
});

test("the live facts read an unknown mode first, then the toggles and whether the mode is stored", async t => {
    const {service, keyboard, connection} = await connected(t);
    service.editMode = undefined;
    service.editModeUnknown = true;
    service.runtime = null;
    keyboard.raised.modeNotStored = true;
    await readLiveFacts(service, connection);
    assert.equal(service.editModeUnknown, false);
    assert.equal(service.editMode?.mode, EDIT_MODE.LIVE_REVIEW);
    assert.equal(service.editMode?.notStored, true, "the keyboard still owes the mode's write");
    assert.ok(service.runtime);
});

test("toggles or progress that cannot be read stop nothing, and leave the mode as it was", async () => {
    const lost = failing("TIMEOUT");
    const mode = {mode: EDIT_MODE.LIVE, notStored: false};
    Object.assign(lost.service, {editMode: mode, runtime: null});
    await readLiveFacts(/** @type {any} */ (lost.service), lost.connection);
    assert.equal(lost.requests(), 2, "the toggles and the progress were each asked for once");
    assert.equal(lost.service.editMode, mode);
    assert.equal(/** @type {any} */ (lost.service).runtime, null);
    assert.deepEqual(lost.diagnostics, []);
});

test("in Review and save a keyboard running unsaved edits reads live, and the status it read is kept", async t => {
    const {service, keyboard, connection} = await connected(t);
    await service.setEditMode(EDIT_MODE.APPLY);
    keyboard.externalEdit((() => {const next = document(); editLayers(next, layers => {layers[0][9] = 0x06;}); return Buffer.from(next.profile, "base64");})());
    service.status = undefined;
    assert.equal(await readsLive(service, connection), true);
    assert.equal(service.status?.activeKind, PROFILE_ACTIVE_KIND.WORKING);
    service.editModeUnknown = true;
    service.editMode = undefined;
    assert.equal(await readsLive(service, connection), true, "a mode unknown is read first");
    assert.equal(service.editMode?.mode, EDIT_MODE.APPLY);
});
