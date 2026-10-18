// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {css, isOff} from "../../lib/colour.mjs";
import {currentLayer, layerName, layers, post, render, showLayer, state, writable} from "../../store.mjs";
import {layerColourRow, layerPaints} from "../../view/lighting.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import * as edits from "../../view/edits.mjs";
import {colourControl, section, stack} from "./common.mjs";
import {groupRowsTable} from "./led-rows.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageLayers(model) {
    const node = el(`<div></div>`);
    const canEdit = writable();
    const marks = draftMarks(model?.draft?.changes);

    node.className = "tab-split";
    // Past eight layers the list scrolls on its own beside the editor, as the
    // pointing modes' list does.
    const list = el(`<aside class="rowlist ${layers().length > 8 ? "many" : ""}" data-scroll-list="layers"><div class="rowlist-h">Layers</div></aside>`);
    layers().forEach((layer, index) => {
        const row = layerColourRow(model, layer.index);
        const lit = row && !isOff(row.color);
        const item = el(`<button class="rowitem ${index === state.layer ? "on" : ""}" data-layer="${index}">
            <span class="t"><span class="mk-swatch lead ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.color)}` : ""}"></span>${esc(layerName(layer))}${marks.lightingLayers.has(layer.index) ? draftDot() : ""}</span>
            <span class="m">${esc(!row ? "not reported" : !layerPaints(row.color) ? "no colour" : `${lit ? "" : "black · "}${word(vocabulary(model).paintModes, row.mode).toLowerCase()}`)}</span></button>`);
        item.addEventListener("click", () => { showLayer(index); render(); });
        list.append(item);
    });
    const layer = currentLayer();
    const row = layerColourRow(model, layer?.index);
    const main = el(`<div class="tab-grid two stage-detail"></div>`);
    const colour = section(`${layerName(layer)} colour`);
    colour.append(colourControl(model, {
        colour: row?.color, canEdit, title: `${layerName(layer)} layer`,
        offNote: "No colour is stored for this layer, so the base effect shows through wherever it would paint.",
        onChange: (next) => { if (row) post(edits.layerColour(row.layer, row.mode, next)); },
    }));
    const where = section("Where it paints");
    const mode = el(`<label class="field"><span>Which keys light up</span>
        <select data-f="lighting:layer:${layer?.index}:mode" class="input" ${canEdit ? "" : "disabled"}>
            ${vocabulary(model).paintModes.map(([id, text]) => `<option value="${id}" ${(row?.mode || "KEYS_MAPPED_ON_THIS_LAYER_ONLY") === id ? "selected" : ""}>${esc(text)}</option>`).join("")}
        </select></label>`);
    /** @type {HTMLSelectElement} */ (mode.querySelector("select")).addEventListener("change", (event) =>
        { if (row) post(edits.layerColour(row.layer, /** @type {HTMLSelectElement} */ (event.target).value, row.color)); });
    where.append(stack(mode, el(`<p class="note">Pass-through leaves whatever is underneath visible; transparent keys keep their ▽ on the board either way. The board above is already showing this.</p>`)));
    const overrides = section("LED overrides on this layer", `<span class="right"><button class="btn tiny ghost" data-act="groups">Edit groups</button></span>`);
    overrides.className = "span";
    overrides.append(groupRowsTable(model.rgb.layerLedGroups, "layer"));
    /** @type {HTMLButtonElement} */ (overrides.querySelector('[data-act="groups"]')).addEventListener("click", () => { state.stage = "groups"; render(); });
    main.append(colour, where, overrides);
    node.append(list, main);
    return node;
}
