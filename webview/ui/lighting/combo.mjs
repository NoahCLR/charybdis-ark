// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {currentView, post, render, state} from "../../store.mjs";
import {comboHeld, combosHere, holdsLayers} from "../../view/combo-held.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {vocabulary} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {offWording} from "../../view/lighting.mjs";
import {comboBadge, comboInputsMarked, comboOutputMarked} from "../marks.mjs";
import {aboutStage, colourControl, lightingGroup, paintsSection, section, stack} from "./common.mjs";
import {accentsSection} from "./accents.mjs";
import {attachPickRows, groupedTable, pickButton, pickableRow} from "../groups.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageCombo(model) {
    const node = el(`<div class="tab-split reach-split"></div>`);
    const canEdit = editGate(model, "lighting").editable;

    // The combos that fire in the view the board shows (the Keymap's "On
    // this view"), in the Keymap's table (ui/groups.mjs), parted by what
    // holding one shows: combo feedback, or the layer its output holds, whose
    // own light the board shows instead. A combo picks itself, and the board
    // holds it.
    const view = currentView();
    const here = combosHere(view);
    const held = comboHeld(view, state.comboPreview);
    const fields = vocabulary(model).comboFields;
    /** @param {{combo: import("../../../contracts/panel.js").ComboView}} entry */
    const comboRow = ({combo: row}) => {
        const on = row.id === held?.combo.id;
        return pickableRow(String(row.id), on, [
            pickButton(`lighting-combos:${row.id}`, on, comboBadge(model, row.badge || "C"), `${row.badge || "C"}`),
            comboInputsMarked(model, row),
            comboOutputMarked(model, row),
        ], {data: {combo: row.id}});
    };
    const lists = vocabulary(model).lightingLists;
    /** @param {"feedback" | "layer"} id @param {{title: string, empty: string}} words @param {typeof here} rows */
    const group = (id, words, rows) => ({id, title: words.title, empty: words.empty, ...lightingGroup(`combo:${id}`), rows: rows.map(comboRow)});
    const list = groupedTable({scroll: "lighting-combos", draft: model?.draft, columns: [["", "13%"], [fields.inputs, "42%"], [fields.sends, "45%"]], groups: [
        group("feedback", lists.comboFeedback, here.filter((entry) => !holdsLayers(entry.combo))),
        group("layer", lists.holdLayer, here.filter((entry) => holdsLayers(entry.combo))),
    ]});
    attachPickRows(list, (picked) => { state.comboPreview = {id: Number(picked), keys: []}; render(); });

    /** @type {Partial<import("../../../contracts/panel.js").RgbView["comboFeedback"]>} */
    const combo = model.rgb.comboFeedback || {};
    const main = el(`<div class="tab-grid two stage-detail"></div>`);
    const colour = section(vocabulary(model).lightingFields.colour);
    colour.append(colourControl(model, {
        colour: combo.color, canEdit, title: "Combo feedback",
        ...offWording(model, "combo"),
        onChange: (next) => { if (combo.locality !== undefined) post(edits.comboFeedback(combo.locality, next)); },
    }));
    const where = paintsSection(model, "combo", "Where it paints");
    const locality = el(`<label class="field"><span>${esc(vocabulary(model).lightingFields.locality)}</span><select data-f="lighting:combo:locality" class="input" ${canEdit ? "" : "disabled"}>
        ${vocabulary(model).localities.map(([id, text]) => `<option value="${esc(id)}" ${combo.locality === id ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`);
    /** @type {HTMLSelectElement} */ (locality.querySelector("select")).addEventListener("change", (event) =>
        { if (combo.color) post(edits.comboFeedback(/** @type {HTMLSelectElement} */ (event.target).value, combo.color)); });
    where.append(stack(locality));
    main.append(colour, where, aboutStage("While a combo's inputs are held, its keys wear this colour, in the area chosen above; its badges take their outline from it. The board shows the combo picked in the list held, its keys ringed as on the Keymap and the keys holding it ringed solid; where it can be pressed from more than one key, click a ringed key to hold it from that one. A combo that holds a layer shows no combo light: the board turns that layer on, whose own light shows the hold. One that runs a pointing mode paints beneath it, so the mode covers it where both paint."));
    const accents = accentsSection(model, "combo");
    if (accents) main.append(accents);
    node.append(list, main);
    return node;
}
