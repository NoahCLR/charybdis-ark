// @ts-check
// The layer tabs, and the swatch a layer shows its colour with.

// Selector assertions refer to elements created by this module's authored markup.
import {css, isOff, label as hsvLabel} from "../lib/colour.mjs";
import {el, esc} from "../lib/dom.mjs";
import {scrollMotion} from "../lib/scroll.mjs";
import {currentView, getModel, render, showLayer, state, toggleLayerOn} from "../store.mjs";
import {layerCalled} from "../view/vocabulary.mjs";
import {layerColourRow, stageEnabled} from "../view/lighting.mjs";
import {draftMarks} from "../view/review.mjs";
import {editWords} from "../view/edit-mode.mjs";
import {modifierKey} from "../view/shortcuts.mjs";
import {foldEmptyLayers} from "../view/empty-layers.mjs";
import {emptyLayersButton, emptyLayersShown} from "./empty-layers.mjs";
import {rovingTabs} from "../lib/tabs.mjs";

// A layer's swatch and how it is lit, the same wherever its colour is shown,
// and the colour its mark wears (ui/marks.mjs): a layer whose colour is off, or
// whose stage is off, shows as unlit.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {Pick<import("../../contracts/panel.js").Layer, "index"> & Partial<import("../../contracts/panel.js").Layer>} layer @param {string} [className] */
export function layerSwatch(model, layer, className = "") {
    const row = layerColourRow(model, layer.index);
    const lit = stageEnabled(model, "layers") && row && !isOff(row.color);
    return {
        html: `<span class="${className ? `${esc(className)} ` : ""}swatch ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.color)}` : ""}"></span>`,
        tip: `${layerCalled(layer)} · ${lit ? hsvLabel(row.color) : "no layer colour"}`,
        colour: lit ? css(row.color) : null,
    };
}

// The modifier a click adds a layer to the preview with (view/shortcuts.mjs).
const ADD_KEY = modifierKey();

// The layer tabs. Which layer you are looking at is a property of the
// keyboard, not of a screen, so Keys and Lighting share one control, and it
// sits on the board it chooses for: the picked layer's tab opens into it.
// A layer named only by its number shows that number once.
// ⌘-click previews more layers on together (view/layer-set.mjs); the highest
// keeps the tab that opens into the board, the others and base show as on.
// ⌘-clicking base alone previews the picked layer over base.
// Empty layers fold behind a disclosure after the strip (D-L76); the picked
// layer and the layers previewed with it always show, and the ones it reveals
// come after the others, so no tab moves.
export function layerBar(trailing = "") {
    const model = getModel();
    const drafted = draftMarks(model?.draft?.changes).layers;
    const view = currentView();
    const held = new Set(view.held);
    const {shown, folded} = foldEmptyLayers(model, view.stack, (layer) => layer.index, (layer) => layer.index === state.layer || held.has(layer.index));
    const listed = emptyLayersShown("layer-bar") ? [...shown, ...folded] : shown;
    const tabs = listed.map((layer) => {
        const index = layer.index;
        const swatch = layerSwatch(model, layer);
        const on = held.has(index) || (index === 0 && view.previewing);
        const baseOnly = held.size === 1 && held.has(0);
        const how = index === state.layer && view.previewing
            ? " · on top, so it wins · edits go here"
            : index === 0 ? (baseOnly ? ` · on in this preview · ${ADD_KEY}-click to turn off`
                : on ? " · always on" : state.layer > 0 ? ` · ${ADD_KEY}-click to preview under the picked layer` : "")
            : on ? ` · on in this preview · ${ADD_KEY}-click to turn off`
            : ` · ${ADD_KEY}-click to preview with the layers on`;
        // A layer on under the top one is tinted with its own light, so the
        // set reads at a glance without being mistaken for the picked tab.
        const tint = on && swatch.colour ? ` style="--tab-tint:${swatch.colour}"` : "";
        return `<button class="layer-tab${on ? " on" : ""}"${tint} role="tab" id="layer-tab-${esc(index)}" data-layer="${esc(index)}" aria-selected="${state.layer === index}"
            data-tip="${esc(swatch.tip)}${drafted.has(layer.index) ? ` · ${esc(editWords(model?.draft).after)}` : ""}${esc(how)}">${swatch.html}
            <span>${esc(layerCalled(layer))}</span>${layerCalled(layer) === layer.name ? "" : `<span class="idx">${esc(layer.index)}</span>`}${drafted.has(layer.index) ? '<i class="draft-dot"></i>' : ""}</button>`;
    }).join("");
    const node = el(`<div class="layerbar-wrap"><div class="layer-tabs" id="layer-tabs" role="tablist" aria-label="Layers">${tabs}${trailing}</div></div>`);
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-layer]")).forEach((button) => button.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey) toggleLayerOn(Number(button.dataset.layer));
        else showLayer(Number(button.dataset.layer));
        render();
    }));
    keepInView(/** @type {HTMLElement} */ (node.querySelector(".layer-tabs")));
    // The tabs pick the layer the board shows; the screen links the board as
    // their panel once it is drawn (linkTabPanel).
    rovingTabs(/** @type {HTMLElement} */ (node.querySelector(".layer-tabs")));
    if (folded.length) node.append(emptyLayersButton("layer-bar", folded.length, "layer-empties"));
    return node;
}

// A strip of tabs too long for its width scrolls sideways; every render
// builds it afresh, so it brings its picked tab back into view once drawn,
// and fades the edge that has more tabs beyond it. While it does not fit, an
// arrow at each end, outside what scrolls, says so and scrolls it a page,
// and the arrow on an end with nothing beyond it is dimmed. The arrows only
// repeat what scrolling and Tab do, so they stay out of the tab order.
/** @param {HTMLElement | null} strip */
export function keepInView(strip) {
    if (!strip) return;
    /** @param {"left" | "right"} side */
    const arrow = (side) => {
        const button = /** @type {HTMLButtonElement} */ (el(`<button class="strip-more ${side}" tabindex="-1" aria-hidden="true" hidden>
            <svg viewBox="0 0 10 10"><path d="${side === "left" ? "M6.5 2 3.5 5l3 3" : "M3.5 2l3 3-3 3"}"/></svg></button>`));
        button.addEventListener("click", () => strip.scrollBy({left: (side === "left" ? -1 : 1) * strip.clientWidth * 0.7, behavior: scrollMotion()}));
        return button;
    };
    const left = arrow("left"), right = arrow("right");
    strip.before(left);
    strip.after(right);
    const edges = () => {
        const before = strip.scrollLeft > 1, beyond = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
        strip.classList.toggle("more-left", before);
        strip.classList.toggle("more-right", beyond);
        left.hidden = right.hidden = !before && !beyond;
        left.disabled = !before;
        right.disabled = !beyond;
    };
    strip.addEventListener("scroll", edges, {passive: true});
    // Showing the arrows narrows the strip, so a resize is answered a frame
    // later, never inside the observer's own pass.
    new ResizeObserver(() => requestAnimationFrame(edges)).observe(strip);
    requestAnimationFrame(() => {
        const tab = strip.isConnected && /** @type {HTMLSelectElement} */ (strip.querySelector('[aria-selected="true"]'));
        if (!tab) return;
        // The arrows narrow the strip, so they are settled before measuring.
        edges();
        const start = tab.offsetLeft - 28, end = tab.offsetLeft + tab.offsetWidth + 28;
        if (start < strip.scrollLeft) strip.scrollLeft = start;
        else if (end > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = end - strip.clientWidth;
        edges();
    });
}
