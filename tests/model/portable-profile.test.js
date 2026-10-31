"use strict";
const {profileLayers, profileMacros, editLayers, editMacros} = require("../fixtures/profile-document");
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {validateSnapshot, reorderLayers, fingerprint, materializeProfile} = require("../../core/model/portable-profile");
const {encodeSettings, decodeSettings} = require("../../core/schema/settings-domain-v1");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {decodeKeyBehaviorDomain, encodeKeyBehaviorDomain} = require("../../core/schema/key-behavior-domain-v1");
const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require("../../core/data/charybdis-layout");
const {settings, document} = require("../fixtures/portable-profile");
test("complete snapshots flatten effective domains and round-trip without destination defaults", () => {
    const source = document(), actual = validateSnapshot(JSON.stringify(source));
    assert.equal(actual.behaviors.rows.length, 37); assert.equal(actual.combos.rows.length, 1);
    // The keyboard stores a default window, and its combo follows it.
    assert.deepEqual([actual.combos.version, actual.combos.defaultTermMs, actual.combos.holdTermMs, actual.combos.rows[0].termMs], [3, 50, 200, null]);
    assert.equal(actual.settings.names[3], "Navigation"); assert.equal(actual.layers.flat().length, 960);
    assert.equal(fingerprint(JSON.parse(JSON.stringify(source))), fingerprint(source));
});
test("empty domains are explicit and replace flashed behaviours and combos", () => {
    const source = document(), blob = decodeProfileBlob(Buffer.from(source.profile, "base64"));
    blob.domains[1].payload = encodeKeyBehaviorDomain({rows: []}); blob.domains[2].payload = Buffer.from([0, 0, 0, 0, 50, 0, 200, 0]);
    source.profile = encodeProfileBlob(blob).toString("base64");
    assert.equal(validateSnapshot(source).behaviors.rows.length, 0); assert.equal(validateSnapshot(source).combos.rows.length, 0);
});
test("reorder moves matrix data, RGB, pointer policy and every layer action reference together", () => {
    const source = document(), reordered = reorderLayers(source, [0, 4, 2, 3, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const actual = validateSnapshot(reordered);
    assert.deepEqual(profileLayers(reordered)[0].slice(0, 5), [0x5224, 0x4431, 0x7ec1, 0x5082, 0x52c4]);
    assert.equal(actual.settings.names[1], "Pointer"); assert.equal(actual.settings.values[5], 1);
    assert.equal(actual.rgb.layerColors.find(row => row.layerId === 1).color.v, 150);
    assert.equal(fingerprint(reorderLayers(reordered, [0, 4, 2, 3, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])), fingerprint(source));
});
test("a backup from older firmware is refused, never upgraded: the keyboard stores only the current format", () => {
    const older = /format current firmware does not store/;
    const source = document();
    // Another schema, action vocabulary or layer count, and the retired
    // pointing-mode evidence older backups carried.
    assert.throws(() => validateSnapshot({...source, version: 1}), older);
    for (const actionAbiDigest of [0x837cf479, 0x1d3fcacc, 0x61072732, 0xeb80829c, 0xdcb00959, 0xf79c6151]) assert.throws(() => validateSnapshot({...source, actionAbiDigest}), older);
    assert.throws(() => validateSnapshot({...source, pdModeSource: {version: 1}}), {code: "INVALID_PORTABLE_PROFILE", message: /holds more than a backup from current firmware/});
    assert.throws(() => validateSnapshot({...source, layers: profileLayers(source).slice(0, 8)}), {code: "INVALID_PORTABLE_PROFILE", message: /holds more than a backup from current firmware/});
    const truncated = decodeProfileBlob(Buffer.from(source.profile, "base64"));
    truncated.domains.find(d => d.id === 96).payload = Buffer.alloc(480);
    // Said as a damaged file; the decoder's own words are its cause, for the diagnostics.
    assert.throws(() => validateSnapshot({...source, profile: encodeProfileBlob(truncated).toString("base64")}),
        (error) => error.code === "INVALID_PORTABLE_PROFILE" && /damaged/.test(error.message) && /1,?920|1920/.test(error.cause?.message));
    // A current envelope around a retired domain version.
    const blob = decodeProfileBlob(Buffer.from(source.profile, "base64"));
    const raw = Buffer.from(source.profile, "base64");
    let offset = 8;
    for (const domain of blob.domains) {
        const relabelled = Buffer.from(raw); relabelled[offset + 1] = domain.version - 1;
        assert.throws(() => validateSnapshot({...source, profile: relabelled.toString("base64")}), older, `domain 0x${domain.id.toString(16)}`);
        offset += 6 + domain.payload.length;
    }
    // A current profile relabelled with an earlier blob schema; schema 3's
    // 4-byte envelopes are not even read.
    for (const major of [1, 2, 3]) {
        const relabelled = Buffer.from(raw); relabelled[4] = major;
        assert.throws(() => validateSnapshot({...source, profile: relabelled.toString("base64")}), older, `schema ${major}`);
    }
});
test("behaviour targets and tap/hold branches follow their layers", () => {
    const source = document(), blob = decodeProfileBlob(Buffer.from(source.profile, "base64"));
    const behaviors = decodeKeyBehaviorDomain(blob.domains[1].payload);
    behaviors.rows = [{target: {kind: 2, operand: 1}, steps: [{tapIndex: 0, tap: {kind: 3, operand: 4}, hold: {style: 1, repeatHz: 0, action: {kind: 2, operand: 1}}}]}];
    blob.domains[1].payload = encodeKeyBehaviorDomain(behaviors); source.profile = encodeProfileBlob(blob).toString("base64");
    const row = validateSnapshot(reorderLayers(source, [0, 4, 2, 3, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])).behaviors.rows[0];
    assert.equal(row.target.operand, 4); assert.equal(row.steps[0].tap.operand, 1); assert.equal(row.steps[0].hold.action.operand, 4);
});
test("owned layer keys follow their layers on a key, in a behaviour and on a combo", () => {
    const {decodeComboDomain, encodeComboDomain} = require("../../core/schema/combo-domain-v1");
    const source = document(), blob = decodeProfileBlob(Buffer.from(source.profile, "base64"));
    // Layer 1 moves to 4 and 4 to 1; TG, TO, OSL, TT and DF all carry the layer in the low bits.
    const behaviors = decodeKeyBehaviorDomain(blob.domains[1].payload);
    behaviors.rows = [{target: {kind: 1, operand: 0x52c1}, steps: [{tapIndex: 0, tap: {kind: 1, operand: 0x5261}}]}];
    blob.domains[1].payload = encodeKeyBehaviorDomain(behaviors);
    const combos = decodeComboDomain(blob.domains[2].payload);
    combos.rows[0].output = {kind: 1, operand: 0x5284};
    blob.domains[2].payload = encodeComboDomain(combos);
    source.profile = encodeProfileBlob(blob).toString("base64");
    editLayers(source, layers => layers[0].splice(10, 5, 0x5261, 0x5204, 0x5281, 0x52c4, 0x5241));

    const reordered = reorderLayers(source, [0, 4, 2, 3, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]), actual = validateSnapshot(reordered);
    assert.deepEqual(profileLayers(reordered)[0].slice(10, 15), [0x5264, 0x5201, 0x5284, 0x52c1, 0x5244]);
    assert.equal(actual.behaviors.rows[0].target.operand, 0x52c4, "TT(1) as a behaviour's key becomes TT(4)");
    assert.equal(actual.behaviors.rows[0].steps[0].tap.operand, 0x5264, "TG(1) as a tap becomes TG(4)");
    assert.equal(actual.combos.rows[0].output.operand, 0x5281, "OSL(4) as a combo output becomes OSL(1)");
});

test("with keys not following, layers move but every layer key keeps its number", () => {
    const {decodeComboDomain, encodeComboDomain} = require("../../core/schema/combo-domain-v1");
    const source = document(), blob = decodeProfileBlob(Buffer.from(source.profile, "base64"));
    const behaviors = decodeKeyBehaviorDomain(blob.domains[1].payload);
    behaviors.rows = [{target: {kind: 2, operand: 1}, steps: [{tapIndex: 0, tap: {kind: 3, operand: 4}, hold: {style: 1, repeatHz: 0, action: {kind: 2, operand: 1}}}]}];
    blob.domains[1].payload = encodeKeyBehaviorDomain(behaviors);
    const combos = decodeComboDomain(blob.domains[2].payload);
    combos.rows[0].output = {kind: 1, operand: 0x5284};
    blob.domains[2].payload = encodeComboDomain(combos);
    source.profile = encodeProfileBlob(blob).toString("base64");
    editLayers(source, layers => layers[0].splice(10, 3, 0x5261, 0x5281, 0x4104));
    const before = validateSnapshot(source);

    const order = [0, 4, 2, 3, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const moved = reorderLayers(source, order, undefined, {keysFollow: false}), actual = validateSnapshot(moved);
    // Each layer's own keys move with it, untouched...
    order.forEach((old, next) => assert.deepEqual(profileLayers(moved)[next], profileLayers(source)[old], `layer ${old} lands at ${next} as it was`));
    // ...and the layer keys on them, in behaviours and on combos keep their numbers.
    assert.deepEqual(profileLayers(moved)[0].slice(10, 13), [0x5261, 0x5281, 0x4104]);
    assert.deepEqual(actual.behaviors.rows[0].target, before.behaviors.rows[0].target);
    assert.equal(actual.behaviors.rows[0].steps[0].tap.operand, 4);
    assert.equal(actual.behaviors.rows[0].steps[0].hold.action.operand, 1);
    assert.equal(actual.combos.rows[0].output.operand, 0x5284);
    // Names, colours and the pointer setting still follow their layer.
    assert.equal(actual.settings.names[1], before.settings.names[4]);
    assert.equal(actual.settings.values[5], order.indexOf(before.settings.values[5]));
    assert.deepEqual(actual.rgb.layerColors.find(row => row.layerId === 1).color, before.rgb.layerColors.find(row => row.layerId === 4).color);
    // The default still renumbers.
    assert.equal(validateSnapshot(reorderLayers(source, order)).combos.rows[0].output.operand, 0x5281);
});

test("a new base trades roles with the old one: keys to either keep their numbers, the rest follow their layers", () => {
    const {decodeComboDomain, encodeComboDomain} = require("../../core/schema/combo-domain-v1");
    const source = document(), blob = decodeProfileBlob(Buffer.from(source.profile, "base64"));
    // TO(0), TO(3), TG(2) and MO(3) on the old base; LOCK_LAYER(0) and TT(3) as behaviour branches; TO(3) on a combo.
    const behaviors = decodeKeyBehaviorDomain(blob.domains[1].payload);
    behaviors.rows = [{target: {kind: 1, operand: 0x04}, steps: [{tapIndex: 0, tap: {kind: 3, operand: 0}, hold: {style: 1, repeatHz: 0, action: {kind: 2, operand: 3}}}]}];
    blob.domains[1].payload = encodeKeyBehaviorDomain(behaviors);
    const combos = decodeComboDomain(blob.domains[2].payload);
    combos.rows[0].output = {kind: 1, operand: 0x5203};
    blob.domains[2].payload = encodeComboDomain(combos);
    source.profile = encodeProfileBlob(blob).toString("base64");
    editLayers(source, layers => layers[0].splice(10, 4, 0x5200, 0x5203, 0x5262, 0x5223));
    const before = validateSnapshot(source);

    // Navigation (3) becomes the base; the old base takes slot 3.
    const order = [3, 1, 2, 0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const moved = reorderLayers(source, order), actual = validateSnapshot(moved);
    assert.deepEqual(profileLayers(moved)[3].slice(10, 14), [0x5200, 0x5203, 0x5262, 0x5223], "TO(0) stays home, TO(3) and MO(3) now reach the old base, TG(2) follows");
    assert.equal(actual.behaviors.rows[0].steps[0].tap.operand, 0, "LOCK_LAYER(0) still names the base");
    assert.equal(actual.behaviors.rows[0].steps[0].hold.action.operand, 3, "MO(3) held the new base, so it holds the old one");
    assert.equal(actual.combos.rows[0].output.operand, 0x5203);
    // Moved on past the swap, the old base is still what those keys reach.
    const further = reorderLayers(source, [3, 1, 2, 4, 5, 6, 7, 0, 8, 9, 10, 11, 12, 13, 14, 15]);
    assert.equal(profileLayers(further)[7][11], 0x5207, "TO(3) reaches the old base in slot 7");
    assert.equal(profileLayers(further)[7][12], 0x5262, "TG(2) stays with Symbols");
    // Keys not following leaves the other layers' keys alone, never the swap.
    const kept = reorderLayers(source, [3, 1, 4, 5, 6, 7, 2, 0, 8, 9, 10, 11, 12, 13, 14, 15], undefined, {keysFollow: false});
    assert.deepEqual(profileLayers(kept)[7].slice(10, 14), [0x5200, 0x5207, 0x5262, 0x5227], "TO(3) and MO(3) still reach the old base; TG(2) keeps its number");
    assert.deepEqual(validateSnapshot(kept).behaviors.rows[0].steps[0].hold.action.operand, 7);
    assert.equal(actual.settings.names[0], before.settings.names[3]);
    assert.equal(actual.settings.names[3], before.settings.names[0]);
    assert.deepEqual(actual.rgb.layerColors.find(row => row.layerId === 0).color, before.rgb.layerColors.find(row => row.layerId === 3).color, "the new base keeps its colour");
    assert.equal(actual.settings.values[23], 1, "the bottom slot is still the one that starts on");
    assert.equal(actual.settings.values[5], order.indexOf(before.settings.values[5]), "the pointer layer follows what it holds");
    assert.deepEqual(actual.settings.layers.map(record => record.reference), Array.from({length: 16}, (_, layer) => layer), "each layer's combos still read from the layer itself");
});

test("Make base gives the old uncoloured base its saved HSV and normalizes empty keys", () => {
    const source = document(), blob = decodeProfileBlob(Buffer.from(source.profile, "base64"));
    const saved = decodeSettings(blob.domains[3].payload);
    saved.values[21] = (saved.values[21] & ~0xff00) | (2 << 8); // An animated effect still has saved HSV.
    saved.values[22] = 27 | (180 << 8) | (100 << 16);
    blob.domains[3].payload = encodeSettings(saved);
    source.profile = encodeProfileBlob(blob).toString("base64");
    editLayers(source, layers => layers[0].splice(0, 4, 0, 1, 4, 0));
    editLayers(source, layers => layers[3].splice(0, 4, 1, 0, 5, 1));

    const moved = reorderLayers(source, [3, 1, 2, 0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const rgb = validateSnapshot(moved).rgb;
    assert.deepEqual(profileLayers(moved)[0].slice(0, 4), [0, 0, 5, 0], "transparent positions entering base become KC_NO");
    assert.deepEqual(profileLayers(moved)[3].slice(0, 4), [1, 1, 4, 1], "KC_NO positions leaving base become transparent");
    assert.deepEqual(rgb.layerColors[3], {layerId: 3, color: {h: 27, s: 180, v: 100}, mode: 0});
    assert.deepEqual(rgb.layerColors[0].color, {h: 180, s: 255, v: 200}, "new base keeps its own lighting");
});

test("Make base leaves unused matrix slots alone through a base swap and back", () => {
    const source = document();
    const physical = new Set(CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column]) => row * 6 + column));
    const unused = Array.from({length: 60}, (_, slot) => slot).filter(slot => !physical.has(slot));
    assert.deepEqual(unused, [24, 54, 56, 58]);
    editLayers(source, layers => layers[0] = profileLayers(source)[0].map((_, slot) => physical.has(slot) ? 4 : 0));
    editLayers(source, layers => layers[2] = profileLayers(source)[2].map((_, slot) => physical.has(slot) ? 1 : 0));

    const swap = [2, 1, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const moved = reorderLayers(source, swap);
    assert.equal(profileLayers(moved)[0][0], 0, "a physical transparent key entering base becomes KC_NO");
    assert.equal(profileLayers(moved)[2][0], 4, "a physical key leaving base keeps its assignment");
    for (const slot of unused) {
        assert.equal(profileLayers(moved)[0][slot], 0, `unused new-base slot ${slot} stays KC_NO`);
        assert.equal(profileLayers(moved)[2][slot], 0, `unused old-base slot ${slot} stays KC_NO`);
    }
    const restored = reorderLayers(moved, swap);
    assert.deepEqual(profileLayers(restored), profileLayers(source), "swapping back restores the original matrix");
});

test("Make base keeps an existing old-base colour, while overlay reorders keep empty keys", () => {
    const source = document(), blob = decodeProfileBlob(Buffer.from(source.profile, "base64"));
    const rgb = validateSnapshot(source).rgb;
    rgb.layerColors[0].color = {h: 0, s: 0, v: 120}; // White is a real colour.
    blob.domains[0].payload = require("../../core/schema/rgb-domain-v1").encodeRgbDomainV1(rgb);
    source.profile = encodeProfileBlob(blob).toString("base64");
    editLayers(source, layers => layers[0][0] = 0);
    editLayers(source, layers => layers[3][0] = 1);
    const moved = reorderLayers(source, [3, 1, 2, 0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    assert.deepEqual(validateSnapshot(moved).rgb.layerColors[3], {layerId: 3, color: {h: 0, s: 0, v: 120}, mode: 0});
    const overlay = reorderLayers(source, [0, 3, 2, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    assert.equal(profileLayers(overlay)[0][0], 0);
    assert.equal(profileLayers(overlay)[1][0], 1);
});

test("partial, incompatible, over-capacity and malformed profiles fail before restore", () => {
    const source = document();
    assert.throws(() => validateSnapshot({...source, layers: profileLayers(source).slice(0, 4)}), {code: "INVALID_PORTABLE_PROFILE", message: /holds more than a backup from current firmware/});
    assert.throws(() => validateSnapshot({...source, profile: source.profile + "!"}), {code: "INVALID_PORTABLE_PROFILE", message: /profile in this file is damaged/});
    assert.throws(() => validateSnapshot(source, {compiledLayerCount: 16, supportedDomainMask: 15, actionAbiDigest: 1}), {code: "INVALID_PORTABLE_PROFILE", message: /firmware cannot take this profile/});
    assert.throws(() => reorderLayers(source, [1, 1, 2, 3, 4, 5, 6, 7]), /every layer once/);
});
module.exports = {settings, document};

test("portable streams restore across bank sizes with stable fingerprints and explicit over-capacity errors", () => {
    const {document: make, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
    const {fingerprintOf, fingerprint, validateSnapshot} = require("../../core/model/portable-profile");
    const source = make();
    editMacros(source, macros => macros[127] = Buffer.from("a".repeat(9000)).toString("base64"));
    const old = validateSnapshot(source, {...CURRENT_CAPABILITIES, macroBytes: 10327});
    const next = validateSnapshot(source, {...CURRENT_CAPABILITIES, featureFlags: 1 << 27, macroBytes: 34903, maxProfilePayload: 53216});
    assert.deepEqual(next.macroSlots, old.macroSlots, "destination geometry does not alter streams");
    assert.deepEqual(next.profile, old.profile, "one canonical profile is retained without bank padding");
    assert.equal(fingerprintOf(next), fingerprintOf(old));
    assert.equal(fingerprintOf(next), fingerprint(source));
    editMacros(source, macros => macros[127] = Buffer.from("a".repeat(20000)).toString("base64"));
    assert.equal(profileMacros(validateSnapshot(source).document)[127], profileMacros(source)[127], "a large backup is read without a destination");
    assert.throws(() => validateSnapshot(source, {...CURRENT_CAPABILITIES, macroBytes: 10327}), /Macros need 20128 bytes; this keyboard holds 10327/);
    assert.equal(validateSnapshot(source, {...CURRENT_CAPABILITIES, featureFlags: 1 << 27, macroBytes: 34903}).macroSlots.length, 128);
});

test("current backups preserve retired user assignments without reinterpreting them as custom keys", () => {
    const source = document();
    const codes = Array.from({length: 32}, (_, index) => 0x7e40 + index);
    editLayers(source, layers => layers[0].splice(0, codes.length, ...codes));
    const restored = validateSnapshot(JSON.stringify(source));
    assert.deepEqual(profileLayers(restored.document)[0].slice(0, 32), codes);
    assert.deepEqual(validateSnapshot(JSON.stringify(restored.document)).layers, restored.layers);
    const {profileKeyNames, keyLabel} = require("../../core/model/key-names");
    const names = profileKeyNames({actionsKnown: true, customKeys: [{slot: 0, name: "Right Thumb"}]});
    for (let index = 0; index < 32; index++) assert.equal(keyLabel(names, codes[index]), `User ${index}`);
    assert.equal(keyLabel(names, 0x7f00), "Right Thumb");
});

test("a keyboard storing a domain in another version than current firmware's is not read", () => {
    const source = validateSnapshot(document());
    const current = encodeSettings(settings());
    const v7 = Buffer.concat([current.subarray(0, 404), current.subarray(1684)]);
    v7[0] = 7; v7[6] = 0;
    const blob = decodeProfileBlob(source.profile);
    const live = encodeProfileBlob({schema: blob.schema, domains: blob.domains.map(domain => domain.id === 0x40 ? {...domain, version: 7, payload: v7} : domain)},
        {domainVersions: {0x10: 4, 0x20: 2, 0x30: 3, 0x40: 7, 0x50: 4, 0x60: 1, 0x70: 1}});
    const combos = {defaultTermMs: 50, holdTermMs: 200, rows: []};
    assert.throws(() => materializeProfile(live, live, combos, current), {code: "FIRMWARE_UPDATE_REQUIRED", message: /Ark supports only current firmware/});
    assert.throws(() => materializeProfile(source.candidate, source.candidate, combos, Buffer.from([12, ...current.subarray(1)])), /settings/i, "settings in another version are refused");
    assert.doesNotThrow(() => materializeProfile(source.candidate, source.candidate, combos, current));
});

test("a complete profile above 64 KiB survives a snapshot, portable JSON and candidate assembly", () => {
    const fs = require("node:fs"), path = require("node:path");
    const text = fs.readFileSync(path.resolve(__dirname, "../../upstream/firmware/tests/fixtures/maximum_profile_v4.fixture"), "utf8");
    const bytes = Buffer.from(text.match(/^profile\.hex=(.*)$/m)[1], "hex");
    const {createSnapshot, FILE_MAX_BYTES} = require("../../core/model/portable-profile");
    const doc = createSnapshot({profile: bytes, actionAbiDigest: require("../../core/schema/actions").ACTION_ABI});
    const serialized = JSON.stringify(doc);
    assert.ok(bytes.length > 65535);
    assert.ok(Buffer.byteLength(serialized) < FILE_MAX_BYTES);
    const decoded = validateSnapshot(JSON.parse(serialized));
    assert.deepEqual(decoded.candidate, bytes);
    const caps = {...require("../fixtures/portable-profile").CURRENT_CAPABILITIES, maxProfilePayload: bytes.length};
    assert.doesNotThrow(() => validateSnapshot(doc, caps));
    assert.throws(() => validateSnapshot(doc, {...caps, maxProfilePayload: bytes.length - 1}), /with its keymap and macros/);
});

// The combos domain is the profile's like any other, and the profile is its
// only durable owner (firmware D-F32): a read takes it as the keyboard stores
// it. Rebuilt from what the keyboard runs, a combo whose input is a custom key
// or whose output is MO(5) came back as native keycodes: the same keys in
// other bytes, so an Apply rewrote them and sending such a draft live showed
// every one as changed (seen on Noah's keyboard on 2026-10-19).
test("a read takes the combos the keyboard stores, profile actions included, not what it runs re-encoded", () => {
    const {decodeComboDomain, encodeComboDomain, runningComboRows} = require("../../core/schema/combo-domain-v1");
    const {semanticActionForExpression} = require("../../core/schema/compiled-profile-v1");
    const {keycodeAction} = require("../../core/schema/actions");
    const source = validateSnapshot(document());
    const blob = decodeProfileBlob(source.candidate);
    const table = {version: 3, defaultTermMs: 50, holdTermMs: 200, rows: [{inputs: [keycodeAction(0x04), keycodeAction(0x05)], output: semanticActionForExpression("MO(5)", {}),
        termMs: null, mustHold: false, mustTap: false, ordered: false, enabled: true, useOutputBehavior: true, allowedLayers: 0xffff}]};
    const stored = encodeComboDomain(table);
    const active = encodeProfileBlob({schema: blob.schema, domains: blob.domains.map(domain => domain.id === 0x30 ? {...domain, payload: stored} : domain)});
    const running = {defaultTermMs: 50, holdTermMs: 200, rows: runningComboRows(decodeComboDomain(stored))};
    const settingsBytes = blob.domains.find(domain => domain.id === 0x40).payload;
    const read = decodeProfileBlob(materializeProfile(active, source.candidate, running, Buffer.from(settingsBytes)));
    assert.ok(Buffer.from(read.domains.find(domain => domain.id === 0x30).payload).equals(stored), "the stored bytes, exactly");
    assert.equal(decodeComboDomain(read.domains.find(domain => domain.id === 0x30).payload).rows[0].output.kind, table.rows[0].output.kind);
});

test("a custom key's shortcut layers follow their layers through a reorder, Make base and keys keeping their numbers, or the reorder is refused in words", () => {
    const {settings, compiled} = require("../fixtures/portable-profile");
    const {SETTING} = require("../../core/schema/settings-domain-v1");
    const rest = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    /** @param {(policy: any) => void} [change] */
    const build = (change) => {
        const policy = settings();
        policy.values[SETTING.DEFAULT_LAYERS] = 1;
        policy.customKeyShortcuts[0] = {mods: 0x08, keys: [], layers: (1 << 3) | (1 << 5), layerKind: 2}; // Move to Navigation + Extra 1
        policy.customKeyShortcuts[1] = {mods: 0, keys: [], layers: 1 << 1, layerKind: 1};                   // Lock Numbers
        policy.customKeyShortcuts[2] = {mods: 0, keys: [], layers: 0xfffe, layerKind: 3};                    // Tap-toggle all fifteen
        change?.(policy);
        return compiled({policy});
    };
    const shortcuts = (doc) => validateSnapshot(doc).settings.customKeyShortcuts.slice(0, 3);
    // Keys following, a move renumbers them by content and keeps each kind.
    const moved = shortcuts(reorderLayers(build(), [0, 3, 1, 2, ...rest]));
    assert.deepEqual(moved, [{mods: 0x08, keys: [], layers: (1 << 1) | (1 << 5), layerKind: 2}, {mods: 0, keys: [], layers: 1 << 2, layerKind: 1}, {mods: 0, keys: [], layers: 0xfffe, layerKind: 3}]);
    // Make base trades roles: one naming the new base names the old base in
    // its new slot, as MO() of it does.
    const based = shortcuts(reorderLayers(build(), [1, 0, 2, 3, ...rest]));
    assert.equal(based[1].layers, 1 << 1, "Lock Numbers now locks the old base, in Numbers' old slot");
    assert.equal(based[1].layerKind, 1);
    assert.equal(based[2].layers, 0xfffe, "all fifteen stay all fifteen");
    // Keys keeping their numbers, shortcuts keep theirs.
    assert.deepEqual(shortcuts(reorderLayers(build(), [0, 2, 1, 3, ...rest], undefined, {keysFollow: false})), shortcuts(build()));
    // Make base with keys keeping their numbers: a shortcut that would land on
    // a default layer is refused, as is one whose layers would merge.
    const numbersDefault = build((policy) => {policy.values[SETTING.DEFAULT_LAYERS] = 1 | (1 << 1); policy.customKeyShortcuts[1] = {mods: 0, keys: [], layers: 0, layerKind: 0}; policy.customKeyShortcuts[2] = {mods: 0, keys: [], layers: 0, layerKind: 0};});
    assert.throws(() => reorderLayers(numbersDefault, [1, 2, 3, 0, ...rest], undefined, {keysFollow: false}), /Custom key 0's shortcut turn on .*, which would be a default layer, always on\. Turn on Keys follow their layers/);
    const merging = build((policy) => {policy.customKeyShortcuts[0] = {mods: 0, keys: [], layers: (1 << 1) | (1 << 3), layerKind: 0}; policy.customKeyShortcuts[1] = {mods: 0, keys: [], layers: 0, layerKind: 0}; policy.customKeyShortcuts[2] = {mods: 0, keys: [], layers: 0, layerKind: 0};});
    assert.throws(() => reorderLayers(merging, [1, 2, 3, 0, ...rest], undefined, {keysFollow: false}), /Custom key 0's shortcut turn on Numbers and Navigation as one layer/);
    // Keys following, neither can happen.
    assert.doesNotThrow(() => reorderLayers(merging, [1, 2, 3, 0, ...rest]));
    assert.doesNotThrow(() => reorderLayers(numbersDefault, [1, 2, 3, 0, ...rest]));
});

// The macro codecs read a delay's digits up to its '|'; the model's walk reads
// as many digits as 65,535 has. A zero-padded delay longer than that is a
// macro the codecs keep and the model refuses. This pins today's behaviour so
// a change to either side is a choice, not drift.
test("a delay with more digits than the longest delay is refused by the model alone", () => {
    const {validateMacro} = require("../../core/model/portable-profile");
    const {decodeMacroPayload} = require("../../core/schema/macro-payload");
    const {MACRO_LIMITS} = require("../../rules/macro-payload.mjs");
    const padded = Buffer.concat([Buffer.from([1, 4]), Buffer.from(`${"0".repeat(String(MACRO_LIMITS.maxDelayMs).length)}1|`)]);
    assert.equal(decodeMacroPayload(padded), "{000001}");
    assert.throws(() => validateMacro(padded), {code: "INVALID_PORTABLE_PROFILE", message: "A macro in this profile has a delay the keyboard cannot play."});
    assert.doesNotThrow(() => validateMacro(Buffer.concat([Buffer.from([1, 4]), Buffer.from(`${MACRO_LIMITS.maxDelayMs}|`)])));
});

// What a refused profile says is read by a person: plain words about what is
// wrong with it, never a codec's, and the same code for the code that acts on it.
test("a refused profile says what is wrong with it in plain words, under its stable code", () => {
    const {QK} = require("../../rules/qmk-keycodes.mjs");
    const said = (run) => {
        try {run();} catch (error) {
            assert.equal(error.code, "INVALID_PORTABLE_PROFILE");
            return error.message;
        }
        assert.fail("refused");
    };
    // MO(20): a layer key past the keyboard's layers, refused when the layers move.
    const beyond = editLayers(document(), layers => {layers[1][0] = QK.MOMENTARY.first + 20;});
    const words = [
        said(() => reorderLayers(beyond, [0, 2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])),
        said(() => validateSnapshot({...document(), profile: "!"})),
        said(() => validateSnapshot({...document(), extra: 1})),
        said(() => validateSnapshot(document(), {compiledLayerCount: 8, supportedDomainMask: 127, actionAbiDigest: document().actionAbiDigest})),
    ];
    assert.equal(words[0], "A key in this profile reaches a layer the keyboard does not have.");
    for (const sentence of words) assert.doesNotMatch(sentence, /layer bank|layer-mod|portable profile|action vocabulary|domain|RGB|Invalid|Unbalanced|Unsupported/, sentence);
});

test("changing a document's domains encodes only those it opens, decoded once and kept", () => {
    const {editProfileDomains, readProfileDomains} = require("../../core/model/portable-profile");
    const {PROFILE_DOMAINS} = require("../../core/schema/profile-domains");
    const source = editMacros(document(), macros => {macros[0] = Buffer.from("hello").toString("base64");});
    const domains = value => decodeProfileBlob(Buffer.from(value.profile, "base64")).domains;
    // Opening every domain and changing nothing writes the same bytes.
    assert.deepEqual(editProfileDomains(source, {}, open => PROFILE_DOMAINS.forEach(domain => open(domain.key))), source);
    let opened;
    const renamed = editProfileDomains(source, {}, open => {
        opened = open("settings"); opened.names[1] = "New name";
        assert.equal(open("settings"), opened, "a domain opened twice is the one model");
    });
    assert.equal(validateSnapshot(renamed).settings.names[1], "New name");
    assert.deepEqual(domains(renamed).filter(row => row.id !== 0x40), domains(source).filter(row => row.id !== 0x40));
    assert.notEqual(renamed, source);
    assert.deepEqual(editProfileDomains(source, {}, () => {}), source, "nothing opened is nothing changed");
    // Reading never writes: the source's own settings are unchanged.
    assert.equal(readProfileDomains(source)("settings").names[1], "Numbers");
    assert.equal(readProfileDomains(renamed)("settings").names[1], "New name");
});

test("a document's domains are read and written with its keyboard's depth and brightness, and a behaviour edit with its action slots", () => {
    const {editProfileDomains} = require("../../core/model/portable-profile");
    const {CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
    const source = document();
    const brighten = value => open => {open("rgb").layerColors[0].color.v = value;};
    assert.equal(validateSnapshot(editProfileDomains(source, {limits: {brightnessMax: 200}}, brighten(200))).rgb.layerColors[0].color.v, 200);
    assert.throws(() => editProfileDomains(source, {limits: {brightnessMax: 200}}, brighten(201)), {code: "BRIGHTNESS_EXCEEDED"});
    // A behaviour edit checks that every row sends only a macro slot the keyboard has.
    const macroTap = open => {open("behaviors").rows[0].steps = [{tapIndex: 0, tap: {kind: 6, flags: 0, operand: 40}}];};
    const capabilities = {...CURRENT_CAPABILITIES, actionAbiDigest: source.actionAbiDigest};
    assert.doesNotThrow(() => editProfileDomains(source, {capabilities: {...capabilities, macroSlots: 41}, checkActions: true}, macroTap));
    assert.throws(() => editProfileDomains(source, {capabilities: {...capabilities, macroSlots: 40}, checkActions: true}, macroTap), /macro slot 40/);
    // Any other edit keeps a row it does not touch, though the keyboard now has fewer slots.
    const sendsMacro40 = editProfileDomains(source, {capabilities: {...capabilities, macroSlots: 41}, checkActions: true}, macroTap);
    const fewer = {capabilities: {...capabilities, macroSlots: 16}};
    const timed = editProfileDomains(sendsMacro40, fewer, open => {open("behaviors").rows[0].tapHoldTerm = 180;});
    assert.equal(validateSnapshot(timed).behaviors.rows[0].tapHoldTerm, 180);
    assert.throws(() => editProfileDomains(sendsMacro40, {...fewer, checkActions: true}, open => {open("behaviors");}), /macro slot 40/, "a behaviour edit still checks every row");
    // So is the profile it makes: checked as any document is.
    assert.throws(() => editProfileDomains(source, {}, open => {open("rgb").layerColors.pop();}), /does not cover all 16 layers/);
});

test("a change past what the keyboard holds says the profile is full, by the count it went past, and any other refusal is left as it is", () => {
    const {editProfileDomains} = require("../../core/model/portable-profile");
    const {failureSentence, PROFILE_FULL_WORDS} = require("../../core/model/vocabulary");
    const {PROFILE_BLOB_V1} = require("../../core/schema/profile-blob-v1");
    const source = document();
    const overflow = open => {open("macros")[0] = Buffer.alloc(PROFILE_BLOB_V1.MAX_SIZE, 0x41);};
    assert.throws(() => editProfileDomains(source, {}, overflow), error => error.code === "PROFILE_FULL" && failureSentence(error) === PROFILE_FULL_WORDS.profile && error.cause.code === "CAPACITY_EXCEEDED");
    // A name's edit says so in a name's words.
    assert.throws(() => editProfileDomains(source, {full: PROFILE_FULL_WORDS.name}, overflow), error => error.code === "PROFILE_FULL" && error.message === PROFILE_FULL_WORDS.name);
    // A count the format names is said by that count, whatever the edit.
    const rows = validateSnapshot(source).behaviors.rows.length;
    const more = open => {const {rows: all} = open("behaviors"); all.push({...all[0], target: {kind: 1, flags: 0, operand: 0x68}});};
    assert.throws(() => editProfileDomains(source, {full: PROFILE_FULL_WORDS.name, capabilities: {maxBehaviorRows: rows}}, more), error => failureSentence(error) === PROFILE_FULL_WORDS.counts.behaviours(rows));
    // A count the words do not know is the profile as a whole.
    const unknown = Object.assign(new Error("Some table is full."), {code: "CAPACITY_EXCEEDED", limit: "constructor", most: 1});
    assert.throws(() => editProfileDomains(source, {}, () => {throw unknown;}), error => failureSentence(error) === PROFILE_FULL_WORDS.profile && error.cause === unknown);
    const conflict = Object.assign(new Error("Read the keyboard before editing."), {code: "PROFILE_DRAFT_CONFLICT"});
    assert.throws(() => editProfileDomains(source, {}, () => {throw conflict;}), error => error === conflict);
});
