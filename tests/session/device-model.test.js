"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {buildDeviceModel, buildSnapshotModel, deviceSummary} = require("../../core/session/device-model");
const {decodedDeviceProfile} = require("../fixtures/device-profile");

test("behaviour editing requires supported firmware and a complete idle read", () => {
    const state = {capabilities: {supportedDomainMask: 3, maxTapStepsPerBehavior: 5}, committed: decodedDeviceProfile()};
    assert.equal(buildDeviceModel(state).behaviorEditing.writable, true);
    assert.equal(buildDeviceModel(state).behaviorEditing.maxTapStepsPerBehavior, 5);
    for (const update of [{capabilities: {supportedDomainMask: 1}}, {committed: null}, {busy: true}, {committed: {...state.committed, failures: [{domainId: 0x10}]}}]) {
        assert.equal(buildDeviceModel({...state, ...update}).behaviorEditing.writable, false);
    }
});

// The ported Studio UI renders whatever shape it is given, so these assertions
// pin the contract between the device and that UI. Getting a field name wrong
// here shows up as a silently empty tab, which is exactly the failure the port
// is most exposed to.

const MODEL_FIELDS = [
    "layers", "keyBehaviors", "combos", "macros", "macroNameSpace", "behaviorTimingDefaults",
    "configDefaults", "rgb", "qmkKeycodes", "qmkKeyLabels", "qmkKeyLayers", "qmkKeyLayerForms", "qmkKeyKinds", "qmkKeyShortLabels", "qmkKeycodeAliases",
    "qmkKeycodeSource", "qmkSpellings", "macroPayloadKeycodes", "diagnostics",
];

test("the model always carries every field the UI reads", () => {
    const model = buildDeviceModel({});
    for (const field of MODEL_FIELDS) {
        assert.ok(field in model, `model is missing ${field}`);
    }
});

test("no layers are reported until the device has actually been read", () => {
    assert.deepEqual(buildDeviceModel({}).layers, []);
    assert.deepEqual(buildDeviceModel({layout: {state: "reading", layers: []}}).layers, []);
    assert.match(buildDeviceModel({}).diagnostics.join(" "), /has not been read/);
});

test("domains awaiting the payload read stay empty rather than invented", () => {
    const model = buildDeviceModel({capabilities: {compiledLayerCount: 5}});
    assert.deepEqual(model.rgb, {baseEffect: {state: "unread", message: "The background effect has not been read from the keyboard."}});
    assert.deepEqual(model.keyBehaviors, []);
    assert.deepEqual(model.combos, []);
    assert.deepEqual(model.macros, []);
    assert.match(model.diagnostics.join(" "), /committed profile read/);
});

// The device service's log is where a fault's own text goes (operation-
// failure.js, panel-loop.js keepFault); Diagnostics lists it after what was
// read, with a draft open too.
test("diagnostics list what was read, then the device service's log, newest last", () => {
    const log = ["Connected to Charybdis.", "TIMEOUT: The keyboard did not answer. (device webhid:1)"];
    const model = buildDeviceModel({diagnostics: log});
    assert.match(model.diagnostics[0], /Layout has not been read/);
    assert.deepEqual(model.diagnostics.slice(-2), log);
    assert.deepEqual(buildDeviceModel({}).diagnostics, deviceSummary({diagnostics: []}).diagnostics, "an empty log adds nothing");
    assert.deepEqual(deviceSummary({diagnostics: log}).diagnostics.slice(-2), log, "the summary a draft's model carries lists it too");
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
        status: {committedGeneration: 7, committedDigest: 0xabcd1234, activeGeneration: 7, slaveGeneration: 7, slaveKnown: true, slaveConverged: true},
    }).device;
    assert.equal(connected.connected, true);
    assert.equal(connected.label, "bastardkb Charybdis 4x6");
    assert.match(connected.summary, /generation 7/);
    assert.match(connected.summary, /0xABCD1234/);
    assert.equal(connected.savedProfile, "saved profile generation 7 · both halves connected", "the review's footer: words, no digest");
    assert.doesNotMatch(connected.savedProfile, /0x/i);
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
    const caps = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 3}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x67df11b3};
    const binding = {editable: true, reason: ""}, device = {product: "Charybdis (4x6) Splinky"};
    assert.deepEqual(buildSnapshotModel(snapshot, caps, binding, {device, storedKeyboardName: ""}).keyboardName,
        {name: "", builtIn: "Charybdis (4x6) Splinky", identity: snapshot.fingerprint, perName: 32});
    assert.equal(buildSnapshotModel(snapshot, caps, binding, {device, storedKeyboardName: "Old name"}).keyboardName.builtIn, "", "a renamed keyboard reports its name, not the built-in one");
    assert.equal(buildSnapshotModel(snapshot, caps, binding, {device}).keyboardName.builtIn, "", "unknown until the keyboard's profile is read");
    assert.equal(buildDeviceModel({capabilities: {}}).keyboardName, null, "independent reads offer no rename");
});

test("half divergence is stated plainly rather than shown as healthy", () => {
    const converged = buildDeviceModel({
        capabilities: {}, status: {committedGeneration: 4, activeGeneration: 4, slaveGeneration: 4, committedDigest: 1, slaveKnown: true, slaveConverged: true},
    }).device;
    assert.match(converged.summary, /both halves connected/);
    assert.equal(converged.health.halves, "agree");

    const diverged = buildDeviceModel({
        capabilities: {}, status: {committedGeneration: 4, activeGeneration: 4, slaveGeneration: 3, committedDigest: 1, slaveKnown: true, slaveConverged: false},
    }).device;
    assert.match(diverged.summary, /halves differ/);
    assert.equal(diverged.health.halves, "apart");

    for (const [slave, halves, words] of [
        [{slaveKnown: false, slaveConverged: false}, "alone", /slave half not found/],
        [{slaveKnown: true, slaveConverged: false}, "apart", /halves differ/],
        [{slaveKnown: true, slaveConverged: true, conflictCount: 1}, "apart", /halves differ/],
    ]) {
        const absentOrUnready = buildDeviceModel({capabilities: {}, status: {
            committedGeneration: 0, activeGeneration: 0, slaveGeneration: 0, committedDigest: 0, ...slave,
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
        status: {committedGeneration: 4, activeGeneration: 4, slaveGeneration: 4, committedDigest: 1, candidatePending: true, slaveKnown: true, slaveConverged: true},
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
        status: {committedGeneration: 4, activeGeneration: 4, slaveGeneration: 4, committedDigest: 1, slaveKnown: true, slaveConverged: true, slaveCleanupPending: true},
    }).device;
    assert.equal(wedged.health.restartNeeded, true, "the rail asks for a restart while the slave half holds a cancelled save");
    assert.equal(wedged.health.earlierFormat, false);
    const earlier = buildDeviceModel({
        capabilities: {compiledLayerCount: 16},
        status: {committedGeneration: 0, activeGeneration: 0, slaveKnown: true, slaveConverged: true, storedEarlierFormat: true},
    }).device;
    assert.equal(earlier.health.earlierFormat, true, "the keyboard says its saved profile is in an earlier format");
});

test("the subtitle says what to do next", () => {
    const idle = buildDeviceModel({capabilities: {}}).device;
    assert.match(idle.subtitle, /Choose Read keyboard/);

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
    assert.deepEqual(reading.rgb, {baseEffect: {state: "unread", message: "The background effect has not been read from the keyboard."}}, "a partial read must not render as device state");
    assert.deepEqual(reading.keyBehaviors, []);

    const done = buildDeviceModel({committed: committedRead({domains: {rgb, keyBehaviors: behaviors}})});
    assert.equal(done.rgb.layerColors[0].layer, "Layer 0");
    assert.equal(done.rgb.layerColors.length, 16);
    assert.equal(done.keyBehaviors.length, 37);
    assert.ok(done.keyBehaviors.every(row => row.keycode && row.steps.every(step => Number.isInteger(step.tapCount))));
});

test("a keyboard with no committed profile says so instead of looking broken", () => {
    const model = buildDeviceModel({capabilities: {}, committed: {state: "none", reason: "no committed profile"}});
    assert.deepEqual(model.rgb, {baseEffect: {state: "unread", message: "The background effect has not been read from the keyboard."}});
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
        status: {committedGeneration: 0, committedDigest: 0, activeGeneration: 0, slaveGeneration: 0},
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
        status: {committedGeneration: 0, committedDigest: 0, activeGeneration: 0, slaveGeneration: 0},
    });
    assert.match(model.device.summary, /no committed profile/);
    assert.doesNotMatch(model.device.summary, /generation 0/);
    assert.match(model.device.savedProfile, /^no saved profile · running the compiled defaults/);
});

test("a committed profile is still reported as committed", () => {
    const model = buildDeviceModel({
        capabilities: {},
        status: {committedGeneration: 7, committedDigest: 0xabcd1234, activeGeneration: 7, slaveGeneration: 7},
        committed: committedRead({source: "committed", generation: 7}),
    });
    assert.match(model.device.summary, /generation 7/);
    assert.doesNotMatch(model.device.summary, /compiled defaults/);
    assert.match(model.diagnostics.join(" "), /Committed profile generation 7/);
});

test("snapshot presentation uses its decoded configuration and real device diagnostics", () => {
    const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
    const {document, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
    const {fingerprint, summary} = require("../../core/model/portable-profile");
    const value = document();
    const capabilities = {...CURRENT_CAPABILITIES, featureFlags: (1 << 17) | (1 << 18)};
    const draft = new ProfileDraftSession({document: value, fingerprint: fingerprint(value), summary: summary(value), limits: {brightnessMax: 200}}, "board", capabilities);
    draft.stage({type: "updateLayoutKeys", draftRevision: draft.revision, layer: "Layer 0", changes: [
        {layoutIndex: 0, keycode: "PD_MODE_0"}, {layoutIndex: 1, keycode: "MACRO_0"},
        {layoutIndex: 2, keycode: "CUSTOM_KEY_0"}, {layoutIndex: 3, keycode: "LT(3,KC_F)"},
        {layoutIndex: 4, keycode: "MT(MOD_LSFT,KC_A)"}, {layoutIndex: 5, keycode: "MO(2)"},
    ]});
    draft.stage({type: "updateMacro", draftRevision: draft.revision, keycode: "MACRO_0", name: "Sign-off", payload: "hello"});
    draft.stage({type: "updateCustomKey", draftRevision: draft.revision, keycode: "CUSTOM_KEY_0", name: "Right Thumb"});
    const state = {capabilities, phase: "reading", error: {message: "Read unavailable"}, committed: {state: "unavailable"},
        combos: {state: "unavailable", error: {message: "Combo read unavailable"}}};
    const model = buildSnapshotModel(draft.current, capabilities, {editable: true, reason: ""}, state);
    assert.deepEqual(model.layers[0].positions.slice(0, 3).map(key => key.semantic), ["PD_MODE_0", "MACRO_0", "CUSTOM_KEY_0"]);
    assert.equal(model.layers[0].positions[1].display, "Sign-off");
    assert.equal(model.layers[0].positions[2].display, "Right Thumb");
    assert.equal(model.layers[0].displayName, "Base");
    assert.equal(model.behaviorEditing.keyDefaults["LT(3,KC_F)"].timing.tapHoldTerm, "200");
    assert.equal(model.behaviorEditing.keyDefaults["LT(3,KC_F)"].builtIn.hold.action, "MO(3)");
    assert.deepEqual(model.behaviorEditing.keyDefaults["LT(3,KC_F)"].timingSources,
        {tapHoldTerm: "tappingTerm", longHoldTerm: "longHoldTerm", multiTapTerm: "multiTapTerm"});
    // Every dual-role key follows the dual-role term, row or not (firmware
    // D-F27, bit 31); any other key's row the behaviour term.
    const mt = Object.entries(model.behaviorEditing.keyDefaults).find(([name]) => /^(LSFT_T|MT)\(/.test(name))?.[1];
    assert.ok(mt, "the MT key has defaults");
    assert.equal(mt.timingSources?.tapHoldTerm, "tappingTerm");
    assert.equal(mt.timing.tapHoldTerm, model.behaviorEditing.keyDefaults["LT(3,KC_F)"].timing.tapHoldTerm);
    assert.equal(model.behaviorEditing.keyDefaults["KC_A"]?.timingSources?.tapHoldTerm, "tapHoldTerm");
    // B6: MO holds its layer from the press.
    assert.equal(model.behaviorEditing.keyDefaults["MO(2)"].builtIn.hold.fromPress, true);
    assert.equal(model.macros[0].payload, "hello");
    assert.equal(model.pdModes.length, 32);
    assert.equal(model.combos[0].termMs, 50);
    assert.equal(model.combos[0].followsDefault, true);
    assert.deepEqual(model.participation, require("../../core/model/participation").participation(draft.current.decoded.settings).view(),
        "participation as core decides it, each layer's keys by layout index");
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
