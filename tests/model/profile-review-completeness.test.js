// @ts-check
"use strict";
const {editLayers, editMacros} = require("../fixtures/profile-document");
const test = require("node:test"), assert = require("node:assert/strict");
const {document} = require("../fixtures/portable-profile");
const {profileReview} = require("../../core/model/profile-review");
const {fingerprint, validateSnapshot} = require("../../core/model/portable-profile");
const {PROFILE_DOMAINS, replaceDomain} = require("../../core/schema/profile-domains");
const {SETTING_FIELDS: FIELDS} = require("../../core/schema/settings-domain-v1");
const {matrixPosition} = require("../../core/data/charybdis-layout");

const snapshot = value => ({document: value, fingerprint: fingerprint(value)});
const rewrite = (value, codec, decoded, options) => ({...value,
    profile: replaceDomain(Buffer.from(value.profile, "base64"), codec.id, () => codec.encode(decoded, options)).toString("base64")});

// Populate optional records as well as the compiled fixture's ordinary ones.
// The eight-way slot exposes every direction, diagonal and modifier field;
// another slot retains the independent scroll representation.
function completeFixture() {
    let value = document();
    const decoded = validateSnapshot(value);
    const rgb = structuredClone(decoded.rgb);
    rgb.layerGroupRows = [{selector: 1, groupId: 0, color: {h: 20, s: 100, v: 100}}];
    value = rewrite(value, PROFILE_DOMAINS.find(row => row.key === "rgb"), rgb, decoded.codecOptions);
    const settings = structuredClone(decoded.settings);
    settings.layers[0].bypass = [matrixPosition(0)];
    settings.layers[0].exclude = [matrixPosition(1)];
    // A shortcut with layers, so how it turns them on can change too.
    settings.customKeyShortcuts[3] = {mods: 0, keys: [], layers: 1 << 3, layerKind: 0};
    value = rewrite(value, PROFILE_DOMAINS.find(row => row.key === "settings"), settings, decoded.codecOptions);
    const modes = structuredClone(decoded.pdModes);
    modes[0] = {...structuredClone(modes[4]), id: 0, axis: 3, name: "Eight-way", emptyDirection: 1, directionOutput: 1};
    const tap = () => ({keycode: 4, modifierPolicy: 1, mask: 1});
    for (const direction of Object.keys(modes[0].directions)) modes[0].directions[direction] = tap();
    for (const diagonal of Object.keys(modes[0].diagonals)) modes[0].diagonals[diagonal] = tap();
    // Linked, its key turning layers on and another layer ending it, so every
    // link field can change.
    Object.assign(modes[0], {linkedLayers: 1 << 6, linkTurnsOn: (1 << 6) | (1 << 9), linkEnds: 2});
    modes[1] = {...decoded.pdModes[0], id: 1};
    // A copy starts from another layer: a layer starts one mode.
    modes[8] = {...structuredClone(modes[0]), id: 8, linkedLayers: 1 << 7, linkTurnsOn: 1 << 9, linkEnds: 1};
    for (const output of Object.values(modes[8].diagonals)) { output.modifierPolicy = 0; output.mask = 0; }
    value = rewrite(value, PROFILE_DOMAINS.find(row => row.key === "pdModes"), modes, decoded.codecOptions);
    const behaviors = structuredClone(decoded.behaviors);
    const repeating = behaviors.rows.flatMap(row => row.steps).find(step => step.longHold);
    repeating.longHold.style = 3; repeating.longHold.repeatHz = 100;
    return rewrite(value, PROFILE_DOMAINS.find(row => row.key === "behaviors"), behaviors, decoded.codecOptions);
}

// These fields describe canonical identity or are computed by decoding. They
// cannot be edited independently of their record or schema. Every exemption
// is an exact path, so a new decoded field must acquire a mutation below.
const DERIVED = new Map([
    ["rgb.formatVersion", "codec version"], ["rgb.groups[].id", "canonical group index"],
    ["rgb.layerColors[].layerId", "canonical layer index"], ["rgb.pdModeColors[].pdModeId", "canonical pointing index"],
    ["behaviors.version", "codec version"], ["behaviors.rowCount", "decoded row count"],
    ["behaviors.populatedStepCount", "decoded step count"], ["behaviors.byteLength", "encoded byte length"],
    ["combos.version", "codec version"], ["combos.rows[].id", "canonical row index"],
    ["settings.formatVersion", "codec version"], ["pdModes[].id", "canonical slot index"],
]);
const shape = path => path.map(part => typeof part === "number" ? "[]" : part).join(".").replaceAll(".[]", "[]");
function leaves(value, path = []) {
    if (value !== null && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => leaves(child, [...path, Array.isArray(value) ? Number(key) : key]));
    return [{path, value}];
}
const read = (value, path) => path.reduce((current, part) => current[part], value);
function set(value, path, next) { read(value, path.slice(0, -1))[path.at(-1)] = next; }
function candidates(value) {
    if (typeof value === "boolean") return [!value];
    if (typeof value === "string") return [value ? "" : "Review coverage", "Review coverage"];
    if (value === null) return [75];
    return [...new Set([value + 1, value - 1, value ^ 1, 0, 1, 2, 3, 4, 5, 6, 100, 200, 400])].filter(next => next !== value);
}

test("every editable decoded field has a specific review item", () => {
    const base = completeFixture(), decoded = validateSnapshot(base), before = snapshot(base);
    const missed = [], unmutated = [];
    for (const codec of PROFILE_DOMAINS.filter(codec => codec.document === "profile")) {
        const model = codec.key === "keymap" ? decoded.layers : codec.key === "macros" ? decoded.macroSlots.map(bytes => [...bytes]) : decoded[codec.key], inventory = new Map();
        for (const leaf of leaves(model)) {
            // Each setting ID has a separate acceptance rule and presentation.
            const id = codec.key === "settings" && leaf.path[0] === "values" ? `settings.values[${leaf.path[1]}]` : shape([codec.key, ...leaf.path]);
            if (!inventory.has(id)) inventory.set(id, []);
            inventory.get(id).push(leaf);
        }
        for (const [id, examples] of inventory) {
            if (DERIVED.has(id)) continue;
            // Reserved action flags and retired settings have exactly one
            // accepted value. Changing them is a rejected encoding, no edit.
            if (id.endsWith(".flags")) {
                assert.ok(examples.every(row => row.value === 0), `${id}: reserved flags changed`);
                continue;
            }
            const setting = /^settings.values\[(\d+)\]$/.exec(id);
            if (setting && FIELDS[Number(setting[1])].min === 0 && FIELDS[Number(setting[1])].max === 0) continue;
            let exercised = false;
            outer: for (const {path, value} of examples) for (const next of candidates(value)) {
                const changed = structuredClone(model); set(changed, path, next);
                // A discriminant change clears the old engine's union, as
                // the editor does. Canonical inactive bytes must be zero.
                if (id === "pdModes[].kind" && next === 0) changed[path[0]] = {id: path[0], kind: 0, name: changed[path[0]].name};
                let after;
                try {
                    after = rewrite(base, codec, codec.key === "macros" ? changed.map(bytes => Buffer.from(bytes)) : changed, decoded.codecOptions);
                    // Reject candidates that the codec drops (inactive union
                    // fields) or that violate a complete-document invariant.
                    const result = validateSnapshot(after);
                    const accepted = codec.key === "keymap" ? result.layers : codec.key === "macros" ? result.macroSlots : result[codec.key];
                    if (read(accepted, path) === value || read(accepted, path) !== next) continue;
                } catch (error) {
                    // Invalid candidate values are expected; an unrelated
                    // exception in a codec or the harness is a test failure.
                    if (!(error instanceof RangeError) && (!error || typeof error.code !== "string")) throw error;
                    continue;
                }
                exercised = true;
                const items = profileReview(before, snapshot(after));
                if (!items.some(row => row.unit !== "profile" && row.fields.length)) missed.push(`${id} (${JSON.stringify(value)} → ${JSON.stringify(next)})`);
                break outer;
            }
            if (!exercised) unmutated.push(id);
        }
    }
    assert.deepEqual({unmutated, missed}, {unmutated: [], missed: []}, "each editable field needs a valid stored mutation and a specific review item");
});

test("layout keys and authored macro bytes produce review items", () => {
    const base = document(), before = snapshot(base);
    const layout = structuredClone(base); editLayers(layout, layers => layers[0][matrixPosition(0)] = 4);
    assert.ok(profileReview(before, snapshot(layout)).some(row => row.unit.startsWith("layout:")));
    const macro = structuredClone(base);
    editMacros(macro, macros => macros[0] = Buffer.from("A").toString("base64"));
    assert.ok(profileReview(before, snapshot(macro)).some(row => row.unit === "macro:0"));
});

test("a disabled pointing slot's retained name is reviewed", () => {
    const base = completeFixture(), decoded = validateSnapshot(base);
    const modes = structuredClone(decoded.pdModes);
    const slot = modes.find(row => !row.kind && !row.name);
    slot.name = "Reserved mode";
    const after = rewrite(base, PROFILE_DOMAINS.find(row => row.key === "pdModes"), modes, decoded.codecOptions);
    const [item] = profileReview(snapshot(base), snapshot(after));
    assert.equal(item.unit, `pd:${slot.id}`);
    assert.deepEqual(item.fields, [{label: "Name", status: "added", before: null, after: "Reserved mode"}]);
});

test("clearing a stored name identical to its fallback explains both sides", () => {
    const base = completeFixture(), decoded = validateSnapshot(base), settings = structuredClone(decoded.settings);
    settings.names[0] = "";
    const after = rewrite(base, PROFILE_DOMAINS.find(row => row.key === "settings"), settings, decoded.codecOptions);
    const [item] = profileReview(snapshot(base), snapshot(after));
    assert.equal(item.unit, "layerName:0");
    assert.deepEqual(item.fields, [{label: "Name", status: "changed", before: 'Base · stored name "Base"', after: "Base · no stored name"}]);
});
