// @ts-check
// Pointing modes: the device-owned slots, eight or 32 as the firmware has them.
// Each one re-reads the trackball as scrolling or as directional keys while its
// key is held or toggled.
//
// The surface leads with what the mode is — name, movement, speed, actions —
// and keeps thresholds, ratios and button overrides under Advanced, where they
// belong for the once-a-year visit.

// Selector assertions refer to elements created by this module's authored markup.
import {el, esc} from "../lib/dom.mjs";
import {KIND} from "../view/pointing-config.mjs";
import {bindingsForSlot} from "../view/reach.mjs";
import {getModel, render, state, canEdit as canEditArea} from "../store.mjs";
import {slotLight} from "./marks.mjs";
import {word} from "../view/vocabulary.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {topbar, unavailable} from "./shell.mjs";
import {axisLabel, words} from "./pointing/common.mjs";
import {editor} from "./pointing/editor.mjs";
import {emptySlot} from "./pointing/empty-slot.mjs";


// More slots than this, and the empty ones are listed as numbered chips
// under the configured cards, so 32 slots fit beside the editor.
const FULL_CARD_SLOTS = 8;
export function screenPointing() {
    const model = getModel();
    const slots = model?.pdModes || [];
    const canEdit = canEditArea("pointing");

    const main = el(`<div class="main">${topbar(
        "Pointing modes",
        `Hold or toggle a key to make the trackball do something else: scroll, or press arrows and shortcuts as it moves. Up to ${slots.length || 32} modes.`
    )}</div>`);
    const content = el(`<div class="content"><div class="pad pd-page"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);

    if (!model || !slots.length) {
        pad.classList.remove("pd-page");
        pad.appendChild(el(`<div class="screen-stub"><h3>No pointing modes read</h3>
            <p class="note">${esc(unavailable(model) || "Choose Read keyboard to load this keyboard's pointing modes.")}</p></div>`));
        main.appendChild(content);
        return main;
    }

    const compact = slots.length > FULL_CARD_SLOTS;
    const list = el(`<nav class="pd-slots ${compact ? "many" : ""}" aria-label="Pointing slots"></nav>`);
    const changedSlots = draftMarks(model?.draft?.changes).pointing;
    /** @param {import("./surface-types.js").PresentedSlot} slot */
    const pick = (slot) => { state.pdSlot = slot.id; state.pdKind = null; state.pdButtons = null; state.pdTaps = null; render(); };
    for (const slot of slots) {
        if (compact && !slot.kind) continue;
        const {swatch} = slotLight(model, slot);
        const bindings = !slot.kind ? bindingsForSlot(model, slot) : null;
        const inert = bindings ? bindings.keys.length + bindings.behaviours.length + bindings.combos.length : 0;
        const card = el(`<button class="slotcard ${slot.kind ? "" : "empty"}" data-slot="${esc(slot.id)}" aria-current="${state.pdSlot === slot.id}">
            ${swatch()}
            <span class="nm">${slot.kind ? esc(slot.name) : "Empty slot"}</span><span class="no">${changedSlots.has(slot.id) ? draftDot("Changed in your draft", "lead") : ""}${esc(slot.id)}</span>
            <span class="meta">${slot.kind === KIND.SCROLLING ? `Scrolling${slot.axis ? ` · ${esc(word(words(model).scrollAxes, slot.axis))}` : ""}` : slot.kind === KIND.DIRECTIONAL ? `Directional · ${esc(axisLabel(model, slot.axis))}` : "Available"}</span>
            ${inert ? `<span class="meta warn">${inert} action${inert === 1 ? "" : "s"} reach it · inert</span>` : ""}</button>`);
        card.addEventListener("click", () => pick(slot));
        list.append(card);
    }
    if (compact) list.append(emptyChips(model, slots.filter((slot) => !slot.kind), changedSlots, pick));
    pad.appendChild(list);

    const slot = slots.find((row) => row.id === state.pdSlot) || slots[0];
    pad.appendChild(slot.kind ? editor(model, slot, canEdit, slots) : emptySlot(model, slot, canEdit, slots));
    main.appendChild(content);
    return main;
}

// The empty slots of a keyboard with many, as one grid of numbered chips: the
// slot to fill next is a click away without 24 cards saying "Empty slot". A
// chip marks a draft change, and a slot that keys still reach, as its card would.
/** @param {import("../../contracts/panel.js").PublishedModel} model @param {import("./surface-types.js").PresentedSlot[]} empties @param {ReadonlySet<number>} changedSlots @param {(slot: import("./surface-types.js").PresentedSlot) => void} pick */
function emptyChips(model, empties, changedSlots, pick) {
    const node = el(`<div class="pd-empties"><div class="pd-empties-h">Empty slots · ${empties.length}</div><div class="pd-chips"></div></div>`);
    const grid = /** @type {HTMLElement} */ (node.querySelector(".pd-chips"));
    for (const slot of empties) {
        const {keys, behaviours, combos} = bindingsForSlot(model, slot);
        const inert = keys.length + behaviours.length + combos.length;
        const tip = `Slot ${slot.id} · empty${inert ? ` · ${inert} action${inert === 1 ? "" : "s"} reach it` : ""}`;
        const chip = el(`<button class="slotchip ${inert ? "warn" : ""}" data-slot="${esc(slot.id)}" aria-current="${state.pdSlot === slot.id}"
            aria-label="${esc(tip)}" data-tip="${esc(tip)}">${esc(slot.id)}${changedSlots.has(slot.id) ? draftDot("Changed in your draft", "corner") : ""}</button>`);
        chip.addEventListener("click", () => pick(slot));
        grid.append(chip);
    }
    return node;
}

// A binding for an empty slot is allowed by the keyboard, so the interface
// explains the consequence instead of the app refusing the edit.
