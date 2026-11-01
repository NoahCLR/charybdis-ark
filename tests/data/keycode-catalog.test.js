"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {buildCatalog, CATALOG_FORMAT, parseKeycodeEntries} = require("../../scripts/generate-keycode-catalog");
const catalog = require("../../core/data/keycode-catalog.json");
const {lookup, lookupValue, metadata} = require("../../core/data/keycode-catalog");
const {encode, resolve} = require("../../core/schema/keycodes");

// These assertions run against the vendored file, not a QMK checkout, so they
// hold on a machine that has no firmware workspace at all. That is the point of
// vendoring it.

test("the shipped catalog declares its format and provenance", () => {
    assert.equal(catalog.format, CATALOG_FORMAT);
    assert.match(catalog.qmkVersion, /\S/);
    assert.notEqual(catalog.qmkVersion, "unknown");
    assert.ok(catalog.generatedFrom.length > 0);
    assert.ok(catalog.entries.length > 500, `expected a full catalog, got ${catalog.entries.length}`);
});

test("numeric values are unique, so a device keycode resolves to one entry", () => {
    const values = catalog.entries.map((entry) => entry.value);
    assert.equal(new Set(values).size, values.length);
});

test("catalog revisions reset only their fragment and remove deleted values", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "live-keycode-spec-"));
    try {
        const dir = path.join(root, "data/constants/keycodes");
        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(path.join(root, "version.txt"), "test");
        for (const [name, keycodes] of Object.entries({
            "0.0.1_basic": {"0x0004": {key: "KC_A"}},
            "0.0.1_midi": {"0x7190": {key: "VELOCITY"}},
            "0.0.2_midi": {"!reset!": 0, "0x7166": {key: "VELOCITY"}},
            "0.0.1_quantum": {"0x7C20": {key: "OLD_OUTPUT"}, "0x7C30": {key: "KEEP"}},
            "0.0.2_quantum": {"0x7C20": "!delete!"},
        })) fs.writeFileSync(path.join(dir, `keycodes_${name}.hjson`), JSON.stringify({keycodes}));
        assert.deepEqual(buildCatalog(root).entries.map(entry => entry.value), [0x0004, 0x7166, 0x7c30]);
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test("layout extras add shifted symbols and the keyboard header names its keycodes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "live-keycode-spec-"));
    try {
        const dir = path.join(root, "data/constants/keycodes");
        fs.mkdirSync(path.join(dir, "extras"), {recursive: true});
        fs.writeFileSync(path.join(root, "version.txt"), "test");
        fs.writeFileSync(path.join(dir, "keycodes_0.0.1_basic.hjson"), JSON.stringify({keycodes: {"0x001E": {key: "KC_1"}, "0x0034": {key: "KC_QUOTE"}}}));
        fs.writeFileSync(path.join(dir, "keycodes_0.0.2_kb.hjson"), JSON.stringify({keycodes: {"0x7E00": {group: "kb", key: "QK_KB_0"}, "0x7E01": {group: "kb", key: "QK_KB_1"}, "0x7E02": {group: "kb", key: "QK_KB_2"}}}));
        // A diagram's lone quote in a block comment must not unbalance parsing.
        fs.writeFileSync(path.join(dir, "extras/keycodes_us_0.0.1.hjson"),
            `{"aliases": {/* │ " │ */ "S(KC_1)": {"key": "KC_EXLM", "label": "!", "aliases": ["KC_EXCLAIM"]}, "S(KC_QUOTE)": {"key": "KC_DQUO", "label": "\\""}}}`);
        const header = path.join(root, "keyboards/bastardkb/charybdis");
        fs.mkdirSync(header, {recursive: true});
        fs.writeFileSync(path.join(header, "charybdis.h"),
            "enum charybdis_keycodes {\n    POINTER_DEFAULT_DPI_FORWARD = QK_KB_0,\n    DRAGSCROLL_MODE,\n};\n#define DPI_MOD POINTER_DEFAULT_DPI_FORWARD\n");
        const built = buildCatalog(root);
        const byValue = new Map(built.entries.map((entry) => [entry.value, entry]));
        assert.deepEqual(byValue.get(0x021e), {value: 0x021e, name: "KC_EXLM", label: "!", group: "shifted", aliases: ["KC_EXCLAIM"]});
        assert.equal(byValue.get(0x0234).label, "\"");
        assert.deepEqual(byValue.get(0x7e00), {value: 0x7e00, name: "DPI_MOD", label: "Default DPI up", group: "kb", aliases: ["POINTER_DEFAULT_DPI_FORWARD", "QK_KB_0"]});
        assert.deepEqual(byValue.get(0x7e01), {value: 0x7e01, name: "DRAGSCROLL_MODE", label: "Built-in drag scroll (hold)", group: "kb", aliases: ["QK_KB_1"]});
        assert.equal(byValue.get(0x7e02).name, "QK_KB_2", "a slot the keyboard leaves undeclared keeps its generic name");
        assert.ok(built.generatedFrom.includes("keyboards/bastardkb/charybdis/charybdis.h"));
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});

test("the Charybdis keycodes and US shifted symbols resolve by name and value", () => {
    assert.equal(resolve(0x7e06).name, "DRGSCRL");
    assert.equal(resolve(0x7e06).label, "Built-in drag scroll (hold)");
    for (const name of ["DRGSCRL", "DRAGSCROLL_MODE", "QK_KB_6"]) assert.equal(encode(name), 0x7e06, name);
    // QMK names a shifted US symbol, so Shift+9 reads back as "(" however it was written.
    assert.equal(resolve(0x0226).name, "KC_LPRN");
    assert.equal(resolve(0x0226).label, "(");
    assert.equal(encode("LSFT(KC_9)"), encode("KC_LPRN"));
    assert.equal(encode("KC_QUES"), 0x0238);
});

test("every entry can be rendered and written", () => {
    for (const entry of catalog.entries) {
        assert.ok(Number.isInteger(entry.value) && entry.value >= 0 && entry.value <= 0xffff, entry.name);
        assert.match(entry.name, /^[A-Z0-9_]+$/);
        assert.ok(entry.label.length > 0, entry.name);
        assert.ok(Array.isArray(entry.aliases));
    }
});

test("known keycodes carry the values the firmware uses", () => {
    const byName = new Map(catalog.entries.map((entry) => [entry.name, entry]));
    assert.equal(byName.get("KC_NO").value, 0x0000);
    assert.equal(byName.get("KC_TRANSPARENT").value, 0x0001);
    assert.equal(byName.get("KC_A").value, 0x0004);
    // The authored base layer's home row, as a spot check against real data.
    assert.equal(byName.get("KC_Y").value, 0x001c);
});

test("the aliases the authored profile uses resolve", () => {
    const aliases = new Map();
    for (const entry of catalog.entries) {
        for (const alias of entry.aliases) {
            aliases.set(alias, entry);
        }
    }
    assert.equal(aliases.get("_______").name, "KC_TRANSPARENT");
    assert.equal(aliases.get("XXXXXXX").name, "KC_NO");
});

test("range markers are excluded, since they are boundaries not keycodes", () => {
    const excluded = catalog.entries.filter(
        (entry) => entry.name.endsWith("_MIN") || entry.name.endsWith("_MAX") || entry.name === "SAFE_RANGE"
    );
    assert.deepEqual(excluded, []);
});

test("the parser reads a numeric value, which is what readback needs", () => {
    const entries = parseKeycodeEntries(`{
        "keycodes": {
            "0x1234": {"group": "basic", "key": "KC_EXAMPLE", "label": "Example", "aliases": ["KC_EX"]},
            "0x1235": {"group": "basic", "key": "KC_NO_LABEL"}
        }
    }`);

    assert.deepEqual(entries, [
        {value: 0x1234, name: "KC_EXAMPLE", label: "Example", group: "basic", aliases: ["KC_EX"]},
        {value: 0x1235, name: "KC_NO_LABEL", label: "KC_NO_LABEL", group: "basic", aliases: []},
    ]);
});

test("the parser drops negated aliases and reads the aliases section too", () => {
    const entries = parseKeycodeEntries(`{
        "keycodes": {"0x0001": {"key": "KC_ONE", "aliases": ["OK", "!HIDDEN"]}},
        "aliases": {"0x0002": {"key": "KC_TWO"}}
    }`);

    assert.deepEqual(entries.map((entry) => entry.name), ["KC_ONE", "KC_TWO"]);
    assert.deepEqual(entries[0].aliases, ["OK"]);
});

test("names and aliases resolve back to entries, and metadata is reported", () => {
    assert.equal(lookup("KC_A").value, 0x0004);
    assert.equal(lookup("_______").name, "KC_TRANSPARENT");
    assert.equal(lookup("nonsense"), undefined);
    assert.equal(lookupValue(0x0004).name, "KC_A");
    assert.equal(lookupValue(0x5221), undefined, "a layer key is no catalog entry");
    assert.equal(metadata().keycodeCount, catalog.entries.length);
    assert.equal(metadata().qmkVersion, catalog.qmkVersion);
});
