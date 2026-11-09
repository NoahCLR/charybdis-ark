// @ts-check
/**
 * @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model
 */
// The parts of the Keys board card around the board itself: the bar over it
// while a keycode is placed or combo inputs are picked, the caption on it in
// a layer preview, the info mark on its top-right corner whose list says the
// board's shortcuts, and the legend that reads under the card.

import {css, isOff} from "../../lib/colour.mjs";
import {el, esc} from "../../lib/dom.mjs";
import {feedbackColours, stageEnabled} from "../../view/lighting.mjs";
import {getModel, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {layersOnTop} from "../../view/vocabulary.mjs";
import {draftDot} from "../../view/review.mjs";
import {editWords} from "../../view/edit-mode.mjs";
import {actionMarked, comboBadge, keyNameMarked, layerMarked, phraseMarked} from "../marks.mjs";
import {comboInputLabel} from "./combo-builder.mjs";
import {modifierKey, shortcut} from "../../view/shortcuts.mjs";
import {REACH_ICONS} from "../../view/screens.mjs";

// The caption while layers are previewed on together: which ones, in the
// order they win, in the words Lighting's preview uses (layersOnTop).
// Clicking any tab goes back to one layer. It lies on the board and wraps
// there, so it is read whole, with no tip to repeat it.
/** @param {import("../../view/keyface-types.js").LayerView} view */
export function previewFoot(view) {
    const model = getModel();
    return el(`<div class="board-foot"><b>Preview</b>
        <span class="board-foot-text">${phraseMarked(model, layersOnTop(view))} · keys seen through from below are frosted · edits go to ${layerMarked(model, view.layer)}</span></div>`);
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

// What each mark on the board means, on one line.
/** @param {Model} model */
export function legend(model) {
    const colours = feedbackColours(model);
    const on = stageEnabled(model, "key");
    /** @param {import("../../../contracts/edits.js").Colour} colour */
    const dot = (colour) => on && !isOff(colour) ? `<i class="ldot" style="background:${css(colour)}"></i>` : `<i class="ldot off"></i>`;
    return el(`<div class="board-legend">
        <span class="legend-item"><i class="lkey sel"></i> Selected key</span>
        <span class="legend-item"><i class="lkey indicated"></i> Keys of the picked row or new combo</span>
        <span class="legend-item">${dot(colours.tap)}${dot(colours.hold)}${dot(colours.long)} Tap, hold and long hold branches</span>
        <span class="legend-item">${comboBadge(model, "C0")} Combo input</span>
        <span class="legend-item"><i class="licons" aria-hidden="true">${Object.values(REACH_ICONS).join("")}</i> Macro, custom key, pointing mode</span>
        <span class="legend-item"><i class="lkey transparent"></i> Transparent</span>
        ${model?.draft?.dirty ? `<span class="legend-item">${draftDot(model?.draft)} ${esc(editWords(model?.draft).mark)}</span>` : ""}
        ${state.keyClipboard ? `<span class="legend-item">Copied <code class="n">${esc(state.keyClipboard.keycode)}</code></span>` : ""}
    </div>`);
}

const INFO_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.2v4.3"/><circle class="dot" cx="8" cy="4.9" r=".55"/></svg>`;

// An info mark on the board's top-right corner, which the drawing leaves
// empty, whose list says what the board takes from the mouse and the keys.
// Hovering the mark, or reaching it by the keyboard, shows the list, a
// screen reader hearing it as the mark's description; the list stays open
// while the pointer is on it, and Escape hides it until the pointer or the
// focus leaves. Read only (Live edit's held states, a keyboard not read
// yet), the list says only what still works there: selecting a key and
// copying it.
/** @param {Model} model */
export function boardShortcuts(model) {
    const node = el(`<div class="board-info">
        <button type="button" class="board-info-button" aria-label="Shortcuts" aria-describedby="board-shortcuts">${INFO_ICON}</button>
        ${shortcutList(editGate(model, "keys").editable)}</div>`);
    const open = () => delete node.dataset.shut;
    node.addEventListener("mouseleave", open);
    node.addEventListener("focusout", open);
    return node;
}

/** @param {boolean} editable */
function shortcutList(editable) {
    /** @param {string} keys @param {string} does */
    const row = (keys, does) => `<dt>${esc(keys)}</dt><dd>${esc(does)}</dd>`;
    // Previewing layers together reads the board, so it is listed whether or
    // not the board can be edited (ui/layerbar.mjs, view/layer-set.mjs).
    const layers = row(`${modifierKey()}-click a layer`, "Preview it on with the others");
    return `<div class="shortcuts-pop" id="board-shortcuts" role="group" aria-label="Board shortcuts"><div class="shortcuts-h">Shortcuts</div><dl>${editable
        ? row("Double-click", "Pick a keycode")
            + row("Drag onto a key", "Swap the two keys")
            + row(`${shortcut("C")}, ${shortcut("V")}`, "Copy a key, paste it onto the selected one")
            + row("Delete", "Make the selected key transparent")
            + row(`${shortcut("Z")}, ${shortcut("Z", {shift: true})}`, "Undo, redo")
            + row("Enter", "Open the picker for the selected key")
            + layers
        : row("Click", "Select a key to read it")
            + row(shortcut("C"), "Copy the selected key")
            + layers}</dl></div>`;
}

// Esc hides the shortcuts list while it shows, until the pointer or the
// focus leaves the mark.
export function escapeBoardShortcuts() {
    const info = /** @type {HTMLElement | null} */ (document.querySelector(".board-info:hover, .board-info:has(:focus-visible)"));
    if (!info || info.dataset.shut !== undefined) return false;
    info.dataset.shut = "";
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
