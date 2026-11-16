import assert from "node:assert/strict";
import test from "node:test";
import {VIA_LEFT_SHOWN, fitsLine, viaCallout, viaClearChoices, viaLeftOut} from "../../webview/view/backups.mjs";

test("a file within the keyboard's memory fits, up to and at capacity", () => {
    assert.deepEqual(fitsLine({used: 5408, capacity: 130048}), {text: "This file fits: 5,408 of 130,048 bytes", warn: false});
    assert.deepEqual(fitsLine({used: 130048, capacity: 130048}), {text: "This file fits: 130,048 of 130,048 bytes", warn: false});
});

test("a file larger than the keyboard's memory says it does not fit, as a warning", () => {
    const line = fitsLine({used: 140000, capacity: 130048});
    assert.deepEqual(line, {text: "This file does not fit: 140,000 bytes, and this keyboard holds 130,048.", warn: true});
    assert.doesNotMatch(line.text, /fits:/);
});

const NAMES = ["Base", "Layer 1", "Layer 2", "Layer 3", "Layer 4"];
const KEEP = {behaviors: false, combos: false, customKeys: false};
const via = (keys = [], macros = 0, layers = 4, clear = KEEP, clearable = {behaviors: 0, combos: 0, customKeys: 0}, pointer = null) => ({layers, macros: 2, clear, clearable, pointer,
    left: {keys: keys.map(([layer, spelling], position) => ({layer, layerName: NAMES[layer], position, spelling, reason: `${spelling} reason.`})),
        macros: Array.from({length: macros}, (_, slot) => ({slot, name: `Macro ${slot}`, reason: "It is not text."}))}});

test("a VIA layout's callout says which layers it replaces, by the sheet's names, and what stays", () => {
    assert.match(viaCallout(via(), NAMES), /^A VIA layout holds keys and macros only\. Its 4 layers replace Base to Layer 3, and every layer above is emptied;/);
    assert.match(viaCallout(via([], 0, 1), NAMES), /Its 1 layer replaces Base,/);
    assert.match(viaCallout(via(), NAMES), /Behaviours, combos, custom keys, pointing modes and the rest of lighting and settings stay as they are\.$/);
});

test("what a VIA layout left out is listed once per key it names, with its layers, and the rest counted", () => {
    assert.equal(viaLeftOut(via()), null);
    assert.deepEqual(viaLeftOut(via([[1, "NOT_A_KEY"]], 1)), {heading: "Left empty: 1 key and 1 macro Ark cannot bring from this file",
        lines: ["NOT_A_KEY on Layer 1: NOT_A_KEY reason.", "Macro 0: It is not text."], more: ""});
    // The same key on several positions and layers is one line.
    assert.deepEqual(viaLeftOut(via([[3, "CUSTOM(82)"], [4, "CUSTOM(82)"], [4, "CUSTOM(82)"], [0, "CUSTOM(80)"]]))?.lines,
        ["CUSTOM(82) on Layer 3 and Layer 4 (3 keys): CUSTOM(82) reason.", "CUSTOM(80) on Base: CUSTOM(80) reason."]);
    const many = /** @type {NonNullable<ReturnType<typeof viaLeftOut>>} */ (viaLeftOut(via(Array.from({length: 10}, (_, index) => [1, `KEY_${index}`]), 2)));
    assert.equal(many.heading, "Left empty: 10 keys and 2 macros Ark cannot bring from this file");
    assert.equal(many.lines.length, VIA_LEFT_SHOWN);
    assert.equal(many.more, `and ${12 - VIA_LEFT_SHOWN} more`);
});

test("the callout says what a blank slate removes, and what stays", () => {
    const has = {behaviors: 3, combos: 2, customKeys: 1};
    const text = viaCallout(via([], 0, 4, {behaviors: true, combos: false, customKeys: true}, has), NAMES);
    assert.match(text, /Your draft's behaviours and custom keys are removed\. Combos, pointing modes and the rest of lighting and settings stay as they are\.$/);
    assert.match(viaCallout(via([], 0, 4, {behaviors: true, combos: true, customKeys: true}, has), NAMES), /behaviours, combos and custom keys are removed\. Pointing modes and the rest of lighting and settings stay/);
    // A kind the draft has none of is not said to go.
    assert.match(viaCallout(via([], 0, 4, {behaviors: true, combos: true, customKeys: true}, {...has, combos: 0}), NAMES), /Your draft's behaviours and custom keys are removed\. Combos, pointing modes/);
});

test("the blank slate is asked only for what the draft has, each kind on its own switch", () => {
    assert.equal(viaClearChoices(via()), null);
    const asked = viaClearChoices(via([], 0, 4, {...KEEP, combos: true}, {behaviors: 12, combos: 1, customKeys: 0}));
    assert.deepEqual(asked, {
        intro: "Start from a blank slate? A VIA layout has no behaviours or combos, so your draft's own are removed unless you keep them. Kept, they still turn on their layers.",
        choices: [{kind: "behaviors", checked: false, label: "Remove the draft's 12 behaviours"}, {kind: "combos", checked: true, label: "Remove the draft's combo"}]});
    assert.equal(viaClearChoices(via([], 0, 4, KEEP, {behaviors: 0, combos: 0, customKeys: 3}))?.choices[0].label, "Remove the draft's 3 custom keys, with their behaviours");
});

test("the callout says where the file put the pointer layer, or that Auto-mouse is off", () => {
    assert.match(viaCallout(via([], 0, 4, KEEP, undefined, {layer: 3, layerName: "Layer 3", change: "moved"}), NAMES), /The pointer layer is now Layer 3, the file's layer with mouse buttons\./);
    assert.match(viaCallout(via([], 0, 4, KEEP, undefined, {layer: 3, layerName: "Layer 3", change: "off"}), NAMES), /Auto-mouse is turned off: no layer of this file above Base has mouse buttons\./);
    assert.doesNotMatch(viaCallout(via(), NAMES), /pointer|Auto-mouse/);
});
