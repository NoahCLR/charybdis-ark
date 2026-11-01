// @ts-check
// A choice of a few short options, all on show: a radio group drawn as
// segmented buttons, so the options are read without opening anything and
// picked in one click; the arrow keys move between them, as in any radio
// group. Which choices are drawn so is view/choices.mjs's rule; a long list
// (speeds, layers, slots) stays a select menu. Each option carries its own
// form identity, `f` then its value, and any `attributes` given.
import {esc} from "../lib/dom.mjs";

/**
 * @param {{label: string, f: string, choices: readonly (readonly [string | number, string])[], current: string | number | null | undefined,
 *   disabled?: boolean, tip?: string, hideLabel?: boolean, attributes?: Readonly<Record<string, string>>}} options
 *   f names the group (the radios' shared name) and, with each value, each radio's form identity
 */
export function segmented({label, f, choices, current, disabled = false, tip = "", hideLabel = false, attributes = {}}) {
    const extra = Object.entries(attributes).map(([name, value]) => `${esc(name)}="${esc(value)}"`).join(" ");
    const picked = choices.some(([value]) => String(value) === String(current)) ? String(current) : String(choices[0]?.[0] ?? "");
    return `<div class="field segmented"><span${hideLabel ? ` class="sr"` : ""}>${esc(label)}</span>
        <div class="seg" role="radiogroup" aria-label="${esc(label)}" ${tip ? `data-tip="${esc(tip)}"` : ""}>
        ${choices.map(([value, text]) => `<label><input type="radio" name="${esc(f)}" value="${esc(value)}" data-f="${esc(f)}:${esc(value)}" ${extra}
            ${String(value) === picked ? "checked" : ""} ${disabled ? "disabled" : ""}><span>${esc(text)}</span></label>`).join("")}</div></div>`;
}

// The value a segmented group holds, as its radio's value: "" when none is.
/** @param {ParentNode} node */
export const segmentedValue = (node) => /** @type {HTMLInputElement | null} */ (node.querySelector(".seg input:checked"))?.value ?? "";

// Picks the option holding `value`, as a group drawn again would show it.
/** @param {ParentNode} node @param {string} value */
export function pickSegment(node, value) {
    for (const input of /** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll(".seg input"))) input.checked = input.value === value;
}
