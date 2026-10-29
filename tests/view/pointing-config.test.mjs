// A pointing slot's form as the keyboard stores it (view/pointing-config.mjs):
// the words its controls say.
import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {MODIFIER_POLICY, modifierPolicyTip} from "../../webview/view/pointing-config.mjs";

const {VOCABULARY} = createRequire(import.meta.url)("../../core/model/vocabulary");

// The tip on a shortcut's held-modifier choice names each choice as the
// dropdown offers it, never words of its own.
test("the held-modifier tip names each choice in the dropdown's words", () => {
    const tip = modifierPolicyTip({vocabulary: VOCABULARY});
    const choices = VOCABULARY.pointing.modifierPolicy;
    assert.deepEqual(choices.map(([policy]) => policy).sort(), Object.values(MODIFIER_POLICY).sort());
    for (const [, label] of choices) assert.match(tip, new RegExp(`(^|\\. )${label}: `), label);
    assert.match(tip, /^Inherit modifiers: modifiers you hold apply to the shortcut/);
});
