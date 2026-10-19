// @ts-check
"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const {execFileSync} = require("node:child_process");
const {encodeMacroDomain, decodeMacroDomain} = require("../../core/schema/macro-domain-v1");
const probe = process.argv[2], dir = process.argv[3];
const generated = path.join(dir, "generated.bin");
execFileSync(probe, ["generate", generated]);
const cBytes = fs.readFileSync(generated), cSlots = decodeMacroDomain(cBytes);
assert.equal(cSlots[0].subarray(3).toString(), "café");
assert.deepEqual(cSlots[127], Buffer.from([1, 2, 4, 1, 3, 4, 1, 4, 49, 50, 124]));
assert.deepEqual(encodeMacroDomain(cSlots), cBytes);
const empty = () => Array.from({length: 128}, () => Buffer.alloc(0));
const sparse = empty(); sparse[3] = Buffer.from("Unicode 🙂"); sparse[127] = cSlots[127];
const dense = Array.from({length: 128}, () => Buffer.from("text"));
const maximum = empty(); maximum[127] = Buffer.alloc(34903 - 128, 97);
const valid = [encodeMacroDomain(empty()), cBytes, encodeMacroDomain(sparse), encodeMacroDomain(dense), encodeMacroDomain(maximum)];
// Optional unused bytes remain lossless through transport; a canonical edit
// re-encodes the streams without them.
const padded = Buffer.concat([valid[2], Buffer.from([65, 66, 0])]); valid.push(padded);
const invalid = [Buffer.alloc(127), Buffer.concat([Buffer.from([0xc0, 0xaf]), Buffer.alloc(128)]),
    Buffer.concat([Buffer.from([1, 5, 3]), Buffer.alloc(128)]), Buffer.concat([Buffer.from([1, 7]), Buffer.alloc(128)]),
    Buffer.concat([Buffer.from([1, 1, 0]), Buffer.alloc(128)]), Buffer.alloc(34904),
    Buffer.concat([valid[2].subarray(0, -1), Buffer.from([1])])];
for (const [expected, corpus] of [[true, valid], [false, invalid]]) {
    for (const [index, bytes] of /** @type {Buffer[]} */ (corpus).entries()) {
        const file = path.join(dir, "input.bin"), echo = path.join(dir, "echo.bin");
        // Exercise a 32-bit source offset and a domain spanning the 64-KiB
        // boundary, as the whole-profile transfer bridge does in production.
        const offset = index % 2 ? 70000 : 65500;
        fs.writeFileSync(file, Buffer.concat([Buffer.alloc(offset), bytes]));
        const result = execFileSync(probe, [file, String(offset), String(bytes.length), echo], {encoding: "utf8"}).trim();
        assert.equal(result, expected ? "valid" : "invalid");
        assert.deepEqual(fs.readFileSync(echo), bytes);
        if (expected) assert.equal(decodeMacroDomain(bytes).length, 128);
        else assert.throws(() => decodeMacroDomain(bytes));
    }
}
console.log("Macro domain C↔JS: empty, sparse, dense, full capacity, UTF-8, keys, delay, protection, unused tail and malformed data agree; wide read offsets are lossless.");
