// @ts-check
/**
 * @typedef {NonNullable<ReturnType<typeof import("../../view/behavior-editor.mjs").behaviourEditorRow>>} EditorBehavior
 */
// The editor under the behaviour grid for one open cell: what the tier sends,
// how it runs, and its repeat rate.

import {el, esc} from "../../lib/dom.mjs";
import {getModel, post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import * as edits from "../../view/edits.mjs";
import {openPicker} from "../picker.mjs";
import {branchName, holdStyles, tierName} from "../../view/vocabulary.mjs";
import {behaviourMessage, saveBehaviour} from "./save-behaviour.mjs";

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
            <span class="right"><button class="btn tiny ghost" data-act="close">Done</button></span></div>
        <div class="ce-body">
            <label class="field"><span>Sends</span>
                <div class="input-row"><input class="input mono" data-f="behaviour:${esc(behaviour.keycode)}:${esc(cell)}:action" data-action value="${esc(branch?.action || "")}" placeholder="nothing" ${canEdit ? "" : "disabled"}>
                <button class="btn" data-act="pick" ${canEdit ? "" : "disabled"}>Pick…</button></div></label>
            ${kind === "tap" ? "<span></span>" : `<label class="field"><span>How it runs</span>
                <select class="input" data-f="behaviour:${esc(behaviour.keycode)}:${esc(cell)}:style" data-style ${canEdit ? "" : "disabled"}>
                    ${holdStyles(getModel(), kind).map(([value, text]) => `<option value="${esc(value)}" ${shown?.style === value ? "selected" : ""}>${esc(text)}</option>`).join("")}
                </select></label>`}
            ${kind === "tap" ? "<span></span>" : `<label class="field" data-repeat-field ${shown?.style === "REPEAT_WHILE_HELD" ? "" : "hidden"}><span>Repeat rate · Hz</span>
                <input class="input mono" type="number" min="1" max="100" step="1" data-f="behaviour:${esc(behaviour.keycode)}:${esc(cell)}:repeat" data-repeat value="${esc(Number(shown?.repeatHz) > 0 ? shown?.repeatHz : DEFAULT_REPEAT_HZ)}" ${canEdit ? "" : "disabled"}></label>`}
            <div class="row ce-actions">
                ${branch ? `<button class="btn ghost" data-act="clear" ${canEdit ? "" : "disabled"}>Remove tier</button>` : ""}
                <span class="note">Changes are kept in the draft automatically.</span>
            </div>
        </div>
    </div>`);
    const stage = (action = /** @type {HTMLInputElement} */ (node.querySelector("[data-action]")).value.trim()) => {
        const edit = edits.cellEdit(kind, {stored: Boolean(branch), action,
            style: /** @type {import("../../../contracts/edits.js").BranchStyle | undefined} */ (/** @type {HTMLSelectElement | null} */ (node.querySelector("[data-style]"))?.value), repeatHz: /** @type {HTMLInputElement | null} */ (node.querySelector("[data-repeat]"))?.value});
        state.cellHow = edit.pending ? {cell, keycode: behaviour.keycode, ...edit.pending} : null;
        if (!edit.pending) saveBehaviour(document, behaviour, identity, {tapCount: step.tapCount, kind, branch: edit.branch || null});
    };
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="close"]')).addEventListener("click", () => { state.cell = null; render(); });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="pick"]'))?.addEventListener("click", () => openPicker({
        title: `${tierName(getModel(), kind)} action`,
        contextKeycode: behaviour.keycode,
        context: branchName(getModel(), step.tapCount + 1),
        seed: branch?.action ? [branch.action] : [],
        onPick: (expression) => {
            stage(expression);
            render();
        },
        // A step sends a custom key's shortcut only, so a key whose shortcut
        // is these modifiers will do, behaviour or not; failing one, an unused
        // key is made it and this cell sends it, in one draft step (D-L63).
        customKeyRuns: "shortcut",
        onCustomKey: (keycode, shortcut, name) => {
            const edit = edits.cellEdit(kind, {stored: Boolean(branch), action: keycode,
                style: /** @type {import("../../../contracts/edits.js").BranchStyle | undefined} */ (/** @type {HTMLSelectElement | null} */ (node.querySelector("[data-style]"))?.value), repeatHz: /** @type {HTMLInputElement | null} */ (node.querySelector("[data-repeat]"))?.value});
            // A cell that sends something keeps its row, so this is always a save.
            const message = edit.branch ? behaviourMessage(document, behaviour, identity, {tapCount: step.tapCount, kind, branch: edit.branch}) : null;
            const then = message?.type === "saveBehavior" ? message : null;
            state.cellHow = null;
            if (then) post(edits.customKeyForShortcut(keycode, shortcut, name, then, getModel()?.customKeyEditing?.identity));
            render();
        },
    }));
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
