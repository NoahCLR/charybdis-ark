// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {durationMilliseconds, durationUnit, durationValue} from "../view/duration.mjs";
import {state} from "../store.mjs";
import {choiceField, choiceValue, pickChoice} from "./segmented.mjs";

/** @type {readonly (readonly [string, string])[]} */
const UNITS = [["seconds", "seconds"], ["minutes", "minutes"]];

/** @param {import('../../contracts/panel.js').PresentedField} field @param {boolean} editable @param {() => void} submit */
export function durationControl(field, editable, submit) {
    let unit = state.settingsDurationUnits[field.macro] || durationUnit(field.value);
    const node = el(`<div class="input-row duration-control">
        <input class="input mono num" inputmode="decimal" aria-label="${esc(field.label)}" data-macro="${esc(field.macro)}" data-f="setting:${esc(field.macro)}" value="${esc(durationValue(field.value, unit))}" ${editable ? "" : "disabled"}>
        ${choiceField({label: `${field.label} unit`, f: `setting:${field.macro}:unit`, choices: UNITS, current: unit, disabled: !editable, hideLabel: true})}</div>`);
    const input = /** @type {HTMLInputElement} */ (node.querySelector("input"));
    const units = /** @type {HTMLElement} */ (node.querySelector(".field"));
    const read = () => {
        const milliseconds = durationMilliseconds(input.value, unit);
        const valid = milliseconds !== null && Number(milliseconds) >= (field.min ?? 0) && Number(milliseconds) <= (field.max ?? Infinity);
        input.setCustomValidity(valid ? "" : `Enter a time from ${durationValue(String(field.min ?? 0), unit)} to ${durationValue(String(field.max), unit)} ${unit}.`);
        return valid ? milliseconds : null;
    };
    input.addEventListener("input", () => input.setCustomValidity(""));
    input.addEventListener("change", submit);
    // The unit stages nothing itself: it says the same time in other words.
    units.addEventListener("change", (event) => {
        event.stopPropagation();
        const milliseconds = read();
        if (milliseconds === null) { pickChoice(units, unit); input.reportValidity(); return; }
        unit = choiceValue(units) === "minutes" ? "minutes" : "seconds";
        state.settingsDurationUnits[field.macro] = unit;
        input.value = durationValue(milliseconds, unit);
    });
    return {node, read, reportValidity: () => input.reportValidity()};
}
