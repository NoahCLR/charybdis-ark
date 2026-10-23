// @ts-check
// Every edit the interface posts, built from plain values.
//
// The screens gather what the person chose and call these; the core stages
// what they return against the draft. Keeping the builders pure is what lets
// tests/view/edits.test.mjs stage the exact messages the screens send, so a change
// of shape fails there rather than on a keyboard.

import {hsv} from "../lib/colour.mjs";
import {behaviourChangesNothing} from "./behavior-editor.mjs";

/**
 * @typedef {import("../../contracts/edits.js").BaseIdentity} BaseIdentity
 * @typedef {import("../../contracts/edits.js").Scalar} Scalar
 * @typedef {import("../../contracts/edits.js").Tier} Tier
 * @typedef {import("../../contracts/edits.js").BranchHelper} BranchHelper
 * @typedef {import("../../contracts/edits.js").Behavior} Behavior
 * @typedef {import("../../contracts/edits.js").BehaviorStep} BehaviorStep
 * @typedef {import("../../contracts/edits.js").BehaviorBranch} BehaviorBranch
 * @typedef {import("../../contracts/edits.js").Colour | null | undefined} Colour
 * @typedef {{macro: string, kind: string, value?: Scalar, enabled?: boolean}} SettingField
 * @typedef {{id: string, fields: SettingField[]}} SettingSection
 * @typedef {{comboReadback?: {holdTermMs?: Scalar, defaultTermMs?: Scalar}, behaviorTimingDefaults?: {tappingTerm?: Scalar}}} ComboTimings
 */

// An `identity` is the model's profileIdentity as published: partial, or null
// before a read. It goes out as the edit's expectedBase, null as absent, and
// the draft compares every field, so an incomplete one is refused, not trusted.

// A dropped file opens the same import review as the shell's file chooser.
/** @param {string} text @param {string} name @returns {import("../../contracts/edits.js").EditOf<'reviewPortableProfile'>} */
export const reviewPortableProfile = (text, name) => ({type: "reviewPortableProfile", text, name});

// ── layout keys ─────────────────────────────────────────────────────────

/** @param {import("../../contracts/edits.js").LayerReference} layer @param {{layoutIndex: number, keycode: string}[]} changes @returns {import("../../contracts/edits.js").EditOf<'updateLayoutKeys'>} */
export const layoutKeys = (layer, changes) => ({type: "updateLayoutKeys", layer, changes});
/** @param {import("../../contracts/edits.js").LayerReference} layer @param {number} layoutIndex @param {string} keycode */
export const setKey = (layer, layoutIndex, keycode) => layoutKeys(layer, [{layoutIndex, keycode}]);
// Delete and Backspace leave a key transparent, so the layer below answers.
/** @param {import("../../contracts/edits.js").LayerReference} layer @param {number} layoutIndex */
export const clearKey = (layer, layoutIndex) => setKey(layer, layoutIndex, "KC_TRANSPARENT");
/** @param {number} layer @param {number} layoutIndex @param {boolean} useBehavior @param {boolean} joinCombos @returns {import("../../contracts/edits.js").EditOf<'updatePlacementPolicy'>} */
export const placementPolicy = (layer, layoutIndex, useBehavior, joinCombos) => ({type: "updatePlacementPolicy", layer, layoutIndex, useBehavior, joinCombos});
// A swap is one message, so one undo takes both keys back.
/** @param {import("../../contracts/edits.js").LayerReference} layer @param {{layoutIndex: number, keycode: string}} from @param {{layoutIndex: number, keycode: string}} to */
export const swapKeys = (layer, from, to) => layoutKeys(layer, [
    {layoutIndex: from.layoutIndex, keycode: to.keycode},
    {layoutIndex: to.layoutIndex, keycode: from.keycode},
]);

// ── key behaviours ──────────────────────────────────────────────────────

/** @type {Record<Tier, 'tap' | 'hold' | 'longHold'>} */
export const TIER_FIELDS = {tap: "tap", hold: "hold", long: "longHold"};
export const DEFAULT_REPEAT_HZ = "20";

/** @param {string} keycode @param {Partial<BaseIdentity> | null} [identity] @returns {import("../../contracts/edits.js").EditOf<'deleteBehavior'>} */
export const deleteBehaviour = (keycode, identity) => ({type: "deleteBehavior", keycode, expectedBase: identity ?? undefined});
/** @param {string} keycode @param {string} target @param {Partial<BaseIdentity> | null} [identity] @param {'swap' | 'overwrite'} [conflict] @returns {import("../../contracts/edits.js").EditOf<'retargetBehavior'>} */
export const retargetBehaviour = (keycode, target, identity, conflict) =>
    ({type: "retargetBehavior", keycode, target, expectedBase: identity ?? undefined, ...(conflict ? {conflict} : {})});

// One cell of the grid as the editor holds it. A tap tier has no helper; the
// repeat rate only means something for "repeat while held", where it must be
// 1–100 Hz, so an empty field posts the default rather than 0.
/** @param {Tier} kind @param {{action?: Scalar, helper?: BranchHelper, repeatHz?: Scalar}} fields @returns {BehaviorBranch | null} */
export function cellBranch(kind, {action, helper, repeatHz}) {
    const sends = String(action ?? "").trim();
    if (!sends) return null;
    if (kind === "tap") return {helper: "TAP_SENDS", action: sends};
    return {helper, action: sends, repeatHz: helper === "REPEAT_WHILE_HELD" ? String(repeatHz ?? "").trim() || DEFAULT_REPEAT_HZ : "0"};
}

// What one edit in the cell editor does. A cell that sends nothing has nothing
// the keyboard can store, so choosing how it runs before what it sends is held
// by the editor rather than posted; the choice then goes out with the first
// action. A cell that already holds a branch posts every edit, and emptying it
// removes the tier.
/** @param {Tier} kind @param {{stored?: boolean, action?: Scalar, helper?: BranchHelper, repeatHz?: Scalar}} fields */
export function cellEdit(kind, {stored, action, helper, repeatHz}) {
    const branch = cellBranch(kind, {action, helper, repeatHz});
    if (branch || stored) return {branch};
    return {pending: kind === "tap" ? null : {helper, repeatHz}};
}

// One behaviour row, posted whole: the form is the row. `terms` are the
// timing fields as typed (empty means the keyboard default, stored as 0),
// `change` replaces one cell, and every other cell is carried as read. A row
// that would change nothing is not kept: a key without a row gets none, and a
// stored row is removed rather than saved, so Undo and Review show the removal.
/** @param {Behavior} behaviour @param {{terms?: Partial<Record<'tapHoldTerm' | 'longerHoldTerm' | 'multiTapTerm', Scalar>>, anchored?: boolean, enabled?: boolean, allowedLayers?: number, change?: {tapCount: number, kind: Tier, branch: BehaviorBranch | null}}} [fields] @param {Partial<BaseIdentity> | null} [identity] @returns {import("../../contracts/edits.js").EditOf<'saveBehavior'> | import("../../contracts/edits.js").EditOf<'deleteBehavior'> | null} */
export function saveBehaviour(behaviour, {terms = {}, anchored, enabled, allowedLayers, change} = {}, identity) {
    /** @param {'tapHoldTerm' | 'longerHoldTerm' | 'multiTapTerm'} name */
    const term = (name) => terms[name] === undefined ? String(behaviour[name] ?? "0") : String(terms[name]).trim() || "0";
    const sourceSteps = new Map((behaviour.steps || []).map((step) => [step.tapCount, step]));
    if (change && !sourceSteps.has(change.tapCount)) sourceSteps.set(change.tapCount, {tapCount: change.tapCount});
    const steps = [...sourceSteps.values()].sort((left, right) => left.tapCount - right.tapCount).map((step) => {
        /** @type {BehaviorStep} */
        const next = {tapCount: step.tapCount};
        for (const [kind, field] of Object.entries(TIER_FIELDS)) {
            const branch = change && change.tapCount === step.tapCount && change.kind === kind ? change.branch : step[field];
            if (!branch) continue;
            next[field] = kind === "tap"
                ? {helper: "TAP_SENDS", action: branch.action}
                : {helper: branch.helper, action: branch.action, repeatHz: branch.repeatHz || "0"};
        }
        return next;
    }).filter((step) => step.tap || step.hold || step.longHold);
    const behavior = {
        keycode: behaviour.keycode,
        tapHoldTerm: term("tapHoldTerm"),
        longerHoldTerm: term("longerHoldTerm"),
        multiTapTerm: term("multiTapTerm"),
        keepsAutoMouseAnchored: anchored ?? behaviour.keepsAutoMouseAnchored,
        enabled: enabled ?? behaviour.enabled ?? true,
        allowedLayers: allowedLayers ?? behaviour.allowedLayers ?? 0xffff,
        steps,
    };
    if (behaviourChangesNothing({...behavior, timingAlone: behaviour.timingAlone})) return behaviour.stored ? deleteBehaviour(behaviour.keycode, identity) : null;
    return {
        type: "saveBehavior",
        expectedBase: identity ?? undefined,
        behavior,
    };
}

// ── combos ──────────────────────────────────────────────────────────────

// A combo follows the default window unless it has its own: followsDefault,
// or an empty window, says it follows.
/** @param {number | null | undefined} id @param {import("../../contracts/edits.js").Combo} combo @returns {import("../../contracts/edits.js").EditOf<'addCombo'> | import("../../contracts/edits.js").EditOf<'saveCombo'>} */
export function comboMessage(id, {output, inputs, termMs, followsDefault, holdTermMs, mustHold, mustTap, ordered, enabled, allowedLayers, useOutputBehavior}) {
    /** @type {import("../../contracts/edits.js").Combo} */
    const payload = {output: String(output ?? "").trim(), inputs, termMs, followsDefault: Boolean(followsDefault), holdTermMs, mustHold: Boolean(mustHold), mustTap: Boolean(mustTap), ordered: Boolean(ordered)};
    if (enabled !== undefined) payload.enabled = enabled;
    if (allowedLayers !== undefined) payload.allowedLayers = allowedLayers;
    if (useOutputBehavior !== undefined) payload.useOutputBehavior = useOutputBehavior;
    return id === null || id === undefined ? {type: "addCombo", ...payload} : {type: "saveCombo", id, ...payload};
}
// A combo kept with the custom key its output picker offered: the key is made
// only now, with the combo in one draft step, so one undo takes both back and a
// combo never kept leaves no key behind (D-L63). Once the output is something
// else, the offered key is not made.
/** @param {ReturnType<typeof comboMessage>} combo @param {{keycode: string, shortcut: {mods: number, key: number}, name: string} | null | undefined} made @param {string} [identity] */
export const comboKept = (combo, made, identity) => made && combo.output === made.keycode
    ? customKeyForShortcut(made.keycode, made.shortcut, made.name, combo, identity) : combo;
/** @param {number} id @returns {import("../../contracts/edits.js").EditOf<'deleteCombo'>} */
export const deleteCombo = (id) => ({type: "deleteCombo", id});
/** @param {Scalar} holdTermMs @param {Partial<BaseIdentity> | null} [identity] @returns {import("../../contracts/edits.js").EditOf<'updateComboHoldTerm'>} */
export const comboHoldTerm = (holdTermMs, identity) => ({type: "updateComboHoldTerm", holdTermMs, expectedBase: identity ?? undefined});
/** @param {Scalar} defaultTermMs @param {Partial<BaseIdentity> | null} [identity] @returns {import("../../contracts/edits.js").EditOf<'updateComboDefaultWindow'>} */
export const comboDefaultWindow = (defaultTermMs, identity) => ({type: "updateComboDefaultWindow", defaultTermMs, expectedBase: identity ?? undefined});
// QMK keeps one hold threshold for every combo. A keyboard that stores it
// once always has one; an older one stores it on each combo, so a first combo
// there starts from the keyboard's tapping term, which is QMK's own default
// for COMBO_HOLD_TERM and the value that firmware runs while it has none.
/** @param {ComboTimings | null | undefined} model @param {Scalar | null | undefined} written */
export const comboHoldTermValue = (model, written) => String(String(written ?? "").trim() || (model?.comboReadback?.holdTermMs
    ?? model?.behaviorTimingDefaults?.tappingTerm ?? "")).trim();
// The window a new combo, or one that follows the default, runs with; empty
// on a keyboard that has no default.
/** @param {ComboTimings | null | undefined} model */
export const comboDefaultWindowValue = (model) => String(model?.comboReadback?.defaultTermMs ?? "");

// ── lighting ────────────────────────────────────────────────────────────

/** @param {Colour} colour */
export const hsvPayload = (colour) => {
    const [h, s, v] = hsv(colour);
    return {h, s, v};
};
/** @param {number} mask @param {number} bit @param {boolean} on @returns {import("../../contracts/edits.js").EditOf<'updateRgbStages'>} */
export const rgbStages = (mask, bit, on) => ({type: "updateRgbStages", stageEnableMask: on ? mask | bit : mask & ~bit});
/** @param {import("../../contracts/edits.js").LayerReference} layer @param {string} mode @param {Colour} colour @returns {import("../../contracts/edits.js").EditOf<'updateLayerColor'>} */
export const layerColour = (layer, mode, colour) => ({type: "updateLayerColor", layer, mode, ...hsvPayload(colour)});
/** @param {string} mode @param {Colour} colour @returns {import("../../contracts/edits.js").EditOf<'updateAutomouseFade'>} */
export const automouseFade = (mode, colour) => ({type: "updateAutomouseFade", mode, ...hsvPayload(colour)});
/** @param {string} pointingMode @param {string} locality @param {Colour} colour @returns {import("../../contracts/edits.js").EditOf<'updatePdModeColor'>} */
export const pdModeColour = (pointingMode, locality, colour) => ({type: "updatePdModeColor", pointingMode, locality, ...hsvPayload(colour)});
/** @param {string} locality @param {Colour} colour @returns {import("../../contracts/edits.js").EditOf<'updateComboFeedback'>} */
export const comboFeedback = (locality, colour) => ({type: "updateComboFeedback", locality, ...hsvPayload(colour)});

// Key feedback is stored as one record, so any change posts the whole thing
// with the one field replaced: `rowId` is a colour field or `branch:<n>`.
/** @param {Partial<import("../../contracts/edits.js").KeyFeedback<Colour>>} [feedback] @param {import("../../contracts/edits.js").FeedbackRow | null} [rowId] @param {Colour} [next] @param {{tapCommitMode?: string, locality?: string}} [overrides] @returns {import("../../contracts/edits.js").EditOf<'updateKeyBehaviorFeedback'>} */
export function keyFeedback(feedback = {}, rowId, next, overrides = {}) {
    const config = {
        tapBranchColors: (feedback.tapBranchColors || []).map(hsvPayload),
        tapCommittedColor: hsvPayload(feedback.tapCommittedColor),
        holdActiveColor: hsvPayload(feedback.holdActiveColor),
        longHoldActiveColor: hsvPayload(feedback.longHoldActiveColor),
        tapCommitMode: feedback.tapCommitMode,
        locality: feedback.locality,
        ...overrides,
    };
    if (rowId && next) {
        const branch = /^branch:(\d+)$/.exec(rowId);
        if (branch) config.tapBranchColors[Number(branch[1])] = hsvPayload(next);
        else config[/** @type {import("../../contracts/edits.js").FeedbackColourField} */ (rowId)] = hsvPayload(next);
    }
    return {type: "updateKeyBehaviorFeedback", config};
}

// A new LED group row: its table, whose row it is (combo feedback has no
// owner — every combo shares one colour), and either a saved group or the
// LEDs picked on the board.
/** @param {{target: string, owner: string, source: string}} row @param {number[]} ledIndices @param {Colour} colour @returns {import("../../contracts/edits.js").EditOf<'addRgbLedGroup'>} */
export const ledRow = ({target, owner, source}, ledIndices, colour) => ({
    type: "addRgbLedGroup",
    group: {
        target,
        ...(target === "combo" ? {} : {owner}),
        ...(source ? {ledGroupName: source} : {ledIndices}),
        ...hsvPayload(colour),
    },
});
/** @param {string} target @param {number} index @returns {import("../../contracts/edits.js").EditOf<'deleteRgbLedGroup'>} */
export const deleteLedRow = (target, index) => ({type: "deleteRgbLedGroup", target, index});
/** @param {number[]} ledIndices @returns {import("../../contracts/edits.js").EditOf<'saveRgbReusableLedGroup'>} */
export const saveLedGroup = (ledIndices) => ({type: "saveRgbReusableLedGroup", group: {ledIndices}});
/** @param {string} name @returns {import("../../contracts/edits.js").EditOf<'deleteRgbReusableLedGroup'>} */
export const deleteLedGroup = (name) => ({type: "deleteRgbReusableLedGroup", name});

// ── macros, pointing, settings ──────────────────────────────────────────

/** @param {string} keycode @param {string} payload @param {string} [identity] @returns {import("../../contracts/edits.js").EditOf<'updateMacro'> & {payload: string}} */
export const macroMessage = (keycode, payload, identity) => ({type: "updateMacro", keycode, payload, expectedFingerprint: identity});
/** @param {string} keycode @param {string} payload @param {number} requestId @returns {import("../../contracts/edits.js").EditOf<'validateMacro'>} */
export const macroValidationMessage = (keycode, payload, requestId) => ({type: "validateMacro", keycode, payload, requestId});
// A macro's name; its steps stay as they are.
/** @param {string} keycode @param {string} name @param {string} [identity] @returns {import("../../contracts/edits.js").EditOf<'updateMacro'> & {name: string}} */
export const macroNameMessage = (keycode, name, identity) => ({type: "updateMacro", keycode, name: String(name ?? "").trim(), expectedFingerprint: identity});
/** @param {string} keycode @param {'auto' | 'on' | 'off'} protection @param {string} [identity] @returns {import("../../contracts/edits.js").EditOf<'updateMacro'> & {protection: 'auto' | 'on' | 'off'}} */
export const macroProtectionMessage = (keycode, protection, identity) => ({type: "updateMacro", keycode, protection, expectedFingerprint: identity});
/** @param {string} keycode @param {string} name @param {string} [identity] @returns {import("../../contracts/edits.js").EditOf<'updateCustomKey'>} */
export const customKeyNameMessage = (keycode, name, identity) => ({type: "updateCustomKey", keycode, name: String(name ?? "").trim(), expectedFingerprint: identity});
// A custom key's shortcut: the eight-bit modifier mask the grid reads and one
// key, 0 for none. Both zero clears it.
/** @param {string} keycode @param {number} mods @param {number} key @param {string} [identity] @returns {import("../../contracts/edits.js").EditOf<'updateCustomKeyShortcut'>} */
export const customKeyShortcutMessage = (keycode, mods, key, identity) => ({type: "updateCustomKeyShortcut", keycode, shortcut: {mods: Number(mods) || 0, key: Number(key) || 0}, expectedFingerprint: identity});
// A custom key made for a shortcut no keycode can hold: named, and put to use
// by `then` (a layout key, a behaviour cell or a combo) in the same draft step
// (D-L63).
/** @param {string} keycode @param {{mods: number, key: number}} shortcut @param {string} name @param {import("../../contracts/edits.js").EditPayloads['updateCustomKeyShortcut']['then']} [then] @param {string} [identity] @returns {import("../../contracts/edits.js").EditOf<'updateCustomKeyShortcut'>} */
export const customKeyForShortcut = (keycode, shortcut, name, then, identity) => ({...customKeyShortcutMessage(keycode, shortcut.mods, shortcut.key, identity),
    name: String(name ?? "").trim(), ...(then ? {then} : {})});
// The keyboard's own name; empty gives it back its built-in name.
/** @param {string} name @param {string} [identity] @returns {import("../../contracts/edits.js").EditOf<'renameKeyboard'>} */
export const keyboardNameMessage = (name, identity) => ({type: "renameKeyboard", name: String(name ?? "").trim(), expectedFingerprint: identity});

/** @param {number} slot @param {import("../../contracts/edits.js").PdConfig} config @param {Partial<BaseIdentity> | null} [identity] @returns {import("../../contracts/edits.js").EditOf<'savePdMode'>} */
export const pdMode = (slot, config, identity) => ({type: "savePdMode", slot, expectedBase: identity ?? undefined, config});
/** @param {number} slot @param {Partial<BaseIdentity> | null} [identity] @returns {import("../../contracts/edits.js").EditOf<'clearPdMode'>} */
export const clearPdMode = (slot, identity) => ({type: "clearPdMode", slot, expectedBase: identity ?? undefined});
/** @param {number} slot @param {number} source @param {Partial<BaseIdentity> | null} [identity] @returns {import("../../contracts/edits.js").EditOf<'duplicatePdMode'>} */
export const duplicatePdMode = (slot, source, identity) => ({type: "duplicatePdMode", slot, source, expectedBase: identity ?? undefined});

// A settings section is saved whole: the core validates the complete set, so
// every field travels together. `input(field)` is the value on screen, or
// undefined for a field that is not drawn, which keeps what was read.
/** @param {SettingSection} section @param {(field: SettingField) => Scalar | boolean | undefined} input @param {string} [identity] @returns {import("../../contracts/edits.js").EditOf<'updateConfigDefaults'>} */
export function settingsSection(section, input, identity) {
    return {
        type: "updateConfigDefaults",
        sectionId: section.id,
        expectedFingerprint: identity,
        fields: section.fields.map((field) => {
            const shown = input(field);
            if (field.kind === "toggle") return {macro: field.macro, enabled: shown === undefined ? field.enabled : Boolean(shown)};
            return {macro: field.macro, value: shown === undefined ? field.value : shown};
        }),
    };
}

// ── the keycode picker ──────────────────────────────────────────────────

// What the picker posts: a list for list pickers, otherwise one key wrapped
// in the chosen modifiers, and in LT(layer, …) when a tap-hold layer is armed.
// Layers are posted by index, the form the draft encodes.
/** @param {{keys?: string[], mods?: string[], layerTap?: Scalar | null, mode?: 'single' | 'list'}} picker */
export function pickerExpression({keys = [], mods = [], layerTap = null, mode = "single"}) {
    if (!keys.length) return "";
    if (mode === "list") return keys.join(", ");
    let value = keys[0];
    for (const wrapper of mods) value = `${wrapper}(${value})`;
    if (layerTap !== null && layerTap !== undefined && layerTap !== "") value = `LT(${layerTap}, ${value})`;
    return value;
}

// ── keyboard shortcuts ──────────────────────────────────────────────────

// ⌘Z / Ctrl+Z requests undo, ⇧⌘Z and ⌘Y redo — the focused editor or draft
// owns the command, unless the keys belong
// to something else: a text field keeps its own undo, and a recording or an
// open prompt keeps its keys.
/** @param {{key: string, metaKey?: boolean, ctrlKey?: boolean, altKey?: boolean, shiftKey?: boolean}} event @param {{editingText?: boolean, busy?: boolean}} [context] */
export function historyAction({key, metaKey, ctrlKey, altKey, shiftKey}, {editingText = false, busy = false} = {}) {
    if (!(metaKey || ctrlKey) || altKey || editingText || busy) return null;
    const name = String(key).toLowerCase();
    if (name === "z") return shiftKey ? "redo" : "undo";
    if (name === "y" && !shiftKey) return "redo";
    return null;
}

// ⌘C / ⌘V copy a key onto the selected key; Delete and Backspace make it
// transparent. Anything with a modifier the shortcut does not use is left
// alone.
/** @param {{key: string, metaKey?: boolean, ctrlKey?: boolean, altKey?: boolean, shiftKey?: boolean}} event */
export function keyAction({key, metaKey, ctrlKey, altKey, shiftKey}) {
    const name = String(key).toLowerCase();
    if ((name === "delete" || name === "backspace") && !(metaKey || ctrlKey || altKey || shiftKey)) return "clear";
    if ((name === "c" || name === "v") && (metaKey || ctrlKey) && !altKey && !shiftKey) return name === "c" ? "copy" : "paste";
    return null;
}
