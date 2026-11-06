// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {holdKeyName, whatReachesSlot} from "../../view/pointing-reach.mjs";
import {stageEnabled} from "../../view/lighting.mjs";
import {keysPlacedOn} from "../../view/placements.mjs";
import {slotNamed, vocabulary, word} from "../../view/vocabulary.mjs";
import {render, state} from "../../store.mjs";
import {slotLight} from "../marks.mjs";

// The keys that start the mode, held or locked, named by the mode as the
// picker names them, and where they sit.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot */
export function keysRow(model, slot) {
    return el(`<div class="pd-keys">
        <span class="pd-cap" data-tip="${esc(`Runs the mode while it is held. Stored as ${holdKeyName(slot)}.`)}"><b>${esc(slotNamed(slot))}</b> <i>hold</i></span>
        <span class="pd-cap" data-tip="${esc(`One press turns the mode on, the next turns it off. Stored as ${slot.keys?.lock || ""}.`)}"><b>${esc(slotNamed(slot))}</b> <i>lock</i></span>
        <span class="note" data-placed>${esc(placedLine(whatReachesSlot(model, slot).keys))}</span>
    </div>`);
}

// Place on a key →, in the editor's title bar as Macros and Custom keys have
// it: it puts the mode's hold key on a key picked on the board.
/** @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit */
export function placeButton(slot, canEdit) {
    const button = el(`<button class="btn tiny link" data-act="place" ${canEdit ? "" : "disabled"}
        data-tip="Put this mode's hold key on a key you pick on the board.">Place on a key →</button>`);
    button.addEventListener("click", () => {
        state.placement = {keycode: holdKeyName(slot)};
        state.screen = "keys";
        state.tab = "key";
        render();
    });
    return button;
}

/** @param {Parameters<typeof keysPlacedOn>[0]} keys */
const placedLine = (keys) => keys.length ? keysPlacedOn(keys) : "Not on the board yet";

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
    const node = el(`<div class="field pd-light"><span>Light</span><div class="pd-light-row">
        <div class="val" data-tip="While the mode runs, its colour paints where this says. A mode linked to layers paints beneath the lowest of them that is on, so those layers' own colours show over it.">${light.swatch()}<span class="note">${lightText}</span></div>
        <button class="btn tiny link" data-act="lighting">Edit in Lighting →</button>
    </div></div>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="lighting"]')).addEventListener("click", () => {
        state.screen = "lighting"; state.stage = "pd"; render();
    });
    return node;
}
