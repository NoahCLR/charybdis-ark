import assert from "node:assert/strict";
import test from "node:test";
import {keyboardControl} from "../../webview/view/keyboard-menu.mjs";
import {RESTART_NEEDED, SAVE_IN_PROGRESS} from "../../webview/view/keyboard-view.mjs";

// The rail's keyboard button (prototype E) and its menu, from the published
// model. The words for the modes are whatever the vocabulary says, in the
// order the keyboard offers them.
const vocabulary = {
    editModes: {
        0: {id: "apply", label: "Mode A", hint: "hint a", detail: "detail a"},
        1: {id: "live", label: "Mode B", hint: "hint b", detail: "detail b"},
        2: {id: "liveReview", label: "Mode C", hint: "hint c", detail: "detail c"},
    },
    halves: {agree: {label: "Both halves connected", detail: "Same settings."}, apart: {label: "Halves out of sync", detail: "Different settings."}},
    phases: {read: {label: "Reading the keyboard"}},
};
const keyboard = {saving: false, savedByKeyboard: false, saveFailed: false, storagePaused: false, adjustmentPending: false, stopped: false, slaveStopped: false};
/** @param {object} [extra] */
const connected = (extra = {}) => /** @type {any} */ ({
    vocabulary,
    device: {connected: true, label: "Charybdis - Home", health: {halves: "agree", busy: false, recoveryPending: false, restartNeeded: false}},
    editMode: {mode: 2, conflict: false, offered: [1, 2, 0]},
    draft: {changes: [], dirty: false, live: {mode: 2, unsaved: false, converged: true, slaveRefused: false, keyboard}},
    shell: {chooseKeyboard: true},
    devices: [{id: "a", label: "Charybdis - Home"}],
    selectedDeviceId: "a",
    ...extra,
});

test("the button names the keyboard and its edit mode; the menu lists the modes as offered, ticking the current one", () => {
    const control = keyboardControl(connected());
    assert.equal(control.name, "Charybdis - Home");
    assert.deepEqual(control.mode, {label: "Mode C", detail: "detail c", warn: ""});
    assert.deepEqual(control.edits?.choices.map(({value, label, hint, detail, current, offered}) => [value, label, hint, detail, current, offered]),
        [[1, "Mode B", "hint b", "detail b", false, true], [2, "Mode C", "hint c", "detail c", true, true], [0, "Mode A", "hint a", "detail a", false, true]],
        "in the keyboard's order, never re-sorted here");
    assert.equal(control.edits?.settle, false);
    assert.equal(control.opens, true);
    assert.equal(control.disabled, false);
});

test("a mode the keyboard reports but Ark does not offer is shown, not offered", () => {
    const control = keyboardControl(connected({editMode: {mode: 1, conflict: false, offered: [2, 0]}}));
    assert.deepEqual(control.edits?.choices.map(({value, current, offered}) => [value, current, offered]), [[2, false, true], [0, false, true], [1, true, false]]);
});

test("halves that stored different modes offer Settle; a mode not stored yet is marked, both on the button too", () => {
    const conflict = keyboardControl(connected({editMode: {mode: 2, conflict: true, offered: [1, 2, 0]}}));
    assert.equal(conflict.edits?.settle, true);
    assert.match(conflict.mode?.warn || "", /halves stored different modes/);
    const notStored = keyboardControl(connected({editMode: {mode: 2, conflict: false, offered: [1, 2, 0], notStored: true}}));
    assert.equal(notStored.edits?.notStored, true);
    assert.match(notStored.mode?.warn || "", /Unplugging it now may lose the mode/);
});

test("several keyboards are listed with the selected one ticked; one keyboard is not", () => {
    const two = keyboardControl(connected({devices: [{id: "a", label: "Home"}, {id: "b", label: "Travel"}], selectedDeviceId: "b"}));
    assert.deepEqual(two.keyboards, [{id: "a", label: "Home", current: false}, {id: "b", label: "Travel", current: true}]);
    assert.deepEqual(keyboardControl(connected()).keyboards, []);
});

test("Choose keyboard and Disconnect come with the shell's picker; Disconnect only with a keyboard to let go of", () => {
    assert.deepEqual((({choose, disconnect}) => ({choose, disconnect}))(keyboardControl(connected())), {choose: true, disconnect: true});
    const noPicker = keyboardControl(connected({shell: {chooseKeyboard: false}}));
    assert.deepEqual((({choose, disconnect}) => ({choose, disconnect}))(noPicker), {choose: false, disconnect: false});
});

test("while the keyboard is busy the button is disabled and its dot pulses with what it is doing", () => {
    const model = connected();
    model.device.health = {...model.device.health, busy: true, phase: "read"};
    const control = keyboardControl(model);
    assert.equal(control.disabled, true);
    assert.equal(control.dot.busy, true);
    assert.match(control.dot.tip, /^Reading the keyboard\. Both halves connected\./);
});

test("with no keyboard the button says so and its menu offers only Choose keyboard", () => {
    const control = keyboardControl(/** @type {any} */ ({vocabulary, device: {connected: false, label: "", health: {}}, editMode: null, draft: null, shell: {chooseKeyboard: true}, devices: []}));
    assert.equal(control.name, "No keyboard connected");
    assert.equal(control.mode, null);
    assert.equal(control.edits, null);
    assert.deepEqual([control.choose, control.disconnect, control.keyboards.length], [true, false, 0]);
    assert.deepEqual(control.dot, {tone: "err", tip: "No keyboard is connected.", busy: false});
    assert.equal(control.opens, true);
    // A page that cannot choose a keyboard has no menu to open.
    assert.equal(keyboardControl(/** @type {any} */ ({device: {connected: false}, shell: {chooseKeyboard: false}})).opens, false);
    assert.equal(keyboardControl(null).opens, false);
});

test("a keyboard coming back under its new name is shown by it, pulsing, with only Choose keyboard", () => {
    const control = keyboardControl(connected({reconnecting: {name: "Charybdis - Travel", lost: false}, device: {connected: false, label: "", health: {}},
        devices: [{id: "a", label: "Home"}, {id: "b", label: "Travel"}]}));
    assert.equal(control.name, "Charybdis - Travel");
    assert.deepEqual([control.edits, control.mode, control.keyboards.length, control.disconnect], [null, null, 0, false]);
    assert.equal(control.dot.busy, true);
    assert.match(control.dot.tip, /takes its new name/);
    assert.match(keyboardControl(connected({reconnecting: {name: "", lost: false, restart: true}})).dot.tip, /restarting/);
    assert.equal(keyboardControl(connected({reconnecting: {name: "", lost: true}})).name, "Charybdis");
});

test("the demo shows its name and dot, no edit modes, and only Choose keyboard", () => {
    const control = keyboardControl(connected({demo: {active: true}, device: {connected: true, label: "Demo", health: {busy: true}}}));
    assert.equal(control.name, "Demo");
    assert.deepEqual([control.edits, control.mode, control.disconnect, control.choose], [null, null, false, true]);
    assert.equal(control.dot.tone, "demo");
    assert.equal(control.dot.busy, false, "the demo never pulses");
});

// What the rail's status lines used to say about the keyboard itself, and
// nothing else on screen says, is in the dot's hover words.
test("a restart the keyboard needs turns the dot red and says how, in the Keyboard screen's words", () => {
    const model = connected();
    model.device.health.restartNeeded = true;
    const dot = keyboardControl(model).dot;
    assert.equal(dot.tone, "err");
    assert.ok(dot.tip.startsWith(`${RESTART_NEEDED.label}. ${[RESTART_NEEDED.detail, ...RESTART_NEEDED.steps].join(" ")}`), dot.tip);
});

test("a save the keyboard is finishing is said on the dot, not as a recovery copy", () => {
    const model = connected();
    model.device.health.recoveryPending = true;
    const dot = keyboardControl(model).dot;
    assert.equal(dot.tone, "ok");
    assert.match(dot.tip, new RegExp(`${SAVE_IN_PROGRESS.label}\\. ${SAVE_IN_PROGRESS.detail.replace(/[.()]/g, "\\$&")}`));
    assert.doesNotMatch(dot.tip, /recovery/i);
    assert.doesNotMatch(keyboardControl(connected()).dot.tip, /Save in progress|Restart the keyboard/);
});

test("the keyboard's own saving news is said on the dot: an adjustment pending, saved by the keyboard, the slave half catching up", () => {
    /** @param {object} live @param {object} [flags] */
    const tip = (live, flags = {}) => keyboardControl(connected({draft: {changes: [], dirty: false, live: {mode: 1, unsaved: false, converged: true, slaveRefused: false, keyboard: {...keyboard, ...flags}, ...live}}})).dot.tip;
    assert.match(tip({}, {adjustmentPending: true}), /Keyboard adjustment pending\. A DPI or lighting key change is waiting to reach both halves\./);
    assert.match(tip({}, {savedByKeyboard: true}), /Saved by the keyboard\. The keyboard saved its edits by itself; they survive a replug\./);
    assert.match(tip({converged: false}), /Slave half catching up\./);
    assert.doesNotMatch(tip({}), /adjustment|Saved by|catching up/);
    // Under a Review and save draft the keyboard's flags sit on the draft
    // itself.
    const apply = connected({draft: {changes: [{}], dirty: true, live: null, keyboard: {...keyboard, adjustmentPending: true}}});
    assert.match(keyboardControl(apply).dot.tip, /Keyboard adjustment pending/);
    // Nothing is said of a keyboard that is not there.
    assert.doesNotMatch(keyboardControl({...apply, device: {connected: false, label: "", health: {}}}).dot.tip, /adjustment/);
});
