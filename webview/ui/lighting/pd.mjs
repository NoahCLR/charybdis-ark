// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {css, isOff} from "../../lib/colour.mjs";
import {post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {offWording, POINTING_MODE_IDS, pdColourRow} from "../../view/lighting.mjs";
import {slotCalled as slotName, slotNamed, vocabulary} from "../../view/vocabulary.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import * as edits from "../../view/edits.mjs";
import {colourControl, localityLabel, section, stack} from "./common.mjs";
import {groupRowsTable} from "./led-rows.mjs";
import {slotBank} from "../../view/slot-bank.mjs";
import {allSlotsShown, emptySlotsButton} from "../slot-bank.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stagePointing(model) {
    const node = el(`<div></div>`);
    const canEdit = editGate(model, "lighting").editable;
    const marks = draftMarks(model?.draft?.changes);

    node.className = "tab-split";
    // Past eight slots the list scrolls on its own beside the editor. Empty
    // slots fold behind the disclosure at its end, as the layers' list folds
    // its empty layers; the picked slot, and one the draft changed, apart.
    const slots = model.pdModes || [];
    const bank = slotBank(slots, {inUse: (slot) => Boolean(slot.kind), free: (slot) => !slot.kind,
        keep: (slot) => slot.id === state.pointingSlot || marks.lightingSlots.has(slot.id),
        matches: () => true, searching: false, open: allSlotsShown("lighting-pointing")});
    const listed = [...bank.shown, ...bank.revealed];
    const list = el(`<aside class="rowlist ${listed.length > 8 ? "many" : ""}" data-scroll-list="pd"><div class="rowlist-h">Pointing modes</div></aside>`);
    const disclosure = bank.folded ? emptySlotsButton("lighting-pointing", bank.folded, "mode", "rowlist-empties") : null;
    listed.forEach((slot) => {
        if (disclosure && slot === bank.revealed[0]) list.append(disclosure);
        const row = pdColourRow(model, slot.id);
        const lit = row && !isOff(row.color);
        const item = el(`<button class="rowitem ${slot.id === state.pointingSlot ? "on" : ""} ${slot.kind ? "" : "quiet"}" data-slot="${esc(slot.id)}">
            <span class="t"><span class="mk-swatch lead ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.color)}` : ""}"></span>${esc(slotNamed(slot))}${marks.lightingSlots.has(slot.id) ? draftDot() : ""}</span>
            <span class="m">${esc(!row ? "not reported" : lit ? localityLabel(row.locality).toLowerCase() : "no colour")}</span></button>`);
        item.addEventListener("click", () => { state.pointingSlot = slot.id; render(); });
        list.append(item);
    });
    if (disclosure && !bank.revealed.length) list.append(disclosure);
    const row = pdColourRow(model, state.pointingSlot);
    const main = el(`<div class="tab-grid two stage-detail"></div>`);
    const colour = section(`${slotName(model, state.pointingSlot)} colour`);
    colour.append(colourControl(model, {
        colour: row?.color, canEdit, title: `${slotName(model, state.pointingSlot)} while active`,
        ...offWording(model, "pd"),
        onChange: (next) => { if (row) post(edits.pdModeColour(POINTING_MODE_IDS[state.pointingSlot], row.locality, next)); },
    }));
    const where = section("Where it paints");
    const locality = el(`<label class="field"><span>${esc(vocabulary(model).lightingFields.locality)}</span>
        <select data-f="lighting:pointing:${esc(state.pointingSlot)}:locality" class="input" ${canEdit ? "" : "disabled"}
            data-tip="Where the colour paints while the mode runs. The trigger key choices follow the key that started it, and paint every key when no key did.">
        ${vocabulary(model).localities.map(([id, text]) => `<option value="${esc(id)}" ${row?.locality === id ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`);
    /** @type {HTMLSelectElement} */ (locality.querySelector("select")).addEventListener("change", (event) =>
        { if (row) post(edits.pdModeColour(POINTING_MODE_IDS[state.pointingSlot], /** @type {HTMLSelectElement} */ (event.target).value, row.color)); });
    const previewSwitch = el(`<label class="sw"><input data-f="lighting:pointing:${esc(state.pointingSlot)}:preview" type="checkbox" ${state.pdPreview ? "checked" : ""}><span class="track"></span>
        <span class="txt">Preview it active on the board</span></label>`);
    /** @type {HTMLInputElement} */ (previewSwitch.querySelector("input")).addEventListener("change", (event) => { state.pdPreview = /** @type {HTMLInputElement} */ (event.target).checked; render(); });
    where.append(stack(locality, previewSwitch));
    const note = section("What this stage does");
    note.className = "span";
    note.append(el(`<p class="note stage-about">While the mode runs, its colour paints over the layer's colour in the area chosen above.</p>`));
    note.append(groupRowsTable(model.rgb.pdModeLedGroups, "pdMode"));
    main.append(colour, where, note);
    node.append(list, main);
    return node;
}
