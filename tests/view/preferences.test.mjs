import assert from "node:assert/strict";
import test from "node:test";
import {DEFAULT_PREFERENCES, readPreferences, withPreference} from "../../webview/view/preferences.mjs";

test("a panel with nothing stored starts with keycodes hidden and the board shown", () => {
    assert.deepEqual(readPreferences(undefined), DEFAULT_PREFERENCES);
    assert.deepEqual(readPreferences(null), {showKeycodes: false, hideBoard: false});
    assert.deepEqual(readPreferences({preferences: "nonsense"}), DEFAULT_PREFERENCES);
});

test("a stored preference is read back, and a value of the wrong kind is ignored", () => {
    assert.deepEqual(readPreferences({preferences: {showKeycodes: true, hideBoard: true}}), {showKeycodes: true, hideBoard: true});
    assert.deepEqual(readPreferences({preferences: {showKeycodes: "yes", hideBoard: 1}}), DEFAULT_PREFERENCES);
});

test("changing one preference keeps the others and whatever else the host stored", () => {
    const first = withPreference({other: 3}, "showKeycodes", true);
    assert.deepEqual(first, {other: 3, preferences: {showKeycodes: true, hideBoard: false}});
    const second = withPreference(first, "hideBoard", true);
    assert.deepEqual(readPreferences(second), {showKeycodes: true, hideBoard: true});
    assert.equal(second.other, 3);
});
