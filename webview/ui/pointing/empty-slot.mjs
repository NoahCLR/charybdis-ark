// @ts-check
// An empty trackball slot: start from a template (the modes the firmware
// ships, plus Back / Forward and Tabs), or start empty — a blank directional
// or scrolling mode, or a copy of a configured one. Every choice posts one
// ordinary draft edit.
import {DISCLOSURE, el, esc} from "../../lib/dom.mjs";
import {KIND, newMode, scrollStarter} from "../../view/pointing-config.mjs";
import {bindingsForSlot} from "../../view/reach.mjs";
import {reachLine} from "../../view/trackball.mjs";
import {TEMPLATES, templateMode} from "../../view/trackball.mjs";
import {post, state} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";
import {unavailable} from "../shell.mjs";
import {slotLight} from "../marks.mjs";
import {bindingName} from "./common.mjs";
import {keycodeAside} from "../../view/show-keycodes.mjs";

// A binding for an empty slot is allowed by the keyboard, so the interface
// explains the consequence instead of the app refusing the edit.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot */
function inertNote(model, slot) {
    const bindings = bindingsForSlot(model, slot);
    if (!bindings.keys.length && !bindings.behaviours.length && !bindings.combos.length) return "";
    return `<div class="unavailable">Still reached from ${esc(reachLine(bindings))}. The keyboard refuses to run an empty slot, so they do nothing until it holds a mode — they do not need to be removed first.</div>`;
}

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit @param {import("../surface-types.js").PresentedSlot[]} slots */
export function emptySlot(model, slot, canEdit, slots) {
    const sources = slots.filter((row) => row.kind);
    const disabled = canEdit ? "" : "disabled";
    const code = keycodeAside(state, "behaviourTitle", bindingName(slot));
    const node = el(`<div class="pd-editor stack"><div class="card">
        <div class="card-h">${slotLight(model, slot).swatch("lg")}<h3>P${slot.id} is empty</h3>
            ${code ? `<span class="tag">${esc(code)}</span>` : ""}</div>
        <div class="card-b stack">
        <p class="note pd-empty-note">Start from one of these, then change what you need. Each is an ordinary edit in your draft.</p>
        ${inertNote(model, slot)}
        <div class="pd-templates">${TEMPLATES.map((template) => `<button class="btn" data-template="${esc(template.id)}" data-tip="${esc(template.tip)}" ${disabled}>${esc(template.label)}</button>`).join("")}</div>
        <details class="pd-start-empty" ${state.pdStartEmpty ? "open" : ""}><summary>${DISCLOSURE}<span>Start empty…</span></summary>
            <div class="stack pd-start-empty-b">
            <div class="row gap-8">
                <button class="btn" data-new="${KIND.DIRECTIONAL}" ${disabled}
                    data-tip="Arrow-style keys or shortcuts, starting on the dominant axis with no shortcuts set.">New directional mode</button>
                <button class="btn" data-new="${KIND.SCROLLING}" ${disabled}
                    data-tip="Scrolling, starting from this keyboard's Dragscroll: its speed, direction and tuning.">New scrolling mode</button></div>
            ${sources.length ? `<div class="pd-copy">
                <label class="field"><span>Copy from</span><select class="input" data-f="pointing:${slot.id}:copy" data-source ${disabled}>
                    ${sources.map((row) => `<option value="${row.id}">P${row.id} · ${esc(row.name)}</option>`).join("")}</select></label>
                <button class="btn" data-act="duplicate" ${disabled}>Duplicate into this slot</button></div>`
                : ""}
            </div></details>
        ${canEdit || model?.draft?.busy ? "" : `<div class="unavailable">${esc(unavailable(model) || "This slot cannot be edited right now.")}</div>`}
    </div></div></div>`);
    const starter = scrollStarter(slots);
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-template]")).forEach((button) => button.addEventListener("click", () =>
        post(edits.pdMode(slot.id, templateMode(slot, String(button.dataset.template), starter), model.profileIdentity))));
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-new]")).forEach((button) => button.addEventListener("click", () =>
        post(edits.pdMode(slot.id, newMode(slot, Number(button.dataset.new), starter), model.profileIdentity))));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="duplicate"]'))?.addEventListener("click", () =>
        post(edits.duplicatePdMode(slot.id, Number(/** @type {HTMLSelectElement} */ (node.querySelector("[data-source]")).value), model.profileIdentity)));
    const fold = /** @type {HTMLDetailsElement} */ (node.querySelector(".pd-start-empty"));
    fold.addEventListener("toggle", () => { state.pdStartEmpty = fold.open; });
    return node;
}
