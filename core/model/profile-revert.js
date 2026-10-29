// @ts-check
"use strict";

// Put chosen units of a draft back to what the keyboard holds.
//
// A unit is what a review item is (profile-review.js): a key, a layer name,
// a behaviour, a combo, the combo timing, a macro with its name, a custom
// key's name and shortcut, the keyboard's name, one settings
// section, a pointing slot, or one lighting record. Each is copied from `before` into `after` at the
// level the keyboard stores it, and every domain it touched is encoded again
// (portable-profile.js editProfileDomains), so the result passes the same
// validation as any other edit.

const {editProfileDomains, readProfileDomains, validateSnapshot} = require("./portable-profile");
const {settingsEditorView, fieldMask} = require("./settings-editor");
const {singleComboRemovalIndex} = require("./profile-review");
const {settingsShortcutRefusal} = require("./shortcut-layers");

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
    const context = {capabilities, limits: after.limits};
    const stored = readProfileDomains(a.document, context);
    return editProfileDomains(b.document, context, open => {
        // Each domain a unit touches is opened once, edited for every unit, and
        // encoded once.
        /** @type {Set<DomainKey>} */
        const opened = new Set();
        /** @template {DomainKey} K @param {K} key @returns {DomainPair<K>} */
        const domain = key => {opened.add(key); return {mine: open(key), theirs: stored(key)};};
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
                const keys = domain("keymap");
                keys.mine[layer][position] = keys.theirs[layer][position];
            } else if (kind === "macro") {
                // A macro is its steps and its name; the name lives in settings.
                const index = Number(rest);
                const macros = domain("macros");
                macros.mine[index] = macros.theirs[index];
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

        // A custom key's shortcut and the default layers share the settings
        // domain: discarding one alone must not leave a shortcut on a layer that is
        // always on, which the keyboard refuses (firmware D-F26).
        if (opened.has("settings")) {
            const refusal = settingsShortcutRefusal(domain("settings").mine);
            const what = [...units].some(unit => unit.startsWith("settings:")) ? "These settings" : "This change";
            if (refusal) throw fail(`${what} cannot be discarded on ${what === "This change" ? "its" : "their"} own: ${refusal}`);
        }
        if (opened.has("combos")) {
            const combos = domain("combos");
            combos.mine.rows = combos.mine.rows.filter(Boolean);
        }
    });
}

module.exports = {revertUnits};
