// @ts-check
// A choice, drawn as view/choices.mjs's rule says: a few short options all
// on show, as a radio group of segmented buttons, so each is read without
// opening anything and picked in one click (the arrow keys move between
// them, as in any radio group); a longer list as a select menu. Every choice
// that might be either is drawn by choiceField, so none can skip the rule,
// and read by choiceValue, whichever it became. A segmented option carries
// its own form identity, `f` then its value; a menu carries `f`.
import {esc} from "../lib/dom.mjs";
import {onScreenChoice} from "../view/choices.mjs";

/** @typedef {{label: string, f: string, choices: readonly (readonly [string | number, string])[], current: string | number | null | undefined,
 *   disabled?: boolean, tip?: string, hideLabel?: boolean, attributes?: Readonly<Record<string, string>>}} ChoiceOptions */

/** @param {ChoiceOptions} options */
export function choiceField(options) {
    if (onScreenChoice(options.choices.map(([, text]) => text))) return segmented(options);
    const {label, f, choices, current, disabled = false, tip = "", hideLabel = false, attributes = {}} = options;
    const extra = Object.entries(attributes).map(([name, value]) => `${esc(name)}="${esc(value)}"`).join(" ");
    return `<label class="field"><span${hideLabel ? ` class="sr"` : ""}>${esc(label)}</span>
        <select class="input" data-f="${esc(f)}" ${extra} ${disabled ? "disabled" : ""} ${tip ? `data-tip="${esc(tip)}"` : ""}>
        ${choices.map(([value, text]) => `<option value="${esc(value)}" ${String(value) === String(current) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
}

// f names the group (the radios' shared name) and, with each value, each
// radio's form identity.
/** @param {ChoiceOptions} options */
function segmented({label, f, choices, current, disabled = false, tip = "", hideLabel = false, attributes = {}}) {
    const extra = Object.entries(attributes).map(([name, value]) => `${esc(name)}="${esc(value)}"`).join(" ");
    const picked = choices.some(([value]) => String(value) === String(current)) ? String(current) : String(choices[0]?.[0] ?? "");
    return `<div class="field segmented"><span${hideLabel ? ` class="sr"` : ""}>${esc(label)}</span>
        <div class="seg" role="radiogroup" aria-label="${esc(label)}" ${tip ? `data-tip="${esc(tip)}"` : ""}>
        ${choices.map(([value, text]) => `<label><input type="radio" name="${esc(f)}" value="${esc(value)}" data-f="${esc(f)}:${esc(value)}" ${extra}
            ${String(value) === picked ? "checked" : ""} ${disabled ? "disabled" : ""}><span>${esc(text)}</span></label>`).join("")}</div></div>`;
}

// The value a choice holds, its checked option's or its menu's: "" when none.
/** @param {ParentNode} node */
export const choiceValue = (node) => /** @type {HTMLInputElement | null} */ (node.querySelector(".seg input:checked"))?.value
    ?? /** @type {HTMLSelectElement | null} */ (node.querySelector("select"))?.value ?? "";

// Picks the option holding `value`, as a choice drawn again would show it.
/** @param {ParentNode} node @param {string} value */
export function pickChoice(node, value) {
    for (const input of /** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll(".seg input"))) input.checked = input.value === value;
    const menu = /** @type {HTMLSelectElement | null} */ (node.querySelector("select"));
    if (menu) menu.value = value;
}
