import assert from "node:assert/strict";
import test from "node:test";
import {keyboardControl} from "../../webview/view/keyboard-menu.mjs";
import {RESTART_NEEDED, SAVE_IN_PROGRESS} from "../../webview/view/keyboard-view.mjs";

import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const portable = require("../../core/model/portable-profile");
const {buildPanelModel} = require("../../core/session/panel-session");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {DEMO_CAPABILITIES, openDemo, panelState} = require("../../core/session/demo-session");
const {openDraft, panelModel, profileDocument} = require("../fixtures/published-model");

// The rail's keyboard button (prototype E) and its menu, from the model core
// publishes. The words for the modes are whatever the vocabulary says, in the
// order the keyboard offers them.

// What the keyboard says of its own saving, nothing pending.
const KEYBOARD = {saving: false, autoSaving: false, savedByKeyboard: false, saveFailed: false, saveError: 0, lastSaveTransaction: 0,
    adjustmentPending: false, storagePaused: false, slaveStoragePaused: false, slaveRefused: false, modeNotStored: false,
    stopped: false, slaveStopped: false, quietMs: 3000};
const AGREE = {slaveKnown: true, slaveConverged: true, committedGeneration: 1, activeGeneration: 1, slaveGeneration: 1};
const SETTINGS_EDIT = {type: "updateConfigDefaults", sectionId: "normalPointerSpeed", fields: [{macro: "normalDpi", value: "1400"}, {macro: "snipingDpi", value: "200"}]};

// Keyboard "a", called Charybdis - Home, its halves agreeing, in edit mode
// `mode`. In a live mode its draft is the keyboard's working copy, `live`
// laid over its state; with `live: null` it is a Review and save draft with
// one edit. `keyboard` is what the keyboard says of its saving, `status` and
// `state` what the device service reads, `shell` what the page offers.
/** @param {{mode?: number, conflict?: boolean, notStored?: boolean, live?: object | null, keyboard?: object, status?: object, state?: object, shell?: object}} [options] */
function connected({mode = 2, conflict = false, notStored = false, live = {}, keyboard = {}, status = {}, state: more = {}, shell} = {}) {
    const doc = profileDocument();
    const said = {...KEYBOARD, ...keyboard};
    let draft;
    if (live) {
        const snapshot = {document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc)};
        const bytes = Buffer.from(doc.profile, "base64");
        draft = new ProfileDraftSession(/** @type {any} */ ({...snapshot, saved: snapshot, runtime: null, live: {mode, session: 1, revision: 1, savedGeneration: 1, savedOrigin: 0,
            unsaved: false, converged: true, working: bytes, saved: bytes, defaults: bytes, keyboard: said, ...live}}), "a", DEMO_CAPABILITIES);
    } else {
        draft = openDraft(doc, {deviceId: "a", edits: [SETTINGS_EDIT]}).draft;
        draft.applyKeyboard = said;
    }
    const state = {...openDraft(doc, {deviceId: "a"}).state, devices: [{id: "a", product: "Charybdis - Home"}], storedKeyboardName: "Charybdis - Home",
        status: {...AGREE, ...status}, editMode: {mode, conflict, notStored, counter: 1, slaveMode: mode, slaveCounter: 1, slaveKnown: true, agreed: !conflict}, ...more};
    return /** @type {any} */ (shell ? buildPanelModel({service: {portable: null}, draft, shell: {panel: () => shell}}, state) : panelModel(draft, state));
}
// No keyboard, or one coming back under its new name (`reconnect`).
/** @param {object} [shell] @param {object} [reconnect] */
const disconnected = (shell = {}, reconnect = undefined) => /** @type {any} */ (buildPanelModel({service: {portable: null}, shell: {panel: () => shell}, reconnect},
    {connected: false, busy: false, devices: reconnect ? [{id: "a", product: "Home"}, {id: "b", product: "Travel"}] : [], phase: "empty"}));

test("the model the menu reads is what core publishes: the edit mode, its offer and the live draft's saving", () => {
    const model = connected({mode: 1, conflict: true, notStored: true});
    assert.deepEqual(model.editMode, {mode: 1, conflict: true, offered: [1, 2, 0], notStored: true}, "a test that offers fewer modes writes this shape");
    assert.deepEqual(Object.keys(model.draft.live).sort(), ["converged", "keyboard", "mode", "slaveRefused", "unsaved"]);
    for (const flag of ["saving", "savedByKeyboard", "saveFailed", "adjustmentPending", "stopped", "slaveStopped", "quietMs"]) assert.ok(flag in model.draft.live.keyboard, flag);
});

test("the button names the keyboard and its edit mode; the menu lists the modes as offered, ticking the current one", () => {
    const model = connected();
    const words = model.vocabulary.editModes;
    const control = keyboardControl(model);
    assert.equal(control.name, "Charybdis - Home");
    assert.deepEqual(control.mode, {label: words[2].label, detail: words[2].detail, warn: ""});
    assert.deepEqual(control.edits?.choices.map(({value, label, hint, detail, current, offered}) => [value, label, hint, detail, current, offered]),
        [1, 2, 0].map((value) => [value, words[value].label, words[value].hint, words[value].detail, value === 2, true]),
        "in the keyboard's order, never re-sorted here");
    assert.equal(control.edits?.settle, false);
    assert.equal(control.opens, true);
    assert.equal(control.disabled, false);
});

test("a mode the keyboard reports but Ark does not offer is shown, not offered", () => {
    // Core offers every mode; a keyboard reporting one it leaves out is
    // written by hand, in the shape core publishes (the first test).
    const model = connected({mode: 1});
    const control = keyboardControl({...model, editMode: {...model.editMode, offered: [2, 0]}});
    assert.deepEqual(control.edits?.choices.map(({value, current, offered}) => [value, current, offered]), [[2, false, true], [0, false, true], [1, true, false]]);
});

test("halves that stored different modes offer Settle; a mode not stored yet is marked, both on the button too", () => {
    const conflict = keyboardControl(connected({conflict: true}));
    assert.equal(conflict.edits?.settle, true);
    assert.match(conflict.mode?.warn || "", /halves stored different modes/);
    const notStored = keyboardControl(connected({notStored: true}));
    assert.equal(notStored.edits?.notStored, true);
    assert.match(notStored.mode?.warn || "", /Unplugging it now may lose the mode/);
});

test("several keyboards are listed with the selected one ticked; one keyboard is not", () => {
    const two = keyboardControl(connected({state: {devices: [{id: "a", product: "Home"}, {id: "b", product: "Travel"}], selectedDeviceId: "b", storedKeyboardName: ""}}));
    assert.deepEqual(two.keyboards, [{id: "a", label: "Home", current: false}, {id: "b", label: "Travel", current: true}]);
    assert.deepEqual(keyboardControl(connected()).keyboards, []);
});

test("Choose keyboard and Disconnect come with the shell's picker; Disconnect only with a keyboard to let go of", () => {
    assert.deepEqual((({choose, disconnect}) => ({choose, disconnect}))(keyboardControl(connected())), {choose: true, disconnect: true});
    const noPicker = keyboardControl(connected({shell: {chooseKeyboard: false}}));
    assert.deepEqual((({choose, disconnect}) => ({choose, disconnect}))(noPicker), {choose: false, disconnect: false});
});

test("while the keyboard is busy the button is disabled and its dot pulses with what it is doing", () => {
    const model = connected({state: {busy: true, phase: "read-layout"}});
    const control = keyboardControl(model);
    assert.equal(control.disabled, true);
    assert.equal(control.dot.busy, true);
    assert.ok(control.dot.tip.startsWith(`${model.vocabulary.phases["read-layout"].label}. ${model.vocabulary.halves.agree.label}.`), control.dot.tip);
});

test("with no keyboard the button says so and its menu offers only Choose keyboard", () => {
    const control = keyboardControl(disconnected({chooseKeyboard: true}));
    assert.equal(control.name, "No keyboard connected");
    assert.equal(control.mode, null);
    assert.equal(control.edits, null);
    assert.deepEqual([control.choose, control.disconnect, control.keyboards.length], [true, false, 0]);
    assert.deepEqual(control.dot, {tone: "err", tip: "No keyboard is connected.", busy: false});
    assert.equal(control.opens, true);
    // A page that cannot choose a keyboard has no menu to open.
    assert.equal(keyboardControl(disconnected({chooseKeyboard: false})).opens, false);
    assert.equal(keyboardControl(null).opens, false);
});

test("a keyboard coming back under its new name is shown by it, pulsing, with only Choose keyboard", () => {
    const control = keyboardControl(disconnected({chooseKeyboard: true}, {name: "Charybdis - Travel"}));
    assert.equal(control.name, "Charybdis - Travel");
    assert.deepEqual([control.edits, control.mode, control.keyboards.length, control.disconnect], [null, null, 0, false]);
    assert.equal(control.dot.busy, true);
    assert.match(control.dot.tip, /takes its new name/);
    assert.match(keyboardControl(disconnected({}, {name: "", restart: true})).dot.tip, /restarting/);
    assert.equal(keyboardControl(disconnected({}, {name: "", lost: 1})).name, "Charybdis");
});

test("the demo shows its name and dot, no edit modes, and only Choose keyboard", () => {
    /** @type {any} */
    const session = {service: {portable: null, snapshot: () => ({connected: false, busy: false, devices: []})}};
    openDemo(session, session.service.snapshot());
    const model = /** @type {any} */ (buildPanelModel(session, {...panelState(session), busy: true}));
    assert.equal(model.device.health.busy, true);
    const control = keyboardControl(model);
    assert.equal(control.name, "Demo");
    assert.deepEqual([control.edits, control.mode, control.disconnect, control.choose], [null, null, false, true]);
    assert.equal(control.dot.tone, "demo");
    assert.equal(control.dot.busy, false, "the demo never pulses");
});

// What the rail's status lines used to say about the keyboard itself, and
// nothing else on screen says, is in the dot's hover words.
test("a restart the keyboard needs turns the dot red and says how, in the Keyboard screen's words", () => {
    const dot = keyboardControl(connected({status: {slaveCleanupPending: true}})).dot;
    assert.equal(dot.tone, "err");
    assert.ok(dot.tip.startsWith(`${RESTART_NEEDED.label}. ${[RESTART_NEEDED.detail, ...RESTART_NEEDED.steps].join(" ")}`), dot.tip);
});

test("a save the keyboard is finishing is said on the dot, not as a recovery copy", () => {
    const dot = keyboardControl(connected({status: {candidatePending: true}})).dot;
    assert.equal(dot.tone, "ok");
    assert.match(dot.tip, new RegExp(`${SAVE_IN_PROGRESS.label}\\. ${SAVE_IN_PROGRESS.detail.replace(/[.()]/g, "\\$&")}`));
    assert.doesNotMatch(dot.tip, /recovery/i);
    assert.doesNotMatch(keyboardControl(connected()).dot.tip, /Save in progress|Restart the keyboard/);
});

test("the keyboard's own saving news is said on the dot: an adjustment pending, saved by the keyboard, the slave half catching up", () => {
    /** @param {object} live @param {object} [flags] */
    const tip = (live, flags = {}) => keyboardControl(connected({mode: 1, live, keyboard: flags})).dot.tip;
    assert.match(tip({}, {adjustmentPending: true}), /Keyboard adjustment pending\. A DPI or lighting key change is waiting to reach both halves\./);
    assert.match(tip({}, {savedByKeyboard: true}), /Saved by the keyboard\. The keyboard saved its edits by itself; they survive a replug\./);
    assert.match(tip({converged: false}), /Slave half catching up\./);
    assert.doesNotMatch(tip({}), /adjustment|Saved by|catching up/);
    // Under a Review and save draft the keyboard's flags sit on the draft
    // itself.
    const apply = connected({mode: 0, live: null, keyboard: {adjustmentPending: true}});
    assert.match(keyboardControl(apply).dot.tip, /Keyboard adjustment pending/);
    // Nothing is said of a keyboard that is not there.
    assert.doesNotMatch(keyboardControl({...apply, device: {connected: false, label: "", health: {}}}).dot.tip, /adjustment/);
});
