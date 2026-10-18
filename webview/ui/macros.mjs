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

import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {macroPeekSteps} from "../view/macro.mjs";
import {macroBankList, macroMemoryLine, macroProblem, macrosInUse} from "../view/macro-bank.mjs";
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
        "Text and key sequences one key plays. For one held shortcut, a custom key is simpler.",
    )}</div>`);

    const content = el(`<div class="content"><div class="pad library macros-library"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    if (!bank.length) {
        pad.classList.remove("library");
        pad.appendChild(el(`<div class="screen-stub"><h3>No macro banks read</h3>
            <p class="note">${esc(unavailable(model) || "Choose Read keyboard to load this keyboard's macros.")}</p></div>`));
        main.appendChild(content);
        return main;
    }

    // The list: + New macro, search, the slots in use, the empty ones folded
    // behind their count, then macro memory in one line.
    const query = state.macroSearch || "";
    const {shown, folded, firstFree} = macroBankList(bank, {query, current: slot?.keycode});
    const grid = el(`<div class="card macro-bank"><div class="card-h"><h3>Slots</h3>
        <span class="tag">${macrosInUse(bank)} in use</span>
        <button class="btn bank-new" data-act="new-macro" ${firstFree && canEditArea("macros") ? "" : "disabled"}
            ${firstFree ? "" : 'data-tip="Every slot is in use or has no room in macro memory."'}>+ New macro</button>
        <input class="input search card-search" id="macroSearch" data-f="macros:search" type="search" placeholder="Search by name" value="${esc(query)}"></div>
        <div class="card-b"><div class="bank-scroll"><div class="macro-grid" data-bank-used></div>
            ${folded.length ? `<details class="bank-empties" data-bank-empties ${state.macroEmptyOpen ? "open" : ""}><summary>${DISCLOSURE}Show ${folded.length} empty</summary><div class="macro-grid"></div></details>` : ""}</div>
            ${memoryMeter(memory)}</div></div>`);
    /** @type {HTMLInputElement} */ (grid.querySelector("#macroSearch")).addEventListener("input", (event) => { state.macroSearch = /** @type {HTMLInputElement} */ (event.target).value; render(); });
    /** @type {HTMLButtonElement} */ (grid.querySelector('[data-act="new-macro"]')).addEventListener("click", () => {
        if (!firstFree) return;
        state.macroSlot = firstFree.keycode; state.macroSearch = ""; render();
    });
    const empties = /** @type {HTMLDetailsElement | null} */ (grid.querySelector("[data-bank-empties]"));
    empties?.addEventListener("toggle", () => { if (empties.isConnected) state.macroEmptyOpen = empties.open; });
    const cells = /** @type {HTMLElement} */ (grid.querySelector("[data-bank-used]"));
    if (!shown.length && query.trim()) cells.replaceWith(el(`<p class="note">No macro is named “${esc(query.trim())}”.</p>`));
    const changedMacros = draftMarks(model?.draft?.changes).macros;
    /** @param {{slot: MacroSlot, index: number}} entry */
    const tile = ({slot: row, index}) => {
        const {steps} = readMacro(model, row.keycode, row.payload, "grid");
        const peek = macroPeekSteps(readMacro(model, row.keycode, row.payload, "peek").steps, (name) => model?.qmkKeyLabels?.[name] || name);
        const out = row.available === false;
        const problem = macroProblem(row);
        const tip = out ? `M${index} · unavailable: macro memory keeps its free room for the lower empty slots. Shorten or clear a macro to make it available.`
            : problem ? `M${index} · cannot play: ${problem} Change it in Settings → Your computer, or fix the macro.`
            : row.empty ? `M${index} · empty` : `M${index} · ${steps.length} step${steps.length === 1 ? "" : "s"} · ${row.payload}`;
        const label = row.name || (row.empty ? (out ? vocabulary(model).macroPlayback?.unavailable || "" : "—") : peek);
        const cell = el(`<button class="mslot ${row.empty && !row.name ? "" : "filled"} ${out ? "out" : ""} ${problem ? "warn" : ""}" data-slot="${esc(row.keycode)}"
            aria-current="${row.keycode === slot?.keycode}" ${out ? "disabled" : ""} data-tip="${esc(tip)}">
            <span class="n">M${index}</span>${changedMacros.has(row.keycode) ? draftDot("Changed in your draft", "corner") : ""}${problem ? '<i class="slot-problem" aria-label="Cannot play">!</i>' : ""}
            <span class="v">${esc(label.length > 13 ? `${label.slice(0, 12)}…` : label)}</span></button>`);
        cell.addEventListener("click", () => { state.macroSlot = row.keycode; render(); });
        return cell;
    };
    cells.append(...shown.map(tile));
    /** @type {HTMLElement | null} */ (grid.querySelector("[data-bank-empties] .macro-grid"))?.append(...folded.map(tile));
    pad.appendChild(grid);
    pad.appendChild(slot ? editor(/** @type {import("../../contracts/panel.js").PublishedModel} */ (model), slot, canEdit) : el(`<div class="empty-card"><p class="note">Pick a slot.</p></div>`));
    main.appendChild(content);
    return main;
}

// All slots share one block of macro memory: one line, and Ark's reserve
// sentence only when a slot is short of room or memory is nearly full.
/** @param {import("../../contracts/panel.js").PublishedModel["macroBank"] | undefined} memory */
function memoryMeter(memory) {
    const line = macroMemoryLine(memory);
    if (!line) return "";
    return `<div class="bank-memory"><span class="eyebrow">Macro memory</span><span class="note" data-memory-line>${esc(line.text)}</span></div>
        <div class="meter ${line.level}"><i style="width:${(line.share * 100).toFixed(2)}%"></i></div>
        ${line.note ? `<p class="note meter-note">${esc(line.note)}</p>` : ""}`;
}
