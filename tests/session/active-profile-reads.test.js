"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {connectedService} = require("../fixtures/connected-service");
const {fakeKeyboard} = require("../fixtures/fake-keyboard");
const {document} = require("../fixtures/pd-profile");
const {editLayers, editMacros} = require("../fixtures/profile-document");
const {fnv1a32} = require("../../core/schema/profile-blob-v1");
const {PROFILE_ACTIVE_KIND: KIND, PROFILE_STATE_FLAGS: FLAGS, PROFILE_WIRE_V1: WIRE} = require("../../core/protocol/profile-wire-v1");
const {PROFILE_PAYLOAD_V1: PAYLOAD} = require("../../core/protocol/profile-payload-v1");

// The latest saved bytes belong to generation 5 while the keyboard still
// types from generation 4. GET committed cannot retrieve the active record.
async function recoveryKeyboard(t, {compiled = false, mismatch, afterDownload} = {}) {
    const running = document(), saved = structuredClone(running);
    editLayers(running, layers => layers.forEach(layer => layer.fill(0)));
    editLayers(saved, layers => layers.forEach(layer => layer.fill(5)));
    editMacros(saved, macros => macros[0] = Buffer.from("new saved macro").toString("base64"));
    const defaults = Buffer.from(running.profile, "base64");
    const source = fakeKeyboard({document: saved, compiled: defaults, generation: 5});
    let statusReads = 0;
    const keyboard = {...source, answer(report) {
        const replies = source.answer(report);
        if (report[0] !== WIRE.COMMAND_GET || report[2] !== WIRE.VALUE_STATUS) return replies;
        const p = replies[0].subarray(WIRE.PAYLOAD_OFFSET);
        if (report[4] === 0) {
            statusReads++;
            if (!mismatch) {
                p.writeUInt16LE(FLAGS.COMMITTED_VALID | FLAGS.CANDIDATE_PENDING | (compiled ? FLAGS.ACTIVE_IS_COMPILED_DEFAULT : 0), 2);
                p[24] = compiled ? KIND.COMPILED_ONLY : KIND.COMMITTED;
                p.writeUInt32LE(fnv1a32(defaults), 12);
            }
            if (mismatch === "digest" || (afterDownload === "digest" && statusReads > 1)) p.writeUInt32LE(123, 12);
            if (afterDownload === "kind" && statusReads > 1) p[24] = KIND.PREVIEW;
        } else {
            if (!mismatch) p.writeUInt32LE(compiled ? 0 : 4, 0);
            if (mismatch === "generation" || (afterDownload === "generation" && statusReads > 1)) p.writeUInt32LE(4, 0);
            if (mismatch === "origin" || (afterDownload === "origin" && statusReads > 1)) p[4] = 1;
        }
        return replies;
    }};
    const connected = await connectedService(t, {keyboard});
    statusReads = 0;
    return {...connected, running, saved};
}

for (const method of ["readLayout", "readCommittedProfile"]) {
    test(`${method} refuses a newer committed payload during post-decision recovery`, async t => {
        const {service} = await recoveryKeyboard(t);
        assert.equal(service.snapshot().status.activeGeneration, 4);
        assert.equal(service.snapshot().status.committedGeneration, 5);
        assert.equal(service.snapshot().status.candidatePending, true);
        await assert.rejects(service.readKeyboardProfile(), {code: "KEYBOARD_NOT_READY"});
        await assert.rejects(service[method](), {code: "ACTIVE_PROFILE_UNAVAILABLE"});
        assert.notEqual(service.snapshot().layout?.state, "read");
        assert.notEqual(service.snapshot().committed?.state, "read");
        assert.equal(service.snapshot().macroView, null, "no macros from the inactive payload reach an editor");
        if (method === "readLayout") assert.equal(service.snapshot().layout.state, "unavailable");
    });
    test(`${method} uses compiled active bytes even when a newer record is committed`, async t => {
        const {service, keyboard} = await recoveryKeyboard(t, {compiled: true});
        keyboard.requests.length = 0;
        await service[method]();
        if (method === "readLayout") assert.ok(service.snapshot().layout.layers.every(layer => layer.keys.every(key => key.keycode === 0)));
        else assert.equal(service.snapshot().committed.source, "compiled");
        assert.ok(!keyboard.requests.some(r => r[0] === WIRE.COMMAND_GET && r[2] === PAYLOAD.VALUE));
    });
    for (const mismatch of ["generation", "digest", "origin"]) {
        test(`${method} requires the active payload's ${mismatch}`, async t => {
            const {service} = await recoveryKeyboard(t, {mismatch});
            await assert.rejects(service[method](), {code: "ACTIVE_PROFILE_UNAVAILABLE"});
        });
    }
    for (const afterDownload of ["generation", "digest", "origin", "kind"]) {
        test(`${method} rechecks active ${afterDownload} after downloading`, async t => {
            const {service} = await recoveryKeyboard(t, {mismatch: "none", afterDownload});
            await assert.rejects(service[method](), {code: "ACTIVE_PROFILE_UNAVAILABLE"});
        });
    }
}

test("a complete snapshot checks active origin before exposing macros or other domains", async t => {
    const {service} = await recoveryKeyboard(t, {mismatch: "origin"});
    await assert.rejects(service.readKeyboardProfile(), {code: "PROFILE_CHANGED"});
    assert.equal(service.snapshot().macroView, null);
    assert.equal(service.snapshot().portable, undefined);
});
