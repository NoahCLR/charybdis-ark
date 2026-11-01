"use strict";
// A draft of the PD profile (./pd-profile) with one edit in every area the
// review describes: keys, a key's participation, a layer's name, macros (steps
// and name), the key timing settings section, a behaviour, a combo
// and the combo timing, a custom key, the keyboard's name, a pointing slot and
// the lighting records.
const {fingerprint, reorderLayers, summary, validateSnapshot} = require("../../core/model/portable-profile");
const {settingsEditorView} = require("../../core/model/settings-editor");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {LAYER_IDENTITY} = require("../../core/data/charybdis-layout");
const {RGB_LOCALITIES, RGB_TAP_COMMIT_MODES} = require("../../core/schema/rgb-domain-v1");
const {document: pdDocument} = require("./pd-profile");

const capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 3}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x67df11b3};
/** @param {import("../../core/model/types.js").PortableDocument} document */
const snapshotOf = (document) => ({document, fingerprint: fingerprint(document), summary: summary(document), limits: {brightnessMax: 200}});

function editedDraft() {
    const draft = new ProfileDraftSession(snapshotOf(pdDocument()), "board", capabilities);
    /** @param {import("../../contracts/edits.js").PanelEdit} message */
    const stage = (message) => draft.stage(/** @type {import("../../core/session/types.js").DraftEdit} */ ({...message, draftRevision: draft.revision}));
    /** @param {string} id @param {Record<string, string | boolean>} updates @returns {import("../../contracts/edits.js").PanelEdit} */
    const settings = (id, updates) => {
        const section = /** @type {NonNullable<ReturnType<typeof settingsEditorView>>} */ (settingsEditorView(draft.current)).sections.find((row) => row.id === id);
        if (!section) throw new Error(`no settings section ${id}`);
        return {type: "updateConfigDefaults", sectionId: id, expectedFingerprint: draft.current.fingerprint,
            fields: section.fields.map((field) => field.kind === "toggle" ? {macro: field.macro, enabled: Boolean(updates[field.macro] ?? field.enabled)} : {macro: field.macro, value: updates[field.macro] ?? field.value})};
    };
    stage({type: "updateLayoutKeys", layer: "Layer 1", changes: [{layoutIndex: 3, keycode: "KC_B"}, {layoutIndex: 4, keycode: "KC_C"}]});
    stage({type: "updatePlacementPolicy", layer: 1, layoutIndex: 5, useBehavior: false, joinCombos: false});
    stage({type: "updateMacro", keycode: "MACRO_2", payload: "hello"});
    stage({type: "updateMacro", keycode: "MACRO_5", name: "Greeting", expectedFingerprint: draft.current.fingerprint});
    stage(settings("keyTiming", {tapHoldTerm: "175", multiTapTerm: "190"}));
    stage({type: "retargetBehavior", keycode: "KC_ESCAPE", target: "KC_Q", expectedBase: draft.identity()});
    stage({type: "addCombo", inputs: ["KC_A", "KC_B"], output: "KC_C", termMs: "50", holdTermMs: "200"});
    stage({type: "updateComboDefaultWindow", defaultTermMs: "70"});
    stage({type: "updateCustomKey", keycode: "CUSTOM_KEY_3", name: "Thumb", expectedFingerprint: draft.current.fingerprint});
    stage({type: "renameKeyboard", name: "Desk", expectedFingerprint: draft.current.fingerprint});
    stage({type: "updateLayerColor", layer: "Layer 2", mode: "ALL_KEYS", h: 20, s: 200, v: 100});
    stage({type: "updatePdModeColor", pointingMode: "POINTING_MODE_VOLUME", h: 64, s: 255, v: 100, locality: "RGB_RIGHT_HALF"});
    stage({type: "updateComboFeedback", h: 90, s: 255, v: 120, locality: "RGB_RIGHT_HALF"});
    stage({type: "updateAutomouseFade", mode: "END_COLOR_ON_ALL_KEYS", h: 10, s: 20, v: 30});
    const feedback = validateSnapshot(draft.document).rgb.keyFeedback;
    /** @param {Record<string, number>} names @param {number} value */
    const named = (names, value) => Object.keys(names).find((name) => names[name] === value);
    stage({type: "updateKeyBehaviorFeedback", config: {...feedback, holdActiveColor: {h: 5, s: 6, v: 7},
        tapCommitMode: named(RGB_TAP_COMMIT_MODES, feedback.tapCommitMode), locality: named(RGB_LOCALITIES, feedback.locality)}});
    stage({type: "updateRgbStages", stageEnableMask: validateSnapshot(draft.document).rgb.stageEnableMask ^ 1});
    stage({type: "addRgbLedGroup", group: {target: "layer", owner: "Layer 3", ledIndices: [1, 2, 3], h: 0, s: 0, v: 0}});
    const slot = validateSnapshot(draft.document).pdModes[1];
    stage({type: "savePdMode", slot: 1, expectedBase: draft.identity(), config: {...slot, name: "Loudness", thresholdY: 90,
        directions: Object.fromEntries(Object.entries(slot.directions).map(([name, tap]) => [name, {...tap, keycode: String(tap.keycode)}])),
        diagonals: Object.fromEntries(Object.entries(slot.diagonals || {}).map(([name, tap]) => [name, {...tap, keycode: String(tap.keycode)}]))}});
    // A rename through Rename & Reorder, with the layers left in place.
    const names = [...draft.current.decoded.settings.names];
    names[4] = "Renamed";
    draft.editLayers(reorderLayers(draft.document, [...LAYER_IDENTITY], names), draft.revision, LAYER_IDENTITY);
    return draft;
}

module.exports = {capabilities, editedDraft, snapshotOf};
