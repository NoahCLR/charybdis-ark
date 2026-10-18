import test from "node:test";
import assert from "node:assert/strict";
import {ALWAYS, OPTIONAL, keycodeAside, keycodeShown} from "../../webview/view/show-keycodes.mjs";

test("keycodes are always shown where you act on one, whatever the preference", () => {
    for (const place of ALWAYS) {
        assert.equal(keycodeShown({showKeycodes: false}, place), true, place);
        assert.equal(keycodeShown({}, place), true, place);
    }
    assert.deepEqual([...ALWAYS].sort(), ["keycodeField", "pickerFooter", "rawPayload", "reviewTooltip", "stored"]);
});

test("everywhere else Show keycodes decides, and it is off by default", () => {
    for (const place of OPTIONAL) {
        assert.equal(keycodeShown(null, place), false, `${place} is hidden by default`);
        assert.equal(keycodeShown({showKeycodes: false}, place), false, place);
        assert.equal(keycodeShown({showKeycodes: true}, place), true, place);
    }
    assert.throws(() => keycodeShown({showKeycodes: true}, /** @type {any} */ ("somewhere")), /Unknown keycode place/, "a new place is named here first");
});

test("the suffix says nothing the words already say", () => {
    const on = {showKeycodes: true};
    assert.equal(keycodeAside(on, "hover", "KC_ESCAPE", "Esc"), "KC_ESCAPE");
    assert.equal(keycodeAside(on, "hover", "KC_F13", "KC_F13"), "", "a key named by its keycode does not repeat it");
    assert.equal(keycodeAside(on, "hover", "", "Esc"), "");
    assert.equal(keycodeAside({showKeycodes: false}, "behaviourRow", "MO(3)", "Hold Navigation"), "");
    assert.equal(keycodeAside({showKeycodes: false}, "stored", "MO(3)", "Hold Navigation"), "MO(3)");
});
