"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {MACRO_DOMAIN_V1, encodeMacroDomain, decodeMacroDomain, macroDomainSize} = require("../../core/schema/macro-domain-v1");
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");

/** @param {string} name */
const fixtureDomain = name => {
    const text = fs.readFileSync(path.resolve(__dirname, `../../upstream/firmware/tests/fixtures/${name}`), "utf8");
    return decodeProfileBlob(Buffer.from(/** @type {RegExpMatchArray} */ (text.match(/^profile\.hex=(.+)$/m))[1], "hex")).domains.find(domain => domain.id === 0x70);
};
const reject = (fn, code) => assert.throws(fn, error => error.code === code);
const empty = () => Array.from({length: 128}, () => Buffer.alloc(0));

test("the macro domain is the 128 macros, each ended by a zero, slot 0 first", () => {
    assert.equal(MACRO_DOMAIN_V1.SLOTS, 128);
    assert.equal(MACRO_DOMAIN_V1.MAX_SIZE, 34903);
    assert.deepEqual(encodeMacroDomain(empty()), Buffer.alloc(128), "every slot its terminator alone");
    const macros = empty();
    macros[0] = Buffer.from("hi");
    macros[1] = Buffer.from([1, 5, 1, 0x61, 1, 1, 0x04, 1, 4, 0x31, 0x30, 0x7c, 0xc3, 0xa9]);
    macros[127] = Buffer.from([1, 2, 0xe1, 0x61, 1, 3, 0xe1]);
    const bytes = encodeMacroDomain(macros);
    assert.equal(bytes.length, macroDomainSize(macros));
    assert.deepEqual([...bytes.subarray(0, 3)], [0x68, 0x69, 0]);
    assert.deepEqual(decodeMacroDomain(bytes), macros);
});

test("both firmware fixtures' macro banks decode, and the canonical encoding is their macros and terminators", () => {
    for (const name of ["populated_profile_v4.fixture", "maximum_profile_v4.fixture"]) {
        const domain = fixtureDomain(name);
        assert.ok(domain, name);
        assert.equal(domain.version, 1, name);
        const macros = decodeMacroDomain(domain.payload);
        assert.equal(macros.length, 128, name);
        const canonical = encodeMacroDomain(macros);
        assert.deepEqual(canonical, domain.payload.subarray(0, canonical.length), `${name}: the macros are the bank's first bytes`);
        assert.ok(domain.payload.subarray(canonical.length).every((byte, index, tail) => index < tail.length - 1 || byte === 0), name);
    }
    assert.equal(fixtureDomain("maximum_profile_v4.fixture")?.payload.length, 34903, "the maximum profile fills the bank");
});

test("unused capacity after the 128th terminator is accepted while the bank ends in zero, and never returned", () => {
    const macros = empty(); macros[3] = Buffer.from("abc");
    const bytes = Buffer.concat([encodeMacroDomain(macros), Buffer.from("stale"), Buffer.alloc(1)]);
    assert.deepEqual(decodeMacroDomain(bytes), macros);
    reject(() => decodeMacroDomain(Buffer.concat([encodeMacroDomain(macros), Buffer.from("stale")])), "UNFINISHED");
});

test("the firmware's grammar is checked byte by byte", () => {
    const valid = [
        [0x41], [1, 1, 4], [1, 2, 0xe1, 1, 3, 0xe1], [1, 4, 0x35, 0x7c], [1, 4], [1, 4, 0x39, 0x01], [1, 5, 2, 0x41],
        [0xc2, 0xa0], [0xe2, 0x82, 0xac], [0xf0, 0x9f, 0x98, 0x80], [0x7f],
    ];
    for (const bytes of valid) {
        const macros = empty(); macros[0] = Buffer.from(bytes);
        assert.deepEqual(decodeMacroDomain(encodeMacroDomain(macros))[0], Buffer.from(bytes), bytes.join());
    }
    const invalid = [
        [1], [1, 0], [1, 6, 4], [1, 1], [1, 1, 0], [0x41, 1, 5, 1], [1, 5, 3], [1, 5],
        [0x80], [0xc0, 0x80], [0xc2, 0x9f], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xf5, 0x80, 0x80, 0x80], [0xe2, 0x82],
    ];
    for (const bytes of invalid) {
        const macros = empty(); macros[5] = Buffer.from(bytes);
        reject(() => encodeMacroDomain(macros), "INVALID_MACRO");
        const domain = Buffer.concat([Buffer.alloc(5), Buffer.from(bytes), Buffer.alloc(123)]);
        assert.throws(() => decodeMacroDomain(domain), /Macro 5|terminator/, bytes.join());
    }
});

test("a macro domain with too few macros, too many bytes or a zero inside a macro is refused", () => {
    reject(() => decodeMacroDomain(Buffer.alloc(127)), "MISSING_TERMINATOR");
    reject(() => decodeMacroDomain(Buffer.alloc(0)), "INVALID_LENGTH");
    reject(() => decodeMacroDomain(Buffer.alloc(34904)), "INVALID_LENGTH");
    assert.equal(decodeMacroDomain(Buffer.alloc(34903)).length, 128);
    reject(() => encodeMacroDomain(Array(128)), "INVALID_MACRO");
    reject(() => encodeMacroDomain(empty().slice(1)), "INVALID_SLOTS");
    const zero = empty(); zero[9] = Buffer.from([0x41, 0, 0x42]);
    reject(() => encodeMacroDomain(zero), "INVALID_MACRO");
    const full = empty(); full[0] = Buffer.alloc(34903 - 128, 0x41);
    assert.equal(encodeMacroDomain(full).length, 34903, "34,775 bytes of text and 128 terminators fill it");
    full[0] = Buffer.alloc(34903 - 128 + 1, 0x41);
    reject(() => encodeMacroDomain(full), "CAPACITY_EXCEEDED");
});
