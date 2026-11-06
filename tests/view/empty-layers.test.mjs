import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {emptyLayers, emptyLayersLabel, foldEmptyLayers} from "../../webview/view/empty-layers.mjs";

// The test profile names layers 0 to 7 and leaves 8 to 15 unnamed, with
// nothing on any key, as core publishes it (tests/fixtures/published-model.js).
const require = createRequire(import.meta.url);
const {profileDocument, publishedModel} = require("../fixtures/published-model.js");
const {SETTING} = require("../../core/schema/settings-domain-v1");
const UNNAMED = [8, 9, 10, 11, 12, 13, 14, 15];
const emptyOf = (described = {}) => [...emptyLayers(publishedModel(profileDocument(described)))];

test("a layer with no name, no keys and nothing that uses it is empty; the base and named layers are not", () => {
    assert.deepEqual(emptyOf(), UNNAMED);
    assert.deepEqual([...emptyLayers(null)], []);
    assert.deepEqual([...emptyLayers({layers: []})], []);
});

test("a key mapped on a layer, or a name of its own, keeps it from being empty", () => {
    assert.deepEqual(emptyOf({keys: {9: {3: "KC_A"}}}), UNNAMED.filter((layer) => layer !== 9));
    // Transparent and disabled keys keep the layer underneath, so map nothing.
    assert.deepEqual(emptyOf({keys: {9: {3: "KC_TRANSPARENT", 4: "KC_NO"}}}), UNNAMED);
    assert.deepEqual(emptyOf({settings: (settings) => {settings.names[11] = "Gaming";}}), UNNAMED.filter((layer) => layer !== 11));
});

test("a layer something turns on is not empty: a layer key anywhere in the profile, a combo's output included", () => {
    assert.deepEqual(emptyOf({keys: {0: {3: "MO(10)"}}}), UNNAMED.filter((layer) => layer !== 10));
    assert.deepEqual(emptyOf({keys: {1: {3: "LT(12, KC_A)"}}}), UNNAMED.filter((layer) => layer !== 12));
    assert.deepEqual(emptyOf({combos: [{inputs: ["KC_A", "KC_B"], output: "TG(13)"}]}), UNNAMED.filter((layer) => layer !== 13));
});

test("a default layer, the pointer layer, and a layer combos match on or by another are not empty", () => {
    assert.deepEqual(emptyOf({settings: (settings) => {settings.values[SETTING.DEFAULT_LAYERS] |= 2 ** 15;}}), UNNAMED.filter((layer) => layer !== 15));
    assert.deepEqual(emptyOf({settings: (settings) => {settings.values[SETTING.AUTO_MOUSE_LAYER] = 14;}}), UNNAMED.filter((layer) => layer !== 14));
    assert.deepEqual(emptyOf({settings: (settings) => {settings.layers[9].reference = 1;}}), UNNAMED.filter((layer) => layer !== 9), "matching on another layer");
    assert.deepEqual(emptyOf({settings: (settings) => {settings.layers[2].reference = 10;}}), UNNAMED.filter((layer) => layer !== 10), "matched on by another layer");
});

test("a key on a layer with Use behaviour or Join combos off keeps that layer", () => {
    assert.deepEqual(emptyOf({settings: (settings) => {settings.layers[12].bypass = [3];}}), UNNAMED.filter((layer) => layer !== 12));
    assert.deepEqual(emptyOf({settings: (settings) => {settings.layers[13].exclude = [3];}}), UNNAMED.filter((layer) => layer !== 13));
});

test("a layer colour that paints, or an LED override the layer owns, keeps it", () => {
    const model = publishedModel(profileDocument());
    const lit = {...model, rgb: {...model.rgb, layerColors: model.rgb.layerColors.map((row) => row.layerId === 9 ? {...row, color: {h: "10", s: "255", v: "200"}} : row)}};
    assert.deepEqual([...emptyLayers(lit)], UNNAMED.filter((layer) => layer !== 9));
    const black = {...model, rgb: {...model.rgb, layerColors: model.rgb.layerColors.map((row) => row.layerId === 9 ? {...row, color: {h: "10", s: "255", v: "0"}} : row)}};
    assert.deepEqual([...emptyLayers(black)], UNNAMED.filter((layer) => layer !== 9), "black paints the LEDs dark");
    const overridden = {...model, rgb: {...model.rgb, layerAccents: [{index: 0, owner: "x", color: {h: "0", s: "0", v: "0"}, ledGroup: "g", ledGroupKind: "k", ledIndices: [1], ownerLayer: 10}]}};
    assert.deepEqual([...emptyLayers(overridden)], UNNAMED.filter((layer) => layer !== 10));
});

test("a pointing mode a layer starts keeps that layer", () => {
    const model = publishedModel(profileDocument());
    const started = {...model, pdModes: model.pdModes.map((slot, id) => id === 3 ? {...slot, linkedLayers: 2 ** 11} : slot)};
    assert.deepEqual([...emptyLayers(started)], UNNAMED.filter((layer) => layer !== 11));
});

// Ark does not know the firmware's compiled defaults, so a per-layer switch
// on a Settings screen counts as set where it differs from most empty layers'.
test("a Settings switch an empty layer holds apart from the others keeps it; an even split keeps them all", () => {
    assert.deepEqual(emptyOf({settings: (settings) => {settings.values[SETTING.AUTO_SNIPING_LAYERS] |= 2 ** 9;}}), UNNAMED.filter((layer) => layer !== 9));
    assert.deepEqual(emptyOf({settings: (settings) => {settings.values[SETTING.LAYER_COMBOS] &= ~(2 ** 12);}}), UNNAMED.filter((layer) => layer !== 12));
    // Every empty layer's switch off alike is how they all came: nothing stands out.
    assert.deepEqual(emptyOf({settings: (settings) => {settings.values[SETTING.LAYER_BEHAVIORS] &= 0xff;}}), UNNAMED);
    assert.deepEqual(emptyOf({settings: (settings) => {settings.values[SETTING.AUTO_SNIPING_LAYERS] |= 0x0f00;}}), [], "four on, four off");
});

test("a list folds its empty layers in order, apart from those its place keeps", () => {
    const model = publishedModel(profileDocument());
    const items = model.layers.map((layer) => ({layer: layer.index}));
    const {shown, folded} = foldEmptyLayers(model, items, (item) => item.layer, (item) => item.layer === 9);
    assert.deepEqual(shown.map((item) => item.layer), [0, 1, 2, 3, 4, 5, 6, 7, 9]);
    assert.deepEqual(folded.map((item) => item.layer), [8, 10, 11, 12, 13, 14, 15]);
    assert.deepEqual(foldEmptyLayers(null, items, (item) => item.layer).folded, [], "with no model, nothing folds");
});

test("the disclosure counts the layers it holds", () => {
    assert.equal(emptyLayersLabel(8), "8 empty layers");
    assert.equal(emptyLayersLabel(1), "1 empty layer");
});
