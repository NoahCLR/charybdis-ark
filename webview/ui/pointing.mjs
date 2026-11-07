// @ts-check
// Pointing modes: the device-owned slots, eight or 32 as the firmware has them.
// Each one re-reads the trackball as scrolling or as directional keys while its
// key is held or toggled, or while one of its linked layers is on.
//
// Laid out as Macros and Custom keys are: a bank of slots on the left, the
// modes in use first, then + New mode and the empty slots folded behind Show
// all, with a search by name or slot number through every slot; the open
// slot's editor on the right (pointing/editor.mjs).

// Selector assertions refer to elements created by this module's authored markup.
import {el, esc} from "../lib/dom.mjs";
import {whatReachesSlot} from "../view/pointing-reach.mjs";
import {getModel, render, state} from "../store.mjs";
import {editGate} from "../view/edit-gate.mjs";
import {slotBank} from "../view/slot-bank.mjs";
import {slotLight} from "./marks.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {word} from "../view/vocabulary.mjs";
import {topbar} from "./frame.mjs";
import {allSlotsShown, slotBankControls} from "./slot-bank.mjs";
import {words} from "./pointing/common.mjs";
import {editor} from "./pointing/editor.mjs";
import {emptySlot} from "./pointing/empty-slot.mjs";

export function screenPointing() {
    const model = getModel();
    const slots = model?.pdModes || [];
    const gate = editGate(model, "pointing");

    const main = el(`<div class="main">${topbar(
        "Pointing modes",
        "Hold or lock a key to make the trackball scroll or press keys."
    )}</div>`);
    const content = el(`<div class="content"><div class="pad library pointing-library"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);

    if (!model || !slots.length) {
        pad.classList.remove("library");
        pad.appendChild(el(`<div class="screen-stub"><h3>No pointing modes read</h3>
            <p class="note">${esc(gate.why || "Choose Read keyboard to read this keyboard's pointing modes.")}</p></div>`));
        main.appendChild(content);
        return main;
    }

    const slot = slots.find((row) => row.id === state.pointingSlot) || slots.find((row) => row.kind) || slots[0];
    const changed = draftMarks(model?.draft?.changes).pointing;
    const used = slots.filter((row) => row.kind).length;
    const bank = el(`<div class="card"><div class="card-h"><h3>Modes</h3>
        <input class="input search card-search" id="pointingSearch" data-f="pointing:search" type="search" aria-label="Search pointing modes by name" placeholder="Search by name" value="${esc(state.pointingSearch || "")}">
        <span class="tag">${used} of ${slots.length} used</span></div>
        <div class="card-b"><div class="macro-grid pointing-grid" role="list" aria-label="Pointing slots"></div></div></div>`);
    /** @type {HTMLInputElement} */ (bank.querySelector("#pointingSearch")).addEventListener("input", (event) => { state.pointingSearch = /** @type {HTMLInputElement} */ (event.target).value; render(); });
    const grid = /** @type {HTMLElement} */ (bank.querySelector(".pointing-grid"));
    const query = (state.pointingSearch || "").trim().toLowerCase();
    /** @param {import("./surface-types.js").PresentedSlot} row */
    const matches = (row) => !query || Boolean(row.kind && row.name.toLowerCase().includes(query)) || String(row.id) === query;
    if (!slots.some(matches)) grid.replaceWith(el(`<p class="note">No pointing mode is named “${esc(query)}”.</p>`));
    const shelf = slotBank(slots, {
        inUse: (row) => Boolean(row.kind),
        free: (row) => !row.kind,
        keep: (row) => row.id === slot.id || changed.has(row.id),
        matches, searching: Boolean(query), open: allSlotsShown("pointing"),
    });
    /** @param {import("./surface-types.js").PresentedSlot} row */
    const tile = (row) => {
        const reaching = !row.kind ? whatReachesSlot(model, row) : null;
        const inert = reaching ? reaching.keys.length + reaching.behaviours.length + reaching.combos.length : 0;
        const kind = row.kind ? word(words(model).kinds, row.kind) : "";
        const tip = row.kind ? `Slot ${row.id} · ${row.name} · ${kind}` : `Slot ${row.id} · empty${inert ? ` · ${inert} action${inert === 1 ? "" : "s"} still reach it` : ""}`;
        const cell = el(`<button class="mslot pd-tile ${row.kind ? "filled" : ""} ${inert ? "warn" : ""}" data-slot="${esc(row.id)}" role="listitem"
            aria-current="${row.id === slot.id}" aria-label="${esc(tip)}" data-tip="${esc(tip)}">
            ${changed.has(row.id) ? draftDot(model?.draft, "corner") : ""}
            <span class="pd-tile-top">${row.kind ? slotLight(model, row).swatch() : ""}<span class="n">${esc(row.id)}</span></span>
            <span class="v">${row.kind ? esc(row.name) : "—"}</span></button>`);
        cell.addEventListener("click", () => { state.pointingSlot = row.id; state.pdKind = null; state.pdTaps = null; render(); });
        return cell;
    };
    grid.append(...shelf.shown.map(tile));
    if (!query) {
        const {add, toggle} = slotBankControls("pointing", {noun: "mode", count: slots.length, free: Boolean(shelf.firstFree), canEdit: gate.editable,
            pick: () => { state.pointingSlot = shelf.firstFree?.id ?? state.pointingSlot; state.pdKind = null; }});
        grid.append(add, toggle, ...shelf.revealed.map(tile));
    }
    pad.appendChild(bank);
    pad.appendChild(slot.kind ? editor(model, slot, gate.editable, slots) : emptySlot(model, slot, slots));
    main.appendChild(content);
    return main;
}
