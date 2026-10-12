// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {durationMilliseconds, durationUnit, durationValue} from "../view/duration.mjs";
import {state} from "../store.mjs";

/** @param {import('../../contracts/panel.js').PresentedField} field @param {boolean} editable @param {() => void} submit */
export function durationControl(field, editable, submit) {
    let unit = state.settingsDurationUnits[field.macro] || durationUnit(field.value);
    const node = el(`<div class="input-row duration-control">
        <input class="input mono" inputmode="decimal" aria-label="${esc(field.label)}" data-macro="${esc(field.macro)}" data-f="setting:${esc(field.macro)}" value="${esc(durationValue(field.value, unit))}" ${editable ? "" : "disabled"}>
        <select class="input" aria-label="${esc(field.label)} unit" data-f="setting:${esc(field.macro)}:unit" ${editable ? "" : "disabled"}>
            <option value="seconds" ${unit === "seconds" ? "selected" : ""}>seconds</option>
            <option value="minutes" ${unit === "minutes" ? "selected" : ""}>minutes</option>
        </select></div>`);
    const input = /** @type {HTMLInputElement} */ (node.querySelector("input"));
    const select = /** @type {HTMLSelectElement} */ (node.querySelector("select"));
    const read = () => {
        const milliseconds = durationMilliseconds(input.value, unit);
        const valid = milliseconds !== null && Number(milliseconds) >= (field.min ?? 0) && Number(milliseconds) <= (field.max ?? Infinity);
        input.setCustomValidity(valid ? "" : `Enter a time from ${durationValue(String(field.min ?? 0), unit)} to ${durationValue(String(field.max), unit)} ${unit}.`);
        return valid ? milliseconds : null;
    };
    input.addEventListener("input", () => input.setCustomValidity(""));
    input.addEventListener("change", submit);
    select.addEventListener("change", () => {
        const milliseconds = read();
        if (milliseconds === null) { select.value = unit; input.reportValidity(); return; }
        unit = select.value === "minutes" ? "minutes" : "seconds";
        state.settingsDurationUnits[field.macro] = unit;
        input.value = durationValue(milliseconds, unit);
    });
    return {node, read, reportValidity: () => input.reportValidity()};
}
