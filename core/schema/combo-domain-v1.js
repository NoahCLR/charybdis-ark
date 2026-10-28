// @ts-check
"use strict";
const {PROFILE_DOMAIN_VERSIONS, PROFILE_DOMAIN_IDS} = require("./profile-domains");
const {ALL_LAYERS, LAYERS} = require("../data/charybdis-layout");
const {encodeSemanticAction, decodeSemanticAction} = require("./profile-blob-v1");
const {nativeCode} = require("./actions");
const {canonical} = require("./bytes");
/** @param {string} message */
const fail = message => Object.assign(new Error(message), {code: "INVALID_COMBO_DOMAIN"});

// Domain 0x30, version 3, the only one the keyboard stores (firmware D-F14).
// A combo table is its rows and the two values QMK keeps for all combos,
// stored once in the header: the default window, which a row without its own
// follows (termMs null, stored as 0), and the hold threshold. A row is
// 12 + 4 × inputs bytes: count, flags, window, the layers it may fire on,
// output, then its two to sixteen inputs. A disabled combo keeps everything
// it holds (participation-policy.md).
const COMBO_DOMAIN_VERSION = PROFILE_DOMAIN_VERSIONS[PROFILE_DOMAIN_IDS.COMBOS];
const HEADER_SIZE = 8;
const ROW_FIXED_SIZE = 12;
const COMBO_LIMITS = Object.freeze({maxRows: 128, maxInputs: 16, maxLayers: LAYERS});
const FLAG = Object.freeze({HOLD: 1, TAP: 2, ORDERED: 4, DISABLED: 8, OUTPUT_BYPASS: 16});
/** @param {number | null} value @param {number} min @returns {value is number} */
const ms = (value, min) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= 65535;
/** @param {number} inputs */
const rowSize = inputs => ROW_FIXED_SIZE + 4 * inputs;

/** @param {import("./types.js").ComboInput} table @param {import("./types.js").ActionOptions} [options] */
function encodeComboDomain(table, options = {}) {
    const {version = COMBO_DOMAIN_VERSION, defaultTermMs = null, holdTermMs = null, rows} = table || {};
    if (version !== COMBO_DOMAIN_VERSION) throw fail(`Unknown combo format version ${version}.`);
    if (!Array.isArray(rows) || rows.length > COMBO_LIMITS.maxRows) throw fail(`At most ${COMBO_LIMITS.maxRows} combos are supported.`);
    // QMK fires a combo only inside its window: a zero default would
    // silently stop every combo that follows it.
    if (!ms(defaultTermMs, 1)) throw fail("The default combo window must be between 1 and 65535 ms.");
    if (!ms(holdTermMs, 0)) throw fail("The combo hold threshold must be between 0 and 65535 ms.");
    const header = Buffer.alloc(HEADER_SIZE);
    header[0] = rows.length;
    header.writeUInt16LE(defaultTermMs, 4); header.writeUInt16LE(holdTermMs, 6);
    const encoded = rows.map(row => {
        if (!Array.isArray(row.inputs) || row.inputs.length < 2 || row.inputs.length > COMBO_LIMITS.maxInputs) throw fail(`A combo needs two to ${COMBO_LIMITS.maxInputs} inputs.`);
        if (row.termMs !== null && !ms(row.termMs, 1)) throw fail("A combo's window must be between 1 and 65535 ms.");
        if (row.mustHold && row.mustTap) throw fail("A combo cannot require both a hold and a tap.");
        if (row.useOutputBehavior !== undefined && typeof row.useOutputBehavior !== "boolean") throw fail("Output behaviour permission must be on or off.");
        const allowedLayers = row.allowedLayers ?? ALL_LAYERS;
        if (!Number.isInteger(allowedLayers) || allowedLayers < 0 || allowedLayers > ALL_LAYERS) throw fail("A combo can only allow layers of the layer bank.");
        const bytes = Buffer.alloc(rowSize(row.inputs.length));
        bytes[0] = row.inputs.length;
        bytes[1] = (row.mustHold ? FLAG.HOLD : 0) | (row.mustTap ? FLAG.TAP : 0) | (row.ordered ? FLAG.ORDERED : 0) | (row.enabled === false ? FLAG.DISABLED : 0) | (row.useOutputBehavior === false ? FLAG.OUTPUT_BYPASS : 0);
        bytes.writeUInt16LE(row.termMs ?? 0, 2);
        bytes.writeUInt32LE(allowedLayers, 4);
        const output = encodeSemanticAction(row.output, options);
        if (output[0] === 0 || (output[0] === 1 && output.readUInt16LE(2) === 0)) throw fail("Choose a key or action output. Firmware callback outputs cannot be edited.");
        output.copy(bytes, 8);
        const seen = new Set();
        row.inputs.forEach((input, slot) => {
            const action = encodeSemanticAction(input, options);
            if (action[0] === 0 || (action[0] === 1 && action.readUInt16LE(2) <= 1)) throw fail("Combo inputs must be assigned keys.");
            const identity = action.toString("hex");
            if (seen.has(identity)) throw fail("Combo inputs must be distinct.");
            seen.add(identity); action.copy(bytes, ROW_FIXED_SIZE + slot * 4);
        });
        return bytes;
    });
    return Buffer.concat([header, ...encoded]);
}

/** @param {Uint8Array} value @param {import("./types.js").ActionOptions} [options] */
function decodeComboDomain(value, options = {}) {
    const bytes = Buffer.from(value);
    if (bytes.length < HEADER_SIZE || bytes[0] > COMBO_LIMITS.maxRows || bytes[1] || bytes[2] || bytes[3]) throw fail("Malformed combo header.");
    let offset = HEADER_SIZE;
    const rows = Array.from({length: bytes[0]}, (_, id) => {
        const count = bytes[offset];
        if (offset + ROW_FIXED_SIZE > bytes.length || count < 2 || count > COMBO_LIMITS.maxInputs || offset + rowSize(count) > bytes.length || bytes[offset + 1] & ~31) throw fail("Malformed combo row.");
        /** @param {number} start */
        const readAction = start => decodeSemanticAction(bytes.subarray(start, start + 4), options);
        const termMs = bytes.readUInt16LE(offset + 2), flags = bytes[offset + 1];
        const row = {id, inputs: Array.from({length: count}, (_, slot) => readAction(offset + ROW_FIXED_SIZE + slot * 4)), output: readAction(offset + 8),
            termMs: termMs === 0 ? null : termMs, mustHold: Boolean(flags & FLAG.HOLD), mustTap: Boolean(flags & FLAG.TAP), ordered: Boolean(flags & FLAG.ORDERED),
            enabled: !(flags & FLAG.DISABLED), useOutputBehavior: !(flags & FLAG.OUTPUT_BYPASS), allowedLayers: bytes.readUInt32LE(offset + 4)};
        offset += rowSize(count);
        return row;
    });
    if (offset !== bytes.length) throw fail("Combo rows do not end at the domain's end.");
    const table = {version: /** @type {typeof COMBO_DOMAIN_VERSION} */ (COMBO_DOMAIN_VERSION), defaultTermMs: bytes.readUInt16LE(4), holdTermMs: bytes.readUInt16LE(6), rows};
    return canonical(bytes, table, value => encodeComboDomain(value, options), () => fail("Noncanonical combo data."));
}

// The window a row runs with.
/** @param {{defaultTermMs: number}} table @param {{termMs: number | null}} row */
const effectiveComboWindow = (table, row) => row.termMs ?? table.defaultTermMs;

// The rows as the keyboard reports them running: each with the window it
// runs with, whether that follows the default, and native keycodes.
/** @param {ReturnType<typeof decodeComboDomain>} table */
const runningComboRows = table => table.rows.map(row => ({...row, termMs: effectiveComboWindow(table, row), followsDefault: row.termMs === null,
    inputs: row.inputs.map(action => /** @type {number} */ (nativeCode(action))), output: /** @type {number} */ (nativeCode(row.output))}));

module.exports = {COMBO_DOMAIN_VERSION, COMBO_LIMITS, ALL_LAYERS, encodeComboDomain, decodeComboDomain, effectiveComboWindow, runningComboRows};
