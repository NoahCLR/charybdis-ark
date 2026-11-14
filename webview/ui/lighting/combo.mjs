// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {currentView, post, render, state} from "../../store.mjs";
import {comboHeld, combosHere, holdsLayers} from "../../view/combo-held.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {vocabulary} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {offWording} from "../../view/lighting.mjs";
import {comboBadge, comboInputChips, comboOutputMarked} from "../marks.mjs";
import {colourControl, itemHead, lightingGroup, localityField, localityWhole, paintsLine, section, stack, stageSurface} from "./common.mjs";
import {localityInfo} from "./help.mjs";
import {accentsSection} from "./accents.mjs";
import {attachPickRows, groupedTable, pickButton, pickableRow} from "../groups.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageCombo(model) {
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
            comboInputChips(model, row, {small: true}),
            comboOutputMarked(model, row),
        ], {data: {combo: row.id}});
    };
    const lists = vocabulary(model).lightingLists;
    /** @param {"feedback" | "layer"} id @param {{title: string, empty: string, tip: string}} words @param {typeof here} rows */
    const group = (id, words, rows) => ({id, title: words.title, empty: words.empty, tip: words.tip, ...lightingGroup(`combo:${id}`), rows: rows.map(comboRow)});
    const list = groupedTable({scroll: "lighting-combos", draft: model?.draft, columns: [["", "12%"], [fields.inputs, "53%"], [fields.sends, "35%"]], groups: [
        group("feedback", lists.comboFeedback, here.filter((entry) => !holdsLayers(entry.combo))),
        group("layer", lists.holdLayer, here.filter((entry) => holdsLayers(entry.combo))),
    ]});
    attachPickRows(list, (picked) => { state.comboPreview = {id: Number(picked), keys: []}; render(); });
    // Picking a combo picks which one the board holds, never what is edited:
    // the list says so by how it marks the one held (styles.css).
    list.classList.add("preview-picks");

    /** @type {Partial<import("../../../contracts/panel.js").RgbView["comboFeedback"]>} */
    const combo = model.rgb.comboFeedback || {};
    // One colour, place and set of accents for every combo, headed so.
    const head = itemHead(esc(vocabulary(model).accents.combo.every), combo.color ? paintsLine(combo.color, localityWhole(combo.locality)) : "Not reported");
    const colour = section(vocabulary(model).lightingFields.colour);
    colour.append(colourControl(model, {
        colour: combo.color, canEdit, title: "Combo feedback",
        ...offWording(model, "combo"),
        onChange: (next) => { if (combo.locality !== undefined) post(edits.comboFeedback(combo.locality, next)); },
    }));
    const where = section("Where it paints", localityInfo(model, "combo"));
    where.append(stack(localityField(model, {f: "lighting:combo:locality", value: combo.locality, canEdit,
        onChange: (locality) => { if (combo.color) post(edits.comboFeedback(locality, combo.color)); }})));
    return stageSurface(model, {id: "combo", first: list, head, colour, side: where, accents: accentsSection(model, "combo"),
        note: "One colour, place and accents for every combo. The list picks the combo the board holds."});
}
