// @ts-check
// A slot's name as its editor's title: click the title to rename it, Enter
// finishes, Escape puts the stored name back. The byte count shows while the
// title is being edited, or while the name is too long. Macros and Custom keys
// both title their editor this way.

// Selector assertions refer to elements created by this module's authored markup.
import {esc} from "../lib/dom.mjs";
import {NAME_TIP, nameCount} from "../view/names.mjs";

/**
 * @param {{f: string, value: string, placeholder: string, label: string, perName: number, canEdit: boolean}} field
 */
export function titleName({f, value, placeholder, label, perName, canEdit}) {
    const count = nameCount(value, perName);
    return `<div class="title-name"><input class="title-name-input" data-f="${esc(f)}" data-name value="${esc(value)}" placeholder="${esc(placeholder)}" aria-label="${esc(label)}" ${canEdit ? "" : "disabled"}
            data-tip="Click the title to rename. ${esc(NAME_TIP)}"><span class="title-name-count note${count.over ? " warn" : ""}" data-name-count>${esc(count.label)}</span></div>`;
}

/**
 * @param {HTMLElement} node holding one titleName
 * @param {{stored: string, perName: number, rename: (name: string) => void}} options
 */
export function attachTitleName(node, {stored, perName, rename}) {
    const input = /** @type {HTMLInputElement | null} */ (node.querySelector("[data-name]"));
    if (!input) return;
    const counter = /** @type {HTMLElement} */ (node.querySelector("[data-name-count]"));
    const showCount = () => {
        const count = nameCount(input.value, perName);
        counter.textContent = count.label;
        counter.classList.toggle("warn", count.over);
    };
    input.addEventListener("input", showCount);
    input.addEventListener("change", () => { if (input.value !== stored) rename(input.value); });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); input.blur(); }
        if (event.key === "Escape") { event.preventDefault(); input.value = stored; showCount(); input.blur(); }
    });
}
