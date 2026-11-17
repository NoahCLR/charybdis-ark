"use strict";
// Review after a VIA layout was used as the draft (D-L97): what the import
// kept that plays a macro is said as a notice, as the import sheet said it,
// while the macros it brought are still in the draft.
const test = require("node:test"), assert = require("node:assert/strict");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {document, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
const {options} = require("../fixtures/keyboard-options");
const {editProfileDomains, fingerprint, summary} = require("../../core/model/portable-profile");
const {IDENTITY} = require("../../core/model/draft-order");
const {BLANK_SLATE, VIA_IMPORT_LABEL, importViaLayout, viaLayoutOf} = require("../../core/model/via-layout");
const {encodeMacroPayload} = require("../../core/schema/macro-payload");
const {MATRIX_KEYS} = require("../../core/data/charybdis-layout");

// The keyboard: typing “sig” plays Macro 3 and “bye” Macro 5, both with steps.
const keyboard = (replacements = [["sig", 3], ["bye", 5]]) => editProfileDomains(document(), {capabilities: CURRENT_CAPABILITIES}, open => {
    const macros = open("macros");
    macros[3] = encodeMacroPayload("old three", {});
    macros[5] = encodeMacroPayload("old five", {});
    for (const [typo, macro] of replacements) open("autocorrect").entries.push({correction: "", macro, typos: [{typo, match: 0}]});
});
/** @param {import("../../core/model/types.js").PortableDocument} value */
const draftOn = value => new ProfileDraftSession({document: value, fingerprint: fingerprint(value), summary: summary(value), limits: {brightnessMax: 200}, options: options()}, "board", CURRENT_CAPABILITIES);
// A VIA layout whose Macro 3 has steps and whose Macro 5 is empty, used as the draft.
/** @param {ProfileDraftSession} draft */
function useVia(draft) {
    const file = JSON.stringify({name: "Charybdis", macros: ["", "", "", "new three", ...Array(12).fill("")], layers: [Array(MATRIX_KEYS).fill("KC_A")], encoders: []});
    const imported = importViaLayout(draft.current.document, /** @type {any} */ (viaLayoutOf(file)), {capabilities: CURRENT_CAPABILITIES, clear: BLANK_SLATE});
    draft.replace(imported.document, draft.revision, "edit", VIA_IMPORT_LABEL, IDENTITY);
    return imported;
}
const kept = (/** @type {ProfileDraftSession} */ draft) => draft.checks().filter(check => check.kind === "keptMacros");

test("Review names what a pending VIA import kept that plays a macro, as a notice, in the sheet's names", () => {
    const draft = draftOn(keyboard());
    const imported = useVia(draft);
    assert.deepEqual(imported.kept.map(item => item.called), ["the replacement for “sig”", "the replacement for “bye”"], "the sheet's names");
    const [check, ...more] = kept(draft);
    assert.deepEqual(more, []);
    assert.equal(check.level, "notice", "never a blocker, and Save asks nothing of it");
    assert.equal(check.status, "new");
    assert.equal(check.title, "What the VIA import kept plays the macros it brought");
    assert.equal(check.detail, "These play a macro by its slot, which now holds the imported macro or nothing: the replacement for “sig” plays the imported Macro 3 and the replacement for “bye” plays nothing (Macro 5 is emptied).");
    assert.deepEqual(check.place, {kind: "macro", index: 3, keycode: "MACRO_3"});
    assert.equal(draft.hasBlockers(), false);
    // Undone, the import's macros are no longer in the draft, and neither is the notice.
    draft.undo(draft.revision);
    assert.deepEqual(kept(draft), []);
    draft.redo(draft.revision);
    assert.equal(kept(draft).length, 1);
});

test("Review lists only what still plays a macro the import changed, and nothing when nothing does", () => {
    // The file leaves Macro 3 as the keyboard has it: only “bye” is listed.
    const same = draftOn(editProfileDomains(keyboard(), {capabilities: CURRENT_CAPABILITIES}, open => {open("macros")[3] = encodeMacroPayload("new three", {});}));
    useVia(same);
    assert.match(kept(same)[0].detail, /: the replacement for “bye” plays nothing \(Macro 5 is emptied\)\.$/);
    // Nothing kept plays a macro.
    const none = draftOn(keyboard([]));
    useVia(none);
    assert.deepEqual(kept(none), []);
    // A macro changed by hand, with no import, is an ordinary macro change.
    const byHand = draftOn(keyboard());
    byHand.stage({type: "updateMacro", keycode: "MACRO_3", payload: "new three", draftRevision: byHand.revision});
    assert.deepEqual(kept(byHand), []);
});
