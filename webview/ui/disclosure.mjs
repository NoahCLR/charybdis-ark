// @ts-check
// The one fold: a chevron that turns down while open, then the words that say
// what unfolds. A button that opens and closes what it holds says so with
// aria-expanded; a <summary> is the same control with the browser keeping the
// state. Both wear .disclose (styles.css, "disclosure").
import {DISCLOSURE, esc, watchPressOutside} from "../lib/dom.mjs";
import {render, state} from "../store.mjs";

// A fold opened by hand stays open across renders, wherever it appears
// next, for the session (state.foldsOpen).
/** @param {string} id */
export const foldOpen = (id) => state.foldsOpen.includes(id);
/** @param {string} id @param {boolean} open */
export function keepFold(id, open) {
    state.foldsOpen = open ? [...new Set([...state.foldsOpen, id])] : state.foldsOpen.filter((each) => each !== id);
}

/**
 * A disclosure button's markup.
 * @param {string} label the words, escaped here
 * @param {{open: boolean, className?: string, tip?: string, attrs?: string}} options
 *   `attrs` is further attribute markup, already escaped
 */
export function disclosureButton(label, {open, className = "", tip = "", attrs = ""}) {
    return `<button type="button" class="disclose${className ? ` ${esc(className)}` : ""}" aria-expanded="${open}"${tip ? ` data-tip="${esc(tip)}"` : ""}${attrs ? ` ${attrs}` : ""}>${DISCLOSURE}<span>${esc(label)}</span></button>`;
}

// The outside-press watch of each open panel, by its place: one for the page.
/** @type {Map<string, () => void>} */
const watching = new Map();

/**
 * A disclosure that opens a panel under its button, as Layers it runs on and
 * a behaviour's Timings do: the button, `[data-act=act]` with
 * `aria-haspopup="dialog"`, and, while the fold is open, the panel
 * (`.def-pop`), both inside `root`. The caller draws the panel when
 * `foldOpen(place)`, so it stays open across the redraws its controls cause.
 * Esc closes it with focus back on its button. A press outside closes it in
 * place rather than by a redraw, and only once the click has landed: the
 * panel reaches below the editor, so taking it out on the press itself can
 * scroll the page under the pointer and lose the click on what it was on. One
 * watch for the page per place: a tab laid out for its height draws a second
 * editor, with a panel of its own, so a press counts as inside by what it
 * lands on (`within`, the control's own selector), and the close takes out
 * every panel of the place. `onClose` runs however it closes, before any
 * redraw: what the panel held unkept goes with it.
 * @param {HTMLElement} root the control: its button and, when open, its panel
 * @param {{place: string, act: string, within: string, onClose?: () => void}} options the fold's
 *   id, the button's `data-act` and the control's selector, all authored
 */
export function panelDisclosure(root, {place, act, within, onClose}) {
    const open = foldOpen(place);
    const button = /** @type {HTMLButtonElement} */ (root.querySelector(`[data-act="${act}"]`));
    const pop = /** @type {HTMLElement | null} */ (root.querySelector(".def-pop"));
    const close = () => { keepFold(place, false); watching.get(place)?.(); watching.delete(place); onClose?.(); };
    button.addEventListener("click", () => { if (open) close(); else keepFold(place, true); render(); });
    if (!pop) return;
    pop.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault(); event.stopPropagation();
        close(); render();
        /** @type {HTMLElement | null} */ (document.querySelector(`[data-act="${act}"]`))?.focus();
    });
    watching.get(place)?.();
    watching.set(place, watchPressOutside([], (event) => {
        if (/** @type {Element | null} */ (event.target instanceof Element ? event.target : null)?.closest(within)) return;
        close();
        document.addEventListener("click", () => {
            document.querySelectorAll(`${within} .def-pop`).forEach((panel) => panel.remove());
            document.querySelectorAll(`[data-act="${act}"]`).forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
        }, {capture: true, once: true});
    }));
}
