import assert from "node:assert/strict";
import test from "node:test";
import {RESTART_NEEDED, SAVE_IN_PROGRESS, halvesRows, keyboardStatusLine, productName} from "../../webview/view/keyboard-view.mjs";

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

test("a slave half that missed a cancelled save reads the same on the rail and the Keyboard screen", () => {
    const line = keyboardStatusLine(health({restartNeeded: true}));
    assert.equal(line.text, RESTART_NEEDED.label);
    assert.equal(line.tip, [RESTART_NEEDED.detail, ...RESTART_NEEDED.steps].join(" "), "the rail says what the Keyboard screen's callout says");
    assert.match(RESTART_NEEDED.detail, /^The slave half did not confirm a cancelled save/);
    assert.match(RESTART_NEEDED.steps[0], /^Unplug the USB cable from the master half \(not the cable between the halves\)/,
        "Ark's Restart is only for a stopped keyboard (D-L67): the unplug steps stay");
    assert.doesNotMatch(`${line.tip}`, /\b(left|right|other) half\b/i, "the halves are named by role");
});

test("the Keyboard screen names the halves by role, with the side as detail", () => {
    const rows = (halves, connected = true) => halvesRows({device: {connected, health: {halves}}});
    assert.deepEqual(rows("agree").map(row => [row.half, row.side, row.ok]),
        [["Master half", "right, USB and trackball", true], ["Slave half", "left", true]]);
    assert.equal(rows("alone")[1].words, "not answering: check the cable between the halves");
    assert.equal(rows("apart")[1].words, "connected, but holding different saved settings");
    assert.deepEqual(rows("agree", false).map(row => row.words), ["not connected", "not connected"]);
});
