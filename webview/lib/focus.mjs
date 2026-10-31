// @ts-check
// Keeping the keyboard's place across a redraw.
//
// Every render replaces the whole app, so the focused element is thrown away
// with it. Before the redraw the focused control is remembered by the stable
// data-f identity authored on every form control. Other focusable elements
// keep their existing authored hooks. Afterwards the matching control gets
// focus back, with its caret where it was.
//
// A text field commits on change, so what is typed into it is only on screen
// until then. The redraw keeps that text when it draws the field with the
// same value as before, and commits it once, on Enter or when the field is
// left. Chrome commits a typed field as it is thrown away, so that change is
// held back while the redraw decides: kept, the text commits later; not
// kept (the redraw draws another value, an edit having landed, or the field
// closed or gone), the held change goes on, as it would have. A field drawn
// closed (disabled, read-only) takes no edit, so it keeps no text.

/** @typedef {{value: string, rendered: string, field: HTMLInputElement | HTMLTextAreaElement, held: boolean, hold: (event: Event) => void}} Typed */
/** @typedef {{selector: string, index: number, unique: boolean, caret: [number, number | null] | null, typed: Typed | null}} CapturedFocus */
/** @typedef {HTMLElement & {selectionStart?: number | null, selectionEnd?: number | null, setSelectionRange?: (start: number, end: number | null) => void}} FocusControl */

const ACTION_NAMES = [
    "id", "data-key", "data-custom-key", "data-trackball", "data-cell", "data-term", "data-macro", "data-channel", "data-row",
    "data-edit", "data-editmacro", "data-editpd", "data-pick", "data-lt", "data-mod", "data-screen", "data-tab",
    "data-ltab", "data-slot", "data-b", "data-style", "data-repeat", "data-output", "data-target", "data-owner",
    "data-source", "data-mode", "data-anchor", "data-act", "data-step-text", "data-step-delay", "data-raw-payload",
];

// Between capture and restore the app is being drawn again: a field it
// throws away is not being left.
let redrawing = false;

/** @param {Element} root @returns {CapturedFocus | null} */
export function captureFocus(root) {
    redrawing = true;
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
    const text = caret && unique && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) ? active : null;
    /** @type {Typed | null} */
    const typed = text && text.value !== text.defaultValue ? {value: text.value, rendered: text.defaultValue, field: text, held: false,
        hold: (event) => {event.stopImmediatePropagation(); if (typed) typed.held = true;}} : null;
    typed?.field.addEventListener("change", typed.hold, {capture: true});
    return {selector, index, unique, caret, typed};
}

// The typed field's own change goes on: it is not held back any more, and
// one already held is sent as the browser sent it.
/** @param {Typed | null} typed */
function letGo(typed) {
    if (!typed) return;
    typed.field.removeEventListener("change", typed.hold, {capture: true});
    if (typed.held) typed.field.dispatchEvent(new Event("change", {bubbles: true}));
}

// `field` keeps what was typed: the field it was typed in, kept by the
// redraw, or one drawn anew in its place, which takes the text, its own
// listeners following it as they followed the typing (a name's byte count);
// the field thrown away stays held back. Text set from code, or whose change
// was held, is no longer typed, so the browser would commit it neither on
// Enter nor on blur. The change is sent here instead, once: unless more was
// typed and the browser sends its own, or the next redraw takes the text over.
/** @param {Typed} typed @param {HTMLInputElement | HTMLTextAreaElement} field */
function keepTyped(typed, field) {
    if (field === typed.field) {
        field.removeEventListener("change", typed.hold, {capture: true});
        if (!typed.held) return;
    } else {
        field.value = typed.value;
        field.dispatchEvent(new Event("input", {bubbles: true}));
    }
    const commit = () => {
        field.removeEventListener("blur", commit);
        field.removeEventListener("keydown", enter);
        if (!redrawing && field.isConnected && field.value === typed.value) field.dispatchEvent(new Event("change", {bubbles: true}));
    };
    /** @param {Event} event */
    const enter = (event) => {if (/** @type {KeyboardEvent} */ (event).key === "Enter" && field instanceof HTMLInputElement) commit();};
    field.addEventListener("blur", commit);
    field.addEventListener("keydown", enter);
}

/** @param {Element} root @param {CapturedFocus | null} captured */
export function restoreFocus(root, captured) {
    redrawing = false;
    if (!captured) return;
    const matches = root.querySelectorAll(captured.selector);
    const target = /** @type {FocusControl | undefined} */ (matches[captured.index] || matches[0]);
    if ((captured.unique && matches.length !== 1) || !target || typeof target.focus !== "function") {letGo(captured.typed); return;}
    // A redraw may rebuild a disclosure closed. The field that had focus
    // stays reachable inside it, just as before that redraw.
    if (captured.unique) {
        for (let ancestor = target.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
            if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
        }
    }
    target.focus({preventScroll: true});
    const typed = captured.typed, field = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : null;
    if (typed && field && !field.disabled && !field.readOnly && field.defaultValue === typed.rendered) keepTyped(typed, field);
    else letGo(typed);
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
