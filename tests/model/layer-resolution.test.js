"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {compileLayerAnswers, answeringLayer} = require("../../core/model/layer-resolution");

test("answers preserve transparency, inactive holds and disabled blockers", () => {
    const codes = [[4, 5, 1], [6, 0, 1], [1, 1, 1]];
    const answers = compileLayerAnswers(codes);
    assert.deepEqual(answers[2], [
        [{layer: 1, active: 2, blocked: 0}, {layer: 0, active: 1, blocked: 2}],
        [{layer: 1, active: 2, blocked: 0}, {layer: 0, active: 1, blocked: 2}], [],
    ]);
    assert.deepEqual(answers[1][0], [{layer: 1, active: 2, blocked: 0}], "a mapped top key has no lower alternatives");
    assert.equal(answeringLayer(answers[2][0], 5), 0);
    assert.equal(answeringLayer(answers[2][0], 7), 1);
    assert.equal(answeringLayer(answers[2][1], 7), 1, "KC_NO blocks the base key");
    assert.equal(answeringLayer(answers[2][2], 7), null, "all-transparent positions have no answer");
    assert.equal(answeringLayer(undefined, 1), null);
    assert.deepEqual(codes, [[4, 5, 1], [6, 0, 1], [1, 1, 1]], "compilation leaves the layout alone");
});

test("each hold combination selects the highest possible answering layer", () => {
    const answers = compileLayerAnswers([[4], [1], [5], [0], [1]])[4][0];
    assert.deepEqual([17, 19, 21, 23, 25, 27, 29, 31].map(active => answeringLayer(answers, active)),
        [0, 0, 2, 2, 3, 3, 3, 3]);
    assert.equal(answeringLayer(answers, 16), null, "an inactive base cannot invent an answer");
});

test("partial layouts skip missing positions without treating zero as missing", () => {
    const answers = compileLayerAnswers([[4, 5], [undefined, 0], [1, 1]]);
    assert.equal(answeringLayer(answers[2][0], 7), 0);
    assert.equal(answeringLayer(answers[2][1], 7), 1);
    assert.deepEqual(compileLayerAnswers([]), []);
});
