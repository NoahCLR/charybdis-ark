// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {KIND, newMode, scrollStarter} from "../../view/pointing-config.mjs";
import {holdKeyName, whatReachesSlot} from "../../view/reach.mjs";
import {post} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";
import {unavailable} from "../frame.mjs";
import {actionMarked, mark} from "../marks.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot */
function inertNote(model, slot) {
    const {keys, behaviours, combos, layers} = whatReachesSlot(model, slot);
    if (!keys.length && !behaviours.length && !combos.length) return "";
    const parts = [];
    if (keys.length) parts.push(`${keys.length} key${keys.length === 1 ? "" : "s"} on ${esc(layers.join(", "))}`);
    if (behaviours.length) parts.push(`${behaviours.length} behaviour${behaviours.length === 1 ? "" : "s"} (${behaviours.map((row) => actionMarked(model, row.keycode)).join(", ")})`);
    if (combos.length) parts.push(`${combos.length} combo output${combos.length === 1 ? "" : "s"} (${esc(combos.map((row) => row.badge).join(", "))})`);
    return `<div class="unavailable">${parts.join(" and ")} still reach this slot. The keyboard refuses to activate an empty slot, so they do nothing until it is configured — they do not need to be removed first.</div>`;
}

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit @param {import("../surface-types.js").PresentedSlot[]} slots */
export function emptySlot(model, slot, canEdit, slots) {
    const sources = slots.filter((row) => row.kind);
    const node = el(`<div class="pd-editor stack"><div class="card">
        <div class="card-h"><span class="mark-lg">${mark(model, {kind: "pointing", slot: slot.id})}</span><h3>Slot ${esc(slot.id)} is empty</h3>
            <span class="tag">${esc(holdKeyName(slot))}</span></div>
        <div class="card-b stack">
        <p class="note pd-empty-note">Nothing is stored here. Start a new mode, or copy a configured one and change what you need — its hold key is <code>${esc(holdKeyName(slot))}</code>, and <code>${esc(slot.keys?.lock || "")}</code> locks it on.</p>
        ${inertNote(model, slot)}
        <div class="row gap-8">
            <button class="btn primary" data-new="${KIND.DIRECTIONAL}" ${canEdit ? "" : "disabled"}
                data-tip="Arrow-style keys or shortcuts, starting on the dominant axis with no shortcuts set.">New directional mode</button>
            <button class="btn" data-new="${KIND.SCROLLING}" ${canEdit ? "" : "disabled"}
                data-tip="Scrolling, starting from Dragscroll's tuning.">New scrolling mode</button></div>
        ${sources.length ? `<div class="pd-copy">
            <label class="field"><span>Copy from</span><select class="input" data-f="pointing:${esc(slot.id)}:copy" data-source ${canEdit ? "" : "disabled"}>
                ${sources.map((row) => `<option value="${esc(row.id)}">Slot ${esc(row.id)} · ${esc(row.name)}</option>`).join("")}</select></label>
            <button class="btn" data-act="duplicate" ${canEdit ? "" : "disabled"}>Duplicate into this slot</button></div>`
            : ""}
        ${canEdit || model?.draft?.busy ? "" : `<div class="unavailable">${esc(unavailable(model) || "This slot cannot be edited right now.")}</div>`}
    </div></div></div>`);
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-new]")).forEach((button) => button.addEventListener("click", () =>
        post(edits.pdMode(slot.id, newMode(slot, Number(button.dataset.new), scrollStarter(slots)), model.profileIdentity))));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="duplicate"]'))?.addEventListener("click", () =>
        post(edits.duplicatePdMode(slot.id, Number(/** @type {HTMLSelectElement} */ (node.querySelector("[data-source]")).value), model.profileIdentity)));
    return node;
}
