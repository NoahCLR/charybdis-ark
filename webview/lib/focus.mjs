// @ts-check
// Keeping the keyboard's place across a redraw.
//
// Every render replaces the whole app, so the focused element is thrown away
// with it. Before the redraw the focused control is remembered by the stable
// data-f identity authored on every form control. Other focusable elements
// keep their existing authored hooks. Afterwards the matching control gets
// focus back, with its caret where it was.

/** @typedef {{selector: string, index: number, unique: boolean, caret: [number, number | null] | null}} CapturedFocus */
/** @typedef {HTMLElement & {selectionStart?: number | null, selectionEnd?: number | null, setSelectionRange?: (start: number, end: number | null) => void}} FocusControl */

const ACTION_NAMES = [
    "id", "data-key", "data-custom-key", "data-trackball", "data-cell", "data-term", "data-macro", "data-channel", "data-row",
    "data-edit", "data-editmacro", "data-editpd", "data-pick", "data-lt", "data-mod", "data-screen", "data-tab",
    "data-ltab", "data-slot", "data-b", "data-helper", "data-repeat", "data-output", "data-target", "data-owner",
    "data-source", "data-mode", "data-anchor", "data-act", "data-step-text", "data-step-delay", "data-raw-payload",
];

/** @param {Element} root @returns {CapturedFocus | null} */
export function captureFocus(root) {
    const active = /** @type {FocusControl | null} */ (root.ownerDocument?.activeElement);
    if (!active || active === root.ownerDocument.body || !root.contains(active)) return null;
    const name = active.matches("input, select, textarea") ? "data-f"
        : ACTION_NAMES.find((attribute) => active.hasAttribute(attribute));
    if (!name || !active.hasAttribute(name)) return null;
    const value = active.getAttribute(name) ?? "";
    const selector = name === "id" ? `#${CSS.escape(value)}` : `${active.tagName.toLowerCase()}[${name}="${CSS.escape(value)}"]`;
    const matches = [...root.querySelectorAll(selector)];
    const unique = name === "data-f";
    if (unique && matches.length !== 1) return null;
    const index = matches.indexOf(active);
    /** @type {CapturedFocus["caret"]} */
    const caret = typeof active.selectionStart === "number" ? [active.selectionStart, active.selectionEnd ?? null] : null;
    return {selector, index, unique, caret};
}

/** @param {Element} root @param {CapturedFocus | null} captured */
export function restoreFocus(root, captured) {
    if (!captured) return;
    const matches = root.querySelectorAll(captured.selector);
    if (captured.unique && matches.length !== 1) return;
    const target = /** @type {FocusControl | undefined} */ (matches[captured.index] || matches[0]);
    if (!target || typeof target.focus !== "function") return;
    // A redraw may rebuild a disclosure closed. The field that had focus
    // stays reachable inside it, just as before that redraw.
    if (captured.unique) {
        for (let ancestor = target.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
            if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
        }
    }
    target.focus({preventScroll: true});
    if (captured.caret && typeof target.setSelectionRange === "function") {
        try { target.setSelectionRange(...captured.caret); } catch { /* a number input has no caret */ }
    }
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';

// A dialog that opens takes focus: whatever was focused behind it is not
// something the keyboard should keep acting on.
/** @param {Element} root */
export function focusDialog(root) {
    const dialogs = root.querySelectorAll(".scrim");
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog || dialog.contains(root.ownerDocument.activeElement)) return;
    const target = /** @type {HTMLElement | null} */ (dialog.querySelector(`input:not([disabled]), ${FOCUSABLE}`));
    target?.focus({preventScroll: true});
}

// Tab stays inside an open dialog: the last scrim on screen is the one in
// front, and focus wraps around its own controls rather than leaving it.
/** @param {Element} root @param {KeyboardEvent} event */
export function trapTab(root, event) {
    if (event.key !== "Tab") return false;
    const dialogs = root.querySelectorAll(".scrim");
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return false;
    const items = [.../** @type {NodeListOf<HTMLElement>} */ (dialog.querySelectorAll(FOCUSABLE))].filter((node) => !node.closest("[hidden]"));
    if (!items.length) return false;
    const at = items.findIndex(node => node === root.ownerDocument.activeElement);
    const next = event.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : (at < 0 || at === items.length - 1 ? 0 : at + 1);
    event.preventDefault();
    items[next].focus();
    return true;
}

// SVG keys are buttons to assistive tech but not to the browser, so Enter and
// Space do nothing on their own. They click; Enter on the board's selected key
// opens its picker, as a double-click does.
/** @param {KeyboardEvent} event */
export function activateOnKey(event) {
    if (event.key !== "Enter" && event.key !== " ") return false;
    const target = event.target;
    if (!(target instanceof Element) || target.getAttribute("role") !== "button" || target.tagName === "BUTTON") return false;
    event.preventDefault();
    const openInstead = event.key === "Enter" && target.matches("[data-key].sel");
    target.dispatchEvent(new MouseEvent(openInstead ? "dblclick" : "click", {bubbles: true}));
    return true;
}
