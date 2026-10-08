"use strict";
// PD domain v2: the 32-slot firmware's sparse format, against the firmware's
// golden vectors (pd_mode_domain_v2.json), then Ark's own further cases.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../upstream/firmware/tests/fixtures/pd_mode_domain_v1.json");
const golden = require("../../upstream/firmware/tests/fixtures/pd_mode_domain_v2.json");
const {PD_DOMAIN_V2, encodePdDomain, decodePdDomain} = require("../../core/schema/pd-mode-domain-v1");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");

const reject = (fn, code) => assert.throws(fn, error => error.code === code, `expected ${code}`);
const empty = id => ({id, kind: 0, name: ""});
// The fixture's eight slots, then 24 empty ones.
const slots32 = () => [...structuredClone(fixture.slots), ...Array.from({length: 24}, (_, index) => empty(index + 8))];
const record = (bytes, index) => bytes.subarray(8 + index * 96, 8 + (index + 1) * 96);

// A vector's stored slots as the dense list Ark edits: the rest are empty.
const denseOf = stored => Array.from({length: golden.slotCount}, (_, id) => structuredClone(stored.find(slot => slot.id === id)) || empty(id));

test("every firmware vector decodes, and its slots encode to exactly its bytes", () => {
    assert.deepEqual([golden.slotCount, golden.recordSize, golden.headerSize], [PD_DOMAIN_V2.SLOTS, 96, 8]);
    assert.deepEqual(golden.valid.map(vector => vector.name), ["empty", "presets", "gap", "full"]);
    for (const vector of golden.valid) {
        const bytes = Buffer.from(vector.hex, "hex");
        const decoded = decodePdDomain(bytes);
        assert.equal(decoded.length, 32, vector.name);
        assert.deepEqual(decoded.filter(slot => slot.kind || slot.name).map(slot => slot.id), vector.slots.map(slot => slot.id), vector.name);
        assert.equal(encodePdDomain(denseOf(vector.slots)).toString("hex"), vector.hex, `${vector.name} from its slots`);
        assert.equal(encodePdDomain(decoded).toString("hex"), vector.hex, `${vector.name} round trip`);
    }
    assert.equal(golden.valid.find(vector => vector.name === "full").hex.length / 2, PD_DOMAIN_V2.MAX_SIZE);
});

test("every firmware rejection is refused with the firmware's code at its offset", () => {
    assert.ok(golden.invalid.some(vector => vector.error.code === "NONCANONICAL"));
    for (const vector of golden.invalid) {
        assert.throws(() => decodePdDomain(Buffer.from(vector.hex, "hex")),
            error => error.code === vector.error.code && error.offset === vector.error.offset, `${vector.name}: ${vector.error.code} at ${vector.error.offset}`);
    }
});

test("a version-1 payload is no PD domain the keyboard stores", () => {
    reject(() => decodePdDomain(Buffer.from(fixture.hex, "hex")), "INVALID_HEADER");
    const v2 = Buffer.from(golden.valid[1].hex, "hex");
    for (const version of [1, 3]) {const bytes = Buffer.from(v2); bytes[0] = version; reject(() => decodePdDomain(bytes), "INVALID_HEADER");}
});

test("an empty 32-slot domain is its header alone", () => {
    const encoded = encodePdDomain(Array.from({length: 32}, (_, id) => empty(id)));
    assert.equal(encoded.toString("hex"), "0220600000000000");
    const decoded = decodePdDomain(encoded);
    assert.equal(decoded.length, 32);
    assert.ok(decoded.every((slot, id) => slot.id === id && slot.kind === 0 && slot.name === ""));
    assert.deepEqual(encodePdDomain(decoded), encoded);
});

test("a sparse domain stores only configured and named slots, as the v1 record bytes", () => {
    const v1 = Buffer.from(fixture.hex, "hex");
    const value = slots32();
    value[20] = {...structuredClone(value[1]), id: 20, name: "Twenty"};
    value[31] = {id: 31, kind: 0, name: "Kept name"};
    const encoded = encodePdDomain(value);
    const stored = [0, 1, 2, 3, 4, 5, 20, 31];
    assert.deepEqual([...encoded.subarray(0, 8)], [2, 32, 96, stored.length, 0, 0, 0, 0]);
    assert.equal(encoded.length, 8 + 96 * stored.length);
    assert.deepEqual(stored.map((_, index) => record(encoded, index)[0]), stored, "ascending ids");
    for (let id = 0; id < 6; id++) assert.deepEqual(record(encoded, id), record(v1, id), `slot ${id} keeps its v1 record`);
    const decoded = decodePdDomain(encoded);
    assert.equal(decoded[20].name, "Twenty");
    assert.equal(decoded[20].directions.up.keycode, value[1].directions.up.keycode);
    assert.deepEqual([decoded[31].kind, decoded[31].name], [0, "Kept name"]);
    assert.deepEqual([decoded[7].kind, decoded[7].name], [0, ""]);
    assert.deepEqual(encodePdDomain(decoded), encoded, "round trip");
});

test("all 32 slots configured fill the domain", () => {
    const value = Array.from({length: 32}, (_, id) => ({...structuredClone(fixture.slots[1]), id, name: `Mode ${id}`}));
    const encoded = encodePdDomain(value);
    assert.equal(encoded.length, PD_DOMAIN_V2.MAX_SIZE);
    assert.equal(encoded[3], 32);
    const decoded = decodePdDomain(encoded);
    assert.deepEqual(decoded.map(slot => slot.name), value.map(slot => slot.name));
    assert.deepEqual(encodePdDomain(decoded), encoded);
});

test("the v2 decoder rejects noncanonical, unordered, out-of-range and mis-sized records", () => {
    const value = slots32();
    const encoded = () => encodePdDomain(value); // records for ids 0..5
    // A present disabled record without a name.
    const nameless = Buffer.concat([Buffer.from([2, 32, 96, 1, 0, 0, 0, 0]), Buffer.alloc(96)]);
    nameless[8] = 7;
    assert.throws(() => decodePdDomain(nameless), error => error.code === "NONCANONICAL" && error.offset === 9, "at the record's kind byte");
    // Two records out of order, and a repeated id.
    const unordered = encoded(); unordered[8 + 96] = 0;
    reject(() => decodePdDomain(unordered), "INVALID_ID");
    const swapped = encoded(); swapped[8] = 3;
    reject(() => decodePdDomain(swapped), "INVALID_ID");
    // An id past the last slot.
    const high = encodePdDomain(Object.assign(slots32(), {31: {id: 31, kind: 0, name: "Last"}}));
    high[8 + 6 * 96] = 32;
    reject(() => decodePdDomain(high), "INVALID_ID");
    // The length must be 8 + 96 * count.
    reject(() => decodePdDomain(encoded().subarray(0, encoded().length - 1)), "INVALID_LENGTH");
    reject(() => decodePdDomain(Buffer.concat([encoded(), Buffer.alloc(96)])), "INVALID_LENGTH");
    reject(() => decodePdDomain(Buffer.from([2, 32, 96])), "INVALID_LENGTH");
    // Header fields.
    for (const [offset, byte, code] of [[1, 8, "INVALID_HEADER"], [2, 95, "INVALID_HEADER"], [3, 33, "INVALID_HEADER"], [4, 1, "RESERVED"], [7, 1, "RESERVED"]]) {
        const bytes = encoded(); bytes[offset] = byte;
        assert.throws(() => decodePdDomain(bytes), error => error.code === code && error.offset === offset, `header byte ${offset}`);
    }
    // A record keeps the v1 rules.
    const reserved = encoded(); reserved[8 + 7] = 1;
    reject(() => decodePdDomain(reserved), "RESERVED");
});

test("the v2 encoder refuses what the keyboard would refuse", () => {
    reject(() => encodePdDomain(slots32().slice(0, 31)), "INVALID_LENGTH");
    const swapped = slots32(); [swapped[8], swapped[9]] = [swapped[9], swapped[8]];
    reject(() => encodePdDomain(swapped), "INVALID_ID");
    const hole = slots32(); delete hole[20];
    reject(() => encodePdDomain(hole), "INVALID_ARGUMENT");
    const unnamed = slots32(); unnamed[20] = {...structuredClone(unnamed[1]), id: 20, name: ""};
    reject(() => encodePdDomain(unnamed), "INVALID_NAME");
});

test("a schema-2 blob carries the sparse domain as version 2", () => {
    const payload = encodePdDomain(slots32());
    const blob = encodeProfileBlob({schema: {major: 2, minor: 0}, domains: [{id: 0x50, version: 2, payload}]});
    assert.deepEqual(decodeProfileBlob(blob).domains[0].payload, payload);
});

test("the firmware's compiled profile carries the presets vector and the compiled RGB v3 domain", () => {
    const fs = require("node:fs"), path = require("node:path");
    const text = fs.readFileSync(path.resolve(__dirname, "../../upstream/firmware/tests/fixtures/compiled_profile_pd_v2.fixture"), "utf8");
    const blob = decodeProfileBlob(Buffer.from(text.match(/^profile.full.hex=(.+)$/m)[1], "hex"));
    const pd = blob.domains.find(domain => domain.id === 0x50), rgb = blob.domains.find(domain => domain.id === 0x10);
    assert.equal(pd.version, 2);
    assert.equal(pd.payload.toString("hex"), golden.valid.find(vector => vector.name === "presets").hex);
    assert.equal(rgb.version, 3);
    const rgbVectors = require("../../upstream/firmware/tests/fixtures/rgb_domain_v3.json");
    assert.equal(rgb.payload.toString("hex"), rgbVectors.valid.find(vector => vector.name === "compiled").hex);
    const {ACTION_ABI} = require("../../core/schema/actions");
    assert.equal(parseInt(text.match(/^profile.action_abi=(.+)$/m)[1], 16), ACTION_ABI, "the vocabulary Ark knows");
});
