// @ts-check
// An empty slot's card: it starts a mode by step 1 of a mode, Scroll or Send
// keys, drawn where a mode draws it, or copies a mode already made.
import {el, esc} from "../../lib/dom.mjs";
import {newMode, scrollStarter} from "../../view/pointing-config.mjs";
import {whatReachesSlot} from "../../view/pointing-reach.mjs";
import {post} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import * as edits from "../../view/edits.mjs";
import {actionMarked, mark} from "../marks.mjs";
import {listed} from "../../view/vocabulary.mjs";
import {movementChoice} from "./movement-choice.mjs";
import {placeButton} from "./keys-and-light.mjs";
import {titleText} from "../title-name.mjs";
import {step} from "./step.mjs";

// A key for an empty slot is allowed by the keyboard, so the card explains
// the consequence instead of the app refusing the edit.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot */
function inertNote(model, slot) {
    const {keys, behaviours, combos, layers} = whatReachesSlot(model, slot);
    if (!keys.length && !behaviours.length && !combos.length) return "";
    const parts = [];
    if (keys.length) parts.push(`${keys.length} key${keys.length === 1 ? "" : "s"} on ${esc(layers.join(", "))}`);
    if (behaviours.length) parts.push(`${behaviours.length} behaviour${behaviours.length === 1 ? "" : "s"} (${behaviours.map((row) => actionMarked(model, row.keycode)).join(", ")})`);
    if (combos.length) parts.push(`${combos.length} combo output${combos.length === 1 ? "" : "s"} (${esc(combos.map((row) => row.badge).join(", "))})`);
    const one = keys.length + behaviours.length + combos.length === 1;
    return `<div class="unavailable">${listed(parts)} still ${one ? "reaches" : "reach"} this slot. The keyboard refuses to activate an empty slot, so ${one ? "it does" : "they do"} nothing until it holds a mode — ${one ? "it does" : "they do"} not need to be removed first.</div>`;
}

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {import("../surface-types.js").PresentedSlot[]} slots */
export function emptySlot(model, slot, slots) {
    const gate = editGate(model, "pointing"), canEdit = gate.editable;
    const sources = slots.filter((row) => row.kind);
    const node = el(`<div class="pd-editor stack" data-pd-editor="${esc(slot.id)}"><div class="card">
        <div class="card-h name-titlebar"><span class="mark-lg">${mark(model, {kind: "pointing", slot: slot.id})}</span>${titleText("New pointing mode")}
            <span class="tag">Slot ${esc(slot.id)}</span><span class="right row actions"></span></div>
        <div class="card-b pd-steps"></div></div></div>`);
    // Step 1 of a mode, where a mode has it, so the choice stays put once made.
    const first = step(/** @type {HTMLElement} */ (node.querySelector(".pd-steps")), slot.id, 1, "What the ball does", "Nothing is stored here yet.");
    first.append(el(`<div class="stack"><div data-kinds></div>
        ${inertNote(model, slot)}
        ${sources.length ? `<div class="pd-copy"><label class="field"><span>Or copy a mode</span><select class="input" data-f="pointing:${esc(slot.id)}:copy" data-source ${canEdit ? "" : "disabled"}>
            ${sources.map((row) => `<option value="${esc(row.id)}">${esc(row.name)} · slot ${esc(row.id)}</option>`).join("")}</select></label>
            <button class="btn" data-act="copy" ${canEdit ? "" : "disabled"}>Copy into this slot</button></div>`
            : ""}
        ${canEdit || gate.quiet ? "" : `<div class="unavailable">${esc(gate.why || "This slot cannot be edited right now.")}</div>`}
    </div>`));
    /** @type {HTMLElement} */ (node.querySelector(".right")).append(placeButton(slot, editGate(model, "keys").editable));
    /** @type {HTMLElement} */ (node.querySelector("[data-kinds]")).replaceWith(movementChoice(model, slot.id, null, {disabled: !canEdit,
        pick: (kind) => post(edits.pdMode(slot.id, newMode(slot, kind, scrollStarter(slots)), model.profileIdentity))}));
    // Copying fills the slot, so it waits for its button, as making a mode does.
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="copy"]'))?.addEventListener("click", () => {
        const source = /** @type {HTMLSelectElement} */ (node.querySelector("[data-source]")).value;
        post(edits.duplicatePdMode(slot.id, Number(source), model.profileIdentity));
    });
    return node;
}
