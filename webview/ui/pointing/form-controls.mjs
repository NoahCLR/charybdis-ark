// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {modifierGrid} from "../modifier-grid.mjs";
import {choiceField, choiceValue} from "../segmented.mjs";
import {storedChoices} from "../../view/choices.mjs";

// A field that says what it does under itself says it as the Settings rows
// do, in a hint line under the label, and has no tip to say it again
// (D-L96); the line stays outside the label, so the field keeps its name.
/** @param {HTMLElement} field @param {string} help */
export function explained(field, help) {
    const block = el(`<div class="field-block"></div>`);
    block.append(field, el(`<span class="note field-help">${esc(help)}</span>`));
    return block;
}

// A field's options when what it does is said under it, in place of a tip.
/** @param {string} help @param {Omit<import("../surface-types.js").FieldOptions, "tip" | "help">} [rest] @returns {import("../surface-types.js").FieldOptions} */
export const told = (help, rest = {}) => ({...rest, help});

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit */
export function formControls(model, slot, canEdit) {
    /** @type {import("../surface-types.js").FormReaders} */
    const form = {name: () => slot.name, kind: () => slot.kind, dpi: () => slot.dpi};
    const disabled = canEdit ? "" : "disabled";
    /** @param {string} label @param {import("../../../contracts/edits.js").Scalar | null | undefined} value @param {string} key @param {import("../surface-types.js").FieldOptions} [options] */
    const field = (label, value, key, options = {}) => {
        // The tip is the whole field's, its label's as much as its box's.
        const node = el(`<label class="field" ${options.tip ? `data-tip="${esc(options.tip)}"` : ""}><span>${esc(label)}</span>
            <span class="affix ${options.unit ? "unit" : ""} ${options.wide ? "wide" : ""}"><input data-f="pointing:${esc(slot.id)}:${esc(key)}" class="input mono num" value="${esc(value ?? "")}" inputmode="numeric" ${disabled}>${options.unit ? `<i>${esc(options.unit)}</i>` : ""}</span></label>`);
        form[key] = () => /** @type {HTMLInputElement} */ (node.querySelector("input")).value;
        return options.help ? explained(node, options.help) : node;
    };
    // A choice, on show or in a menu as ui/segmented.mjs draws it, holding the
    // stored value even when it is none of the options (storedChoices).
    /** @param {string} label @param {readonly (readonly [number, string])[]} choices @param {import("../../../contracts/edits.js").Scalar | undefined} current @param {string} key @param {{tip?: string, hideLabel?: boolean}} [options] */
    const choice = (label, choices, current, key, options = {}) => {
        const node = el(choiceField({label, f: `pointing:${slot.id}:${key}`, choices: storedChoices(choices, current), current: current ?? undefined, disabled: !canEdit, ...options}));
        form[key] = () => Number(choiceValue(node) || (choices[0]?.[0] ?? 0));
        return node;
    };
    // The shared Left / Right by Ctrl / Shift / Alt / GUI grid.
    /** @param {string} label @param {number} mask @param {string} key */
    const modifiers = (label, mask, key) => {
        const grid = modifierGrid(model, {label, mask, id: `pointing:${slot.id}:${key}`, disabled: !canEdit});
        form[key] = grid.read;
        return grid.node;
    };

    return {form, disabled, field, choice, modifiers};
}
