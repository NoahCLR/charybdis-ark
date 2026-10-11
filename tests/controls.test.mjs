// The commands without an edit payload, as webview/view/controls.mjs builds
// them. tests/edits.test.mjs stages the layer panel's through a real draft.
import assert from "node:assert/strict";
import test from "node:test";
import * as controls from "../webview/view/controls.mjs";

test("draft and read controls post their type and the one value they carry", () => {
    assert.deepEqual(controls.control("reviewProfileDraft"), {type: "reviewProfileDraft"});
    assert.deepEqual(controls.applyDraft(), {type: "applyProfileDraft"}, "no confirmation is claimed unless given");
    assert.deepEqual(controls.applyDraft(true), {type: "applyProfileDraft", confirmChecks: true});
    assert.deepEqual(controls.applyDraft(false), {type: "applyProfileDraft", confirmChecks: false});
    assert.deepEqual(controls.discardChanges(3), {type: "discardProfileDraftChanges", group: 3});
    assert.deepEqual(controls.jumpDraft(0), {type: "jumpProfileDraft", step: 0});
    assert.deepEqual(controls.selectDevice("kb"), {type: "selectDevice", deviceId: "kb"});
});

test("the layer panel posts every typed name with a toggle, a move and a save", () => {
    const names = ["Base", "Symbols"];
    assert.deepEqual(controls.saveLayers(names), {type: "savePortableLayers", names});
    assert.deepEqual(controls.layersFollow(false, names), {type: "editPortableLayer", keysFollow: false, names});
    assert.deepEqual(controls.moveLayer(1, {to: 3}, names), {type: "editPortableLayer", id: 1, to: 3, names});
    assert.deepEqual(controls.moveLayer(1, {direction: -1}, names), {type: "editPortableLayer", id: 1, direction: -1, names});
    assert.deepEqual(controls.moveLayer(1, {makeBase: true}, names), {type: "editPortableLayer", id: 1, makeBase: true, names});
});
