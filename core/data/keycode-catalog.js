// @ts-check
"use strict";

// The keycode catalog: every keycode QMK names, by value and by name, with its
// label, group and aliases, vendored from upstream/qmk/ rather than read from
// a QMK checkout. Inert data: reading a keycode that is not a name, a layer
// key or a modified key, is core/schema/keycodes.js's.

const catalog = require("./keycode-catalog.json");
const legacy = require("./keycode-legacy");

const BY_VALUE = new Map(catalog.entries.map((entry) => [entry.value, entry]));
/** @type {Map<string, typeof catalog.entries[number]>} */
const BY_NAME = new Map();
for (const entry of catalog.entries) {
    BY_NAME.set(entry.name, entry);
    for (const alias of entry.aliases) {
        if (!BY_NAME.has(alias)) {
            BY_NAME.set(alias, entry);
        }
    }
}

/** @param {string} name */
function lookup(name) {
    return BY_NAME.get(name);
}

/** @param {number} value */
function lookupValue(value) {
    return BY_VALUE.get(value);
}

// QMK's alias table: every name and alias mapping to its canonical keycode
// name, built from the vendored catalog.
function aliasTable() {
    /** @type {Record<string, string>} */
    const aliases = {};
    for (const entry of catalog.entries) {
        aliases[entry.name] = entry.name;
    }
    for (const entry of catalog.entries) {
        for (const alias of entry.aliases) {
            if (!aliases[alias]) {
                aliases[alias] = entry.name;
            }
        }
    }
    // QMK's other names for a catalogued key (KC_BTN1 is MS_BTN1).
    for (const [alias, target] of Object.entries(legacy.NAMES)) {
        const entry = BY_NAME.get(target);
        if (entry && !aliases[alias]) aliases[alias] = entry.name;
    }
    aliases._______ = "_______";
    aliases.XXXXXXX = "XXXXXXX";
    return aliases;
}

function entries() {
    return catalog.entries;
}

function metadata() {
    return {
        format: catalog.format,
        qmkVersion: catalog.qmkVersion,
        keycodeCount: catalog.entries.length,
    };
}

module.exports = {aliasTable, entries, lookup, lookupValue, metadata};
