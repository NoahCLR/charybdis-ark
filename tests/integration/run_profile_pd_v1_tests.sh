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
// Version 4 retired the mouse button records (bytes 52..69), which the frozen
// fixture's Arrow still holds: the fixture is Ark's encoding with them cleared.
const withoutButtons = frozen => {
    const out = Buffer.from(frozen);
    for (let slot = 0; slot < 8; slot++) out.fill(0, 8 + slot * 96 + 52, 8 + slot * 96 + 70);
    return out;
};
const fixtureSlots = fixture.slots.map(({buttons: _retired, ...slot}) => slot);
if (!encodeRecords(fixtureSlots).equals(withoutButtons(golden))) throw new Error("PD fixture drift");
const chunks = [];
// Ark's verdict on a frozen case, judged as the firmware's probe does since
// version 4: with any button records cleared, so a case that stored one still
// checks every other record rule; the probe refuses it as it stands.
function add(bytes) {
    let valid = 1;
    try {
        if (bytes.length !== 776 || !bytes.subarray(0, 8).equals(frozenHeader)) throw Error("frozen envelope");
        const cleared = withoutButtons(bytes);
        for (let slot = 0; slot < 8; slot++) validatePdRecord(v3FromFrozen(cleared.subarray(8 + slot * 96, 8 + (slot + 1) * 96)), slot);
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
const eightSlots = structuredClone(fixtureSlots);
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
const dominantSlots = structuredClone(fixtureSlots);
Object.assign(dominantSlots[4], {axis: 2, emptyDirection: 2, directionOutput: 1});
const dominant = encodeRecords(dominantSlots);
add(dominant);
for (let offset = 8 + 4 * 96 + 70; offset < 8 + 4 * 96 + 90; offset++) {
    for (const value of [0, 1, 2, 3, 0xff]) {
        const bytes = Buffer.from(dominant); bytes[offset] = value; add(bytes);
    }
}
// A scrolling mode carries which axes it scrolls in byte 3.
const scrollSlots = structuredClone(fixtureSlots);
scrollSlots[0].axis = 2;
const scrollOne = encodeRecords(scrollSlots);
add(scrollOne);
for (const value of [0, 1, 2, 3, 4, 0xff]) {
    const bytes = Buffer.from(scrollOne); bytes[8 + 3] = value; add(bytes);
}
for (const name of ["Édition ⌘", "😀".repeat(5), "x".repeat(23)]) {
    const slots = structuredClone(fixtureSlots); slots[7].name = name; add(encodeRecords(slots));
}
fs.writeFileSync(process.argv[3], Buffer.concat(chunks));

// Version 4, the firmware's sparse domain of 128-byte records: its golden
// vectors and Ark's mutations of them, each line Ark's verdict (code and
// payload offset) for the C validator to agree with.
const v2 = require(root + "/tests/fixtures/pd_mode_domain_v4.json");
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
// Plain mouse buttons are taps in every output place, under every modifier
// policy. Ark owns this corpus independently of the imported golden vectors.
for (const keycode of [0xd1, 0xd3, 0xd4, 0xd8]) {
    for (const modifierPolicy of [0, 1, 2]) {
        const tap = {keycode, modifierPolicy, mask: modifierPolicy === 1 ? 2 : 0};
        const record = encodePdRecord({id: 7, kind: 1, name: "Clicks", axis: 3, thresholdX: 40, thresholdY: 40,
            directions: {left: tap}, diagonals: {upLeft: tap}});
        const bytes = Buffer.concat([Buffer.from([4, 32, 128, 0, 1, 0, 0, 0]), record]);
        addV2(`ark-click-${keycode}-${modifierPolicy}`, bytes);
        // Mutate the straight and diagonal code, and the retired button
        // records, separately, so the two validators also agree on the
        // rejected vocabulary and offset.
        for (const offset of [36, 54, 70]) for (const code of [0xcd, 0xd0, 0xd9, 0xdf, 0x01d3, 0xe0, 0x7700, 0x7e80]) {
            const bad = Buffer.from(bytes); bad.writeUInt16LE(code, 8 + offset);
            addV2(`ark-click-rejected-${keycode}-${modifierPolicy}-${offset}-${code}`, bad);
        }
    }
}
const presets = Buffer.from(v2.valid.find(vector => vector.name === "presets").hex, "hex");
for (let offset = 0; offset < 8 + 2 * 128; offset++) {
    for (const value of [0, 1, 2, 0x20, 0x21, 0x60, 0x7f, 0xff]) {
        const bytes = Buffer.from(presets); bytes[offset] = value; addV2(`ark-presets-${offset}-${value}`, bytes);
    }
}
for (const length of [8, 9, 135, 136, 137, presets.length - 1]) addV2(`ark-presets-length-${length}`, presets.subarray(0, length));
// Links (firmware D-F62), on the linked vector: record 1 (Volume) only turns
// layers on, record 2 (Brightness) starts from layers 6 and 8, record 3 (Zoom)
// starts from 14 and 15 and turns on 5, 14 and 15. Every value of each link
// byte (11, what ends it; 12..13, the layers that start it; 14..15, the layers
// its key turns on) of each record; then the rule across records: no layer
// starts two modes, while the layers keys turn on may repeat, including one
// another mode starts from. Ark's verdict is pinned here as well as compared.
const links = Buffer.from(v2.valid.find(vector => vector.name === "links").hex, "hex");
/** @param {string} name @param {Buffer} bytes @param {string} expected */
function addLink(name, bytes, expected) {
    addV2(name, bytes);
    if (!lines.at(-1).startsWith(expected + " ")) throw new Error(`Ark judges ${name} ${lines.at(-1).split(" ").slice(0, 2).join(" ")}, expected ${expected}`);
}
const linkAt = (record, at) => 8 + record * 128 + at;
for (let record = 0; record < links[3]; record++) for (let at = 11; at < 16; at++) for (const value of [0, 1, 2, 3, 0x20, 0x40, 0x60, 0x80, 0xc0, 0xff]) {
    const bytes = Buffer.from(links); bytes[linkAt(record, at)] = value; addV2(`ark-links-${record}-${at}-${value}`, bytes);
}
for (const [from, to] of [[2, 3], [3, 2], [2, 1], [3, 1]]) {
    // Another record's starting layers, added to this one's: refused at the
    // later record's byte 12. A record with no starting layers of its own
    // (Volume) takes them as its own, so the later of the two is refused.
    const bytes = Buffer.from(links);
    bytes.writeUInt16LE(bytes.readUInt16LE(linkAt(to, 12)) | bytes.readUInt16LE(linkAt(from, 12)), linkAt(to, 12));
    addLink(`ark-links-shared-start-${from}-${to}`, bytes, `INVALID_PARAMETER ${linkAt(Math.max(from, to), 12)}`);
}
for (const [from, to] of [[1, 2], [3, 2], [2, 3], [1, 0]]) {
    // Another record's key layers, or its starting layers, as this one's key
    // layers: accepted.
    for (const at of [12, 14]) {
        const bytes = Buffer.from(links);
        bytes.writeUInt16LE(bytes.readUInt16LE(linkAt(to, 14)) | bytes.readUInt16LE(linkAt(from, at)), linkAt(to, 14));
        addLink(`ark-links-shared-key-${from}-${at}-${to}`, bytes, "OK 0");
    }
}
// An empty slot keeps no link: Dragscroll made empty, keeping its name, and
// given starting or key layers or what ends it, is refused at its byte 2.
const emptied = Buffer.from(links);
emptied[linkAt(0, 1)] = 0; emptied.fill(0, linkAt(0, 2), linkAt(0, 8)); emptied.fill(0, linkAt(0, 32), linkAt(0, 96));
addLink("ark-links-empty", emptied, "OK 0");
for (const [at, value] of [[11, 1], [12, 0x02], [13, 0x02], [14, 0x01], [15, 0x80]]) {
    const bytes = Buffer.from(emptied); bytes[linkAt(0, at)] = value;
    addLink(`ark-links-empty-${at}-${value}`, bytes, `INVALID_PARAMETER ${linkAt(0, 2)}`);
}
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
