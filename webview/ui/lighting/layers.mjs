// @ts-check
import {choiceField} from "../segmented.mjs";
import {el, esc} from "../../lib/dom.mjs";
import {css} from "../../lib/colour.mjs";
import {currentLayer, layers, post, render, showLayer, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {colourPaints, isOff, isPassthrough, layerColourRow, offWording} from "../../view/lighting.mjs";
import {vocabulary, word, layerCalled} from "../../view/vocabulary.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import * as edits from "../../view/edits.mjs";
import {aboutStage, colourControl, lightingGroup, paintsSection, section, sectionMarked, stack} from "./common.mjs";
import {accentsSection} from "./accents.mjs";
import {layerMarked} from "../marks.mjs";
import {foldEmptyLayers} from "../../view/empty-layers.mjs";
import {emptyLayersShown, toggleEmptyLayers} from "../empty-layers.mjs";
import {EMPTY_LAYERS_TIP, EMPTY_LAYERS_TITLE} from "../../view/empty-layers.mjs";
import {attachPickRows, groupedTable, pickButton, pickableRow} from "../groups.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageLayers(model) {
    const node = el(`<div></div>`);
    const canEdit = editGate(model, "lighting").editable;
    const marks = draftMarks(model?.draft?.changes);

    node.className = "tab-split reach-split";
    // The layers, in the Keymap's grouped table (ui/groups.mjs), scrolling
    // on their own beside the editor. Empty layers fold under the table's
    // last band (D-L76), the picked one apart.
    const {shown, folded} = foldEmptyLayers(model, layers(), (layer) => layer.index, (layer) => layer.index === state.layer);
    const open = emptyLayersShown("lighting-layers");
    /** @param {import("../../../contracts/panel.js").Layer} layer */
    const layerRow = (layer) => {
        const index = layer.index;
        const row = layerColourRow(model, index);
        const lit = row && !isPassthrough(row.color) && !isOff(row.color);
        return pickableRow(`${index}`, index === state.layer, [
            pickButton(`lighting-layers:${index}`, index === state.layer, `<span class="mk-swatch lead ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.color)}` : ""}"></span>${esc(layerCalled(layer))}${marks.lightingLayers.has(index) ? draftDot(model?.draft) : ""}`),
            `<span class="muted">${esc(!row ? "not reported" : !colourPaints(row.color) ? "passthrough" : `${lit ? "" : "off · "}${word(vocabulary(model).paintModesBrief, row.mode)}`)}</span>`,
        ], {data: {layer: index}});
    };
    const list = groupedTable({scroll: "layers", draft: model?.draft, columns: [["Layer", "52%"], ["Paints", "48%"]], groups: [
        {id: "inUse", title: vocabulary(model).lightingLists.inUse, ...lightingGroup("layers:inUse"), rows: shown.map(layerRow)},
        ...(folded.length ? [{id: "empty", title: EMPTY_LAYERS_TITLE, tip: EMPTY_LAYERS_TIP, open, rows: folded.map(layerRow), toggle: () => { toggleEmptyLayers("lighting-layers"); render(); }}] : []),
    ]});
    attachPickRows(list, (index) => { showLayer(Number(index)); render(); });
    const layer = currentLayer();
    const row = layerColourRow(model, layer?.index);
    const main = el(`<div class="tab-grid two stage-detail"></div>`);
    const colour = sectionMarked(`${layerMarked(model, layer)} colour`);
    colour.append(colourControl(model, {
        colour: row?.color, canEdit, title: `${layerCalled(layer)} layer`,
        ...offWording(model, "layers"),
        onChange: (next) => { if (row) post(edits.layerColour(row.layer, row.mode, next)); },
    }));
    const where = paintsSection(model, "layers", "Where it paints");
    const mode = el(choiceField({label: vocabulary(model).lightingFields.paintMode, f: `lighting:layer:${layer?.index}:mode`, choices: vocabulary(model).paintModes,
        current: row?.mode || "KEYS_MAPPED_ON_THIS_LAYER_ONLY", disabled: !canEdit}));
    mode.addEventListener("change", (event) =>
        { if (row) post(edits.layerColour(row.layer, /** @type {HTMLInputElement} */ (event.target).value, row.color)); });
    where.append(stack(mode, el(`<p class="note">Keys mapped on this layer only leaves its transparent and empty keys unpainted, so what is beneath shows. All LEDs paints every LED, the trackball's included.</p>`)));
    main.append(colour, where, aboutStage("Each layer that is on paints its colour over the background effect, lowest first, so a higher layer covers a lower one where both paint; where a layer paints nothing, what is beneath shows. The board shows the layer picked, with the layers previewed under it."));
    const accents = accentsSection(model, "layers");
    if (accents) main.append(accents);
    node.append(list, main);
    return node;
}
