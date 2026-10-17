"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {execFileSync} = require("node:child_process");
const {PROFILE_DOMAINS, PROFILE_DOMAIN_IDS, PROFILE_DOMAIN_VERSIONS, READABLE_DOMAIN_VERSIONS, PROFILE_WIRE_DOMAINS, PROFILE_DOMAIN_MASK,
    profileDomain, domainCodec, encodeProfileDomains, replaceDomain} = require("../../core/schema/profile-domains");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {validateSnapshot} = require("../../core/model/portable-profile");
const fixture = require("../fixtures/portable-profile");

test("one canonical registry pins every current domain's identity, version, wire bit and model names", () => {
    assert.deepEqual(PROFILE_DOMAINS.map(({name, id, key, readKey, version, wireBit, area}) => ({name, id, key, readKey, version, wireBit, area})), [
        {name: "RGB", id: 16, key: "rgb", readKey: "rgb", version: 4, wireBit: 1, area: "lighting"},
        {name: "KEY_BEHAVIORS", id: 32, key: "behaviors", readKey: "keyBehaviors", version: 2, wireBit: 2, area: "behaviours"},
        {name: "COMBOS", id: 48, key: "combos", readKey: "combos", version: 3, wireBit: 4, area: "combos"},
        {name: "SETTINGS", id: 64, key: "settings", readKey: "settings", version: 8, wireBit: 8, area: "settings"},
        {name: "PD_MODES", id: 80, key: "pdModes", readKey: "pdModes", version: 3, wireBit: 16, area: "pointing"},
    ]);
    assert.equal(PROFILE_DOMAIN_MASK, 31);
    assert.equal(require("../../core/protocol/profile-wire-v1").PROFILE_WIRE_DOMAINS, PROFILE_WIRE_DOMAINS);
    assert.equal(require("../../core/schema/profile-blob-v1").PROFILE_DOMAIN_VERSIONS, PROFILE_DOMAIN_VERSIONS);
    assert.ok(Object.isFrozen(PROFILE_DOMAINS));
    for (const domain of PROFILE_DOMAINS) {
        assert.ok(Object.isFrozen(domain));
        assert.equal(profileDomain(domain.id), domain);
        assert.equal(domainCodec(domain.key), domain);
        assert.equal(PROFILE_DOMAIN_IDS[domain.name], domain.id);
        assert.equal(PROFILE_DOMAIN_VERSIONS[domain.id], domain.version);
        assert.equal(PROFILE_WIRE_DOMAINS[domain.name], domain.wireBit);
    }
    assert.equal(profileDomain(0xff), undefined);
});

test("registered codecs round-trip every fixture domain without changing canonical bytes", () => {
    const snapshot = validateSnapshot(fixture.document());
    const blob = decodeProfileBlob(snapshot.profile);
    const versions = [require("../../core/schema/rgb-domain-v1").RGB_DOMAIN_V1.DOMAIN_VERSION,
        require("../../core/schema/key-behavior-domain-v1").KEY_BEHAVIOR_DOMAIN_V1.VERSION,
        require("../../core/schema/combo-domain-v1").COMBO_DOMAIN_VERSION,
        require("../../core/schema/settings-domain-v1").SETTINGS.VERSION,
        require("../../core/schema/pd-mode-domain-v1").PD_DOMAIN.VERSION];
    assert.deepEqual(versions, PROFILE_DOMAINS.map(domain => domain.version));
    for (const domain of blob.domains) {
        const codec = profileDomain(domain.id), value = codec.decode(domain.payload, snapshot.codecOptions);
        assert.deepEqual(value, snapshot[codec.key], codec.key);
        assert.deepEqual(codec.encode(value, snapshot.codecOptions), domain.payload, codec.key);
    }
    assert.deepEqual(encodeProfileBlob({domains: encodeProfileDomains(snapshot, snapshot.codecOptions)}), snapshot.profile);
});

// Each domain's error identity as it stands: the codecs share the canonical
// check, not an error class, so these are pinned rather than unified.
const ERROR_NAMES = {rgb: ["RgbDomainProtocolError"], behaviors: ["ProfileBlobProtocolError"], combos: ["Error", "ProfileBlobProtocolError"], settings: ["Error"], pdModes: ["Error"]};
// One encoding of each domain that its encoder would never write, made from
// the fixture's own payload, and the refusal it meets.
const NONCANONICAL = {
    // The two LED groups swapped: ids still count from zero, but the
    // dictionary is not in bitmap order.
    rgb: payload => {
        const bytes = Buffer.from(payload);
        payload.copy(bytes, 17, 26, 34); payload.copy(bytes, 26, 17, 25);
        return {bytes, refusal: {name: "RgbDomainProtocolError", code: "NONCANONICAL"}};
    },
    // The first two rows swapped out of target order.
    behaviors: payload => {
        const first = payload.readUInt16LE(4) + 2;
        const second = payload.readUInt16LE(4 + first) + 2;
        const bytes = Buffer.concat([payload.subarray(0, 4), payload.subarray(4 + first, 4 + first + second), payload.subarray(4, 4 + first), payload.subarray(4 + first + second)]);
        return {bytes, refusal: {name: "ProfileBlobProtocolError", code: "ROW_ORDER"}};
    },
    // The one combo's second input repeating its first.
    combos: payload => {
        const bytes = Buffer.from(payload);
        payload.copy(bytes, 24, 20, 24);
        return {bytes, refusal: {name: "Error", code: "INVALID_COMBO_DOMAIN", message: "Combo inputs must be distinct."}};
    },
    // Layer 0's name "Base" with its B written as an overlong UTF-8 sequence.
    settings: payload => {
        const {SETTINGS} = require("../../core/schema/settings-domain-v1");
        const at = SETTINGS.FIXED_SIZE, length = payload[at];
        const bytes = Buffer.concat([payload.subarray(0, at), Buffer.from([length + 1, 0xc1, 0x80 | (payload[at + 1] & 0x3f)]), payload.subarray(at + 2)]);
        return {bytes, refusal: {name: "Error", code: "INVALID_SETTINGS", message: "Invalid name encoding."}};
    },
    // A disabled, nameless slot 31 stored as a record instead of left out.
    pdModes: payload => {
        const record = Buffer.alloc(128); record[0] = 31;
        const bytes = Buffer.concat([payload, record]); bytes[3] += 1;
        return {bytes, refusal: {name: "Error", code: "NONCANONICAL", offset: payload.length + 1}};
    },
};

test("every registered codec decodes bytes to a value, encodes it back exactly, and refuses a noncanonical encoding", () => {
    const snapshot = validateSnapshot(fixture.document());
    const blob = decodeProfileBlob(snapshot.profile);
    assert.deepEqual(Object.keys(NONCANONICAL), PROFILE_DOMAINS.map(domain => domain.key));
    for (const codec of PROFILE_DOMAINS) {
        const payload = /** @type {Buffer} */ (blob.domains.find(domain => domain.id === codec.id)?.payload);
        assert.equal(typeof codec.decode, "function", codec.key);
        assert.equal(typeof codec.encode, "function", codec.key);
        for (const options of [snapshot.codecOptions, undefined]) {
            const value = codec.decode(payload, options);
            const bytes = codec.encode(value, options);
            assert.ok(Buffer.isBuffer(bytes), codec.key);
            assert.deepEqual(bytes, payload, codec.key);
            assert.deepEqual(codec.decode(bytes, options), value, codec.key);
        }
        const {bytes, refusal} = NONCANONICAL[codec.key](payload);
        assert.notDeepEqual(bytes, payload, codec.key);
        assert.throws(() => codec.decode(bytes, snapshot.codecOptions), refusal, codec.key);
    }
});

test("every registered codec accepts only bytes it would write itself, and refuses the rest with a stable code", () => {
    const snapshot = validateSnapshot(fixture.document());
    const blob = decodeProfileBlob(snapshot.profile);
    for (const codec of PROFILE_DOMAINS) {
        const payload = /** @type {Buffer} */ (blob.domains.find(domain => domain.id === codec.id)?.payload);
        let accepted = 0, refused = 0;
        for (let at = 0; at < payload.length; at++) {
            for (const value of new Set([0, 0xff, (payload[at] + 1) & 0xff])) {
                if (value === payload[at]) continue;
                const bytes = Buffer.from(payload); bytes[at] = value;
                let decoded;
                try {decoded = codec.decode(bytes, snapshot.codecOptions);} catch (error) {
                    refused++;
                    assert.ok(error instanceof Error && ERROR_NAMES[codec.key].includes(error.name), `${codec.key} byte ${at}: ${error}`);
                    assert.equal(typeof /** @type {{code?: unknown}} */ (error).code, "string", `${codec.key} byte ${at}: ${error.message}`);
                    continue;
                }
                accepted++;
                assert.deepEqual(codec.encode(decoded, snapshot.codecOptions), bytes, `${codec.key} byte ${at} = ${value}`);
            }
        }
        assert.ok(accepted > 0 && refused > 0, codec.key);
    }
});

test("metadata can be imported before any codec, avoiding partially initialized envelope imports", () => {
    const source = `const assert = require('node:assert/strict');
        const registry = require('./core/schema/profile-domains');
        assert.equal(require.cache[require.resolve('./core/schema/profile-blob-v1')], undefined);
        assert.equal(require.cache[require.resolve('./core/schema/rgb-domain-v1')], undefined);
        const fixture = require('./tests/fixtures/portable-profile').document();
        const portable = require('./core/model/portable-profile');
        const value = portable.validateSnapshot(fixture);
        assert.equal(registry.domainCodec('rgb').decode(registry.encodeProfileDomains(value)[0].payload).layerColors.length, 16);`;
    execFileSync(process.execPath, ["-e", source], {cwd: require("node:path").resolve(__dirname, "../..")});
});

test("replacing a domain preserves every other envelope and lets the caller retain capacity error wording", () => {
    const snapshot = validateSnapshot(fixture.document());
    let calls = 0;
    const changed = replaceDomain(snapshot.profile, PROFILE_DOMAIN_IDS.SETTINGS, payload => {
        calls++;
        const settings = domainCodec("settings").decode(payload);
        settings.names[1] = "New name";
        return domainCodec("settings").encode(settings);
    });
    assert.equal(calls, 1);
    const before = decodeProfileBlob(snapshot.profile), after = decodeProfileBlob(changed);
    assert.deepEqual(after.domains.filter(row => row.id !== PROFILE_DOMAIN_IDS.SETTINGS), before.domains.filter(row => row.id !== PROFILE_DOMAIN_IDS.SETTINGS));
    assert.equal(validateSnapshot({...snapshot.document, profile: changed.toString("base64")}).settings.names[1], "New name");
    assert.deepEqual(replaceDomain(snapshot.profile, 0xff, () => {throw new Error("must not run");}), snapshot.profile);
    const capacityError = Object.assign(new Error("The name does not fit."), {code: "PROFILE_FULL"});
    assert.throws(() => replaceDomain(snapshot.profile, PROFILE_DOMAIN_IDS.SETTINGS, payload => payload, () => {throw capacityError;}), error => error === capacityError);
});

test("a live keyboard's older domain versions are readable, and never a newer one", () => {
    for (const domain of PROFILE_DOMAINS) {
        assert.deepEqual(READABLE_DOMAIN_VERSIONS[domain.id], Array.from({length: domain.version}, (_, index) => index + 1), domain.name);
    }
    assert.ok(READABLE_DOMAIN_VERSIONS[PROFILE_DOMAIN_IDS.SETTINGS].includes(7), "settings v7, before custom-key shortcuts (D-L63)");
    assert.ok(!READABLE_DOMAIN_VERSIONS[PROFILE_DOMAIN_IDS.SETTINGS].includes(PROFILE_DOMAIN_VERSIONS[PROFILE_DOMAIN_IDS.SETTINGS] + 1));
});
