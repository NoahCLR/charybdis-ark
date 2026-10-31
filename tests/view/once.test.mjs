// webview/lib/once.mjs: work done on first read and kept, once, once per
// key, and once per owner and key.
import assert from "node:assert/strict";
import test from "node:test";
import {keptPer, once, onceEach} from "../../webview/lib/once.mjs";

test("work done once is done on first read, and its answer kept, undefined included", () => {
    let runs = 0;
    const answer = once(() => {runs++; return undefined;});
    assert.equal(runs, 0, "nothing until read");
    assert.equal(answer(), undefined);
    assert.equal(answer(), undefined);
    assert.equal(runs, 1);
});

test("work done once for each key is done when first asked with that key", () => {
    const asked = [];
    const at = onceEach((key) => {asked.push(key); return {key};});
    assert.equal(at(1), at(1), "the same key gives the same answer");
    assert.notEqual(at(1), at(2));
    assert.equal(at(undefined), at(undefined));
    assert.deepEqual(asked, [1, 2, undefined]);
});

test("values kept per owner and key are worked out once, and an owner's are its own", () => {
    const kept = keptPer();
    const model = {}, other = {};
    let runs = 0;
    const work = () => ({run: ++runs});
    assert.equal(kept(model, "a", work), kept(model, "a", work));
    assert.notEqual(kept(model, "a", work), kept(model, "b", work));
    assert.notEqual(kept(model, "a", work), kept(other, "a", work), "another owner works it out again");
    assert.equal(runs, 3);
});
