// @ts-check
// How far the ball turns for each step a mode sends, edited as millimetres
// with the counts the keyboard stores beside it, both editable. A step is
// counts at a DPI, so the millimetres depend on the speed the mode runs at:
// the counts are what is stored, and the words say at which DPI the
// millimetres hold, and what sniping does to them.

import {el, esc} from "../../lib/dom.mjs";
import {countsToMm, mmToCounts, stepAside} from "../../view/trackball.mjs";

/** @typedef {{form: import("../surface-types.js").FormReaders, disabled: string}} StepControls */

/**
 * @param {number} slotId
 * @param {{label: string, key: string, counts: import("../../../contracts/edits.js").Scalar | undefined, dpi: number, directional: boolean, sniping: number, tip: string}} step
 * @param {StepControls} controls
 */
export function stepRow(slotId, {label, key, counts, dpi, directional, sniping, tip}, {form, disabled}) {
    const mm = countsToMm(counts, dpi);
    const shown = mm === null ? "" : String(mm);
    const node = el(`<div class="field pd-step" data-problem-for="${esc(key)}"><span>${esc(label)}</span>
        <div class="pd-step-row">
            <span class="affix unit"><input data-f="pointing:${slotId}:mm:${esc(key)}" class="input mono" value="${esc(shown)}" inputmode="decimal"
                aria-label="${esc(`${label} in millimetres`)}" data-tip="${esc(tip)}" ${disabled}><i>mm</i></span>
            <span class="note">·</span>
            <span class="affix unit wide"><input data-f="pointing:${slotId}:${esc(key)}" class="input mono" value="${esc(counts ?? "")}" inputmode="numeric"
                aria-label="${esc(`${label} in sensor counts`)}" data-tip="Sensor counts, as the keyboard stores the step." ${disabled}><i>counts</i></span>
            <span class="note" data-aside>${esc(stepAside(counts ?? 0, dpi, {directional, sniping}).replace(/^\d+ counts /, ""))}</span>
        </div>
        <span class="note pd-problem" data-problem role="alert" hidden></span></div>`);
    const [mmInput, countsInput] = /** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("input"));
    // The millimetres win once they are changed; the counts otherwise, so a
    // step left alone posts exactly what was stored, never a rounding of it.
    form[key] = () => {
        if (mmInput.value.trim() !== shown) return String(mmToCounts(mmInput.value, dpi) ?? 0);
        return countsInput.value;
    };
    return node;
}
