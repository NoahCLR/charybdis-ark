"use strict";
const {profileLayers} = require("../fixtures/profile-document");
const test = require("node:test"), assert = require("node:assert/strict");
const {document} = require("../fixtures/pd-profile");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {fingerprint, summary, validateSnapshot, reorderLayers} = require("../../core/model/portable-profile");
const {settingsEditorView} = require("../../core/model/settings-editor");
const {profileFindings} = require("../../core/model/profile-checks");
const {candidateMetadataForBlob, buildCandidateBeginRequest} = require("../../core/protocol/profile-candidate-v1");
const {buildSnapshotModel} = require("../../core/session/device-model");
function fixture() {
    const value = document(), snapshot = {document: value, fingerprint: fingerprint(value), summary: summary(value)};
    const caps = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 2}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: value.actionAbiDigest};
    const draft = new ProfileDraftSession(snapshot, "board", caps);
    const stage = message => draft.stage({...message, draftRevision: draft.revision});
    return {draft, stage, caps};
}
test("the six factory modes stay data, with 32 RGB rows and the remaining slots empty", () => {
    const value = validateSnapshot(document());
    assert.equal(value.document.version, 5);
    assert.deepEqual(value.pdModes.map(mode => mode.name), ["Dragscroll", "Volume", "Brightness", "Zoom", "Arrow", "Pinch", ...Array(26).fill("")]);
    assert.equal(value.rgb.formatVersion, 4); assert.equal(value.rgb.pdModeColors.length, 32);
    // Arrow keeps its masked arrows and no mouse button overrides: version 4
    // retired them (firmware D-F22).
    assert.equal(value.pdModes[4].directions.up.mask, 0x44);
    assert.ok(!("buttons" in value.pdModes[4]));
    assert.equal(value.pdModes[5].heldModifiers, 8);
    assert.deepEqual(value.settings.values.slice(10, 15), [0, 0, 0, 0, 0]);
});
test("create, bind, edit RGB and macros, reorder, review and undo share a PD draft", () => {
    const {draft, stage, caps} = fixture();
    const config = {kind: 1, name: "History", axis: 1, thresholdX: 30, directions: {left: Object.freeze({keycode: "LALT(KC_LEFT)"}), right: Object.freeze({keycode: "LALT(KC_RIGHT)"})}};
    stage({type: "savePdMode", slot: 7, config});
    assert.equal(config.directions.left.keycode, "LALT(KC_LEFT)", "shortcut resolution must not mutate the submitted form");
    const created = draft.current.fingerprint;
    assert.equal(validateSnapshot(draft.document).pdModes[7].directions.left.keycode, 0x450);
    stage({type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "PD_SLOT_7"}]});

    stage({type: "updatePdModeColor", pointingMode: "PD_MODE_SLOT_7", h: "64", s: "255", v: "100", locality: "RGB_RIGHT_HALF"});
    stage({type: "updateMacro", keycode: "MACRO_0", payload: "hello", name: "Greeting"});
    const reordered = reorderLayers(draft.document, [0, 2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    assert.deepEqual(validateSnapshot(reordered).pdModes, validateSnapshot(draft.document).pdModes);
    const view = draft.view({connected: true, selectedDeviceId: "board"});
    const slot = view.changes.find(change => change.area === "Pointing modes" && change.unit === "pd:7");
    const field = label => slot.fields.find(entry => entry.label === label)?.after;
    assert.equal(slot.status, "added"); assert.equal(slot.title, "Slot 7 · History");
    assert.equal(field("Name"), "History");
    assert.equal(field("Horizontal movement per tap"), 30);
    assert.match(field("Left"), /Inherit modifiers/);
    const model = buildSnapshotModel(draft.current, caps, {editable: true, reason: ""});
    assert.equal(model.pdModes[7].name, "History");
    assert(model.qmkKeycodes.some(key => key.value === "PD_SLOT_7" && key.keycode === 0x7e87 && key.label === "History · hold"));
    assert(model.qmkKeycodes.some(key => key.value === "PD_SLOT_7_LOCK" && key.keycode === 0x7ea7 && key.label === "History · lock"));
    assert(!model.qmkKeycodes.some(key => key.value === "SLOT_7_MODE"));
    assert(model.qmkKeycodes.some(key => key.value === "PD_SLOT_6" && key.keycode === 0x7e86 && key.label === "Slot 6 · hold (empty)"),
        "an unconfigured slot still offers its keycodes, so a button can be placed before the mode exists");
    assert(!settingsEditorView(draft.current).sections.some(section => section.fields.some(field => field.id >= 10 && field.id <= 14)));
    draft.undo(draft.revision); draft.undo(draft.revision); draft.undo(draft.revision);
    assert.equal(draft.current.fingerprint, created);
    draft.undo(draft.revision); assert.equal(draft.dirty, false);
});
test("duplicate and clear are atomic, and unsupported outputs cannot enter a draft", () => {
    const {draft, stage} = fixture();
    stage({type: "duplicatePdMode", slot: 6, source: 4});
    assert.deepEqual(validateSnapshot(draft.document).pdModes[6].directions, validateSnapshot(draft.document).pdModes[4].directions);
    const before = draft.current.fingerprint;
    assert.throws(() => stage({type: "duplicatePdMode", slot: 6, source: 5}), /empty destination/);
    assert.throws(() => stage({type: "savePdMode", slot: 7, config: {kind: 1, name: "Recursive", thresholdY: 40, directions: {up: {keycode: "PD_SLOT_6"}}}}));
    assert.equal(draft.current.fingerprint, before);
    // Clearing empties the record again; the colour the copy took stays,
    // as a cleared slot keeps its colour row.
    const colour = (id) => validateSnapshot(draft.document).rgb.pdModeColors.find(row => row.pdModeId === id);
    assert.deepEqual(colour(6).color, colour(4).color, "the copy took its source's colour");
    stage({type: "clearPdMode", slot: 6});
    assert.deepEqual(validateSnapshot(draft.document).pdModes[6], validateSnapshot(document()).pdModes[6]);
});
test("keycode-picker modifier expressions are accepted as directional actions", () => {
    const {draft, stage} = fixture();
    stage({type: "savePdMode", slot: 6, config: {kind: 1, name: "History", axis: 0, thresholdY: 40, directions: {up: {keycode: "G(KC_Z)"}, down: {keycode: "G(KC_Y)"}}}});
    const mode = validateSnapshot(draft.document).pdModes[6];
    assert.equal(mode.directions.up.keycode, 0x081d);
    assert.equal(mode.directions.down.keycode, 0x081c);
});
test("logical Apply declares schema 4.2, all seven domains and storage format six", () => {
    const value = validateSnapshot(document());
    const metadata = candidateMetadataForBlob(value.profile, {actionAbiDigest: value.document.actionAbiDigest});
    assert.equal(metadata.schemaMajor, 4); assert.equal(metadata.schemaMinor, 2); assert.equal(metadata.requestedDomains, 127); assert.equal(metadata.storeFormatVersion, 6);
    const frame = buildCandidateBeginRequest(1, metadata);
    // Profile Wire 2 implies the store format: BEGIN carries a 32-bit length.
    assert.equal(frame.readUInt32LE(8), value.profile.length); assert.equal(frame.readUInt32LE(24), 0); assert.equal(frame.readUInt32LE(28), 0);
});

test("a cleared slot keeps its bindings, because the keyboard keeps its keycodes", () => {
    // The mode keycodes are a fixed registry in the firmware, and its runtime
    // refuses to activate a slot whose record is empty rather than misbehaving
    // (`noah_active_profile_pd_for_mask` returns nothing, and both activate and lock
    // bail out on that). So clearing a slot leaves an inert button on the
    // board, not a broken profile — and the validated profile counts what still
    // reaches the empty slot so the interface can say the key does nothing.
    const {draft, stage, caps} = fixture();
    const modelNow = () => buildSnapshotModel(draft.current, caps, {editable: true, reason: ""});
    stage({type: "savePdMode", slot: 7, config: {kind: 1, name: "History", axis: 1, thresholdX: 30,
        directions: {left: {keycode: "LALT(KC_LEFT)"}, right: {keycode: "LALT(KC_RIGHT)"}}}});
    stage({type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "PD_SLOT_7"}]});

    stage({type: "clearPdMode", slot: 7});
    const cleared = validateSnapshot(draft.document);
    assert.equal(cleared.pdModes[7].kind, 0, "the slot is empty");
    assert.equal(cleared.danglingPdBindings[7], 1, "and the key that still reaches it is counted, not refused");
    assert.equal(profileLayers(cleared.document)[0][0] !== 0, true, "the button stays on the board");
    assert.equal(modelNow().qmkKeycodes.find(key => key.value === "PD_SLOT_7").label, "Slot 7 · hold (empty)",
        "and the keycode stays in the catalogue, described as empty rather than by a name that is gone");

    stage({type: "savePdMode", slot: 7, config: {kind: 1, name: "History", axis: 1, thresholdX: 30,
        directions: {left: {keycode: "LALT(KC_LEFT)"}, right: {keycode: "LALT(KC_RIGHT)"}}}});
    assert.equal(validateSnapshot(draft.document).danglingPdBindings[7], undefined,
        "configuring the slot again makes the same button live");
    assert.equal(modelNow().qmkKeycodes.find(key => key.value === "PD_SLOT_7").label, "History · hold");
});

test("a layout key the keyboard would not own is refused at the edit", () => {
    const {draft, stage} = fixture();
    const before = draft.current.fingerprint;
    assert.throws(() => stage({type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "DF(1)"}]}), /DF\(1\) is a layer keycode/);
    assert.equal(draft.current.fingerprint, before);
});

// A slot's link (firmware D-F62), staged as the How it starts card posts it.
const bit = layer => 1 << layer;
const linkOf = slot => [slot.linkedLayers, slot.linkTurnsOn, slot.linkEnds];
test("a link is staged, reviewed with its layers' names, and set, changed and cleared as one record", () => {
    const {draft, stage, caps} = fixture();
    const volume = () => validateSnapshot(draft.document).pdModes[1];
    const config = link => ({...volume(), ...link});
    stage({type: "savePdMode", slot: 1, config: config({linkedLayers: bit(3) | bit(5), linkEnds: 2})});
    assert.deepEqual(linkOf(volume()), [bit(3) | bit(5), 0, 2]);
    const fieldsOf = () => draft.view({connected: true, selectedDeviceId: "board"}).changes.find(row => row.unit === "pd:1").fields;
    const field = label => fieldsOf().find(entry => entry.label === label);
    assert.deepEqual([field("Layers that start this pointing mode").before, field("Layers that start this pointing mode").after], ["None", "Navigation, Extra 1"]);
    assert.deepEqual(field("Layers that start this pointing mode").afterMark, {kind: "layers", layers: [{layer: 3, name: "Navigation"}, {layer: 5, name: "Extra 1"}]},
        "each layer is marked, as Review marks a layer");
    assert.equal(field("Layers that start this pointing mode").beforeMark, undefined, "None carries no mark");
    assert.equal(field("Layers turned on by this pointing mode's key"), undefined, "unchanged: none, before and after");
    assert.equal(field("Ends when another layer turns on").after, "Any layer");
    stage({type: "savePdMode", slot: 1, config: config({linkTurnsOn: bit(3) | bit(6), linkEnds: 1})});
    assert.deepEqual(linkOf(volume()), [bit(3) | bit(5), bit(3) | bit(6), 1]);
    assert.deepEqual([field("Layers turned on by this pointing mode's key").before, field("Layers turned on by this pointing mode's key").after], ["None", "Navigation, Extra 2"]);
    // The model offers the layers by the mode each starts, and says which
    // layers its key turns on the pointer layer covers.
    const model = buildSnapshotModel(draft.current, caps, {editable: true, reason: ""});
    const targets = model.pdModeEditing.linkTargets;
    assert.equal(model.pdModeEditing.pointerLayer, 4);
    assert.equal(volume().pointerLayer, 0, "Volume keeps the pointer layer");
    assert.equal(model.pdModes[1].pointerCovers, bit(3), "Navigation, below Pointer; Extra 2 is above it");
    assert.deepEqual(targets[3], {layer: 3, refusal: "", inert: "", linkedBy: 1, linkedByName: "Volume"});
    assert.deepEqual(targets[6], {layer: 6, refusal: "", inert: "", linkedBy: null, linkedByName: ""}, "a layer only its key turns on starts nothing");
    assert.match(targets[4].refusal, /pointer layer/);
    stage({type: "savePdMode", slot: 1, config: config({linkedLayers: 0, linkTurnsOn: 0, linkEnds: 0})});
    assert.deepEqual(linkOf(volume()), [0, 0, 0]);
    assert.equal(draft.dirty, false, "clearing it puts the slot back as the keyboard has it");
});

test("a link the keyboard would refuse or ignore never enters the draft, and says why", () => {
    const {draft, stage} = fixture();
    const slot = id => validateSnapshot(draft.document).pdModes[id];
    const link = (id, fields) => ({type: "savePdMode", slot: id, config: {...slot(id), linkedLayers: 0, linkTurnsOn: 0, linkEnds: 0, ...fields}});
    stage(link(1, {linkedLayers: bit(3), linkTurnsOn: bit(6)}));
    const before = draft.current.fingerprint;
    assert.throws(() => stage(link(2, {linkedLayers: bit(5) | bit(3)})), /Navigation already starts Volume/);
    assert.throws(() => stage(link(2, {linkedLayers: bit(4)})), /Pointer is the pointer layer/);
    assert.throws(() => stage(link(2, {linkTurnsOn: bit(0)})), /Base is a default layer/);
    assert.throws(() => stage(link(2, {linkTurnsOn: bit(5), linkEnds: 1})), "ended, with no linked layers");
    assert.equal(draft.current.fingerprint, before);
    // Keys may share layers, and may turn on a layer that starts another mode.
    stage(link(2, {linkedLayers: bit(6), linkTurnsOn: bit(3) | bit(6)}));
    assert.deepEqual(linkOf(slot(2)), [bit(6), bit(3) | bit(6), 0]);
    // A copy of a linked mode keeps the layers its key turns on, but no layer
    // starts it: a layer starts one mode.
    stage({type: "duplicatePdMode", slot: 6, source: 1});
    assert.deepEqual([slot(6).name, ...linkOf(slot(6))], ["Volume copy", 0, bit(6), 0]);
});

test("a link moves as layer keys do, neither Settings nor a reorder leave it ignored, and an imported one is a Review warning", () => {
    const {draft, stage} = fixture();
    stage({type: "savePdMode", slot: 1, config: {...validateSnapshot(draft.document).pdModes[1], linkedLayers: bit(3) | bit(6), linkTurnsOn: bit(5)}});
    const order = [0, 3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const moved = validateSnapshot(reorderLayers(draft.document, order));
    assert.deepEqual(linkOf(moved.pdModes[1]), [bit(1) | bit(6), bit(5), 0], "Navigation, now layer 1");
    assert.equal(moved.settings.names[1], "Navigation");
    assert.deepEqual(linkOf(validateSnapshot(reorderLayers(draft.document, [0, 1, 2, 3, 4, 6, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15], undefined, {keysFollow: false})).pdModes[1]),
        [bit(3) | bit(6), bit(5), 0], "with keys keeping their numbers, so does the link, so the same keys start the mode");
    // Navigation made the base: as the key that held Navigation now holds
    // the old Base, the link moves to the old Base too, never onto the base.
    const based = validateSnapshot(reorderLayers(draft.document, [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]));
    assert.deepEqual(linkOf(based.pdModes[1]), [bit(1) | bit(6), bit(5), 0]);
    assert.equal(based.settings.names[1], "Base");
    assert.ok(!profileFindings(based).some(row => row.kind === "inertPointingLink"));
    for (const keysFollow of [true, false]) {
        const swapped = validateSnapshot(reorderLayers(draft.document, [3, 1, 2, 0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], undefined, {keysFollow}));
        assert.deepEqual(linkOf(swapped.pdModes[1]), [bit(3) | bit(6), bit(5), 0], `Make base swaps the roles, keys following or not (${keysFollow})`);
    }
    // With keys keeping their numbers, a move that would still leave the link
    // on the pointer layer, or one layer starting two modes, is refused.
    assert.throws(() => reorderLayers(draft.document, [0, 1, 2, 3, 6, 5, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15], undefined, {keysFollow: false}),
        /^Error: This move would put Volume's link on Pointer, the pointer layer, which the keyboard ignores in a link\. Turn on Keys follow their layers, or change the link first\.$/);
    stage({type: "savePdMode", slot: 2, config: {...validateSnapshot(draft.document).pdModes[2], linkedLayers: bit(1), linkTurnsOn: 0, linkEnds: 0}});
    assert.throws(() => reorderLayers(draft.document, [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], undefined, {keysFollow: false}),
        /This move would have Base start both Volume and Brightness, and a layer starts one pointing mode\./);
    assert.deepEqual(linkOf(validateSnapshot(reorderLayers(draft.document, [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])).pdModes[2]), [bit(2), 0, 0], "keys following, it moves");
    stage({type: "savePdMode", slot: 2, config: {...validateSnapshot(draft.document).pdModes[2], linkedLayers: 0}});
    assert.ok(!draft.view({connected: true, selectedDeviceId: "board"}).checks.some(check => check.kind === "inertPointingLink"));
    // Settings refuse to make a layer the link names the pointer layer or a
    // default layer, which the keyboard would ignore in it (firmware D-F62).
    /** @param {string} id @param {(field: any) => any} input */
    const save = (id, input) => {
        const section = settingsEditorView(draft.current).sections.find(entry => entry.id === id);
        stage({type: "updateConfigDefaults", sectionId: id, expectedFingerprint: draft.current.fingerprint, fields: section.fields.map(input)});
    };
    const keep = field => field.kind === "toggle" ? {macro: field.macro, enabled: field.enabled} : {macro: field.macro, value: field.value};
    const linked = draft.current.fingerprint;
    assert.throws(() => save("autoMouse", field => field.macro === "pointerLayer" ? {macro: field.macro, value: "Layer 3"} : keep(field)),
        /Navigation is in Volume's link, and the keyboard ignores the pointer layer in a link\. Take it out of Volume's link first\./);
    assert.throws(() => save("startupLayers", field => field.macro === "startupLayer5" ? {macro: field.macro, enabled: true} : keep(field)),
        /Extra 1 is in Volume's link, and the keyboard ignores a default layer in a link/);
    assert.equal(draft.current.fingerprint, linked);
    // A layer no link names may still become either.
    save("autoMouse", field => field.macro === "pointerLayer" ? {macro: field.macro, value: "Layer 7"} : keep(field));
    save("startupLayers", field => field.macro === "startupLayer2" ? {macro: field.macro, enabled: true} : keep(field));
    assert.notEqual(draft.current.fingerprint, linked);
    // A profile that arrives with a link on the pointer layer keeps it, and
    // Review says the keyboard ignores it.
    const imported = validateSnapshot(draft.document);
    imported.settings.values[5] = 3;
    const checks = profileFindings(imported).filter(row => row.kind === "inertPointingLink");
    assert.equal(checks.length, 1, "one warning, for the one layer it ignores");
    assert.equal(checks[0].level, "warning");
    assert.match(checks[0].detail, /^Navigation is the pointer layer/);
    assert.deepEqual(checks[0].place, {kind: "pointing", slot: 1});
});

test("links and auto-sniping layers survive export, import, layer rename and reorder", () => {
    const {draft, stage} = fixture();
    stage({type: "savePdMode", slot: 1, config: {...validateSnapshot(draft.document).pdModes[1], linkedLayers: bit(3) | bit(7), linkTurnsOn: bit(6), linkEnds: 1}});
    const sniping = settingsEditorView(draft.current).sections.find(entry => entry.id === "sniping");
    stage({type: "updateConfigDefaults", sectionId: "sniping", expectedFingerprint: draft.current.fingerprint,
        fields: sniping.fields.map(field => ({macro: field.macro, enabled: field.macro === "snipingOnLayer5" || field.enabled}))});
    const kept = value => {const decoded = validateSnapshot(value); return [...linkOf(decoded.pdModes[1]), decoded.settings.values[9]];};
    assert.deepEqual(kept(draft.document), [bit(3) | bit(7), bit(6), 1, bit(3) | bit(5)]);
    // A backup is the document as JSON; importing it opens it unchanged.
    const imported = fixture().draft;
    imported.replace(validateSnapshot(JSON.parse(JSON.stringify(draft.document))).document, imported.revision, "edit", "Imported profile");
    assert.deepEqual(kept(imported.document), kept(draft.document));
    // A rename keeps every layer where it is.
    const names = validateSnapshot(draft.document).settings.names.map((name, layer) => layer === 3 ? "Nav" : name);
    const renamed = reorderLayers(draft.document, Array.from({length: 16}, (_, layer) => layer), names);
    assert.equal(validateSnapshot(renamed).settings.names[3], "Nav");
    assert.deepEqual(kept(renamed), kept(draft.document));
    // A reorder moves the link and the sniping layers with their layers.
    const moved = reorderLayers(draft.document, [0, 3, 1, 2, 4, 6, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    assert.deepEqual(kept(moved), [bit(1) | bit(7), bit(5), 1, bit(1) | bit(6)]);
});

test("the model publishes the layers that start each mode and what each keycode turns on", () => {
    // The Keys workbench reads which layers reach a mode from these, never
    // from a keycode or a link itself (core/model/pointing-links.js linkStarts,
    // core/model/layer-reach.js keycodeLayersOn).
    const {draft, stage, caps} = fixture();
    stage({type: "savePdMode", slot: 7, config: {kind: 1, name: "History", axis: 1, thresholdX: 30, linkedLayers: 1 << 3, linkTurnsOn: 1 << 5, linkEnds: 1,
        directions: {left: {keycode: "KC_LEFT"}, right: {keycode: "KC_RIGHT"}}}});
    stage({type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "PD_SLOT_7"}, {layoutIndex: 1, keycode: "MO(3)"},
        {layoutIndex: 2, keycode: "LT(3,KC_B)"}, {layoutIndex: 3, keycode: "CUSTOM_KEY_2"}, {layoutIndex: 4, keycode: "KC_A"}]});
    stage({type: "updateCustomKeyShortcut", keycode: "CUSTOM_KEY_2", shortcut: {mods: 0, key: 0, layers: (1 << 3) | (1 << 6), layerKind: 1}});
    const state = {capabilities: caps, phase: "idle", committed: {state: "unavailable"}, combos: {state: "unavailable"}};
    const model = buildSnapshotModel(draft.current, caps, {editable: true, reason: ""}, state);
    const [start] = model.pdModes[7].linkStarts;
    assert.equal(model.pdModes[7].linkStarts.length, 1);
    assert.equal(start.layer, 3);
    assert.ok(start.ends & (1 << 5) && start.ends & (1 << 15), "a higher layer ends it");
    assert.equal(start.ends & 0b1111, 0, "no layer at or below it does");
    assert.deepEqual(model.pdModes[0].linkStarts, [], "an unlinked mode starts from no layer");
    assert.equal(model.qmkKeyTurnsOn["MO(3)"], 1 << 3);
    assert.equal(model.qmkKeyTurnsOn["PD_SLOT_7"], 1 << 5, "a pointing-mode key, by the name the profile gives it");
    assert.equal(model.qmkKeyTurnsOn["PD_SLOT_7_LOCK"], 1 << 5);
    assert.equal(model.qmkKeyTurnsOn["CUSTOM_KEY_2"], (1 << 3) | (1 << 6));
    assert.equal(model.qmkKeyTurnsOn["LT(3,KC_B)"], 1 << 3, "a layer-tap's hold");
    assert.equal(model.qmkKeyTurnsOn["KC_A"], undefined);
});
