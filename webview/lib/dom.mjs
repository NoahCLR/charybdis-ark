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

// The page requires Trusted Types (scripts/build-web.js POLICY): markup
// reaches it only through this policy, `html(markup)`, from markup authored
// here, whose every value from a keyboard or a file is escaped first (esc).
// Without Trusted Types (Node's tests) markup passes as it is.
/** @typedef {{createHTML: (markup: string) => string}} HtmlPolicy */
const policy = /** @type {{trustedTypes?: {createPolicy: (name: string, rules: HtmlPolicy) => HtmlPolicy}}} */ (globalThis)
    .trustedTypes?.createPolicy("ark-html", {createHTML: (markup) => markup});
// Markup as the page's HTML sinks take it (`innerHTML`, `insertAdjacentHTML`).
/** @param {string} markup @returns {string} */
export const html = (markup) => policy ? policy.createHTML(markup) : markup;

/** @param {string} markup @returns {HTMLElement} */
export function el(markup) {
    const template = document.createElement("template");
    template.innerHTML = html(String(markup).trim());
    // Callers supply one authored HTML root. Keyboard values are escaped before here.
    return /** @type {HTMLElement} */ (template.content.firstElementChild);
}

// Calls `then` on a press anywhere outside `nodes` (a menu or panel and the
// button that opened it), before what it lands on takes it, until the
// function it returns is called.
/** @param {readonly Node[]} nodes @param {(event: PointerEvent) => void} then @returns {() => void} */
export function watchPressOutside(nodes, then) {
    /** @param {PointerEvent} event */
    const press = (event) => {
        if (!nodes.some((node) => node.contains(/** @type {Node | null} */ (event.target)))) then(event);
    };
    document.addEventListener("pointerdown", press, true);
    return () => document.removeEventListener("pointerdown", press, true);
}
