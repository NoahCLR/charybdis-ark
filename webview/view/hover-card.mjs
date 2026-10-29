// @ts-check
// What the hover card says of one key (webview/ui/hover-card.mjs draws it):
// what it reaches, and of its behaviour row whether the row runs here,
// changes nothing or has no branches, and, on a dual-role key, the threshold
// its tap / hold waits and what its hold does.

import {behaviourFor, dualRole, keyMeaning} from "./keyface.mjs";
import {behaviourRuns} from "./participation.mjs";
import {behaviourEditorRow, behaviourHasTiming, behaviourThresholds} from "./behavior-editor.mjs";
import {comboBehaviours} from "./combo-reach.mjs";
import {customKeyOf, customKeyShortcutOnly, hasShortcut} from "./custom-key.mjs";
import {macroNamesOf} from "./reach.mjs";
import {pointingSlotFor} from "./pointing-reach.mjs";
import {pdColourRow} from "./lighting.mjs";
import {vocabulary, word} from "./vocabulary.mjs";

/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 * @typedef {{kind: "tapHold", term: {ms: string}, holdAction: string, note: string} | {kind: "off"} | {kind: "inert"} | null} BehaviourLead
 * @typedef {import("../../contracts/panel.js").ComboView} ComboView
 */

// Everything one stored key reaches, each part present only when the card
// shows its section: its behaviour row (keyBehaviour); the custom key it is,
// and that key again as `shortcut` when its shortcut section shows; each
// macro it plays, with the slot the keyboard reported, if any; the pointing
// mode it runs, by the slot, the words for its kind and where its colour
// paints; and `combos`, those `view` marks at this position unless the
// caller passes the ones it badges, each with whether it fires from this key
// in `view` (the layer shown and those previewed under it), whether it runs
// its output's behaviour, and the shortcut a custom key it sends sends
// instead. `layer` supplies the key; `index` is where it sits, -1 for none.
/** @param {import("./keyface-types.js").LayerView} view @param {import("../../contracts/panel.js").Layer} layer @param {import("../../contracts/panel.js").Position} position @param {number} index @param {ComboView[]} [combos] */
export function keyReach(view, layer, position, index, combos = view.combos.shownAt(index)) {
    const model = /** @type {Model} */ (view.model ?? null);
    const meaning = keyMeaning(position);
    const custom = customKeyOf(model, meaning);
    const slot = pointingSlotFor(model, meaning);
    const words = vocabulary(model);
    const shown = combos.map((combo) => ({combo, use: view.combos.useAt(index, combo)}));
    const running = new Set(comboBehaviours(model, shown.filter(({use}) => use.fires).map(({combo}) => combo), layer?.index ?? 0).flatMap((run) => run.badges));
    return {
        ...keyBehaviour(model, layer, position),
        custom,
        shortcut: custom && hasShortcut(custom) ? custom : null,
        macros: macroNamesOf(model)(meaning).map((keycode) => ({keycode, slot: (model?.macros || []).find((row) => row.keycode === keycode)})),
        pointing: slot ? {slot, kind: slot.kind ? word(words.pointing.kinds, slot.kind).toLowerCase() : "",
            paints: slot.kind ? paintsWhere(model, slot.id) : ""} : null,
        combos: shown.map(({combo, use}) => {
            const runs = running.has(combo.badge), sent = use.fires && !runs ? customKeyOf(model, combo.output) : undefined;
            return {combo, use, runs, sendsInstead: sent ? customKeyShortcutOnly(sent) : ""};
        }),
    };
}

// Where a pointing mode's colour paints, in the vocabulary's words, read
// inside a sentence.
/** @param {Model} model @param {number} slot */
const paintsWhere = (model, slot) => {
    const locality = pdColourRow(model, slot)?.locality;
    return locality ? word(vocabulary(model).localities, locality).toLowerCase() : "its locality";
};

// `layer` supplies the key, so its switches decide whether the row runs. The
// keyboard decides every key's tap or hold, with or without a row (firmware
// D-F27), so the card says only whether this key's row runs here, and why
// not (`use`). The lead section is a dual-role key's tap / hold, a row a
// switch keeps off, or a row that changes nothing (firmware D-F27 "Rows
// without steps"; the core judges it); `branches` whether the row's own
// section follows, which a dual-role key's row with no branches, or a row
// that changes nothing on any other key, leaves out.
/** @param {Model} model @param {import("../../contracts/panel.js").Layer | null | undefined} layer @param {import("../../contracts/panel.js").Position} position */
export function keyBehaviour(model, layer, position) {
    const behaviour = behaviourFor(model, keyMeaning(position));
    const role = dualRole(model, position);
    const inert = Boolean(behaviour?.changesNothing);
    const branchless = Boolean(behaviour) && !behaviour?.steps?.length;
    const use = "row" in position
        ? behaviourRuns(model, layer?.index ?? 0, /** @type {{layoutIndex?: number}} */ (/** @type {unknown} */ (position)), behaviour)
        : {runs: Boolean(behaviour), reasons: []};
    const runs = use.runs;
    // A row that changes nothing says so, and why, in place of its details.
    const inertNote = behaviour && inert ? `Its behaviour changes nothing: ${behaviourHasTiming(behaviour)
        ? "on this key a timing does nothing without a branch" : "it has no branches or timing of its own"}, so the key runs as if it had none.` : "";
    /** @type {BehaviourLead} */
    const lead = role ? tapHold(model, position, role, behaviour, use, inertNote) : behaviour && !runs ? {kind: "off"} : inert ? {kind: "inert"} : null;
    return {behaviour, role, use, inertNote, lead, branches: Boolean(behaviour && runs && !(role && branchless) && !(inert && !role))};
}

// A dual-role key's tap / hold. A row that does not run is ignored, its own
// threshold with it: the key waits its default, the dual-role threshold. A
// layer-tap's hold reads as the grid's built-in Hold does: the layer action
// the core says it holds (`holdAction`), else the layer or modifier itself.
/** @param {Model} model @param {import("../../contracts/panel.js").Position} position @param {NonNullable<ReturnType<typeof dualRole>>} role @param {ReturnType<typeof behaviourFor>} behaviour @param {{runs: boolean, reasons: string[]}} use @param {string} inertNote @returns {BehaviourLead} */
function tapHold(model, position, role, behaviour, use, inertNote) {
    const row = behaviourEditorRow(model, keyMeaning(position));
    const fallback = row?.timingDefaults?.tapHoldTerm ?? model?.behaviorTimingDefaults?.tappingTerm;
    const term = use.runs && behaviour ? behaviourThresholds(model, behaviour).tapHoldTerm : {ms: fallback === undefined ? "" : String(fallback)};
    const holdAction = "layer" in role.hold && row?.builtIn?.hold ? row.builtIn.hold.action : "";
    const note = behaviour && !use.runs ? `Its behaviour is not used: ${use.reasons.join("; ")}. The key keeps this tap and hold.` : inertNote;
    return {kind: "tapHold", term, holdAction, note};
}
