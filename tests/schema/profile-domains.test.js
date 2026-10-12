"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {execFileSync} = require("node:child_process");
const {PROFILE_DOMAINS, PROFILE_DOMAIN_IDS, PROFILE_DOMAIN_VERSIONS, PROFILE_WIRE_DOMAINS, PROFILE_DOMAIN_MASK,
    profileDomain, domainCodec, encodeProfileDomains, replaceDomain} = require("../../core/schema/profile-domains");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {validateSnapshot} = require("../../core/model/portable-profile");
const fixture = require("../fixtures/portable-profile");

test("one canonical registry pins every current domain's identity, version, wire bit and model names", () => {
    assert.deepEqual(PROFILE_DOMAINS.map(({name, id, key, readKey, version, wireBit, area}) => ({name, id, key, readKey, version, wireBit, area})), [
        {name: "RGB", id: 16, key: "rgb", readKey: "rgb", version: 4, wireBit: 1, area: "lighting"},
        {name: "KEY_BEHAVIORS", id: 32, key: "behaviors", readKey: "keyBehaviors", version: 2, wireBit: 2, area: "behaviours"},
        {name: "COMBOS", id: 48, key: "combos", readKey: "combos", version: 3, wireBit: 4, area: "combos"},
        {name: "SETTINGS", id: 64, key: "settings", readKey: "settings", version: 6, wireBit: 8, area: "settings"},
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
