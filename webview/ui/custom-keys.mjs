// @ts-check
/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 */
// Selector assertions describe the controls authored in these templates.
// Custom keys: the keyboard's 128 named keys. A key here is its name, its
// shortcut, which is the key's own action (firmware D-F26), and its behaviour,
// which works on top. The selected key shows two cards: the key itself (its
// name as the card's title, as a macro's is, then its shortcut and where it is
// placed; each field is one entry in `keyFields`) and what it does, which is the Keys screen's behaviour editor for
// that key, placed or not. A key with no stored behaviour shows the unstored
// grid with its built-in defaults; the first edit adds the row. This is the
// only behaviour editor on screen, so the open cell and the timing fields it
// saves are this key's. Place one on a layer, send it from a combo, or send its
// shortcut from another key's behaviour.

import {el, esc} from "../lib/dom.mjs";
import {customKeyPlacements} from "../view/reach.mjs";
import {NAME_MAX_BYTES} from "../view/names.mjs";
import {titleName, attachTitleName} from "./title-name.mjs";
import {ROUTE_WORDS, setReachGroupOpen} from "../view/reach-groups.mjs";
import {canEdit as canEditArea, getModel, layerName, layers, post, render, state, writable} from "../store.mjs";
import * as edits from "../view/edits.mjs";
import {layerSwatch} from "./layerbar.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {topbar, unavailable} from "./frame.mjs";
import {keyName} from "../view/keyvalues.mjs";
import {customKeyDoes, hasShortcut, customKeyShortcutLine} from "../view/custom-key.mjs";
import {openPicker} from "./picker.mjs";
import {behaviourEditorRow} from "../view/behavior-editor.mjs";
import {behaviourEditor} from "./keys/behaviour-editor.mjs";


export function screenCustomKeys() {
    const model = getModel();
    const keys = model?.customKeys || [];
    const key = keys.find((row) => row.keycode === state.customKey) || keys[0];
    const canEdit = canEditArea("customKeys");

    const main = el(`<div class="main">${topbar(
        "Custom keys",
        "Keys you name yourself. Each can send a shortcut and have its own taps and holds, and goes on any key or combo.",
    )}</div>`);

    const content = el(`<div class="content"><div class="pad library"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    if (!keys.length) {
        pad.classList.remove("library");
        pad.appendChild(el(`<div class="screen-stub"><h3>No custom keys read</h3>
            <p class="note">${esc(unavailable(model) || "Choose Read keyboard to load this keyboard's custom keys.")}</p></div>`));
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
        const does = [hasShortcut(row) ? `sends ${row.shortcutLabel}` : "", row.hasBehavior ? "has a behaviour" : ""].filter(Boolean).join(" · ");
        const tip = `Custom key ${row.slot}${row.name ? ` · ${row.name}` : ""} · ${does || "no shortcut or behaviour: does nothing yet"}`;
        const cell = el(`<button class="mslot ${row.name || row.hasBehavior || hasShortcut(row) ? "filled" : ""}" data-custom-key="${esc(row.keycode)}"
            aria-current="${row.keycode === key?.keycode}" data-tip="${esc(tip)}">
            <span class="n">K${esc(row.slot)}</span>${changed.has(row.keycode) ? draftDot("Changed in your draft", "corner") : ""}
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
        <div class="card-h name-titlebar">${titleName({f: `custom-key:${key.slot}:name`, value: key.name, placeholder: `Custom key ${key.slot}`,
            label: "Custom key name", perName: (model?.customKeyNameSpace || {perName: NAME_MAX_BYTES}).perName, canEdit})}
            <span class="tag" data-tip="${esc(key.keycode)}">Key ${esc(key.slot)}</span>
            <span class="right row actions">
                <button class="btn tiny ghost" data-act="place" ${writable() ? "" : "disabled"}>Place on a key…</button></span></div>
        <div class="card-b stack">${keyFields(model, key).join("")}</div></div>`);
    attachTitleName(card, {stored: key.name, perName: (model?.customKeyNameSpace || {perName: NAME_MAX_BYTES}).perName,
        rename: (name) => post(edits.customKeyNameMessage(key.keycode, name, model?.customKeyEditing?.identity))});
    /** @type {HTMLElement} */ (card.querySelector("[data-shortcut]")).replaceWith(shortcutField(model, key, canEdit));
    /** @type {HTMLElement} */ (card.querySelector('[data-act="place"]')).addEventListener("click", () => {
        state.placement = {keycode: key.keycode};
        state.screen = "keys"; state.tab = "key"; render();
    });
    /** @type {NodeListOf<HTMLElement>} */ (card.querySelectorAll("[data-goto-layer]")).forEach((button) => button.addEventListener("click", () =>
        showOnLayer(key.keycode, Number(button.dataset.gotoLayer))));
    return card;
}

// The key's own fields, in the order the card shows them; its name is the
// card's title. The shortcut is a placeholder filled in once the card exists
// (shortcutField).
/** @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key */
const keyFields = (model, key) => [`<div data-shortcut></div>`, placedOn(model, key)];

// What the key does: in words (its shortcut, its behaviour on top, both, or
// nothing yet), then its behaviour editor, the same one the Keys screen's
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
        <div class="card-b stack"><p class="note" data-does>${esc(customKeyDoes(key))}</p></div></div>`);
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

// The key's shortcut, set in the keycode picker as any key is on the Keys
// screen: a key from those the keyboard accepts, and the modifiers in the
// picker's row, here left and right mixed. Each change posts the whole
// shortcut; Clear posts none.
/** @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key @param {boolean} canEdit */
function shortcutField(model, key, canEdit) {
    const identity = model?.customKeyEditing?.identity;
    const name = keyName(model, key.shortcut.key);
    const node = el(`<div class="field"><span>Shortcut</span>
            <div class="input-row"><input data-f="custom-key:${esc(key.slot)}:shortcut" class="input" data-shortcut value="${esc(hasShortcut(key) ? key.shortcutLabel : "")}" placeholder="None" readonly ${canEdit ? "" : "disabled"}
                data-tip="One key and any modifiers, left and right mixed. Pick… opens the keycode picker with its modifier row.">
            <button class="btn" data-act="pick-shortcut" ${canEdit ? "" : "disabled"}>Pick…</button>
            <button class="btn ghost" data-act="clear-shortcut" ${canEdit && hasShortcut(key) ? "" : "disabled"}
                data-tip="No shortcut: the key does only what its behaviour says.">Clear</button></div>
            <span class="note">${esc(customKeyShortcutLine(key))}</span></div>`);
    /** @param {{mods: number, key: number}} shortcut */
    const save = (shortcut) => post(edits.customKeyShortcutMessage(key.keycode, shortcut.mods, shortcut.key, identity));
    /** @type {HTMLElement} */ (node.querySelector('[data-act="clear-shortcut"]')).addEventListener("click", () => save({mods: 0, key: 0}));
    /** @type {HTMLElement} */ (node.querySelector('[data-act="pick-shortcut"]')).addEventListener("click", () => openPicker({
        title: "Shortcut", context: key.name || `Custom key ${key.slot}`,
        seed: name ? [name] : [], allowedKeys: model?.customKeyShortcutKeys || [], shortcut: {mods: key.shortcut.mods},
        onShortcut: (shortcut) => {
            if (shortcut.mods !== key.shortcut.mods || shortcut.key !== key.shortcut.key) save(shortcut);
        },
    }));
    return node;
}

// The layers where a key carries this custom key or a combo sends it, each in
// its layer colour; a click shows that layer with the key picked.
/** @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key */
function placedOn(model, key) {
    const chips = customKeyPlacements(model, layers(), key.keycode).map(({layer, at, routes}) => {
        const swatch = layerSwatch(model, layer);
        const how = routes.map((route) => `${ROUTE_WORDS[route.group] || route.group}${route.group === "here" && route.keys.length > 1 ? ` ×${route.keys.length}` : ""}`).join(" · ");
        return `<button class="layer-chip link" data-goto-layer="${esc(at)}"
            data-tip="${esc(swatch.tip)} · reached by ${esc(how)} · show on the board">${swatch.html}
            <span>${esc(layerName(layer))}</span><span class="idx">${esc(how)}</span></button>`;
    }).join("");
    return `<div class="field"><span>On layers</span>
        ${chips ? `<div class="row layer-chips">${chips}</div>`
            : `<span class="note">No key, behaviour or combo sends this custom key. Place it on a key to use it.</span>`}</div>`;
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
