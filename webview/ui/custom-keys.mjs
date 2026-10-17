// @ts-check
/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 */
// Selector assertions describe the controls authored in these templates.
// Custom keys: the keyboard's 128 named keys that do only what their behaviour
// says. The selected key shows two cards: the key itself (its name and where it
// is placed; each field is one entry in `keyFields`) and what it does, which is
// the Keys screen's behaviour editor for that key, placed or not. A key with no
// stored behaviour shows the unstored grid with its built-in defaults; the first
// edit adds the row. This is the only behaviour editor on screen, so the open
// cell and the timing fields it saves are this key's. Place one on a layer or
// send it from a combo.

import {el, esc} from "../lib/dom.mjs";
import {customKeyPlacements} from "../view/reach.mjs";
import {NAME_MAX_BYTES, NAME_TIP, nameCount} from "../view/names.mjs";
import {ROUTE_WORDS, setReachGroupOpen} from "../view/reach-groups.mjs";
import {canEdit as canEditArea, getModel, layerName, layers, post, render, state, writable} from "../store.mjs";
import * as edits from "../view/edits.mjs";
import {layerSwatch} from "./layerbar.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {topbar, unavailable} from "./shell.mjs";
import {behaviourEditorRow} from "../view/behavior-editor.mjs";
import {behaviourEditor} from "./keys/behaviour-editor.mjs";


export function screenCustomKeys() {
    const model = getModel();
    const keys = model?.customKeys || [];
    const key = keys.find((row) => row.keycode === state.customKey) || keys[0];
    const canEdit = canEditArea("customKeys");

    const main = el(`<div class="main">${topbar(
        "Custom keys",
        "Named keys that do only what their behaviour says. Place one on a key or send it from a combo; a behaviour cannot send one.",
    )}</div>`);

    const content = el(`<div class="content"><div class="pad library"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    if (!keys.length) {
        pad.classList.remove("library");
        pad.appendChild(el(`<div class="screen-stub"><h3>No custom keys read</h3>
            <p class="note">${esc(unavailable(model) || "This firmware has no custom keys, or its profile has not been read.")}</p></div>`));
        main.appendChild(content);
        return main;
    }

    const named = keys.filter((row) => row.name).length;
    const grid = el(`<div class="card"><div class="card-h"><h3>Keys</h3>
        <input class="input search card-search" id="customKeySearch" data-f="custom-keys:search" type="search" placeholder="Search by name" value="${esc(state.customKeySearch || "")}">
        <span class="tag">${named} of ${keys.length} named</span></div>
        <div class="card-b"><div class="macro-grid"></div></div></div>`);
    /** @type {HTMLInputElement} */ (grid.querySelector("#customKeySearch")).addEventListener("input", (event) => { state.customKeySearch = /** @type {HTMLInputElement} */ (event.target).value; render(); });
    const cells = /** @type {HTMLElement} */ (grid.querySelector(".macro-grid"));
    const query = (state.customKeySearch || "").trim().toLowerCase();
    /** @param {import("../../contracts/panel.js").CustomKey} row */
    const matches = (row) => !query || row.name.toLowerCase().includes(query) || String(row.slot) === query;
    if (!keys.some(matches)) cells.replaceWith(el(`<p class="note">No custom key is named “${esc(query)}”.</p>`));
    const changed = draftMarks(model?.draft?.changes).customKeys;
    for (const row of keys) {
        if (!matches(row)) continue;
        const tip = `Custom key ${row.slot}${row.name ? ` · ${row.name}` : ""} · ${row.hasBehavior ? "has a behaviour" : "no behaviour: does nothing yet"}`;
        const cell = el(`<button class="mslot ${row.name || row.hasBehavior ? "filled" : ""}" data-key="${esc(row.keycode)}"
            aria-current="${row.keycode === key?.keycode}" data-tip="${esc(tip)}">
            <span class="n">K${row.slot}</span>${changed.has(row.keycode) ? draftDot("Changed in your draft", "corner") : ""}
            <span class="v">${row.name ? esc(row.name.length > 13 ? `${row.name.slice(0, 12)}…` : row.name) : "—"}</span></button>`);
        cell.addEventListener("click", () => {
            // Another key's behaviour opens with no cell open, as picking
            // another row does on the Keys screen. Only this key's own cell
            // closes: one open in the Keys screen's row stays open there.
            if (row.keycode !== key?.keycode && state.cellRow === key?.keycode) Object.assign(state, {cell: null, cellRow: null, cellHow: null});
            state.customKey = row.keycode;
            render();
        });
        cells.append(cell);
    }
    pad.appendChild(grid);
    if (key) {
        const side = el(`<div class="stack"></div>`);
        side.append(editor(model, key, canEdit), behaviourCard(model, key));
        pad.appendChild(side);
    } else pad.appendChild(el(`<div class="empty-card"><p class="note">Pick a key.</p></div>`));
    main.appendChild(content);
    return main;
}

/** @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key @param {boolean} canEdit */
function editor(model, key, canEdit) {
    const card = el(`<div class="card">
        <div class="card-h"><h3>${esc(key.name || `Custom key ${key.slot}`)}</h3>
            <span class="tag" data-tip="${esc(key.keycode)}">Key ${esc(key.slot)}</span>
            <span class="right row actions">
                <button class="btn tiny ghost" data-act="place" ${writable() ? "" : "disabled"}>Place on a key…</button></span></div>
        <div class="card-b stack">${keyFields(model, key, canEdit).join("")}</div></div>`);
    attachNameField(card, model, key);
    /** @type {HTMLElement} */ (card.querySelector('[data-act="place"]')).addEventListener("click", () => {
        state.placement = {keycode: key.keycode};
        state.screen = "keys"; state.tab = "key"; render();
    });
    /** @type {NodeListOf<HTMLElement>} */ (card.querySelectorAll("[data-goto-layer]")).forEach((button) => button.addEventListener("click", () =>
        showOnLayer(key.keycode, Number(button.dataset.gotoLayer))));
    return card;
}

// The key's own fields, in the order the card shows them.
/** @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key @param {boolean} canEdit */
const keyFields = (model, key, canEdit) => [nameField(model, key, canEdit), placedOn(model, key)];

/** @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key @param {boolean} canEdit */
function nameField(model, key, canEdit) {
    const count = nameCount(key.name, (model?.customKeyNameSpace || {perName: NAME_MAX_BYTES}).perName);
    return `<label class="field"><span>Name</span>
        <input data-f="custom-key:${key.slot}:name" class="input" data-name value="${esc(key.name)}" placeholder="Custom key ${esc(key.slot)}" ${canEdit ? "" : "disabled"}
            data-tip="${esc(NAME_TIP)}">
        <span class="note${count.over ? " warn" : ""}" data-name-count>${esc(count.label)}</span></label>`;
}

/** @param {HTMLElement} card @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key */
function attachNameField(card, model, key) {
    const space = model?.customKeyNameSpace || {perName: NAME_MAX_BYTES};
    const nameInput = /** @type {HTMLInputElement} */ (card.querySelector("[data-name]"));
    nameInput.addEventListener("input", () => {
        const now = nameCount(nameInput.value, space.perName), node = /** @type {HTMLElement} */ (card.querySelector("[data-name-count]"));
        node.textContent = now.label;
        node.classList.toggle("warn", now.over);
    });
    nameInput.addEventListener("change", () => post(edits.customKeyNameMessage(key.keycode, nameInput.value, model?.customKeyEditing?.identity)));
}

// What the key does: its behaviour editor, the same one the Keys screen's
// Behaviours tab shows. A placed key links there too, where the board shows
// the keys that reach it: on the layer shown if it reaches the key there,
// otherwise on the first layer that does.
/** @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key */
function behaviourCard(model, key) {
    const behaviour = behaviourEditorRow(model, key.keycode);
    const placements = customKeyPlacements(model, layers(), key.keycode);
    const placed = placements.length > 0;
    const card = el(`<div class="card custom-key-behaviour">
        <div class="card-h"><h3>What it does</h3>
            <span class="tag">${key.hasBehavior ? "Behaviour" : "No behaviour yet"}</span>
            ${placed ? `<span class="right row actions"><button class="btn tiny ghost" data-act="show-behaviour"
                data-tip="Open this behaviour in Keys · Behaviours, with the board showing the keys that reach it.">Show on the Keys screen</button></span>` : ""}</div>
        <div class="card-b"></div></div>`);
    const body = /** @type {HTMLElement} */ (card.querySelector(".card-b"));
    if (behaviour) body.appendChild(behaviourEditor(behaviour));
    /** @type {HTMLElement | null} */ (card.querySelector('[data-act="show-behaviour"]'))?.addEventListener("click", () => {
        // The open cell belongs to this behaviour, so it stays open there.
        const shown = placements.find((entry) => entry.at === state.layer) || placements[0];
        Object.assign(state, {screen: "keys", tab: "behaviours", behaviourRow: behaviour?.keycode || key.keycode,
            behaviourRoute: null, behaviourRowShown: null, layer: shown ? shown.at : state.layer});
        render();
    });
    return card;
}

// The layers where a key carries this custom key or a combo sends it, each in
// its layer colour; a click shows that layer with the key picked.
/** @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key */
function placedOn(model, key) {
    const chips = customKeyPlacements(model, layers(), key.keycode).map(({layer, at, routes}) => {
        const swatch = layerSwatch(model, layer);
        const how = routes.map((route) => `${ROUTE_WORDS[route.group] || route.group}${route.group === "here" && route.keys.length > 1 ? ` ×${route.keys.length}` : ""}`).join(" · ");
        return `<button class="layer-chip link" data-goto-layer="${at}"
            data-tip="${esc(swatch.tip)} · reached by ${esc(how)} · show on the board">${swatch.html}
            <span>${esc(layerName(layer))}</span><span class="idx">${esc(how)}</span></button>`;
    }).join("");
    return `<div class="field"><span>On layers</span>
        ${chips ? `<div class="row layer-chips">${chips}</div>`
            : `<span class="note">No key or combo sends this custom key. Place it on a key to use it.</span>`}</div>`;
}

/** @param {string} keycode @param {number} at */
function showOnLayer(keycode, at) {
    const placement = customKeyPlacements(getModel(), layers(), keycode).find((entry) => entry.at === at);
    const route = placement?.routes[0];
    if (!route) return;
    Object.assign(state, {screen: "keys", tab: "key", layer: at, placement: null});
    if (route.keys.length) state.selected = route.keys[0];
    state.reachGroups = setReachGroupOpen(state.reachGroups, route.group, true);
    render();
}
