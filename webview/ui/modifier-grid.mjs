// @ts-check
// Eight modifiers as a Left / Right by Ctrl / Shift / Alt / GUI grid, so each
// switch sits under its name instead of wrapping wherever it lands. Both sides
// mix freely: the grid reads an eight-bit HID report mask (bit 0 Left Ctrl …
// bit 7 Right GUI). Pointing modes and custom-key shortcuts share it.
import {el, esc} from "../lib/dom.mjs";
import {modifierBits} from "../view/keyvalues.mjs";
import {vocabulary} from "../view/vocabulary.mjs";

/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {{label: string, mask: number, id: string, disabled?: boolean}} options */
export function modifierGrid(model, {label, mask, id, disabled = false}) {
    const bits = modifierBits(model);
    const columns = (vocabulary(model).pickerModifiers || []).filter(({bit}) => bit < 16).map(({label}) => label);
    /** @param {readonly [number, string]} entry */
    const cell = ([bit, name]) => `<label class="sw" data-tip="${esc(name)}"><input data-f="${esc(id)}:modifier:${esc(bit)}" type="checkbox" data-bit="${esc(bit)}" aria-label="${esc(name)}"
        ${mask & bit ? "checked" : ""} ${disabled ? "disabled" : ""}><span class="track"></span></label>`;
    /** @param {boolean} right */
    const side = (right) => bits.filter(([bit]) => (bit >= 16) === right);
    const node = el(`<div class="field"><span>${esc(label)}</span>
        <div class="pd-mods" style="grid-template-columns:44px repeat(${columns.length}, 58px)">
            <span></span>${columns.map((name) => `<span class="h">${esc(name)}</span>`).join("")}
            <span class="s">Left</span>${side(false).map(cell).join("")}
            <span class="s">Right</span>${side(true).map(cell).join("")}
        </div></div>`);
    const read = () => [.../** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("[data-bit]"))].reduce((total, input) =>
        total | (input.checked ? Number(input.dataset.bit) : 0), 0);
    return {node, read};
}
