// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {bindingsForSlot} from "../../view/reach.mjs";
import {stageEnabled} from "../../view/lighting.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import {render, state} from "../../store.mjs";
import {slotLight} from "../marks.mjs";
import {bindingName} from "./common.mjs";
import {keycodeAside} from "../../view/show-keycodes.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit */
export function slotReach(model, slot, canEdit) {
    const light = slotLight(model, slot);
    const disabled = canEdit ? "" : "disabled";
    // ── how it is reached ─────────────────────────────────────────────────
    const {row} = light;
    // The swatch shows the colour; the words say where it paints.
    const lightText = row
        ? `${esc(light.lit || !stageEnabled(model, "pd") ? word(vocabulary(model).localities, row.locality) : "No colour")}${stageEnabled(model, "pd") ? "" : " · stage off"}`
        : "No colour reported";
    const reach = el(`<div class="card">
        <div class="card-h"><h3>How it is reached</h3></div>
        <div class="card-b pd-lines">
            <span class="lbl">Keys</span>
            <div class="val">
                <span class="act"><span class="k">${esc(keycodeAside(state, "reachRow", bindingName(slot)) || slot.displayName || `Mode ${slot.id}`)}</span><span class="how">hold</span></span>
                <span class="act"><span class="k">${esc(keycodeAside(state, "reachRow", slot.binding?.lock || "") || slot.displayName || `Mode ${slot.id}`)}</span><span class="how">lock</span></span>
                <span class="note">${esc(placedOn(model, slot))}</span></div>
            <button class="btn tiny ghost" data-act="place" ${disabled}>Place on a layer…</button>
            <span class="lbl">Light</span>
            <div class="val">${light.swatch()}<span class="note">${lightText}</span></div>
            <button class="btn tiny ghost" data-act="lighting">Edit in Lighting</button>
        </div></div>`);
    /** @type {HTMLButtonElement} */ (reach.querySelector('[data-act="lighting"]')).addEventListener("click", () => {
        state.screen = "lighting"; state.stage = "pd"; render();
    });
    /** @type {HTMLButtonElement} */ (reach.querySelector('[data-act="place"]')).addEventListener("click", () => {
        state.placement = {keycode: bindingName(slot)};
        state.screen = "keys";
        state.tab = "key";
        render();
    });
    return reach;

}

// Counted through the slot's values rather than its names: a layout position
// carries whatever the keyboard calls the keycode, which is a bare user keycode
// or plain hex, not the name this app prints.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot */
function placedOn(model, slot) {
    const counts = new Map();
    for (const {layer} of bindingsForSlot(model, slot).keys) {
        const name = layer.displayName || layer.name;
        counts.set(name, (counts.get(name) || 0) + 1);
    }
    const places = [...counts].map(([name, count]) => `${name} · ${count} key${count === 1 ? "" : "s"}`);
    return places.length ? `on ${places.join(", ")}` : "not placed on any layer";
}
