// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {css, isOff} from "../../lib/colour.mjs";
import {post, render, state, writable} from "../../store.mjs";
import {PD_MODE_IDS, blackConsequence, pdColourRow} from "../../view/lighting.mjs";
import {slotCalled as slotName, vocabulary} from "../../view/vocabulary.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import * as edits from "../../view/edits.mjs";
import {colourControl, localityLabel, section, stack} from "./common.mjs";
import {groupRowsTable} from "./led-rows.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stagePointing(model) {
    const node = el(`<div></div>`);
    const canEdit = writable();
    const marks = draftMarks(model?.draft?.changes);

    node.className = "tab-split";
    // Past eight slots the list scrolls on its own beside the editor.
    const list = el(`<aside class="rowlist compact ${(model.pdModes || []).length > 8 ? "many" : ""}" data-scroll-list="pd"><div class="rowlist-h">Trackball modes</div></aside>`);
    (model.pdModes || []).forEach((slot) => {
        const row = pdColourRow(model, slot.id);
        const lit = row && !isOff(row.color);
        const item = el(`<button class="rowitem ${slot.id === state.pdSlot ? "on" : ""} ${slot.kind ? "" : "quiet"}" data-slot="${slot.id}">
            <span class="t"><span class="mk-swatch lead ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.color)}` : ""}"></span>${esc(slot.displayName || `Mode ${slot.id}`)}${marks.lightingSlots.has(slot.id) ? draftDot() : ""}</span>
            <span class="m">${esc(!row ? "not reported" : `${lit ? "" : "black · "}${localityLabel(row.locality).toLowerCase()}`)}</span></button>`);
        item.addEventListener("click", () => { state.pdSlot = slot.id; render(); });
        list.append(item);
    });
    const row = pdColourRow(model, state.pdSlot);
    const main = el(`<div class="tab-grid two stage-detail"></div>`);
    const colour = section(`${slotName(model, state.pdSlot)} colour`);
    colour.append(colourControl(model, {
        colour: row?.color, canEdit, title: `${slotName(model, state.pdSlot)} while active`,
        black: blackConsequence(`While ${slotName(model, state.pdSlot)} runs`, row ? localityLabel(row.locality) : ""),
        onChange: (next) => { if (row) post(edits.pdModeColour(PD_MODE_IDS[state.pdSlot], row.locality, next)); },
    }));
    const where = section("Where it lights");
    const locality = el(`<label class="field"><span>Where it lights</span>
        <select data-f="lighting:pointing:${state.pdSlot}:locality" class="input" ${canEdit ? "" : "disabled"}
            data-tip="Where the mode's colour paints while it runs. The trigger-key choices follow the key that started the mode.">
        ${vocabulary(model).localities.map(([id, text]) => `<option value="${id}" ${row?.locality === id ? "selected" : ""}>${text}</option>`).join("")}</select></label>`);
    /** @type {HTMLSelectElement} */ (locality.querySelector("select")).addEventListener("change", (event) =>
        { if (row) post(edits.pdModeColour(PD_MODE_IDS[state.pdSlot], /** @type {HTMLSelectElement} */ (event.target).value, row.color)); });
    // A view state, not a stored one: a pressed toggle.
    const previewSwitch = el(`<button class="btn compact toggle self-start" data-act="pd-preview" aria-pressed="${state.pdPreview}"
        data-tip="Show the board as it looks while this mode runs, started from its first placed key.">Show it running on the board</button>`);
    previewSwitch.addEventListener("click", () => { state.pdPreview = !state.pdPreview; render(); });
    where.append(stack(locality, previewSwitch));
    const note = section("What this stage does");
    note.className = "span";
    note.append(el(`<p class="note stage-about">A trackball mode's colour is an overlay that exists only while the mode is held or locked. It replaces whatever the layers paint where it lights for as long as the mode runs. Black paints those LEDs dark; to show nothing, turn off Show this stage.</p>`));
    note.append(groupRowsTable(model.rgb.pdModeLedGroups, "pdMode"));
    main.append(colour, where, note);
    node.append(list, main);
    return node;
}
