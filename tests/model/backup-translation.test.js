"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const previous = require("../fixtures/previous-profile.charybdis.json");
const {translateBackup, translateProfile, translateDomain, DOMAIN_TRANSLATIONS, PREVIOUS_ACTION_ABI} = require("../../core/model/backup-translation");
const {PROFILE_DOMAIN_IDS, PROFILE_DOMAIN_VERSIONS} = require("../../core/schema/profile-domains");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
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

test("every preceding domain has a step keyed by its produced version", () => {
    assert.deepEqual(Object.entries(DOMAIN_TRANSLATIONS).map(([id, steps]) => [Number(id), Object.keys(steps).map(Number)]), [
        [16, [4, 5]], [32, [2]], [48, [3]], [64, [6, 7]], [80, [3]],
    ]);
    const bytes = Buffer.from(previous.profile, "base64");
    let at = 8;
    for (let n = 0; n < bytes[6]; n++) {
        const id = bytes[at], version = bytes[at + 1], size = bytes.readUInt16LE(at + 2);
        const payload = bytes.subarray(at + 4, at + 4 + size), original = Buffer.from(payload);
        const result = translateDomain({id, version, payload});
        assert.equal(result.version, PROFILE_DOMAIN_VERSIONS[id]);
        assert.ok(Buffer.isBuffer(result.payload));
        assert.deepEqual(payload, original, `domain ${id} leaves its source bytes unchanged`);
        assert.ok(Object.isFrozen(DOMAIN_TRANSLATIONS[id]));
        at += 4 + size;
    }
    assert.ok(Object.isFrozen(DOMAIN_TRANSLATIONS));
});

test("the settings v7 step receives the historical step's version 6 bytes and adds an empty keyboard name", () => {
    const bytes = Buffer.from(previous.profile, "base64");
    let at = 8;
    while (bytes[at] !== PROFILE_DOMAIN_IDS.SETTINGS) at += 4 + bytes.readUInt16LE(at + 2);
    const domain = {id: PROFILE_DOMAIN_IDS.SETTINGS, version: bytes[at + 1], payload: bytes.subarray(at + 4, at + 4 + bytes.readUInt16LE(at + 2))};
    const {decodeSettings} = require("../../core/schema/settings-domain-v1");
    const six = translateDomain(domain, 6);
    assert.equal(six.payload[0], 6);
    let calls = 0;
    const result = translateDomain(domain, 7, {...DOMAIN_TRANSLATIONS[domain.id], 7: payload => {
        calls++;
        assert.deepEqual(payload, six.payload, "the historical step's output is unchanged");
        return DOMAIN_TRANSLATIONS[domain.id][7](payload);
    }});
    assert.equal(calls, 1);
    assert.equal(result.version, 7);
    assert.deepEqual(result.payload, Buffer.concat([Buffer.from([7]), six.payload.subarray(1), Buffer.from([0])]), "version 7, then the same bytes and one empty name");
    const value = decodeSettings(result.payload);
    assert.equal(value.keyboardName, "", "the firmware's built-in name");
    assert.deepEqual(value.names.slice(0, 8), ["Base", "Number", "Symbol", "Navigation", "Pointing", "Function", "Game", "Extra"]);
    assert.equal(value.macroNames.length, 128);
});

test("the settings v7 step refuses a version 6 body that is not well-formed", () => {
    const step = DOMAIN_TRANSLATIONS[PROFILE_DOMAIN_IDS.SETTINGS][7];
    const {encodeSettings} = require("../../core/schema/settings-domain-v1");
    const {settings} = require("../fixtures/portable-profile");
    const seven = encodeSettings({...settings(), customKeyNames: Array(128).fill("k")});
    const six = Buffer.from(seven.subarray(0, -1)); six[0] = 6;
    assert.deepEqual(step(six), seven, "a well-formed v6 body becomes the v7 one");
    const corrupt = (patch) => {const bytes = Buffer.from(six); patch(bytes); return bytes;};
    for (const [label, bytes] of [["v7 header", seven], ["unknown flag", corrupt(b => {b[5] = 2;})], ["eight layers", corrupt(b => {b[1] = 8;})],
        ["short", six.subarray(0, -1)], ["trailing", Buffer.concat([six, Buffer.from([0])])], ["control name", corrupt(b => {b[b.length - 1] = 0x1f;})],
        ["cut UTF-8", corrupt(b => {b[b.length - 1] = 0xc3;})]]) {
        assert.throws(() => step(bytes), {code: "INVALID_PORTABLE_PROFILE"}, label);
    }
});

test("a current-format backup with version 6 settings is brought forward, and a current one is left alone", () => {
    const {translateCurrentBackup} = require("../../core/model/backup-translation");
    const {encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
    const current = document(), blob = decodeProfileBlob(Buffer.from(current.profile, "base64"));
    const named = validateSnapshot(current).settings;
    assert.equal(named.keyboardName, "");
    const older = {...current, profile: encodeProfileBlob({domains: blob.domains.map(domain => domain.id !== PROFILE_DOMAIN_IDS.SETTINGS ? domain
        : {...domain, version: 6, payload: Buffer.concat([Buffer.from([6]), domain.payload.subarray(1, -1)])})}, {domainVersions: {...PROFILE_DOMAIN_VERSIONS, 64: 6}}).toString("base64")};
    assert.throws(() => validateSnapshot(older), "the keyboard does not take version 6 settings");
    const original = structuredClone(older);
    const translated = translateBackup(JSON.stringify(older));
    assert.deepEqual(older, original, "translation never edits its input");
    assert.equal(translated.profile, current.profile, "exactly the current document");
    assert.deepEqual(Object.keys(translated), Object.keys(current));
    assert.equal(translateCurrentBackup(current), current, "a current document is returned as it is");
    assert.equal(translateBackup(translated), translated, "translation is idempotent");
    // Whatever cannot be brought forward is left for validation to refuse.
    for (const unreadable of [{...older, profile: older.profile + "\n"}, {...older, profile: "AAAA"}, {...older, version: 2}, {...older, format: "other"}]) {
        assert.equal(translateCurrentBackup(unreadable), unreadable);
    }
    const before = {...older, profile: encodeProfileBlob({domains: decodeProfileBlob(Buffer.from(older.profile, "base64"), {domainVersions: {...PROFILE_DOMAIN_VERSIONS, 64: 6}}).domains
        .map(domain => domain.id === PROFILE_DOMAIN_IDS.SETTINGS ? {...domain, version: 5} : domain)}, {domainVersions: {...PROFILE_DOMAIN_VERSIONS, 64: 5}}).toString("base64")};
    assert.equal(translateCurrentBackup(before), before, "settings older than the current schema's first are not admitted");
    const broken = {...older, profile: encodeProfileBlob({domains: decodeProfileBlob(Buffer.from(older.profile, "base64"), {domainVersions: {...PROFILE_DOMAIN_VERSIONS, 64: 6}}).domains
        .map(domain => domain.id === PROFILE_DOMAIN_IDS.SETTINGS ? {...domain, payload: domain.payload.subarray(0, -1)} : domain)}, {domainVersions: {...PROFILE_DOMAIN_VERSIONS, 64: 6}}).toString("base64")};
    assert.throws(() => translateBackup(broken), {code: "INVALID_PORTABLE_PROFILE"});
});

test("a later domain version composes every intervening step in order", () => {
    const calls = [], payload = Buffer.from([10]);
    const steps = {4: bytes => {calls.push([4, [...bytes]]); return Buffer.from([bytes[0] + 1]);},
        5: bytes => {calls.push([5, [...bytes]]); return Buffer.from([bytes[0] * 2]);}};
    const result = translateDomain({id: PROFILE_DOMAIN_IDS.RGB, version: 3, payload}, 5, steps);
    assert.deepEqual(result, {id: PROFILE_DOMAIN_IDS.RGB, version: 5, payload: Buffer.from([22])});
    assert.deepEqual(calls, [[4, [10]], [5, [11]]]);
    assert.deepEqual(payload, Buffer.from([10]));
    const current = translateDomain(result, 5, {});
    assert.equal(current.payload, result.payload, "a domain already at its target is not rewritten");
});

test("domain chains refuse missing intermediate steps, unknown targets and downgrades", () => {
    let calls = 0;
    const domain = {id: PROFILE_DOMAIN_IDS.RGB, version: 3, payload: Buffer.from([10])};
    const step = bytes => {calls++; return bytes;};
    for (const [version, target, steps] of [[3, 5, {5: step}], [4, 3, {4: step}], [0, 4, {4: step}], [3, undefined, {}], [3, 4.5, {4: step}]]) {
        assert.throws(() => translateDomain({...domain, version, id: target === undefined ? 255 : domain.id}, target, steps), {
            code: "INVALID_PORTABLE_PROFILE", message: "The backup's profile holds a domain this app cannot translate.",
        });
    }
    assert.equal(calls, 0, "a missing step cannot be skipped in favour of a later one");
    const failure = new Error("bad intermediate payload");
    assert.throws(() => translateDomain(domain, 4, {4: () => {throw failure;}}), error => error === failure);
});

test("the chain preserves the exact preceding fixture document and rejects other version labels", () => {
    const {createHash} = require("node:crypto");
    const {encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
    // Up to settings v6 the translation is the pre-refactor one, byte for
    // byte; the v7 step then adds only the keyboard's empty name.
    const translated = translateBackup(previous), blob = decodeProfileBlob(Buffer.from(translated.profile, "base64"));
    const settings = blob.domains.find(domain => domain.id === PROFILE_DOMAIN_IDS.SETTINGS);
    assert.equal(settings.payload.at(-1), 0, "an empty keyboard name ends the settings");
    const rawPrevious = Buffer.from(previous.profile, "base64");
    const oldRgb = rawPrevious.subarray(12, 12 + rawPrevious.readUInt16LE(10));
    const retainedV4 = translateDomain({id: 16, version: 3, payload: oldRgb}, 4);
    const six = {...translated, profile: encodeProfileBlob({domains: blob.domains.map(domain => domain === settings
        ? {...domain, version: 6, payload: Buffer.concat([Buffer.from([6]), domain.payload.subarray(1, -1)])}
        : domain.id === 16 ? retainedV4 : domain)}, {domainVersions: {...PROFILE_DOMAIN_VERSIONS, 16: 4, 64: 6}}).toString("base64")};
    assert.equal(createHash("sha256").update(JSON.stringify(six)).digest("hex"),
        "3ca7e5d7b6b5ccdcdccafa9c8c15d87a09fcaf99a0f9fdb57bd0d562ee4405c2", "the pre-refactor translated document is byte-for-byte unchanged");
    const bytes = Buffer.from(previous.profile, "base64");
    let at = 8;
    for (let n = 0; n < bytes[6]; n++) {
        const sourceVersion = bytes[at + 1];
        for (const version of [sourceVersion - 1, sourceVersion + 1, 255]) {
            const unsupported = Buffer.from(bytes); unsupported[at + 1] = version;
            assert.throws(() => translateProfile(unsupported), {
                code: "INVALID_PORTABLE_PROFILE", message: "The backup's profile holds a domain this app cannot translate.",
            }, `domain ${bytes[at]} version ${version} is not admitted by schema 2`);
        }
        at += 4 + bytes.readUInt16LE(at + 2);
    }
});

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
    assert.ok(value.combos.rows.every(row => row.enabled && row.allowedLayers === 65535 && row.useOutputBehavior));
    assert.equal(value.settings.comboOutputBehaviors, true, "translated backups keep output behaviours enabled");
    const colours = require("../../core/model/lighting-view").lightingIdentities(value.rgb).layerColors;
    assert.equal(colours.length, 16);
    assert.ok(colours.slice(8).every(row => row.color.v === 0));
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
    assert.deepEqual(decodeProfileBlob(translateProfile(bytes)).domains.map(row => row.version), [5, 2, 3, 7, 3]);
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

test("offline v4 conversion retains a nondefault tap depth after the counted palette disappears", () => {
    const {document} = require("../fixtures/portable-profile");
    const {decodeRgbDomainV1, encodeRgbDomainV1} = require("../../core/schema/rgb-domain-v1");
    const vectors = require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
    const source = document(), blob = decodeProfileBlob(Buffer.from(source.profile, "base64"));
    const rgb = decodeRgbDomainV1(Buffer.from(vectors.conversion[0].v4, "hex"));
    rgb.keyFeedback.tapBranchColors.push(...Array.from({length: 3}, () => ({h: 0, s: 0, v: 0})));
    blob.domains[0] = {id: 16, version: 4, payload: encodeRgbDomainV1(rgb, {tapBranchColorCount: 7})};
    source.profile = encodeProfileBlob(blob, {domainVersions: {16: 4, 32: 2, 48: 3, 64: 7, 80: 3}}).toString("base64");
    const converted = translateBackup(source);
    assert.equal(converted.tapDepth, 8);
    assert.equal(validateSnapshot(converted).rgb.things.find(table => table.kind === 4).default.length, 11);
    assert.equal(translateBackup(converted), converted);
});
