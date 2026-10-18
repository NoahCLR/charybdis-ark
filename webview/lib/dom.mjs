// @ts-check
// Small DOM helpers. Device text only ever reaches the page through
// textContent or an escaped interpolation, so a keyboard cannot post markup.

/** @type {Readonly<Record<string, string>>} */
const ENTITIES = Object.freeze({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"});

/** @param {unknown} value */
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ENTITIES[character]);

// The one mark for something that folds: a chevron at the start of its
// summary, turned down while it is open (styles.css, "details > summary .chev").
export const DISCLOSURE = `<svg class="chev" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2l3 3-3 3"/></svg>`;

/** @param {string} markup @returns {HTMLElement} */
export function el(markup) {
    const template = document.createElement("template");
    template.innerHTML = String(markup).trim();
    // Callers supply one authored HTML root. Keyboard values are escaped before here.
    return /** @type {HTMLElement} */ (template.content.firstElementChild);
}
