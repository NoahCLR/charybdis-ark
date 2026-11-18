// @ts-check
// Dragging a key on the board to swap it with another (ui/board.mjs draws
// the board and hands each key here).
//
// The key's picture follows the pointer and the key under it is marked, so
// the swap is visible before it lands; a press that never moves stays a
// click. Held over a layer tab for a moment, the drag shows that layer and
// the picture goes on following the pointer there, so it lands on a key of
// another layer: the two swap across layers in one step. Released anywhere
// else, or on Escape, nothing changes, and the board stays on the layer it
// shows. A layer switch draws the board afresh, so the key being carried is
// kept here, not on the board that started it, and each board drawn while it
// is carried takes it up (carryOnto). Its picture is drawn on a layer of its
// own over the page, laid over the board's drawing at the same scale, so it
// rides above the layer tabs and past the board's edge rather than under
// them.

import {render, showLayer, state} from "../store.mjs";
import {hideHover} from "./hover.mjs";

/**
 * @typedef {import("./surface-types.js").BoardNode} BoardNode
 * @typedef {import("./surface-types.js").BoardSwap} BoardSwap
 * @typedef {import("./surface-types.js").CarriedKey} CarriedKey
 */

const SVG = "http://www.w3.org/2000/svg";
const DRAG_THRESHOLD = 4;
const SPRING_MS = 400;

/** @type {CarriedKey | null} */
let carried = null;

/** @param {SVGSVGElement} svg @param {number} x @param {number} y */
const svgPoint = (svg, x, y) => {
    const matrix = svg.getScreenCTM();
    return matrix ? new DOMPoint(x, y).matrixTransform(matrix.inverse()) : new DOMPoint(x, y);
};

/** @param {BoardNode} node @param {SVGGElement} group @param {number} index @param {BoardSwap} swap */
export function dragToSwap(node, group, index, swap) {
    const svg = /** @type {SVGSVGElement} */ (node.querySelector("svg"));
    /** @type {{x: number, y: number} | null} */
    let pressed = null;

    group.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || carried) return;
        pressed = {x: event.clientX, y: event.clientY};
        group.setPointerCapture?.(event.pointerId);
    });
    group.addEventListener("pointermove", (event) => {
        if (!pressed || carried) return;
        if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < DRAG_THRESHOLD) return;
        const picture = swap.picture(index);
        if (!picture) return;
        const at = svgPoint(svg, pressed.x, pressed.y);
        pressed = null;
        hideHover();
        const press = {layer: swap.layer, index, node, picture, resting: group.getAttribute("transform") || "", at: {x: at.x, y: at.y}, pointerId: event.pointerId};
        const overlay = /** @type {SVGSVGElement} */ (document.createElementNS(SVG, "svg"));
        overlay.setAttribute("class", "drag-layer");
        overlay.setAttribute("viewBox", svg.getAttribute("viewBox") || "");
        overlay.setAttribute("aria-hidden", "true");
        const ghost = overlay.appendChild(/** @type {SVGGElement} */ (picture.cloneNode(true)));
        document.body.append(overlay);
        carried = {press, board: takeUp(press, node, swap), overlay, ghost, shift: {x: 0, y: 0}, target: null, tab: null, spring: undefined};
        place();
        // The page holds the pointer from here, so the drag outlives this
        // board when a layer switch replaces it.
        document.documentElement.setPointerCapture?.(event.pointerId);
        addEventListener("pointermove", follow);
        addEventListener("pointerup", land);
        addEventListener("pointercancel", drop);
        addEventListener("lostpointercapture", lost);
        addEventListener("keydown", escape, true);
        follow(event);
    });
    group.addEventListener("pointerup", () => { pressed = null; });
    group.addEventListener("pointercancel", () => { pressed = null; });
}

// A board drawn while a key is carried takes it up (takeUp). A tab held when
// the board is drawn again stays held, its moment still running, and the tab
// drawn afresh is marked once it is on the page, so its glow and filling bar
// carry on whether or not the pointer moves.
/** @param {BoardNode} node @param {BoardSwap} swap */
export function carryOnto(node, swap) {
    if (!carried) return;
    carried.board = takeUp(carried.press, node, swap);
    carried.target = null;
    queueMicrotask(() => {
        // The board is on the page now, so the picture's layer can be laid over it.
        place();
        const held = carried?.tab;
        const tab = held && document.querySelector(`.layer-tabs [data-layer="${held.layer}"]`);
        if (held && tab instanceof HTMLElement) markHeld(held.element = tab, held.since);
    });
}

// The board a key is carried over. On the layer it came from, the key
// itself is away, its place showing only the layer's light under it.
/** @param {import("./surface-types.js").KeyPress} press @param {BoardNode} node @param {BoardSwap} swap @returns {import("./surface-types.js").CarryingBoard} */
function takeUp(press, node, swap) {
    const svg = /** @type {SVGSVGElement} */ (node.querySelector("svg"));
    /** @type {SVGGElement | null} */
    const away = swap.layer === press.layer ? svg.querySelector(`[data-key="${press.index}"]`) : null;
    away?.classList.add("carried");
    return {node, svg, onSwap: swap.onSwap, away};
}

// Lays the picture's layer over the board's drawing, box for box, so the
// two share one scale, and moves the picture as far as the pointer has.
const place = () => {
    if (!carried) return;
    const {overlay, ghost, board: {svg}, press: {resting}, shift} = carried;
    if (svg.isConnected) {
        const box = svg.getBoundingClientRect();
        Object.assign(overlay.style, {left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`});
    }
    ghost.setAttribute("transform", `translate(${shift.x} ${shift.y}) ${resting}`.trim());
};

/** @param {PointerEvent} event */
function follow(event) {
    if (!carried || event.pointerId !== carried.press.pointerId) return;
    const at = svgPoint(carried.board.svg, event.clientX, event.clientY);
    carried.shift = {x: at.x - carried.press.at.x, y: at.y - carried.press.at.y};
    place();
    const {key, tab, onBoard} = hitAt(event);
    if (carried.target !== key) {
        carried.target?.classList.remove("drop-target");
        key?.classList.add("drop-target");
        carried.target = key;
    }
    // Off the board the picture fades: let go there and nothing happens, and
    // over the tabs it lets a held tab's glow and bar show through.
    carried.overlay.classList.toggle("off-board", !onBoard);
    springTo(tab && Number(tab.dataset.layer) !== state.layer ? tab : null);
}

// What lies under the pointer: a key of the board on screen, never the one
// that is away, a layer tab, and whether it is over the board at all.
/** @param {PointerEvent} event */
function hitAt(event) {
    const hits = document.elementsFromPoint(event.clientX, event.clientY);
    const svg = carried?.board.svg;
    const key = /** @type {SVGGElement | undefined} */ (hits.map((hit) => hit.closest("[data-key]"))
        .find((hit) => hit && svg?.contains(hit) && !hit.classList.contains("carried"))) ?? null;
    const tab = /** @type {HTMLElement | undefined} */ (hits.map((hit) => hit.closest(".layer-tabs [data-layer]")).find(Boolean)) ?? null;
    return {key, tab, onBoard: Boolean(carried && hits.includes(carried.board.node))};
}

// A layer tab held under the carried key switches to its layer after a
// moment, so passing over the tabs on the way to a key switches nothing. The
// tab is held by its layer, so the tab strip drawn afresh keeps the moment,
// and its tab shows how much of it has passed.
/** @param {HTMLElement | null} tab */
function springTo(tab) {
    if (!carried) return;
    const layer = tab ? Number(tab.dataset.layer) : null;
    const held = carried.tab;
    if (held && held.element !== tab) held.element.classList.remove("drop-target");
    if (held && tab && held.layer === layer) {
        if (held.element !== tab) markHeld(held.element = tab, held.since);
        return;
    }
    clearTimeout(carried.spring);
    carried.tab = null;
    if (!tab || layer === null) return;
    const since = performance.now();
    carried.tab = {layer, element: tab, since};
    markHeld(tab, since);
    carried.spring = setTimeout(() => {
        if (carried?.tab?.layer !== layer) return;
        // Its layer is shown now, so the tab is no longer held.
        carried.tab = null;
        showLayer(layer);
        render();
    }, SPRING_MS);
}

// The held tab's mark, with the moment it is held for and how much of it has
// passed, which its filling bar is drawn from (styles.css, .layer-tab.drop-target).
/** @param {HTMLElement} tab @param {number} since */
function markHeld(tab, since) {
    tab.style.setProperty("--spring", `${SPRING_MS}ms`);
    tab.style.setProperty("--spring-passed", `${Math.round(performance.now() - since)}ms`);
    tab.classList.add("drop-target");
}

/** @param {PointerEvent} event */
function land(event) {
    if (!carried || event.pointerId !== carried.press.pointerId) return;
    // A board redrawn while the key was carried that takes no swap (the
    // keyboard can no longer take an edit) did not take it up: nothing lands.
    const {key} = carried.board.svg.isConnected ? hitAt(event) : {key: null};
    const {press: {layer, index}, board: {node, onSwap}} = carried;
    finish();
    // The click that follows this release belongs to the drag, not a selection.
    node.justDragged = true;
    setTimeout(() => { node.justDragged = false; });
    if (key) onSwap(index, Number(key.dataset.key), layer);
}

/** @param {PointerEvent} event */
function drop(event) {
    if (carried && event.pointerId === carried.press.pointerId) finish();
}
// The page losing hold of the pointer without a release, as when the window
// loses focus mid-drag, drops the key where it was.
/** @param {PointerEvent} event */
function lost(event) {
    if (carried && event.target === document.documentElement && event.pointerId === carried.press.pointerId) finish();
}
/** @param {KeyboardEvent} event */
function escape(event) {
    if (!carried || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    finish();
}

// Ends the drag. On the board it started on, the key comes back to its
// place; a board drawn since is drawn afresh, without the picture over it.
function finish() {
    if (!carried) return;
    const {press, board, overlay, target, tab, spring} = carried;
    carried = null;
    clearTimeout(spring);
    removeEventListener("pointermove", follow);
    removeEventListener("pointerup", land);
    removeEventListener("pointercancel", drop);
    removeEventListener("lostpointercapture", lost);
    removeEventListener("keydown", escape, true);
    if (document.documentElement.hasPointerCapture?.(press.pointerId)) document.documentElement.releasePointerCapture(press.pointerId);
    target?.classList.remove("drop-target");
    tab?.element.classList.remove("drop-target");
    overlay.remove();
    if (board.node !== press.node) { render(); return; }
    board.away?.classList.remove("carried");
}
