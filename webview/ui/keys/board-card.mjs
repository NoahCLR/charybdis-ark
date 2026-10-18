// @ts-check
/**
 * @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model
 */
// The parts of the Keys board card around the board itself: the bar over it
// while a keycode is placed or combo inputs are picked, the caption under it
// in a layer preview, and what its marks mean behind its "?".

import {css, isOff} from "../../lib/colour.mjs";
import {el, esc} from "../../lib/dom.mjs";
import {feedbackColours, stageEnabled} from "../../view/lighting.mjs";
import {getModel, heldLayers, layerName, layers, render, state, writable} from "../../store.mjs";
import {draftDot} from "../../view/review.mjs";
import {actionMarked, comboBadge, keyNameMarked, keycodeMark} from "../marks.mjs";
import {addCombo, comboInputLabel} from "./combo-builder.mjs";
import {comboMissing} from "../../view/combo-form.mjs";

// The caption while layers are previewed on together: which ones, in the
// order they win. Clicking any tab goes back to one layer.
/** @param {import("../../../contracts/panel.js").Layer} layer */
export function previewFoot(layer, lead = "") {
    const under = heldLayers().filter((at) => at > 0).reverse().map((at) => layerName(layers()[at]));
    const text = `${layerName(layer)} on top of ${[...under, layerName(layers()[0])].join(", ")}`
        + ` · keys seen through from below are frosted · edits go to ${layerName(layer)}`;
    return el(`<div class="board-foot">${lead}
        <span class="board-foot-text" data-tip="${esc(text)}"><b>${esc(layerName(layer))}</b> on top of ${esc([...under, layerName(layers()[0])].join(", "))}
            · keys seen through from below are frosted · edits go to ${esc(layerName(layer))}</span></div>`);
}

export function placementBar() {
    const placement = state.placement;
    const node = el(`<div class="pickbar">
        <span><b>Placing ${placement?.label ? esc(placement.label) : placement?.keycode ? actionMarked(getModel(), placement.keycode) : "keycode"}</b> — ${placement?.layerTap !== undefined
            ? "click the key whose tap it keeps"
            : "choose a layer, then click its destination key"}</span>
        ${placement?.layerTap !== undefined ? "" : keycodeMark("placeBar", placement?.keycode, "", "n")}
        <span class="right"><button class="btn tiny ghost" data-act="cancel">Cancel</button></span></div>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="cancel"]')).addEventListener("click", () => { state.placement = null; render(); });
    return node;
}

// What the board's marks mean, and its shortcuts, behind a "?" at the board
// card's top right: read once, then out of the way of the board.
/** @param {Model} model */
export function boardHelp(model) {
    const colours = feedbackColours(model);
    const on = stageEnabled(model, "key");
    /** @param {import("../../../contracts/edits.js").Colour} colour */
    const dot = (colour) => on && !isOff(colour) ? `<i class="ldot" style="background:${css(colour)}"></i>` : `<i class="ldot off"></i>`;
    const edits = writable();
    const shortcuts = [
        edits ? ["Double-click", "choose what a key does"] : ["Click", "read a key"],
        ...(edits ? [["Drag", "one key onto another swaps them"], ["Delete", "makes the picked key transparent"]] : []),
        edits ? ["⌘C  ⌘V", "copy a key and paste it onto the picked one"] : ["⌘C", "copy a key"],
        ["⌘-click a layer tab", "preview layers on together"],
        ["Tab", "reach the board: one stop, on the picked key"],
        ["← → ↑ ↓", "move to the next key that way"],
        ["[  ]", "the layer before or after"],
        ["0 – 9", "jump to that layer"],
        ...(edits ? [["Enter", "choose what the picked key does"]] : []),
    ];
    return el(`<details class="board-help">
        <summary class="btn ghost icon" aria-label="What the board shows, and its shortcuts" data-tip="What the board shows, and its shortcuts">?</summary>
        <div class="board-help-panel">
            <div class="eyebrow">On the board</div>
            <div class="board-legend">
                <span class="legend-item">the light this layer paints</span>
                <span class="legend-item"><i class="lkey sel"></i> selected key</span>
                <span class="legend-item"><i class="lkey indicated"></i> keys for the picked row or the combo being built</span>
                <span class="legend-item">${dot(colours.tap)} tap</span>
                <span class="legend-item">${dot(colours.hold)} hold</span>
                <span class="legend-item">${dot(colours.long)} long hold</span>
                <span class="legend-item">${comboBadge(model, "")} starts a combo · ${comboBadge(model, "2")} starts 2</span>
                <span class="legend-item">⚠ stops or erases the keyboard</span>
                <span class="legend-item">"not in this firmware": does nothing here</span>
                <span class="legend-item"><i class="lkey transparent"></i> Transparent (falls through)</span>
                <span class="legend-item">— Nothing (blocks lower layers)</span>
                ${model?.draft?.dirty ? `<span class="legend-item">${draftDot()} changed in your draft</span>` : ""}
            </div>
            <div class="eyebrow">Shortcuts</div>
            <dl class="board-shortcuts">${shortcuts.map(([keys, does]) => `<dt>${esc(keys)}</dt><dd>${esc(does)}</dd>`).join("")}</dl>
            ${state.keyClipboard ? `<p class="note">Copied <b>${esc(state.keyClipboard.label || state.keyClipboard.keycode)}</b>${keycodeMark("placeBar", state.keyClipboard.keycode, state.keyClipboard.label, "n")}</p>` : ""}
        </div>
    </details>`);
}

// While combo keys are picked: the keys so far, and Done (or Esc). A new
// combo can be added from here too, once it has what it needs.
export function pickBar() {
    const model = getModel();
    const adding = state.combo.editId === null;
    const inputs = adding ? state.combo.inputs : (model?.combos || []).find((combo) => combo.id === state.combo.editId)?.inputs || [];
    const names = inputs.map((name) => keyNameMarked(model, comboInputLabel(model, name), name));
    const missing = adding ? comboMissing(state.combo.form, inputs) : "";
    const node = el(`<div class="pickbar">
        <span><b>Picking keys for the combo</b> — click keys on the board</span>
        <span class="n">${names.join(" + ") || "none yet"}</span>
        <span class="right pickbar-actions">
            ${adding ? `<button class="btn text" data-act="clear">Clear</button>` : ""}
            <button class="btn compact" data-act="done" aria-keyshortcuts="Escape">Done</button>
            ${adding ? `<button class="btn compact primary" data-act="add" ${missing || !writable() ? "disabled" : ""} data-tip="${esc(missing || "Add this combo to the draft.")}">Add combo</button>` : ""}</span></div>`);
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="clear"]'))?.addEventListener("click", () => { state.combo.inputs = []; render(); });
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="done"]')).addEventListener("click", () => { state.combo.picking = false; render(); });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="add"]'))?.addEventListener("click", addCombo);
    return node;
}
