// The interface's reading of what core publishes, over seeded profiles.
// Whether a behaviour runs and a key joins a combo, as
// webview/view/participation.mjs reads the published participation by layer
// and layout index, must match core/model/participation.js answering from the
// settings themselves; the layer switches both read are core's, held by
// tests/model/participation.test.js. Which layer answers each key under the
// layers held (webview/view/layer-resolution.mjs) must match a scan of the
// stored keymap done here as the keyboard does it. Each must agree on every
// layer, key and definition.
import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {behaviourRuns, comboJoins} from "../../webview/view/participation.mjs";
import {resolvedPositions} from "../../webview/view/layer-resolution.mjs";

const require = createRequire(import.meta.url);
const portable = require("../../core/model/portable-profile");
const {buildSnapshotModel} = require("../../core/session/device-model");
const {DEMO_CAPABILITIES, DEMO_LIMITS, DEMO_OPTIONS} = require("../../core/session/demo-session");
const {document} = require("../fixtures/pd-profile");
const {editLayers, editSettings} = require("../fixtures/profile-document");
const {participation} = require("../../core/model/participation");
const {SETTING} = require("../../core/schema/settings-domain-v1");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, LAYERS, matrixPosition} = require("../../core/data/charybdis-layout");

// Every set of these layers that may be held together.
/** @param {number[]} layers */
const activationSets = (layers) => layers.reduce((/** @type {number[][]} */ sets, layer) => [...sets, ...sets.map((held) => [...held, layer])], [[]]);
/** @param {number} seed */
const random = (seed) => () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x80000000; };
const MATRIX = CHARYBDIS_4X6_LAYOUT_MATRIX.map((_, layoutIndex) => matrixPosition(layoutIndex));
/** @param {import("../../core/model/types.js").PortableDocument} doc */
const modelOf = (doc) => buildSnapshotModel({document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: DEMO_LIMITS, options: DEMO_OPTIONS},
    DEMO_CAPABILITIES, {editable: true, reason: null});

test("a behaviour runs, and a key joins a combo, where core says it does", () => {
    for (let seed = 1; seed <= 12; seed++) {
        const next = random(seed);
        const pick = () => MATRIX.filter(() => next() < 0.2).sort((a, b) => a - b);
        const doc = editSettings(document(), (settings) => {
            settings.values[SETTING.BEHAVIORS_ENABLED] = next() < 0.85 ? 1 : 0;
            settings.values[SETTING.COMBOS_ENABLED] = next() < 0.85 ? 1 : 0;
            settings.values[SETTING.LAYER_BEHAVIORS] = Math.floor(next() * 0x10000);
            settings.values[SETTING.LAYER_COMBOS] = Math.floor(next() * 0x10000);
            for (const record of settings.layers) { record.bypass = pick(); record.exclude = pick(); }
        });
        const model = modelOf(doc), core = participation(portable.validateSnapshot(doc).settings);
        const definitions = [{}, {enabled: false}, {allowedLayers: Math.floor(next() * 0x10000)}, {enabled: true, allowedLayers: 0xffff}, {allowedLayers: 0}];
        for (let layer = 0; layer < LAYERS; layer++) {
            for (const position of model.layers[layer].positions) {
                for (const definition of definitions) {
                    const where = `seed ${seed}, layer ${layer}, key ${position.layoutIndex}, ${JSON.stringify(definition)}`;
                    const behaviour = behaviourRuns(model, layer, position, definition), combo = comboJoins(model, layer, position, definition);
                    assert.equal(behaviour.runs, core.behaviorUsed(definition, layer, position.layoutIndex), `behaviour: ${where}`);
                    assert.equal(behaviour.reasons.length, core.reasons(definition, layer, position.layoutIndex, "behavior").length, `behaviour's reasons: ${where}`);
                    assert.equal(combo.joins, core.comboJoins(definition, layer, position.layoutIndex), `combo: ${where}`);
                    assert.equal(combo.reasons.length, core.reasons(definition, layer, position.layoutIndex, "combo").length, `combo's reasons: ${where}`);
                }
            }
        }
    }
});

// The keyboard scans the layers that are on from the top and takes the first
// key that is not transparent (KC_TRANSPARENT, 1); none answers when every
// layer on is transparent there.
/** @param {number[][]} layers @param {number} active @param {number} position */
const scan = (layers, active, position) => {
    for (let layer = layers.length - 1; layer >= 0; layer--) if (active & (1 << layer) && layers[layer][matrixPosition(position)] !== 1) return layer;
    return null;
};

test("each key answers from the layer the keyboard's scan finds, under every hold", () => {
    for (let seed = 1; seed <= 6; seed++) {
        const next = random(seed * 7919);
        /** @type {number[][]} */
        let stored = [];
        // About half the keys of each layer above base made transparent.
        const doc = editLayers(document(), (layers) => {
            layers.forEach((codes, layer) => { if (layer) for (const slot of MATRIX) if (next() < 0.5) codes[slot] = 1; });
            stored = layers.map((codes) => [...codes]);
        });
        const model = modelOf(doc);
        for (let at = 1; at < LAYERS; at++) {
            const between = Array.from({length: at - 1}, (_, index) => index + 1);
            const holds = activationSets(between).filter((_, index) => index < 8 || next() < 0.01);
            for (const held of holds) {
                const active = [0, at, ...held].reduce((mask, layer) => mask | (1 << layer), 0);
                const shown = new Map(resolvedPositions(model.layers, at, held).map((entry) => [entry.position.layoutIndex, entry.layer.index]));
                for (let position = 0; position < MATRIX.length; position++) {
                    assert.equal(shown.get(position) ?? null, scan(stored, active, position), `seed ${seed}, layer ${at}, held ${held}, key ${position}`);
                }
            }
        }
    }
});
