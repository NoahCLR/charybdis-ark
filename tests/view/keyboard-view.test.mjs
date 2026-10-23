import assert from "node:assert/strict";
import test from "node:test";
import {SAVE_IN_PROGRESS, keyboardStatusLine, productName} from "../../webview/view/keyboard-view.mjs";

const connected = (keyboardName, label = "Bastard Keyboards Charybdis 4x6") => ({device: {connected: true, label}, keyboardName});

test("Product is the firmware's built-in name for a keyboard with no stored name", () => {
    assert.equal(productName(connected({name: "", builtIn: "Charybdis 4x6", identity: "a", perName: 32})), "Charybdis 4x6");
});

test("a renamed keyboard never shows its given name as Product: the row is left out", () => {
    // The keyboard reports its given name over USB (firmware D-F25), which
    // the device label then is; the built-in name is not known.
    assert.equal(productName(connected({name: "Noah's Charybdis", builtIn: "", identity: "a", perName: 32}, "Noah's Charybdis")), null);
    assert.equal(productName(connected(null, "Noah's Charybdis")), null, "nor before the name is read");
});

test("the demo stands in for the product", () => {
    assert.equal(productName({demo: {active: true}, device: {connected: true, label: "Demo"}, keyboardName: {name: "Charybdis - Home", builtIn: "", identity: "a", perName: 32}}),
        "Charybdis 4x6 (demo)");
});

const health = (extra) => ({device: {connected: true, label: "K", health: {halves: "agree", recoveryPending: false, restartNeeded: false, ...extra}}});

test("a save the keyboard is finishing reads as a save in progress, not a recovery copy", () => {
    const line = keyboardStatusLine(health({recoveryPending: true}));
    assert.deepEqual(line, {tone: "draft", text: "Save in progress",
        tip: "A save is in progress on the keyboard: it keeps its previous profile until both halves confirm the new one."});
    assert.equal(line.tip, SAVE_IN_PROGRESS.detail, "the rail and the Keyboard screen say it in the same words");
    assert.doesNotMatch(`${line.text} ${line.tip}`, /recovery/i);
});

test("a restart the keyboard needs outranks a save in progress; otherwise, and in the demo, nothing is said", () => {
    assert.equal(keyboardStatusLine(health({recoveryPending: true, restartNeeded: true})).text, "Restart the keyboard");
    assert.equal(keyboardStatusLine(health({})), null);
    assert.equal(keyboardStatusLine({...health({recoveryPending: true}), demo: {active: true}}), null);
    assert.equal(keyboardStatusLine(null), null);
});
