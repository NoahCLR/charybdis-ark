// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {bindingsForSlot} from "../../view/reach.mjs";
import {stageEnabled} from "../../view/lighting.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import {render, state} from "../../store.mjs";
import {slotLight} from "../marks.mjs";
import {bindingName} from "./common.mjs";

// The keys that start the mode, held or locked, where they sit, and a way
// to place its hold key: the first row of the How it starts card.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit */
export function keysRow(model, slot, canEdit) {
    const row = el(`<div class="pd-lines">
        <span class="lbl">Keys</span>
        <div class="val">
            <span class="act"><span class="k">${esc(bindingName(slot))}</span><span class="how">hold</span></span>
            <span class="act"><span class="k">${esc(slot.binding?.lock || "")}</span><span class="how">lock</span></span>
            <span class="note">${esc(placedOn(model, slot))}</span></div>
        <button class="btn tiny ghost" data-act="place" ${canEdit ? "" : "disabled"}
            data-tip="Put this mode's hold key on a key you pick on the board.">Place on a key…</button>
    </div>`);
    /** @type {HTMLButtonElement} */ (row.querySelector('[data-act="place"]')).addEventListener("click", () => {
        state.placement = {keycode: bindingName(slot)};
        state.screen = "keys";
        state.tab = "key";
        render();
    });
    return row;
}

// The mode's light: its colour and where it paints, with a way to Lighting.
// It belongs with the slot's identity, whose mark already shows the colour.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot */
export function lightRow(model, slot) {
    const light = slotLight(model, slot);
    const {row} = light;
    // The swatch shows the colour; the words say where it paints.
    const lightText = row
        ? `${esc(light.lit || !stageEnabled(model, "pd") ? word(vocabulary(model).localities, row.locality) : "No colour")}${stageEnabled(model, "pd") ? "" : " · stage off"}`
        : "No colour reported";
    const node = el(`<div class="pd-lines pd-light">
        <span class="lbl">Light</span>
        <div class="val" data-tip="While the mode runs, its colour paints where this says. A mode linked to layers paints beneath the lowest of them that is on, so those layers' own colours show over it.">${light.swatch()}<span class="note">${lightText}</span></div>
        <button class="btn tiny ghost" data-act="lighting">Edit in Lighting</button>
    </div>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="lighting"]')).addEventListener("click", () => {
        state.screen = "lighting"; state.stage = "pd"; render();
    });
    return node;
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
