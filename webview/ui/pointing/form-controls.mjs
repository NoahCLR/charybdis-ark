// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {keyName, modifierBits, pointingMacro} from "../../view/keyvalues.mjs";
import {vocabulary} from "../../view/vocabulary.mjs";
import {render} from "../../store.mjs";
import {openPicker} from "../picker.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit @param {() => void} stageCurrent */
export function formControls(model, slot, canEdit, stageCurrent) {
    /** @type {import("../surface-types.js").FormReaders} */
    const form = {name: () => slot.name, kind: () => slot.kind, dpi: () => slot.dpi};
    const disabled = canEdit ? "" : "disabled";
    /** @param {string} label @param {import("../../../contracts/edits.js").Scalar | null | undefined} value @param {string} key @param {import("../surface-types.js").FieldOptions} [options] */
    const field = (label, value, key, options = {}) => {
        const node = el(`<label class="field"><span>${esc(label)}</span>
            <span class="affix ${options.unit ? "unit" : ""} ${options.wide ? "wide" : ""}"><input data-f="pointing:${slot.id}:${esc(key)}" class="input mono" value="${esc(value ?? "")}" inputmode="numeric" ${disabled}
            ${options.tip ? `data-tip="${esc(options.tip)}"` : ""}>${options.unit ? `<i>${esc(options.unit)}</i>` : ""}</span></label>`);
        form[key] = () => /** @type {HTMLInputElement} */ (node.querySelector("input")).value;
        return node;
    };
    /** @param {string} label @param {readonly (readonly [number, string])[]} choices @param {import("../../../contracts/edits.js").Scalar | undefined} current @param {string} key @param {import("../surface-types.js").SelectOptions} [options] */
    const select = (label, choices, current, key, options = {}) => {
        const node = el(`<label class="field ${options.inline ? "inline" : ""}"><span>${esc(label)}</span>
            <select data-f="pointing:${slot.id}:${esc(key)}" class="input" ${disabled} ${options.tip ? `data-tip="${esc(options.tip)}"` : ""}>
            ${choices.map(([value, text]) => `<option value="${value}" ${String(value) === String(current) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`);
        form[key] = () => Number(/** @type {HTMLSelectElement} */ (node.querySelector("select")).value);
        if (options.onChange) /** @type {HTMLSelectElement} */ (node.querySelector("select")).addEventListener("change", options.onChange);
        return node;
    };
    /** @param {string} label @param {import("../../../contracts/edits.js").Scalar | undefined} code @param {string} key @param {import("../surface-types.js").ShortcutOptions} [options] */
    const shortcut = (label, code, key, options = {}) => {
        const name = options.name ?? keyName(model, Number(code ?? 0));
        const node = el(`<label class="field ${options.klass || ""}"><span>${options.labelHtml || esc(label)}</span>
            <div class="input-row"><input data-f="pointing:${slot.id}:${esc(key)}" class="input mono" value="${esc(name)}" placeholder="nothing" ${disabled}>
            <button class="btn" data-pick ${disabled}>Pick…</button></div></label>`);
        const macro = pointingMacro(model, code);
        if (macro) {
            node.append(el(`<span class="note">${esc(macro.name)}${macro.empty ? " · empty: does nothing yet" : ""}</span>`));
            if (!key.startsWith("button:") && slot.directionOutput === 0) node.append(el(`<span class="note" data-tip="Triggers while a macro is playing are dropped. Choose Once per movement under How often it sends for a longer macro.">Busy triggers are dropped · try Once per movement</span>`));
        }
        const input = /** @type {HTMLInputElement} */ (node.querySelector("input"));
        form[key] = () => input.value.trim();
        /** @type {HTMLButtonElement} */ (node.querySelector("[data-pick]")).addEventListener("click", (event) => {
            event.preventDefault();   // inside a <label>, a click would also focus the input
            // Only what the keyboard sends from a pointing mode is offered
            // (model.pdModeEditing.tapKeys); a key typed instead is checked
            // when it is staged.
            openPicker({
                title: label, context: `${slot.name} · slot ${slot.id}`,
                seed: name ? [name] : [],
                allowedKeys: model.pdModeEditing?.tapKeys?.plain ?? null,
                modifiable: model.pdModeEditing?.tapKeys?.modified ?? null,
                onPick: (expression) => {
                    input.value = expression;
                    stageCurrent();
                    render();
                },
            });
        });
        return node;
    };
    // Eight modifiers as a Left / Right by Ctrl / Shift / Alt / GUI grid, so
    // each switch sits under its name instead of wrapping wherever it lands.
    /** @param {string} label @param {number} mask @param {string} key */
    const modifiers = (label, mask, key) => {
        const bits = modifierBits(model);
        const columns = (vocabulary(model).pickerModifiers || []).filter(({bit}) => bit < 16).map(({label}) => label);
        /** @param {readonly [number, string]} entry */
        const cell = ([bit, name]) => `<label class="sw" data-tip="${esc(name)}"><input data-f="pointing:${slot.id}:${esc(key)}:modifier:${bit}" type="checkbox" data-bit="${bit}" aria-label="${esc(name)}"
            ${mask & bit ? "checked" : ""} ${disabled}><span class="track"></span></label>`;
        /** @param {boolean} right */
        const side = (right) => bits.filter(([bit]) => (bit >= 16) === right);
        const node = el(`<div class="field"><span>${esc(label)}</span>
            <div class="pd-mods" style="grid-template-columns:44px repeat(${columns.length}, 58px)">
                <span></span>${columns.map((name) => `<span class="h">${esc(name)}</span>`).join("")}
                <span class="s">Left</span>${side(false).map(cell).join("")}
                <span class="s">Right</span>${side(true).map(cell).join("")}
            </div></div>`);
        form[key] = () => [.../** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("[data-bit]"))].reduce((total, input) =>
            total | (input.checked ? Number(input.dataset.bit) : 0), 0);
        return node;
    };


    return {form, disabled, field, select, shortcut, modifiers};
}
