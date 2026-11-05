// @ts-check
/**
 * @typedef {NonNullable<ReturnType<typeof import("../../view/behavior-editor.mjs").behaviourEditorRow>>} EditorBehavior
 * @typedef {import("./save-behaviour.mjs").Identity} Identity
 */
// The editor under the behaviour grid for one open cell: what the tier sends,
// how it runs, and its repeat rate.

import {el, esc} from "../../lib/dom.mjs";
import {getModel, post, render, state} from "../../store.mjs";
import {editWords} from "../../view/edit-mode.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import * as edits from "../../view/edits.mjs";
import {openPicker} from "../picker.mjs";
import {branchName, holdStyles, tierName} from "../../view/vocabulary.mjs";
import {behaviourMessage, saveBehaviour} from "./save-behaviour.mjs";
import {DONE, closesInPlace} from "../inline-editor.mjs";

const {TIER_FIELDS, DEFAULT_REPEAT_HZ} = edits;

/** @param {EditorBehavior} behaviour @param {import("../../../contracts/panel.js").BehaviorView["steps"][number]} step @param {import("../../../contracts/edits.js").Tier} kind */
export function cellEditor(behaviour, step, kind) {
    const branch = step[TIER_FIELDS[kind]];
    const cell = `${step.tapCount}-${kind}`;
    // An empty cell shows the "how it runs" chosen for it so far, so the
    // choice survives renders until an action carries it to the draft.
    const pending = !branch && state.cellHow?.cell === cell && state.cellHow.keycode === behaviour.keycode ? state.cellHow : null;
    const shown = branch || pending;
    const canEdit = editGate(getModel(), "behaviours").editable;
    // The draft this row was drawn from. The picker stays open while new
    // models arrive, and what it hands back is posted with this row as drawn,
    // so it names this draft and a newer edit refuses it.
    const identity = getModel()?.profileIdentity;
    const node = el(`<div class="cell-editor">
        <div class="ce-head"><span class="tag">${esc(branchName(getModel(), step.tapCount + 1))}</span><h4>${esc(tierName(getModel(), kind))}</h4>
            <span class="note">${kind === "tap" ? "A tap tier fires on release, so it has no hold style." : "Runs once this tier's threshold passes."}</span>
            <span class="right">${DONE}${branch ? `<button class="btn tiny ghost" data-act="clear" ${canEdit ? "" : "disabled"}>Remove tier</button>` : ""}</span></div>
        <div class="ce-body">
            <label class="field"><span>Sends</span>
                <div class="input-row"><input class="input mono" data-f="behaviour:${esc(behaviour.keycode)}:${esc(cell)}:action" data-action value="${esc(branch?.action || "")}" placeholder="None" ${canEdit ? "" : "disabled"}>
                <button class="btn" data-act="pick" ${canEdit ? "" : "disabled"}>Pick…</button></div></label>
            ${kind === "tap" ? "<span></span>" : `<label class="field"><span>How it runs</span>
                <select class="input" data-f="behaviour:${esc(behaviour.keycode)}:${esc(cell)}:style" data-style ${canEdit ? "" : "disabled"}>
                    ${holdStyles(getModel(), kind).map(([value, text]) => `<option value="${esc(value)}" ${shown?.style === value ? "selected" : ""}>${esc(text)}</option>`).join("")}
                </select></label>`}
            ${kind === "tap" ? "<span></span>" : `<label class="field" data-repeat-field ${shown?.style === "REPEAT_WHILE_HELD" ? "" : "hidden"}><span>Repeat rate</span>
                <span class="affix unit"><input class="input mono num" inputmode="numeric" data-f="behaviour:${esc(behaviour.keycode)}:${esc(cell)}:repeat" data-repeat value="${esc(Number(shown?.repeatHz) > 0 ? shown?.repeatHz : DEFAULT_REPEAT_HZ)}" ${canEdit ? "" : "disabled"}><i>Hz</i></span></label>`}
            <p class="note ce-actions">${esc(editWords(getModel()?.draft).cellNote)}</p>
        </div>
    </div>`);
    /** @param {string} [action] */
    const stage = (action) => stageCell(node, behaviour, step, kind, identity, action);
    // Done or Escape closes it, and the focus goes back to its cell.
    closesInPlace(node, () => {
        state.cell = null;
        render();
        /** @type {HTMLElement | null} */ (document.querySelector(`.bcell[data-cell="${CSS.escape(cell)}"]`))?.focus();
    });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="pick"]'))?.addEventListener("click", () =>
        pickCellAction(node, behaviour, step, kind, identity));
    /** @type {HTMLSelectElement | null} */ (node.querySelector("[data-style]"))?.addEventListener("change", (event) => {
        const field = /** @type {HTMLElement} */ (node.querySelector("[data-repeat-field]"));
        if (field) field.hidden = /** @type {HTMLInputElement} */ (event.target).value !== "REPEAT_WHILE_HELD";
    });
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-action], [data-style], [data-repeat]")).forEach((field) =>
        field.addEventListener("change", () => stage()));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="clear"]'))?.addEventListener("click", () =>
        saveBehaviour(document, behaviour, identity, {tapCount: step.tapCount, kind, branch: null}));
    return node;
}

// What the open cell's editor (`editor`) stages as the cell's branch:
// `action`, or what its Sends field says, run as its fields choose. A cell
// with no action yet keeps the choice in state.cellHow until one comes.
/** @param {ParentNode} editor @param {EditorBehavior} behaviour @param {import("../../../contracts/panel.js").BehaviorView["steps"][number]} step @param {import("../../../contracts/edits.js").Tier} kind @param {Identity} identity @param {string} [action] */
function stageCell(editor, behaviour, step, kind, identity, action = /** @type {HTMLInputElement} */ (editor.querySelector("[data-action]")).value.trim()) {
    const edit = edits.cellEdit(kind, {stored: Boolean(step[TIER_FIELDS[kind]]), action, ...howChosen(editor)});
    state.cellHow = edit.pending ? {cell: `${step.tapCount}-${kind}`, keycode: behaviour.keycode, ...edit.pending} : null;
    if (!edit.pending) saveBehaviour(document, behaviour, identity, {tapCount: step.tapCount, kind, branch: edit.branch || null});
}

// How the editor's fields say the cell runs: its style and repeat rate.
/** @param {ParentNode} editor */
const howChosen = (editor) => ({
    style: /** @type {import("../../../contracts/edits.js").BranchStyle | undefined} */ (/** @type {HTMLSelectElement | null} */ (editor.querySelector("[data-style]"))?.value),
    repeatHz: /** @type {HTMLInputElement | null} */ (editor.querySelector("[data-repeat]"))?.value,
});

// The keycode picker for the open cell, as Pick… opens it, and as a
// double-click on the cell does once its editor is drawn. What it hands back
// is staged through that editor (`editor`) with the row as drawn, under the
// draft identity it was drawn from.
/** @param {ParentNode} editor @param {EditorBehavior} behaviour @param {import("../../../contracts/panel.js").BehaviorView["steps"][number]} step @param {import("../../../contracts/edits.js").Tier} kind @param {Identity} identity */
export function pickCellAction(editor, behaviour, step, kind, identity) {
    const branch = step[TIER_FIELDS[kind]];
    openPicker({
        title: `${tierName(getModel(), kind)} action`,
        contextKeycode: behaviour.keycode,
        context: branchName(getModel(), step.tapCount + 1),
        seed: branch?.action ? [branch.action] : [],
        onPick: (expression) => {
            stageCell(editor, behaviour, step, kind, identity, expression);
            render();
        },
        // A step sends a custom key's shortcut only, so a key whose shortcut
        // is these modifiers will do, behaviour or not; failing one, an unused
        // key is made it and this cell sends it, in one draft step (D-L63).
        customKeyRuns: "shortcut",
        onCustomKey: (keycode, shortcut, name) => {
            const edit = edits.cellEdit(kind, {stored: Boolean(branch), action: keycode, ...howChosen(editor)});
            // A cell that sends something keeps its row, so this is always a save.
            const message = edit.branch ? behaviourMessage(document, behaviour, identity, {tapCount: step.tapCount, kind, branch: edit.branch}) : null;
            const then = message?.type === "saveBehavior" ? message : null;
            state.cellHow = null;
            if (then) post(edits.customKeyForShortcut(keycode, shortcut, name, then, getModel()?.customKeyEditing?.identity));
            render();
        },
    });
}

// The editor drawn for a behaviour's cell, or null while it is closed.
/** @param {string} keycode @param {string} cell @returns {HTMLElement | null} */
export const cellEditorOf = (keycode, cell) =>
    document.querySelector(`[data-f="${CSS.escape(`behaviour:${keycode}:${cell}:action`)}"]`)?.closest(".cell-editor") ?? null;
