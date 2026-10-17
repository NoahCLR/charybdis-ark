// @ts-check
/**
 * @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model
 */
// The parts of the Keys board card around the board itself: the bar over it
// while a keycode is placed or combo inputs are picked, the caption under it
// in a layer preview, and the legend that reads under the card.

import {css, isOff} from "../../lib/colour.mjs";
import {el, esc} from "../../lib/dom.mjs";
import {feedbackColours, stageEnabled} from "../../view/lighting.mjs";
import {getModel, heldLayers, layerName, layers, render, state, writable} from "../../store.mjs";
import {draftDot} from "../../view/review.mjs";
import {actionMarked, comboBadge, keyNameMarked} from "../marks.mjs";
import {comboInputLabel} from "./combo-builder.mjs";

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
        <span><b>Placing ${placement?.keycode ? actionMarked(getModel(), placement.keycode) : "keycode"}</b> — choose a layer, then click its destination key</span>
        <code class="n">${esc(placement?.keycode || "")}</code>
        <span class="right"><button class="btn tiny ghost" data-act="cancel">Cancel</button></span></div>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="cancel"]')).addEventListener("click", () => { state.placement = null; render(); });
    return node;
}

/** @param {Model} model */
export function legend(model) {
    const colours = feedbackColours(model);
    const on = stageEnabled(model, "key");
    /** @param {import("../../../contracts/edits.js").Colour} colour */
    const dot = (colour) => on && !isOff(colour) ? `<i class="ldot" style="background:${css(colour)}"></i>` : `<i class="ldot off"></i>`;
    return el(`<div class="board-legend">
        <span class="legend-item">the board shows the light this layer paints</span>
        <span class="legend-item"><i class="lkey sel"></i> selected key</span>
        <span class="legend-item"><i class="lkey indicated"></i> keys for the picked row or the combo being built</span>
        <span class="legend-item">${dot(colours.tap)} tap branch</span>
        <span class="legend-item">${dot(colours.hold)} hold branch</span>
        <span class="legend-item">${dot(colours.long)} long hold branch</span>
        <span class="legend-item">${comboBadge(model, "C0")} combo input</span>
        <span class="legend-item"><i class="lkey transparent"></i> transparent · falls through</span>
        ${model?.draft?.dirty ? `<span class="legend-item">${draftDot()} changed in your draft</span>` : ""}
        <span class="legend-item dim">${writable() ? "double-click to pick a keycode" : "select a key to read it"}${writable() ? " · drag one key onto another to swap · ⌘C and ⌘V copy between keys · delete makes a key transparent" : " · ⌘C copies a key"}</span>
        ${state.keyClipboard ? `<span class="legend-item">copied <code class="n">${esc(state.keyClipboard.keycode)}</code></span>` : ""}
    </div>`);
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
