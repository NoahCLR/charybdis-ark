// @ts-check
// Whether an area of the app takes an edit now, and what to say when it does
// not. Editing is only offered where the keyboard says it is possible;
// everywhere else the control stays visible and disabled, with the reason.
// Every edit goes into the draft, so whether the draft takes one is core's to
// say (`draft.editable`, D-L60): what is offered is what core accepts, and the
// demo's draft, with no keyboard, takes them too. The area's own capability
// must hold as well. Exporting only reads the keyboard.

import {demoOf} from "./demo.mjs";
import {shellOf} from "./shell-panel.mjs";
import {draftBlockWords} from "./vocabulary.mjs";

/**
 * @typedef {import("../../contracts/panel.js").PublishedModel} Model
 * @typedef {"keys" | "lighting" | "discard" | "behaviours" | "settings" | "macros" | "customKeys" | "pointing" | "combos" | "layers" | "import" | "export"} EditArea
 * @typedef {{editable: boolean, quiet: boolean, why: string}} EditGate
 */

/** @param {Model | null | undefined} model */
const portableIdle = (model) => Boolean(model?.portable?.available && !model.portable.busy);

/** @param {Model | null | undefined} model */
const draftTakesEdits = (model) => Boolean(model?.draft?.editable);
/** @param {(model: Model | null | undefined) => boolean} capability */
const draftAnd = (capability) => (/** @type {Model | null | undefined} */ model) => draftTakesEdits(model) && capability(model);

// Each area's rule: the keymap, the lighting stages and discarding a change
// need only a draft that takes edits; the others their own capability too.
/** @type {Record<EditArea, (model: Model | null | undefined) => boolean>} */
const TAKES_EDITS = {
    keys: draftTakesEdits,
    lighting: draftTakesEdits,
    discard: draftTakesEdits,
    behaviours: draftAnd((model) => Boolean(model?.behaviorEditing?.writable)),
    settings: draftAnd((model) => Boolean(model?.settingsEditing?.writable)),
    macros: draftAnd((model) => Boolean(model?.macroEditing?.writable)),
    customKeys: draftAnd((model) => Boolean(model?.customKeyEditing?.writable)),
    pointing: draftAnd((model) => Boolean(model?.pdModeEditing?.writable)),
    combos: draftAnd((model) => model?.comboReadback?.writable !== false),
    layers: draftAnd(portableIdle),
    import: draftAnd(portableIdle),
    export: portableIdle,
};

// What stands in the way of the keyboard's data, said plainly where the
// control is, whatever the area: no keyboard, firmware Ark does not support,
// nothing read, no draft, another keyboard's draft, or a stale one or one
// read over an earlier connection, both reviewed against the keyboard. ''
// for the rest (an operation running, which the commit bar says; the area's
// own capability); a screen then says its own sentence, or nothing. The
// draft's reasons are worded by draftBlockWords, as readiness says them.
// Unsupported firmware comes before what it leaves unread or unmatched: core
// reads no further and publishes its draft as unmatched (D-L64).
/** @param {Model | null | undefined} model */
function blocked(model) {
    if (!model?.device?.connected && !demoOf(model).active) return shellOf(model).blocked?.title || shellOf(model).words.noKeyboard || "";
    /** @param {import("../../contracts/panel.js").DraftBlock} reason */
    const says = (reason) => draftBlockWords(model, reason)?.sentence || "";
    if (model?.draft?.reason === "unsupported" || model?.firmware?.readable === false) return says("unsupported");
    if (!model?.layers?.length) return "Nothing has been read from the keyboard yet. Choose Read keyboard.";
    if (!model?.draft) return says("no-draft");
    if (!model.draft.matching) return says("other-keyboard");
    if (model.draft.stale || model.draft.reason === "connection-changed") return says(model.draft.stale ? "stale" : "connection-changed");
    return "";
}

/**
 * Whether `area` takes an edit now (`editable`), and whether a screen says
 * nothing of why not because the draft is busy, which the commit bar already
 * says (`quiet`). `why` is what stands in the way of the keyboard's data, in
 * words, or '' (blocked above); a screen with nothing read says it too.
 * @param {Model | null | undefined} model @param {EditArea} area @returns {EditGate}
 */
export function editGate(model, area) {
    const editable = TAKES_EDITS[area](model);
    return {editable, quiet: Boolean(model?.draft?.busy), why: blocked(model)};
}
