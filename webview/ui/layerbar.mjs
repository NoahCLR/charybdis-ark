// @ts-check
// The layer tabs, and the swatch a layer shows its colour with.

// Selector assertions refer to elements created by this module's authored markup.
import {css, isOff, label as hsvLabel} from "../lib/colour.mjs";
import {el, esc} from "../lib/dom.mjs";
import {getModel, heldLayers, layerName, layers, previewing, render, showLayer, state, toggleLayerOn} from "../store.mjs";
import {layerColourRow, stageEnabled} from "../view/lighting.mjs";
import {draftMarks} from "../view/review.mjs";
import {modifierKey} from "../view/shortcuts.mjs";

// A layer's swatch and how it is lit, the same wherever its colour is shown,
// and the colour its mark wears (ui/marks.mjs): a layer whose colour is off, or
// whose stage is off, shows as unlit.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {Pick<import("../../contracts/panel.js").Layer, "index"> & Partial<import("../../contracts/panel.js").Layer>} layer @param {string} [className] */
export function layerSwatch(model, layer, className = "") {
    const row = layerColourRow(model, layer.index);
    const lit = stageEnabled(model, "layers") && row && !isOff(row.color);
    return {
        html: `<span class="${className ? `${esc(className)} ` : ""}swatch ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.color)}` : ""}"></span>`,
        tip: `${layerName(layer)} · ${lit ? hsvLabel(row.color) : "no layer colour"}`,
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
export function layerBar(trailing = "") {
    const model = getModel();
    const drafted = draftMarks(model?.draft?.changes).layers;
    const held = new Set(heldLayers());
    const tabs = layers().map((layer, index) => {
        const swatch = layerSwatch(model, layer);
        const on = held.has(index) || (index === 0 && previewing());
        const baseOnly = held.size === 1 && held.has(0);
        const how = index === state.layer && previewing()
            ? " · on top, so it wins · edits go here"
            : index === 0 ? (baseOnly ? ` · on in this preview · ${ADD_KEY}-click to turn off`
                : on ? " · always on" : state.layer > 0 ? ` · ${ADD_KEY}-click to preview under the picked layer` : "")
            : on ? ` · on in this preview · ${ADD_KEY}-click to turn off`
            : ` · ${ADD_KEY}-click to preview with the layers on`;
        // A layer on under the top one is tinted with its own light, so the
        // set reads at a glance without being mistaken for the picked tab.
        const tint = on && swatch.colour ? ` style="--tab-tint:${swatch.colour}"` : "";
        return `<button class="layer-tab${on ? " on" : ""}"${tint} role="tab" data-layer="${index}" aria-selected="${state.layer === index}"
            data-tip="${esc(swatch.tip)}${drafted.has(layer.index) ? " · changed in your draft" : ""}${esc(how)}">${swatch.html}
            <span>${esc(layerName(layer))}</span>${layerName(layer) === layer.name ? "" : `<span class="idx">${esc(layer.index)}</span>`}${drafted.has(layer.index) ? '<i class="draft-dot"></i>' : ""}</button>`;
    }).join("");
    const node = el(`<div class="layerbar-wrap"><div class="layer-tabs" role="tablist" aria-label="Layers">${tabs}${trailing}</div></div>`);
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-layer]")).forEach((button) => button.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey) toggleLayerOn(Number(button.dataset.layer));
        else showLayer(Number(button.dataset.layer));
        render();
    }));
    keepInView(/** @type {HTMLElement} */ (node.querySelector(".layer-tabs")));
    return node;
}

// A strip of tabs too long for its width scrolls sideways; every render
// builds it afresh, so it brings its picked tab back into view once drawn,
// and fades the edge that has more tabs beyond it.
/** @param {HTMLElement | null} strip */
export function keepInView(strip) {
    if (!strip) return;
    const edges = () => {
        strip.classList.toggle("more-left", strip.scrollLeft > 1);
        strip.classList.toggle("more-right", strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1);
    };
    strip.addEventListener("scroll", edges, {passive: true});
    requestAnimationFrame(() => {
        const tab = strip.isConnected && /** @type {HTMLSelectElement} */ (strip.querySelector('[aria-selected="true"]'));
        if (!tab) return;
        const left = tab.offsetLeft - 28, right = tab.offsetLeft + tab.offsetWidth + 28;
        if (left < strip.scrollLeft) strip.scrollLeft = left;
        else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
        edges();
    });
}
