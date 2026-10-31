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
import {macroMatches, macroPeekSteps} from "../view/macro.mjs";
import {readMacro} from "../view/macro-cache.mjs";
import {getModel, render, state} from "../store.mjs";
import {editGate} from "../view/edit-gate.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {vocabulary} from "../view/vocabulary.mjs";
import {topbar} from "./frame.mjs";
import {editor} from "./macros/editor.mjs";

export function screenMacros() {
    const model = getModel();
    const bank = model?.macros || [];
    const memory = model?.macroBank;
    const slot = bank.find((row) => row.keycode === state.macroSlot) || bank[0];
    const gate = editGate(model, "macros"), canEdit = gate.editable && slot?.available !== false;

    const main = el(`<div class="main">${topbar(
        "Macros",
        "Text and key sequences one key can type. A macro you name shows by that name on the board and in the picker.",
    )}</div>`);

    const content = el(`<div class="content"><div class="pad library macros-library"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    if (!bank.length) {
        pad.classList.remove("library");
        pad.appendChild(el(`<div class="screen-stub"><h3>No macro banks read</h3>
            <p class="note">${esc(gate.why || "Choose Read keyboard to read this keyboard's macros.")}</p></div>`));
        main.appendChild(content);
        return main;
    }

    // Counted as Custom keys counts its keys: how many are in use. A slot
    // without room in macro memory is counted only when there is one.
    const filled = bank.filter((row) => !row.empty).length;
    const available = memory?.available ?? bank.length;
    const grid = el(`<div class="card"><div class="card-h"><h3>Slots</h3>
        <input class="input search card-search" id="macroSearch" data-f="macros:search" type="search" placeholder="Search by name" value="${esc(state.macroSearch || "")}">
        <span class="tag" data-tip="${esc(available)} of ${bank.length} slots have room in macro memory">${filled} of ${bank.length} used${available < bank.length ? ` · ${bank.length - available} without room` : ""}</span></div>
        <div class="card-b"><div class="macro-grid"></div>${memoryMeter(memory)}</div></div>`);
    /** @type {HTMLInputElement} */ (grid.querySelector("#macroSearch")).addEventListener("input", (event) => { state.macroSearch = /** @type {HTMLInputElement} */ (event.target).value; render(); });
    const cells = /** @type {HTMLElement} */ (grid.querySelector(".macro-grid"));
    const query = state.macroSearch || "";
    if (!bank.some((row) => macroMatches(row, query))) {
        cells.replaceWith(el(`<p class="note">No macro is named “${esc(query.trim())}”.</p>`));
    }
    const changedMacros = draftMarks(model?.draft?.changes).macros;
    bank.forEach((row, index) => {
        if (!macroMatches(row, query)) return;
        const {steps} = readMacro(model, row.keycode, row.payload, "grid");
        const peek = macroPeekSteps(readMacro(model, row.keycode, row.payload, "peek").steps, (name) => model?.qmkKeyLabels?.[name] || name);
        const out = row.available === false;
        const tip = out ? `Slot ${index} · unavailable: macro memory keeps its free room for the lower empty slots. Shorten or clear a macro to make it available.`
            : row.empty ? `Slot ${index} · empty` : `Slot ${index} · ${steps.length} step${steps.length === 1 ? "" : "s"} · ${row.payload}`;
        const cell = el(`<button class="mslot ${row.empty ? "" : "filled"} ${out ? "out" : ""} ${row.playable === false ? "warn" : ""}" data-slot="${esc(row.keycode)}"
            aria-current="${row.keycode === slot?.keycode}" ${out ? "disabled" : ""} data-tip="${esc(tip)}">
            <span class="n">M${index}</span>${changedMacros.has(row.keycode) ? draftDot("Changed in your draft", "corner") : ""}
            <span class="v">${row.needsUnicodeSetup ? esc(vocabulary(model).macroPlayback?.setup) : row.playable === false ? esc(vocabulary(model).macroPlayback?.blocked) : row.name ? esc(row.name.length > 13 ? `${row.name.slice(0, 12)}…` : row.name) : row.empty ? (out ? esc(vocabulary(model).macroPlayback?.unavailable) : "—") : esc(peek.length > 13 ? `${peek.slice(0, 12)}…` : peek)}</span></button>`);
        cell.addEventListener("click", () => { state.macroSlot = row.keycode; render(); });
        cells.append(cell);
    });
    pad.appendChild(grid);
    pad.appendChild(slot ? editor(/** @type {import("../../contracts/panel.js").PublishedModel} */ (model), slot, canEdit) : el(`<div class="empty-card"><p class="note">Pick a slot.</p></div>`));
    main.appendChild(content);
    return main;
}

// All slots share one block of macro memory. Each empty slot keeps room for
// a few key taps; when that runs out the highest empty slots close.
/** @param {import("../../contracts/panel.js").PublishedModel["macroBank"] | undefined} memory */
function memoryMeter(memory) {
    if (!memory) return "";
    const used = memory.stored, share = Math.min(100, (used / memory.capacity) * 100);
    const unavailable = memory.slots - memory.available;
    return `<div class="sect-h memory-h"><h4>Macro memory</h4>
            <span class="right note">${esc(used.toLocaleString("en-US"))} of ${esc(memory.capacity.toLocaleString("en-US"))} bytes used · ${esc(memory.free.toLocaleString("en-US"))} free</span></div>
        <div class="meter"><i style="width:${share}%"></i></div>
        <p class="note meter-note">A key tap takes 3 bytes; text uses its UTF-8 bytes. Every empty slot keeps room for ${esc(memory.reserveTaps)} key taps${unavailable ? `; ${esc(unavailable)} slot${unavailable === 1 ? " is" : "s are"} unavailable until there is room again` : ""}.</p>`;
}
