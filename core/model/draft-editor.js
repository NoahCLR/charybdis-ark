// @ts-check
"use strict";

// One draft edit: the document a message makes of the draft as it stands, or
// its refusal. model/draft-edits.js files each type under its editor, and on
// the profile under its domain; here each of those has its handler. A form is
// checked once against the draft it was drawn from, and a custom key made for
// a shortcut is put to use in the same step (D-L63). The session keeps the
// rest: the revision, the history and its words.

const {editProfileDomains} = require("./portable-profile");
const {draftEditEntry} = require("./draft-edits");
const {editSettings} = require("./settings-editor");
const {editMacro} = require("./macro-editor");
const {editCustomKey} = require("./custom-key-editor");
const {editKeyboardName} = require("./keyboard-name");
const {PROFILE_EDITS} = require("./device-profile-edits");
const {keyPlacementProblem} = require("./profile-placement");
const {knownActionAbi, layerOfRef} = require("../schema/actions");
const {resolveNativeQmkExpression} = require("../schema/compiled-profile-v1");
const keycodes = require("../schema/keycodes");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, LAYERS, matrixPosition} = require("../data/charybdis-layout");
/**
 * @typedef {import("./types.js").PortableDocument} Document
 * @typedef {import("./types.js").CompleteSnapshot} Snapshot
 * @typedef {import("../../contracts/edits.js").PanelEdit} PanelEdit
 * @typedef {import("../../contracts/edits.js").DraftEditType} DraftEditType
 * @typedef {import("./draft-edits.js").Editor} Editor
 * @typedef {import("./draft-edits.js").Domain} Domain
 * @typedef {Extract<PanelEdit, {type: DraftEditType}> & {expectedBase?: Partial<import("../../contracts/edits.js").BaseIdentity>}} DraftEdit
 * @typedef {{capabilities?: import("./types.js").ProfileDestination, identity?: import("../../contracts/edits.js").BaseIdentity}} Context
 * @typedef {import("./types.js").Draft} Draft
 */
// Every handler edits the document it is given, and nothing else: the draft
// carries the keyboard's facts, never a document, and its decoded form is
// read only through editProfileDomains, for that very document. So any edit
// may follow a custom key made in the same step.
/**
 * @template {DraftEditType} K
 * @typedef {(document: Document, message: Extract<PanelEdit, {type: K}>, draft: Draft) => Document} Handler
 */
/** @param {string} text @param {string} [code] */
const refuse = (text, code = "PROFILE_DRAFT_CONFLICT") => Object.assign(new Error(text), {code});

// A layout message is untrusted like any other: its layer and every key
// are checked before anything is written.
/** @type {Handler<"updateLayoutKeys">} */
function editLayout(document, {layer: reference, changes}, draft) {
    const {capabilities} = draft;
    const layer = layerOfRef(reference);
    if (layer === undefined || !(layer < LAYERS) || !Array.isArray(changes)) throw refuse("Choose a layer reported by this keyboard.");
    return editProfileDomains(document, draft, open => {
        const layers = open("keymap");
        for (const change of changes) {
            const position = Number.isInteger(change.layoutIndex) && CHARYBDIS_4X6_LAYOUT_MATRIX[change.layoutIndex];
            const code = keycodes.encode(change.keycode) ?? (knownActionAbi(capabilities?.actionAbiDigest ?? 0) ? resolveNativeQmkExpression(change.keycode, {}) : undefined);
            if (!position || code === undefined || !Number.isInteger(code)) throw refuse(`Cannot represent the key ${change.keycode} on this keyboard.`);
            const misplaced = keyPlacementProblem(code, {layerCount: capabilities?.compiledLayerCount ?? LAYERS});
            if (misplaced) throw refuse(misplaced);
            layers[layer][matrixPosition(change.layoutIndex)] = code;
        }
    });
}

// Each edit's handler, by its domain on the profile, else by its editor.
const HANDLERS = Object.freeze(/** @satisfies {{[E in Exclude<Editor, "profile">]: Handler<import("./draft-edits.js").EditedBy<E>>} & {[D in Domain]: Handler<import("./draft-edits.js").InDomain<D>>}} */ ({
    keymap: editLayout,
    settings: editSettings,
    macro: editMacro,
    customKey: editCustomKey,
    keyboardName: editKeyboardName,
    ...PROFILE_EDITS,
}));

// What a whole-document form drawn from another revision is refused with.
/** @type {Record<Exclude<Editor, "keymap" | "profile">, [string, string]>} */
const CHANGED_SINCE = {
    settings: ["The keyboard changed since these settings were opened. Read the keyboard and review your changes before saving again.", "INVALID_SETTINGS_EDIT"],
    macro: ["The keyboard changed since this macro draft was opened. Read the keyboard and review the draft before saving again.", "MACRO_EDIT_CONFLICT"],
    customKey: ["The keyboard changed since this draft was opened. Read the keyboard and review the draft before saving again.", "CUSTOM_KEY_EDIT_CONFLICT"],
    keyboardName: ["The keyboard changed since this draft was opened. Read the keyboard and review the draft before saving again.", "KEYBOARD_NAME_EDIT_CONFLICT"],
};
const IDENTITY = /** @type {const} */ (["source", "generation", "digest", "originHalf"]);

// Whether a form was drawn from this draft: a whole-document form names the
// revision by its fingerprint, a profile form the draft's identity. A form
// that names neither is taken as drawn from this revision; a layout edit is
// never checked.
/** @param {Editor} editor @param {DraftEdit} message @param {Draft} draft */
function checkDrawnFrom(editor, message, draft) {
    if (editor === "keymap") return;
    if (editor === "profile") {
        const expected = message.expectedBase;
        if (expected && IDENTITY.some(key => expected[key] !== draft.identity?.[key])) throw refuse("This form belongs to an older draft. Reload it before keeping changes.");
        return;
    }
    const expected = "expectedFingerprint" in message ? message.expectedFingerprint : undefined;
    if (expected && expected !== draft.fingerprint) throw refuse(...CHANGED_SINCE[editor]);
}

/** @param {NonNullable<ReturnType<typeof draftEditEntry>>} entry @param {DraftEdit} message @param {Draft} draft @param {Document} document */
function edit(entry, message, draft, document) {
    checkDrawnFrom(entry.editor, message, draft);
    const handler = /** @type {Handler<DraftEditType>} */ (HANDLERS["domain" in entry ? entry.domain : entry.editor]);
    return handler(document, message, draft);
}

// The document one message makes of `snapshot`, the draft as it stands, or
// the refusal. `identity` is the draft's, which a profile form names.
/** @param {Snapshot} snapshot @param {DraftEdit} message @param {Context} [context] @returns {Document} */
function applyDraftEdit(snapshot, message, {capabilities, identity} = {}) {
    const entry = draftEditEntry(message.type);
    if (!entry) throw refuse("Unsupported draft edit.");
    const {fingerprint, limits, hostOs, options, decoded} = snapshot;
    /** @type {Draft} */
    const draft = {capabilities, limits, hostOs, options, decoded, fingerprint, identity};
    const document = edit(entry, message, draft, snapshot.document);
    // A custom key made for a shortcut is put to use in the same step (a
    // layout key, a behaviour cell, a combo's output), so one undo takes both
    // back (D-L63).
    const then = entry.editor === "customKey" && "then" in message ? message.then : undefined;
    if (!then) return document;
    const follower = draftEditEntry(then.type);
    if (!follower || !("follows" in follower)) throw refuse("A custom key made for a shortcut goes on a key, in a behaviour or in a combo.");
    return edit(follower, then, draft, document);
}

module.exports = {applyDraftEdit};
