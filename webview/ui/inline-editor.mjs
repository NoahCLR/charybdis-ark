// @ts-check
// An editor opened in place, inside a screen, closes one way: by its button
// at the right of its title bar, Done, or by Escape from anywhere inside it.
// Either way the focus goes back to what opened it, which the editor's own
// close does after it redraws. The behaviour cell and the macro step editors
// keep every change in the draft as it is made, so they are Done; the combo
// builder keeps its own form until Keep, so it closes by Cancel instead, and
// Escape cancels it too.

// Selector assertions refer to the button this module authors.
export const DONE = `<button type="button" class="btn tiny ghost" data-act="done">Done</button>`;

/**
 * @param {HTMLElement} node the editor
 * @param {() => void} close closes it and puts the focus back on its opener
 * @param {string} [button] the editor's own close, DONE unless it says
 */
export function closesInPlace(node, close, button = '[data-act="done"]') {
    /** @type {HTMLButtonElement | null} */ (node.querySelector(button))?.addEventListener("click", close);
    node.addEventListener("keydown", (event) => {
        // A field that took Escape for itself (a name put back) keeps it.
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        close();
    });
}
