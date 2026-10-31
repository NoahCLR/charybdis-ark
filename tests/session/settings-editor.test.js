"use strict";
const {editLayers} = require("../fixtures/profile-document");
const test = require("node:test");
const assert = require("node:assert/strict");
const {settingsEditorView} = require("../../core/model/settings-editor");
const {fingerprint} = require("../../core/model/portable-profile");
const {document} = require("../fixtures/portable-profile");
const {wire} = require("../fixtures/keyboard-options");
const {connectedService} = require("../fixtures/connected-service");
const refuseRecovery = () => {throw Error("must not start restore");};

test("a profile exceeding the connected keyboard's brightness limit is refused before any writes", async t => {
    const {service, keyboard} = await connectedService(t, {brightnessMax: 100});
    await assert.rejects(service.restorePortableProfile(document(), {saveRecovery: refuseRecovery}), /brightness.*limit of 100/);
    assert.deepEqual(keyboard.mutations, []);
});

test("an unavailable lighting effect is refused before recovery or profile staging", async t => {
    const options = wire();
    // The source uses effect 2; the destination only supports effect 1.
    const {draftEdit} = require("../fixtures/draft-edit");
    const source = {document: document(), fingerprint: fingerprint(document()), options: require("../fixtures/keyboard-options").options()};
    const section = settingsEditorView(source).sections.find(item => item.id === "rgbAppearance");
    const target = draftEdit(source, {type: "updateConfigDefaults", sectionId: section.id,
        fields: section.fields.map(field => ({macro: field.macro, value: field.macro === "effectMode" ? "2" : field.value, enabled: field.enabled}))});
    options.bytes = options.bytes.subarray(0, 26 + 64); options.metadata[4] = 1; options.metadata.writeUInt16LE(options.bytes.length, 2);
    const {service, keyboard} = await connectedService(t, {options});
    await assert.rejects(service.restorePortableProfile(target, {saveRecovery: refuseRecovery}), /lighting effect unavailable/);
    assert.deepEqual(keyboard.mutations, []);
});

test("a restore that starts re-reads the keyboard's status, even when it fails", async t => {
    const {service, keyboard} = await connectedService(t);
    const target = document(); editLayers(target, layers => layers[0][0] = 5);
    let refreshed = 0;
    const refresh = service.refreshStatus.bind(service);
    service.refreshStatus = async () => {refreshed++; return refresh();};
    // The fake keyboard is read-only: it refuses the first write.
    await assert.rejects(service.restorePortableProfile(target, {saveRecovery: () => ({})}));
    assert.ok(keyboard.mutations.length > 0, "the restore started writing");
    assert.equal(refreshed, 1, "the health strip is read again rather than left at its pre-apply value");
});

test("a profile with a misplaced action is refused, naming it, before recovery or any write", async t => {
    const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
    const {PROFILE_DOMAIN_IDS} = require("../../core/schema/profile-domains");
    const {encodeComboDomain} = require("../../core/schema/combo-domain-v1");
    const base = document();
    const blob = decodeProfileBlob(Buffer.from(base.profile, "base64"));
    const code = operand => ({kind: 1, flags: 0, operand});
    const combos = {id: PROFILE_DOMAIN_IDS.COMBOS, version: 3, payload: encodeComboDomain({version: 3, defaultTermMs: 50, holdTermMs: 0, rows: [{inputs: [code(0x04), code(0x05)], output: code(0x4104), termMs: null, mustHold: false, mustTap: false, ordered: false}]})};
    const target = {...base, profile: encodeProfileBlob({...blob, domains: [...blob.domains.filter(domain => domain.id !== PROFILE_DOMAIN_IDS.COMBOS), combos]}).toString("base64")};
    const {service, keyboard} = await connectedService(t);
    await assert.rejects(service.restorePortableProfile(target, {saveRecovery: refuseRecovery}), /C0: LT\(1,KC_A\) makes its own tap\/hold decision/);
    assert.deepEqual(keyboard.mutations, []);
});
