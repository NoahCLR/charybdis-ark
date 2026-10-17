// @ts-check
"use strict";

// Put chosen units of a draft back to what the keyboard holds.
//
// A unit is what a review item is (profile-review.js): a key, a layer name,
// a behaviour, a combo, the combo timing, a macro with its name, a custom
// key's name and shortcut, the keyboard's name, one settings
// section, a pointing slot, or one lighting record. Each is copied from `before` into `after` at the
// level the keyboard stores it, and every domain it touched is encoded again,
// so the result passes the same validation as any other edit.

const {validateSnapshot} = require("./portable-profile");
const {settingsEditorView, fieldMask} = require("./settings-editor");
const {decodeProfileBlob, encodeProfileBlob} = require("../schema/profile-blob-v1");
const {domainCodec} = require("../schema/profile-domains");
const {singleComboRemovalIndex} = require("./profile-review");

/** @template T @param {T} value @returns {T} */
const copy = value => JSON.parse(JSON.stringify(value));
/** @param {string} text */
const fail = text => Object.assign(new Error(text), {code: "PROFILE_REVERT_UNSUPPORTED"});
const GROUP_TABLES = /** @type {const} */ (["groups", "layerGroupRows", "pdModeGroupRows", "comboGroupRows", "keyGroupRows"]);
/** @typedef {import("../schema/profile-domains-types.js").DomainModels} DomainModels */
/** @typedef {keyof DomainModels} DomainKey */
/**
 * @template {DomainKey} K
 * @typedef {{mine: DomainModels[K], theirs: DomainModels[K]}} DomainPair
 */
/** @template {keyof import("../schema/types.js").RgbProfile} K @param {import("../schema/types.js").RgbProfile} mine @param {import("../schema/types.js").RgbProfile} theirs @param {K} table */
function restoreRgbTable(mine, theirs, table) {mine[table] = theirs[table];}
/** @template T @template {keyof T} K @param {T[]} mine @param {T[]} theirs @param {K} key @param {number} id */
function restoreColor(mine, theirs, key, id) {
    const stored = theirs.find(row => row[key] === id), index = mine.findIndex(row => row[key] === id);
    if (!stored || index < 0) throw fail("This lighting change cannot be discarded on its own.");
    mine[index] = stored;
}


/** @param {import("./types.js").CompleteSnapshot} before @param {import("./types.js").CompleteSnapshot} after @param {Set<string>} units @param {import("./types.js").ProfileDestination} [capabilities] */
function revertUnits(before, after, units, capabilities) {
    const a = validateSnapshot(before.document, capabilities), b = validateSnapshot(after.document, capabilities);
    if (units.has("profile")) return copy(a.document);
    const document = copy(b.document);
    const blob = decodeProfileBlob(Buffer.from(document.profile, "base64"));
    const baseBlob = decodeProfileBlob(Buffer.from(a.document.profile, "base64"));
    const rgbOptions = {maximumBrightness: after.limits?.brightnessMax ?? 255, ...b.codecOptions.rgb};
    // Each domain is decoded once, edited for every unit, and encoded once.
    const options = {...b.codecOptions, rgb: rgbOptions};
    /** @type {Map<DomainKey, DomainPair<DomainKey>>} */
    const open = new Map();
    /** @template {DomainKey} K @param {K} key @returns {DomainPair<K>} */
    const domain = key => {
        if (!open.has(key)) {
            const codec = domainCodec(key);
            const mine = blob.domains.find(row => row.id === codec.id), theirs = baseBlob.domains.find(row => row.id === codec.id);
            if (!mine || !theirs) throw fail("This change cannot be discarded on its own.");
            open.set(key, {mine: codec.decode(mine.payload, options), theirs: codec.decode(theirs.payload, options)});
        }
        // The cache is populated by this key's decoder above.
        return /** @type {DomainPair<K>} */ (open.get(key));
    };
    // Both inputs are complete snapshots; their settings views are available.
    const settingsView = /** @type {NonNullable<ReturnType<typeof settingsEditorView>>} */ (settingsEditorView(before));
    const sections = new Map(settingsView.sections.map(section => [section.id, section.fields]));
    /** @param {DomainPair<"settings">} settings @param {number} id @param {number} mask */
    const settingBits = (settings, id, mask) => {
        settings.mine.values[id] = ((settings.mine.values[id] & ~mask) | (settings.theirs.values[id] & mask)) >>> 0;
    };

    for (const unit of units) {
        const [kind, ...parts] = unit.split(":");
        const rest = parts.join(":");
        if (kind === "layout") {
            const [layer, position] = parts.map(Number);
            document.layers[layer][position] = a.document.layers[layer][position];
        } else if (kind === "macro") {
            // A macro is its steps and its name; the name lives in settings.
            const index = Number(rest);
            document.macros[index] = a.document.macros[index];
            const settings = domain("settings");
            settings.mine.macroNames[index] = settings.theirs.macroNames[index];
        } else if (kind === "customKey") {
            const settings = domain("settings"), index = Number(rest);
            settings.mine.customKeyNames[index] = settings.theirs.customKeyNames[index];
            settings.mine.customKeyShortcuts[index] = {...settings.theirs.customKeyShortcuts[index]};
        } else if (kind === "keyboardName") {
            const settings = domain("settings");
            settings.mine.keyboardName = settings.theirs.keyboardName;
        } else if (kind === "layerName") {
            const settings = domain("settings");
            settings.mine.names[Number(rest)] = settings.theirs.names[Number(rest)];
        } else if (kind === "settings") {
            const settings = domain("settings");
            if (rest === "otherKeyOptions") {
                const masks = after.options?.keymapMasks?.reduce((mask, value) => mask | value, 0) || 0;
                settingBits(settings, 24, ~masks >>> 0);
            } else {
                const fields = sections.get(rest);
                if (!fields) throw fail("These settings cannot be discarded on their own.");
                for (const field of fields) {
                    if (field.header) settings.mine[field.header] = settings.theirs[field.header];
                    else if (field.record) settings.mine.layers[field.layer][field.record] = copy(settings.theirs.layers[field.layer][field.record]);
                    else if (typeof field.id === "number" && Number.isInteger(field.id)) settingBits(settings, field.id, fieldMask(field));
                    else throw fail("These settings cannot be discarded on their own.");
                }
            }
        } else if (kind === "placement") {
            const settings = domain("settings"), [layer, position] = parts.map(Number);
            for (const field of /** @type {const} */ (["bypass", "exclude"])) {
                const set = new Set(settings.mine.layers[layer][field]);
                if (settings.theirs.layers[layer][field].includes(position)) set.add(position); else set.delete(position);
                settings.mine.layers[layer][field] = [...set].sort((a, b) => a - b);
            }
        } else if (kind === "behavior") {
            const behaviors = domain("behaviors");
            /** @param {import("../schema/types.js").BehaviorRow} row */
            const same = row => JSON.stringify(row.target) === rest;
            const kept = behaviors.mine.rows.filter(row => !same(row)), stored = behaviors.theirs.rows.find(same);
            behaviors.mine.rows = stored ? [...kept, stored] : kept;
        } else if (kind === "combo") {
            const combos = domain("combos"), index = Number(rest);
            // Restore a lone middle deletion by inserting the stored row;
            // assigning it would overwrite the next combo in the packed table.
            const removed = singleComboRemovalIndex(combos.theirs.rows, combos.mine.rows);
            if (removed === index) combos.mine.rows.splice(index, 0, combos.theirs.rows[index]);
            else combos.mine.rows[index] = combos.theirs.rows[index];
        } else if (kind === "comboTiming") {
            // The default window and hold threshold, which every combo shares.
            const combos = domain("combos");
            combos.mine.defaultTermMs = combos.theirs.defaultTermMs;
            combos.mine.holdTermMs = combos.theirs.holdTermMs;
        } else if (kind === "pd") {
            const slots = domain("pdModes");
            slots.mine[Number(rest)] = slots.theirs[Number(rest)];
        } else if (kind === "rgb") {
            const rgb = domain("rgb"), mine = rgb.mine, theirs = rgb.theirs;
            if (rest === "stages") mine.stageEnableMask = theirs.stageEnableMask;
            else if (rest === "automouse") mine.automouseFade = theirs.automouseFade;
            else if (rest === "combo") mine.comboFeedback = theirs.comboFeedback;
            else if (rest === "key") mine.keyFeedback = theirs.keyFeedback;
            else if (rest === "groups") for (const table of GROUP_TABLES) restoreRgbTable(mine, theirs, table);
            else if (parts[0] === "layer" || parts[0] === "pd") {
                const id = Number(parts[1]);
                if (parts[0] === "layer") restoreColor(mine.layerColors, theirs.layerColors, "layerId", id);
                else restoreColor(mine.pdModeColors, theirs.pdModeColors, "pdModeId", id);
            } else throw fail("This lighting change cannot be discarded on its own.");
        } else throw fail("This change cannot be discarded on its own.");
    }

    if (open.has("combos")) {
        const combos = domain("combos");
        combos.mine.rows = combos.mine.rows.filter(Boolean);
    }
    for (const [key, {mine}] of open) {
        const row = blob.domains.find(entry => entry.id === domainCodec(key).id);
        // Opening a domain required the matching blob row to exist.
        /** @template {DomainKey} K @param {K} key @param {DomainModels[K]} value */
        const encode = (key, value) => domainCodec(key).encode(value, options);
        /** @type {import("../schema/types.js").ProfileDomain} */ (row).payload = encode(key, mine);
    }
    if (open.size) document.profile = encodeProfileBlob(blob).toString("base64");
    return document;
}

module.exports = {revertUnits};
