// @ts-check
// The one disclosure every list of layers folds its empty layers behind
// (view/empty-layers.mjs, D-L76). It sits at the list's end, says how many it
// holds, and turns its chevron down while they show. Each place keeps its own
// open state across renders; a strip or grid draws the layers it reveals after
// it, so nothing already shown moves, and a list in stack order draws them in
// their places. A folded control stays drawn, hidden, so a form that reads
// every layer's control still reads them all. A grouped table (Lighting's
// layers, ui/groups.mjs) folds them under its last band instead, as it folds
// every group, with this open state and the same words (view/empty-layers.mjs).
import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {render, state} from "../store.mjs";
import {EMPTY_LAYERS_TIP, emptyLayersLabel} from "../view/empty-layers.mjs";

// Whether this place shows its empty layers.
/** @param {string} place */
export const emptyLayersShown = (place) => state.emptyLayersShown.includes(place);
// Shows this place's empty layers, or folds them again.
/** @param {string} place */
export const toggleEmptyLayers = (place) => {
    state.emptyLayersShown = emptyLayersShown(place) ? state.emptyLayersShown.filter((each) => each !== place) : [...state.emptyLayersShown, place];
};


// The disclosure's markup, for `count` empty layers in `place`.
/** @param {string} place @param {number} count @param {string} [className] */
export function emptyLayersToggle(place, count, className = "") {
    const open = emptyLayersShown(place);
    return `<button type="button" class="empty-layers${className ? ` ${esc(className)}` : ""}" data-empty-layers="${esc(place)}" aria-expanded="${open}"
        data-tip="${open ? "Hide the layers with nothing in them." : `Show ${esc(EMPTY_LAYERS_TIP.charAt(0).toLowerCase() + EMPTY_LAYERS_TIP.slice(1))}`}">${DISCLOSURE}<span>${esc(emptyLayersLabel(count))}</span></button>`;
}

// The same as an element, opening and closing on its own.
/** @param {string} place @param {number} count @param {string} [className] */
export function emptyLayersButton(place, count, className = "") {
    const node = /** @type {HTMLElement} */ (el(emptyLayersToggle(place, count, className)));
    wireEmptyLayers(node);
    return node;
}

// Opens and closes every disclosure in `root` (or `root` itself).
/** @param {HTMLElement} root */
export function wireEmptyLayers(root) {
    const buttons = /** @type {HTMLElement[]} */ (root.matches("[data-empty-layers]") ? [root] : [...root.querySelectorAll("[data-empty-layers]")]);
    for (const button of buttons) button.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleEmptyLayers(button.dataset.emptyLayers || "");
        render();
    });
}
