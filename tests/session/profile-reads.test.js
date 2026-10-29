"use strict";
// The active payload and keymap reads are tested here on their own, and
// through the service, against a keyboard in recovery, in
// active-profile-reads.test.js.
const assert = require("node:assert/strict");
const test = require("node:test");
const {baseRgbOf, committedRead, layoutOf, layoutRead, readActivePayload, readBaseLighting, readKeymap, requireCurrentRead} = require("../../core/session/profile-reads");
const {connectedService} = require("../fixtures/connected-service");
const {liveKeyboard} = require("../fixtures/live-keyboard");
const {testClock} = require("../fixtures/panel-loop");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {baseLighting} = require("../../core/model/settings-editor");
const {PROFILE_ACTIVE_KIND} = require("../../core/protocol/profile-wire-v1");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, matrixPosition} = require("../../core/data/charybdis-layout");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {compiled, document, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
const {capabilities} = require("../fixtures/portable-restore");
const {PROFILE_DOMAIN_MASK, PROFILE_DOMAIN_IDS} = require("../../core/schema/profile-domains");
const {PROFILE_WIRE_KNOWN_MASKS} = require("../../core/protocol/profile-wire-v1");

test("the layout is each layer's visible keys in layout order, each keycode resolved by the catalog", () => {
    const keymap = Array.from({length: 3}, (_, layer) => Array.from({length: 60}, (_, index) => (layer === 1 && index === matrixPosition(0) ? 0x0004 : 0)));
    const layers = layoutOf(keymap, 2);
    assert.equal(layers.length, 2, "only the layers the keyboard advertises");
    assert.equal(layers[1].positions.length, CHARYBDIS_4X6_LAYOUT_MATRIX.length);
    const [row, column] = CHARYBDIS_4X6_LAYOUT_MATRIX[0];
    assert.deepEqual(layers[1].positions[0], {layoutIndex: 0, row, column, keycode: 0x0004});
    const read = layoutRead(layers);
    assert.equal(read.state, "read");
    assert.equal(read.progress, null);
    assert.equal(read.layers[1].keys[0].resolved.name, "KC_A");
    assert.equal(read.catalog.format, "charybdis-keycode-catalog-v1", "the catalog it was named by");
});

test("a committed readback decodes each domain alone, so one that drifted leaves the others readable", () => {
    const bytes = Buffer.from(compiled().profile, "base64");
    const metadata = {generation: 7, digest: 0x1234, schema: {major: 4, minor: 3}, originHalf: 1};
    const read = committedRead({metadata, bytes}, "committed", CURRENT_CAPABILITIES);
    assert.deepEqual(read.failures, []);
    assert.equal(read.byteLength, bytes.length);
    assert.equal(read.generation, 7);
    assert.ok(read.domains.settings, "the settings domain is read");
    assert.equal(read.domainIds.includes(PROFILE_DOMAIN_IDS.KEYMAP), true);
    const blob = decodeProfileBlob(bytes);
    const broken = encodeProfileBlob({...blob, domains: blob.domains.map(domain => (domain.id === PROFILE_DOMAIN_IDS.SETTINGS ? {...domain, payload: Buffer.alloc(1)} : domain))});
    const drifted = committedRead({metadata, bytes: broken}, "committed", CURRENT_CAPABILITIES);
    assert.deepEqual(drifted.failures.map(failure => failure.domainId), [PROFILE_DOMAIN_IDS.SETTINGS]);
    assert.equal(drifted.domains.settings, undefined);
    assert.ok(Object.keys(drifted.domains).length > 0, "the other domains still read");
});

test("only current firmware is read, and base lighting reads as the effect it runs", () => {
    assert.throws(() => requireCurrentRead(undefined), {code: "FIRMWARE_UPDATE_REQUIRED"});
    assert.equal(requireCurrentRead({...capabilities, supportedDomainMask: PROFILE_DOMAIN_MASK, featureFlags: PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES}), undefined);
    const lighting = {enabled: false, effect: 3, brightness: 100, hue: 1, saturation: 2, speed: 4};
    assert.deepEqual(baseRgbOf(lighting), {effectId: 0, brightness: 100, hue: 1, saturation: 2, speed: 4}, "off is effect 0");
    assert.equal(baseRgbOf({...lighting, enabled: true}).effectId, 3);
});

// The reads a service makes of the keyboard's active payload, taken here
// straight from a connected one: its connection, request ids and reader, and
// each status they read, kept in order.
/** @param {import("node:test").TestContext} t @param {Parameters<typeof connectedService>[1]} [keyboard] */
async function reading(t, keyboard) {
    const {now, sleep} = testClock();
    const connected = await connectedService(t, keyboard, {now, sleep});
    const {service} = connected;
    /** @type {import("../../core/session/types.js").ProfileStatus[]} */
    const statuses = [];
    return {...connected, connection: service.connectedConnection(), statuses,
        options: {nextRequestId: () => service.nextRequestId(), onProgress: () => {}},
        reads: {reader: () => service.profilePayloadReader(), onStatus: (/** @type {import("../../core/session/types.js").ProfileStatus} */ status) => statuses.push(status)}};
}

test("the active payload is the saved profile, or the compiled defaults, confirmed by a status read before and after", async t => {
    const saved = await reading(t, {document: document()});
    const {read, source} = await readActivePayload(saved.connection, saved.options, saved.reads);
    assert.equal(source, "committed");
    assert.ok(read.bytes.equals(Buffer.from(document().profile, "base64")));
    assert.equal(saved.statuses.length, 2, "the status before the read and after it");
    assert.equal(saved.statuses[0].activeKind, PROFILE_ACTIVE_KIND.COMMITTED);
    const defaults = await reading(t, {document: document(), compiledOnly: true});
    assert.equal((await readActivePayload(defaults.connection, defaults.options, defaults.reads)).source, "compiled");
    assert.equal(defaults.statuses[1].activeKind, PROFILE_ACTIVE_KIND.COMPILED_ONLY);
});

test("an active payload is unavailable while the keyboard runs neither: unsaved edits, say", async t => {
    const keyboard = liveKeyboard({document: document()});
    const live = await reading(t, {keyboard});
    keyboard.externalEdit(keyboard.saved);
    await assert.rejects(readActivePayload(live.connection, live.options, live.reads), {code: "ACTIVE_PROFILE_UNAVAILABLE"});
    assert.deepEqual(live.statuses.map(status => status.activeKind), [PROFILE_ACTIVE_KIND.WORKING], "it stops at the status");
});

test("the keymap read is the active profile's keymap, every layer the profile stores", async t => {
    const {connection, options, reads} = await reading(t, {document: document()});
    const keymap = await readKeymap(connection, options, reads);
    assert.deepEqual(keymap, validateSnapshot(document()).layers);
});

test("the base lighting read is the effect the stored settings run", async t => {
    const {connection, service} = await reading(t, {document: document()});
    assert.deepEqual(await readBaseLighting(connection, service.requestSequence()), baseRgbOf(baseLighting(validateSnapshot(document()).settings.values)));
});
