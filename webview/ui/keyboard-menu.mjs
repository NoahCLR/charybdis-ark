// @ts-check
// The keyboard button under the rail's mark, and its menu: the edit modes,
// the keyboards to switch between, Choose keyboard and Disconnect. The button
// names the keyboard and its edit mode; its dot says how the keyboard is.
//
// Whether the menu is open is the panel's state, not the page's: every model
// publish redraws the rail, so an open menu is drawn open again and focus is
// kept on its item by id (lib/focus.mjs). It works from the keyboard as a
// menu button does: Enter, Space or the arrows open it on an item, the arrows,
// Home and End move, Enter chooses, and Esc or Tab closes it with focus back
// on the button.

// Selector assertions refer to elements created by this module's authored markup.
import * as controls from "../view/controls.mjs";
import {esc} from "../lib/dom.mjs";
import {getModel, post, postLeavingDemo, render, state} from "../store.mjs";
import {NOT_STORED_TIP, SETTLE_TIP, keyboardControl} from "../view/keyboard-menu.mjs";
import {chooseKeyboard, forgetKeyboard} from "../view/shell-panel.mjs";
import {chooseMode} from "./edit-mode.mjs";

// The items the arrows move between: a mode Ark does not offer is skipped.
const ITEMS = '[role^="menuitem"]:not([disabled])';

/** @type {((event: PointerEvent) => void) | null} */
let dismiss = null;   // the outside-click listener for the open menu

export function keyboardMenu() {
    const control = keyboardControl(getModel());
    // A busy keyboard takes no choice, so the menu closes with it.
    if (control.disabled || !control.opens) closeKeyboardMenu();
    const open = Boolean(state.railMenu);
    const {dot, mode} = control;
    const inner = `<i class="dot ${esc(dot.tone)}${dot.busy ? " busy" : ""}" data-tip="${esc(dot.tip)}"></i>
        <span class="rail-keyboard-text"><span class="rail-product">${esc(control.name)}</span>${mode ? `
            <span class="rail-mode" data-tip="${esc(mode.detail)}">${esc(mode.label)}${mode.warn ? ` <i class="dot warn" data-tip="${esc(mode.warn)}"></i>` : ""}</span>` : ""}</span>`;
    // What the dot says on hover, said to a screen reader as the button's description.
    const status = `<span class="sr" id="rail-keyboard-status">${esc([dot.tip, mode?.warn].filter(Boolean).join(" "))}</span>`;
    if (!control.opens) return `<div class="rail-keyboard-wrap"><div class="rail-keyboard">${inner}</div>${status}</div>`;
    return `<div class="rail-keyboard-wrap">
        <button class="rail-keyboard" id="rail-keyboard" data-act="keyboard-menu" aria-haspopup="menu" aria-expanded="${open}"
            ${open ? 'aria-controls="rail-menu"' : ""} aria-describedby="rail-keyboard-status" ${control.disabled ? "disabled" : ""}>
            ${inner}<span class="rail-chevron" aria-hidden="true">▾</span></button>
        ${status}${open ? menu(control) : ""}</div>`;
}

/** @param {ReturnType<typeof keyboardControl>} control */
function menu(control) {
    /** @param {string} id @param {string} label */
    const heading = (id, label) => `<div class="rail-menu-h" id="${id}" role="presentation">${esc(label)}</div>`;
    /** @param {boolean} on */
    const tick = (on) => `<span class="rail-menu-tick" aria-hidden="true">${on ? "✓" : ""}</span>`;
    const sections = [];
    const edits = control.edits;
    if (edits) sections.push(`${heading("rail-menu-edits", "Edits")}<div role="group" aria-labelledby="rail-menu-edits">
        ${edits.choices.map((choice) => `<button class="rail-menu-item" role="menuitemradio" aria-checked="${choice.current ? "true" : "false"}" tabindex="-1"
            id="rail-menu-mode-${esc(choice.value)}" data-act="edit-mode" data-edit-mode="${esc(choice.value)}" data-tip="${esc(choice.detail)}" ${choice.offered ? "" : "disabled"}>
            ${tick(choice.current)}<span class="rail-menu-text">${esc(choice.label)}${choice.hint ? `<span class="rail-menu-hint">${esc(choice.hint)}</span>` : ""}</span></button>`).join("")}
        ${edits.settle ? `<button class="rail-menu-item" role="menuitem" tabindex="-1" id="rail-menu-settle" data-act="edit-mode-settle" data-tip="${esc(SETTLE_TIP)}">
            <span class="rail-menu-tick" aria-hidden="true"><i class="dot warn"></i></span><span class="rail-menu-text">Settle<span class="rail-menu-hint">Store this mode on both halves</span></span></button>` : ""}
        ${edits.notStored ? `<div class="rail-menu-note" role="none" data-tip="${esc(NOT_STORED_TIP)}"><span class="rail-menu-tick"><i class="dot warn"></i></span>
            <span>Not stored on the keyboard yet</span></div>` : ""}</div>`);
    if (control.keyboards.length) sections.push(`${heading("rail-menu-keyboards", "Keyboard")}<div role="group" aria-labelledby="rail-menu-keyboards">
        ${control.keyboards.map((entry) => `<button class="rail-menu-item" role="menuitemradio" aria-checked="${entry.current ? "true" : "false"}" tabindex="-1"
            id="rail-menu-device-${esc(entry.id)}" data-act="select-device" data-device="${esc(entry.id)}">
            ${tick(entry.current)}<span class="rail-menu-text">${esc(entry.label)}</span></button>`).join("")}</div>`);
    if (control.choose) sections.push(`<button class="rail-menu-item" role="menuitem" tabindex="-1" id="rail-menu-choose" data-act="choose-keyboard"
            data-tip="Pick a Charybdis in the browser's list. Once chosen, it reconnects by itself next time.">${tick(false)}<span class="rail-menu-text">Choose keyboard…</span></button>
        ${control.disconnect ? `<button class="rail-menu-item quiet" role="menuitem" tabindex="-1" id="rail-menu-forget" data-act="forget-keyboard"
            data-tip="Let go of this keyboard. The page will not open it again until you choose it.">${tick(false)}<span class="rail-menu-text">Disconnect</span></button>` : ""}`);
    return `<div class="rail-menu" id="rail-menu" role="menu" aria-labelledby="rail-keyboard">
        ${sections.join('<div class="rail-menu-sep" role="separator"></div>')}</div>`;
}

/** @param {HTMLElement} node */
export function bindKeyboardMenu(node) {
    const button = /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="keyboard-menu"]'));
    if (!button) return;
    button.addEventListener("click", () => {
        if (state.railMenu) { closeKeyboardMenu(); render(); focusButton(); return; }
        openMenu("first");
    });
    button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        openMenu(event.key === "ArrowUp" ? "last" : "first");
    });
    const list = /** @type {HTMLElement | null} */ (node.querySelector("#rail-menu"));
    if (!list) return;
    list.addEventListener("keydown", (event) => {
        const items = [.../** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll(ITEMS))];
        const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        const step = /** @type {Record<string, number>} */ ({ArrowDown: 1, ArrowUp: -1})[event.key];
        if (step) items[(at + step + items.length) % items.length]?.focus();
        else if (event.key === "Home") items[0]?.focus();
        else if (event.key === "End") items[items.length - 1]?.focus();
        else if (event.key === "Escape" || event.key === "Tab") { closeKeyboardMenu(); render(); focusButton(); }
        else return;
        event.preventDefault();
        event.stopPropagation();
    });
    list.addEventListener("click", (event) => {
        const item = /** @type {HTMLButtonElement | null} */ (/** @type {Element} */ (event.target).closest('[role^="menuitem"]'));
        if (!item || item.disabled) return;
        closeKeyboardMenu();
        choose(item);
        render();
        // A choice that asks first (a mode's question, leaving the demo) has
        // the dialog's focus; anything else hands it back to the button.
        if (!document.querySelector(".scrim")) focusButton();
    });
    watchOutside(list, button);
}

// What each item does is what the controls it replaced did: a mode runs the
// same switch, with its questions; Settle chooses the current mode again.
/** @param {HTMLButtonElement} item */
function choose(item) {
    const act = item.dataset.act;
    if (act === "edit-mode") {
        const mode = Number(item.dataset.editMode);
        if (item.getAttribute("aria-checked") !== "true") chooseMode(mode);
    } else if (act === "edit-mode-settle") {
        const mode = getModel()?.editMode?.mode;
        if (mode !== undefined) chooseMode(mode);
    } else if (act === "select-device") {
        if (item.getAttribute("aria-checked") !== "true") post(controls.selectDevice(item.dataset.device || ""));
    // From the demo, choosing a keyboard leaves it, asking first.
    } else if (act === "choose-keyboard") postLeavingDemo(chooseKeyboard());
    else if (act === "forget-keyboard") post(forgetKeyboard());
}

/** @param {"first" | "last"} where */
function openMenu(where) {
    state.railMenu = true;
    render();
    const items = [.../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(`#rail-menu ${ITEMS}`))];
    // The menu opens on the current mode, as a select opens on its choice.
    const target = where === "last" ? items[items.length - 1] : items.find((item) => item.getAttribute("aria-checked") === "true") || items[0];
    target?.focus();
}

function focusButton() {
    /** @type {HTMLElement | null} */ (document.querySelector('[data-act="keyboard-menu"]'))?.focus();
}

export function closeKeyboardMenu() {
    state.railMenu = false;
    if (!dismiss) return;
    document.removeEventListener("pointerdown", dismiss, true);
    dismiss = null;
}

// Esc anywhere closes an open menu, focus back on its button.
export function escapeKeyboardMenu() {
    if (!state.railMenu) return false;
    closeKeyboardMenu();
    render();
    focusButton();
    return true;
}

// A press outside closes the menu. The menu is taken out in place rather than
// by a redraw, so the press still lands on what it was on (a screen in the
// rail, a key on the board).
/** @param {HTMLElement} list @param {HTMLElement} trigger */
function watchOutside(list, trigger) {
    if (dismiss) document.removeEventListener("pointerdown", dismiss, true);
    dismiss = (event) => {
        const target = /** @type {Node | null} */ (event.target);
        if (list.contains(target) || trigger.contains(target)) return;
        closeKeyboardMenu();
        list.remove();
        trigger.setAttribute("aria-expanded", "false");
        trigger.removeAttribute("aria-controls");
    };
    document.addEventListener("pointerdown", dismiss, true);
}
