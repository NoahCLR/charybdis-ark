// @ts-check
"use strict";

// Every edit a draft stages, by the message type the interface posts, in one
// place.
//
// Each type names the editor that makes it (the layout, a whole-document
// editor, or one domain of the profile blob, which model/device-profile-edits.js
// rewrites), whether it may follow a custom key made for a shortcut in the
// same step (D-L63), and the words its history step and review group are
// titled with. The router takes a message as a draft edit only when its type
// is here, and applyDraftEdit (model/draft-editor.js) sends it to the handler
// of the domain or editor named here, so a new edit is one line and its
// handler. The
// contract's EditPayloads names the same types (tests/model/draft-edits.test.js).

const {CHARYBDIS_4X6_LAYOUT_MATRIX, matrixPosition} = require("../data/charybdis-layout");
const keycodes = require("../schema/keycodes");
const {layerOfRef} = require("../schema/actions");
const {shortcutPresent} = require("../schema/settings-domain-v1");

/**
 * @typedef {import("../../contracts/edits.js").DraftEditType} DraftEditType
 * @typedef {import("../../contracts/edits.js").PanelEdit} PanelEdit
 * @typedef {import("./types.js").PortableDocument} Document
 * @typedef {"keymap" | "settings" | "macro" | "customKey" | "keyboardName" | "profile"} Editor
 * @typedef {"placement" | "pointing" | "combos" | "behaviours" | "lighting"} Domain
 */
/**
 * @template {DraftEditType} K
 * @typedef {string | ((message: import("../../contracts/edits.js").EditOf<K>, document: Document) => string)} Label
 */
/**
 * @template {DraftEditType} K
 * @typedef {{editor: Exclude<Editor, "profile">, label: Label<K>, follows?: true} | {editor: "profile", domain: Domain, label: Label<K>, follows?: true}} Entry
 */

// What one layout message did: a swap is told apart by the two keys trading
// what the layer stored, which is why the label reads the document before it.
/** @param {import("../../contracts/edits.js").EditOf<"updateLayoutKeys">} message @param {Document} document */
function layoutLabel({layer, changes}, document) {
    const layers = require("./portable-profile").validateSnapshot(document).layers;
    const [first, second] = changes;
    /** @param {{layoutIndex: number}} change */
    const stored = change => {
        const position = CHARYBDIS_4X6_LAYOUT_MATRIX[change.layoutIndex];
        return position && layers[/** @type {number} */ (layerOfRef(layer))]?.[matrixPosition(change.layoutIndex)];
    };
    if (changes.length === 2 && keycodes.encode(first.keycode) === stored(second) && keycodes.encode(second.keycode) === stored(first)) return "Swapped two keys";
    return changes.length > 1 ? `Changed ${changes.length} keys at once` : "Changed a key";
}

// A behaviour saved for a key that had none is added, not edited.
/** @param {import("../../contracts/edits.js").EditOf<"saveBehavior">} message @param {Document} document */
function behaviorLabel({behavior}, document) {
    const rows = require("./portable-profile").validateSnapshot(document).behaviors.rows;
    return require("./key-behavior-edits").hasBehaviorFor(rows, behavior.keycode) ? "Edited a behaviour" : "Added a behaviour";
}

const DRAFT_EDIT_TYPES = Object.freeze(/** @satisfies {{[K in DraftEditType]: Entry<K>}} */ ({
    updateLayoutKeys: {editor: "keymap", label: layoutLabel, follows: true},
    updateConfigDefaults: {editor: "settings", label: "Saved a settings section"},
    updateMacro: {editor: "macro", label: "Edited a macro"},
    updateCustomKey: {editor: "customKey", label: "Renamed a custom key"},
    updateCustomKeyShortcut: {editor: "customKey", label: message => message.then || message.name !== undefined ? "Made a custom key for a shortcut"
        : shortcutPresent(message.shortcut) ? "Changed a custom key's shortcut" : "Cleared a custom key's shortcut"},
    renameKeyboard: {editor: "keyboardName", label: "Renamed the keyboard"},
    updatePlacementPolicy: {editor: "profile", domain: "placement", label: "Edited the draft"},
    savePdMode: {editor: "profile", domain: "pointing", label: "Edited a pointing mode"},
    clearPdMode: {editor: "profile", domain: "pointing", label: "Cleared a pointing mode"},
    duplicatePdMode: {editor: "profile", domain: "pointing", label: "Duplicated a pointing mode"},
    addCombo: {editor: "profile", domain: "combos", label: "Added a combo", follows: true},
    saveCombo: {editor: "profile", domain: "combos", label: "Edited a combo", follows: true},
    deleteCombo: {editor: "profile", domain: "combos", label: "Removed a combo"},
    updateComboHoldTerm: {editor: "profile", domain: "combos", label: "Changed the combo hold threshold"},
    updateComboDefaultWindow: {editor: "profile", domain: "combos", label: "Changed the default combo window"},
    saveBehavior: {editor: "profile", domain: "behaviours", label: behaviorLabel, follows: true},
    deleteBehavior: {editor: "profile", domain: "behaviours", label: "Removed a behaviour"},
    retargetBehavior: {editor: "profile", domain: "behaviours", label: message => message.conflict === "swap" ? "Swapped two behaviours" : "Moved a behaviour"},
    updateLayerColor: {editor: "profile", domain: "lighting", label: "Edited lighting"},
    updatePdModeColor: {editor: "profile", domain: "lighting", label: "Edited lighting"},
    updateAutomouseFade: {editor: "profile", domain: "lighting", label: "Edited lighting"},
    updateComboFeedback: {editor: "profile", domain: "lighting", label: "Edited lighting"},
    updateKeyBehaviorFeedback: {editor: "profile", domain: "lighting", label: "Edited lighting"},
    updateRgbStages: {editor: "profile", domain: "lighting", label: "Edited lighting"},
    saveRgbReusableLedGroup: {editor: "profile", domain: "lighting", label: "Edited lighting"},
    deleteRgbReusableLedGroup: {editor: "profile", domain: "lighting", label: "Edited lighting"},
    addRgbLedGroup: {editor: "profile", domain: "lighting", label: "Edited lighting"},
    deleteRgbLedGroup: {editor: "profile", domain: "lighting", label: "Edited lighting"},
}));
/** @typedef {typeof DRAFT_EDIT_TYPES} Registry */
/** @template {Editor} E @typedef {{[K in DraftEditType]: Registry[K]["editor"] extends E ? K : never}[DraftEditType]} EditedBy */
/** @template {Domain} D @typedef {{[K in DraftEditType]: Registry[K] extends {domain: D} ? K : never}[DraftEditType]} InDomain */

// The router's test for a draft edit. A set, so a name every object has
// (`constructor`) is never mistaken for one.
const DRAFT_EDITS = new Set(Object.keys(DRAFT_EDIT_TYPES));

// A registered edit's entry, or undefined for any other type.
/** @param {string} type */
const draftEditEntry = type => DRAFT_EDITS.has(type) ? DRAFT_EDIT_TYPES[/** @type {DraftEditType} */ (type)] : undefined;

// What one staged message did, in the words a group of review items is
// titled with. Only a group of two or more items shows it. `document` is the
// draft before the edit.
/** @param {PanelEdit} message @param {Document} document */
function draftEditLabel(message, document) {
    const label = draftEditEntry(message.type)?.label;
    if (typeof label !== "function") return label || "Edited the draft";
    return /** @type {(message: PanelEdit, document: Document) => string} */ (label)(message, document);
}

module.exports = {DRAFT_EDIT_TYPES, DRAFT_EDITS, draftEditEntry, draftEditLabel};
