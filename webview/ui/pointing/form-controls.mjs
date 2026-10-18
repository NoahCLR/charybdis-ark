// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {keyName, pointingMacro} from "../../view/keyvalues.mjs";
import {modifierGrid} from "../modifier-grid.mjs";
import {render, state} from "../../store.mjs";
import {openPicker} from "../picker.mjs";
import {keycodeShown} from "../../view/show-keycodes.mjs";
import {tapWords} from "../../view/trackball.mjs";
import {keycodeMark} from "../marks.mjs";

// A field's refusal, under it: the editor writes the reason here, by the
// form key in data-problem-for, when the keyboard would refuse the record.
const PROBLEM = `<span class="note pd-problem" data-problem role="alert" hidden></span>`;

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit @param {() => void} stageCurrent */
export function formControls(model, slot, canEdit, stageCurrent) {
    /** @type {import("../surface-types.js").FormReaders} */
    const form = {name: () => slot.name, kind: () => slot.kind, dpi: () => slot.dpi};
    const disabled = canEdit ? "" : "disabled";
    /** @param {string} label @param {import("../../../contracts/edits.js").Scalar | null | undefined} value @param {string} key @param {import("../surface-types.js").FieldOptions} [options] */
    const field = (label, value, key, options = {}) => {
        const node = el(`<label class="field" data-problem-for="${esc(key)}"><span>${esc(label)}</span>
            <span class="affix ${options.unit ? "unit" : ""} ${options.wide ? "wide" : ""}"><input data-f="pointing:${slot.id}:${esc(key)}" class="input mono" value="${esc(value ?? "")}" inputmode="numeric" aria-label="${esc(label)}" ${disabled}
            ${options.tip ? `data-tip="${esc(options.tip)}"` : ""}>${options.unit ? `<i>${esc(options.unit)}</i>` : ""}</span>
            ${options.hint ? `<span class="note">${esc(options.hint)}</span>` : ""}${PROBLEM}</label>`);
        form[key] = () => /** @type {HTMLInputElement} */ (node.querySelector("input")).value;
        return node;
    };
    /** @param {string} label @param {readonly (readonly [number, string])[]} choices @param {import("../../../contracts/edits.js").Scalar | undefined} current @param {string} key @param {import("../surface-types.js").SelectOptions} [options] */
    const select = (label, choices, current, key, options = {}) => {
        const node = el(`<label class="field ${options.inline ? "inline" : ""}"><span>${esc(label)}</span>
            <select data-f="pointing:${slot.id}:${esc(key)}" class="input" ${disabled} ${options.tip ? `data-tip="${esc(options.tip)}"` : ""}>
            ${choices.map(([value, text]) => `<option value="${value}" ${String(value) === String(current) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select>
            ${options.hint ? `<span class="note">${esc(options.hint)}</span>` : ""}</label>`);
        form[key] = () => Number(/** @type {HTMLSelectElement} */ (node.querySelector("select")).value);
        if (options.onChange) /** @type {HTMLSelectElement} */ (node.querySelector("select")).addEventListener("change", options.onChange);
        return node;
    };
    // A shortcut the mode sends, read as the computer's keys ("Command + Z")
    // on a button that opens the picker. With Show keycodes on, the keycode
    // field sits beside it for typed entry.
    /** @param {string} label @param {import("../../../contracts/edits.js").Scalar | undefined} code @param {string} key @param {import("../surface-types.js").ShortcutOptions} [options] */
    const shortcut = (label, code, key, options = {}) => {
        const name = options.name ?? keyName(model, Number(code ?? 0));
        let current = name;
        const typed = keycodeShown(state, "pointingShortcut");
        const macro = pointingMacro(model, code);
        const words = macro ? macro.name : tapWords(model, typeof code === "number" ? code : name);
        const tip = "Any key, shortcut or mouse button 1–8 the keyboard can send from a trackball mode. A button already held gets no new click and stays held.";
        const node = el(`<div class="field ${options.klass || ""}" data-problem-for="${esc(key)}"><span>${options.labelHtml || esc(label)}</span>
            <div class="input-row">
                <button class="value-btn" data-pick ${disabled} aria-label="${esc(`${label}: ${words || "nothing"}. Choose…`)}" data-tip="${esc(tip)}">${words ? esc(words) : `<span class="dim">Nothing</span>`}${typed ? "" : keycodeMark("pointingShortcut", name, words)}</button>
                ${typed ? `<input data-f="pointing:${slot.id}:${esc(key)}" class="input mono" value="${esc(name)}" placeholder="nothing" aria-label="${esc(`${label} keycode`)}" ${disabled}>` : ""}
            </div>${PROBLEM}</div>`);
        if (macro) {
            if (macro.empty) node.append(el(`<span class="note">This macro is empty: does nothing yet</span>`));
            if (!key.startsWith("button:") && slot.directionOutput === 0) node.append(el(`<span class="note" data-tip="Triggers while a macro is playing are dropped. Choose Once per movement under How often it sends for a longer macro.">Busy triggers are dropped · try Once per movement</span>`));
        }
        const input = /** @type {HTMLInputElement | null} */ (node.querySelector("input"));
        form[key] = () => input ? input.value.trim() : current;
        /** @type {HTMLButtonElement} */ (node.querySelector("[data-pick]")).addEventListener("click", (event) => {
            event.preventDefault();
            // Only what the keyboard sends from a pointing mode is offered
            // (model.pdModeEditing.tapKeys); a key typed instead is checked
            // when it is staged.
            openPicker({
                title: label, context: `${slot.name} · P${slot.id}`,
                seed: current ? [current] : [],
                allowedKeys: model.pdModeEditing?.tapKeys?.plain ?? null,
                modifiable: model.pdModeEditing?.tapKeys?.modified ?? null,
                onPick: (expression) => {
                    current = expression;
                    if (input) input.value = expression;
                    stageCurrent();
                    render();
                },
            });
        });
        return node;
    };
    // The shared Left / Right by Ctrl / Shift / Alt / GUI grid.
    /** @param {string} label @param {number} mask @param {string} key */
    const modifiers = (label, mask, key) => {
        const grid = modifierGrid(model, {label, mask, id: `pointing:${slot.id}:${key}`, disabled: !canEdit});
        form[key] = grid.read;
        return grid.node;
    };

    return {form, disabled, field, select, shortcut, modifiers};
}
