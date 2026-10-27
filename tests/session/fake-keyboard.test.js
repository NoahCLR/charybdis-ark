"use strict";
const {profileLayers} = require("../fixtures/profile-document");
const test = require("node:test");
const assert = require("node:assert/strict");
const {openPanelLoop} = require("../../core/session/panel-loop");
const {validateSnapshot, fingerprint} = require("../../core/model/portable-profile");
const {fakeKeyboardAdapter} = require("../fixtures/fake-keyboard");
const {STARTING} = require("../../core/session/keyboard-starting");
const {PHASE} = require("../../core/model/vocabulary");
const {backup32, document32} = require("../fixtures/pointing-slots-32");
const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require("../../core/data/charybdis-layout");
const pdProfile = require("../fixtures/pd-profile");

function recordingShell() {
    const shell = {
        posted: [], errors: [],
        post: (message) => {shell.posted.push(message);},
        showError: (text) => {shell.errors.push(text);},
        progress: async (title, work) => work(),
        saveRecovery: async () => {throw new Error("a read must not save a recovery copy");},
        chooseProfile: async () => undefined,
        saveExport: async () => undefined,
    };
    return shell;
}
const last = (shell) => shell.posted[shell.posted.length - 1];

// Two current documents: the compiled profile with an empty layout, and a
// backup with keys on its layout and a combo, so both banks and the combo
// readback carry something.
for (const [name, document] of [["the compiled pointing profile", document32()], ["a backup with keys and a combo", backup32()]]) {
    test(`a complete read of the fake keyboard reproduces ${name} and opens an editable draft`, async () => {
        const shell = recordingShell(), adapter = fakeKeyboardAdapter({document});
        const loop = openPanelLoop(shell, {adapter, defaultTimeoutMs: 200});
        try {
            await loop.handleMessage({type: "ready"});
            const {model, notice} = last(shell);
            assert.deepEqual(shell.errors, []);
            assert.doesNotMatch(String(notice), /Failed/);
            assert.equal(loop.session.readReady, true, notice);
            assert.equal(model.load.state, "ready");
            assert.ok(model.draft, "a complete read opens the draft");
            assert.equal(model.draft.matching, true);
            assert.equal(loop.session.draft.current.fingerprint, fingerprint(document), "the read reproduced the document");

            const draft = model.draft;
            await loop.handleMessage({type: "updateLayoutKeys", draftId: draft.id, draftRevision: draft.revision,
                layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_B"}]});
            assert.ok(last(shell).acceptedEdit);
            assert.equal(last(shell).model.draft.dirty, true);

            const keyboard = adapter.keyboard;
            assert.equal(keyboard.requests.filter(request => request[0] === 0x04).length, 0, "layout reads never fall back to one request per key");
            assert.equal(keyboard.requests.filter(request => request[0] === 0x12).length, 0,
                "layout comes from the one coherent profile snapshot");
            const profileChunks = keyboard.requests.filter(request => request[0] === 0x08 && request[2] === 4 && (request[4] || request[5]));
            assert.equal(profileChunks.length, Math.ceil(validateSnapshot(document).candidate.length / 25),
                "the shared snapshot downloads committed bytes once");
            assert.ok(keyboard.requests.length > 100, "the whole keyboard was read over the wire");
            assert.equal(keyboard.requests.some(request => request[0] === 8 && request[2] === 0x0c), false, "macros come from the profile domain");
            assert.equal(keyboard.requests.filter(request => request[0] === 8 && request[1] === 0 && request[2] === 6).length,
                3 + 2 * loop.session.service.combos.rows.length, "one verified combo read feeds both views");
            assert.deepEqual(loop.session.service.layout.layers.flatMap(({layer, keys}) => keys.map(key => key.keycode)),
                profileLayers(document).flatMap(layer => CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column]) => layer[row * 6 + column])));
            assert.deepEqual(keyboard.mutations, [], "a read and a staged edit write nothing to the keyboard");
        } finally {
            await loop.close();
        }
    });
}

test("profile verification reads fresh committed bytes, reuses immutable defaults, and clears the reader on reconnect", async () => {
    const source = document32(), shell = recordingShell(), adapter = fakeKeyboardAdapter({document: source});
    const loop = openPanelLoop(shell, {adapter, defaultTimeoutMs: 200});
    const chunks = value => adapter.keyboard.requests.filter(request => request[0] === 0x08 && request[2] === value && (request[4] || request[5])).length;
    const count = Math.ceil(validateSnapshot(source).candidate.length / 25);
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
        await assert.rejects(service.readCommittedProfile(), {code: "PAYLOAD_CORRUPT"}, "cached metadata cannot hide damaged post-Apply readback bytes");
        assert.equal(service.snapshot().error.code, "PAYLOAD_CORRUPT");
        adapter.keyboard.answer = originalAnswer;
        await service.disconnect();
        assert.equal(service.payloadReader, undefined);
        await loop.handleMessage({type: "refresh"});
        assert.equal(chunks(5), count, "a new connection reuses the defaults verified before: metadata only");
        assert.deepEqual(adapter.keyboard.mutations, []);
    } finally {await loop.close();}
});

// After Apply the layout step downloads and checks the saved profile; the
// profile step right after takes those bytes while the keyboard still names
// them, so the readback downloads the saved profile once, not twice.
test("the read after a save downloads the saved profile once", async () => {
    const {rereadKeyboard} = require("../../core/session/panel-controls");
    const source = document32(), shell = recordingShell(), adapter = fakeKeyboardAdapter({document: source});
    const loop = openPanelLoop(shell, {adapter, defaultTimeoutMs: 200});
    const chunks = value => adapter.keyboard.requests.filter(request => request[0] === 0x08 && request[2] === value && (request[4] || request[5])).length;
    const count = Math.ceil(validateSnapshot(source).candidate.length / 25);
    try {
        await loop.handleMessage({type: "ready"});
        const service = loop.session.service, before = chunks(4);
        await rereadKeyboard(service);
        assert.equal(chunks(4) - before, count);
        assert.equal(service.committed.state, "read");
        await service.readCommittedProfile();
        assert.equal(chunks(4) - before, count * 2, "a read on its own still downloads");
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
    assert.throws(() => fakeKeyboard({document: {...source, profile: profile.toString("base64")}}), /format current firmware does not store/);
});

for (const compiledOnly of [false, true]) {
    test(`a shared snapshot keeps ${compiledOnly ? "compiled" : "committed"} identity and derives base RGB from its snapshot's settings`, async () => {
        const source = backup32(), shell = recordingShell(), adapter = fakeKeyboardAdapter({document: source, compiledOnly});
        const original = adapter.keyboard.answer;
        let settingHeaders = 0;
        adapter.keyboard.answer = request => {
            if (request[0] === 8 && request[1] === 0 && request[2] === 7 && request.readUInt16LE(4) === 0 && ++settingHeaders > 4) {
                const rejected = Buffer.from(request); rejected[0] = 0xff; return [rejected];
            }
            return original(request);
        };
        const loop = openPanelLoop(shell, {adapter, defaultTimeoutMs: 200});
        try {
            await loop.handleMessage({type: "ready"});
            assert.equal(loop.session.readReady, true, last(shell).notice);
            const service = loop.session.service;
            assert.equal(service.committed.source, compiledOnly ? "compiled" : "committed");
            assert.equal(service.baseRgb.state, "read");
            assert.equal(settingHeaders, 4, "no independent RGB read can race the coherent snapshot");
            assert.equal(service.combos.rows.length, 1);
            assert.equal(service.portable.readback, undefined, "raw readback handoff does not live on the portable snapshot");
            assert.equal(fingerprint(service.portable.document), fingerprint(source));
            assert.equal(last(shell).model.load.progress, null, "a completed snapshot clears its transfer text");
            assert.deepEqual(adapter.keyboard.mutations, []);
        } finally {await loop.close();}
    });
}

test("a configuration that keeps changing through the shared read's wait leaves only partial diagnostics and disables edits", async () => {
    const source = document32(), shell = recordingShell(), adapter = fakeKeyboardAdapter({document: source});
    const original = adapter.keyboard.answer;
    // A read it changes under is read again while the wait for it to start
    // lasts (keyboard-starting.js), so it changes under every one of them:
    // each status read during the shared read, never the wait's own.
    const clock = {now: 0};
    let statusReads = 0;
    adapter.keyboard.answer = request => {
        const responses = original(request);
        if (request[0] === 8 && request[1] === 0 && request[2] === 2 && request[4] === 1 && loop.session.service.phase === PHASE.READ_COMPLETE) {
            responses[0].writeUInt32LE(43 + ++statusReads, 7);
        }
        return responses;
    };
    const loop = openPanelLoop(shell, {adapter, defaultTimeoutMs: 200, now: () => clock.now, sleep: async ms => {clock.now += ms;}});
    try {
        await loop.handleMessage({type: "ready"});
        assert.ok(clock.now >= STARTING.WAIT_MS, "read again until the wait's bound");
        assert.equal(loop.session.readReady, false);
        assert.equal(loop.session.draft, undefined);
        assert.equal(loop.session.service.portable, undefined);
        assert.equal(loop.session.service.layout.state, "read", "independent layout diagnostics remain available");
        assert.equal(last(shell).model.load.state, "unavailable");
        assert.match(last(shell).notice, /payload did not match its active identity/);
        assert.deepEqual(adapter.keyboard.mutations, []);
    } finally {await loop.close();}
});
