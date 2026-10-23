// @ts-check
// The Keys screen's keyboard shortcuts: copy, paste and delete on the selected
// key, or on the open behaviour cell. On Custom keys they act on the open cell
// of the selected key's behaviour, and only there.

import {behaviourGridSteps, keyFace, keyName, visibleKeycode} from "../../view/keyface.mjs";
import {currentLayer, getModel, positionAt, post, render, state, writable, canEdit as canEditArea} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";
import {behaviourEditorRow} from "../../view/behavior-editor.mjs";
import {holdStyles} from "../../view/vocabulary.mjs";
import {saveBehaviour} from "./save-behaviour.mjs";

const {TIER_FIELDS} = edits;

// ⌘C copies the selected key's keycode and ⌘V stores it on the selected key,
// on any layer; Delete or Backspace makes it transparent. In the Behaviours
// tab only ⌘C reaches the selected key. Text fields keep
// their own copy, paste and delete.
/** @param {KeyboardEvent} event */
export function keysShortcut(event) {
    if ((state.screen !== "keys" && state.screen !== "customKeys") || state.overlay || state.picker || state.retarget || state.recording || state.combo.picking) return false;
    const action = edits.keyAction(event);
    if (!action) return false;
    if (/** @type {HTMLElement} */ (event.target).closest?.("input, textarea, select, [contenteditable]")) return false;
    if (action === "copy" && String(getSelection?.() || "")) return false;
    if (cellShortcut(action)) { event.preventDefault(); return true; }
    if (state.screen !== "keys") return false;
    // In Behaviours, Delete and ⌘V belong to the open cell alone: the board's
    // selected key may not be the behaviour on screen, so they never reach it.
    if (state.tab === "behaviours" && action !== "copy") return false;
    const layer = currentLayer();
    if (!layer) return false;
    const position = positionAt(layer, state.selected);
    if (!position) return false;

    event.preventDefault();
    /** @param {ReturnType<typeof edits.layoutKeys>} message */
    const store = (message) => {
        if (writable() && message.changes[0].keycode !== position.keycode) post(message);
    };
    if (action === "clear") {
        if (keyFace(position).kind !== "transparent") store(edits.clearKey(layer.name, position.layoutIndex));
    } else if (action === "copy") {
        state.keyClipboard = {keycode: position.keycode, label: keyName(position)};
        navigator.clipboard?.writeText(visibleKeycode(getModel(), position.keycode)).catch(() => {});
        render();
    } else if (state.keyClipboard) {
        store(edits.setKey(layer.name, position.layoutIndex, state.keyClipboard.keycode));
    }
    return true;
}

// With a behaviour cell open, the board shortcuts act on that cell rather than
// on the key under it: Delete removes the tier, ⌘C copies what it sends, and
// ⌘V makes it send the copied key, running as it already does or as chosen.
/** @param {"copy" | "paste" | "clear"} action */
function cellShortcut(action) {
    if (!state.cell) return false;
    const model = getModel();
    // The behaviour whose editor is on screen: the Behaviours tab's row, or the
    // custom key Custom keys shows (the first until one is picked).
    const row = state.screen === "customKeys" ? state.customKey || model?.customKeys?.[0]?.keycode
        : state.tab === "behaviours" ? state.behaviourRow : null;
    const behaviour = behaviourEditorRow(model, row || "");
    const [tapCount, tier] = state.cell.split("-");
    const kind = /** @type {import("../../../contracts/edits.js").Tier} */ (tier);
    const step = behaviour && behaviourGridSteps(behaviour, model?.behaviorEditing?.maxTapStepsPerBehavior)
        .find((row) => String(row.tapCount) === tapCount);
    if (!step || !behaviour || state.cellRow !== behaviour.keycode) return false;
    const branch = step[TIER_FIELDS[kind]];
    /** @param {import("../../../contracts/edits.js").BehaviorBranch | null} next */
    const change = (next) => saveBehaviour(document, behaviour, {tapCount: step.tapCount, kind, branch: next});
    if (action === "clear") {
        if (branch && canEditArea("behaviours")) change(null);
    } else if (action === "copy") {
        if (branch) { state.keyClipboard = {keycode: branch.action, label: branch.action}; navigator.clipboard?.writeText(branch.action).catch(() => {}); render(); }
    } else if (state.keyClipboard && canEditArea("behaviours")) {
        const pending = state.cellHow?.cell === state.cell && state.cellHow.keycode === behaviour.keycode ? state.cellHow : null;
        /** @type {Pick<import("../../../contracts/edits.js").BehaviorBranch, "style" | "repeatHz">} */
        const how = branch || pending || {style: /** @type {import("../../../contracts/edits.js").BranchStyle | undefined} */ (holdStyles(getModel(), kind)[0]?.[0])};
        const edit = edits.cellEdit(kind, {stored: Boolean(branch), action: state.keyClipboard.keycode, style: how.style, repeatHz: how.repeatHz});
        if (!edit.pending && edit.branch?.action !== branch?.action) { state.cellHow = null; change(edit.branch || null); }
    }
    return true;
}
