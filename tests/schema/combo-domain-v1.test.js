"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {encodeComboDomain, decodeComboDomain, effectiveComboTerm} = require("../../core/schema/combo-domain-v1");
const fs = require("node:fs"), path = require("node:path");
const golden = fs.readFileSync(path.resolve(__dirname, "../../upstream/firmware/tests/fixtures/combo_domain_v1.fixture"), "utf8").trim();
const key = operand => ({kind: 1, operand, flags: 0});
const row = {inputs: [key(4), key(5)], output: key(41), termMs: 45, mustHold: false, mustTap: false, ordered: false};
const v2 = rows => ({version: 2, defaultTermMs: 60, holdTermMs: 150, rows});
const withIds = table => ({...table, rows: table.rows.map((value, id) => ({id, ...value}))});

test("combo domain v2 matches the firmware's vector: native and semantic actions, flags, timing and row order", () => {
    const rows = [row, {...row, inputs: [{kind: 2, operand: 1, flags: 0}, key(6)], ordered: true, mustTap: true}];
    const table = {...v2(rows), holdTermMs: 200};
    const bytes = encodeComboDomain(table);
    assert.equal(bytes.toString("hex"), golden);
    assert.deepEqual(decodeComboDomain(bytes), withIds(table));
});

test("a table holds up to 32 combos, in their order", () => {
    assert.equal(decodeComboDomain(encodeComboDomain(v2(Array(32).fill(row)))).rows.length, 32);
    assert.throws(() => encodeComboDomain(v2(Array(33).fill(row))));
});

test("combo domain v2 stores the default window and hold threshold once, and a row may follow the default", () => {
    const table = v2([{...row, termMs: null}, {...row, inputs: [key(4), key(6)]}]);
    const bytes = encodeComboDomain(table);
    assert.equal(bytes.length, 8 + 2 * 28);
    assert.deepEqual([...bytes.subarray(0, 8)], [2, 0, 0, 0, 60, 0, 150, 0]);
    // Window zero follows the default; the per-row hold field is gone.
    assert.deepEqual([...bytes.subarray(8 + 2, 8 + 8)], [0, 0, 0, 0, 0, 0]);
    assert.deepEqual([...bytes.subarray(36 + 2, 36 + 4)], [45, 0]);
    const decoded = decodeComboDomain(bytes);
    assert.deepEqual(decoded, withIds(table));
    assert.equal(effectiveComboTerm(decoded, decoded.rows[0]), 60);
    assert.equal(effectiveComboTerm(decoded, decoded.rows[1]), 45);
    // An empty table keeps both values.
    assert.deepEqual(decodeComboDomain(encodeComboDomain(v2([]))), v2([]));
});

test("combo domain rejects malformed, ambiguous and noncanonical records", () => {
    for (const change of [{inputs: [key(4)]}, {inputs: [key(4), key(4)]}, {inputs: [key(0), key(1)]}, {output: key(0)}, {termMs: -1}, {termMs: 0}, {mustHold: true, mustTap: true}]) assert.throws(() => encodeComboDomain(v2([{...row, ...change}])));
    assert.throws(() => encodeComboDomain({...v2([row]), holdTermMs: 65536}));
    // No zero default, no missing hold threshold, and version 2 only.
    assert.throws(() => encodeComboDomain({...v2([row]), defaultTermMs: 0}));
    assert.throws(() => encodeComboDomain({...v2([row]), defaultTermMs: null}));
    assert.throws(() => encodeComboDomain({...v2([row]), holdTermMs: null}));
    for (const version of [1, 3]) assert.throws(() => encodeComboDomain({...v2([row]), version}), /Unknown combo format/);
    const current = encodeComboDomain(v2([row]));
    for (const [index, value] of [[1, 1], [2, 1], [3, 1], [4, 0], [12, 1], [13, 1], [8 + 4, 200], [8 + 6, 1], [8 + 20, 1]]) {
        const bad = Buffer.from(current); bad[index] = value; if (index === 4) bad[5] = 0;
        assert.throws(() => decodeComboDomain(bad), `byte ${index}`);
    }
    assert.throws(() => decodeComboDomain(Buffer.concat([current, Buffer.from([0])])));
    assert.throws(() => decodeComboDomain(current.subarray(0, -1)));
    // The retired version 1 table: a four-byte header and a hold on every row.
    const v1 = Buffer.alloc(4 + 28); v1[0] = 1; v1[4] = 2; v1.writeUInt16LE(45, 6); v1.writeUInt16LE(200, 8);
    assert.throws(() => decodeComboDomain(v1), /Malformed combo/);
});
