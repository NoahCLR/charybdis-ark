#!/bin/sh
set -eu
ROOT="${FIRMWARE_ROOT:?Set FIRMWARE_ROOT to the selected firmware checkout}"
: "${CHARYBDIS_ARK_ROOT:?Set CHARYBDIS_ARK_ROOT to the selected Ark checkout}"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT INT TERM

node - "$ROOT" "$BUILD_DIR/corpus.bin" <<'JS'
const fs = require("node:fs");
const root = process.argv[2];
const fixture = require(root + "/tests/fixtures/pd_mode_domain_v1.json");
const {decodePdDomain, encodePdRecord, validatePdRecord} = require(process.env.CHARYBDIS_ARK_ROOT + "/core/schema/pd-mode-domain-v1");
// A test-only envelope for firmware's frozen eight-record harness: 96-byte
// records with a 24-byte name field, which firmware checks by turning each into
// a 128-byte one (v3_from_frozen in its probe). Every record uses the current
// codec through the same two conversions; Ark has no production v1 decoder.
const frozenHeader = Buffer.from([1, 8, 96, 0, 0, 0, 0, 0]);
const frozenOf = record => {
    const out = Buffer.from(record.subarray(0, 96));
    out.fill(0, 8, 32);
    record.copy(out, 8, 96, 96 + Math.min(record[8], 24));
    return out;
};
// The old name field verbatim; its length is its first zero, or 33 (past the
// limit) when it has none, so a name the old rule refused is refused again.
const v3FromFrozen = frozen => {
    const out = Buffer.alloc(128), end = frozen.subarray(8, 32).indexOf(0);
    frozen.copy(out, 0, 0, 96);
    out.fill(0, 9, 32);
    out[8] = end < 0 ? 33 : end;
    frozen.copy(out, 96, 8, 32);
    return out;
};
const encodeRecords = slots => Buffer.concat([frozenHeader, ...slots.map(slot => frozenOf(encodePdRecord(slot)))]);
const golden = Buffer.from(fixture.hex, "hex");
if (!encodeRecords(fixture.slots).equals(golden)) throw new Error("PD fixture drift");
const chunks = [];
function add(bytes) {
    let valid = 1;
    try {
        if (bytes.length !== 776 || !bytes.subarray(0, 8).equals(frozenHeader)) throw Error("frozen envelope");
        for (let slot = 0; slot < 8; slot++) validatePdRecord(v3FromFrozen(bytes.subarray(8 + slot * 96, 8 + (slot + 1) * 96)), slot);
    } catch {valid = 0;}
    const header = Buffer.alloc(3); header[0] = valid; header.writeUInt16LE(bytes.length, 1);
    chunks.push(header, bytes);
}
add(golden);
for (let offset = 0; offset < golden.length; offset++) {
    for (const value of [0, 1, 2, 3, 0x7f, 0x80, 0xc0, 0xe0, 0xff]) {
        const bytes = Buffer.from(golden); bytes[offset] = value; add(bytes);
    }
}
for (let length = 0; length < golden.length; length++) add(golden.subarray(0, length));
add(Buffer.concat([golden, Buffer.from([0])]));
// An eight-direction mode: diagonals live in bytes 70..85 and the
// empty-direction policy in byte 86. Every byte of that record is mutated too.
const eightSlots = structuredClone(fixture.slots);
Object.assign(eightSlots[4], {axis: 3, thresholdX: 40, thresholdY: 40, emptyDirection: 1,
    diagonals: {upLeft: {keycode: 0x50, modifierPolicy: 0, mask: 0}, upRight: {keycode: 0x4f, modifierPolicy: 1, mask: 2}, downLeft: {keycode: 0, modifierPolicy: 0, mask: 0}, downRight: {keycode: 0x51, modifierPolicy: 2, mask: 0}}});
const eight = encodeRecords(eightSlots);
add(eight);
for (let offset = 8 + 4 * 96; offset < 8 + 5 * 96; offset++) {
    for (const value of [0, 1, 2, 3, 4, 0x7f, 0x80, 0xff]) {
        const bytes = Buffer.from(eight); bytes[offset] = value; add(bytes);
    }
}
// Every directional mode carries the empty-direction policy in byte 86 and
// how often it sends in byte 87.
const dominantSlots = structuredClone(fixture.slots);
Object.assign(dominantSlots[4], {axis: 2, emptyDirection: 2, directionOutput: 1});
const dominant = encodeRecords(dominantSlots);
add(dominant);
for (let offset = 8 + 4 * 96 + 70; offset < 8 + 4 * 96 + 90; offset++) {
    for (const value of [0, 1, 2, 3, 0xff]) {
        const bytes = Buffer.from(dominant); bytes[offset] = value; add(bytes);
    }
}
// A scrolling mode carries which axes it scrolls in byte 3.
const scrollSlots = structuredClone(fixture.slots);
scrollSlots[0].axis = 2;
const scrollOne = encodeRecords(scrollSlots);
add(scrollOne);
for (const value of [0, 1, 2, 3, 4, 0xff]) {
    const bytes = Buffer.from(scrollOne); bytes[8 + 3] = value; add(bytes);
}
for (const name of ["Édition ⌘", "😀".repeat(5), "x".repeat(23)]) {
    const slots = structuredClone(fixture.slots); slots[7].name = name; add(encodeRecords(slots));
}
fs.writeFileSync(process.argv[3], Buffer.concat(chunks));

// Version 3, the firmware's sparse domain of 128-byte records: its golden
// vectors and Ark's mutations of them, each line Ark's verdict (code and
// payload offset) for the C validator to agree with.
const v2 = require(root + "/tests/fixtures/pd_mode_domain_v3.json");
const lines = [];
function addV2(name, bytes) {
    let code = "OK", offset = 0;
    try {decodePdDomain(bytes);} catch (error) {code = error.code; offset = error.offset;}
    lines.push(`${code} ${offset} ${name} ${bytes.toString("hex") || "-"}`);
}
for (const vector of [...v2.valid, ...v2.invalid]) {
    const bytes = Buffer.from(vector.hex, "hex");
    const expected = vector.error ? `${vector.error.code} ${vector.error.offset}` : "OK 0";
    addV2(vector.name, bytes);
    if (!lines.at(-1).startsWith(expected + " ")) throw new Error(`Ark disagrees with firmware vector ${vector.name}: ${lines.at(-1).split(" ").slice(0, 2).join(" ")}, firmware ${expected}`);
}
const presets = Buffer.from(v2.valid.find(vector => vector.name === "presets").hex, "hex");
for (let offset = 0; offset < 8 + 2 * 128; offset++) {
    for (const value of [0, 1, 2, 0x20, 0x21, 0x60, 0x7f, 0xff]) {
        const bytes = Buffer.from(presets); bytes[offset] = value; addV2(`ark-presets-${offset}-${value}`, bytes);
    }
}
for (const length of [8, 9, 135, 136, 137, presets.length - 1]) addV2(`ark-presets-length-${length}`, presets.subarray(0, length));
fs.writeFileSync(process.argv[3] + ".v2.txt", lines.join("\n") + "\n");
JS

build_and_run() {
    name="$1"
    shift
    cc -std=c11 -Wall -Wextra -Werror -pedantic "$@" -I"$ROOT" \
        "$ROOT/tests/host/profile_pd_v1_test.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_pd_v1.c" \
        "$ROOT/users/noah/lib/profile/schema/profile_reader.c" \
        -o "$BUILD_DIR/$name"
    "$BUILD_DIR/$name" "$BUILD_DIR/corpus.bin" "$BUILD_DIR/corpus.bin.v2.txt"
}
build_and_run normal
build_and_run sanitized -fsanitize=address,undefined -fno-omit-frame-pointer
