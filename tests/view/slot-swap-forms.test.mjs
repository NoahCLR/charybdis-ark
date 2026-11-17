// A form left open across a slot swap (D-L81, webview/store.mjs
// followSlotSwap): the swap is posted from the Macros, Custom keys or
// Pointing modes screen while a form on another screen holds a slot of that
// bank. What the form posts afterwards is staged in a real draft, as the
// panel's messages are, and must still reach the thing the person picked.
import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";

/** @type {any[]} */
const posted = [];
globalThis.acquirePanelApi = () => ({postMessage(/** @type {any} */ message) { posted.push(message); }});
const {closeComboBuilder, followSlotSwap, openComboBuilder, post, setModel, state} = await import("../../webview/store.mjs");
const edits = await import("../../webview/view/edits.mjs");
const {addedReplacement} = await import("../../webview/view/autocorrect.mjs");

const require = createRequire(import.meta.url);
const {profileDocument, publishedModel} = require("../fixtures/published-model");

// Macro 1 types "a" and Macro 2 types "b"; combo 0 plays Macro 1.
const start = () => profileDocument({keys: {0: {0: "KC_A", 1: "KC_B"}}, combos: [{inputs: ["KC_A", "KC_B"], output: "MACRO_1"}]});
const MACROS = [{type: "updateMacro", keycode: "MACRO_1", payload: "a"}, {type: "updateMacro", keycode: "MACRO_2", payload: "b"}];

// The panel as the person uses it: each posted message reaches core in
// turn, and the page then reads the model core publishes after it.
function panel() {
    const doc = start();
    /** @type {object[]} */
    const staged = [...MACROS];
    const model = () => publishedModel(doc, {edits: staged});
    setModel(model());
    posted.length = 0;
    return {
        model,
        // Whatever the page posted since the last publish reaches core.
        publish() {
            for (const {draftId, draftRevision, ...message} of posted.splice(0)) staged.push(message);
            setModel(model());
            return model();
        },
    };
}
// Which macro a macro key plays now, by the text it types: MACRO_n as the
// page names it, QK_MACRO_n as core publishes a stored key.
/** @param {any} model @param {string} keycode */
const plays = (model, keycode) => model.macros[Number(/MACRO_(\d+)$/.exec(keycode)?.[1])]?.payload;

test("a combo builder open across a macro swap posts nothing that plays the other macro", (t) => {
    t.after(closeComboBuilder);
    const {model, publish} = panel();
    assert.equal(plays(model(), model().combos[0].output), "a", "the combo plays the macro typing a");
    openComboBuilder(model().combos[0]);
    // On Macros, Macro 1 is dragged onto Macro 2.
    post(edits.swapMacros("MACRO_1", "MACRO_2"));
    followSlotSwap("macros", "MACRO_1", "MACRO_2");
    publish();
    // Back on the Combos tab, Keep posts the builder as it stands.
    if (state.combo.open) post(edits.comboMessage(state.combo.editId, {...state.combo.form, inputs: state.combo.inputs.slice(), holdTermMs: ""}));
    const after = publish();
    assert.equal(plays(after, after.combos[0].output), "a", "the combo still plays the macro typing a");
    assert.equal(state.combo.open, false, "the builder closed with the swap, as a layer reorder closes it");
});

test("a key waiting to be placed follows the macro, custom key or pointing mode it was picked for", (t) => {
    t.after(() => { state.placement = null; });
    const {model, publish} = panel();
    // Place on keymap, from Macro 1's editor; then, from the rail, Macros again.
    state.placement = {keycode: "MACRO_1"};
    post(edits.swapMacros("MACRO_1", "MACRO_2"));
    followSlotSwap("macros", "MACRO_1", "MACRO_2");
    publish();
    // Back on the Keymap, the board click places it.
    post(edits.setKey("Layer 0", 5, /** @type {{keycode: string}} */ (state.placement).keycode));
    const after = publish();
    const placed = after.layers[0].positions.find((/** @type {any} */ position) => position.layoutIndex === 5).keycode;
    assert.equal(plays(after, placed), "a", "the key placed types the macro it was picked for");

    state.placement = {keycode: "CUSTOM_KEY_3"};
    followSlotSwap("customKeys", "CUSTOM_KEY_3", "CUSTOM_KEY_7");
    assert.deepEqual(state.placement, {keycode: "CUSTOM_KEY_7"});
    const slot = (/** @type {number} */ id) => model().pdModes.find((/** @type {any} */ mode) => mode.id === id).keys;
    state.placement = {keycode: slot(1).lock};
    followSlotSwap("pointing", "1", "4");
    assert.deepEqual(state.placement, {keycode: slot(4).lock}, "a pointing mode's lock key follows as its hold key would");
    state.placement = {keycode: "KC_A"};
    followSlotSwap("macros", "MACRO_1", "MACRO_2");
    assert.deepEqual(state.placement, {keycode: "KC_A"}, "a key of no swapped slot stays");
});

test("a new replacement's macro, picked and not yet on the list, follows a macro swap", (t) => {
    t.after(() => { state.autocorrectNew = null; });
    const {model, publish} = panel();
    const slotOf = (/** @type {string} */ keycode) => model().macros.findIndex((/** @type {any} */ macro) => macro.keycode === keycode);
    state.autocorrectNew = {kind: "macro", text: "", macro: slotOf("MACRO_1"), input: "", joins: null, shown: true};
    // Edit macro → Macros, where Macro 1 is dragged onto Macro 2.
    post(edits.swapMacros("MACRO_1", "MACRO_2"));
    followSlotSwap("macros", "MACRO_1", "MACRO_2");
    publish();
    // Back on Text replacement, its first input is kept.
    const fresh = /** @type {NonNullable<typeof state.autocorrectNew>} */ (state.autocorrectNew);
    post(edits.addAutocorrectInputs(/** @type {any} */ (addedReplacement(fresh)), "sig"));
    const after = publish();
    const entry = after.autocorrect.entries.find((/** @type {any} */ row) => row.typos.some((/** @type {any} */ typo) => typo.typo === "sig"));
    assert.equal(after.macros[entry.macro].payload, "a", "the replacement plays the macro typing a");
});

test("a behaviour cell's pending way of running, and refused timings, follow a custom key swap", (t) => {
    t.after(() => { state.cellHow = null; state.timingRefusal = null; });
    panel();
    state.cellHow = {cell: "1-hold", keycode: "CUSTOM_KEY_3", style: 1};
    state.timingRefusal = {keycode: "CUSTOM_KEY_3", term: "tapHoldTerm", terms: {tapHoldTerm: "9"}, problem: "Too short."};
    followSlotSwap("customKeys", "CUSTOM_KEY_3", "CUSTOM_KEY_7");
    assert.equal(state.cellHow?.keycode, "CUSTOM_KEY_7");
    assert.equal(state.timingRefusal?.keycode, "CUSTOM_KEY_7");
});
