// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {modifierGrid} from "../modifier-grid.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit */
export function formControls(model, slot, canEdit) {
    /** @type {import("../surface-types.js").FormReaders} */
    const form = {name: () => slot.name, kind: () => slot.kind, dpi: () => slot.dpi};
    const disabled = canEdit ? "" : "disabled";
    /** @param {string} label @param {import("../../../contracts/edits.js").Scalar | null | undefined} value @param {string} key @param {import("../surface-types.js").FieldOptions} [options] */
    const field = (label, value, key, options = {}) => {
        const node = el(`<label class="field"><span>${esc(label)}</span>
            <span class="affix ${options.unit ? "unit" : ""} ${options.wide ? "wide" : ""}"><input data-f="pointing:${esc(slot.id)}:${esc(key)}" class="input mono" value="${esc(value ?? "")}" inputmode="numeric" ${disabled}
            ${options.tip ? `data-tip="${esc(options.tip)}"` : ""}>${options.unit ? `<i>${esc(options.unit)}</i>` : ""}</span></label>`);
        form[key] = () => /** @type {HTMLInputElement} */ (node.querySelector("input")).value;
        return node;
    };
    /** @param {string} label @param {readonly (readonly [number, string])[]} choices @param {import("../../../contracts/edits.js").Scalar | undefined} current @param {string} key @param {import("../surface-types.js").SelectOptions} [options] */
    const select = (label, choices, current, key, options = {}) => {
        const node = el(`<label class="field ${options.inline ? "inline" : ""}"><span>${esc(label)}</span>
            <select data-f="pointing:${esc(slot.id)}:${esc(key)}" class="input" ${disabled} ${options.tip ? `data-tip="${esc(options.tip)}"` : ""}>
            ${choices.map(([value, text]) => `<option value="${esc(value)}" ${String(value) === String(current) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`);
        form[key] = () => Number(/** @type {HTMLSelectElement} */ (node.querySelector("select")).value);
        if (options.onChange) /** @type {HTMLSelectElement} */ (node.querySelector("select")).addEventListener("change", options.onChange);
        return node;
    };
    // The shared Left / Right by Ctrl / Shift / Alt / GUI grid.
    /** @param {string} label @param {number} mask @param {string} key */
    const modifiers = (label, mask, key) => {
        const grid = modifierGrid(model, {label, mask, id: `pointing:${slot.id}:${key}`, disabled: !canEdit});
        form[key] = grid.read;
        return grid.node;
    };

    return {form, disabled, field, select, modifiers};
}
