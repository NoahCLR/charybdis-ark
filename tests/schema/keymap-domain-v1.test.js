"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {KEYMAP_DOMAIN_V1, encodeKeymapDomain, decodeKeymapDomain} = require("../../core/schema/keymap-domain-v1");
const {decodeProfileBlob} = require("../../core/schema/profile-blob-v1");

/** @param {string} name */
const fixtureDomain = name => {
    const text = fs.readFileSync(path.resolve(__dirname, `../../upstream/firmware/tests/fixtures/${name}`), "utf8");
    return decodeProfileBlob(Buffer.from(/** @type {RegExpMatchArray} */ (text.match(/^profile\.hex=(.+)$/m))[1], "hex")).domains.find(domain => domain.id === 0x60);
};
const reject = (fn, code) => assert.throws(fn, error => error.code === code);

test("the keymap domain is sixteen layers of sixty little-endian keycodes, row first, no header", () => {
    assert.deepEqual({...KEYMAP_DOMAIN_V1}, {VERSION: 1, LAYERS: 16, POSITIONS: 60, KEYCODE_SIZE: 2, SIZE: 1920});
    const layers = Array.from({length: 16}, (_, layer) => Array.from({length: 60}, (_, position) => (layer << 8) | position));
    layers[15][59] = 0xffff;
    const bytes = encodeKeymapDomain(layers);
    assert.equal(bytes.length, 1920);
    assert.deepEqual([...bytes.subarray(0, 4)], [0x00, 0x00, 0x01, 0x00], "layer 0, positions 0 and 1, low byte first");
    assert.equal(bytes.readUInt16LE((3 * 60 + 7) * 2), 0x0307, "layer 3 matrix position 7 (row 1, column 1)");
    assert.equal(bytes.readUInt16LE(1918), 0xffff, "the last unwired position of the last layer is kept");
    assert.deepEqual(decodeKeymapDomain(bytes), layers);
});

test("both firmware fixtures' keymaps decode and write back exactly their bytes", () => {
    for (const name of ["populated_profile_v4.fixture", "maximum_profile_v4.fixture"]) {
        const domain = fixtureDomain(name);
        assert.ok(domain, name);
        assert.equal(domain.version, 1, name);
        assert.deepEqual(encodeKeymapDomain(decodeKeymapDomain(domain.payload)), domain.payload, name);
    }
});

test("a keymap of another size, layer count or keycode width is refused", () => {
    const layers = Array.from({length: 16}, () => Array(60).fill(0));
    for (const length of [0, 1918, 1919, 1921, 3840]) reject(() => decodeKeymapDomain(Buffer.alloc(length)), "INVALID_LENGTH");
    reject(() => encodeKeymapDomain(Array(16)), "INVALID_LAYERS");
    reject(() => encodeKeymapDomain(Array.from({length: 16}, () => Array(60))), "INVALID_KEYCODE");
    reject(() => encodeKeymapDomain(layers.slice(0, 8)), "INVALID_LAYERS");
    reject(() => encodeKeymapDomain([...layers.slice(1), Array(56).fill(0)]), "INVALID_LAYERS");
    for (const keycode of [-1, 0x10000, 1.5, Number.NaN]) {
        const bad = structuredClone(layers); bad[2][3] = keycode;
        reject(() => encodeKeymapDomain(bad), "INVALID_KEYCODE");
    }
});
