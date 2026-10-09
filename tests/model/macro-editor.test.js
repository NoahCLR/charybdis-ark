"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {document} = require("../fixtures/portable-profile");
const {document: pdDocument} = require("../fixtures/pd-profile");
const {fingerprint, validateSnapshot} = require("../../core/model/portable-profile");
const {macroEditorView, editMacro, macroBudget, SLOT_RESERVE_TAPS} = require("../../core/model/macro-editor");
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {buildDeviceModel} = require("../../core/session/device-model");
const snapshot = value => ({document: value, fingerprint: fingerprint(value)});
const settingsDomain = value => decodeProfileBlob(Buffer.from(value.profile, "base64")).domains.find(domain => domain.id === 0x40);

test("the 128 VIA macros populate the model, including empty slots and their names", () => {
    let current = snapshot(pdDocument());
    current = snapshot(editMacro(current, {keycode: "VIA_MACRO_127", payload: "{KC_LGUI,KC_N}", name: "New note", expectedFingerprint: current.fingerprint}));
    const view = macroEditorView(current);
    const model = buildDeviceModel({macroView: view, capabilities: {compiledLayerCount: 16, actionAbiDigest: 0x837cf479}});
    assert.equal(model.viaMacros.length, 128);
    assert.equal(model.viaMacros[0].empty, true);
    assert.equal(model.viaMacros[127].name, "New note");
    assert.match(model.viaMacros[127].payload, /KC_N/);
    assert.equal(model.macroEditing.writable, true);
    assert.deepEqual(model.macroNameSpace, {perName: 32}, "a name is counted in bytes of UTF-8");
    // A named macro reads by its name wherever a key is labelled; the
    // numeric alias still resolves for slots the shipped catalog lacks.
    assert.equal(model.qmkKeycodeAliases["0x777F"], "VIA_MACRO_127");
    assert.equal(model.qmkKeyLabels["0x777F"], "New note");
    assert.equal(model.qmkKeyLabels.VIA_MACRO_0, "Macro 0");
    assert.equal(model.hardcodedMacros, undefined, "user macros are retired");
    assert.equal(buildDeviceModel({macroView: view, capabilities: {compiledLayerCount: 16}, busy: true}).macroEditing.writable, false);
    assert.equal(macroEditorView({incomplete: true}), null);
});

test("naming a macro changes its name and nothing else", () => {
    const source = pdDocument(), current = snapshot(source);
    assert.equal(settingsDomain(source).version, 6);
    const named = editMacro(current, {keycode: "VIA_MACRO_3", name: "  Zoom mute ", expectedFingerprint: current.fingerprint});
    assert.deepEqual(named.macros, source.macros, "a rename leaves every macro's steps alone");
    const domain = settingsDomain(named);
    assert.equal(domain.version, 6);
    assert.equal(domain.payload[0], 6, "the payload repeats the envelope's version");
    const settings = validateSnapshot(named).settings, before = validateSnapshot(source).settings;
    assert.equal(settings.macroNames[3], "Zoom mute", "names are trimmed");
    assert.deepEqual(settings.values, before.values);
    assert.deepEqual(settings.names, before.names);
    assert.deepEqual(settings.layers, before.layers);
    assert.deepEqual(settings.customKeyNames, before.customKeyNames);
    const before3 = decodeProfileBlob(Buffer.from(source.profile, "base64")).domains, after3 = decodeProfileBlob(Buffer.from(named.profile, "base64")).domains;
    assert.deepEqual(after3.filter(d => d.id !== 0x40), before3.filter(d => d.id !== 0x40), "other domains are byte-identical");
    // Steps and name together, then clearing the name.
    const both = editMacro(snapshot(named), {keycode: "VIA_MACRO_3", payload: "hello", name: "Greeting", expectedFingerprint: fingerprint(named)});
    assert.equal(validateSnapshot(both).settings.macroNames[3], "Greeting");
    assert.equal(Buffer.from(both.macros[3], "base64").toString(), "hello");
    const cleared = editMacro(snapshot(both), {keycode: "VIA_MACRO_3", name: "", expectedFingerprint: fingerprint(both)});
    assert.equal(validateSnapshot(cleared).settings.macroNames[3], "");
    // A steps-only edit leaves the settings as they were.
    const steps = editMacro(current, {keycode: "VIA_MACRO_4", payload: "hi", expectedFingerprint: current.fingerprint});
    assert.deepEqual(settingsDomain(steps), settingsDomain(source));
    assert.deepEqual(source, pdDocument(), "input snapshot is never mutated");
});

test("every one of the 128 names can be 32 bytes of text at once", () => {
    let current = snapshot(pdDocument());
    const edit = (index, name) => editMacro(current, {keycode: `VIA_MACRO_${index}`, name, expectedFingerprint: current.fingerprint});
    assert.throws(() => edit(0, "x".repeat(33)), error => error.code === "MACRO_NAME_INVALID" && /32 bytes of text/.test(error.message));
    assert.throws(() => edit(0, "tab\there"), error => error.code === "MACRO_NAME_INVALID" && /no control characters/.test(error.message));
    assert.throws(() => edit(0, "del\u007f"), error => error.code === "MACRO_NAME_INVALID");
    assert.throws(() => edit(0, "lone \ud800"), error => error.code === "MACRO_NAME_INVALID", "text that is not UTF-8 is refused, not altered");
    // Limits count bytes: sixteen two-byte letters fit, one more byte does not.
    assert.equal(validateSnapshot(edit(0, "é".repeat(16))).settings.macroNames[0], "é".repeat(16));
    assert.throws(() => edit(0, `${"é".repeat(16)}x`), error => error.code === "MACRO_NAME_INVALID" && /bytes/.test(error.message));
    assert.throws(() => edit(0, "😀".repeat(8) + "x"), error => error.code === "MACRO_NAME_INVALID", "four-byte symbols count four bytes each");
    assert.equal(validateSnapshot(edit(0, "Café")).settings.macroNames[0], "Café", "accented letters are text");
    assert.equal(validateSnapshot(edit(0, " ~Copy URL!{} ")).settings.macroNames[0], "~Copy URL!{}", "punctuation is fine; ends are trimmed");
    for (let index = 0; index < 128; index++) current = snapshot(edit(index, `${index}`.padEnd(32, "x")));
    const settings = validateSnapshot(current.document).settings;
    assert.equal(settings.macroNames.filter(name => name.length === 32).length, 128);
    const layerNames = settings.names.reduce((total, name) => total + 1 + Buffer.byteLength(name), 0);
    assert.equal(settingsDomain(current.document).payload.length, 404 + layerNames + 128 * 33 + 128, "the settings hold them all, beside 128 empty custom-key names");
});

test("stale drafts and wrong slots are rejected before a write", () => {
    const current = snapshot(document());
    const message = {keycode: "VIA_MACRO_0", payload: "hello", expectedFingerprint: current.fingerprint};
    assert.throws(() => editMacro(current, {...message, expectedFingerprint: "stale"}), /changed/);
    for (const keycode of ["VIA_MACRO_128", "VIA_MACRO_01", "KC_A", "MACRO_2", "CUSTOM_KEY_2"]) assert.throws(() => editMacro(current, {...message, keycode}), /slot/);
    assert.equal(Buffer.from(editMacro(current, {...message, keycode: "VIA_MACRO_127"}).macros[127], "base64").toString(), "hello", "the last slot is a slot");
    assert.throws(() => editMacro(current, {keycode: "VIA_MACRO_0", expectedFingerprint: current.fingerprint}), /steps, its name/);
    assert.throws(() => editMacro(current, {...message, payload: "x".repeat(10327)}), /bytes/);
});

test("every empty slot keeps room for ten key taps; the highest ones run out of room first", () => {
    assert.equal(SLOT_RESERVE_TAPS, 10);
    const empty = () => Buffer.alloc(0);
    // 128 empty slots in 10,327 bytes: 129 bytes stored, all 128 keep 30 bytes.
    let budget = macroBudget(Array.from({length: 128}, empty), 10327);
    assert.equal(budget.stored, 129);
    assert.equal(budget.available, 128);
    assert.equal(budget.outOfRoom.size, 0);
    // Fill slot 0 so exactly five empty slots keep their 30 bytes.
    const slots = Array.from({length: 128}, empty);
    slots[0] = Buffer.alloc(10327 - 129 - 5 * 30, 97);
    budget = macroBudget(slots, 10327);
    assert.equal(budget.free, 150);
    assert.equal(budget.available, 6, "the full slot and five with room");
    assert.deepEqual([...budget.outOfRoom].slice(0, 2), [6, 7]);
    assert.equal(budget.outOfRoom.has(127), true);
    assert.equal(budget.outOfRoom.has(5), false);
    // One byte less free and the fifth empty slot runs out of room.
    slots[0] = Buffer.alloc(slots[0].length + 1, 97);
    assert.equal(macroBudget(slots, 10327).available, 5);
});

test("the model reports each macro's program size and the bank; an unplayable macro is refused", () => {
    let current = snapshot(pdDocument());
    current = snapshot(editMacro(current, {keycode: "VIA_MACRO_2", payload: "{KC_A}{KC_B}", expectedFingerprint: current.fingerprint}));
    const view = macroEditorView(current, {viaMacroBytes: 10327});
    const slot = view.viaMacros[2];
    assert.equal(slot.program, 6);
    assert.equal(slot.playable, true);
    assert.equal(slot.available, true);
    assert.equal(slot.roomTaps, Math.floor((512 - 6) / 3));
    assert.equal(view.macroBank.capacity, 10327);
    assert.equal(view.macroBank.slots, 128);
    assert.equal(view.macroBank.programMax, 512);
    assert.equal(view.macroBank.reserveTaps, 10);
    assert.equal(view.macroBank.available, 128);
    const model = buildDeviceModel({macroView: view, capabilities: {compiledLayerCount: 16, actionAbiDigest: 0x837cf479}});
    assert.deepEqual(model.macroBank, view.macroBank);
    // 170 taps play; 171 would be kept but never play, so the edit is refused.
    assert.doesNotThrow(() => editMacro(current, {keycode: "VIA_MACRO_2", payload: "{KC_A}".repeat(170), expectedFingerprint: current.fingerprint}));
    assert.throws(() => editMacro(current, {keycode: "VIA_MACRO_2", payload: "{KC_A}".repeat(171), expectedFingerprint: current.fingerprint}),
        error => error.code === "MACRO_TOO_LONG" && /513 bytes/.test(error.message));
});
