"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {openPanelLoop} = require("../../core/session/panel-loop");
const {fingerprint} = require("../../core/model/portable-profile");
const {fakeKeyboardAdapter} = require("../fixtures/fake-keyboard");
const {backup32, document32} = require("../fixtures/pd-slots-32");
const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require("../../core/data/charybdis-layout");
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
            assert.equal(keyboard.requests.filter(request => request[0] === 0x04).length, 0, "layout reads never fall back to one request per key");
            assert.equal(keyboard.requests.filter(request => request[0] === 0x12).length, 69,
                "one coherent layout capture feeds the editor and complete backup");
            const profileChunks = keyboard.requests.filter(request => request[0] === 0x08 && request[2] === 4 && (request[4] || request[5]));
            assert.equal(profileChunks.length, Math.ceil(Buffer.from(document.profile, "base64").length / 25),
                "the shared capture downloads committed bytes once");
            assert.ok(keyboard.requests.length > 500, "the whole keyboard was read over the wire");
            assert.equal(keyboard.requests.filter(request => request[0] === 8 && request[1] === 0 && request[2] === 6).length,
                3 + 2 * loop.session.service.combos.rows.length, "one verified combo capture feeds both views");
            assert.deepEqual(loop.session.service.layout.layers.flatMap(({layer, keys}) => keys.map(key => key.keycode)),
                document.layers.flatMap(layer => CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column]) => layer[row * 6 + column])));
            assert.deepEqual(keyboard.mutations, [], "a read and a staged edit write nothing to the keyboard");
        } finally {
            await loop.close();
        }
    });
}

test("profile verification reads fresh committed bytes, reuses immutable defaults, and clears reuse on reconnect", async () => {
    const source = document32(), host = recordingHost(), adapter = fakeKeyboardAdapter({document: source});
    const loop = openPanelLoop(host, {adapter, defaultTimeoutMs: 200});
    const chunks = value => adapter.keyboard.requests.filter(request => request[0] === 0x08 && request[2] === value && (request[4] || request[5])).length;
    const count = Math.ceil(Buffer.from(source.profile, "base64").length / 25);
    try {
        await loop.handleMessage({type: "ready"});
        const service = loop.session.service;
        assert.equal(chunks(4), count); assert.equal(chunks(5), count);
        // This is the same entry point used immediately after Apply. An
        // unchanged generation must still have a complete fresh read.
        await service.readCommittedProfile();
        assert.equal(chunks(4), count * 2);
        const snapshot = await service.readPortableProfile();
        assert.equal(fingerprint(snapshot.document), fingerprint(source));
        assert.equal(chunks(4), count * 3, "standalone exports read committed payload bytes freshly");
        assert.equal(chunks(5), count, "compiled defaults need only metadata within this connection");
        const originalAnswer = adapter.keyboard.answer;
        adapter.keyboard.answer = request => {
            const responses = originalAnswer(request);
            if (request[0] === 0x08 && request[2] === 4 && request[4] === 1) responses[0][7] ^= 1;
            return responses;
        };
        const failed = await service.readCommittedProfile();
        assert.equal(failed.error.code, "PAYLOAD_CORRUPT", "cached metadata cannot hide damaged post-Apply readback bytes");
        adapter.keyboard.answer = originalAnswer;
        await service.disconnect();
        assert.equal(service.payloadReader, undefined);
        await loop.handleMessage({type: "refresh"});
        assert.equal(chunks(5), count * 2, "a new connection reads compiled defaults again");
        assert.deepEqual(adapter.keyboard.mutations, []);
    } finally {await loop.close();}
});

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

for (const compiledOnly of [false, true]) {
    test(`shared capture keeps ${compiledOnly ? "compiled" : "committed"} identity and tolerates unavailable base RGB`, async () => {
        const source = backup32(), host = recordingHost(), adapter = fakeKeyboardAdapter({document: source, compiledOnly});
        const original = adapter.keyboard.answer;
        adapter.keyboard.answer = request => {
            if (request[0] === 8 && request[1] === 3) {
                const rejected = Buffer.from(request); rejected[0] = 0xff; return [rejected];
            }
            return original(request);
        };
        const loop = openPanelLoop(host, {adapter, defaultTimeoutMs: 200});
        try {
            await loop.handleMessage({type: "ready"});
            assert.equal(loop.session.readReady, true, last(host).notice);
            const service = loop.session.service;
            assert.equal(service.committed.source, compiledOnly ? "compiled" : "committed");
            assert.equal(service.baseRgb.state, "unavailable");
            assert.equal(service.combos.rows.length, 1);
            assert.equal(service.portable.readback, undefined, "raw capture handoff does not live on the portable snapshot");
            assert.equal(fingerprint(service.portable.document), fingerprint(source));
            assert.equal(last(host).model.load.progress, null, "completed capture clears its transfer text");
            assert.deepEqual(adapter.keyboard.mutations, []);
        } finally {await loop.close();}
    });
}

test("a configuration that changes during shared capture leaves only partial diagnostics and disables edits", async () => {
    const source = document32(), host = recordingHost(), adapter = fakeKeyboardAdapter({document: source});
    const original = adapter.keyboard.answer;
    let storageReads = 0;
    adapter.keyboard.answer = request => {
        const responses = original(request);
        if (request[0] === 8 && request[1] === 0 && request[2] === 8 && request[4] === 0 && ++storageReads === 2) {
            responses[0].writeUInt32LE(43, 9);
        }
        return responses;
    };
    const loop = openPanelLoop(host, {adapter, defaultTimeoutMs: 200});
    try {
        await loop.handleMessage({type: "ready"});
        assert.equal(loop.session.readReady, false);
        assert.equal(loop.session.draft, undefined);
        assert.equal(loop.session.service.portable, undefined);
        assert.equal(loop.session.service.layout.state, "read", "independent layout diagnostics remain available");
        assert.equal(last(host).model.load.state, "unavailable");
        assert.match(last(host).notice, /changed during the backup/);
        assert.deepEqual(adapter.keyboard.mutations, []);
    } finally {await loop.close();}
});
