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
// block of macro memory; the host says which still have room.
//
// The preview parses the payload for reading; the host parses it again for
// real when the slot is staged, and says so if it disagrees.

import {el, esc} from "../lib/dom.mjs";
import {macroMatches, macroPeekSteps} from "../view/macro.mjs";
import {readMacro} from "../view/macro-cache.mjs";
import {canEdit as canEditArea, getModel, render, state} from "../store.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {vocabulary} from "../view/vocabulary.mjs";
import {topbar, unavailable} from "./shell.mjs";
import {editor} from "./macros/editor.mjs";
export {receiveMacroValidation} from "./macros/validation.mjs";

export function screenMacros() {
    const model = getModel();
    const bank = model?.viaMacros || [];
    const memory = model?.macroBank;
    const slot = bank.find((row) => row.keycode === state.macroSlot) || bank[0];
    const canEdit = canEditArea("macros") && slot?.available !== false;

    const main = el(`<div class="main">${topbar(
        "Macros",
        "Macro slots on the keyboard. A named macro shows by its name on keys, in the picker and in the key card.",
        bank.length ? `<input class="input search" id="macroSearch" data-f="macros:search" type="search" placeholder="Search macros by name" value="${esc(state.macroSearch || "")}">` : "",
    )}</div>`);
    /** @type {HTMLInputElement | null} */ (main.querySelector("#macroSearch"))?.addEventListener("input", (event) => { state.macroSearch = /** @type {HTMLInputElement} */ (event.target).value; render(); });

    const content = el(`<div class="content"><div class="pad library"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    if (!bank.length) {
        pad.classList.remove("library");
        pad.appendChild(el(`<div class="screen-stub"><h3>No macro banks read</h3>
            <p class="note">${esc(unavailable(model) || "This firmware has not reported its macro banks.")}</p></div>`));
        main.appendChild(content);
        return main;
    }

    const filled = bank.filter((row) => !row.empty).length;
    const available = memory?.available ?? bank.length;
    const grid = el(`<div class="card"><div class="card-h"><h3>Slots</h3>
        <span class="right tag" data-tip="${filled} filled">${available} of ${bank.length} available</span></div>
        <div class="card-b"><div class="macro-grid"></div>${memoryMeter(memory)}</div></div>`);
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
        const tip = out ? `Slot ${index} · no room: the free macro memory is kept for the lower empty slots. Shorten or clear a macro to open it.`
            : row.empty ? `Slot ${index} · empty` : `Slot ${index} · ${steps.length} step${steps.length === 1 ? "" : "s"}${memory?.programMax === null ? "" : ` · ${row.program} of ${memory?.programMax ?? 512} bytes to play`} · ${row.payload}`;
        const cell = el(`<button class="mslot ${row.empty ? "" : "filled"} ${out ? "out" : ""} ${row.playable === false ? "warn" : ""}" data-slot="${esc(row.keycode)}"
            aria-current="${row.keycode === slot?.keycode}" ${out ? "disabled" : ""} data-tip="${esc(tip)}">
            <span class="n">M${index}</span>${changedMacros.has(row.keycode) ? draftDot("Changed in your draft", "corner") : ""}
            <span class="v">${row.needsUnicodeSetup ? vocabulary(model).macroPlayback?.setup : row.playable === false ? (row.playbackCode === "MACRO_TOO_LONG" ? vocabulary(model).macroPlayback?.tooLong : vocabulary(model).macroPlayback?.blocked) : row.name ? esc(row.name.length > 13 ? `${row.name.slice(0, 12)}…` : row.name) : row.empty ? (out ? vocabulary(model).macroPlayback?.noRoom : "—") : esc(peek.length > 13 ? `${peek.slice(0, 12)}…` : peek)}</span></button>`);
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
    const closed = memory.slots - memory.available;
    return `<div class="sect-h memory-h"><h4>Macro memory</h4>
            <span class="right note">${used.toLocaleString("en-US")} of ${memory.capacity.toLocaleString("en-US")} bytes used · ${memory.free.toLocaleString("en-US")} free</span></div>
        <div class="meter"><i style="width:${share}%"></i></div>
        <p class="note meter-note">A key tap takes 3 bytes; text uses its UTF-8 bytes. Every empty slot keeps room for ${memory.reserveTaps} key taps${closed ? `; ${closed} slot${closed === 1 ? " has" : "s have"} no room left` : ""}.</p>`;
}
