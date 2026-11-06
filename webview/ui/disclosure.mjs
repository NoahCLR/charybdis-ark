// @ts-check
// The one fold: a chevron that turns down while open, then the words that say
// what unfolds. A button that opens and closes what it holds says so with
// aria-expanded; a <summary> is the same control with the browser keeping the
// state. Both wear .disclose (styles.css, "disclosure").
import {DISCLOSURE, esc} from "../lib/dom.mjs";
import {state} from "../store.mjs";

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
