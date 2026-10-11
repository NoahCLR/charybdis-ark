// @ts-check
"use strict";

// Every edit a draft stages, by the message type the interface posts, in one
// place.
//
// Each type names the editor that makes it (the layout, a whole-document
// editor, or one domain of the profile blob, which model/device-profile-edits.js
// rewrites) and the words its history step and review group are titled with.
// The router takes a message as a draft edit only when its type is here, the
// draft sends it to the editor named here, and the profile editor sorts it by
// the domain named here, so a new edit is one line and its handler. The
// contract's EditPayloads names the same types (tests/model/draft-edits.test.js).

const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require("../data/charybdis-layout");
const keycodes = require("../data/keycode-catalog");
const {layerOfRef} = require("../schema/actions");

/**
 * @typedef {import("../../contracts/edits.js").DraftEditType} DraftEditType
 * @typedef {import("../../contracts/edits.js").PanelEdit} PanelEdit
 * @typedef {import("./types.js").PortableDocument} Document
 * @typedef {"layout" | "settings" | "macro" | "customKey" | "profile"} Editor
 * @typedef {"placement" | "pointing" | "combos" | "behaviours" | "lighting"} Domain
 */
/**
 * @template {DraftEditType} K
 * @typedef {string | ((message: import("../../contracts/edits.js").EditOf<K>, document: Document) => string)} Label
 */
/**
 * @template {DraftEditType} K
 * @typedef {{editor: Exclude<Editor, "profile">, label: Label<K>} | {editor: "profile", domain: Domain, label: Label<K>}} Entry
 */

// What one layout message did: a swap is told apart by the two keys trading
// what the layer stored, which is why the label reads the document before it.
/** @param {import("../../contracts/edits.js").EditOf<"updateLayoutKeys">} message @param {Document} document */
function layoutLabel({layer, changes}, document) {
    const [first, second] = changes;
    /** @param {{layoutIndex: number}} change */
    const stored = change => {
        const position = CHARYBDIS_4X6_LAYOUT_MATRIX[change.layoutIndex];
        return position && document.layers[/** @type {number} */ (layerOfRef(layer))]?.[position[0] * 6 + position[1]];
    };
    if (changes.length === 2 && keycodes.encode(first.keycode) === stored(second) && keycodes.encode(second.keycode) === stored(first)) return "Swapped two keys";
    return changes.length > 1 ? `Changed ${changes.length} keys at once` : "Changed a key";
}

const DRAFT_EDIT_TYPES = Object.freeze(/** @satisfies {{[K in DraftEditType]: Entry<K>}} */ ({
    updateLayoutKeys: {editor: "layout", label: layoutLabel},
    updateConfigDefaults: {editor: "settings", label: "Saved a settings section"},
    updateViaMacro: {editor: "macro", label: "Edited a macro"},
    updateCustomKey: {editor: "customKey", label: "Renamed a custom key"},
    updatePlacementPolicy: {editor: "profile", domain: "placement", label: "Edited the draft"},
    savePdMode: {editor: "profile", domain: "pointing", label: "Edited a pointing mode"},
    clearPdMode: {editor: "profile", domain: "pointing", label: "Cleared a pointing mode"},
    duplicatePdMode: {editor: "profile", domain: "pointing", label: "Duplicated a pointing mode"},
    addCombo: {editor: "profile", domain: "combos", label: "Added a combo"},
    saveCombo: {editor: "profile", domain: "combos", label: "Edited a combo"},
    deleteCombo: {editor: "profile", domain: "combos", label: "Removed a combo"},
    updateComboHoldTerm: {editor: "profile", domain: "combos", label: "Changed the combo hold threshold"},
    updateComboDefaultTerm: {editor: "profile", domain: "combos", label: "Changed the default combo window"},
    saveBehavior: {editor: "profile", domain: "behaviours", label: "Edited a behaviour"},
    addBehavior: {editor: "profile", domain: "behaviours", label: "Added a behaviour"},
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

/** @param {string} type */
const entryOf = type => DRAFT_EDITS.has(type) ? DRAFT_EDIT_TYPES[/** @type {DraftEditType} */ (type)] : undefined;

// Whether an editor makes this edit, and so which payload it carries.
/** @template {Editor} E @param {{type: string}} message @param {E} editor @returns {message is Extract<PanelEdit, {type: EditedBy<E>}>} */
const editedBy = (message, editor) => entryOf(message.type)?.editor === editor;

// Whether this edit rewrites one domain of the profile blob.
/** @template {Domain} D @param {{type: string}} message @param {D} domain @returns {message is Extract<PanelEdit, {type: InDomain<D>}>} */
const inDomain = (message, domain) => {
    const entry = entryOf(message.type);
    return entry?.editor === "profile" && entry.domain === domain;
};

// What one staged message did, in the words a group of review items is
// titled with. Only a group of two or more items shows it. `document` is the
// draft before the edit.
/** @param {PanelEdit} message @param {Document} document */
function draftEditLabel(message, document) {
    const label = entryOf(message.type)?.label;
    if (typeof label !== "function") return label || "Edited the draft";
    return /** @type {(message: PanelEdit, document: Document) => string} */ (label)(message, document);
}

module.exports = {DRAFT_EDIT_TYPES, DRAFT_EDITS, editedBy, inDomain, draftEditLabel};
