import assert from "node:assert/strict";
import {createRequire} from "node:module";
import test from "node:test";
import {answeringCandidate} from "../../rules/layer-answers.mjs";

// A transparent key on layer 3, over a key on layer 2, a transparent one on
// layer 1 and a key on base, compiled as core compiles it: layer 2 answers
// while on, and base while on with layer 2 off.
const candidates = [{layer: 2, active: 4, blocked: 0}, {layer: 0, active: 1, blocked: 4}];

// Whether one candidate answers, alone in its list.
const answersUnder = (candidate, active) => answeringCandidate([candidate], active) === candidate;

test("a candidate answers while its layer is on and no higher answering layer is", () => {
    assert.equal(answersUnder(candidates[1], 1), true);
    assert.equal(answersUnder(candidates[1], 3), true, "a transparent layer on blocks nothing");
    assert.equal(answersUnder(candidates[1], 5), false, "layer 2 on blocks base");
    assert.equal(answersUnder(candidates[1], 4), false, "an inactive base cannot answer");
    assert.equal(answersUnder(candidates[0], 13), true, "base and layer 3 on never block layer 2");
});

test("the first candidate that answers is the answer, as the firmware scans from the top", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 9, 12, 13].map(active => answeringCandidate(candidates, active)?.layer),
        [0, undefined, 0, 2, 2, 0, 2, 2]);
    assert.equal(answeringCandidate(candidates, 8), undefined, "only the transparent top on");
    assert.equal(answeringCandidate([], 15), undefined, "every layer transparent");
    assert.equal(answeringCandidate(undefined, 15), undefined, "a position the layer lacks");
    assert.equal(answeringCandidate(candidates, 1), candidates[1], "the candidate itself, not a copy");
});

test("core loads the same module synchronously", () => {
    const required = createRequire(import.meta.url)("../../rules/layer-answers.mjs");
    assert.equal(required.answeringCandidate, answeringCandidate);
});
