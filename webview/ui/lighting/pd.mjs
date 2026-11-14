// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {css} from "../../lib/colour.mjs";
import {post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {isOff, isPassthrough, offWording, pdColourRow, POINTING_MODE_IDS, swatchOf} from "../../view/lighting.mjs";
import {slotCalled as slotName, slotNamed, vocabulary} from "../../view/vocabulary.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import * as edits from "../../view/edits.mjs";
import {colourControl, itemHead, lightingGroup, pickedMarked, localityField, localityWhole, paintsCell, paintsLine, section, stack, stageSurface} from "./common.mjs";
import {localityInfo} from "./help.mjs";
import {accentsSection} from "./accents.mjs";
import {attachPickRows, groupedTable, pickButton, pickableRow} from "../groups.mjs";
import {EMPTY_SLOTS_TIP, EMPTY_SLOTS_TITLE} from "../../view/slot-bank.mjs";
import {slotBank} from "../../view/slot-bank.mjs";
import {allSlotsShown, toggleAllSlots} from "../slot-bank.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stagePointing(model) {
    const canEdit = editGate(model, "lighting").editable;
    const marks = draftMarks(model?.draft?.changes);

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
        const lit = row && !isPassthrough(row.color) && !isOff(row.color);
        const on = slot.id === state.pointingSlot;
        return pickableRow(`${slot.id}`, on, [
            pickButton(`lighting-pointing:${slot.id}`, on, `<span class="mk-swatch lead ${swatchOf(row?.color)}" style="${lit ? `background:${css(row.color)}` : ""}"></span>${esc(slotNamed(slot))}${marks.lightingSlots.has(slot.id) ? draftDot(model?.draft) : ""}`),
            `<span class="muted">${esc(!row ? "not reported" : paintsCell(row.color, row.locality))}</span>`,
        ], {data: {slot: slot.id}, quiet: !slot.kind});
    };
    const list = groupedTable({scroll: "pd", draft: model?.draft, columns: [["Pointing mode", "52%"], ["Paints", "48%"]], groups: [
        {id: "inUse", title: vocabulary(model).lightingLists.inUse, ...lightingGroup("pd:inUse"), rows: bank.shown.map(slotRow)},
        ...(bank.revealed.length ? [{id: "empty", title: EMPTY_SLOTS_TITLE, tip: EMPTY_SLOTS_TIP, open: allSlotsShown("lighting-pointing"), rows: bank.revealed.map(slotRow),
            toggle: () => { toggleAllSlots("lighting-pointing"); render(); }}] : []),
    ]});
    attachPickRows(list, (slot) => { state.pointingSlot = Number(slot); render(); });
    const row = pdColourRow(model, state.pointingSlot);
    const name = slotName(model, state.pointingSlot);
    const head = itemHead(pickedMarked(model, "pd", name),
        row ? paintsLine(row.color, localityWhole(row.locality)) : "Not reported");
    const colour = section(vocabulary(model).lightingFields.colour);
    colour.append(colourControl(model, {
        colour: row?.color, canEdit, title: `${name} while active`,
        ...offWording(model, "pd"),
        onChange: (next) => { if (row) post(edits.pdModeColour(POINTING_MODE_IDS[state.pointingSlot], row.locality, next)); },
    }));
    const where = section("Where it paints", localityInfo(model, "pd"));
    where.append(stack(localityField(model, {f: `lighting:pointing:${state.pointingSlot}:locality`, value: row?.locality, canEdit,
        onChange: (locality) => { if (row) post(edits.pdModeColour(POINTING_MODE_IDS[state.pointingSlot], locality, row.color)); }})));
    return stageSurface(model, {id: "pd", first: list, head, colour, side: where, accents: accentsSection(model, "pd"),
        note: "Each mode's colour, place and accents are its own."});
}
