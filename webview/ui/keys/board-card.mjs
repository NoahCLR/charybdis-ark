// @ts-check
/**
 * @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model
 */
// The parts of the Keys board card around the board itself: the bar over it
// while a keycode is placed or combo inputs are picked, the caption under it
// in a layer preview, and the legend that reads under the card with its
// Shortcuts list.

import {css, isOff} from "../../lib/colour.mjs";
import {el, esc, watchPressOutside} from "../../lib/dom.mjs";
import {feedbackColours, stageEnabled} from "../../view/lighting.mjs";
import {getModel, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {layerCalled} from "../../view/vocabulary.mjs";
import {draftDot} from "../../view/review.mjs";
import {actionMarked, comboBadge, keyNameMarked} from "../marks.mjs";
import {comboInputLabel} from "./combo-builder.mjs";
import {shortcut} from "../../view/shortcuts.mjs";

// The caption while layers are previewed on together: which ones, in the
// order they win. Clicking any tab goes back to one layer.
/** @param {import("../../view/keyface-types.js").LayerView} view */
export function previewFoot({layer, held, stack}, lead = "") {
    const under = held.filter((at) => at > 0).reverse().map((at) => layerCalled(stack[at]));
    const text = `${layerCalled(layer)} on top of ${[...under, layerCalled(stack[0])].join(", ")}`
        + ` · keys seen through from below are frosted · edits go to ${layerCalled(layer)}`;
    return el(`<div class="board-foot">${lead}
        <span class="board-foot-text" data-tip="${esc(text)}"><b>${esc(layerCalled(layer))}</b> on top of ${esc([...under, layerCalled(stack[0])].join(", "))}
            · keys seen through from below are frosted · edits go to ${esc(layerCalled(layer))}</span></div>`);
}

export function placementBar() {
    const placement = state.placement;
    const node = el(`<div class="pickbar">
        <span><b>Placing ${placement?.keycode ? actionMarked(getModel(), placement.keycode) : "keycode"}</b> — choose a layer, then click its destination key</span>
        <code class="n">${esc(placement?.keycode || "")}</code>
        <span class="right"><button class="btn tiny ghost" data-act="cancel">Cancel</button></span></div>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="cancel"]')).addEventListener("click", () => { state.placement = null; render(); });
    return node;
}

/** @type {(() => void) | null} */
let stopWatching = null;   // stops the open shortcuts list's outside-press watch

// What each mark on the board means, on one line, then a Shortcuts button
// whose list says what the board takes from the mouse and the keys. Read
// only (Live edit's held states, a keyboard not read yet), the list says
// only what still works there: selecting a key and copying it.
/** @param {Model} model */
export function legend(model) {
    const colours = feedbackColours(model);
    const on = stageEnabled(model, "key");
    /** @param {import("../../../contracts/edits.js").Colour} colour */
    const dot = (colour) => on && !isOff(colour) ? `<i class="ldot" style="background:${css(colour)}"></i>` : `<i class="ldot off"></i>`;
    const open = Boolean(state.boardShortcuts);
    const node = el(`<div class="board-legend">
        <span class="legend-item"><i class="lkey sel"></i> Selected key</span>
        <span class="legend-item"><i class="lkey indicated"></i> Keys of the picked row or new combo</span>
        <span class="legend-item">${dot(colours.tap)}${dot(colours.hold)}${dot(colours.long)} Tap, hold and long hold branches</span>
        <span class="legend-item">${comboBadge(model, "C0")} Combo input</span>
        <span class="legend-item"><i class="lkey transparent"></i> Transparent</span>
        ${model?.draft?.dirty ? `<span class="legend-item">${draftDot()} Changed in your draft</span>` : ""}
        ${state.keyClipboard ? `<span class="legend-item">Copied <code class="n">${esc(state.keyClipboard.keycode)}</code></span>` : ""}
        <span class="legend-shortcuts">
            <button class="btn tiny ghost" id="board-shortcuts-button" data-act="board-shortcuts" aria-expanded="${open}"
                ${open ? 'aria-controls="board-shortcuts"' : ""}>Shortcuts</button>
            ${open ? shortcutList(editGate(model, "keys").editable) : ""}</span>
    </div>`);
    const button = /** @type {HTMLButtonElement} */ (node.querySelector("#board-shortcuts-button"));
    button.addEventListener("click", () => {
        if (state.boardShortcuts) closeBoardShortcuts();
        else state.boardShortcuts = true;
        render();
    });
    const list = /** @type {HTMLElement | null} */ (node.querySelector("#board-shortcuts"));
    if (list) {
        stopWatching?.();
        stopWatching = watchPressOutside([list, button], () => {
            closeBoardShortcuts();
            list.remove();
            button.setAttribute("aria-expanded", "false");
            button.removeAttribute("aria-controls");
        });
    } else closeBoardShortcuts();
    return node;
}

/** @param {boolean} editable */
function shortcutList(editable) {
    /** @param {string} keys @param {string} does */
    const row = (keys, does) => `<dt>${esc(keys)}</dt><dd>${esc(does)}</dd>`;
    return `<div class="shortcuts-pop" id="board-shortcuts" role="group" aria-label="Board shortcuts"><dl>${editable
        ? row("Double-click", "Pick a keycode")
            + row("Drag onto a key", "Swap the two keys")
            + row(`${shortcut("C")}, ${shortcut("V")}`, "Copy a key, paste it onto the selected one")
            + row("Delete", "Make the selected key transparent")
            + row(`${shortcut("Z")}, ${shortcut("Z", {shift: true})}`, "Undo, redo")
            + row("Enter", "Open the picker for the selected key")
        : row("Click", "Select a key to read it")
            + row(shortcut("C"), "Copy the selected key")}</dl></div>`;
}

function closeBoardShortcuts() {
    state.boardShortcuts = false;
    stopWatching?.();
    stopWatching = null;
}

// Esc anywhere closes the shortcuts list, focus back on its button.
export function escapeBoardShortcuts() {
    if (!state.boardShortcuts) return false;
    closeBoardShortcuts();
    // Left open on another screen, it was not on show: Esc is not its.
    if (!document.querySelector("#board-shortcuts")) return false;
    render();
    /** @type {HTMLElement | null} */ (document.querySelector("#board-shortcuts-button"))?.focus();
    return true;
}

export function pickBar() {
    const names = state.combo.inputs.map((name) => keyNameMarked(getModel(), comboInputLabel(getModel(), name), name));
    const node = el(`<div class="pickbar">
        <span><b>Picking combo inputs</b> — click keys on the board</span>
        <span class="n">${names.join(" + ") || "none yet"}</span>
        <span class="right pickbar-actions">
            <button class="btn tiny ghost" data-act="clear">Clear</button>
            <button class="btn tiny" data-act="done">Done</button></span></div>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="clear"]')).addEventListener("click", () => { state.combo.inputs = []; render(); });
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="done"]')).addEventListener("click", () => { state.combo.picking = false; render(); });
    return node;
}
