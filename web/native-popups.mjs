// @ts-check
// Whether the page may not hear the keyboard just now. Chrome on macOS shows
// a <select>'s list as a native menu, and while that menu is open the page
// gets no WebHID input reports, nor any input events, until it closes. A
// look at a live keyboard sent then goes unanswered though the keyboard is
// fine, so the host pauses its looks (core/session/live-watch.js) while such
// a menu may be open, and while the page is hidden.
//
// A menu opens from a press on a <select> showing one row, or from the keys
// that open one while it has focus. Nothing reaches the page while it is
// open, so the first event after the press (a change, a move, a key, the
// select losing focus) means it has closed. One event comes after the press
// without the menu closing: the press moves focus to the select, so the
// control that had it (a button clicked before) loses it just then.

const OPENING_KEYS = new Set([" ", "Enter", "ArrowDown", "ArrowUp", "F4"]);

/** @param {EventTarget | null} target */
function isMenuSelect(target) {
    const select = /** @type {Partial<HTMLSelectElement> | null} */ (target);
    return Boolean(select && select.tagName === "SELECT" && !select.multiple && !(Number(select.size) > 1) && !select.disabled);
}

/** @param {Pick<Document, "addEventListener" | "visibilityState">} document */
export function nativePopups(document) {
    /** @type {EventTarget | null} the select whose menu may be open */
    let open = null;
    /** @param {Event} event */
    const closes = (event) => {
        if (event.type === "keydown" && isMenuSelect(event.target) && OPENING_KEYS.has(/** @type {KeyboardEvent} */ (event).key)) {
            open = event.target;
            return;
        }
        if (event.type === "focusout" && open && event.target !== open) return;
        open = event.type === "pointerdown" && isMenuSelect(event.target) ? event.target : null;
    };
    for (const type of ["pointerdown", "keydown", "pointermove", "change", "input", "focusout", "wheel"]) {
        document.addEventListener(type, closes, {capture: true, passive: true});
    }
    return {
        get open() {return open !== null;},
        // The look waits while a menu may be open or the page is hidden.
        paused: () => open !== null || document.visibilityState !== "visible",
    };
}
