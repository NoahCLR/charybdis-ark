// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {post, writable} from "../../store.mjs";
import {vocabulary} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {offWording} from "../../view/lighting.mjs";
import {comboBadge, comboInputsMarked} from "../marks.mjs";
import {colourControl, section, stack} from "./common.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageCombo(model) {
    const node = el(`<div></div>`);
    const canEdit = writable();

    /** @type {Partial<import("../../../contracts/panel.js").RgbView["comboFeedback"]>} */
    const combo = model.rgb.comboFeedback || {};
    node.className = "tab-grid three";
    const colour = section("Colour");
    colour.append(colourControl(model, {
        colour: combo.color, canEdit, title: "Combo feedback",
        ...offWording(model, "combo"),
        onChange: (next) => { if (combo.locality !== undefined) post(edits.comboFeedback(combo.locality, next)); },
    }));
    const where = section("Where it paints");
    const locality = el(`<label class="field"><span>Locality</span><select data-f="lighting:combo:locality" class="input" ${canEdit ? "" : "disabled"}>
        ${vocabulary(model).localities.map(([id, text]) => `<option value="${esc(id)}" ${combo.locality === id ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`);
    /** @type {HTMLSelectElement} */ (locality.querySelector("select")).addEventListener("change", (event) =>
        { if (combo.color) post(edits.comboFeedback(/** @type {HTMLSelectElement} */ (event.target).value, combo.color)); });
    where.append(stack(locality));
    const onBoard = section("On the board");
    onBoard.append(el(`<div class="row gap-8 stage-chips">${(model.combos || []).slice(0, 8).map((row) =>
        `<span class="chip">${comboBadge(model, row.badge || "C")}
        ${comboInputsMarked(model, row)}</span>`).join("") || `<span class="note">No combos are stored.</span>`}</div>`));
    onBoard.append(el(`<p class="note">While a combo's inputs are held, its keys wear this colour. The badges on the key faces take their outline from it, so an off stage shows plain badges.</p>`));
    node.append(colour, where, onBoard);
    return node;
}
