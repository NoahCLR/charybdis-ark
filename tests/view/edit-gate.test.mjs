import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {editGate} from "../../webview/view/edit-gate.mjs";

const require = createRequire(import.meta.url);
const {demoDocument, openDraft, panelModel} = require("../fixtures/published-model");
const {buildPanelModel} = require("../../core/session/panel-session");
const {DEMO_CAPABILITIES, openDemo, panelState} = require("../../core/session/demo-session");

/** @typedef {import("../../webview/view/edit-gate.mjs").EditArea} EditArea */
/** @type {EditArea[]} */
const AREAS = ["keys", "lighting", "discard", "behaviours", "settings", "macros", "customKeys", "pointing", "combos", "layers", "import", "export"];
// Every area but Export edits the draft.
const DRAFTED = AREAS.filter((area) => area !== "export");

const NOTHING_READ = "Nothing has been read from the keyboard yet. Choose Read keyboard.";
const NO_DRAFT = "The keyboard's complete profile could not be read, so edits cannot be drafted here. Read the keyboard again.";
const OTHER_KEYBOARD = "The local draft belongs to another keyboard. Select it again or discard the draft here.";
const STALE = "Review the draft against the current keyboard before editing further.";
const NO_KEYBOARD = "No keyboard is connected. Use Choose keyboard… to connect one.";
const UNSUPPORTED = "This keyboard's firmware is not current, and Ark supports only current firmware. Update both halves, then read the keyboard again.";

// What core publishes for a draft on this keyboard, with the state the panel
// answers to written over as each reason would leave it; `needsRead` makes
// the draft stale.
/** @param {object} [over] @param {{needsRead?: boolean}} [draftOver] @returns {any} */
function published(over = {}, {needsRead = false} = {}) {
    const {draft, state} = openDraft(demoDocument());
    if (needsRead) draft.needsRead = true;
    return panelModel(draft, {...state, ...over});
}
const open = published();

/** @param {any} model */
const gates = (model) => Object.fromEntries(AREAS.map((area) => [area, editGate(model, area)]));
/** @param {any} model @param {(area: EditArea) => object} expected */
const each = (model, expected) => assert.deepEqual(gates(model), Object.fromEntries(AREAS.map((area) => [area, expected(area)])));

test("a draft that takes edits opens every area, with nothing to say", () => {
    each(open, () => ({editable: true, quiet: false, why: ""}));
    const session = {service: {portable: null, snapshot: () => ({connected: false, busy: false, devices: []})}};
    openDemo(session, session.service.snapshot());
    each(buildPanelModel(session, panelState(session)), () => ({editable: true, quiet: false, why: ""}));
});

test("each reason core gives closes every area that edits the draft, and says what it can", () => {
    const {state} = openDraft(demoDocument());
    // [reason, model, why, quiet, whether Export stays open]
    /** @type {[string, any, string, boolean, boolean][]} */
    const reasons = [
        ["busy", published({busy: true}), "", true, false],
        ["stale", published({}, {needsRead: true}), STALE, false, true],
        ["stale and busy", published({busy: true}, {needsRead: true}), STALE, true, false],
        ["connection-changed", published({connectionToken: 7}), STALE, false, true],
        ["disconnected", published({connected: false, capabilities: null}), NO_KEYBOARD, false, false],
        ["other-keyboard", published({selectedDeviceId: "other", devices: [...state.devices, {id: "other", label: "Other"}]}), NOTHING_READ, false, true],
        ["unsupported", published({capabilities: {...DEMO_CAPABILITIES, actionAbiDigest: 0}}), UNSUPPORTED, false, false],
        ["no-draft", buildPanelModel({service: {portable: null}}, state), NOTHING_READ, false, true],
    ];
    for (const [reason, model, why, quiet, exported] of reasons) {
        assert.equal(model.draft?.reason ?? "no-draft", reason.replace("stale and busy", "stale"), reason);
        each(model, (area) => ({editable: area === "export" && exported, quiet, why}));
    }
});

test("its words follow the model, in order: no keyboard, unsupported firmware, nothing read, no draft, another keyboard's, a stale one", () => {
    const why = (/** @type {any} */ model) => editGate(model, "keys").why;
    const gone = published({connected: false, capabilities: null});
    assert.equal(why({...gone, shell: {...gone.shell, blocked: {title: "Ark is open in another tab", detail: "One tab holds the keyboard."}}}),
        "Ark is open in another tab", "a tab that cannot reach a keyboard says why");
    assert.equal(why({...gone, shell: {...gone.shell, words: {}}}), "", "a shell with no words says nothing");
    const {state} = openDraft(demoDocument());
    // The other keyboard's layout once read; then no draft opened for it.
    const other = published({selectedDeviceId: "other", devices: [...state.devices, {id: "other", label: "Other"}]});
    assert.equal(why({...other, layers: open.layers}), OTHER_KEYBOARD);
    assert.equal(why({...buildPanelModel({service: {portable: null}}, state), layers: open.layers}), NO_DRAFT);
    assert.equal(why({...published({}, {needsRead: true}), layers: []}), NOTHING_READ, "nothing read comes before a stale draft");
    // Firmware Ark does not support is said before what it leaves unread or
    // unmatched (panel-session.js publishes its draft as unmatched).
    const unsupported = published({capabilities: {...DEMO_CAPABILITIES, actionAbiDigest: 0}});
    assert.equal(why({...unsupported, layers: open.layers}), UNSUPPORTED, "unsupported firmware comes before another keyboard's draft");
    assert.equal(why({...unsupported, draft: undefined, layers: []}), UNSUPPORTED, "and before nothing read, with no draft open");
    assert.equal(why({...gone, firmware: unsupported.firmware}), NO_KEYBOARD, "no keyboard comes first");
    // A new connection is reviewed as a stale draft is.
    assert.equal(why({...open, draft: {...open.draft, editable: false, reason: "connection-changed"}}), STALE);
    assert.deepEqual(editGate(null, "keys"), {editable: false, quiet: false, why: ""}, "before the first model there is nothing to say");
});

test("an area's own capability closes only the areas resting on it, with nothing in words", () => {
    /** @type {[EditArea[], any][]} */
    const capabilities = [
        [["behaviours"], {...open, behaviorEditing: {...open.behaviorEditing, writable: false}}],
        [["settings"], {...open, settingsEditing: {...open.settingsEditing, writable: false}}],
        [["macros"], {...open, macroEditing: {...open.macroEditing, writable: false}}],
        [["customKeys"], {...open, customKeyEditing: {...open.customKeyEditing, writable: false}}],
        [["pointing"], {...open, pdModeEditing: {...open.pdModeEditing, writable: false}}],
        [["combos"], {...open, comboReadback: {...open.comboReadback, writable: false}}],
        [["layers", "import", "export"], {...open, portable: {...open.portable, available: false}}],
        [["layers", "import", "export"], {...open, portable: {...open.portable, busy: true}}],
    ];
    for (const [closed, model] of capabilities) {
        each(model, (area) => ({editable: !closed.includes(area), quiet: false, why: ""}));
    }
    assert.equal(editGate({...open, comboReadback: undefined}, "combos").editable, true, "combos stay open until a readback says otherwise");
});

test("whether the draft takes edits is core's binding, never the draft's other flags", () => {
    const blocked = {...open, draft: {...open.draft, matching: true, stale: false, busy: false, editable: false, reason: "connection-changed"}};
    for (const area of DRAFTED) assert.equal(editGate(blocked, area).editable, false, area);
    assert.equal(editGate(blocked, "export").editable, true, "Export only reads the keyboard");
    for (const area of AREAS) assert.equal(editGate({...open, draft: undefined}, area).editable, area === "export", area);
});
