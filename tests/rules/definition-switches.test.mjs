import test from "node:test";
import assert from "node:assert/strict";
import {definitionReasons} from "../../rules/definition-switches.mjs";

test("a definition's own switches say why it does not run on a layer", () => {
    assert.deepEqual(definitionReasons({enabled: true, allowedLayers: 0b101}, 2), []);
    assert.deepEqual(definitionReasons({enabled: true, allowedLayers: 0b101}, 1), ["layers"]);
    assert.deepEqual(definitionReasons({enabled: false, allowedLayers: 0b101}, 1), ["definition", "layers"], "its switch first");
    assert.deepEqual(definitionReasons({enabled: false}, 15), ["definition"], "one that names no layers runs on every layer");
    assert.deepEqual(definitionReasons({}, 15), []);
    assert.deepEqual(definitionReasons(undefined, 0), [], "no definition has no switches");
});
