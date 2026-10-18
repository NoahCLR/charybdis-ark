// @ts-check
/**
 * @typedef {NonNullable<ReturnType<typeof import("../../view/behavior-editor.mjs").behaviourEditorRow>>} EditorBehavior
 */
// The open cell's editor, a popover anchored to its cell: what the action
// sends, how it runs, its repeat rate, and Clear. Every change posts at once.

import {el, esc} from "../../lib/dom.mjs";
import {getModel, post, render, state, canEdit as canEditArea} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";
import {cellLabel, inheritedBranch} from "../../view/keyface.mjs";
import {openPicker} from "../picker.mjs";
import {branchName, holdHelpers, tierName} from "../../view/vocabulary.mjs";
import {keyNameMarked, keycodeMark} from "../marks.mjs";
import {behaviourMessage, saveBehaviour} from "./save-behaviour.mjs";

const {TIER_FIELDS, DEFAULT_REPEAT_HZ} = edits;

// How a hold runs, as the menu offers it: the vocabulary's short words, with
// a capital.
/** @param {string} text */
const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** @param {EditorBehavior} behaviour @param {import("../../../contracts/panel.js").BehaviorView["steps"][number]} step @param {import("../../../contracts/edits.js").Tier} kind */
export function cellEditor(behaviour, step, kind) {
    const model = getModel();
    const branch = step[TIER_FIELDS[kind]];
    const cell = `${step.tapCount}-${kind}`;
    // An empty cell shows the "how it runs" chosen for it so far, so the
    // choice survives renders until an action carries it to the draft.
    const pending = !branch && state.cellHow?.cell === cell && state.cellHow.keycode === behaviour.keycode ? state.cellHow : null;
    const shown = branch || pending;
    const canEdit = canEditArea("behaviours");
    const builtIn = branch ? null : inheritedBranch(behaviour, step, kind);
    const id = `behaviour:${behaviour.keycode}:${cell}`;
    const title = `${branchName(model, step.tapCount + 1)} · ${tierName(model, kind)}`;
    const label = branch ? cellLabel(model, branch) : "";
    const sendsField = builtIn
        ? `<p class="ce-builtin">Built in: <b>${keyNameMarked(model, cellLabel(model, builtIn), builtIn.action)}</b></p>
            <div class="row ce-choices">
                <button class="btn compact" data-act="pick" ${canEdit ? "" : "disabled"}>Set something else…</button>
                <button class="btn text" data-act="nothing" ${canEdit ? "" : "disabled"}
                    data-tip="Send nothing here: the key's own action stops, and lower layers do not answer.">Nothing</button></div>`
        : `<div class="field"><span>Sends</span>
            <button class="value-btn" data-act="pick" ${canEdit ? "" : "disabled"}>${branch
                ? `${keyNameMarked(model, label, branch.action)}${keycodeMark("behaviourCell", branch.action, label, "dim")}`
                : `<span class="dim">Choose a key…</span>`}</button></div>`;
    // With Show keycodes, the exact keycode can be typed too.
    const exact = state.showKeycodes && !builtIn ? `<label class="field"><span>Keycode</span>
        <input class="input mono" data-f="${esc(id)}:action" data-action value="${esc(branch?.action || "")}" placeholder="KC_…" ${canEdit ? "" : "disabled"}></label>` : "";
    const node = el(`<div class="cell-editor cell-pop" role="dialog" aria-label="${esc(title)}" data-for="${esc(cell)}">
        <div class="ce-head"><span class="eyebrow">${esc(title)}</span></div>
        <div class="ce-body">
            ${sendsField}
            ${exact}
            ${kind === "tap" ? "" : `<label class="field"><span>How it runs</span>
                <select class="input compact" data-f="${esc(id)}:helper" data-helper ${canEdit ? "" : "disabled"}>
                    ${holdHelpers(model, kind).map(([value, text]) => `<option value="${value}" ${shown?.helper === value ? "selected" : ""}>${esc(sentence(text))}</option>`).join("")}
                </select></label>
                <label class="field" data-repeat-field ${shown?.helper === "REPEAT_WHILE_HELD" ? "" : "hidden"}><span>Repeats per second</span>
                <input class="input mono" type="number" min="1" max="100" step="1" data-f="${esc(id)}:repeat" data-repeat value="${esc(Number(shown?.repeatHz) > 0 ? shown?.repeatHz : DEFAULT_REPEAT_HZ)}" ${canEdit ? "" : "disabled"}></label>`}
            ${branch ? `<div class="row ce-actions"><button class="btn text destructive" data-act="clear" ${canEdit ? "" : "disabled"}>Clear</button></div>` : ""}
        </div>
    </div>`);
    const helper = () => /** @type {import("../../../contracts/edits.js").BranchHelper | undefined} */ (/** @type {HTMLSelectElement | null} */ (node.querySelector("[data-helper]"))?.value);
    const repeat = () => /** @type {HTMLInputElement | null} */ (node.querySelector("[data-repeat]"))?.value;
    /** @param {string} action */
    const stage = (action) => {
        const edit = edits.cellEdit(kind, {stored: Boolean(branch), action, helper: helper(), repeatHz: repeat()});
        state.cellHow = edit.pending ? {cell, keycode: behaviour.keycode, ...edit.pending} : null;
        if (!edit.pending) saveBehaviour(document, behaviour, {tapCount: step.tapCount, kind, branch: edit.branch || null});
    };
    /** @type {NodeListOf<HTMLButtonElement>} */ (node.querySelectorAll('[data-act="pick"]')).forEach((button) => button.addEventListener("click", () => openPicker({
        title: `${tierName(model, kind)} action`,
        contextKeycode: behaviour.keycode,
        context: branchName(model, step.tapCount + 1),
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
            const edit = edits.cellEdit(kind, {stored: Boolean(branch), action: keycode, helper: helper(), repeatHz: repeat()});
            const then = edit.branch ? behaviourMessage(document, behaviour, {tapCount: step.tapCount, kind, branch: edit.branch}) : null;
            state.cellHow = null;
            if (then) post(edits.customKeyForShortcut(keycode, shortcut, name, then, getModel()?.customKeyEditing?.identity));
            render();
        },
    })));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="nothing"]'))?.addEventListener("click", () => stage("KC_NO"));
    /** @type {HTMLSelectElement | null} */ (node.querySelector("[data-helper]"))?.addEventListener("change", (event) => {
        const field = /** @type {HTMLElement} */ (node.querySelector("[data-repeat-field]"));
        if (field) field.hidden = /** @type {HTMLInputElement} */ (event.target).value !== "REPEAT_WHILE_HELD";
    });
    // A helper or rate changed on an empty cell waits for its action; on a set
    // one it posts with the action the cell sends.
    const current = () => /** @type {HTMLInputElement | null} */ (node.querySelector("[data-action]"))?.value.trim() ?? (branch?.action || "");
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-action], [data-helper], [data-repeat]")).forEach((field) =>
        field.addEventListener("change", () => stage(current())));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="clear"]'))?.addEventListener("click", () =>
        saveBehaviour(document, behaviour, {tapCount: step.tapCount, kind, branch: null}));
    return node;
}

// Anchor the popover under its cell, or above it when the window has no room
// below and the space above it, under the workbench tabs, has. Below, the
// editor keeps room for it and the page scrolls just enough to show it. It is
// placed once the editor is in the page, before it paints.
/** @param {HTMLElement} editor @param {HTMLElement} pop @param {string} cell */
export function placeCellEditor(editor, pop, cell) {
    requestAnimationFrame(() => {
        const anchor = /** @type {HTMLElement | null} */ (editor.querySelector(`[data-cell="${CSS.escape(cell)}"]`));
        if (!anchor || !pop.isConnected) return;
        const box = editor.getBoundingClientRect(), at = anchor.getBoundingClientRect();
        const ceiling = (document.querySelector(".keys-pad .bench-tabs") || document.querySelector(".content"))?.getBoundingClientRect().bottom ?? 0;
        const floor = innerHeight - 64;
        const height = pop.offsetHeight, gap = 6;
        const flip = floor - at.bottom < height + gap && at.top - ceiling >= height + gap;
        pop.classList.toggle("above", flip);
        pop.style.left = `${Math.max(0, Math.min(at.left - box.left, box.width - pop.offsetWidth))}px`;
        pop.style.top = `${flip ? at.top - box.top - height - gap : at.bottom - box.top + gap}px`;
        if (flip) return;
        const room = at.bottom - box.top + gap + height - box.height;
        if (room > 0) editor.style.paddingBottom = `${room + gap}px`;
        // Scroll just enough to show it, but never the cell under the
        // workbench tabs.
        const over = pop.getBoundingClientRect().bottom - floor;
        const scroller = editor.closest(".content");
        if (over > 0 && scroller) scroller.scrollBy({top: Math.min(over, Math.max(0, at.top - ceiling - gap))});
    });
}
