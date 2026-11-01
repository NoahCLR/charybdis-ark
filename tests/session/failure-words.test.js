"use strict";
// What a failure says to a person (interface contracts: no code or developer
// word reaches one): Ark's own sentences as they are, a fault in Ark as a
// plain sentence with its own text kept in the diagnostics.
const test = require("node:test");
const assert = require("node:assert/strict");
const {openPanelLoop} = require("../../core/session/panel-loop");
const {FakeDeviceAdapter} = require("../../core/transport/fake-device-adapter");
const {LIVE_LINK_ERROR_CODES, liveLinkError} = require("../../core/transport/device-adapter");
const {FAILURE_WORDS, failureSentence} = require("../../core/model/vocabulary");
const {EDIT_MODE} = require("../../core/protocol/profile-edit-v1");
const {ProfileWireProtocolError} = require("../../core/protocol/profile-wire-v1");
const {decodeEditModePage} = require("../../core/protocol/profile-edit-v1");
const {normalizeRawHidReport} = require("../../core/transport/device-adapter");
const {publicError, rejection} = require("../../core/session/operation-failure");
const {buildDeviceModel} = require("../../core/session/device-model");
const {fakeShell, lastMessage, openLoop} = require("../fixtures/panel-loop");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {document} = require("../fixtures/portable-profile");

test("Ark's own sentences are said as they are; the language's and the browser's errors are not", () => {
    const said = (error) => failureSentence(error) !== FAILURE_WORDS.unexpected;
    assert.equal(said(new Error("Read the keyboard before editing.")), true, "a plain Error is Ark's sentence");
    assert.equal(said(liveLinkError(LIVE_LINK_ERROR_CODES.TIMEOUT, "The keyboard did not answer.")), true, "so is one with Ark's code");
    assert.equal(said(Object.assign(new Error("Nothing was saved."), {code: "RESTORE_NOT_SAVED"})), true);
    assert.equal(said({code: "RESTORE_VERIFY_FAILED", message: "The keyboard did not confirm it."}), true, "as a failure's details carry it");
    assert.equal(said(new TypeError("deviceId must be a non-empty string.")), false);
    assert.equal(said(new RangeError("Offset is outside the bounds of the DataView")), false);
    assert.equal(said(Object.assign(new Error("Connect the keyboard first."), {code: "Error"})), true, "a sentence the device service passed on with its name for a code");
    assert.equal(said(Object.assign(new Error("x is not a function"), {code: "TypeError"})), false, "and a fault it passed on the same way");
    assert.equal(said(Object.assign(new TypeError("The \"value\" argument must be of type number."), {code: "ERR_INVALID_ARG_TYPE"})), false, "Node's own coded errors");
    assert.equal(said(new DOMException("Failed to write the report.", "NotAllowedError")), false, "the browser's DOMException");
    assert.equal(said("boom"), false);
    assert.equal(said(undefined), false);
    assert.equal(said(new Error("")), false, "an empty message says nothing");
});

test("an answer from the keyboard that did not read is said in words, its decoder's text kept for the diagnostics", () => {
    const malformed = new ProfileWireProtocolError("MALFORMED_RESPONSE", "Profile Wire payload length exceeds one report.");
    const incompatible = new ProfileWireProtocolError("INCOMPATIBLE_RESPONSE", "Unsupported Profile Wire status layout.");
    assert.equal(failureSentence(malformed), FAILURE_WORDS.unreadable);
    assert.equal(failureSentence(incompatible), FAILURE_WORDS.incompatible);
    // Every protocol that reads an answer marks its errors so (a reader of
    // the profile's bytes is marked where Ark reads them: below).
    const editPage = Buffer.alloc(11);
    editPage[10] = 0xff;
    assert.throws(() => decodeEditModePage(editPage), (error) => failureSentence(error) === FAILURE_WORDS.incompatible);
    // As the device service records and rejects with it, too.
    const recorded = publicError(malformed);
    assert.equal(recorded.message, malformed.message, "the record keeps the decoder's text for the diagnostics");
    assert.equal(failureSentence(recorded), FAILURE_WORDS.unreadable);
    assert.equal(failureSentence(rejection(recorded)), FAILURE_WORDS.unreadable);
    // And the Keyboard screen says it the same way.
    assert.equal(buildDeviceModel({connected: false, error: recorded}).device.health.error, FAILURE_WORDS.unreadable);
});

test("a profile the keyboard stores that does not read is said as its answer, never in a decoder's or a backup's words", () => {
    const {decodeStoredProfileBlob} = require("../../core/schema/profile-blob-v1");
    const {answered} = require("../../core/schema/bytes");
    const {decodeSettings} = require("../../core/schema/settings-domain-v1");
    const {baseRgbForView} = require("../../core/model/device-profile-view");
    assert.throws(() => decodeStoredProfileBlob(Buffer.alloc(3)), (error) => error.fault === "answer" && failureSentence(error) === FAILURE_WORDS.unreadable && /header/.test(error.message));
    // A settings answer that does not decode, as the base lighting read takes it.
    assert.throws(() => answered(() => decodeSettings(Buffer.alloc(4))), (error) => failureSentence(error) === FAILURE_WORDS.unreadable);
    // Ark's own faults stay its own.
    assert.throws(() => answered(() => {throw new TypeError("x is undefined");}), (error) => failureSentence(error) === FAILURE_WORDS.unexpected);
    // And the background effect a failed read leaves says it the same way.
    const malformed = new ProfileWireProtocolError("MALFORMED_RESPONSE", "Settings readback is 2 bytes short.");
    assert.equal(baseRgbForView({state: "unavailable", error: publicError(malformed)}).message, FAILURE_WORDS.unreadable);
});

test("a stored profile whose macros do not decode is the keyboard's answer, never a backup's", () => {
    const {createSnapshot} = require("../../core/model/portable-profile");
    const {withPayload} = require("../fixtures/profile-document");
    const stored = Buffer.from(document().profile, "base64");
    // A macro domain of one zero byte: a blob that reads, a domain that does not.
    const profile = withPayload(stored, "macros", () => Buffer.alloc(1));
    assert.throws(() => createSnapshot({profile, actionAbiDigest: document().actionAbiDigest}),
        (error) => failureSentence(error) === FAILURE_WORDS.unreadable && !/this file/.test(failureSentence(error)));
});

test("a key a person typed that the keyboard cannot store says so; a byte format's own refusal is Ark's", () => {
    const {semanticActionForExpression} = require("../../core/schema/compiled-profile-v1");
    const {encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
    assert.throws(() => semanticActionForExpression("KC_FOOBAR", {}), (error) => failureSentence(error) === "KC_FOOBAR is not a key this keyboard can store.");
    assert.throws(() => semanticActionForExpression("MO(Nowhere)", {layers: []}), (error) => failureSentence(error) === "Nowhere is not a layer this keyboard has.");
    // Ark building bytes it cannot is no sentence for a person.
    assert.throws(() => encodeProfileBlob({domains: Array.from({length: 256}, (_, id) => ({id, version: 1, payload: Buffer.alloc(1)}))}),
        (error) => error.fault === "ark" && failureSentence(error) === FAILURE_WORDS.unexpected);
});

test("a byte format's refusal says itself when it answers a person's choice, and is Ark's when it names bytes", () => {
    const {encodeComboDomain, decodeComboDomain} = require("../../core/schema/combo-domain-v1");
    const {decodeSettings} = require("../../core/schema/settings-domain-v1");
    const {decodePdDomain} = require("../../core/schema/pd-mode-domain-v1");
    const {applySplices} = require("../../core/schema/profile-splices");
    // A person's choice: a combo of one key.
    assert.throws(() => encodeComboDomain({defaultTermMs: 50, holdTermMs: 200, rows: [{inputs: [4], output: 5}]}), (error) => /two to/.test(failureSentence(error)));
    // The format's bytes, which Ark wrote: Ark's own problem.
    for (const read of [() => decodeComboDomain(Buffer.alloc(3)), () => decodeSettings(Buffer.alloc(4)), () => decodePdDomain(Buffer.alloc(3))]) {
        assert.throws(read, (error) => error.fault === "ark" && failureSentence(error) === FAILURE_WORDS.unexpected);
    }
    // A pointing mode a person set says itself; a record's layout, which no
    // person sets, is Ark's.
    const {encodePdDomain} = require("../../core/schema/pd-mode-domain-v1");
    const slots = () => [...require("../../upstream/firmware/tests/fixtures/pd_mode_domain_v1.json").slots.map(({buttons: _retired, ...slot}) => slot),
        ...Array.from({length: 24}, (_, index) => ({id: index + 8, kind: 0, name: ""}))];
    const pointing = (change) => {const value = slots(); change(value); return () => encodePdDomain(value);};
    assert.throws(pointing(value => {Object.assign(value[1], {linkedLayers: 0b110000}); Object.assign(value[3], {linkedLayers: 0b1100000});}),
        (error) => failureSentence(error) === "Another pointing mode already starts from one of these layers.");
    assert.throws(pointing(value => {value[1].name = "x".repeat(40);}), (error) => error.code === "INVALID_NAME" && failureSentence(error) === error.message);
    assert.throws(pointing(value => {value[9] = {id: 9, kind: 0, name: "Spare", linkTurnsOn: 1};}),
        (error) => error.code === "INVALID_PARAMETER" && failureSentence(error) === FAILURE_WORDS.unexpected);
    // So with the keyboard's settings: a name a person typed, and a placement
    // Ark built off the keyboard.
    const {encodeSettings} = require("../../core/schema/settings-domain-v1");
    const {validateSnapshot} = require("../../core/model/portable-profile");
    const settings = (change) => {const value = structuredClone(validateSnapshot(document()).settings); change(value); return () => encodeSettings(value);};
    assert.throws(settings(value => {value.names[0] = "x".repeat(40);}), (error) => /at most/.test(failureSentence(error)));
    assert.throws(settings(value => {value.layers[0].bypass = [999];}), (error) => failureSentence(error) === FAILURE_WORDS.unexpected);
    // A splice into a domain a profile that reads does not hold.
    const profile = Buffer.from(document().profile, "base64");
    assert.throws(() => applySplices(profile, {splices: [{domainId: 0x99, offset: 0, remove: 0, insert: 1}], stream: Buffer.alloc(1)}),
        (error) => error.code === "INVALID_SPLICE" && /0x99/.test(error.message) && failureSentence(error) === FAILURE_WORDS.unexpected);
});

test("a transport fault in Ark is no sentence for a person", () => {
    assert.throws(() => normalizeRawHidReport(new Uint8Array(3)), (error) => error.code === "INVALID_REPORT" && failureSentence(error) === FAILURE_WORDS.unexpected);
    assert.equal(failureSentence(liveLinkError(LIVE_LINK_ERROR_CODES.DISCONNECTED, "The keyboard was disconnected.")), "The keyboard was disconnected.");
});

test("a fault in Ark reaches the panel as a plain sentence, its own text in the diagnostics", async () => {
    const shell = fakeShell();
    const loop = openPanelLoop(/** @type {any} */ (shell), {adapter: new FakeDeviceAdapter()});
    try {
        loop.session.service.readPortableProfile = async () => {throw new TypeError("Cannot read properties of undefined (reading 'document')");};
        await loop.handleMessage({type: "exportPortableProfile"});
        const reply = lastMessage(shell);
        assert.equal(reply.notice, `Failed: ${FAILURE_WORDS.unexpected}`);
        assert.equal(reply.failed, true);
        assert.deepEqual(shell.errors, [FAILURE_WORDS.unexpected], "the shell hears what the panel says");
        assert.equal(loop.session.service.snapshot().diagnostics.at(-1), "TypeError: Cannot read properties of undefined (reading 'document')");
        assert.equal(reply.model.diagnostics.at(-1), "TypeError: Cannot read properties of undefined (reading 'document')",
            "and the Keyboard screen's Diagnostics list it, where the guide says it is");
        // A shell's own failure is said the same way.
        loop.fail(new Error("That recovery copy is no longer in this browser."));
        assert.equal(shell.posted.at(-1).notice, "Failed: That recovery copy is no longer in this browser.");
    } finally {await loop.close();}
});

// A fault as the device service rejects with it once recorded (runOperation:
// its name, TypeError, for a code), and as it is thrown.
for (const [how, fault] of /** @type {const} */ ([
    ["recorded", () => rejection(publicError(new TypeError("Cannot read properties of undefined (reading 'bytes')")))],
    ["thrown", () => new TypeError("Cannot read properties of undefined (reading 'bytes')")],
])) test(`a draft a fault kept from going live says so plainly, and is kept (the fault ${how})`, async t => {
    const {keyboard, session, key, send, shell} = await openLoop(t, {keyboard: liveKeyboard({document: document(), mode: EDIT_MODE.APPLY})});
    await key(0, 11, "KC_R");
    session.service.postLiveEdit = async () => {throw fault();};
    await send({type: "setEditMode", mode: EDIT_MODE.LIVE_REVIEW, pending: "send", confirmChecks: true});
    const {notice} = lastMessage(shell);
    assert.match(notice, new RegExp(`^Failed: Your draft was not sent: ${FAILURE_WORDS.unexpected.replace(/[.]/g, "\\.")} `));
    assert.doesNotMatch(notice, /properties|undefined/);
    assert.match(notice, /your draft is kept/);
    assert.equal(session.draft.dirty, true);
    assert.equal(keyboard.mode, EDIT_MODE.APPLY);
    assert.ok(session.service.snapshot().diagnostics.includes("TypeError: Cannot read properties of undefined (reading 'bytes')"));
});
