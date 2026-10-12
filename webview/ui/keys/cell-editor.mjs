// @ts-check
/**
 * @typedef {NonNullable<ReturnType<typeof import("../../view/behavior-editor.mjs").behaviourEditorRow>>} EditorBehavior
 */
// The editor under the behaviour grid for one open cell: what the tier sends,
// how it runs, and its repeat rate.

import {el, esc} from "../../lib/dom.mjs";
import {getModel, render, state, canEdit as canEditArea} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";
import {openPicker} from "../picker.mjs";
import {branchName, holdHelpers, tierName} from "../../view/vocabulary.mjs";
import {saveBehaviour} from "./save-behaviour.mjs";

const {TIER_FIELDS, DEFAULT_REPEAT_HZ} = edits;

/** @param {EditorBehavior} behaviour @param {import("../../../contracts/panel.js").BehaviorView["steps"][number]} step @param {import("../../../contracts/edits.js").Tier} kind */
export function cellEditor(behaviour, step, kind) {
    const branch = step[TIER_FIELDS[kind]];
    const cell = `${step.tapCount}-${kind}`;
    // An empty cell shows the "how it runs" chosen for it so far, so the
    // choice survives renders until an action carries it to the draft.
    const pending = !branch && state.cellHow?.cell === cell && state.cellHow.keycode === behaviour.keycode ? state.cellHow : null;
    const shown = branch || pending;
    const canEdit = canEditArea("behaviours");
    const node = el(`<div class="cell-editor">
        <div class="ce-head"><span class="tag">${esc(branchName(getModel(), step.tapCount + 1))}</span><h4>${esc(tierName(getModel(), kind))}</h4>
            <span class="note">${kind === "tap" ? "A tap tier fires on release, so it has no helper." : "Runs once this tier's threshold passes."}</span>
            <span class="right"><button class="btn tiny ghost" data-act="close">Done</button></span></div>
        <div class="ce-body">
            <label class="field"><span>Sends</span>
                <div class="input-row"><input class="input mono" data-f="behaviour:${esc(behaviour.keycode)}:${cell}:action" data-action value="${esc(branch?.action || "")}" placeholder="nothing" ${canEdit ? "" : "disabled"}>
                <button class="btn" data-act="pick" ${canEdit ? "" : "disabled"}>Pick…</button></div></label>
            ${kind === "tap" ? "<span></span>" : `<label class="field"><span>How it runs</span>
                <select class="input" data-f="behaviour:${esc(behaviour.keycode)}:${cell}:helper" data-helper ${canEdit ? "" : "disabled"}>
                    ${holdHelpers(getModel(), kind).map(([value, text]) => `<option value="${value}" ${shown?.helper === value ? "selected" : ""}>${text}</option>`).join("")}
                </select></label>`}
            ${kind === "tap" ? "<span></span>" : `<label class="field" data-repeat-field ${shown?.helper === "REPEAT_WHILE_HELD" ? "" : "hidden"}><span>Repeat rate · Hz</span>
                <input class="input mono" type="number" min="1" max="100" step="1" data-f="behaviour:${esc(behaviour.keycode)}:${cell}:repeat" data-repeat value="${esc(Number(shown?.repeatHz) > 0 ? shown?.repeatHz : DEFAULT_REPEAT_HZ)}" ${canEdit ? "" : "disabled"}></label>`}
            <div class="row ce-actions">
                ${branch ? `<button class="btn ghost" data-act="clear" ${canEdit ? "" : "disabled"}>Remove tier</button>` : ""}
                <span class="note">Changes are kept in the draft automatically.</span>
            </div>
        </div>
    </div>`);
    const stage = (action = /** @type {HTMLInputElement} */ (node.querySelector("[data-action]")).value.trim()) => {
        const edit = edits.cellEdit(kind, {stored: Boolean(branch), action,
            helper: /** @type {import("../../../contracts/edits.js").BranchHelper | undefined} */ (/** @type {HTMLSelectElement | null} */ (node.querySelector("[data-helper]"))?.value), repeatHz: /** @type {HTMLInputElement | null} */ (node.querySelector("[data-repeat]"))?.value});
        state.cellHow = edit.pending ? {cell, keycode: behaviour.keycode, ...edit.pending} : null;
        if (!edit.pending) saveBehaviour(document, behaviour, {tapCount: step.tapCount, kind, branch: edit.branch || null});
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
    }));
    /** @type {HTMLSelectElement | null} */ (node.querySelector("[data-helper]"))?.addEventListener("change", (event) => {
        const field = /** @type {HTMLElement} */ (node.querySelector("[data-repeat-field]"));
        if (field) field.hidden = /** @type {HTMLInputElement} */ (event.target).value !== "REPEAT_WHILE_HELD";
    });
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-action], [data-helper], [data-repeat]")).forEach((field) =>
        field.addEventListener("change", () => stage()));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="clear"]'))?.addEventListener("click", () =>
        saveBehaviour(document, behaviour, {tapCount: step.tapCount, kind, branch: null}));
    return node;
}
