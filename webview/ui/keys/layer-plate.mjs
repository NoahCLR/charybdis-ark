// @ts-check
// The layer plate in the board's empty centre (decisions §2, R1): the layer's
// swatch and name, what it is shown over, how it is reached, and a way to add
// another layer to the view. It replaces the caption row under the board.

import {el, esc} from "../../lib/dom.mjs";
import {layerReachLines} from "../../view/layer-plate.mjs";
import {layerIsEmpty} from "../../view/layer-tabs.mjs";
import {addedLayers, defaultLayersUnder, getModel, heldLayers, layerName, layers, render, showLayer, state, toggleLayerOn, writable} from "../../store.mjs";
import {layerSwatch} from "../layerbar.mjs";
import {pickKeycodeFor} from "./key-edits.mjs";

// ⌘ on a Mac, Ctrl elsewhere: the modifier a tab click adds a layer to the view with.
const ADD_KEY = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || "") ? "⌘" : "Ctrl";

// The plate's frame, shared with any board that names its layer in the centre:
// the swatch and the name, then whatever the screen says about the layer.
/** @param {import("../../../contracts/panel.js").Layer} layer @param {string} body */
export function plateFrame(layer, body) {
    const swatch = layerSwatch(getModel(), layer);
    return el(`<div class="layer-plate" data-plate="${layer.index}">
        <div class="plate-name">${swatch.html}<span class="plate-title">${esc(layerName(layer))}</span></div>${body}</div>`);
}

/** @param {import("../../../contracts/panel.js").Layer} layer */
export function layerPlate(layer) {
    const model = getModel();
    const stack = layers();
    const at = stack.indexOf(layer);
    const reach = layerReachLines(model, layer.index);
    const added = addedLayers();
    const under = defaultLayersUnder(at);
    const isDefault = reach.state === "default" || at === 0;

    let over = "";
    if (!isDefault) {
        const shown = heldLayers().slice().reverse().map((index) => layerName(stack[index]));
        const words = state.layerOnly ? "As stored, alone" : `Over ${shown.join(", ") || layerName(stack[0])}`;
        over = `<div class="plate-row">
            <span class="plate-over" data-tip="${esc(state.layerOnly
                ? "Only what this layer stores; ▽ keys show nothing."
                : added.length ? "The layers added to the view are on under this one, the way the keyboard runs them; keys seen through from below are frosted. Edits still go to this layer."
                    : "Default layers are always on underneath every other layer, so transparent keys here answer from them. Keys seen through from below are frosted.")}">${esc(words)}</span>
            <button class="btn compact toggle" data-act="layer-only" aria-pressed="${state.layerOnly}"
                data-tip="Show only what this layer stores">This layer only</button></div>`;
    } else {
        over = `<div class="plate-note">Default layer · always on underneath every other layer</div>`;
    }

    let ways = "";
    if (!isDefault && reach.state === "reached") {
        ways = `<div class="plate-reach"><div class="eyebrow">Reached by</div>
            ${reach.lines.map((line) => line.key
                ? `<button class="plate-way" data-way-layer="${line.key.layer}" data-way-key="${line.key.layoutIndex}" data-tip="Show this key">${esc(line.text)}</button>`
                : `<span class="plate-way">${esc(line.text)}</span>`).join("")}
            ${reach.more ? `<span class="plate-more" data-tip="${esc(layerReachLines(model, layer.index, {limit: 99}).lines.slice(3).map((line) => line.text).join(" · "))}">+${reach.more} more</span>` : ""}</div>`;
    } else if (!isDefault && reach.state === "unreached") {
        ways = `<div class="plate-reach"><div class="plate-warn">Not reached by any key</div>
            ${writable() ? `<details class="plate-pop plate-reach-add"><summary class="btn text compact">Add a key that reaches it…</summary>
                <div class="plate-menu" role="menu"><p class="note">Choose how, then click a key on ${esc(layerName(stack[0]))} to put it there.</p>
                <button class="btn compact" role="menuitem" data-place="MO">Hold ${esc(layerName(layer))}</button>
                <button class="btn compact" role="menuitem" data-place="TG">Lock ${esc(layerName(layer))}</button>
                <button class="btn compact" role="menuitem" data-place="LT">Tap-hold ${esc(layerName(layer))}</button></div></details>` : ""}</div>`;
    }

    // Any other layer can join the view: what ⌘-click on a tab does, taught here.
    const others = stack.map((other, index) => ({other, index}))
        .filter(({other, index}) => index !== at && !under.includes(index) && !layerIsEmpty(model, other));
    const add = others.length ? `<details class="plate-pop plate-add" ${state.plateAdd ? "open" : ""}>
        <summary class="btn text compact" data-tip="Turn on other layers under or over this one, as holding them would. ${ADD_KEY}-click a layer tab does the same.">+ Add layer to view</summary>
        <div class="plate-menu" role="menu">${others.map(({other, index}) => {
            const on = heldLayers().includes(index);
            return `<button class="btn compact toggle" role="menuitemcheckbox" aria-pressed="${on}" data-add-layer="${index}">${layerSwatch(getModel(), other).html}${esc(layerName(other))}</button>`;
        }).join("")}</div></details>` : "";

    const node = plateFrame(layer, `${over}${ways}<div class="plate-foot">${add}</div>`);
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="layer-only"]'))?.addEventListener("click", () => {
        state.layerOnly = !state.layerOnly;
        state.layersOn = [];
        render();
    });
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-way-key]")).forEach((button) => button.addEventListener("click", () => {
        const index = stack.findIndex((entry) => entry.index === Number(button.dataset.wayLayer));
        if (index < 0) return;
        showLayer(index);
        state.selected = Number(button.dataset.wayKey);
        state.tab = "key";
        render();
    }));
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-place]")).forEach((button) => button.addEventListener("click", () => {
        const form = /** @type {"MO" | "TG" | "LT"} */ (button.dataset.place);
        state.placement = form === "LT"
            ? {keycode: `LT(${layer.index},KC_NO)`, layerTap: layer.index, label: `Tap-hold ${layerName(layer)}`}
            : {keycode: `${form}(${layer.index})`, label: `${form === "MO" ? "Hold" : "Lock"} ${layerName(layer)}`};
        showLayer(0);
        render();
    }));
    /** @type {HTMLDetailsElement | null} */ (node.querySelector(".plate-add"))?.addEventListener("toggle", (event) => {
        state.plateAdd = /** @type {HTMLDetailsElement} */ (event.target).open;
    });
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-add-layer]")).forEach((button) => button.addEventListener("click", () => {
        toggleLayerOn(Number(button.dataset.addLayer));
        render();
    }));
    return node;
}

// Where a placed layer key lands: a hold or a lock replaces the key; a
// tap-hold keeps the key's own tap when it is a plain key, and otherwise
// opens the picker with its Hold slot, where a tap can be chosen.
/** @param {{keycode: string, layerTap?: number}} placement @param {import("../../../contracts/panel.js").Position | undefined} position */
export function placedKeycode(placement, position) {
    if (placement.layerTap === undefined) return placement.keycode;
    const tap = position?.keycode || "";
    return /^KC_[A-Z0-9_]+$/.test(tap) && !["KC_NO", "KC_TRANSPARENT", "KC_TRNS"].includes(tap) ? `LT(${placement.layerTap},${tap})` : null;
}
export {pickKeycodeFor};
