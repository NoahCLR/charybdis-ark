"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {comboReach, publishedComboReach} = require("../../core/model/combo-reach");
const {compileLayerAnswers} = require("../../core/model/layer-resolution");

// A stack as the model publishes it: each layer's keys, by name, and the
// compiled answers (only transparency matters to them).
/** @param {string[][]} keycodes */
function stackOf(keycodes) {
    const answers = compileLayerAnswers(keycodes.map((row) => row.map((keycode) => keycode === "KC_TRANSPARENT" ? 1 : 0)));
    return keycodes.map((row, index) => ({index, name: `Layer ${index}`, positions: row.map((keycode, layoutIndex) => ({layoutIndex, keycode})), answers: answers[index]}));
}
const DF = {inputs: ["KC_D", "KC_F"]};

test("a combo fires from a layer whose keys carry every input under one activation, with the smallest hold", () => {
    const stack = stackOf([["KC_D", "KC_F", "KC_J"], ["KC_TRANSPARENT", "KC_1", "KC_J"], ["KC_TRANSPARENT", "KC_TRANSPARENT", "KC_F"]]);
    const [base, numbers, top] = comboReach(stack, [DF], []);
    assert.deepEqual(base[0], {fires: true, covered: 2, held: [], keys: [
        {layer: 0, layoutIndex: 0, fellThrough: false, whileHeld: false}, {layer: 0, layoutIndex: 1, fellThrough: false, whileHeld: false}]});
    assert.equal(numbers[0].fires, false, "Numbers stores 1 where F is");
    assert.equal(numbers[0].covered, 1, "and its best hold covers one input");
    assert.deepEqual(top[0].held, [], "base answers D on the top layer, and the top layer stores F itself");
    assert.deepEqual(top[0].keys.map((key) => [key.layer, key.layoutIndex, key.fellThrough]), [[0, 0, true], [0, 1, true], [2, 2, false]], "F on two keys, either presses it");
});

test("under Combo Layer Matching a layer matches its reference layer's raw keys, and nothing else", () => {
    const stack = stackOf([["KC_D", "KC_F"], ["KC_1", "KC_2"]]);
    const [, matched] = comboReach(stack, [DF], [0, 0]);
    assert.deepEqual(matched[0], {fires: true, covered: 2, held: [], keys: [
        {layer: 0, layoutIndex: 0, fellThrough: false, whileHeld: false, reference: true}, {layer: 0, layoutIndex: 1, fellThrough: false, whileHeld: false, reference: true}]});
    assert.equal(comboReach(stack, [DF], [])[1][0].fires, false, "matched on its own keys it never forms");
});

test("a combo whose inputs a device reports by position matches those positions", () => {
    const stack = stackOf([["KC_D", "KC_F", "KC_J"]]);
    assert.deepEqual(comboReach(stack, [{inputs: ["KC_D", "KC_F"], inputPositions: [0, 2]}], [])[0][0].keys.map((key) => key.layoutIndex), [0, 2]);
});

test("no combos reach nothing, and the published reach is the same for the same keys and combos", () => {
    const stack = stackOf([["KC_D", "KC_F"]]);
    assert.deepEqual(comboReach(stack, [], []), [[]]);
    assert.equal(publishedComboReach(stack, [DF], [0]), publishedComboReach(stackOf([["KC_D", "KC_F"]]), [{...DF}], [0]), "kept by what it reads");
});

test("the published reach is worked out again once anything it reads changes", () => {
    const keys = [["KC_A", "KC_B"], ["KC_D", "KC_F"], ["KC_TRANSPARENT", "KC_TRANSPARENT"]];
    const kept = publishedComboReach(stackOf(keys), [DF], []);
    assert.equal(kept[2][0].held.length, 1, "Layer 1 is held for it");
    const defaults = stackOf(keys);
    defaults[1].alwaysOn = true;
    assert.deepEqual(publishedComboReach(defaults, [DF], [])[2][0].held, [], "a default layer is on already");
    assert.equal(publishedComboReach(stackOf([["KC_A", "KC_B"], ["KC_D", "KC_1"], ["KC_TRANSPARENT", "KC_TRANSPARENT"]]), [DF], [])[2][0].fires, false, "a key changed");
    assert.equal(publishedComboReach(stackOf(keys), [{inputs: ["KC_A", "KC_B"]}], [])[2][0].held.length, 0, "a combo changed");
    assert.equal(publishedComboReach(stackOf(keys), [DF], [0, 0, 0])[2][0].fires, false, "its matching changed");
    assert.equal(publishedComboReach(stackOf(keys), [DF], []), kept, "and the same again is kept");
});

test("a lower layer is held only when one of its keys presses an input, and two may be held together", () => {
    const hidden = stackOf([["KC_D", "KC_F"], ["KC_NO", "KC_TRANSPARENT"], ["KC_TRANSPARENT", "KC_TRANSPARENT"]]);
    assert.deepEqual(comboReach(hidden, [DF], [])[2][0].held, [], "holding Layer 1 only hides D");
    const apart = stackOf([["KC_A", "KC_B"], ["KC_D", "KC_TRANSPARENT"], ["KC_TRANSPARENT", "KC_F"], ["KC_TRANSPARENT", "KC_TRANSPARENT"]]);
    const [, , , top] = comboReach(apart, [DF], []);
    assert.deepEqual(top[0], {fires: true, covered: 2, held: [1, 2], keys: [
        {layer: 1, layoutIndex: 0, fellThrough: true, whileHeld: true}, {layer: 2, layoutIndex: 1, fellThrough: true, whileHeld: true}]});
    const blocked = stackOf([["KC_D", "KC_F"], ["KC_TRANSPARENT", "KC_NO"], ["KC_TRANSPARENT", "KC_F"], ["KC_TRANSPARENT", "KC_TRANSPARENT"]]);
    assert.deepEqual(comboReach(blocked, [DF], [])[3][0].held, [], "base answers both, so nothing need be held");
    const hiding = stackOf([["KC_D", "KC_1"], ["KC_TRANSPARENT", "KC_F"], ["KC_NO", "KC_TRANSPARENT"], ["KC_TRANSPARENT", "KC_TRANSPARENT"]]);
    assert.deepEqual(comboReach(hiding, [DF], [])[3][0], {fires: true, covered: 2, held: [1], keys: [
        {layer: 0, layoutIndex: 0, fellThrough: true, whileHeld: false}, {layer: 1, layoutIndex: 1, fellThrough: true, whileHeld: true}]}, "Layer 2 is never held, as it hides D");
});

test("a combo whose keys a default layer answers needs nothing held", () => {
    const stack = stackOf([["KC_A", "KC_B"], ["KC_D", "KC_F"], ["KC_TRANSPARENT", "KC_TRANSPARENT"]]);
    stack[1].alwaysOn = true;
    assert.deepEqual(comboReach(stack, [DF], [])[2][0], {fires: true, covered: 2, held: [], keys: [
        {layer: 1, layoutIndex: 0, fellThrough: true, whileHeld: false}, {layer: 1, layoutIndex: 1, fellThrough: true, whileHeld: false}]});
});

// The answer trying every hold of every lower layer would give, written from
// the definition: the smallest hold that forms the chord, the first of that
// size in hold order, or else the first hold covering the most inputs.
/** @param {any[]} stack @param {any[]} combos */
function everyHold(stack, combos) {
    const {alwaysOnMask, answeringCandidate} = require("../../rules/layer-answers.mjs");
    const {comboKeysAmong} = require("../../rules/combo-inputs.mjs");
    const always = alwaysOnMask(stack);
    return stack.map((_, at) => {
        const lower = Array.from({length: at}, (_, layer) => layer).filter((layer) => !(always & (1 << layer)));
        /** @type {number[][]} */
        const holds = [[]];
        for (const layer of lower) for (const held of [...holds]) holds.push([...held, layer]);
        return combos.map((combo) => {
            let fires = null, most = null;
            for (const held of holds) {
                const active = held.reduce((mask, layer) => mask | (1 << layer), always | (1 << at));
                const keys = stack[at].positions.flatMap((position) => {
                    const answer = answeringCandidate(stack[at].answers[position.layoutIndex], active);
                    return answer ? [{layer: answer.layer, layoutIndex: position.layoutIndex, fellThrough: answer.layer !== at, whileHeld: answer.layer !== at && !(always & (1 << answer.layer))}] : [];
                });
                const found = comboKeysAmong(keys.map((key) => stack[key.layer].positions[key.layoutIndex]), combo);
                const touched = keys.filter((key) => found.keys.includes(stack[key.layer].positions[key.layoutIndex]));
                if (!most || found.covered > most.covered) most = {keys: touched, held, covered: found.covered};
                if (found.forms && (!fires || held.length < fires.held.length)) fires = {keys: touched, held, covered: found.covered};
            }
            return fires ? {fires: true, covered: fires.covered, keys: fires.keys, held: fires.held}
                : {fires: false, covered: most?.covered || 0, keys: most?.keys || [], held: []};
        });
    });
}

test("the reach is the one trying every hold would give, on seeded stacks", () => {
    let seed = 1;
    const next = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x80000000; };
    const names = ["KC_A", "KC_B", "KC_C", "KC_D", "KC_NO"];
    for (let round = 0; round < 60; round++) {
        const layers = 2 + Math.floor(next() * 6), width = 3 + Math.floor(next() * 4);
        const stack = stackOf(Array.from({length: layers}, (_, layer) => Array.from({length: width}, () =>
            layer && next() < 0.5 ? "KC_TRANSPARENT" : names[Math.floor(next() * names.length)])));
        for (const layer of stack) if (layer.index && next() < 0.15) layer.alwaysOn = true;
        const combos = Array.from({length: 4}, () => ({inputs: [...new Set(Array.from({length: 2 + Math.floor(next() * 2)}, () => names[Math.floor(next() * 4)]))]}));
        assert.deepEqual(comboReach(stack, combos, []), everyHold(stack, combos), `round ${round}`);
    }
});

test("a combo whose keys every lower layer repeats is found without trying every hold", () => {
    const row = Array.from({length: 56}, (_, index) => `KC_${String.fromCharCode(65 + (index % 26))}`);
    const stack = stackOf([...Array.from({length: 15}, () => row), row.map(() => "KC_TRANSPARENT")]);
    const combos = Array.from({length: 128}, (_, index) => ({inputs: [row[index % 26], row[(index * 7 + 3) % 26 === index % 26 ? (index + 1) % 26 : (index * 7 + 3) % 26]]}));
    const started = performance.now();
    const reach = comboReach(stack, combos, []);
    assert.ok(performance.now() - started < 1000, "fourteen layers to hold, 128 combos, well under a second");
    assert.ok(reach[15].every((found) => found.fires && found.held.length === 0), "base answers them all, with nothing held");
});

test("a combo whose inputs share one key on every layer is found unformable without trying every hold", () => {
    // Each input is on one key, alternating layer by layer, so no hold puts
    // both down at once.
    const rows = Array.from({length: 15}, (_, layer) => Array.from({length: 56}, (_, position) => `KC_${position}_${layer % 2}`));
    const stack = stackOf([...rows, rows[0].map(() => "KC_TRANSPARENT")]);
    const combos = Array.from({length: 128}, (_, index) => ({inputs: [`KC_${index % 56}_0`, `KC_${index % 56}_1`]}));
    const started = performance.now();
    const reach = comboReach(stack, combos, []);
    assert.ok(performance.now() - started < 1000, "fourteen layers to hold, 128 combos, well under a second");
    assert.ok(reach[15].every((found) => !found.fires && found.covered === 1), "each covers one input at most");
});
