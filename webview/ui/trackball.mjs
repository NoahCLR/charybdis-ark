// @ts-check
// Trackball: everything the ball does, on one screen. The list starts with
// three fixed entries — the pointer's speed, sniping (the slower speed for
// precise work) and the mouse layer moving the ball turns on — then the
// trackball modes a key switches it into, then the empty slots, folded.
//
// The fixed entries are settings the keyboard stores with its global policy:
// they are drawn as Settings' rows and each saves its whole section. The
// modes are the device-owned slots, eight or 32 as the firmware has them.
//
// The screen has two ids: "mouse" opens it on the fixed entry last shown,
// "pointing" on the mode in state.pdSlot, so a link to a mode (Review, Keys,
// Lighting) still lands on that mode.

// Selector assertions refer to elements created by this module's authored markup.
import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {bindingsForSlot} from "../view/reach.mjs";
import {fixedSummaries, reachCount, reachLine, sendsLine} from "../view/trackball.mjs";
import {getModel, render, state, canEdit as canEditArea} from "../store.mjs";
import {slotLight} from "./marks.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {topbar, unavailable} from "./shell.mjs";
import {editor} from "./pointing/editor.mjs";
import {emptySlot} from "./pointing/empty-slot.mjs";
import {fixedEntry, FIXED_ENTRIES} from "./trackball/fixed.mjs";

/** @typedef {import("./surface-types.js").PresentedSlot} PresentedSlot */

// A link that reveals a section of the fixed entries opens the entry that
// draws it.
/** @type {Record<string, "pointer" | "sniping" | "mouseLayer">} */
const ENTRY_OF_SECTION = {normalPointerSpeed: "pointer", sniping: "sniping", autoMouse: "mouseLayer"};

export function screenTrackball() {
    const model = getModel();
    const slots = model?.pdModes || [];
    const sectionRevealed = /data-section="([^"]+)"/.exec(state.reveal || "")?.[1];
    if (sectionRevealed && ENTRY_OF_SECTION[sectionRevealed]) { state.screen = "mouse"; state.tbEntry = ENTRY_OF_SECTION[sectionRevealed]; }
    const entry = state.screen === "pointing" && slots.length ? "mode" : state.tbEntry || "pointer";

    const main = el(`<div class="main">${topbar(
        "Trackball",
        "How the ball moves the pointer, and the modes a key switches it into: scrolling, or arrows and shortcuts as it moves."
    )}</div>`);
    const content = el(`<div class="content"><div class="pad tb-page"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);

    if (!model || (!model.configDefaults?.length && !slots.length)) {
        pad.classList.remove("tb-page");
        pad.appendChild(el(`<div class="screen-stub"><h3>Nothing read from the trackball</h3>
            <p class="note">${esc(unavailable(model) || "Choose Read keyboard to load this keyboard's trackball settings and modes.")}</p></div>`));
        main.appendChild(content);
        return main;
    }

    pad.appendChild(trackballList(model, slots, entry));
    if (entry === "mode") {
        const slot = slots.find((row) => row.id === state.pdSlot) || slots[0];
        const canEdit = canEditArea("pointing");
        pad.appendChild(slot.kind ? editor(model, slot, canEdit, slots) : emptySlot(model, slot, canEdit, slots));
    } else {
        pad.appendChild(fixedEntry(model, entry, slots));
    }
    main.appendChild(content);
    return main;
}

/** @param {import("../../contracts/panel.js").PublishedModel} model @param {PresentedSlot[]} slots @param {string} entry */
function trackballList(model, slots, entry) {
    const list = el(`<nav class="tb-list" aria-label="Trackball"></nav>`);
    const summaries = fixedSummaries(model);
    const settingsChanged = draftMarks(model?.draft?.changes).settings;
    for (const {id, label, sections} of FIXED_ENTRIES) {
        const changed = sections.some((section) => settingsChanged.has(section));
        const button = el(`<button class="slotcard tb-fixed" data-entry="${id}" aria-current="${entry === id}">
            <span class="nm">${esc(label)}</span><span class="no">${changed ? draftDot("Changed in your draft", "lead") : ""}</span>
            <span class="meta">${esc(summaries[id])}</span></button>`);
        button.addEventListener("click", () => { state.screen = "mouse"; state.tbEntry = id; render(); });
        list.append(button);
    }
    if (!slots.length) return list;

    list.append(el(`<div class="eyebrow tb-modes-h">Modes</div>`));
    const changedSlots = draftMarks(model?.draft?.changes).pointing;
    /** @param {PresentedSlot} slot */
    const pick = (slot) => { state.screen = "pointing"; state.pdSlot = slot.id; state.pdKind = null; state.pdButtons = null; state.pdTaps = null; render(); };
    const current = entry === "mode" ? state.pdSlot : -1;
    for (const slot of slots.filter((row) => row.kind)) {
        const {swatch} = slotLight(model, slot);
        const placed = reachLine(bindingsForSlot(model, slot));
        const sends = sendsLine(model, /** @type {import("../../contracts/edits.js").PdSlot} */ (slot));
        const card = el(`<button class="slotcard tb-mode" data-slot="${slot.id}" aria-current="${current === slot.id}" data-tip="${esc(`${sends} · ${placed}`)}">
            ${swatch()}
            <span class="nm">${esc(slot.name)}</span><span class="no">${changedSlots.has(slot.id) ? draftDot("Changed in your draft", "lead") : ""}P${slot.id}</span>
            <span class="meta">${esc(sends)} · <span class="${placed === "Not placed" ? "" : "placed"}">${esc(placed)}</span></span></button>`);
        card.addEventListener("click", () => pick(slot));
        list.append(card);
    }
    const empties = slots.filter((slot) => !slot.kind);
    if (empties.length) {
        const next = empties[0];
        const add = el(`<button class="btn compact tb-new" data-act="new-mode">+ New mode</button>`);
        add.addEventListener("click", () => pick(next));
        list.append(add, emptyChips(model, empties, changedSlots, current, pick));
    }
    return list;
}

// The empty slots, folded into one row of numbered chips: the slot to fill
// next is a click away without a card per slot. A chip marks a draft change,
// and a slot that keys still reach, as a card would.
/** @param {import("../../contracts/panel.js").PublishedModel} model @param {PresentedSlot[]} empties @param {ReadonlySet<number>} changedSlots @param {number} current @param {(slot: PresentedSlot) => void} pick */
function emptyChips(model, empties, changedSlots, current, pick) {
    const open = state.tbEmptiesOpen || empties.some((slot) => slot.id === current);
    const node = /** @type {HTMLDetailsElement} */ (el(`<details class="pd-empties" ${open ? "open" : ""}>
        <summary class="pd-empties-h">${DISCLOSURE}Empty slots · ${empties.length}</summary><div class="pd-chips"></div></details>`));
    node.addEventListener("toggle", () => { state.tbEmptiesOpen = node.open; });
    const grid = /** @type {HTMLElement} */ (node.querySelector(".pd-chips"));
    for (const slot of empties) {
        const inert = reachCount(bindingsForSlot(model, slot));
        const tip = `P${slot.id} · empty${inert ? ` · still reached from ${reachLine(bindingsForSlot(model, slot))}` : ""}`;
        const chip = el(`<button class="slotchip ${inert ? "warn" : ""}" data-slot="${slot.id}" aria-current="${current === slot.id}"
            aria-label="${esc(tip)}" data-tip="${esc(tip)}">P${slot.id}${changedSlots.has(slot.id) ? draftDot("Changed in your draft", "corner") : ""}</button>`);
        chip.addEventListener("click", () => pick(slot));
        grid.append(chip);
    }
    return node;
}
