"use strict";
const {profileMacros} = require("../fixtures/profile-document");
const test = require("node:test");
const assert = require("node:assert/strict");
const {document, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
const {document: pdDocument} = require("../fixtures/pd-profile");
const {fingerprint, validateSnapshot} = require("../../core/model/portable-profile");
const {profileMacroBudget, macroEditorView, editMacro, macroInputStatus, macroBudget, SLOT_RESERVE_TAPS} = require("../../core/model/macro-editor");
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {editSettings, settingsEditorView} = require("../../core/model/settings-editor");
const {buildDeviceModel} = require("../../core/session/device-model");
const snapshot = value => ({document: value, fingerprint: fingerprint(value)});
const settingsDomain = value => decodeProfileBlob(Buffer.from(value.profile, "base64")).domains.find(domain => domain.id === 0x40);

test("per-macro protection follows Unicode entry automatically, and explicit policies survive text/name edits", () => {
    const {hostMacros} = require("../fixtures/host-macros");
    for (const layout of [2, 3]) {
        const fixture = hostMacros(1 | (layout << 16), ["é"]);
        let current = fixture.snapshot;
        const view = () => macroEditorView(current, fixture.capabilities).macros[0];
        const edit = message => {current = snapshot(editMacro(current, {keycode: "MACRO_0", expectedFingerprint: current.fingerprint, ...message}, fixture.capabilities));};
        assert.equal(view().protection, "auto");
        assert.equal(view().uninterruptible, layout === 3);
        edit({protection: "off"}); assert.equal(view().uninterruptible, false);
        edit({payload: "éé", name: "Accent"});
        assert.equal(view().protection, "off"); assert.equal(view().name, "Accent");
        edit({protection: "on"}); assert.equal(view().uninterruptible, true);
        edit({protection: "auto"}); assert.equal(view().uninterruptible, layout === 3);
        assert.equal(Buffer.from(profileMacros(current.document)[0], "base64").toString("utf8"), "éé");
    }
});

test("an empty macro may store protection and keeps its empty-slot reserve", () => {
    const {hostMacros} = require("../fixtures/host-macros");
    const {snapshot: current, capabilities} = hostMacros(1, []);
    const protectedEmpty = snapshot(editMacro(current, {keycode: "MACRO_0", protection: "on", expectedFingerprint: current.fingerprint}, capabilities));
    const view = macroEditorView(protectedEmpty, capabilities);
    assert.equal(view.macros[0].empty, true); assert.equal(view.macros[0].protection, "on");
    assert.equal(view.macroBank.stored, macroEditorView(current, capabilities).macroBank.stored + 3);
});

test("stored macro status agrees with editing after a host layout change", () => {
    const {hostMacros} = require("../fixtures/host-macros");
    for (const host of [1 | (2 << 16), 1 | (3 << 16)]) {
        const {snapshot, capabilities} = hostMacros(host, ["{+KC_A}é{-KC_A}"]);
        const slot = macroEditorView(snapshot, capabilities).macros[0];
        const status = macroInputStatus(snapshot, {keycode: slot.keycode, payload: slot.payload}, capabilities);
        assert.equal(slot.playable, !status.error);
        assert.equal(slot.playbackError, status.error);
        assert.equal(slot.playbackCode, status.code);
    }
});

test("the 128 macros populate the model, including empty slots and their names", () => {
    let current = snapshot(pdDocument());
    current = snapshot(editMacro(current, {keycode: "MACRO_127", payload: "{KC_LGUI,KC_N}", name: "New note", expectedFingerprint: current.fingerprint}));
    const view = macroEditorView(current);
    const model = buildDeviceModel({macroView: view, capabilities: {compiledLayerCount: 16, actionAbiDigest: 0x6fd70b90}});
    assert.equal(model.macros.length, 128);
    assert.equal(model.macros[0].empty, true);
    assert.equal(model.macros[127].name, "New note");
    assert.match(model.macros[127].payload, /KC_N/);
    assert.equal(model.macroEditing.writable, true);
    assert.deepEqual(model.macroNameSpace, {perName: 32}, "a name is counted in bytes of UTF-8");
    // A named macro reads by its name wherever a key is labelled; the
    // numeric alias still resolves for slots the shipped catalog lacks.
    assert.equal(model.qmkKeycodeAliases["0x777F"], "MACRO_127");
    assert.equal(model.qmkKeyLabels["0x777F"], "New note");
    assert.equal(model.qmkKeyLabels.MACRO_0, "Macro 0");
    assert.equal(model.hardcodedMacros, undefined, "user macros are retired");
    assert.equal(buildDeviceModel({macroView: view, capabilities: {compiledLayerCount: 16}, busy: true}).macroEditing.writable, false);
    assert.equal(macroEditorView({incomplete: true}), null);
});

test("naming a macro changes its name and nothing else", () => {
    const source = pdDocument(), current = snapshot(source);
    assert.equal(settingsDomain(source).version, 8);
    const named = editMacro(current, {keycode: "MACRO_3", name: "  Zoom mute ", expectedFingerprint: current.fingerprint});
    assert.deepEqual(profileMacros(named), profileMacros(source), "a rename leaves every macro's steps alone");
    const domain = settingsDomain(named);
    assert.equal(domain.version, 8);
    assert.equal(domain.payload[0], 8, "the payload repeats the envelope's version");
    const settings = validateSnapshot(named).settings, before = validateSnapshot(source).settings;
    assert.equal(settings.macroNames[3], "Zoom mute", "names are trimmed");
    assert.deepEqual(settings.values, before.values);
    assert.deepEqual(settings.names, before.names);
    assert.deepEqual(settings.layers, before.layers);
    assert.deepEqual(settings.customKeyNames, before.customKeyNames);
    assert.deepEqual(settings.customKeyShortcuts, before.customKeyShortcuts);
    assert.equal(settings.keyboardName, before.keyboardName);
    const before3 = decodeProfileBlob(Buffer.from(source.profile, "base64")).domains, after3 = decodeProfileBlob(Buffer.from(named.profile, "base64")).domains;
    assert.deepEqual(after3.filter(d => d.id !== 0x40), before3.filter(d => d.id !== 0x40), "other domains are byte-identical");
    // Steps and name together, then clearing the name.
    const both = editMacro(snapshot(named), {keycode: "MACRO_3", payload: "hello", name: "Greeting", expectedFingerprint: fingerprint(named)});
    assert.equal(validateSnapshot(both).settings.macroNames[3], "Greeting");
    assert.equal(Buffer.from(profileMacros(both)[3], "base64").toString(), "hello");
    const cleared = editMacro(snapshot(both), {keycode: "MACRO_3", name: "", expectedFingerprint: fingerprint(both)});
    assert.equal(validateSnapshot(cleared).settings.macroNames[3], "");
    // A steps-only edit leaves the settings as they were.
    const steps = editMacro(current, {keycode: "MACRO_4", payload: "hi", expectedFingerprint: current.fingerprint});
    assert.deepEqual(settingsDomain(steps), settingsDomain(source));
    assert.deepEqual(source, pdDocument(), "input snapshot is never mutated");
});

test("every one of the 128 names can be 32 bytes of text at once", () => {
    let current = snapshot(pdDocument());
    const edit = (index, name) => editMacro(current, {keycode: `MACRO_${index}`, name, expectedFingerprint: current.fingerprint});
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
    assert.equal(settingsDomain(current.document).payload.length, 660 + layerNames + 128 * 33 + 128 + 1, "the settings hold them all, beside 128 empty shortcuts, 128 empty custom-key names and an empty keyboard name");
});

test("stale drafts and wrong slots are rejected before a write", () => {
    const current = snapshot(document());
    const message = {keycode: "MACRO_0", payload: "hello", expectedFingerprint: current.fingerprint};
    assert.throws(() => editMacro(current, {...message, expectedFingerprint: "stale"}), /changed/);
    for (const keycode of ["MACRO_128", "MACRO_01", "KC_A", "QK_MACRO_2", "CUSTOM_KEY_2"]) assert.throws(() => editMacro(current, {...message, keycode}), /slot/);
    assert.equal(Buffer.from(profileMacros(editMacro(current, {...message, keycode: "MACRO_127"}))[127], "base64").toString(), "hello", "the last slot is a slot");
    assert.throws(() => editMacro(current, {keycode: "MACRO_0", expectedFingerprint: current.fingerprint}), /steps, its name/);
    assert.throws(() => editMacro(current, {...message, payload: "x".repeat(34903)}), /bytes/);
});

test("every empty slot keeps room for ten key taps; the highest ones run out of room first", () => {
    assert.equal(SLOT_RESERVE_TAPS, 10);
    const empty = () => Buffer.alloc(0);
    // 128 empty slots in 10,327 bytes: 128 bytes stored, all 128 keep 30 bytes.
    let budget = macroBudget(Array.from({length: 128}, empty), 10327);
    assert.equal(budget.stored, 128);
    assert.equal(budget.available, 128);
    assert.equal(budget.outOfRoom.size, 0);
    // Fill slot 0 so exactly five empty slots keep their 30 bytes.
    const slots = Array.from({length: 128}, empty);
    slots[0] = Buffer.alloc(10327 - 128 - 5 * 30, 97);
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

test("the model reports the bank and each macro's room; a macro past the free memory is refused", () => {
    let current = snapshot(pdDocument());
    current = snapshot(editMacro(current, {keycode: "MACRO_2", payload: "{KC_A}{KC_B}", expectedFingerprint: current.fingerprint}));
    const view = macroEditorView(current, {macroBytes: 34903});
    const slot = view.macros[2];
    assert.equal(slot.playable, true);
    assert.equal(slot.available, true);
    assert.equal(slot.roomTaps, Math.floor(view.macroBank.free / 3));
    assert.equal(view.macroBank.capacity, 34903);
    assert.equal(view.macroBank.slots, 128);
    assert.equal(view.macroBank.reserveTaps, 10);
    assert.equal(view.macroBank.available, 128);
    const model = buildDeviceModel({macroView: view, capabilities: {compiledLayerCount: 16, actionAbiDigest: 0x6fd70b90}});
    assert.deepEqual(model.macroBank, view.macroBank);
    // The keyboard streams a macro in windows, so only the free memory bounds it.
    assert.doesNotThrow(() => editMacro(current, {keycode: "MACRO_2", payload: "{KC_A}".repeat(171), expectedFingerprint: current.fingerprint}));
    assert.throws(() => editMacro(current, {keycode: "MACRO_2", payload: "a".repeat(view.macroBank.free + 7), expectedFingerprint: current.fingerprint}),
        error => error.code === "MACRO_BANK_FULL");
});

test("Unicode host setup persists with the profile", () => {
    const capabilities = CURRENT_CAPABILITIES;
    let current = snapshot(document());
    const change = value => editMacro(current, {keycode: "MACRO_0", expectedFingerprint: current.fingerprint, ...value}, capabilities);
    assert.throws(() => change({payload: "café 🙂"}), error => error.code === "UNICODE_SETUP_REQUIRED");
    // Unicode playback on or off; the Mac's ISO switch stays off.
    const setHost = (mode, enabled) => {
        const section = settingsEditorView({...current, hostOs: {detected: 0}}).sections.find(s => s.id === "host");
        return editSettings(current, {sectionId: "host", expectedFingerprint: current.fingerprint,
            fields: section.fields.map(f => f.kind === "toggle" ? {macro: f.macro, enabled: f.macro === "macosIso" ? false : enabled} : {macro: f.macro, value: f.macro === "hostOs" ? String(mode) : f.value})}, capabilities);
    };
    for (const mode of [1, 2, 3]) {
        current = snapshot(setHost(mode, true));
        assert.equal(validateSnapshot(current.document).settings.values[27], 0x100 | mode);
        current = snapshot(change({payload: "café 🙂 e\u0301 👩‍💻"}));
        const view = macroEditorView(current, capabilities);
        const {layoutChars, ...unicodeView} = view.unicode;
        assert.deepEqual(unicodeView, {mode, enabled: true, os: mode, layout: 0, layoutFits: true, layoutName: "US"});
        assert.equal(layoutChars.length, 97);
        assert.equal(view.macros[0].payload, "café 🙂 e\u0301 👩‍💻");
        assert.equal(Buffer.from(profileMacros(current.document)[0], "base64").toString("utf8"), "café 🙂 e\u0301 👩‍💻");
    }
    const off = snapshot(setHost(0, false));
    const offView = macroEditorView(off, capabilities);
    assert.equal(offView.macros[0].needsUnicodeSetup, true);
    assert.equal(offView.macros[0].playable, false);
    assert.throws(() => change({payload: "{+KC_A}é{-KC_A}"}), /Release ordinary keys/);
    assert.doesNotThrow(() => change({payload: "{+KC_LALT}é{-KC_LALT}"}));
    assert.throws(() => setHost(4, true), /supported range/);
    const unchanged = snapshot(document());
    assert.throws(() => editMacro(unchanged, {keycode: "MACRO_0", expectedFingerprint: unchanged.fingerprint, unicodeHostMode: 1}, capabilities), /steps/);
});


test("live macro inspection and staging agree without inspection changing the snapshot", () => {
    const current = snapshot(pdDocument()), before = structuredClone(current);
    for (const payload of ["{{KC_A}}\nhello", "a".repeat(508), "a".repeat(509), "{+KC_A}", "{65536}"]) {
        const message = {keycode: "MACRO_17", payload, expectedFingerprint: current.fingerprint};
        const result = macroInputStatus(current, message);
        if (result.error) assert.throws(() => editMacro(current, message), error => error.code === result.code && error.message === result.error);
        else assert.equal(Buffer.from(profileMacros(editMacro(current, message))[17], "base64").length, result.bytes);
    }
    assert.deepEqual(current, before);
});

test("macro text is judged against the host layout the keyboard types through", () => {
    const capabilities = CURRENT_CAPABILITIES;
    let current = snapshot(document());
    const change = payload => editMacro(current, {keycode: "MACRO_0", expectedFingerprint: current.fingerprint, payload}, capabilities);
    const setHost = (os, layout, unicode = false, iso = false) => {
        const section = settingsEditorView({...current, hostOs: {detected: 0}}).sections.find(s => s.id === "host");
        const shown = {hostOs: String(os), hostLayout: String(layout), unicodeEnabled: unicode, macosIso: iso};
        current = snapshot(editSettings(current, {sectionId: "host", expectedFingerprint: current.fingerprint,
            fields: section.fields.map(f => f.kind === "toggle" ? {macro: f.macro, enabled: shown[f.macro]} : {macro: f.macro, value: shown[f.macro]})}, capabilities));
    };
    // Settle the OS first so the layouts it offers include the one chosen.
    setHost(2, 0); setHost(2, 9);
    assert.equal(validateSnapshot(current.document).settings.values[27], 2 | (9 << 16));
    assert.doesNotThrow(() => change("zy@ö {+KC_A}ü{-KC_A}"), "German types these with its own keys, so a held key may span them");
    assert.throws(() => change("🙂"), error => error.code === "UNICODE_SETUP_REQUIRED" && /German layout cannot type “🙂”/.test(error.message) && /Enable Unicode playback/.test(error.message));
    setHost(2, 9, true);
    assert.doesNotThrow(() => change("🙂"));
    assert.throws(() => change("{+KC_A}🙂{-KC_A}"), /Release ordinary keys/);
    setHost(1, 0); setHost(1, 2, false, true);
    assert.equal(validateSnapshot(current.document).settings.values[27], 1 | (2 << 16) | 0x1000000);
    current = snapshot(change("café “hello” €"));
    const view = macroEditorView(current, capabilities);
    assert.equal(view.macros[0].needsUnicodeSetup, false);
    assert.equal(view.unicode.layoutName, "Dutch");
    assert.throws(() => change("🙂"), error => /Dutch layout cannot type “🙂”/.test(error.message) && /Unicode Hex Input/.test(error.message));
    setHost(1, 3);
    assert.equal(macroEditorView(current, capabilities).unicode.mode, 1, "Unicode Hex Input enables hex entry by itself");
    assert.doesNotThrow(() => change("🙂"));
});

test("macros use the free bank and filled high slots survive lower empty slots running out of room", () => {
    const capabilities = {...CURRENT_CAPABILITIES, macroBytes: 34903, maxProfilePayload: 53216};
    let current = snapshot(document());
    const update = payload => {current = snapshot(editMacro(current, {keycode: "MACRO_127", payload, expectedFingerprint: current.fingerprint}, capabilities));};
    const free = macroEditorView(current, capabilities).macroBank.free;
    update("a".repeat(free));
    let view = macroEditorView(current, capabilities);
    assert.equal(view.macroBank.free, 0);
    assert.equal(view.macroBank.available, 1);
    assert.equal(view.macros[127].available, true);
    assert.equal(view.macros[127].playable, true);
    assert.ok(view.macros.slice(0, 127).every(slot => slot.empty && !slot.available));
    assert.equal(macroInputStatus(current, {keycode: "MACRO_127", payload: "b".repeat(free)}, capabilities).error, "");
    assert.equal(macroInputStatus(current, {keycode: "MACRO_127", payload: "a".repeat(free + 1)}, capabilities).code, "MACRO_BANK_FULL");
    update("a".repeat(free - 60));
    view = macroEditorView(current, capabilities);
    assert.equal(view.macroBank.available, 3);
    assert.equal(view.macros[0].available, true);
    assert.equal(view.macros[1].available, true);
    assert.equal(view.macros[2].available, false);
    assert.equal(view.macros[127].available, true);
    update("");
    assert.equal(macroEditorView(current, capabilities).macroBank.available, 128);
});

test("a long macro plays whatever its length while it fits the bank", () => {
    const current = snapshot(document()), payload = "a".repeat(600);
    assert.equal(macroInputStatus(current, {keycode: "MACRO_0", payload}, {macroBytes: 34903}).error, "");
});

test("names and other domains consume the shared space offered to macros", () => {
    const {editKeyboardName} = require("../../core/model/keyboard-name");
    const current = snapshot(document());
    const caps = {...CURRENT_CAPABILITIES, macroBytes: 34903,
        maxProfilePayload: validateSnapshot(current.document).candidate.length + 60};
    assert.equal(macroEditorView(current, caps).macroBank.free, 60);
    const named = snapshot(editKeyboardName(current, {name: "a".repeat(32), expectedFingerprint: current.fingerprint}, caps));
    assert.equal(macroEditorView(named, caps).macroBank.free, 28);
    assert.equal(macroInputStatus(named, {keycode: "MACRO_0", payload: "a".repeat(29)}, caps).code, "MACRO_BANK_FULL");
    assert.throws(() => editMacro(named, {keycode: "MACRO_0", payload: "a".repeat(29), expectedFingerprint: named.fingerprint}, caps),
        error => error.code === "MACRO_BANK_FULL");
    assert.doesNotThrow(() => editMacro(named, {keycode: "MACRO_0", payload: "a".repeat(28), expectedFingerprint: named.fingerprint}, caps));
});

test("the macro domain can use its full advertised capacity without an extra VIA sentinel", () => {
    const current = snapshot(document());
    const caps = {...CURRENT_CAPABILITIES, macroBytes: 34903, maxProfilePayload: 130048};
    const free = macroEditorView(current, caps).macroBank.free;
    const changed = editMacro(current, {keycode: "MACRO_0", payload: "a".repeat(free), expectedFingerprint: current.fingerprint}, caps);
    assert.equal(macroEditorView(snapshot(changed), caps).macroBank.free, 0);
    const decoded = validateSnapshot(changed, caps);
    assert.equal(decoded.macroSlots.reduce((size, slot) => size + slot.length + 1, 0), 34903);
    const domains = require("../../core/schema/profile-blob-v1").decodeProfileBlob(decoded.candidate).domains;
    assert.equal(domains.find(domain => domain.id === 0x70).payload.length, 34903);
});

test("unused macro tails survive names and layer edits, while stream edits reclaim their shared space", () => {
    const {replaceDomain} = require("../../core/schema/profile-domains");
    const {reorderLayers} = require("../../core/model/portable-profile");
    const source = pdDocument();
    source.profile = replaceDomain(Buffer.from(source.profile, "base64"), 112, payload => Buffer.concat([payload, Buffer.alloc(99, 65), Buffer.from([0])])).toString("base64");
    const current = snapshot(source), bytes = Buffer.from(source.profile, "base64");
    const caps = {...CURRENT_CAPABILITIES, macroBytes: 34903, maxProfilePayload: bytes.length};
    assert.equal(profileMacroBudget(validateSnapshot(source), caps).free, 100);
    const changed = editMacro(current, {keycode: "MACRO_0", payload: "a".repeat(100), expectedFingerprint: current.fingerprint}, caps);
    assert.equal(Buffer.from(changed.profile, "base64").length, bytes.length, "the replacement uses the reclaimed tail");
    const named = editMacro(current, {keycode: "MACRO_0", name: "Named", expectedFingerprint: current.fingerprint});
    const macros = document => decodeProfileBlob(Buffer.from(document.profile, "base64")).domains.find(row => row.id === 112).payload;
    assert.deepEqual(macros(named), macros(source));
    assert.deepEqual(macros(reorderLayers(source, [0, 2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])), macros(source));
    assert.deepEqual(Buffer.from(JSON.parse(JSON.stringify(source)).profile, "base64"), bytes, "portable JSON retains the exact complete blob");
});
