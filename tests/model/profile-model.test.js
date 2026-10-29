"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {editorViews, panelCatalog, profileComboReadback, profileModel} = require("../../core/model/profile-model");
const {VOCABULARY} = require("../../core/model/vocabulary");
const {contractUnion} = require("../fixtures/contract-unions");
const {profileFacts} = require("../../core/model/layer-walk");
const {baseRgbForView} = require("../../core/model/device-profile-view");
const {decodedOf, fingerprint, summary} = require("../../core/model/portable-profile");
const {runningComboRows} = require("../../core/schema/combo-domain-v1");
const {SETTING, alwaysOnLayers} = require("../../core/schema/settings-domain-v1");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, LAYER_IDENTITY, matrixPosition} = require("../../core/data/charybdis-layout");
const keycodes = require("../../core/schema/keycodes");
const {editSettings} = require("../fixtures/profile-document");
const {decodedDeviceProfile} = require("../fixtures/device-profile");
const {DEMO_CAPABILITIES, DEMO_LIMITS, DEMO_OPTIONS} = require("../../core/session/demo-session");
const {resolve} = keycodes;

const EDITING = {busy: false, behaviors: true, pointing: true, combos: true, macros: true, settings: true, customKeys: true};

// The demo profile with its settings as `change` leaves them, as a snapshot
// and its decoded form.
/** @param {(settings: import("../../core/schema/types.js").SettingsDomain) => unknown} [change] */
function opened(change = () => {}) {
    const doc = editSettings(structuredClone(require("../../core/data/demo-profile.charybdis.json")), change);
    const snapshot = {document: doc, fingerprint: fingerprint(doc), summary: summary(doc), limits: DEMO_LIMITS, options: DEMO_OPTIONS};
    return {snapshot, decoded: decodedOf(snapshot)};
}

// What session/device-model.js hands the profile model for a draft.
/** @param {ReturnType<typeof opened>} profile @param {import("../../core/model/types.js").ProfileDestination} [capabilities] */
function presented({snapshot, decoded}, capabilities = DEMO_CAPABILITIES) {
    const {rows: comboRows, ...comboInfo} = profileComboReadback(decoded);
    return profileModel({
        layers: decoded.layers.map((values, layer) => ({layer, keys: CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column], layoutIndex) => ({row, column, layoutIndex, keycode: values[matrixPosition(layoutIndex)], resolved: keycodes.resolve(values[matrixPosition(layoutIndex)])}))})),
        domains: {rgb: decoded.rgb, keyBehaviors: decoded.behaviors, settings: decoded.settings, pdModes: decoded.pdModes},
        comboRows, comboInfo, baseEffect: baseRgbForView(undefined), ...editorViews({...snapshot, decoded}, capabilities), identity: null,
    }, capabilities, EDITING);
}

// A draft's snapshot as session/device-model.js presents it
// (buildSnapshotModel): its decode, each layer called as its summary calls it.
/** @param {any} snapshot @param {import("../../core/model/types.js").ProfileDestination} [capabilities] */
function draftModel(snapshot, capabilities = DEMO_CAPABILITIES) {
    const model = presented({snapshot, decoded: decodedOf(snapshot)}, capabilities);
    model.layers.forEach((layer, index) => {layer.displayName = snapshot.summary.names[index];});
    return model;
}

// What session/device-model.js hands the profile model for what was read of
// a keyboard piece by piece (buildDeviceModel): its layout and committed
// domains once read, the combos it reported and the editor views.
/** @param {any} [state] */
function readback(state = {}) {
    const committed = state.committed?.state === "read";
    return profileModel({
        layers: state.layout?.state === "read" ? state.layout.layers : [], domains: committed ? state.committed.domains || {} : {},
        comboRows: state.combos?.state === "read" ? state.combos.rows : [],
        comboInfo: state.combos ? {...state.combos, rows: undefined} : {state: "unread"},
        baseEffect: baseRgbForView(state.baseRgb, state.settingsView?.brightnessMax),
        settingsView: state.settingsView, macroView: state.macroView, customKeyView: state.customKeyView, identity: null,
    }, state.capabilities, EDITING);
}

/** @param {unknown[]} keys */
function layoutWith(keys) {
    return {state: "read", layers: [{layer: 0, keys}]};
}

test("a profile's combos read as the keyboard would report them, its layer records' references beside them", () => {
    const {decoded} = opened((settings) => {settings.layers[4].reference = 1; settings.values[SETTING.COMBOS_ENABLED] = 0;});
    const readback = profileComboReadback(decoded);
    assert.deepEqual(readback, {state: "read", enabled: false, layerReferences: decoded.settings.layers.map((record) => record.reference),
        version: decoded.combos.version, defaultTermMs: decoded.combos.defaultTermMs, holdTermMs: decoded.combos.holdTermMs, rows: runningComboRows(decoded.combos)});
    assert.equal(readback.layerReferences[4], 1);
});

// Combo Layer Matching has one home (combo-reach.js comboReferenceLayers):
// what the model publishes is what Review's walk matches combos on.
test("the published combo references are the ones Review's walk matches on, a drafted one included", () => {
    const profile = opened((settings) => {settings.layers[2].reference = 0; settings.layers[5].reference = 3;});
    const model = presented(profile);
    const facts = profileFacts(profile.decoded);
    assert.deepEqual(model.comboReferenceLayers, LAYER_IDENTITY.map((layer) => facts.comboLayer(layer)));
    assert.deepEqual(model.comboReferenceLayers.slice(0, 6), [0, 1, 0, 3, 4, 3]);
});

test("each published layer is always on as the profile's default layers say, and only base without a profile", () => {
    const profile = opened((settings) => {settings.values[SETTING.DEFAULT_LAYERS] = 0b1010;});
    const always = alwaysOnLayers(profile.decoded.settings.values);
    assert.deepEqual(presented(profile).layers.map((layer) => layer.alwaysOn), LAYER_IDENTITY.map((layer) => Boolean(always & (1 << layer))));
    assert.deepEqual(presented(profile).layers.filter((layer) => layer.alwaysOn).map((layer) => layer.index), [0, 1, 3]);
    const unread = profileModel({layers: [{layer: 0, keys: []}, {layer: 1, keys: []}], domains: {}, comboRows: [], comboInfo: {state: "unread"}, baseEffect: baseRgbForView(undefined), identity: null}, null, EDITING);
    assert.deepEqual(unread.layers.map((layer) => layer.alwaysOn), [true, false]);
    assert.deepEqual(unread.comboReferenceLayers, LAYER_IDENTITY, "with nothing read, each layer matches its own keys");
});

test("behaviour rows claim their keys' built-in first actions", () => {
    const rows = readback({committed: decodedDeviceProfile()}).keyBehaviors;
    const claims = rows.filter((row) => Object.keys(row.builtIn).length).map((row) => row.keycode);
    assert.ok(claims.some((keycode) => keycode.startsWith("LT(")), "the fixture's LT row inherits its tap and layer hold");
    assert.ok(["KC_1", "LGUI(KC_C)", "QK_MOUSE_BUTTON_3"].every((keycode) => claims.includes(keycode)), "plain keys tap and hold themselves");
});

test("unstored behaviour defaults share the firmware timing and built-in rules", () => {
    const values = [0x4309, 0x2109, 0x52a1, 0x52c2, 0x5281, 0x5201, 0x04, 0, 1];
    const state = {layout: layoutWith(values.map((keycode, layoutIndex) => ({keycode, layoutIndex, resolved: resolve(keycode)}))),
        settingsView: {timing: {tappingTerm: "210", tapHoldTerm: "150", longHoldTerm: "400", multiTapTerm: "170"}}};
    const model = readback(state);
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
    assert.deepEqual(defaults.KC_A.timing, {tapHoldTerm: "150", longHoldTerm: "400", multiTapTerm: "170"});
    assert.equal(defaults.KC_NO, undefined);
    assert.equal(defaults.KC_TRANSPARENT, undefined);
    assert.deepEqual(model.keyBehaviors, [], "no behaviour is authored by publishing defaults");
});

test("every custom key has built-in behaviour defaults, placed or not", () => {
    // Custom keys edits the behaviour of a key on no layer yet, so its unstored
    // grid needs the same defaults as a placed one's.
    const keys = [0, 5].map(slot => ({slot, keycode: `CUSTOM_KEY_${slot}`, code: 0x7f00 + slot, name: "", hasBehavior: false}));
    const model = readback({
        layout: layoutWith([0x7f00, 0x04].map((keycode, layoutIndex) => ({keycode, layoutIndex, resolved: resolve(keycode)}))),
        committed: decodedDeviceProfile(), capabilities: {actionAbiDigest: 0x67df11b3},
        settingsView: {timing: {tappingTerm: "210", tapHoldTerm: "150", longHoldTerm: "400", multiTapTerm: "170"}},
        customKeyView: {keys},
    });
    const defaults = model.behaviorEditing.keyDefaults;
    assert.deepEqual(defaults.CUSTOM_KEY_0.builtIn, {releaseTaps: true}, "a placed custom key");
    assert.deepEqual(defaults.CUSTOM_KEY_5, defaults.CUSTOM_KEY_0, "an unplaced one has the same defaults");
    assert.deepEqual(defaults.CUSTOM_KEY_5.timing, {tapHoldTerm: "150", longHoldTerm: "400", multiTapTerm: "170"});
    assert.ok(!model.keyBehaviors.some(row => row.keycode === "CUSTOM_KEY_5"), "publishing defaults authors no behaviour");
});

test("device shortcut labels stay complete and semantic names require the advertised ABI", () => {
    const values = [0x0806, 0x0a1d, 0x7e80, 0x7ec5, 0x7ec6, 0x7f02];
    const state = {
        layout: layoutWith(values.map((keycode, layoutIndex) => ({keycode, layoutIndex, resolved: resolve(keycode)}))),
        committed: decodedDeviceProfile(), capabilities: {actionAbiDigest: 0x67df11b3},
    };
    const model = readback(state);
    assert.deepEqual(model.layers[0].positions.map(key => key.display), ["GUI+C", "Shift+GUI+Z", "Slot 0 · hold", "Lock Layer 5", "Lock Layer 6", "Custom key 2"],
        "a layer lock and a custom key are user slots under the native ABI, named by what they are");
    assert.equal(model.layers[0].positions[5].keycode, "0x7F02", "the editable identity still encodes to the original numeric value");
    assert.doesNotMatch(readback({...state, capabilities: {}}).layers[0].positions[5].display, /Custom key/, "an unknown ABI names no custom key");
});

test("a position carries what its value means, not only what the keyboard calls it", () => {
    // A pointing mode, a macro and a behaviour target are all stored as plain
    // user keycodes, while every other domain names them semantically. The
    // position publishes both, so a lookup from a key to what it reaches has
    // something to match on and does not re-derive the mapping.
    const values = [0x7e80, 0x7700, 0x0004, 0x7f00];
    const model = readback({
        layout: layoutWith(values.map((keycode, layoutIndex) => ({keycode, layoutIndex, resolved: resolve(keycode)}))),
        committed: decodedDeviceProfile(),
        capabilities: {actionAbiDigest: 0x67df11b3},
        macroView: {macros: [{keycode: "MACRO_0", name: "Sign-off"}]},
        customKeyView: {keys: [{slot: 0, keycode: "CUSTOM_KEY_0", code: 0x7f00, name: "Right Thumb", hasBehavior: true}]},
    });
    assert.deepEqual(model.layers[0].positions.map((key) => [key.keycode, key.semantic]), [
        ["0x7E80", "PD_MODE_0"], ["QK_MACRO_0", "MACRO_0"], ["KC_A", "KC_A"], ["0x7F00", "CUSTOM_KEY_0"]]);
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
    const model = readback({
        layout: layoutWith([0x4338, 0x4109].map((keycode, layoutIndex) => ({keycode, layoutIndex, resolved: resolve(keycode)}))),
    });
    assert.deepEqual(model.layers[0].positions.map((key) => [key.keycode, key.display]),
        [["LT(3,KC_SLASH)", "/"], ["LT(1,KC_F)", "F"]]);
});

test("the keycode catalog reaches the UI in Studio's shape", () => {
    const model = readback({});
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

test("device layers become the layer model the UI keys on", () => {
    const model = readback({
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
    const model = readback({layout});
    assert.deepEqual(model.layers[2].answers, [
        [{layer: 1, active: 2, blocked: 0}, {layer: 0, active: 1, blocked: 2}],
        [{layer: 1, active: 2, blocked: 0}, {layer: 0, active: 1, blocked: 2}],
    ]);
    assert.deepEqual(model.layers[1].answers[1], [{layer: 1, active: 2, blocked: 0}]);
});

test("layer and tap-hold keys name their layer without losing the expression", () => {
    const model = readback({
        committed: {state: "read", domains: {settings: {names: ["Base", "Numbers", "Symbols"]}}},
        layout: layoutWith([
            {layoutIndex: 0, row: 0, column: 0, keycode: 0x5222, resolved: {name: "MO(2)", label: "Layer hold 2", kind: "layer", layer: 2, known: true}},
            {layoutIndex: 1, row: 0, column: 1, keycode: 0x4105, resolved: {name: "LT(1,KC_B)", label: "B / layer 1", kind: "layer-tap", tap: "KC_B", layer: 1, known: true}},
            {layoutIndex: 2, row: 0, column: 2, keycode: 0x5282, resolved: {name: "OSL(2)", label: "One-shot layer 2", kind: "layer", layer: 2, value: 0x5282, known: true}},
        ]),
    });

    const [momentary, layerTap] = model.layers[0].positions;
    assert.equal(momentary.display, "Hold Symbols", "a single-role layer key's cap reads by its whole name, the layer by name, not its number");
    assert.equal(momentary.editLabel, "Hold Symbols");
    assert.equal(momentary.keycode, "MO(2)", "the raw keycode keeps the number");
    assert.equal(layerTap.display, "B");
    assert.equal(layerTap.layerLabel, "Numbers");
    assert.equal(layerTap.editLabel, "B / Numbers");
    assert.equal(model.qmkKeyLabels["LT(1,KC_B)"], "B / Numbers", "any keycode on the board can be named by keycode");
    assert.equal(layerTap.keycode, "LT(1,KC_B)");
    assert.equal(model.layers[0].positions[2].display, "Symbols", "a dual-role layer key's cap names its layer; what it does is below the line");
});

test("an unresolved keycode is shown, not hidden", () => {
    const model = readback({
        layout: layoutWith([
            {layoutIndex: 0, row: 0, column: 0, keycode: 0xfffe, resolved: {name: "0xFFFE", label: "0xFFFE", kind: "unknown", known: false}},
        ]),
    });
    assert.equal(model.layers[0].positions[0].keycode, "0xFFFE");
    assert.equal(model.layers[0].positions[0].value, 0xfffe);
    assert.equal(model.layers[0].positions[0].display, "0xFFFE");
});

test("a behaviour on a key never renames what the vocabulary already names", () => {
    const committed = decodedDeviceProfile();
    const row = (target) => ({target, tapHoldTerm: 0, longHoldTerm: 0, multiTapTerm: 0, keepsAutoMouseAnchored: false, steps: []});
    committed.domains = {...committed.domains, keyBehaviors: {...committed.domains.keyBehaviors, rows: [
        row({kind: 2, flags: 0, operand: 1}),   // MO(1)
        row({kind: 3, flags: 0, operand: 2}),   // LOCK_LAYER(2)
        row({kind: 6, flags: 0, operand: 0}),   // MACRO_0
    ]}};
    const macroView = {macros: [{keycode: "MACRO_0", payload: ""}], hardcodedMacros: []};
    const labels = readback({committed, macroView, capabilities: {actionAbiDigest: 0x67df11b3}}).qmkKeyLabels;
    const plain = readback({macroView, capabilities: {actionAbiDigest: 0x67df11b3}}).qmkKeyLabels;
    assert.equal(labels["MO(1)"], plain["MO(1)"], "MO(1) reads as it does with no behaviour on it, not \"Mo(1)\"");
    assert.equal(labels.QK_MACRO_0, "Macro 0", "the macro screen's name");
    assert.equal(labels["0x7EC2"], "Lock Layer 2", "a bare user slot reads by what it does to which layer");
    assert.equal(labels["LOCK_LAYER(2)"], "Lock Layer 2");
});

test("effective host names reach keycaps, picker search and modifier controls without changing assignments", () => {
    const keys = [0xe2, 0xe3, 0x0804, 0x2804];
    const state = {layout: {state: "read", layers: [{layer:0, keys: keys.map((keycode, layoutIndex) => ({keycode, layoutIndex, resolved:resolve(keycode)}))}]}, settingsView: {host:{effective:1}}};
    const model = readback(state);
    assert.deepEqual(model.layers[0].positions.map(p => p.editLabel), ["Left Option", "Left Command", "Command+A", "A / Command"]);
    assert.equal(model.layers[0].positions[3].modifierLabel, "Command");
    assert.equal(model.layers[0].positions[2].modifierLabel, undefined, "a modified key's hold is not a mod-tap's");
    assert.deepEqual(model.layers[0].positions.map(p => p.value), keys);
    assert.equal(model.vocabulary.pickerModifiers.find(({value}) => value === "G").label, "Command");
    assert.equal(model.vocabulary.modifiers.find(([id]) => id === 4)[1], "Left Option");
    assert.match(model.qmkKeycodes.find(e => e.keycode === 0xe3).search, /command/);
});

test("pointing-only shortcuts enter the shared OS label table", () => {
    const model = readback({settingsView:{host:{effective:3}}, committed:{state:"read", domains:{pdModes:[
        {id:0, kind:1, directions:{up:{keycode:0x0804}}, diagonals:{upLeft:{keycode:0x0805}}}
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
    const model = draftModel(draft.current, CURRENT_CAPABILITIES);
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
    // And what each does to its layer, by QMK's function, so the interface
    // never reads it out of the name.
    assert.deepEqual(model.layers[0].positions.slice(0, 5).map(position => model.qmkKeyLayerForms[position.keycode] ?? model.qmkKeyLayerForms[position.semantic]),
        ["MO", "LT", "LOCK_LAYER", "LM", "TG"]);
    assert.deepEqual(Object.keys(model.qmkKeyLayerForms).sort(), Object.keys(model.qmkKeyLayers).sort(), "every layer key has its layer and its function");
    assert.equal(model.qmkKeyLayerForms.KC_C, undefined);
    // A single-role layer key's cap reads by its whole name; a layer-tap's by
    // its tap, its layer below the line (keyface.mjs).
    const [hold, layerTap, lock, , toggle] = model.layers[0].positions;
    assert.deepEqual([hold.display, lock.display, toggle.display], [hold.editLabel, lock.editLabel, toggle.editLabel]);
    assert.ok(/^Hold /.test(hold.display), hold.display);
    assert.equal(layerTap.display, "B");
});

test("what each keycode is that the interface treats apart is published under every name it is read by", () => {
    const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
    const {document, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
    const {fingerprint, summary} = require("../../core/model/portable-profile");
    const value = document();
    const draft = new ProfileDraftSession({document: value, fingerprint: fingerprint(value), summary: summary(value), limits: {brightnessMax: 200}}, "board", CURRENT_CAPABILITIES);
    const kinds = draftModel(draft.current, CURRENT_CAPABILITIES).qmkKeyKinds;
    // Every spelling: QMK's names and the keymap's, the profile's, and the hex
    // the keyboard names a value it has no name for by (keycodes.js).
    const read = (names) => names.map((name) => kinds[name]);
    assert.deepEqual(read(["KC_TRANSPARENT", "KC_TRNS", "_______", "0x0001"]), Array(4).fill("transparent"));
    assert.deepEqual(read(["KC_NO", "XXXXXXX", "0x0000"]), Array(3).fill("disabled"));
    assert.deepEqual(read(["MACRO_0", "QK_MACRO_0", "0x7700", "MACRO_63", "0x773F"]), Array(5).fill("macro"), "the first 32 macros QMK names, and the rest");
    assert.deepEqual(read(["CUSTOM_KEY_0", "0x7F00", "CUSTOM_KEY_127", "0x7F7F"]), Array(4).fill("customKey"));
    assert.deepEqual(read(["KC_A", "PD_MODE_0", "MO(1)", "LSFT(KC_NO)", "0x0004"]), Array(5).fill(undefined), "any other key is none of them");
    assert.deepEqual([...new Set(Object.values(kinds))].sort(), ["customKey", "disabled", "macro", "transparent"]);
});

// Combo Layer Matching, published so the interface never reads it out of a
// settings field's words: the draft's settings first, so an edit shows before
// it is applied, then the keyboard's combo readback, then each layer itself.
test("each layer's combo reference layer comes from the draft's settings, else the keyboard's readback, else itself", () => {
    const portable = require("../../core/model/portable-profile");
    const {DEMO_CAPABILITIES, DEMO_LIMITS, DEMO_OPTIONS} = require("../../core/session/demo-session");
    const {editSettings} = require("../fixtures/profile-document");
    const doc = editSettings(require("../fixtures/pd-profile").document(), (settings) => {settings.layers[2].reference = 0; settings.layers[5].reference = 3;});
    const model = draftModel({document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: DEMO_LIMITS, options: DEMO_OPTIONS},
        DEMO_CAPABILITIES);
    assert.deepEqual(model.comboReferenceLayers, Array.from({length: 16}, (_, layer) => layer === 2 ? 0 : layer === 5 ? 3 : layer));
    assert.deepEqual(readback({combos: {state: "read", rows: [], layerReferences: [0, 0, 1]}}).comboReferenceLayers.slice(0, 4), [0, 0, 1, 3],
        "without settings, the keyboard's readback, and past it each layer itself");
    assert.deepEqual(readback({}).comboReferenceLayers, Array.from({length: 16}, (_, layer) => layer));
});

test("each published layer says whether it is always on: base, and every default layer the keyboard keeps", () => {
    const portable = require("../../core/model/portable-profile");
    const {DEMO_CAPABILITIES, DEMO_LIMITS, DEMO_OPTIONS} = require("../../core/session/demo-session");
    const {editSettings} = require("../fixtures/profile-document");
    const {SETTING} = require("../../core/schema/settings-domain-v1");
    const doc = editSettings(require("../fixtures/pd-profile").document(), (settings) => {settings.values[SETTING.DEFAULT_LAYERS] = 0b100;});
    const model = draftModel({document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: DEMO_LIMITS, options: DEMO_OPTIONS},
        DEMO_CAPABILITIES);
    assert.deepEqual(model.layers.filter((layer) => layer.alwaysOn).map((layer) => layer.index), [0, 2]);
    assert.deepEqual(readback({}).layers.filter((layer) => layer.alwaysOn), [], "no layers read, none to mark");
});

// The view tests read models core publishes (tests/fixtures/published-model.js);
// what a published model carries is held here, on the demo profile.
test("the published model carries each layer's combo reach and each combo's output behaviour layers, as core works them out", () => {
    const portable = require("../../core/model/portable-profile");
    const {DEMO_CAPABILITIES, DEMO_LIMITS, DEMO_OPTIONS} = require("../../core/session/demo-session");
    const {comboReach} = require("../../core/model/combo-reach");
    const {editSettings} = require("../fixtures/profile-document");
    const {SETTING} = require("../../core/schema/settings-domain-v1");
    /** @param {any} doc */
    const modelOf = (doc) => draftModel({document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: DEMO_LIMITS, options: DEMO_OPTIONS},
        DEMO_CAPABILITIES);
    const demo = structuredClone(require("../../core/data/demo-profile.charybdis.json"));
    const model = modelOf(demo);
    assert.equal(model.comboReach.length, model.layers.length);
    assert.deepEqual(model.comboReach, comboReach(model.layers, model.combos, model.comboReferenceLayers));
    assert.ok(model.comboReach[0].some((reach) => reach.fires), "the demo's combos fire from base");
    assert.ok(model.combos.some((combo) => combo.outputBehaviorLayers), "and some run their output's behaviour");
    const defaults = modelOf(editSettings(structuredClone(demo), (settings) => { settings.values[SETTING.DEFAULT_LAYERS] = 0b11; }));
    assert.equal(defaults.layers[1].alwaysOn, true);
    assert.notDeepEqual(defaults.comboReach, model.comboReach, "a default layer changes it");
    assert.deepEqual(defaults.comboReach, comboReach(defaults.layers, defaults.combos, defaults.comboReferenceLayers), "and it is worked out again");
    const vetoed = modelOf(editSettings(structuredClone(demo), (settings) => { settings.comboOutputBehaviors = false; }));
    assert.deepEqual(vetoed.combos.map((combo) => combo.outputBehaviorLayers), vetoed.combos.map(() => 0), "Combo outputs use behaviours off runs none");
});

test("the catalog every model starts from is built once, frozen, and is what a model lays its profile's names over", () => {
    const catalog = panelCatalog();
    assert.equal(panelCatalog(), catalog, "built once");
    assert.deepEqual(Object.keys(catalog).sort(), contractUnion("panel.d.ts", "CatalogField").sort(), "the contract's catalog fields, and no others");
    for (const value of [catalog, catalog.qmkKeycodes, catalog.qmkKeycodes[0], catalog.qmkKeyLabels, catalog.qmkKeyKinds, catalog.leds]) assert.ok(Object.isFrozen(value));
    assert.equal(catalog.leds.keys.length, CHARYBDIS_4X6_LAYOUT_MATRIX.length, "an LED for each key");
    assert.deepEqual(catalog.vocabulary.editModes, VOCABULARY.editModes);
    const a = catalog.qmkKeycodes.find((entry) => entry.value === "KC_A");
    assert.deepEqual([a?.keycode, a?.label, catalog.qmkKeyLabels.KC_A], [0x04, "A", "A"]);
    assert.deepEqual([catalog.qmkKeyKinds.MACRO_0, catalog.qmkKeyKinds.CUSTOM_KEY_0], ["macro", "customKey"], "macros and custom keys by the names every profile reads them under");
    const model = presented(opened());
    assert.equal(model.leds, catalog.leds, "a model shares what it does not change");
    assert.ok(model.qmkKeycodes.length >= catalog.qmkKeycodes.length);
    const play = (/** @type {{qmkKeycodes: {key: string}[]}} */ published) => published.qmkKeycodes.find((entry) => entry.key === "KC_MEDIA_PLAY_PAUSE");
    assert.ok(play(catalog));
    assert.equal(play(model), play(catalog), "a key the profile names nothing on is the catalog's own entry");
});
