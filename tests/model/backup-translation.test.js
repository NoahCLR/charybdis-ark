"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const previous = require("../fixtures/previous-profile.charybdis.json");
const {translateBackup, translateProfile, PREVIOUS_ACTION_ABI} = require("../../core/model/backup-translation");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {document} = require("../fixtures/portable-profile");

function changedDomain(id, change) {
    const bytes = Buffer.from(previous.profile, "base64"), parts = [bytes.subarray(0, 8)];
    let at = 8;
    for (let n = 0; n < bytes[6]; n++) {
        const size = bytes.readUInt16LE(at + 2), envelope = Buffer.from(bytes.subarray(at, at + 4));
        let payload = Buffer.from(bytes.subarray(at + 4, at + 4 + size));
        if (bytes[at] === id) payload = change(payload) || payload;
        envelope.writeUInt16LE(payload.length, 2); parts.push(envelope, payload); at += size + 4;
    }
    return {...structuredClone(previous), profile: Buffer.concat(parts).toString("base64")};
}

test("invalid preceding capacities and semantic references reject before expansion", () => {
    const overCount = changedDomain(48, p => {p[0] = 33; return Buffer.concat([p.subarray(0, 8), ...Array.from({length: 33}, () => p.subarray(8, 36))]);});
    assert.throws(() => translateBackup(overCount), {code: "INVALID_PORTABLE_PROFILE"});
    for (const [kind, operand] of [[7, 64], [6, 64], [2, 8], [3, 8]]) {
        const bad = changedDomain(48, p => {p[16] = kind; p[17] = 0; p.writeUInt16LE(operand, 18);});
        const original = structuredClone(bad);
        assert.throws(() => translateBackup(bad), {code: "INVALID_PORTABLE_PROFILE"});
        assert.deepEqual(bad, original);
    }
    const last = changedDomain(48, p => {p[16] = 7; p[17] = 0; p.writeUInt16LE(63, 18);});
    assert.equal(validateSnapshot(translateBackup(last)).combos.rows[0].output.operand, 63);
});

test("preceding names, settings and macro bank keep their original admission limits", () => {
    for (const id of [5, 9, 23]) {
        const bad = changedDomain(64, p => {p.writeUInt32LE(id === 23 ? 256 : 8, 8 + id * 4);});
        assert.throws(() => translateBackup(bad), {code: "INVALID_PORTABLE_PROFILE"});
    }
    for (const name of [Buffer.alloc(21, 65), Buffer.from("é")]) {
        const bad = changedDomain(64, p => Buffer.concat([p.subarray(0, 312), Buffer.from([name.length]), name, p.subarray(313)]));
        assert.throws(() => translateBackup(bad), {code: "INVALID_PORTABLE_PROFILE"});
    }
    const badMacros = {...structuredClone(previous), macros: Array(64).fill("")};
    badMacros.macros[0] = Buffer.alloc(7191 - 64, 65).toString("base64");
    assert.throws(() => translateBackup(badMacros), {code: "INVALID_PORTABLE_PROFILE"});
});

test("the previous complete backup preserves its keys, names, macros and definitions with permissive policies", () => {
    const original = structuredClone(previous);
    const translated = translateBackup(JSON.stringify(previous)), value = validateSnapshot(translated);
    assert.deepEqual(previous, original, "translation never edits its input");
    assert.equal(translated.version, 3); assert.equal(translated.layers.length, 16); assert.equal(translated.macros.length, 128);
    assert.deepEqual(translated.macros.slice(0, 64), previous.macros);
    assert.ok(translated.macros.slice(64).every(slot => slot === ""));
    previous.layers.forEach((layer, i) => assert.deepEqual(translated.layers[i], layer.map(code => code >= 0x7e40 && code <= 0x7e7f ? code + 0xc0 : code)));
    assert.deepEqual(value.settings.names.slice(0, 8), ["Base", "Number", "Symbol", "Navigation", "Pointing", "Function", "Game", "Extra"]);
    assert.ok(value.settings.names.slice(8).every(name => name === ""));
    assert.deepEqual(value.settings.values.slice(27), [0, 1, 65535, 65535]);
    assert.ok(value.settings.layers.every(row => !row.bypass.length && !row.exclude.length));
    assert.ok(value.behaviors.rows.every(row => row.enabled && row.allowedLayers === 65535));
    assert.ok(value.combos.rows.every(row => row.enabled && row.allowedLayers === 65535));
    assert.equal(value.rgb.layerColors.length, 16);
    assert.ok(value.rgb.layerColors.slice(8).every(row => row.color.v === 0));
    assert.equal(value.pdModes.length, 32);
    const old = Buffer.from(previous.profile, "base64");
    let at = 8;
    const payloads = {};
    for (let n = 0; n < old[6]; n++) {const size = old.readUInt16LE(at + 2); payloads[old[at]] = old.subarray(at + 4, at + 4 + size); at += size + 4;}
    assert.equal(value.behaviors.rows.length, payloads[32][0]); assert.equal(value.combos.rows.length, payloads[48][0]);
    assert.equal(translateBackup(translated), translated, "translation is idempotent");
});

test("native custom values move in behaviour targets and combo inputs and outputs by stable slot", () => {
    const value = structuredClone(previous), bytes = Buffer.from(value.profile, "base64");
    const parts = [Buffer.from(bytes.subarray(0, 8))];
    let at = 8;
    for (let n = 0; n < bytes[6]; n++) {
        const size = bytes.readUInt16LE(at + 2), id = bytes[at];
        let payload = Buffer.from(bytes.subarray(at + 4, at + 4 + size));
        if (id === 32) {
            const rowSize = payload.readUInt16LE(4);
            const row = Buffer.from(payload.subarray(4, 6 + rowSize));
            row[2] = 1; row.writeUInt16LE(0x7e7f, 4);
            payload = Buffer.concat([Buffer.from([1, row[13], 0, 0]), row]);
        }
        if (id === 48) {payload[16] = 1; payload.writeUInt16LE(0x7e40, 18); payload[20] = 1; payload.writeUInt16LE(0x7e7f, 22);}
        const envelope = Buffer.from(bytes.subarray(at, at + 4)); envelope.writeUInt16LE(payload.length, 2);
        parts.push(envelope, payload); at += size + 4;
    }
    value.profile = Buffer.concat(parts).toString("base64");
    const translated = validateSnapshot(translateBackup(value));
    assert.ok(translated.behaviors.rows.some(row => row.target.kind === 1 && row.target.operand === 0x7f3f), JSON.stringify(translated.behaviors.rows.map(row => row.target)));
    assert.equal(translated.combos.rows[0].output.operand, 0x7f00);
    assert.equal(translated.combos.rows[0].inputs[0].operand, 0x7f3f);
});

test("only the known preceding contract translates, and corrupt input is rejected", () => {
    const current = document(); assert.equal(translateBackup(current), current);
    const unknown = {...previous, actionAbiDigest: PREVIOUS_ACTION_ABI + 1}; assert.equal(translateBackup(unknown), unknown);
    assert.throws(() => translateBackup({...previous, layers: previous.layers.slice(1)}));
    const bytes = Buffer.from(previous.profile, "base64");
    assert.throws(() => translateProfile(bytes.subarray(0, -1)));
    assert.throws(() => translateProfile(Buffer.concat([bytes, Buffer.from([0])])));
    assert.throws(() => translateProfile(Buffer.alloc(8)));
    assert.deepEqual(decodeProfileBlob(translateProfile(bytes)).domains.map(row => row.version), [4, 2, 3, 6, 3]);
});

test("translation rejects nonnumeric keycodes and unsupported bytes instead of normalizing them away", () => {
    const value = structuredClone(previous);
    value.layers[0][0] = "32320"; // Looks like an old custom key, but is not a u16.
    assert.throws(() => translateBackup(value), {code: "INVALID_PORTABLE_PROFILE"});
    assert.throws(() => translateBackup({...previous, profile: previous.profile + "\n"}), {code: "INVALID_PORTABLE_PROFILE"});
    for (const id of [48, 80]) {
        const bytes = Buffer.from(previous.profile, "base64");
        let at = 8;
        while (bytes[at] !== id) at += 4 + bytes.readUInt16LE(at + 2);
        bytes[at + 4 + (id === 48 ? 12 : 4)] = 1; // Reserved row/header byte.
        assert.throws(() => translateBackup({...previous, profile: bytes.toString("base64")}), {code: "INVALID_PORTABLE_PROFILE"});
    }
});
