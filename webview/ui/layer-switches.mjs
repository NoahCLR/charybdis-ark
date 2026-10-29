// @ts-check
// Switches per layer, each layer named by its name and shown in its colour, in
// the order the layer tabs read (D-L31). Settings draws its per-layer groups
// with the grid ("On these layers", auto-sniping's layers): one switch per
// layer. A pointing slot's link draws the table: one row per layer, a column
// per switch. Each switch keeps its own field identity, so a search still
// finds a single layer and a reordered layer keeps its switch.
import {el, esc} from "../lib/dom.mjs";
import {layers} from "../store.mjs";
import {layerCalled} from "../view/vocabulary.mjs";
import {marked} from "./marks.mjs";

/**
 * @typedef {import("../../contracts/panel.js").PublishedModel} Model
 * @typedef {{layer: number, label: string, f: string, checked: boolean, disabled: boolean, tip?: string, hidden?: boolean, macro?: string}} LayerSwitch
 * @typedef {{f: string, label: string, checked: boolean, disabled: boolean, tip?: string, text?: string}} TableSwitch
 * @typedef {{layer: number, label: string, why?: string, tip?: string, unusable?: boolean, switches: TableSwitch[]}} LayerRow
 */

// A layer by its name and mark; one the board does not have by `label`.
/** @param {Model | null} model @param {number} index @param {string} label */
function layerNamed(model, index, label) {
    const layer = layers().find((candidate) => candidate.index === index);
    return layer ? marked(model, {kind: "layer", layer: layer.index}, layerCalled(layer))
        : marked(model, index >= 0 ? {kind: "layer", layer: index} : undefined, label);
}

/** @param {Model | null} model @param {string} label @param {LayerSwitch[]} switches @returns {HTMLElement} */
export function layerSwitchGrid(model, label, switches) {
    const grid = el(`<div class="layer-grid" role="group" aria-label="${esc(label)}"></div>`);
    for (const entry of switches) {
        grid.appendChild(el(`<label class="sw" data-tip="${esc(entry.tip || "")}" ${entry.hidden ? "hidden" : ""}>
            <input type="checkbox" data-f="${esc(entry.f)}" data-switch-layer="${esc(entry.layer)}" ${entry.macro ? `data-macro="${esc(entry.macro)}"` : ""} ${entry.checked ? "checked" : ""} ${entry.disabled ? "disabled" : ""}>
            <span class="track"></span><span class="txt">${layerNamed(model, entry.layer, entry.label)}</span></label>`));
    }
    return grid;
}

// One row per layer with a switch in each of `columns`, headed by `label`
// and the columns' names. An unusable row is dimmed and says why in the row itself;
// a switch may carry words of its own beside it.
/** @param {Model | null} model @param {string} label @param {string[]} columns @param {LayerRow[]} rows @returns {HTMLElement} */
export function layerSwitchTable(model, label, columns, rows) {
    const table = el(`<div class="layer-table" role="group" aria-label="${esc(label)}">
        <div class="layer-table-row layer-table-head" aria-hidden="true"><span>${esc(label)}</span>${columns.map((column) => `<span>${esc(column)}</span>`).join("")}</div>
    </div>`);
    for (const row of rows) {
        table.appendChild(el(`<div class="layer-table-row ${row.unusable ? "unusable" : ""}" data-tip="${esc(row.tip || "")}">
            <span class="layer-table-name"><span class="txt">${layerNamed(model, row.layer, row.label)}</span>${row.why ? `<span class="layer-table-why">${esc(row.why)}</span>` : ""}</span>
            ${row.switches.map((entry, column) => `<label class="sw" data-tip="${esc(entry.tip || "")}">
                <input type="checkbox" data-f="${esc(entry.f)}" data-switch-layer="${esc(row.layer)}" data-switch-column="${esc(column)}" aria-label="${esc(entry.label)}" ${entry.checked ? "checked" : ""} ${entry.disabled ? "disabled" : ""}>
                <span class="track"></span>${entry.text ? `<span class="txt">${esc(entry.text)}</span>` : ""}</label>`).join("")}
        </div>`));
    }
    return table;
}

// The layers whose switches are on, as a mask: in a grid, or in one column of
// a table.
/** @param {HTMLElement} node @param {number} [column] */
export const switchedLayers = (node, column) => [.../** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll(column === undefined ? "input[data-switch-layer]" : `input[data-switch-layer][data-switch-column="${column}"]`))]
    .reduce((mask, input) => (input.checked ? mask | 2 ** Number(input.dataset.switchLayer) : mask), 0);
