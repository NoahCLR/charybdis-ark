import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {keyBehaviour, keyReach, keyReachAt} from "../../webview/view/key-reach.mjs";
import {layerView} from "../../webview/view/layer-view.mjs";
import {customKeyShortcutMessage, macroMessage} from "../../webview/view/edits.mjs";
import {published} from "../fixtures/published-behaviours.mjs";

const {keyAt} = createRequire(import.meta.url)("../fixtures/published-model.js");

// A double tap that sends X: a row that changes something.
const tapX = {tapCount: 1, tap: {action: "KC_X"}};
// Only on Numbers, so not on Base.
const NUMBERS = 2;
const model = published({keys: {0: {0: "KC_A", 1: "KC_B", 2: "KC_C", 3: "KC_E", 4: "LT(2,KC_F)", 5: "LSFT_T(KC_G)", 6: "LT(3,KC_H)", 7: "LCTL_T(KC_J)", 8: "LT(1,KC_K)"}},
    behaviours: [{keycode: "KC_B", steps: [tapX]}, {keycode: "KC_C", allowedLayers: NUMBERS, steps: [tapX]}, {keycode: "KC_E", tapHoldTerm: "300", steps: []},
        {keycode: "LT(3,KC_H)", tapHoldTerm: "250", steps: []}, {keycode: "LCTL_T(KC_J)", allowedLayers: NUMBERS, steps: [tapX]},
        {keycode: "LT(1,KC_K)", tapHoldTerm: "220", steps: [tapX]}]});
const base = model.layers[0];
/** @param {number} layoutIndex */
const card = (layoutIndex) => keyBehaviour(model, base, keyAt(model, 0, layoutIndex));
const defaultTerm = {ms: model.behaviorTimingDefaults.tappingTerm};

test("a key with no row says nothing of one; a row that runs shows its branches", () => {
    assert.deepEqual((({behaviour, role, lead, branches}) => ({behaviour, role, lead, branches}))(card(0)), {behaviour: undefined, role: null, lead: null, branches: false});
    const runs = card(1);
    assert.equal(runs.behaviour?.keycode, "KC_B");
    assert.deepEqual([runs.use, runs.lead, runs.branches], [{runs: true, reasons: []}, null, true]);
});

test("a row a switch keeps off leads with why, and shows no branches", () => {
    const off = card(2);
    assert.deepEqual(off.lead, {kind: "off"});
    assert.equal(off.use.runs, false);
    assert.equal(off.use.reasons.length, 1, "the reason core words");
    assert.equal(off.branches, false);
});

test("a row that changes nothing says so, and why, in place of its details", () => {
    const inert = card(3);
    assert.equal(inert.behaviour?.changesNothing, true, "core judges it");
    assert.deepEqual(inert.lead, {kind: "inert"});
    assert.equal(inert.inertNote, "Its behaviour changes nothing: on this key a timing does nothing without a branch, so the key runs as if it had none.");
    assert.equal(inert.branches, false);
});

test("a dual-role key leads with its tap / hold, waiting the row's threshold only while the row runs", () => {
    const plain = card(4);
    assert.deepEqual(plain.role, {tap: "F", hold: {layer: 2, name: "Symbols"}});
    assert.deepEqual(plain.lead, {kind: "tapHold", term: defaultTerm, holdAction: "MO(2)", note: ""}, "a layer-tap holds its layer as the grid's Hold does");
    assert.deepEqual(card(5).lead, {kind: "tapHold", term: defaultTerm, holdAction: "", note: ""}, "a mod-tap holds its modifier");

    const timed = card(6);
    assert.equal(timed.lead?.kind === "tapHold" && timed.lead.term.ms, "250", "a row with no branches still waits its own threshold");
    assert.equal(timed.branches, false, "and shows no branch section");

    const off = card(7);
    assert.deepEqual(off.lead, {kind: "tapHold", term: defaultTerm, holdAction: "",
        note: `Its behaviour is not used: ${off.use.reasons.join("; ")}. The key keeps this tap and hold.`}, "a row that does not run is ignored, its threshold with it");
    assert.equal(off.branches, false);

    const branched = card(8);
    assert.equal(branched.lead?.kind === "tapHold" && branched.lead.term.ms, "220");
    assert.equal(branched.branches, true);
});

// What else a key reaches, each part there only when the card shows it: a
// macro on Base, Dragscroll and the empty slot 6, a custom key with a
// shortcut and one without, and the combos Q+W (sending B, whose behaviour
// runs), Q+E (sending the custom key with a shortcut) and, only on Numbers,
// Q+R.
const reaching = published({keys: {0: {10: "MACRO_2", 11: "PD_MODE_0", 12: "PD_MODE_6", 13: "CUSTOM_KEY_4", 14: "KC_Q", 15: "KC_W", 16: "KC_E", 17: "KC_R", 18: "CUSTOM_KEY_5"}},
    combos: [{inputs: ["KC_Q", "KC_W"], output: "KC_B"}, {inputs: ["KC_Q", "KC_E"], output: "CUSTOM_KEY_4"}, {inputs: ["KC_Q", "KC_R"], output: "KC_C", allowedLayers: NUMBERS}],
    behaviours: [{keycode: "KC_B", steps: [tapX]}],
    edits: [customKeyShortcutMessage("CUSTOM_KEY_4", {mods: 0x41, keys: [0x0e], layers: 0, layerKind: 0}), macroMessage("MACRO_2", "{KC_A}")]});
/** @param {number} layoutIndex */
const reachOf = (layoutIndex) => keyReach(layerView(reaching, 0), reaching.layers[0], keyAt(reaching, 0, layoutIndex), layoutIndex);

test("a key reaches its macro, by the slot the keyboard reported", () => {
    const {macros, pointing, shortcut, combos} = reachOf(10);
    assert.deepEqual(macros.map(({keycode, slot}) => [keycode, slot?.payload]), [["MACRO_2", "{KC_A}"]]);
    assert.deepEqual([pointing, shortcut, combos], [null, null, []], "and nothing else");
    assert.deepEqual(reachOf(14).macros, []);
});

test("a pointing key reaches its mode, said by its kind in the vocabulary's words and where it paints", () => {
    const {pointing} = reachOf(11);
    assert.deepEqual([pointing?.slot.id, pointing?.kind, pointing?.paints], [0, "scrolling", "right half"]);
    const empty = reachOf(12).pointing;
    assert.deepEqual([empty?.slot.id, empty?.kind, empty?.paints], [6, "", ""], "an empty slot has no kind and paints nowhere");
});

test("a custom key shows its shortcut only when it has one", () => {
    const sends = reachOf(13);
    assert.deepEqual([sends.custom?.keycode, sends.shortcut?.keycode], ["CUSTOM_KEY_4", "CUSTOM_KEY_4"]);
    const bare = reachOf(18);
    assert.deepEqual([bare.custom?.keycode, bare.shortcut], ["CUSTOM_KEY_5", null]);
});

test("a key's combos say whether they fire here, run their output's behaviour, or send a custom key's shortcut", () => {
    const combos = reachOf(14).combos.map(({combo, use, runs, sendsInstead}) => [combo.badge, use.fires, runs, sendsInstead]);
    assert.deepEqual(combos, [["C0", true, true, ""], ["C1", true, false, "sends its shortcut, Left Ctrl + Right Alt + K"], ["C2", false, false, ""]]);
    assert.ok(reachOf(14).combos[2].use.reasons.length, "a combo that does not fire says why");
    assert.deepEqual(keyReach(layerView(reaching, 0), reaching.layers[0], reaching.layers[0].positions[0], -1, []).combos, [], "the combos a caller passes are the ones shown");
});

// C's row runs only on Numbers; Numbers is transparent at index 0 and holds
// C at index 1, over Base's C at both.
const stacked = published({keys: {0: {0: "KC_C", 1: "KC_C"}, 1: {0: "KC_TRANSPARENT", 1: "KC_C"}},
    behaviours: [{keycode: "KC_C", allowedLayers: NUMBERS, steps: [tapX]}]});

test("a key the layer stores reaches what it does itself, pressed or not", () => {
    const reach = keyReachAt(layerView(stacked, 1), 1);
    assert.ok(reach);
    assert.deepEqual([reach.position.keycode, reach.answer?.fellThrough, reach.through], ["KC_C", false, null]);
    assert.equal(reach.pressed, reach.own);
    assert.deepEqual([reach.own.behaviour?.keycode, reach.own.use.runs], ["KC_C", true]);
});

test("a transparent key reaches what the key answering it from below does, judged on the layer that supplies it", () => {
    const reach = keyReachAt(layerView(stacked, 1), 0);
    assert.ok(reach);
    assert.equal(reach.own.behaviour, undefined, "the layer's own key has none");
    assert.equal(reach.answer?.layer, stacked.layers[0], "with nothing previewed, Base answers");
    assert.equal(reach.pressed, reach.through);
    assert.deepEqual([reach.through?.behaviour?.keycode, reach.through?.use.runs], ["KC_C", false], "C's row does not run on Base");
    assert.ok(reach.through?.use.reasons.length, "and says why");
    assert.equal(keyReachAt(layerView(stacked, 1), 99), null, "a position the layer does not have reaches nothing");
});
