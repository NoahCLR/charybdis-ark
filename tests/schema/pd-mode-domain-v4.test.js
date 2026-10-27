"use strict";
// PD domain v4: the sparse 32-slot format with counted UTF-8 names (D-F14) and
// a layer link in bytes 11..15 (D-F62), against the firmware's golden vectors
// (pd_mode_domain_v4.json), then Ark's own further cases.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../upstream/firmware/tests/fixtures/pd_mode_domain_v1.json");
const golden = require("../../upstream/firmware/tests/fixtures/pd_mode_domain_v4.json");
const {PD_DOMAIN, PD_LINK_ENDS, encodePdDomain, decodePdDomain} = require("../../core/schema/pd-mode-domain-v1");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");

const reject = (fn, code) => assert.throws(fn, error => error.code === code, `expected ${code}`);
const empty = id => ({id, kind: 0, name: ""});
// The version-1 fixture's eight slots without the mouse button overrides
// version 4 retired, then 24 empty ones.
const v1Slots = () => structuredClone(fixture.slots).map(({buttons: _retired, ...slot}) => slot);
const slots32 = () => [...v1Slots(), ...Array.from({length: 24}, (_, index) => empty(index + 8))];
const record = (bytes, index) => bytes.subarray(8 + index * 128, 8 + (index + 1) * 128);
// A version-1 record of the fixture: 96 bytes, its name at 8..31.
const recordV1 = (bytes, index) => bytes.subarray(8 + index * 96, 8 + (index + 1) * 96);

// A vector's stored slots as the dense list Ark edits: the rest are empty.
const denseOf = stored => Array.from({length: golden.slotCount}, (_, id) => structuredClone(stored.find(slot => slot.id === id)) || empty(id));

test("every firmware vector decodes, and its slots encode to exactly its bytes", () => {
    assert.deepEqual([golden.slotCount, golden.recordSize, golden.headerSize], [PD_DOMAIN.SLOTS, 128, 8]);
    assert.deepEqual(golden.valid.map(vector => vector.name), ["empty", "presets", "links", "link-to-layer-0", "gap", "full", "longest-name", "mouse-buttons", "macros"]);
    for (const vector of golden.valid) {
        const bytes = Buffer.from(vector.hex, "hex");
        const decoded = decodePdDomain(bytes);
        assert.equal(decoded.length, 32, vector.name);
        assert.deepEqual(decoded.filter(slot => slot.kind || slot.name).map(slot => slot.id), vector.slots.map(slot => slot.id), vector.name);
        assert.equal(encodePdDomain(denseOf(vector.slots)).toString("hex"), vector.hex, `${vector.name} from its slots`);
        assert.equal(encodePdDomain(decoded).toString("hex"), vector.hex, `${vector.name} round trip`);
    }
    assert.equal(golden.valid.find(vector => vector.name === "full").hex.length / 2, PD_DOMAIN.MAX_SIZE);
    assert.equal(Buffer.byteLength(golden.valid.find(vector => vector.name === "longest-name").slots[0].name), 32);
});

test("every firmware rejection is refused with the firmware's code at its offset", () => {
    assert.ok(golden.invalid.some(vector => vector.error.code === "NONCANONICAL"));
    for (const vector of golden.invalid) {
        assert.throws(() => decodePdDomain(Buffer.from(vector.hex, "hex")),
            error => error.code === vector.error.code && error.offset === vector.error.offset, `${vector.name}: ${vector.error.code} at ${vector.error.offset}`);
    }
});

test("version 1, 2 and 3 payloads are no PD domain the keyboard stores", () => {
    reject(() => decodePdDomain(Buffer.from(fixture.hex, "hex")), "INVALID_HEADER");
    const v4 = Buffer.from(golden.valid[1].hex, "hex");
    for (const version of [1, 2, 3, 5]) {const bytes = Buffer.from(v4); bytes[0] = version; reject(() => decodePdDomain(bytes), "INVALID_HEADER");}
});

test("an empty 32-slot domain is its header alone", () => {
    const encoded = encodePdDomain(Array.from({length: 32}, (_, id) => empty(id)));
    assert.equal(encoded.toString("hex"), "0420800000000000");
    const decoded = decodePdDomain(encoded);
    assert.equal(decoded.length, 32);
    assert.ok(decoded.every((slot, id) => slot.id === id && slot.kind === 0 && slot.name === ""));
    assert.deepEqual(encodePdDomain(decoded), encoded);
});

test("a sparse domain stores only configured and named slots, as the v1 record with its name counted", () => {
    const v1 = Buffer.from(fixture.hex, "hex");
    const value = slots32();
    value[20] = {...structuredClone(value[1]), id: 20, name: "Twenty"};
    value[31] = {id: 31, kind: 0, name: "Kept name"};
    const encoded = encodePdDomain(value);
    const stored = [0, 1, 2, 3, 4, 5, 20, 31];
    assert.deepEqual([...encoded.subarray(0, 8)], [4, 32, 128, stored.length, 0, 0, 0, 0]);
    assert.equal(encoded.length, 8 + 128 * stored.length);
    assert.deepEqual(stored.map((_, index) => record(encoded, index)[0]), stored, "ascending ids");
    for (let id = 0; id < 6; id++) {
        const now = record(encoded, id), before = Buffer.from(recordV1(v1, id));
        // The record bytes stay, less the retired button records (52..69);
        // the name moves to a counted field at 96.
        before.fill(0, 52, 70);
        assert.deepEqual([now.subarray(0, 8), now.subarray(32, 96)], [before.subarray(0, 8), before.subarray(32, 96)], `slot ${id} keeps its v1 record`);
        const name = before.subarray(8, 32).subarray(0, before.subarray(8, 32).indexOf(0));
        assert.equal(now[8], name.length);
        assert.deepEqual(now.subarray(96, 96 + name.length), name);
    }
    const decoded = decodePdDomain(encoded);
    assert.equal(decoded[20].name, "Twenty");
    assert.equal(decoded[20].directions.up.keycode, value[1].directions.up.keycode);
    assert.deepEqual([decoded[31].kind, decoded[31].name], [0, "Kept name"]);
    assert.deepEqual([decoded[7].kind, decoded[7].name], [0, ""]);
    assert.deepEqual(encodePdDomain(decoded), encoded, "round trip");
});

test("all 32 slots configured fill the domain", () => {
    const value = Array.from({length: 32}, (_, id) => ({...v1Slots()[1], id, name: `Mode ${id}`}));
    const encoded = encodePdDomain(value);
    assert.equal(encoded.length, PD_DOMAIN.MAX_SIZE);
    assert.equal(encoded[3], 32);
    const decoded = decodePdDomain(encoded);
    assert.deepEqual(decoded.map(slot => slot.name), value.map(slot => slot.name));
    assert.deepEqual(encodePdDomain(decoded), encoded);
});

test("the v4 decoder rejects noncanonical, unordered, out-of-range and mis-sized records", () => {
    const value = slots32();
    const encoded = () => encodePdDomain(value); // records for ids 0..5
    // A present disabled record without a name.
    const nameless = Buffer.concat([Buffer.from([4, 32, 128, 1, 0, 0, 0, 0]), Buffer.alloc(128)]);
    nameless[8] = 7;
    assert.throws(() => decodePdDomain(nameless), error => error.code === "NONCANONICAL" && error.offset === 9, "at the record's kind byte");
    // Two records out of order, and a repeated id.
    const unordered = encoded(); unordered[8 + 128] = 0;
    reject(() => decodePdDomain(unordered), "INVALID_ID");
    const swapped = encoded(); swapped[8] = 3;
    reject(() => decodePdDomain(swapped), "INVALID_ID");
    // An id past the last slot.
    const high = encodePdDomain(Object.assign(slots32(), {31: {id: 31, kind: 0, name: "Last"}}));
    high[8 + 6 * 128] = 32;
    reject(() => decodePdDomain(high), "INVALID_ID");
    // The length must be 8 + 128 * count.
    reject(() => decodePdDomain(encoded().subarray(0, encoded().length - 1)), "INVALID_LENGTH");
    reject(() => decodePdDomain(Buffer.concat([encoded(), Buffer.alloc(128)])), "INVALID_LENGTH");
    reject(() => decodePdDomain(Buffer.from([4, 32, 128])), "INVALID_LENGTH");
    // Header fields.
    for (const [offset, byte, code] of [[1, 8, "INVALID_HEADER"], [2, 96, "INVALID_HEADER"], [3, 33, "INVALID_HEADER"], [4, 1, "RESERVED"], [7, 1, "RESERVED"]]) {
        const bytes = encoded(); bytes[offset] = byte;
        assert.throws(() => decodePdDomain(bytes), error => error.code === code && error.offset === offset, `header byte ${offset}`);
    }
    // A record keeps the v1 rules.
    const reserved = encoded(); reserved[8 + 7] = 1;
    reject(() => decodePdDomain(reserved), "RESERVED");
    // Bytes 9 and 10, before the link, are zero; so are version 2's name
    // bytes past the link, and the name field after the name.
    const head = encoded(); head[8 + 10] = 1;
    assert.throws(() => decodePdDomain(head), error => error.code === "RESERVED" && error.offset === 8 + 9);
    const oldName = encoded(); oldName[8 + 17] = 0x41;
    assert.throws(() => decodePdDomain(oldName), error => error.code === "RESERVED" && error.offset === 8 + 16);
    const padded = encoded(); padded[8 + 127] = 0x41;
    reject(() => decodePdDomain(padded), "INVALID_NAME");
});

test("the v4 encoder refuses what the keyboard would refuse", () => {
    reject(() => encodePdDomain(slots32().slice(0, 31)), "INVALID_LENGTH");
    const swapped = slots32(); [swapped[8], swapped[9]] = [swapped[9], swapped[8]];
    reject(() => encodePdDomain(swapped), "INVALID_ID");
    const hole = slots32(); delete hole[20];
    reject(() => encodePdDomain(hole), "INVALID_ARGUMENT");
    const unnamed = slots32(); unnamed[20] = {...structuredClone(unnamed[1]), id: 20, name: ""};
    reject(() => encodePdDomain(unnamed), "INVALID_NAME");
    const long = slots32(); long[1].name = "x".repeat(33);
    reject(() => encodePdDomain(long), "INVALID_NAME");
    long[1].name = "é".repeat(16);
    assert.equal(decodePdDomain(encodePdDomain(long))[1].name, "é".repeat(16), "32 bytes of UTF-8 fit");
});

test("a schema-4 blob carries the sparse domain as version 4", () => {
    const payload = encodePdDomain(slots32());
    const blob = encodeProfileBlob({schema: {major: 4, minor: 3}, domains: [{id: 0x50, version: 4, payload}]});
    assert.deepEqual(decodeProfileBlob(blob).domains[0].payload, payload);
});

// A slot as Ark edits it, linked: the link vector's Volume, Brightness and Zoom.
test("a link is what ends it and two layer sets, the layers that start the mode and those its key turns on, in bytes 11..15, and round-trips", () => {
    const vector = golden.valid.find(entry => entry.name === "links");
    const decoded = decodePdDomain(Buffer.from(vector.hex, "hex"));
    const link = slot => [slot.linkedLayers, slot.linkTurnsOn, slot.linkEnds];
    assert.deepEqual([1, 2, 3].map(id => link(decoded[id])), [
        [0, (1 << 5) | (1 << 6), PD_LINK_ENDS.NOTHING],
        [(1 << 6) | (1 << 8), 0, PD_LINK_ENDS.HIGHER_LAYER],
        [(1 << 14) | (1 << 15), (1 << 5) | (1 << 14) | (1 << 15), PD_LINK_ENDS.OTHER_LAYER]]);
    assert.deepEqual(link(decoded[0]), [0, 0, 0], "no link is every link byte zero");
    const value = slots32();
    Object.assign(value[1], {linkedLayers: 0x8201, linkTurnsOn: 0x4210, linkEnds: PD_LINK_ENDS.OTHER_LAYER});
    const bytes = encodePdDomain(value);
    assert.deepEqual([...record(bytes, 1).subarray(9, 16)], [0, 0, 2, 0x01, 0x82, 0x10, 0x42], "both sets little-endian");
    assert.deepEqual(decodePdDomain(bytes)[1], {...decodePdDomain(encodePdDomain(slots32()))[1], linkedLayers: 0x8201, linkTurnsOn: 0x4210, linkEnds: 2});
});

test("the encoder refuses a link the keyboard refuses, at the firmware's offsets", () => {
    /** @param {(value: ReturnType<typeof slots32>) => void} change */
    const encodeWith = change => {const value = slots32(); change(value); return encodePdDomain(value);};
    const refuses = (change, code, offset) => assert.throws(() => encodeWith(change), error => error.code === code && error.offset === offset, `${code} at ${offset}`);
    // Slot 1's record is the second one stored: payload offset 136.
    refuses(value => Object.assign(value[1], {linkedLayers: 1 << 4, linkEnds: 3}), "INVALID_POLICY", 136 + 11);
    // Anything that ends the mode needs layers that start it.
    refuses(value => Object.assign(value[1], {linkEnds: PD_LINK_ENDS.HIGHER_LAYER}), "INVALID_PARAMETER", 136 + 11);
    refuses(value => Object.assign(value[1], {linkTurnsOn: 1 << 3, linkEnds: PD_LINK_ENDS.OTHER_LAYER}), "INVALID_PARAMETER", 136 + 11);
    // A named empty slot keeps no link, not even a key set.
    refuses(value => {value[9] = {id: 9, kind: 0, name: "Spare", linkedLayers: 1 << 2};}, "INVALID_PARAMETER", 8 + 6 * 128 + 2);
    refuses(value => {value[9] = {id: 9, kind: 0, name: "Spare", linkTurnsOn: 1};}, "INVALID_PARAMETER", 8 + 6 * 128 + 2);
    // No layer starts two modes; the later record is refused at its starting layers.
    refuses(value => {Object.assign(value[1], {linkedLayers: 0b110000}); Object.assign(value[3], {linkedLayers: 0b1100000});}, "INVALID_PARAMETER", 8 + 3 * 128 + 12);
    // Only the starting layers are exclusive: keys may turn on any layer,
    // one another slot's key turns on or one that starts another mode.
    assert.doesNotThrow(() => encodeWith(value => {
        Object.assign(value[1], {linkedLayers: 1 << 5, linkTurnsOn: (1 << 3) | (1 << 6), linkEnds: PD_LINK_ENDS.HIGHER_LAYER});
        Object.assign(value[2], {linkTurnsOn: (1 << 3) | (1 << 5)});
        Object.assign(value[3], {linkedLayers: 1 << 6, linkTurnsOn: 1 << 5});
    }));
    assert.doesNotThrow(() => encodeWith(value => Object.assign(value[2], {linkedLayers: 0xffff, linkTurnsOn: 0xffff, linkEnds: PD_LINK_ENDS.OTHER_LAYER})));
});
