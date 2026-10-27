import assert from "node:assert/strict";
import test from "node:test";
import {RESTART_NEEDED, SAVE_IN_PROGRESS, halvesRows, productName} from "../../webview/view/keyboard-view.mjs";
import {keyboardControl} from "../../webview/view/keyboard-menu.mjs";

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
    assert.equal(SAVE_IN_PROGRESS.label, "Save in progress");
    assert.equal(SAVE_IN_PROGRESS.detail, "A save is in progress on the keyboard: it keeps its previous profile until both halves confirm the new one.");
    assert.ok(keyboardControl(health({recoveryPending: true})).dot.tip.includes(SAVE_IN_PROGRESS.detail), "the rail's dot and the Keyboard screen say it in the same words");
    assert.doesNotMatch(`${SAVE_IN_PROGRESS.label} ${SAVE_IN_PROGRESS.detail}`, /recovery/i);
});

test("a restart the keyboard needs is said ahead of the rest; otherwise, and in the demo, neither is said", () => {
    const tip = keyboardControl(health({recoveryPending: true, restartNeeded: true})).dot.tip;
    assert.ok(tip.startsWith(RESTART_NEEDED.label), tip);
    assert.doesNotMatch(keyboardControl(health({})).dot.tip, /Restart the keyboard|Save in progress/);
    assert.doesNotMatch(keyboardControl({...health({recoveryPending: true, restartNeeded: true}), demo: {active: true}}).dot.tip, /Restart the keyboard|Save in progress/);
});

test("a slave half that missed a cancelled save reads the same on the rail and the Keyboard screen", () => {
    const tip = keyboardControl(health({restartNeeded: true})).dot.tip;
    assert.ok(tip.includes([RESTART_NEEDED.detail, ...RESTART_NEEDED.steps].join(" ")), "the rail says what the Keyboard screen's callout says");
    assert.match(RESTART_NEEDED.detail, /^The slave half did not confirm a cancelled save/);
    assert.match(RESTART_NEEDED.steps[0], /^Unplug the USB cable from the master half \(not the cable between the halves\)/,
        "Ark's Restart is only for a stopped keyboard (D-L67): the unplug steps stay");
    assert.doesNotMatch([RESTART_NEEDED.detail, ...RESTART_NEEDED.steps].join(" "), /\b(left|right|other) half\b/i, "the halves are named by role");
});

test("the Keyboard screen names the halves by role, with the side as detail", () => {
    const rows = (halves, connected = true) => halvesRows({device: {connected, health: {halves}}});
    assert.deepEqual(rows("agree").map(row => [row.half, row.side, row.ok]),
        [["Master half", "right, USB and trackball", true], ["Slave half", "left", true]]);
    assert.equal(rows("alone")[1].words, "not answering: check the cable between the halves");
    assert.equal(rows("apart")[1].words, "connected, but holding different saved settings");
    assert.deepEqual(rows("agree", false).map(row => row.words), ["not connected", "not connected"]);
});
