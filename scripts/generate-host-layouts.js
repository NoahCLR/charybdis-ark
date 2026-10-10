#!/usr/bin/env node
"use strict";

// Generates core/data/host-layouts.json from the firmware's host layout
// fixture, pinned in upstream/firmware/tests/fixtures/host_layouts_v1.json.
//
// The keyboard types macro text through a host layout: for each computer
// keyboard layout, which keys type each character. Ark reads the same data to
// judge which characters a macro can type and to label keys as the layout
// prints them, so the two cannot disagree. Ark never re-derives the character
// table; it keeps the fixture's.
//
//   node scripts/generate-host-layouts.js [--check]

const fs = require("node:fs");
const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "..");
const FIXTURE_RELATIVE_PATH = path.join("upstream", "firmware", "tests", "fixtures", "host_layouts_v1.json");
const OUTPUT_RELATIVE_PATH = path.join("core", "data", "host-layouts.json");
const HOST_LAYOUTS_FORMAT = "charybdis-host-layouts-v1";

// A dead key's legend is the character it types before Space, the accent it
// stands for; the stroke that types it is the keyboard's business.
function legend(cell, dead) {
    if (cell && typeof cell === "object") return {dead: dead[cell.dead]?.space ?? ""};
    return cell;
}

function buildHostLayouts(fixture) {
    if (fixture?.format !== 1 || !Array.isArray(fixture.layouts)) throw new Error("Unsupported host layout fixture.");
    return {
        format: HOST_LAYOUTS_FORMAT,
        generatedFrom: FIXTURE_RELATIVE_PATH.split(path.sep).join("/"),
        layouts: fixture.layouts.map((layout) => ({
            id: layout.id,
            slug: layout.slug,
            name: layout.name,
            os: layout.os,
            ...(layout.unicodeHexInput ? {unicodeHexInput: true} : {}),
            keys: Object.fromEntries(Object.entries(layout.keys).map(([key, cells]) => [key, cells.map((cell) => legend(cell, layout.dead))])),
            // Every character the layout types, in code point order. Object
            // keys list digit-like keys first, so sort explicitly.
            chars: Object.keys(layout.chars).sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join(""),
            // Review compares the exact native strokes, including dead keys;
            // two layouts can type a character by different keys.
            strokes: layout.chars,
        })),
    };
}

function main(argv) {
    const check = argv.includes("--check");
    const fixture = JSON.parse(fs.readFileSync(path.join(APP_ROOT, FIXTURE_RELATIVE_PATH), "utf8"));
    const serialized = `${JSON.stringify(buildHostLayouts(fixture), null, 1)}\n`;
    const outputPath = path.join(APP_ROOT, OUTPUT_RELATIVE_PATH);
    if (check) {
        const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
        if (current !== serialized) {
            console.error(`${OUTPUT_RELATIVE_PATH} is stale against ${FIXTURE_RELATIVE_PATH}. Re-run without --check to regenerate.`);
            process.exitCode = 1;
            return;
        }
        console.log(`host layouts are current: ${fixture.layouts.length} layouts`);
        return;
    }
    fs.writeFileSync(outputPath, serialized);
    console.log(`wrote ${OUTPUT_RELATIVE_PATH}: ${fixture.layouts.length} layouts`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {buildHostLayouts, HOST_LAYOUTS_FORMAT, FIXTURE_RELATIVE_PATH, OUTPUT_RELATIVE_PATH};
