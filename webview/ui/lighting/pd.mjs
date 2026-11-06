// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {css, isOff} from "../../lib/colour.mjs";
import {post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {offWording, POINTING_MODE_IDS, pdColourRow} from "../../view/lighting.mjs";
import {slotCalled as slotName, slotNamed, vocabulary} from "../../view/vocabulary.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import * as edits from "../../view/edits.mjs";
import {aboutStage, colourControl, lightingGroup, localityLabel, section, stack} from "./common.mjs";
import {accentsSection} from "./accents.mjs";
import {attachPickRows, groupedTable, pickButton, pickableRow} from "../groups.mjs";
import {EMPTY_SLOTS_TIP, EMPTY_SLOTS_TITLE} from "../../view/slot-bank.mjs";
import {slotBank} from "../../view/slot-bank.mjs";
import {allSlotsShown, toggleAllSlots} from "../slot-bank.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stagePointing(model) {
    const node = el(`<div></div>`);
    const canEdit = editGate(model, "lighting").editable;
    const marks = draftMarks(model?.draft?.changes);

    node.className = "tab-split reach-split";
    // The slots, in the Keymap's grouped table (ui/groups.mjs), scrolling on
    // their own beside the editor. Empty slots fold under the table's last
    // band, as the layers' list folds its empty layers; the picked slot, and
    // one the draft changed, apart. The bank is always asked open, for the
    // band's rows and count; the band decides whether they show.
    const slots = model.pdModes || [];
    const bank = slotBank(slots, {inUse: (slot) => Boolean(slot.kind), free: (slot) => !slot.kind,
        keep: (slot) => slot.id === state.pointingSlot || marks.lightingSlots.has(slot.id),
        matches: () => true, searching: false, open: true});
    /** @param {import("../../../contracts/panel.js").PublishedModel["pdModes"][number]} slot */
    const slotRow = (slot) => {
        const row = pdColourRow(model, slot.id);
        const lit = row && !isOff(row.color);
        const on = slot.id === state.pointingSlot;
        return pickableRow(`${slot.id}`, on, [
            pickButton(`lighting-pointing:${slot.id}`, on, `<span class="mk-swatch lead ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.color)}` : ""}"></span>${esc(slotNamed(slot))}${marks.lightingSlots.has(slot.id) ? draftDot(model?.draft) : ""}`),
            `<span class="muted">${esc(!row ? "not reported" : lit ? localityLabel(row.locality).toLowerCase() : "no colour")}</span>`,
        ], {data: {slot: slot.id}, quiet: !slot.kind});
    };
    const list = groupedTable({scroll: "pd", draft: model?.draft, columns: [["Pointing mode", "52%"], ["Paints", "48%"]], groups: [
        {id: "inUse", title: vocabulary(model).lightingLists.inUse, ...lightingGroup("pd:inUse"), rows: bank.shown.map(slotRow)},
        ...(bank.revealed.length ? [{id: "empty", title: EMPTY_SLOTS_TITLE, tip: EMPTY_SLOTS_TIP, open: allSlotsShown("lighting-pointing"), rows: bank.revealed.map(slotRow),
            toggle: () => { toggleAllSlots("lighting-pointing"); render(); }}] : []),
    ]});
    attachPickRows(list, (slot) => { state.pointingSlot = Number(slot); render(); });
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
    where.append(stack(locality));
    main.append(colour, where, aboutStage("While the mode runs, its colour paints over the layer's colour in the area chosen above. The board shows it running, as it paints with no layer it is linked to on."));
    const accents = accentsSection(model, "pd");
    if (accents) main.append(accents);
    node.append(list, main);
    return node;
}
