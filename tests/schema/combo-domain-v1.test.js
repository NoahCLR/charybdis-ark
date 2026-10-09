"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {encodeComboDomain, decodeComboDomain, effectiveComboTerm, COMBO_LIMITS} = require("../../core/schema/combo-domain-v1");
const fs = require("node:fs"), path = require("node:path");
const golden = fs.readFileSync(path.resolve(__dirname, "../../upstream/firmware/tests/fixtures/combo_domain_v3.fixture"), "utf8").trim();
const key = operand => ({kind: 1, operand, flags: 0});
const row = {inputs: [key(4), key(5)], output: key(41), termMs: 45, mustHold: false, mustTap: false, ordered: false, enabled: true, allowedLayers: 0xffff};
const v3 = rows => ({version: 3, defaultTermMs: 60, holdTermMs: 150, rows});
const withIds = table => ({...table, rows: table.rows.map((value, id) => ({id, ...value}))});

test("combo domain v3 matches the firmware's vector: native and semantic actions, flags, timing and row order", () => {
    const rows = [row, {...row, inputs: [{kind: 2, operand: 1, flags: 0}, key(6)], ordered: true, mustTap: true}];
    const table = {...v3(rows), holdTermMs: 200};
    const bytes = encodeComboDomain(table);
    assert.equal(bytes.toString("hex"), golden);
    assert.deepEqual(decodeComboDomain(bytes), withIds(table));
});

test("a table holds up to 128 combos, in their order, of up to sixteen inputs", () => {
    assert.equal(COMBO_LIMITS.maxRows, 128);
    assert.equal(decodeComboDomain(encodeComboDomain(v3(Array(128).fill(row)))).rows.length, 128);
    assert.throws(() => encodeComboDomain(v3(Array(129).fill(row))));
    const sixteen = {...row, inputs: Array.from({length: 16}, (_, slot) => key(4 + slot))};
    const bytes = encodeComboDomain(v3([sixteen, row]));
    // Rows are counted: a two-input row takes 20 bytes, a sixteen-input one 76.
    assert.equal(bytes.length, 8 + 76 + 20);
    assert.deepEqual(decodeComboDomain(bytes).rows[0].inputs.map(input => input.operand), sixteen.inputs.map(input => input.operand));
    assert.throws(() => encodeComboDomain(v3([{...row, inputs: Array.from({length: 17}, (_, slot) => key(4 + slot))}])));
});

test("a disabled combo keeps everything it holds, and its layers stay in the bank", () => {
    const disabled = {...row, enabled: false, allowedLayers: 0x8001};
    const bytes = encodeComboDomain(v3([disabled]));
    assert.equal(bytes[8 + 1], 8, "flag bit 3 disables the row");
    assert.equal(bytes.readUInt32LE(8 + 4), 0x8001);
    assert.deepEqual(decodeComboDomain(bytes), withIds(v3([disabled])));
    assert.throws(() => encodeComboDomain(v3([{...row, allowedLayers: 0x10000}])));
    const outside = Buffer.from(encodeComboDomain(v3([row])));
    outside.writeUInt32LE(0x10000, 8 + 4);
    assert.throws(() => decodeComboDomain(outside));
    // No layer at all is allowed: the combo never fires, and is still stored.
    assert.equal(decodeComboDomain(encodeComboDomain(v3([{...row, allowedLayers: 0}]))).rows[0].allowedLayers, 0);
});

test("combo domain v3 stores the default window and hold threshold once, and a row may follow the default", () => {
    const table = v3([{...row, termMs: null}, {...row, inputs: [key(4), key(6)]}]);
    const bytes = encodeComboDomain(table);
    assert.equal(bytes.length, 8 + 2 * 20);
    assert.deepEqual([...bytes.subarray(0, 8)], [2, 0, 0, 0, 60, 0, 150, 0]);
    // Window zero follows the default.
    assert.deepEqual([...bytes.subarray(8 + 2, 8 + 4)], [0, 0]);
    assert.deepEqual([...bytes.subarray(28 + 2, 28 + 4)], [45, 0]);
    const decoded = decodeComboDomain(bytes);
    assert.deepEqual(decoded, withIds(table));
    assert.equal(effectiveComboTerm(decoded, decoded.rows[0]), 60);
    assert.equal(effectiveComboTerm(decoded, decoded.rows[1]), 45);
    // An empty table keeps both values.
    assert.deepEqual(decodeComboDomain(encodeComboDomain(v3([]))), v3([]));
});

test("combo domain rejects malformed, ambiguous and noncanonical records", () => {
    for (const change of [{inputs: [key(4)]}, {inputs: [key(4), key(4)]}, {inputs: [key(0), key(1)]}, {output: key(0)}, {termMs: -1}, {termMs: 0}, {mustHold: true, mustTap: true}]) assert.throws(() => encodeComboDomain(v3([{...row, ...change}])));
    assert.throws(() => encodeComboDomain({...v3([row]), holdTermMs: 65536}));
    // No zero default, no missing hold threshold, and version 3 only.
    assert.throws(() => encodeComboDomain({...v3([row]), defaultTermMs: 0}));
    assert.throws(() => encodeComboDomain({...v3([row]), defaultTermMs: null}));
    assert.throws(() => encodeComboDomain({...v3([row]), holdTermMs: null}));
    for (const version of [1, 2, 4]) assert.throws(() => encodeComboDomain({...v3([row]), version}), /Unknown combo format/);
    const current = encodeComboDomain(v3([row]));
    for (const [index, value] of [[1, 1], [2, 1], [3, 1], [4, 0], [8, 1], [8, 17], [8 + 1, 16], [8 + 1, 3], [8 + 12, 0]]) {
        const bad = Buffer.from(current); bad[index] = value; if (index === 4) bad[5] = 0;
        assert.throws(() => decodeComboDomain(bad), `byte ${index}`);
    }
    assert.throws(() => decodeComboDomain(Buffer.concat([current, Buffer.from([0])])));
    assert.throws(() => decodeComboDomain(current.subarray(0, -1)));
    // The retired version 2 table: fixed 28-byte rows of four inputs.
    const v2 = Buffer.alloc(8 + 28); v2[0] = 1; v2.writeUInt16LE(60, 4); v2[8] = 2;
    assert.throws(() => decodeComboDomain(v2));
});
