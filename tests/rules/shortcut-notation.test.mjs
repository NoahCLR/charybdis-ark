import assert from "node:assert/strict";
import test from "node:test";
import {shortcutChord, shortcutLayerWords, shortcutSendWords, shortcutWords} from "../../rules/shortcut-notation.mjs";

const words = {
    modifiers: /** @type {[number, string][]} */ ([[1, "Ctrl"], [2, "Shift"], [4, "Option"], [8, "Command"], [16, "Right Ctrl"], [32, "Right Shift"], [64, "Right Option"], [128, "Right Command"]]),
    keyLabel: (/** @type {number} */ code) => ({0x04: "A", 0x2c: "Spacebar", 0x0e: "K"})[code] || `#${code}`,
    layerName: (/** @type {number} */ layer) => ["Base", "Navigation", "Extra", "Numbers"][layer] || `Layer ${layer}`,
    layerCount: 8,
    layerKinds: /** @type {[number, string][]} */ ([[0, "Hold"], [1, "Lock"], [2, "Move to"], [3, "Tap-toggle"], [4, "One-shot"]]),
};
const keyName = (/** @type {number} */ code) => ({0x04: "KC_A", 0x2c: "KC_SPACE", 0x0e: "KC_K", 0xe0: "KC_LEFT_CTRL", 0xe2: "KC_LEFT_ALT", 0xe3: "KC_LEFT_GUI", 0xe6: "KC_RIGHT_ALT"})[code] || "";

test("a shortcut reads its modifiers left before right, the left unmarked, then its keys in press order (D-L83)", () => {
    assert.deepEqual(shortcutSendWords({mods: 0x01 | 0x40, keys: [0x0e, 0x04]}, words), ["Ctrl", "Right Option", "K", "A"]);
    assert.equal(shortcutWords({mods: 0x01 | 0x04, keys: [0x2c]}, words), "Ctrl+Option+Spacebar");
    assert.equal(shortcutWords({mods: 0x01 | 0x10}, words), "Ctrl+Right Ctrl", "both sides at once still read apart");
    assert.equal(shortcutWords({}, words), "");
});

test("its layers follow, lowest first, the first led by its kind's verb unless held", () => {
    assert.deepEqual(shortcutLayerWords({layers: 0b0110}, words), ["Navigation", "Extra"]);
    assert.deepEqual(shortcutLayerWords({layers: 0b0110, layerKind: 1}, words), ["Lock Navigation", "Extra"]);
    assert.equal(shortcutWords({mods: 0x08, layers: 0b0010, layerKind: 3}, words), "Command+Tap-toggle Navigation");
});

test("the chord spells each part as QMK does: modifier keys, keys, and the layer key its kind acts as", () => {
    assert.equal(shortcutChord({mods: 0x01 | 0x04, keys: [0x2c]}, {keyName, layerCount: 8}), "KC_LEFT_CTRL+KC_LEFT_ALT+KC_SPACE");
    assert.equal(shortcutChord({mods: 0x40, keys: [0x0e]}, {keyName, layerCount: 8}), "KC_RIGHT_ALT+KC_K");
    for (const [layerKind, form] of [[0, "MO"], [1, "TG"], [2, "TO"], [3, "TT"], [4, "OSL"]]) {
        assert.equal(shortcutChord({mods: 0x08, layers: 0b0110, layerKind: /** @type {number} */ (layerKind)}, {keyName, layerCount: 8}), `KC_LEFT_GUI+${form}(1)+${form}(2)`);
    }
    assert.equal(shortcutChord({}, {keyName, layerCount: 8}), "");
});
