"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {buildDeviceModel, buildSnapshotModel, deviceSummary} = require("../../core/session/device-model");
const {decodedDeviceProfile} = require("../fixtures/device-profile");
const {resolve} = require("../../core/data/keycode-catalog");

test("behaviour editing requires supported firmware and a complete idle read", () => {
    const state = {capabilities: {supportedDomainMask: 3, maxTapStepsPerBehavior: 5}, committed: decodedDeviceProfile()};
    assert.equal(buildDeviceModel(state).behaviorEditing.writable, true);
    assert.equal(buildDeviceModel(state).behaviorEditing.maxTapStepsPerBehavior, 5);
    for (const update of [{capabilities: {supportedDomainMask: 1}}, {committed: null}, {busy: true}, {committed: {...state.committed, failures: [{domainId: 0x10}]}}]) {
        assert.equal(buildDeviceModel({...state, ...update}).behaviorEditing.writable, false);
    }
});

test("behaviour rows claim their keys' built-in first actions", () => {
    const rows = buildDeviceModel({committed: decodedDeviceProfile()}).keyBehaviors;
    const claims = rows.filter((row) => Object.keys(row.builtIn).length).map((row) => row.keycode);
    assert.ok(claims.some((keycode) => keycode.startsWith("LT(")), "the fixture's LT row inherits its tap and layer hold");
    assert.ok(["KC_1", "LGUI(KC_C)", "QK_MOUSE_BUTTON_3"].every((keycode) => claims.includes(keycode)), "plain keys tap and hold themselves");
});

// The ported Studio UI renders whatever shape it is given, so these assertions
// pin the contract between the device and that UI. Getting a field name wrong
// here shows up as a silently empty tab, which is exactly the failure the port
// is most exposed to.

const MODEL_FIELDS = [
    "layers", "keyBehaviors", "combos", "viaMacros", "macroNameSpace", "behaviorTimingDefaults",
    "configDefaults", "rgb", "qmkKeycodes", "qmkKeyLabels", "qmkKeyLayers", "qmkKeyShortLabels", "qmkKeycodeAliases",
    "qmkKeycodeSource", "qmkSpellings", "macroPayloadKeycodes", "diagnostics",
];

function layoutWith(keys) {
    return {state: "read", layers: [{layer: 0, keys}]};
}

test("unstored behaviour defaults share the firmware timing and built-in rules", () => {
    const values = [0x4309, 0x2109, 0x52a1, 0x52c2, 0x5281, 0x5201, 0x04, 0, 1];
    const state = {layout: layoutWith(values.map((keycode, layoutIndex) => ({keycode, layoutIndex, resolved: resolve(keycode)}))),
        settingsView: {timing: {tappingTerm: "210", tapHoldTerm: "150", longerHoldTerm: "400", multiTapTerm: "170"}}};
    const model = buildDeviceModel(state);
    const defaults = model.behaviorEditing.keyDefaults;
    assert.equal(defaults["LT(3,KC_F)"].timing.tapHoldTerm, "210", "LT inherits the dual-role threshold");
    assert.equal(defaults["LT(3,KC_F)"].builtIn.tap.action, "KC_F");
    assert.equal(defaults["LT(3,KC_F)"].builtIn.hold.action, "MO(3)");
    // Every dual-role key holds at the dual-role threshold, row or not
    // (firmware D-F27, bit 31); any other key's row at the behaviour one.
    for (const name of ["MT(MOD_LCTL,KC_F)", "OSM(MOD_LCTL)", "TT(2)", "OSL(1)"]) {
        assert.equal(defaults[name].timing.tapHoldTerm, "210", name);
        assert.equal(defaults[name].timingSources?.tapHoldTerm, "tappingTerm", name);
    }
    assert.equal(defaults["TO(1)"].timing.tapHoldTerm, "150", "TO() is no dual-role key");
    assert.equal(defaults["MT(MOD_LCTL,KC_F)"].builtIn.tap.action, "KC_F");
    assert.deepEqual(defaults.KC_A.timing, {tapHoldTerm: "150", longerHoldTerm: "400", multiTapTerm: "170"});
    assert.equal(defaults.KC_NO, undefined);
    assert.equal(defaults.KC_TRANSPARENT, undefined);
    assert.deepEqual(model.keyBehaviors, [], "no behaviour is authored by publishing defaults");
});

test("every custom key has built-in behaviour defaults, placed or not", () => {
    // Custom keys edits the behaviour of a key on no layer yet, so its unstored
    // grid needs the same defaults as a placed one's.
    const keys = [0, 5].map(slot => ({slot, keycode: `CUSTOM_KEY_${slot}`, code: 0x7f00 + slot, name: "", hasBehavior: false}));
    const model = buildDeviceModel({
        layout: layoutWith([0x7f00, 0x04].map((keycode, layoutIndex) => ({keycode, layoutIndex, resolved: resolve(keycode)}))),
        committed: decodedDeviceProfile(), capabilities: {actionAbiDigest: 0x6fd70b90},
        settingsView: {timing: {tappingTerm: "210", tapHoldTerm: "150", longerHoldTerm: "400", multiTapTerm: "170"}},
        customKeyView: {keys},
    });
    const defaults = model.behaviorEditing.keyDefaults;
    assert.deepEqual(defaults.CUSTOM_KEY_0.builtIn, {releaseTaps: true}, "a placed custom key");
    assert.deepEqual(defaults.CUSTOM_KEY_5, defaults.CUSTOM_KEY_0, "an unplaced one has the same defaults");
    assert.deepEqual(defaults.CUSTOM_KEY_5.timing, {tapHoldTerm: "150", longerHoldTerm: "400", multiTapTerm: "170"});
    assert.ok(!model.keyBehaviors.some(row => row.keycode === "CUSTOM_KEY_5"), "publishing defaults authors no behaviour");
});

test("device shortcut labels stay complete and semantic names require the advertised ABI", () => {
    const values = [0x0806, 0x0a1d, 0x7e80, 0x7ec5, 0x7ec6, 0x7f02];
    const state = {
        layout: layoutWith(values.map((keycode, layoutIndex) => ({keycode, layoutIndex, resolved: resolve(keycode)}))),
        committed: decodedDeviceProfile(), capabilities: {actionAbiDigest: 0x6fd70b90},
    };
    const model = buildDeviceModel(state);
    assert.deepEqual(model.layers[0].positions.map(key => key.display), ["GUI+C", "Shift+GUI+Z", "Pd slot 0", "Lock Layer 5", "Lock Layer 6", "Custom key 2"],
        "a layer lock and a custom key are user slots under the native ABI, named by what they are");
    assert.equal(model.layers[0].positions[5].keycode, "0x7F02", "the editable identity still encodes to the original numeric value");
    assert.doesNotMatch(buildDeviceModel({...state, capabilities: {}}).layers[0].positions[5].display, /Custom key/, "an unknown ABI names no custom key");
});

test("a position carries what its value means, not only what the keyboard calls it", () => {
    // A pointing mode, a macro and a behaviour target are all stored as plain
    // user keycodes, while every other domain names them semantically. The
    // position publishes both, so a lookup from a key to what it reaches has
    // something to match on and does not re-derive the mapping.
    const values = [0x7e80, 0x7700, 0x0004, 0x7f00];
    const model = buildDeviceModel({
        layout: layoutWith(values.map((keycode, layoutIndex) => ({keycode, layoutIndex, resolved: resolve(keycode)}))),
        committed: decodedDeviceProfile(),
        capabilities: {actionAbiDigest: 0x6fd70b90},
        macroView: {viaMacros: [{keycode: "VIA_MACRO_0", kind: "via", name: "Sign-off"}]},
        customKeyView: {keys: [{slot: 0, keycode: "CUSTOM_KEY_0", code: 0x7f00, name: "Right Thumb", hasBehavior: true}]},
    });
    assert.deepEqual(model.layers[0].positions.map((key) => [key.keycode, key.semantic]), [
        ["0x7E80", "PD_SLOT_0"], ["QK_MACRO_0", "VIA_MACRO_0"], ["KC_A", "KC_A"], ["0x7F00", "CUSTOM_KEY_0"]]);
    assert.equal(model.qmkKeyLabels["0x7F00"], "Right Thumb", "a named custom key is labelled by its name");
    for (const [slot, keycode] of [[63, 0x7f3f], [64, 0x7f40], [127, 0x7f7f]]) {
        assert.ok(model.qmkKeycodes.some(key => key.value === `CUSTOM_KEY_${slot}` && key.keycode === keycode && key.group === "Custom keys"), `custom key ${slot} is offered`);
    }
    assert.ok(!model.qmkKeycodes.some(key => key.value === "CUSTOM_KEY_128"));
    assert.equal(model.qmkKeyLabels.QK_MACRO_0, "Sign-off", "a named macro is labelled by its name");
});

test("a dual-role key shows its tap the way that keycode is named elsewhere", () => {
    // `LT(3,KC_SLASH)` used to read SLASH on the cap while a plain slash read /,
    // so the same key looked like two different keys across layers.
    const model = buildDeviceModel({
        layout: layoutWith([0x4338, 0x4109].map((keycode, layoutIndex) => ({keycode, layoutIndex, resolved: resolve(keycode)}))),
    });
    assert.deepEqual(model.layers[0].positions.map((key) => [key.keycode, key.display]),
        [["LT(3,KC_SLASH)", "/"], ["LT(1,KC_F)", "F"]]);
});

test("the model always carries every field the UI reads", () => {
    const model = buildDeviceModel({});
    for (const field of MODEL_FIELDS) {
        assert.ok(field in model, `model is missing ${field}`);
    }
});

test("the keycode catalog reaches the UI in Studio's shape", () => {
    const model = buildDeviceModel({});
    assert.ok(model.qmkKeycodes.length > 500);

    // Studio's entries key on the keycode name, not the number.
    const a = model.qmkKeycodes.find((entry) => entry.value === "KC_A");
    assert.equal(a.label, "A");
    assert.equal(a.keycode, 0x0004);
    assert.ok(a.search.includes("kc_a"));

    assert.equal(model.qmkKeyLabels.KC_A, "A");
    assert.equal(model.qmkKeycodeAliases.KC_A, "KC_A");
    assert.equal(model.qmkKeycodeAliases._______, "_______");
});

test("no layers are reported until the device has actually been read", () => {
    assert.deepEqual(buildDeviceModel({}).layers, []);
    assert.deepEqual(buildDeviceModel({layout: {state: "reading", layers: []}}).layers, []);
    assert.match(buildDeviceModel({}).diagnostics.join(" "), /has not been read/);
});

test("device layers become the layer model the UI keys on", () => {
    const model = buildDeviceModel({
        layout: layoutWith([
            {layoutIndex: 0, row: 0, column: 0, keycode: 0x0004, resolved: {name: "KC_A", label: "A", kind: "basic", known: true}},
            {layoutIndex: 1, row: 0, column: 1, keycode: 0x0001, resolved: {name: "KC_TRANSPARENT", label: "Transparent", kind: "basic", known: true}},
        ]),
    });

    assert.equal(model.layers.length, 1);
    assert.equal(model.layers[0].name, "Layer 0");
    assert.equal(model.layers[0].index, 0);
    assert.deepEqual(model.layers[0].positions[0], {
        layoutIndex: 0, keycode: "KC_A", semantic: "KC_A", display: "A", editLabel: "A", row: 0, column: 0, value: 0x0004,
    });
    // Transparent gets a glyph rather than the word, to fit a key cap.
    assert.equal(model.layers[0].positions[1].display, "▽");
    assert.deepEqual(model.layers[0].answers, [[{layer: 0, active: 1, blocked: 0}], []]);
});

test("published layer answers name exact source slots through transparent and disabled keys", () => {
    const codes = [[4, 5], [6, 0], [1, 1]];
    const layout = {state: "read", layers: codes.map((values, layer) => ({layer,
        keys: values.map((keycode, layoutIndex) => ({layoutIndex, keycode, resolved: resolve(keycode)}))}))};
    const model = buildDeviceModel({layout});
    assert.deepEqual(model.layers[2].answers, [
        [{layer: 1, active: 2, blocked: 0}, {layer: 0, active: 1, blocked: 2}],
        [{layer: 1, active: 2, blocked: 0}, {layer: 0, active: 1, blocked: 2}],
    ]);
    assert.deepEqual(model.layers[1].answers[1], [{layer: 1, active: 2, blocked: 0}]);
});

test("layer and tap-hold keys name their layer without losing the expression", () => {
    const model = buildDeviceModel({
        committed: {state: "read", domains: {settings: {names: ["Base", "Numbers", "Symbols"]}}},
        layout: layoutWith([
            {layoutIndex: 0, row: 0, column: 0, keycode: 0x5222, resolved: {name: "MO(2)", label: "Layer hold 2", kind: "layer", layer: 2, known: true}},
            {layoutIndex: 1, row: 0, column: 1, keycode: 0x4105, resolved: {name: "LT(1,KC_B)", label: "B / layer 1", kind: "layer-tap", tap: "KC_B", layer: 1, known: true}},
        ]),
    });

    const [momentary, layerTap] = model.layers[0].positions;
    assert.equal(momentary.display, "Symbols", "the cap names the layer, not its number");
    assert.equal(momentary.editLabel, "Hold Symbols");
    assert.equal(momentary.keycode, "MO(2)", "the raw keycode keeps the number");
    assert.equal(layerTap.display, "B");
    assert.equal(layerTap.layerLabel, "Numbers");
    assert.equal(layerTap.editLabel, "B / Numbers");
    assert.equal(model.qmkKeyLabels["LT(1,KC_B)"], "B / Numbers", "any keycode on the board can be named by keycode");
    assert.equal(layerTap.keycode, "LT(1,KC_B)");
});

test("an unresolved keycode is shown, not hidden", () => {
    const model = buildDeviceModel({
        layout: layoutWith([
            {layoutIndex: 0, row: 0, column: 0, keycode: 0xfffe, resolved: {name: "0xFFFE", label: "0xFFFE", kind: "unknown", known: false}},
        ]),
    });
    assert.equal(model.layers[0].positions[0].keycode, "0xFFFE");
    assert.equal(model.layers[0].positions[0].value, 0xfffe);
    assert.equal(model.layers[0].positions[0].display, "0xFFFE");
});

test("domains awaiting the payload read stay empty rather than invented", () => {
    const model = buildDeviceModel({capabilities: {compiledLayerCount: 5}});
    assert.deepEqual(model.rgb, {baseEffect: {state: "unread", message: "Base RGB has not been read from the keyboard."}});
    assert.deepEqual(model.keyBehaviors, []);
    assert.deepEqual(model.combos, []);
    assert.deepEqual(model.viaMacros, []);
    assert.match(model.diagnostics.join(" "), /committed profile read/);
});

// The header is the first thing a user sees, and getting it wrong was the
// original sin of the port: it showed profile files and firmware compile
// buttons in an app that edits a keyboard.

test("the header reports the keyboard, not a profile directory", () => {
    const disconnected = buildDeviceModel({}).device;
    assert.equal(disconnected.connected, false);
    assert.match(disconnected.label + disconnected.summary, /^$/);

    const connected = buildDeviceModel({
        capabilities: {compiledLayerCount: 5},
        device: {manufacturer: "bastardkb", product: "Charybdis 4x6"},
        status: {committedGeneration: 7, committedDigest: 0xabcd1234, activeGeneration: 7, peerGeneration: 7, peerKnown: true, peerConverged: true},
    }).device;
    assert.equal(connected.connected, true);
    assert.equal(connected.label, "bastardkb Charybdis 4x6");
    assert.match(connected.summary, /generation 7/);
    assert.match(connected.summary, /0xABCD1234/);
    const state = {capabilities: {}, device: {manufacturer: "bastardkb", product: "Charybdis 4x6"}};
    assert.equal(buildDeviceModel({...state, storedKeyboardName: ""}).device.label, "bastardkb Charybdis 4x6", "the built-in name keeps its maker");
    assert.equal(buildDeviceModel({...state, storedKeyboardName: "Noah’s board"}).device.label, "Noah’s board", "a name the person gave stands alone");
});

test("listed keyboards read by name, told apart by serial or number only where two read alike", () => {
    const {deviceLabels} = require("../../core/session/device-model");
    assert.deepEqual(deviceLabels([]), []);
    assert.deepEqual(deviceLabels([{product: "Charybdis", serialNumber: "E4", number: 1}]), ["Charybdis"]);
    assert.deepEqual(deviceLabels([{product: "Charybdis", number: 1}, {product: "Charybdis", number: 2}, {product: "Desk", number: 3}]),
        ["Keyboard 1 · Charybdis", "Keyboard 2 · Charybdis", "Desk"]);
    assert.deepEqual(deviceLabels([{product: "Charybdis", serialNumber: "E4"}, {product: "Charybdis", serialNumber: "DE"}]), ["Charybdis · E4", "Charybdis · DE"]);
    assert.deepEqual(deviceLabels([{product: "Charybdis", name: "Desk", number: 1}, {product: "Charybdis", number: 2}]), ["Desk", "Charybdis"],
        "a stored name the keyboard has not reconnected under yet already tells it apart");
    assert.deepEqual(deviceLabels([{product: "Desk", number: 1}, {product: "Charybdis", name: "Desk", number: 2}]), ["Keyboard 1 · Desk", "Keyboard 2 · Desk"]);
    assert.deepEqual(deviceLabels([{number: 4}]), ["Charybdis 4x6"]);
});

test("the Settings card gets the stored name, and the built-in one only while the keyboard reports it", () => {
    const {buildSnapshotModel} = require("../../core/session/device-model");
    const {document} = require("../fixtures/portable-profile");
    const {fingerprint, summary} = require("../../core/model/portable-profile");
    const value = document(), snapshot = {document: value, fingerprint: fingerprint(value), summary: summary(value)};
    const caps = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 0}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x6fd70b90};
    const binding = {editable: true, reason: ""}, device = {product: "Charybdis (4x6) Splinky"};
    assert.deepEqual(buildSnapshotModel(snapshot, caps, binding, {device, storedKeyboardName: ""}).keyboardName,
        {name: "", builtIn: "Charybdis (4x6) Splinky", identity: snapshot.fingerprint, perName: 32});
    assert.equal(buildSnapshotModel(snapshot, caps, binding, {device, storedKeyboardName: "Old name"}).keyboardName.builtIn, "", "a renamed keyboard reports its name, not the built-in one");
    assert.equal(buildSnapshotModel(snapshot, caps, binding, {device}).keyboardName.builtIn, "", "unknown until the keyboard's profile is read");
    assert.equal(buildDeviceModel({capabilities: {}}).keyboardName, null, "independent reads offer no rename");
});

test("half divergence is stated plainly rather than shown as healthy", () => {
    const converged = buildDeviceModel({
        capabilities: {}, status: {committedGeneration: 4, activeGeneration: 4, peerGeneration: 4, committedDigest: 1, peerKnown: true, peerConverged: true},
    }).device;
    assert.match(converged.summary, /both halves connected/);
    assert.equal(converged.health.halves, "agree");

    const diverged = buildDeviceModel({
        capabilities: {}, status: {committedGeneration: 4, activeGeneration: 4, peerGeneration: 3, committedDigest: 1, peerKnown: true, peerConverged: false},
    }).device;
    assert.match(diverged.summary, /halves out of sync/);
    assert.equal(diverged.health.halves, "apart");

    for (const [peer, halves, words] of [
        [{peerKnown: false, peerConverged: false}, "alone", /slave half not found/],
        [{peerKnown: true, peerConverged: false}, "apart", /halves out of sync/],
        [{peerKnown: true, peerConverged: true, conflictCount: 1}, "apart", /halves out of sync/],
    ]) {
        const absentOrUnready = buildDeviceModel({capabilities: {}, status: {
            committedGeneration: 0, activeGeneration: 0, peerGeneration: 0, committedDigest: 0, ...peer,
        }}).device;
        assert.equal(absentOrUnready.health.converged, false);
        assert.equal(absentOrUnready.health.halves, halves, "the slave half missing reads apart from halves disagreeing");
        assert.match(absentOrUnready.summary, words);
    }
});

test("the header exposes one health model for connection, convergence and recovery", () => {
    const disconnected = buildDeviceModel({phase: "empty", error: {message: "Keyboard unavailable"}}).device;
    assert.deepEqual(disconnected.health, {
        profile: "unavailable",
        converged: false,
        halves: "unread",
        recoveryPending: false,
        restartNeeded: false,
        earlierFormat: false,
        busy: false,
        phase: "empty",
        error: "Keyboard unavailable",
    });

    const connected = buildDeviceModel({
        capabilities: {},
        busy: true,
        phase: "read-profile",
        status: {committedGeneration: 4, activeGeneration: 4, peerGeneration: 4, committedDigest: 1, candidatePending: true, peerKnown: true, peerConverged: true},
        mutationCompatibility: {recoveryPending: true},
    }).device;
    assert.equal(connected.health.profile, "synced");
    assert.equal(connected.health.converged, true);
    assert.equal(connected.health.recoveryPending, true);
    assert.equal(connected.health.busy, true);
    assert.equal(connected.health.phase, "read-profile");
    assert.equal(connected.health.restartNeeded, false);
    const wedged = buildDeviceModel({
        capabilities: {compiledLayerCount: 16},
        status: {committedGeneration: 4, activeGeneration: 4, peerGeneration: 4, committedDigest: 1, peerKnown: true, peerConverged: true, peerCleanupPending: true},
    }).device;
    assert.equal(wedged.health.restartNeeded, true, "the rail asks for a restart while the peer holds a cancelled save");
    assert.equal(wedged.health.earlierFormat, false);
    const earlier = buildDeviceModel({
        capabilities: {compiledLayerCount: 16},
        status: {committedGeneration: 0, activeGeneration: 0, peerKnown: true, peerConverged: true, storedEarlierFormat: true},
    }).device;
    assert.equal(earlier.health.earlierFormat, true, "the keyboard says its saved profile is in an earlier format");
});

test("the subtitle says what to do next", () => {
    const idle = buildDeviceModel({capabilities: {}}).device;
    assert.match(idle.subtitle, /Read from keyboard/);

    const read = buildDeviceModel({
        capabilities: {},
        layout: {state: "read", layers: [{layer: 0, keys: []}, {layer: 1, keys: []}]},
    }).device;
    assert.match(read.subtitle, /2 layers read/);
});

// The committed profile is what the keyboard is actually running. Showing a
// half-read or failed decode as if it were device state would be the worst
// failure this app can have, so those paths are pinned here.

function committedRead(overrides = {}) {
    return {
        state: "read",
        generation: 12,
        digest: 0xdeadbeef,
        byteLength: 320,
        domainIds: [0x10, 0x20],
        domains: {},
        failures: [],
        ...overrides,
    };
}

test("decoded domains reach the UI only after a verified read", () => {
    const {rgb, keyBehaviors: behaviors} = decodedDeviceProfile().domains;

    const reading = buildDeviceModel({committed: {state: "reading", progress: {done: 10, total: 320}}});
    assert.deepEqual(reading.rgb, {baseEffect: {state: "unread", message: "Base RGB has not been read from the keyboard."}}, "a partial read must not render as device state");
    assert.deepEqual(reading.keyBehaviors, []);

    const done = buildDeviceModel({committed: committedRead({domains: {rgb, keyBehaviors: behaviors}})});
    assert.equal(done.rgb.layerColors[0].layer, "Layer 0");
    assert.equal(done.rgb.layerColors.length, 16);
    assert.equal(done.keyBehaviors.length, 37);
    assert.ok(done.keyBehaviors.every(row => row.keycode && row.steps.every(step => Number.isInteger(step.tapCount))));
});

test("a keyboard with no committed profile says so instead of looking broken", () => {
    const model = buildDeviceModel({capabilities: {}, committed: {state: "none", reason: "no committed profile"}});
    assert.deepEqual(model.rgb, {baseEffect: {state: "unread", message: "Base RGB has not been read from the keyboard."}});
    assert.deepEqual(model.keyBehaviors, []);
    assert.match(model.diagnostics.join(" "), /need the committed profile read/);
});

test("a domain that fails to decode is named, and the others still render", () => {
    const model = buildDeviceModel({
        committed: committedRead({
            domains: {rgb: decodedDeviceProfile().domains.rgb},
            failures: [{domainId: 0x20, message: "row count exceeds the declared limit"}],
        }),
    });

    assert.equal(model.rgb.layerColors.length, 16, "one bad domain must not discard the whole profile");
    assert.deepEqual(model.keyBehaviors, []);
    assert.match(model.diagnostics.join(" "), /0x20 did not decode/);
    assert.match(model.diagnostics.join(" "), /row count exceeds/);
});

test("the header reports the generation once the profile is read", () => {
    const model = buildDeviceModel({
        capabilities: {},
        layout: {state: "read", layers: [{layer: 0, keys: []}]},
        committed: committedRead({generation: 12}),
    });
    assert.match(model.device.subtitle, /1 layers and generation 12 read/);
    assert.match(model.diagnostics.join(" "), /generation 12 read from the keyboard \(320 bytes\)/);
});

// A keyboard with nothing committed is still running something. Showing its
// compiled defaults is the honest answer; showing an empty editor is not. But
// the two must never be confused for each other.

test("compiled defaults are shown, and labelled as compiled", () => {
    const model = buildDeviceModel({
        capabilities: {},
        status: {committedGeneration: 0, committedDigest: 0, activeGeneration: 0, peerGeneration: 0},
        committed: committedRead({source: "compiled", generation: 0, byteLength: 210, domains: decodedDeviceProfile().domains}),
    });

    assert.equal(model.rgb.layerColors.length, 16, "the tabs must populate from compiled defaults");
    assert.equal(model.keyBehaviors.length, 37);
    assert.match(model.diagnostics.join(" "), /compiled defaults/);
    assert.match(model.diagnostics.join(" "), /what the keyboard is running/);
    assert.match(model.device.subtitle, /compiled defaults/);
});

test("an uncommitted keyboard does not claim generation 0 as a generation", () => {
    const model = buildDeviceModel({
        capabilities: {},
        status: {committedGeneration: 0, committedDigest: 0, activeGeneration: 0, peerGeneration: 0},
    });
    assert.match(model.device.summary, /no committed profile/);
    assert.doesNotMatch(model.device.summary, /generation 0/);
});

test("a committed profile is still reported as committed", () => {
    const model = buildDeviceModel({
        capabilities: {},
        status: {committedGeneration: 7, committedDigest: 0xabcd1234, activeGeneration: 7, peerGeneration: 7},
        committed: committedRead({source: "committed", generation: 7}),
    });
    assert.match(model.device.summary, /generation 7/);
    assert.doesNotMatch(model.device.summary, /compiled defaults/);
    assert.match(model.diagnostics.join(" "), /Committed profile generation 7/);
});

test("a behaviour on a key never renames what the vocabulary already names", () => {
    const committed = decodedDeviceProfile();
    const row = (target) => ({target, tapHoldTerm: 0, longerHoldTerm: 0, multiTapTerm: 0, keepsAutoMouseAnchored: false, steps: []});
    committed.domains = {...committed.domains, keyBehaviors: {...committed.domains.keyBehaviors, rows: [
        row({kind: 2, flags: 0, operand: 1}),   // MO(1)
        row({kind: 3, flags: 0, operand: 2}),   // LOCK_LAYER(2)
        row({kind: 6, flags: 0, operand: 0}),   // VIA_MACRO_0
    ]}};
    const macroView = {viaMacros: [{kind: "via", keycode: "VIA_MACRO_0", payload: ""}], hardcodedMacros: []};
    const labels = buildDeviceModel({committed, macroView, capabilities: {actionAbiDigest: 0x6fd70b90}}).qmkKeyLabels;
    const plain = buildDeviceModel({macroView, capabilities: {actionAbiDigest: 0x6fd70b90}}).qmkKeyLabels;
    assert.equal(labels["MO(1)"], plain["MO(1)"], "MO(1) reads as it does with no behaviour on it, not \"Mo(1)\"");
    assert.equal(labels.QK_MACRO_0, "Macro 0", "the macro screen's name");
    assert.equal(labels["0x7EC2"], "Lock Layer 2", "a bare user slot reads by what it does to which layer");
    assert.equal(labels["LOCK_LAYER(2)"], "Lock Layer 2");
});

test("effective host names reach keycaps, picker search and modifier controls without changing assignments", () => {
    const keys = [0xe2, 0xe3, 0x0804, 0x2804];
    const state = {layout: {state: "read", layers: [{layer:0, keys: keys.map((keycode, layoutIndex) => ({keycode, layoutIndex, resolved:resolve(keycode)}))}]}, settingsView: {host:{effective:1}}};
    const model = buildDeviceModel(state);
    assert.deepEqual(model.layers[0].positions.map(p => p.editLabel), ["Left Option", "Left Command", "Command+A", "A / Command"]);
    assert.equal(model.layers[0].positions[3].modifierLabel, "Command");
    assert.deepEqual(model.layers[0].positions.map(p => p.value), keys);
    assert.equal(model.vocabulary.pickerModifiers.find(({value}) => value === "G").label, "Command");
    assert.equal(model.vocabulary.modifiers.find(([id]) => id === 4)[1], "Left Option");
    assert.match(model.qmkKeycodes.find(e => e.keycode === 0xe3).search, /command/);
});

test("pointing-only shortcuts enter the shared OS label table", () => {
    const model = buildDeviceModel({settingsView:{host:{effective:3}}, committed:{state:"read", domains:{pdModes:[
        {id:0, kind:1, directions:{up:{keycode:0x0804}}, diagonals:{}, buttons:[{tap:{keycode:0x0805}}]}
    ]}}});
    assert.equal(model.qmkKeyLabels[resolve(0x0804).name], "Super+A");
    assert.equal(model.qmkKeyLabels[resolve(0x0805).name], "Super+B");
});

test("every name the model gives a layer key carries the layer the model says it acts on", () => {
    // The interface marks the layer a name ends in from qmkKeyLayers, never
    // from the keycode, so the two must agree or a name reads unmarked.
    const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
    const {document, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
    const {fingerprint, summary} = require("../../core/model/portable-profile");
    const value = document();
    const draft = new ProfileDraftSession({document: value, fingerprint: fingerprint(value), summary: summary(value), limits: {brightnessMax: 200}}, "board", CURRENT_CAPABILITIES);
    draft.stage({type: "updateLayoutKeys", draftRevision: draft.revision, layer: "Layer 0", changes: [
        {layoutIndex: 0, keycode: "MO(2)"}, {layoutIndex: 1, keycode: "LT(1,KC_B)"}, {layoutIndex: 2, keycode: "LOCK_LAYER(3)"},
        {layoutIndex: 3, keycode: "LM(1,MOD_LSFT)"}, {layoutIndex: 4, keycode: "TG(2)"},
    ]});
    draft.stage({type: "addCombo", draftRevision: draft.revision, inputs: ["LT(1,KC_B)", "KC_C"], output: "MO(2)", termMs: ""});
    const state = {capabilities: CURRENT_CAPABILITIES, phase: "idle", committed: {state: "unavailable"}, combos: {state: "unavailable"}};
    const model = buildSnapshotModel(draft.current, CURRENT_CAPABILITIES, {editable: true, reason: ""}, state);
    const layerNames = model.layers.map(layer => layer.displayName);
    /** @param {string} label @param {number} layer */
    const carries = (label, layer) => label.endsWith(layerNames[layer]) || label.startsWith(layerNames[layer]);
    for (const [name, layer] of Object.entries(model.qmkKeyLayers)) {
        if (layer >= layerNames.length || model.qmkKeyLabels[name] === undefined) continue;
        assert.ok(carries(model.qmkKeyLabels[name], layer), `${name} reads "${model.qmkKeyLabels[name]}", without ${layerNames[layer]}`);
    }
    for (const position of model.layers[0].positions.slice(0, 5)) {
        assert.ok(Number.isInteger(model.qmkKeyLayers[position.keycode]), `${position.keycode} is in the layer table`);
        assert.ok(carries(position.editLabel, model.qmkKeyLayers[position.keycode]), `${position.keycode} reads "${position.editLabel}"`);
    }
    const combo = model.combos.find(row => row.output === "MO(2)");
    assert.equal(model.qmkKeyLayers[combo.output], 2);
    assert.ok(carries(combo.outputDisplay, 2), `the combo's output reads "${combo.outputDisplay}"`);
    combo.inputs.forEach((input, at) => {
        if (model.qmkKeyLayers[input] !== undefined) assert.ok(carries(combo.inputDisplays[at], model.qmkKeyLayers[input]), `${input} reads "${combo.inputDisplays[at]}"`);
    });
    assert.equal(model.qmkKeyLayers.KC_C, undefined, "a key on no layer is not in the table");
});

test("snapshot presentation uses its decoded configuration and real device diagnostics", () => {
    const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
    const {document, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
    const {fingerprint, summary} = require("../../core/model/portable-profile");
    const value = document();
    const capabilities = {...CURRENT_CAPABILITIES, featureFlags: (1 << 17) | (1 << 18)};
    const draft = new ProfileDraftSession({document: value, fingerprint: fingerprint(value), summary: summary(value), limits: {brightnessMax: 200}}, "board", capabilities);
    draft.stage({type: "updateLayoutKeys", draftRevision: draft.revision, layer: "Layer 0", changes: [
        {layoutIndex: 0, keycode: "PD_SLOT_0"}, {layoutIndex: 1, keycode: "VIA_MACRO_0"},
        {layoutIndex: 2, keycode: "CUSTOM_KEY_0"}, {layoutIndex: 3, keycode: "LT(3,KC_F)"},
        {layoutIndex: 4, keycode: "MT(MOD_LSFT,KC_A)"}, {layoutIndex: 5, keycode: "MO(2)"},
    ]});
    draft.stage({type: "updateViaMacro", draftRevision: draft.revision, keycode: "VIA_MACRO_0", name: "Sign-off", payload: "hello"});
    draft.stage({type: "updateCustomKey", draftRevision: draft.revision, keycode: "CUSTOM_KEY_0", name: "Right Thumb"});
    const state = {capabilities, phase: "reading", error: {message: "Read unavailable"}, committed: {state: "unavailable"},
        combos: {state: "unavailable", error: {message: "Combo read unavailable"}}};
    const model = buildSnapshotModel(draft.current, capabilities, {editable: true, reason: ""}, state);
    assert.deepEqual(model.layers[0].positions.slice(0, 3).map(key => key.semantic), ["PD_SLOT_0", "VIA_MACRO_0", "CUSTOM_KEY_0"]);
    assert.equal(model.layers[0].positions[1].display, "Sign-off");
    assert.equal(model.layers[0].positions[2].display, "Right Thumb");
    assert.equal(model.layers[0].displayName, "Base");
    assert.equal(model.behaviorEditing.keyDefaults["LT(3,KC_F)"].timing.tapHoldTerm, "200");
    assert.equal(model.behaviorEditing.keyDefaults["LT(3,KC_F)"].builtIn.hold.action, "MO(3)");
    assert.deepEqual(model.behaviorEditing.keyDefaults["LT(3,KC_F)"].timingSources,
        {tapHoldTerm: "tappingTerm", longerHoldTerm: "longHoldTerm", multiTapTerm: "multiTapTerm"});
    // Every dual-role key follows the dual-role term, row or not (firmware
    // D-F27, bit 31); any other key's row the behaviour term.
    const mt = Object.entries(model.behaviorEditing.keyDefaults).find(([name]) => /^(LSFT_T|MT)\(/.test(name))?.[1];
    assert.ok(mt, "the MT key has defaults");
    assert.equal(mt.timingSources?.tapHoldTerm, "tappingTerm");
    assert.equal(mt.timing.tapHoldTerm, model.behaviorEditing.keyDefaults["LT(3,KC_F)"].timing.tapHoldTerm);
    assert.equal(model.behaviorEditing.keyDefaults["KC_A"]?.timingSources?.tapHoldTerm, "tapHoldTerm");
    // B6: MO holds its layer from the press.
    assert.equal(model.behaviorEditing.keyDefaults["MO(2)"].builtIn.hold.fromPress, true);
    assert.equal(model.viaMacros[0].payload, "hello");
    assert.equal(model.pdModes.length, 32);
    assert.equal(model.combos[0].termMs, 50);
    assert.equal(model.combos[0].followsDefault, true);
    assert.deepEqual(model.participation.layers, draft.current.decoded.settings.layers);
    assert.deepEqual({device: model.device, diagnostics: model.diagnostics}, deviceSummary(state));
    assert.match(model.diagnostics.join(" "), /Layout has not been read/);
    assert.match(model.diagnostics.join(" "), /Combo read unavailable/);
    assert.equal(model.device.health.error, "Read unavailable");
});

test("snapshot presentation reuses a matching decode and follows the binding for every editor", () => {
    const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
    const {document, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
    const {fingerprint, summary} = require("../../core/model/portable-profile");
    const value = document();
    const draft = new ProfileDraftSession({document: value, fingerprint: fingerprint(value), summary: summary(value), limits: {brightnessMax: 0}}, "board", CURRENT_CAPABILITIES);
    const current = draft.current;
    const held = {...current.document};
    Object.defineProperty(held, "profile", {get() {throw new Error("A model publish must not decode profile bytes again");}});
    const snapshot = {...current, document: held, decoded: {...current.decoded, document: held}};
    for (const binding of [{editable: true, reason: ""}, ...["busy", "stale", "disconnected", "connection-changed"].map(reason => ({editable: false, reason}))]) {
        const model = buildSnapshotModel(snapshot, CURRENT_CAPABILITIES, binding);
        assert.equal(model.rgb.maximumBrightness, 0);
        assert.equal(model.rgb.baseEffect.brightness, current.decoded.settings.values[22] >>> 16);
        assert.equal(model.rgb.baseEffect.previewColor.v, String(current.decoded.settings.values[22] >>> 16));
        for (const field of ["behaviorEditing", "pdModeEditing", "comboReadback", "macroEditing", "settingsEditing", "customKeyEditing"]) {
            assert.equal(model[field].writable, binding.editable, `${field} follows the same binding`);
        }
    }
    assert.equal(draft.current.decoded, current.decoded);
});
