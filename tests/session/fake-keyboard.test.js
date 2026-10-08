"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {openPanelLoop} = require("../../core/session/panel-loop");
const {fingerprint} = require("../../core/model/portable-profile");
const {fakeKeyboardAdapter} = require("../fixtures/fake-keyboard");
const {backup32, document32} = require("../fixtures/pd-slots-32");
const pdProfile = require("../fixtures/pd-profile");

function recordingHost() {
    const host = {
        posted: [], errors: [],
        post: (message) => {host.posted.push(message);},
        showError: (text) => {host.errors.push(text);},
        progress: async (title, work) => work(),
        saveRecovery: async () => {throw new Error("a read must not save a recovery copy");},
        chooseProfile: async () => undefined,
        saveExport: async () => undefined,
    };
    return host;
}
const last = (host) => host.posted[host.posted.length - 1];

// Two current documents: the compiled profile with an empty layout, and a
// backup with keys on its layout and a combo, so both banks and the combo
// readback carry something.
for (const [name, document] of [["the compiled pointing profile", document32()], ["a backup with keys and a combo", backup32()]]) {
    test(`a complete read of the fake keyboard reproduces ${name} and opens an editable draft`, async () => {
        const host = recordingHost(), adapter = fakeKeyboardAdapter({document});
        const loop = openPanelLoop(host, {adapter, defaultTimeoutMs: 200});
        try {
            await loop.handleMessage({type: "ready"});
            const {model, notice} = last(host);
            assert.deepEqual(host.errors, []);
            assert.doesNotMatch(String(notice), /Failed/);
            assert.equal(loop.session.readReady, true, notice);
            assert.equal(model.load.state, "ready");
            assert.ok(model.draft, "a complete read opens the draft");
            assert.equal(model.draft.matching, true);
            assert.equal(loop.session.draft.current.fingerprint, fingerprint(document), "the read reproduced the document");

            const draft = model.draft;
            await loop.handleMessage({type: "updateLayoutKeys", draftId: draft.id, draftRevision: draft.revision,
                layers: [{layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_B"}]}]});
            assert.ok(last(host).acceptedEdit);
            assert.equal(last(host).model.draft.dirty, true);

            const keyboard = adapter.keyboard;
            assert.ok(keyboard.requests.length > 500, "the whole keyboard was read over the wire");
            assert.deepEqual(keyboard.mutations, [], "a read and a staged edit write nothing to the keyboard");
        } finally {
            await loop.close();
        }
    });
}

test("the fake keyboard refuses a write with the unhandled echo and records it", () => {
    const {fakeKeyboard} = require("../fixtures/fake-keyboard");
    const keyboard = fakeKeyboard({document: document32()});
    const write = Buffer.alloc(32); write.set([0x05, 0, 0, 0, 0x00, 0x04]);
    const [response] = keyboard.answer(write);
    assert.equal(response[0], 0xff);
    assert.deepEqual(response.subarray(1), write.subarray(1));
    assert.equal(keyboard.mutations.length, 1);
});

test("the fake keyboard runs current firmware, and refuses to serve an older profile format", () => {
    const {fakeKeyboard} = require("../fixtures/fake-keyboard");
    const source = pdProfile.document(), profile = Buffer.from(source.profile, "base64");
    profile[9] = 2; // Retired RGB envelope version.
    assert.throws(() => fakeKeyboard({document: {...source, profile: profile.toString("base64")}}), /older firmware/);
});
