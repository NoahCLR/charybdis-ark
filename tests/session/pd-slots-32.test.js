"use strict";
// Editing the 32-slot firmware's pointing slots past the first eight, end to
// end through the draft: mode, key, behaviour, colour, review and discard.
const test = require("node:test"), assert = require("node:assert/strict");
const {CAPABILITIES_32, document32} = require("../fixtures/pd-slots-32");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {fingerprint, summary, validateSnapshot} = require("../../core/model/portable-profile");
const {buildDeviceModel} = require("../../core/session/device-model");
const {editKeyBehaviors} = require("../../core/session/key-behavior-edits");
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");

function draftOf(value, caps) {
    const draft = new ProfileDraftSession({document: value, fingerprint: fingerprint(value), summary: summary(value)}, "board", caps);
    return {draft, stage: message => draft.stage({...message, draftRevision: draft.revision})};
}

test("slot 20 is created, bound, lit, reviewed and discarded like any other", () => {
    const {draft, stage} = draftOf(document32(), CAPABILITIES_32);
    const config = {kind: 1, name: "Desktops", axis: 1, thresholdX: 30, directions: {left: {keycode: "LCTL(KC_LEFT)"}, right: {keycode: "LCTL(KC_RIGHT)"}}};
    stage({type: "savePdMode", slot: 20, config});
    stage({type: "updateLayoutKeys", layers: [{layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "PD_SLOT_20_LOCK"}]}]});
    stage({type: "updatePdModeColor", pointingMode: "PD_MODE_SLOT_20", h: "64", s: "255", v: "100", locality: "RGB_RIGHT_HALF"});
    stage({type: "addBehavior", behavior: {keycode: "KC_F13", tap: {helper: "TAP_SENDS", action: "PD_SLOT_31"}}});

    const value = validateSnapshot(draft.document, CAPABILITIES_32);
    assert.equal(value.pdModes[20].name, "Desktops");
    assert.equal(value.pdModes[20].directions.left.keycode, 0x150);
    assert.ok(value.document.layers[0].includes(0x7eb4), "PD_SLOT_20_LOCK on the board");
    assert.deepEqual(value.rgb.pdModeColors[20], {pdModeId: 20, color: {h: 64, s: 255, v: 100}, locality: 2});
    assert.deepEqual(value.behaviors.rows.find(row => row.target.operand === 0x68).steps[0].tap, {kind: 4, flags: 0, operand: 31});
    assert.equal(decodeProfileBlob(value.profile).domains.find(domain => domain.id === 0x50).version, 2);

    const view = draft.view({connected: true, selectedDeviceId: "board"});
    const slot = view.changes.find(change => change.unit === "pd:20");
    assert.equal(slot.title, "Slot 20 · Desktops");
    assert.ok(view.changes.some(change => change.unit === "rgb:pd:20"), "the colour is its own review row");

    const model = buildDeviceModel({...draft.editingState({connected: true, selectedDeviceId: "board", capabilities: CAPABILITIES_32}), capabilities: CAPABILITIES_32});
    assert.equal(model.pdModes.length, 32);
    assert.deepEqual(model.pdModes[20].binding, {slot: 20, hold: "PD_SLOT_20", lock: "PD_SLOT_20_LOCK", holdCode: 0x7e94, lockCode: 0x7eb4});
    assert.ok(model.qmkKeycodes.some(key => key.value === "PD_SLOT_31_LOCK" && key.keycode === 0x7ebf && key.group === "Pointing modes"));
    assert.equal(model.rgb.pdModeColors.length, 32);
    assert.equal(model.rgb.pdModeColors[20].pointingMode, "PD_MODE_SLOT_20");

    draft.discard(draft.revision, view.changes.find(change => change.unit === "pd:20").group);
    assert.equal(validateSnapshot(draft.document, CAPABILITIES_32).pdModes[20].kind, 0);
});

test("the eight-slot action vocabulary cannot open a draft", () => {
    const current = document32();
    assert.throws(() => draftOf(current, {...CAPABILITIES_32, actionAbiDigest: 0x1d3fcacc}), /numbers its keys differently/);
});

test("behaviour edits accept every current slot and refuse slots past the bank", () => {
    const wide = document32();
    const blob = decodeProfileBlob(Buffer.from(wide.profile, "base64"));
    const payload = blob.domains.find(domain => domain.id === 0x20).payload;
    const message = {type: "addBehavior", behavior: {keycode: "KC_F14", tap: {helper: "TAP_SENDS", action: "PD_SLOT_31"}}};
    assert.ok(editKeyBehaviors(payload, message, CAPABILITIES_32).length > payload.length);
    assert.throws(() => editKeyBehaviors(payload, {...message, behavior: {...message.behavior, tap: {helper: "TAP_SENDS", action: "PD_SLOT_32"}}}, CAPABILITIES_32));
});
