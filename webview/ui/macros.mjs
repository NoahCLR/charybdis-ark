// @ts-check
/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 * @typedef {import("../../contracts/panel.js").MacroSlot} MacroSlot
 * @typedef {import("../view/types.js").MacroStep} MacroStep
 */
// Authored selectors below describe controls in these templates. A name
// input exists only when the model supplies its naming capacity. Inspection
// sizing fields belong only to replies containing a complete inspection.
// Macros: the keyboard's macro slots, edited as literal text and key steps, each
// with an optional name kept in the keyboard's profile. The slots share one
// block of macro memory; the core says which still have room.
//
// The preview parses the payload for reading; the core parses it again for
// real when the slot is staged, and says so if it disagrees.

import {el, esc} from "../lib/dom.mjs";
import {meterFill} from "./meter.mjs";
import {macroMatches, macroPeekSteps} from "../view/macro.mjs";
import {readMacro} from "../view/macro-cache.mjs";
import {keyIdentity} from "../view/key-identity.mjs";
import {getModel, post, render, state} from "../store.mjs";
import {editGate} from "../view/edit-gate.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {vocabulary} from "../view/vocabulary.mjs";
import {topbar} from "./frame.mjs";
import {attachInfoMarks, infoMark} from "./info-mark.mjs";
import {editor} from "./macros/editor.mjs";
import {slotBank} from "../view/slot-bank.mjs";
import {SWAP_TIP, allSlotsShown, slotBankControls, swappable} from "./slot-bank.mjs";
import * as edits from "../view/edits.mjs";

export function screenMacros() {
    const model = getModel();
    const bank = model?.macros || [];
    const memory = model?.macroBank;
    const slot = bank.find((row) => row.keycode === state.macroSlot) || bank[0];
    const gate = editGate(model, "macros"), canEdit = gate.editable && slot?.available !== false;

    const main = el(`<div class="main">${topbar(
        "Macros",
        "Text and key sequences that one key types.",
    )}</div>`);

    const content = el(`<div class="content"><div class="pad library macros-library"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    if (!bank.length) {
        pad.classList.remove("library");
        pad.appendChild(el(`<div class="screen-stub"><h3>No macros read</h3>
            <p class="note">${esc(gate.why || "Choose Read keyboard to read this keyboard's macros.")}</p></div>`));
        main.appendChild(content);
        return main;
    }

    // Counted as Custom keys counts its keys: how many are in use. A slot
    // without room in macro memory is counted only when there is one.
    const filled = bank.filter((row) => !row.empty).length;
    const available = memory?.available ?? bank.length;
    const grid = el(`<div class="card"><div class="card-h"><h3>Macros</h3>
        <input class="input search card-search" id="macroSearch" data-f="macros:search" type="search" aria-label="Search macros by name" placeholder="Search by name" value="${esc(state.macroSearch || "")}">
        <span class="tag" data-tip="${esc(available)} of ${bank.length} slots have room in macro memory">${filled} of ${bank.length} used${available < bank.length ? ` · ${bank.length - available} without room` : ""}</span></div>
        <div class="card-b"><div class="macro-grid"></div>${memoryMeter(memory)}</div></div>`);
    attachInfoMarks(grid);
    /** @type {HTMLInputElement} */ (grid.querySelector("#macroSearch")).addEventListener("input", (event) => { state.macroSearch = /** @type {HTMLInputElement} */ (event.target).value; render(); });
    const cells = /** @type {HTMLElement} */ (grid.querySelector(".macro-grid"));
    const query = state.macroSearch || "";
    if (!bank.some((row) => macroMatches(row, query))) {
        cells.replaceWith(el(`<p class="note">No macro is named “${esc(query.trim())}”.</p>`));
    }
    const changedMacros = draftMarks(model?.draft?.changes).macros;
    // The slots in use first; New and the unused ones after them.
    const shelf = slotBank(bank, {
        inUse: (row) => !row.empty || Boolean(row.name),
        free: (row) => row.empty && !row.name && row.available !== false,
        keep: (row) => row.keycode === slot?.keycode || changedMacros.has(row.keycode),
        matches: (row) => macroMatches(row, query), searching: Boolean(query.trim()), open: allSlotsShown("macros"),
    });
    /** @param {MacroSlot} row */
    const tile = (row) => {
        const index = bank.indexOf(row);
        const {steps} = readMacro(model, row.keycode, row.payload, "grid");
        const peek = macroPeekSteps(readMacro(model, row.keycode, row.payload, "peek").steps, (name) => keyIdentity(model, name).label);
        const out = row.available === false;
        const tip = out ? `Slot ${index} · unavailable: macro memory keeps its free room for the lower empty slots. Shorten or clear a macro to make it available.`
            : row.empty ? `Slot ${index} · empty` : `Slot ${index} · ${steps.length} step${steps.length === 1 ? "" : "s"} · ${row.payload}`;
        const cell = el(`<button class="mslot ${row.empty ? "" : "filled"} ${out ? "out" : ""} ${row.playable === false ? "warn" : ""}" data-slot="${esc(row.keycode)}"
            aria-current="${row.keycode === slot?.keycode}" ${out ? "disabled" : ""} data-tip="${esc(gate.editable && !out ? `${tip} · ${SWAP_TIP}` : tip)}">
            <span class="n">M${index}</span>${changedMacros.has(row.keycode) ? draftDot(model?.draft, "corner") : ""}
            <span class="v">${row.needsUnicodeSetup ? esc(vocabulary(model).macroPlayback?.setup) : row.playable === false ? esc(vocabulary(model).macroPlayback?.blocked) : row.name ? esc(row.name.length > 13 ? `${row.name.slice(0, 12)}…` : row.name) : row.empty ? (out ? esc(vocabulary(model).macroPlayback?.unavailable) : "—") : esc(peek.length > 13 ? `${peek.slice(0, 12)}…` : peek)}</span></button>`);
        cell.addEventListener("click", () => { state.macroSlot = row.keycode; render(); });
        swappable(cell, {bank: "macros", key: row.keycode, canEdit: gate.editable && !out, keyOf: (other) => /** @type {HTMLElement} */ (other).dataset.slot ?? null, onSwap: swapMacros});
        return cell;
    };
    cells.append(...shelf.shown.map(tile));
    if (!query.trim()) {
        const {add, toggle} = slotBankControls("macros", {noun: "macro", count: bank.length, free: Boolean(shelf.firstFree), canEdit: gate.editable,
            pick: () => { state.macroSlot = shelf.firstFree?.keycode ?? state.macroSlot; }});
        cells.append(add, toggle, ...shelf.revealed.map(tile));
    }
    pad.appendChild(grid);
    pad.appendChild(slot ? editor(/** @type {import("../../contracts/panel.js").PublishedModel} */ (model), slot, canEdit) : el(`<div class="empty-card"><p class="note">Pick a slot.</p></div>`));
    main.appendChild(content);
    return main;
}

// Two macro slots trade places (D-L81). The dragged macro is the one open
// afterwards, where it is now; what was typed into either slot's editor but
// not kept goes with its macro, and so does a take being recorded.
/** @param {string} from @param {string} to */
function swapMacros(from, to) {
    post(edits.swapMacros(from, to));
    /** @param {string} keycode */
    const follows = (keycode) => (keycode === from ? to : keycode === to ? from : keycode);
    const forms = {...state.macroForms};
    const [a, b] = [forms[from], forms[to]];
    delete forms[from]; delete forms[to];
    if (a) forms[to] = a;
    if (b) forms[from] = b;
    state.macroForms = forms;
    if (state.recording) state.recording = {...state.recording, slot: follows(state.recording.slot)};
    if (state.lastTake) state.lastTake = {...state.lastTake, slot: follows(state.lastTake.slot)};
    state.macroSlot = to;
    render();
}

// All slots share one block of macro memory. Each empty slot keeps room for
// a few key taps; when that runs out the highest empty slots close.
/** @param {import("../../contracts/panel.js").PublishedModel["macroBank"] | undefined} memory */
function memoryMeter(memory) {
    if (!memory) return "";
    const used = memory.stored, share = Math.min(100, (used / memory.capacity) * 100);
    const unavailable = memory.slots - memory.available;
    // What takes room is its info mark, read once (D-L96); what is free, and
    // the slots without room, are on show.
    const info = infoMark({id: "macro-info-memory", label: "What takes macro memory", heading: "Macro memory", rows: [
        {term: "A key tap", says: "3 bytes."}, {term: "Text", says: "Its UTF-8 bytes; an accented letter takes two or more."},
        {term: "An empty slot", says: `Keeps room for ${memory.reserveTaps} key taps. When memory runs short, the highest empty slots become unavailable until there is room again.`}]});
    return `<div class="sect-h memory-h"><h4>Macro memory</h4>${info}
            <span class="right note">${esc(used.toLocaleString("en-US"))} / ${esc(memory.capacity.toLocaleString("en-US"))} bytes</span></div>
        <div class="meter">${meterFill(share)}</div>
        <p class="note meter-note">${esc(memory.free.toLocaleString("en-US"))} bytes free${unavailable ? `; ${esc(unavailable)} slot${unavailable === 1 ? " is" : "s are"} unavailable until there is room again` : ""}.</p>`;
}
