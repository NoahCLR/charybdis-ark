// @ts-check
// The layer stack: what each layer is called, and which one wins.
//
// It hangs off the layer tabs rather than the workbench below, because it is
// not a property of the selected key like the tabs there are — it is the tabs
// themselves, so the control sits after the last layer and opens upward over
// the board, since the tabs sit at the board's foot.
//
// The order is the core's to hold. Moving a layer rewrites every key, behaviour
// and setting that refers to it, so the edit is staged there and arrives back
// as `portable.layers`. "Keys follow their layers" (on by default) decides
// whether layer keys are renumbered with the move or keep their numbers.
//
// A layer is moved by dragging its row by the grip on its left (or, focused
// there, with the arrow keys). The bottom row is the base: always on, and what
// every transparent key falls through to. It is not dragged; Make base on
// another row swaps that layer into it.

// Selector assertions refer to elements created by this module's authored markup.
import * as controls from "../view/controls.mjs";
import {el, esc} from "../lib/dom.mjs";
import {mappedKeyCount} from "../view/lighting.mjs";
import {NAME_TIP} from "../view/names.mjs";
import {countNameBytes} from "./title-name.mjs";
import {getModel, layers, post, render, state, canEdit as canEditArea} from "../store.mjs";

/** @type {((event: PointerEvent) => void) | null} */
let dismiss = null;   // the outside-click listener for the open panel

// Adds the trigger after the layer tabs and, while it is open, the panel
// above them. Both sit on the tabs' wrapper, not inside the strip, which
// scrolls sideways and would hide the one and clip the other.
/** @param {HTMLElement} bar */
export function attachLayersControl(bar) {
    const model = getModel();
    /** @type {Partial<import("../../contracts/panel.js").PublishedModel["portable"]>} */
    const portable = model?.portable || {};
    const busy = Boolean(portable.busy);
    const canEdit = canEditArea("layers");

    const trigger = el(`<button class="layer-edit" aria-haspopup="dialog" aria-expanded="${Boolean(state.layersOpen)}"
        data-tip="Rename layers and change their order: a higher layer wins over the ones under it.">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 13V3M2.5 5.5 5 3l2.5 2.5M11 3v10M8.5 10.5 11 13l2.5-2.5"/></svg>
        <span>Rename &amp; Reorder</span></button>`);
    trigger.addEventListener("click", () => {
        if (state.layersOpen) discardLayers();
        else state.layersOpen = true;
        render();
    });
    bar.append(trigger);
    if (!state.layersOpen) {
        closeDismiss();
        return;
    }

    const panel = el(`<div class="layerpanel" role="dialog" aria-label="Layers"></div>`);
    if (!portable.layers) {
        panel.append(el(`<p class="note">${esc(canEdit ? "Reading the layer stack…"
            : "Connect a keyboard with complete-profile firmware to rename or reorder its layers.")}</p>`));
        // One request per opening: the stack is read from the keyboard, or
        // lifted from the draft when one is open.
        if (canEdit && !state.layersAsked) {
            state.layersAsked = true;
            post(controls.control("managePortableLayers"));
        }
    } else {
        panel.append(editor(model, {...portable, layers: portable.layers}, busy));
    }
    bar.append(panel);
    // The row is measured once it is on screen; render attaches it afterwards.
    requestAnimationFrame(() => placePanel(bar, panel));
    watchOutside(panel, trigger);
}

// The panel opens upward over the board, above the tabs. The room is what the
// scrolling area shows above the tabs, not the window. When the panel is
// taller than that, the area scrolls back up (bringing the tabs down toward
// the draft bar at the window's foot) and whatever still does not fit scrolls
// in the panel's list, under its heading and above its buttons.
/** @param {HTMLElement} bar @param {HTMLElement} panel */
function placePanel(bar, panel) {
    if (!panel.isConnected) return;
    const margin = 12;
    const rowOf = () => (/** @type {HTMLElement} */ (bar.querySelector(".layer-tabs")) || bar).getBoundingClientRect();
    let scroller = bar.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const viewOf = () => scroller ? scroller.getBoundingClientRect() : {top: 0, bottom: window.innerHeight};
    const floor = () => {
        const draftBar = /** @type {HTMLElement | null} */ (document.querySelector(".commit"))?.getBoundingClientRect();
        return draftBar && draftBar.height ? Math.min(viewOf().bottom, draftBar.top) : viewOf().bottom;
    };
    const roomAbove = () => rowOf().top - viewOf().top - margin;
    const shortfall = panel.scrollHeight - roomAbove();
    if (shortfall > 0 && scroller) scroller.scrollTop -= Math.max(0, Math.min(shortfall, floor() - rowOf().bottom - margin));
    panel.style.maxHeight = `${Math.max(160, Math.floor(roomAbove()))}px`;
}

/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {Partial<import("../../contracts/panel.js").PublishedModel["portable"]> & {layers: import("./surface-types.js").LayerStack}} portable @param {boolean} busy */
function editor(model, portable, busy) {
    // Priority reads top-down, so the highest layer comes first; the device
    // model counts the other way.
    const names = [...portable.layers.names];
    const order = [...portable.layers.order].reverse();
    const follow = portable.layers.keysFollow !== false;
    const node = el(`<div class="layerpanel-body">
        <div class="sect-h"><h4>Layers</h4><span class="note">higher layers win · drag a row to move it</span></div>
        <div class="list"></div>
        <div class="stack layerpanel-actions">
            <div class="stack">
                <label class="sw"><input type="checkbox" id="layerKeysFollow" data-f="layers:keys-follow" data-act="follow" ${follow ? "checked" : ""} ${busy ? "disabled" : ""}>
                    <span class="track"></span><span class="txt">Keys follow their layers</span></label>
                <span class="note">${follow
                    ? "Layer keys (MO, LT, TG, TO, TT, OSL…) are renumbered with the move, so each still reaches the same layer. Make base swaps the two roles: a key that reached the new base reaches the old one."
                    : "Layer keys keep their numbers: a key set to MO(1) reaches whatever layer is now 1. Names, colours and the pointer and sniping settings still move with their layer, and Make base still swaps the keys that reach the two layers."}</span>
            </div>
            <div class="row">
                <button class="btn primary" data-act="save" ${busy ? "disabled" : ""}>Keep layers in draft</button>
                <button class="btn ghost" data-act="cancel" ${busy ? "disabled" : ""}>Discard</button>
            </div>
        </div></div>`);

    const list = /** @type {HTMLElement} */ (node.querySelector(".list"));
    order.forEach((layerId) => {
        const position = portable.layers.order.indexOf(layerId);
        const layer = layers().find((entry) => entry.index === layerId);
        const mapped = mappedKeyCount(layer);
        const base = position === 0;
        const label = names[layerId] || (layerId ? `Layer ${layerId}` : "Base");
        const row = el(`<div class="list-row lp-row${base ? " base" : ""}" data-row="${esc(layerId)}">
            ${base ? `<span class="lp-grip-slot" aria-hidden="true"></span>`
                : `<button class="lp-grip" data-grip="${esc(layerId)}" ${busy ? "disabled" : ""} aria-label="Move ${esc(label)}: drag, or press the up and down arrows"
                    data-tip="Drag to move this layer, or focus it and press ↑ ↓.">${GRIP}</button>`}
            <span class="note mono">${esc(layerId)}</span>
            <span class="name-bytes"><input data-f="layer:${esc(layerId)}:name" class="input" value="${esc(names[layerId])}" data-name="${esc(layerId)}" ${busy ? "disabled" : ""} data-tip="${esc(NAME_TIP)}"
                aria-label="${layerId ? `Name for layer ${esc(layerId)}` : "Base layer name"}"><span class="note name-bytes-count" data-name-count></span></span>
            <span class="note ${mapped ? "" : "dim"}">${mapped ? `${mapped} key${mapped === 1 ? "" : "s"}` : "nothing mapped"}</span>
            ${base ? `<span class="tag lp-base" data-tip="Always on, and what every transparent key falls through to.">base</span>`
                : `<button class="btn tiny ghost" data-base="${esc(layerId)}" ${busy ? "disabled" : ""}
                    data-tip="Put this layer at the bottom. Its transparent keys become KC_NO; KC_NO on the former base becomes transparent. An uncoloured former base gets the saved base colour.">Make base</button>`}</div>`);
        countNameBytes(/** @type {HTMLInputElement} */ (row.querySelector("[data-name]")), /** @type {HTMLElement} */ (row.querySelector("[data-name-count]")));
        list.append(row);
    });

    const currentNames = () => {
        /** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("[data-name]")).forEach((input) => { names[Number(input.dataset.name)] = input.value.trim(); });
        return [...names];
    };
    /** @type {HTMLInputElement} */ (node.querySelector('[data-act="follow"]')).addEventListener("change", (event) => post(controls.layersFollow(/** @type {HTMLInputElement} */ (event.target).checked, currentNames())));
    /** @param {number} id @param {import("../view/controls.mjs").LayerMove} change */
    const move = (id, change) => post(controls.moveLayer(id, change, currentNames()));
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-base]")).forEach((button) => button.addEventListener("click", () => move(Number(button.dataset.base), {makeBase: true})));
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-grip]")).forEach((grip) => {
        const id = Number(grip.dataset.grip);
        grip.addEventListener("keydown", (event) => {
            const direction = /** @type {Record<string, 1 | -1>} */ ({ArrowUp: 1, ArrowDown: -1})[event.key];
            const position = portable.layers.order.indexOf(id);
            if (!direction || position + direction < 1 || position + direction >= portable.layers.order.length) return;
            event.preventDefault();
            state.layerGripFocus = id;
            move(id, {direction});
        });
        grip.addEventListener("pointerdown", (event) => dragRow(event, list, id, (to) => move(id, {to})));
    });
    // The grip a key moved keeps the focus, so the arrows can carry on.
    if (state.layerGripFocus !== undefined) {
        const focused = state.layerGripFocus;
        state.layerGripFocus = undefined;
        requestAnimationFrame(() => /** @type {HTMLElement | null} */ (list.querySelector(`[data-grip="${focused}"]`))?.focus());
    }
    // Both close the panel here rather than waiting for the core's answer: the
    // row underneath shows the result, and a panel left open over it would only
    // hide what it changed.
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="save"]')).addEventListener("click", () => {
        post(controls.saveLayers(currentNames()));
        closeLayers();
        render();
    });
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="cancel"]')).addEventListener("click", () => {
        discardLayers();
        render();
    });
    return node;
}

// The classic grip: two columns of three dots.
const GRIP = `<svg viewBox="0 0 10 16" aria-hidden="true">${[3, 8, 13].map((y) => `<circle cx="3" cy="${y}" r="1.3"/><circle cx="7" cy="${y}" r="1.3"/>`).join("")}</svg>`;

// Drags a row by its grip. The row follows the pointer and the others make
// room as it passes their middles; the base row stays put below them. On
// release the row's place is posted as the slot it lands in: rows read top
// down from the highest slot, with the base below every draggable row.
/** @param {PointerEvent} event @param {HTMLElement} list @param {number} id @param {(to: number) => void} drop */
function dragRow(event, list, id, drop) {
    if (event.button !== 0) return;
    const row = /** @type {HTMLElement} */ (list.querySelector(`[data-row="${id}"]`));
    const rows = () => [.../** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll(".lp-row:not(.base)"))];
    const start = rows().indexOf(row);
    if (!row || start < 0) return;
    event.preventDefault();
    const originY = event.clientY;
    let moved = false;
    row.classList.add("dragging");
    list.classList.add("sorting");
    /** @param {PointerEvent} next */
    const onMove = (next) => {
        const dy = next.clientY - originY;
        if (!moved && Math.abs(dy) < 3) return;
        moved = true;
        row.style.transform = "";
        const others = rows().filter((other) => other !== row);
        const before = others.find((other) => {
            const box = other.getBoundingClientRect();
            return next.clientY < box.top + box.height / 2;
        });
        list.insertBefore(row, before || /** @type {HTMLElement} */ (list.querySelector(".lp-row.base")));
        const box = row.getBoundingClientRect();
        row.style.transform = `translateY(${Math.max(-box.height, Math.min(box.height, next.clientY - (box.top + box.height / 2)))}px)`;
    };
    const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        row.classList.remove("dragging");
        list.classList.remove("sorting");
        row.style.transform = "";
        const index = rows().indexOf(row);
        if (moved && index !== start) drop(rows().length - index);
    };
    // The window hears the pointer wherever it goes, off the grip included.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
}

export function closeLayers() {
    closeDismiss();
    state.layersOpen = false;
    state.layersAsked = false;
}

// Moves and Make base stay pending in the core until Keep layers in draft, so
// every other way of closing the panel (Discard, Escape, a click outside it or
// on its trigger) drops them, and it opens again on the draft's order.
export function discardLayers() {
    post(controls.control("cancelPortableReview"));
    closeLayers();
}

function closeDismiss() {
    if (!dismiss) return;
    document.removeEventListener("pointerdown", dismiss, true);
    dismiss = null;
}

/** @param {HTMLElement} panel @param {HTMLElement} trigger */
function watchOutside(panel, trigger) {
    closeDismiss();
    dismiss = (event) => {
        if (panel.contains(/** @type {Node | null} */ (event.target)) || trigger.contains(/** @type {Node | null} */ (event.target))) return;
        discardLayers();
        render();
    };
    document.addEventListener("pointerdown", dismiss, true);
}
