"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {behaviorPlacementProblem, comboPlacementProblem, keyPlacementProblem, profilePlacementProblem} = require("../../core/model/profile-placement");
const {encodeProfileBlob, PROFILE_DOMAIN_IDS} = require("../../core/schema/profile-blob-v1");
const {encodeComboDomain} = require("../../core/schema/combo-domain-v1");
const {bytes} = require("../fixtures/device-profile");

const code = operand => ({kind: 1, flags: 0, operand});
const row = (target, step) => ({target, tapHoldTerm: 0, longerHoldTerm: 0, multiTapTerm: 0, keepsAutoMouseAnchored: false, steps: [{tapIndex: 0, ...step}]});
const options = {layerCount: 8};

test("a behaviour row is checked where each of its actions sits", () => {
    assert.equal(behaviorPlacementProblem([row(code(0x04), {tap: code(0x05)})], options), undefined);
    assert.equal(behaviorPlacementProblem([row(code(0x04), {hold: {mode: 1, repeatHz: 0, action: {kind: 2, flags: 0, operand: 2}}})], options), undefined);
    assert.match(behaviorPlacementProblem([row(code(0x04), {hold: {mode: 2, repeatHz: 0, action: {kind: 2, flags: 0, operand: 2}}})], options), /^The behaviour on KC_A: MO\(2\) holds a layer/);
    assert.match(behaviorPlacementProblem([row(code(0x04), {tap: {kind: 2, flags: 0, operand: 2}})], options), /MO\(2\) holds a layer/);
    assert.match(behaviorPlacementProblem([row(code(0x5241), {tap: code(0x05)})], options), /^The behaviour on DF\(1\)/);
});

test("a combo is checked by its output; layer holds and one-shots pass, LT does not", () => {
    const combo = output => ({inputs: [code(0x04), code(0x05)], output, termMs: 0, holdTermMs: 0, mustHold: false, mustTap: false, ordered: false});
    assert.equal(comboPlacementProblem([combo(code(0x08)), combo({kind: 2, flags: 0, operand: 2}), combo(code(0x5282))], options), undefined);
    assert.match(comboPlacementProblem([combo(code(0x08)), combo(code(0x4104))], options), /^Combo 1: LT\(1,KC_A\)/);
});

test("an encoded profile is checked across its behaviours and combos", () => {
    assert.equal(profilePlacementProblem(bytes, options), undefined, "the device fixture passes");
    const blob = encodeProfileBlob({schema: {major: 4, minor: 0}, domains: [{id: PROFILE_DOMAIN_IDS.COMBOS, version: 3,
        payload: encodeComboDomain({version: 3, defaultTermMs: 50, holdTermMs: 0, rows: [{inputs: [code(0x04), code(0x05)], output: code(0x5241), termMs: null, mustHold: false, mustTap: false, ordered: false}]})}]});
    assert.match(profilePlacementProblem(blob, options), /^Combo 0: /);
});

test("a layout key takes every layer key the keyboard owns, and refuses DF, PDF and layers past the bank", () => {
    for (const owned of [0x04, 0x4104, 0x5022, 0x5202, 0x5222, 0x5262, 0x5282, 0x52c2, 0x7ec2, 0x7e40]) assert.equal(keyPlacementProblem(owned, options), undefined, owned.toString(16));
    assert.match(keyPlacementProblem(0x5241, options), /^DF\(1\) is a layer keycode this keyboard does not run/);
    assert.match(keyPlacementProblem(0x52e1, options), /does not run through its layer tracking/);
    assert.match(keyPlacementProblem(0x5209, options), /does not run through its layer tracking/);
});

// The keyboard sends QMK and keyboard functions from a behaviour as a
// synthetic QMK record, so they work there as on a key or a combo.
test("a behaviour sends QMK and keyboard functions as a key or a combo does", () => {
    const hold = (operand, mode = 1) => ({hold: {mode, repeatHz: 0, action: code(operand)}});
    for (const sendable of [0x04, 0x021e, 0x1f04, 0x00cd, 0x2104, 0x52a1, 0x7700, 0x7e80, 0x7ea7, 0x7ec2, 0x7e06, 0x7e00, 0x7c00, 0x7820, 0x7e08]) {
        assert.equal(behaviorPlacementProblem([row(code(sendable), {tap: code(sendable)}), row(code(0x05), hold(sendable, 2)), row(code(0x06), hold(sendable))], options), undefined, sendable.toString(16));
        assert.equal(keyPlacementProblem(sendable, options), undefined, `${sendable.toString(16)} on a key`);
        const combo = {inputs: [code(0x04), code(0x05)], output: code(sendable), termMs: 0, holdTermMs: 0, mustHold: false, mustTap: false, ordered: false};
        assert.equal(comboPlacementProblem([combo], options), undefined, `${sendable.toString(16)} as a combo output`);
    }
});

test("a pointing mode's macro output is placed like any shortcut", () => {
    const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
    const {decodePdDomain, encodePdDomain} = require("../../core/schema/pd-mode-domain-v1");
    const document = require("../fixtures/pd-profile").document();
    const profile = decodeProfileBlob(Buffer.from(document.profile, "base64")), domain = profile.domains.find(domain => domain.id === PROFILE_DOMAIN_IDS.PD_MODES);
    const slots = decodePdDomain(domain.payload);
    slots[1].directions.up = {keycode: 0x777f, modifierPolicy: 0, mask: 0};
    domain.payload = encodePdDomain(slots);
    assert.equal(profilePlacementProblem(encodeProfileBlob(profile)), undefined);
});
