// @ts-check
/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 */
// Selector assertions describe the controls authored in these templates.
// Custom keys: the keyboard's 128 named keys. A key here is its name, its
// shortcut, which is the key's own action (firmware D-F26), and its behaviour,
// which works on top. The list keeps keys in use in view and folds the rest;
// the selected key is one card: its name as the title (as a macro's is),
// where it is placed, what it sends, then its taps and holds, folded to one
// line until it has a behaviour. Opened, that is the Keys screen's behaviour
// editor for the key, placed or not: a key with no stored behaviour shows the
// unstored grid with its built-in defaults, and the first edit adds the row.
// This is the only behaviour editor on screen, so the open cell and the
// timing fields it saves are this key's.

import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {customKeyPlacements} from "../view/reach.mjs";
import {NAME_MAX_BYTES} from "../view/names.mjs";
import {titleName, attachTitleName} from "./title-name.mjs";
import {ROUTE_WORDS, setReachGroupOpen} from "../view/reach-groups.mjs";
import {canEdit as canEditArea, getModel, layerName, layers, post, render, state, writable} from "../store.mjs";
import * as edits from "../view/edits.mjs";
import {layerSwatch} from "./layerbar.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {topbar, unavailable} from "./shell.mjs";
import {keyName} from "../view/keyvalues.mjs";
import {keycodeAside} from "../view/show-keycodes.mjs";
import {customKeyBankList, customKeyDoes, customKeyInUse, hasShortcut, shortcutGlyphs} from "../view/custom-key.mjs";
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
        "A named shortcut held as long as you hold the key, with taps and holds of its own.",
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

    // The list, as Macros draws it: + New custom key, search, the keys in use,
    // the rest folded behind their count.
    const query = state.customKeySearch || "";
    const {shown, folded, firstFree} = customKeyBankList(keys, {query, current: key?.keycode});
    const grid = el(`<div class="card"><div class="card-h"><h3>Keys</h3>
        <span class="tag">${keys.filter(customKeyInUse).length} in use</span>
        <button class="btn bank-new" data-act="new-custom-key" ${firstFree ? "" : "disabled"}>+ New custom key</button>
        <input class="input search card-search" id="customKeySearch" data-f="custom-keys:search" type="search" placeholder="Search by name or shortcut" value="${esc(query)}"></div>
        <div class="card-b"><div class="bank-scroll"><div class="macro-grid" data-bank-used></div>
            ${folded.length ? `<details class="bank-empties" data-bank-empties ${state.customKeyEmptyOpen ? "open" : ""}><summary>${DISCLOSURE}Show ${folded.length} unused</summary><div class="macro-grid"></div></details>` : ""}</div></div></div>`);
    /** @type {HTMLInputElement} */ (grid.querySelector("#customKeySearch")).addEventListener("input", (event) => { state.customKeySearch = /** @type {HTMLInputElement} */ (event.target).value; render(); });
    /** @type {HTMLButtonElement} */ (grid.querySelector('[data-act="new-custom-key"]')).addEventListener("click", () => {
        if (!firstFree) return;
        if (state.cellRow === key?.keycode) Object.assign(state, {cell: null, cellRow: null, cellHow: null});
        state.customKey = firstFree.keycode; state.customKeySearch = ""; render();
    });
    const empties = /** @type {HTMLDetailsElement | null} */ (grid.querySelector("[data-bank-empties]"));
    empties?.addEventListener("toggle", () => { if (empties.isConnected) state.customKeyEmptyOpen = empties.open; });
    const cells = /** @type {HTMLElement} */ (grid.querySelector("[data-bank-used]"));
    if (!shown.length && query.trim()) cells.replaceWith(el(`<p class="note">No custom key is named “${esc(query.trim())}”.</p>`));
    const changed = draftMarks(model?.draft?.changes).customKeys;
    /** @param {import("../../contracts/panel.js").CustomKey} row */
    const tile = (row) => {
        const does = [hasShortcut(row) ? `sends ${row.shortcutLabel}` : "", row.hasBehavior ? "has a behaviour" : ""].filter(Boolean).join(" · ");
        const tip = `K${row.slot}${row.name ? ` · ${row.name}` : ""} · ${does || "does nothing yet"}`;
        // An unnamed key reads as the shortcut it sends.
        const label = row.name || shortcutGlyphs(model, row.shortcut) || (row.hasBehavior ? "Behaviour" : "—");
        const cell = el(`<button class="mslot ${customKeyInUse(row) ? "filled" : ""}" data-custom-key="${esc(row.keycode)}"
            aria-current="${row.keycode === key?.keycode}" data-tip="${esc(tip)}">
            <span class="n">K${row.slot}</span>${changed.has(row.keycode) ? draftDot("Changed in your draft", "corner") : ""}
            <span class="v">${esc(label.length > 13 ? `${label.slice(0, 12)}…` : label)}</span></button>`);
        cell.addEventListener("click", () => {
            // Another key's behaviour opens with no cell open, as picking
            // another row does on the Keys screen. Only this key's own cell
            // closes: one open in the Keys screen's row stays open there.
            if (row.keycode !== key?.keycode && state.cellRow === key?.keycode) Object.assign(state, {cell: null, cellRow: null, cellHow: null});
            state.customKey = row.keycode;
            render();
        });
        return cell;
    };
    cells.append(...shown.map(tile));
    /** @type {HTMLElement | null} */ (grid.querySelector("[data-bank-empties] .macro-grid"))?.append(...folded.map(tile));
    pad.appendChild(grid);
    if (key) {
        const side = el(`<div class="stack"></div>`);
        side.append(editor(model, key, canEdit));
        pad.appendChild(side);
    } else pad.appendChild(el(`<div class="empty-card"><p class="note">Pick a key.</p></div>`));
    main.appendChild(content);
    return main;
}

// One card per key: its name as the title, where it is placed, what it
// sends, then its taps and holds — folded to one line until it has some.
/** @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key @param {boolean} canEdit */
function editor(model, key, canEdit) {
    const changed = draftMarks(model?.draft?.changes).customKeys.has(key.keycode);
    const tagTip = keycodeAside(state, "behaviourTitle", key.keycode);
    const card = el(`<div class="card custom-key-card">
        <div class="card-h name-titlebar">${titleName({f: `custom-key:${key.slot}:name`, value: key.name, placeholder: `Custom key ${key.slot}`,
            label: "Custom key name", perName: (model?.customKeyNameSpace || {perName: NAME_MAX_BYTES}).perName, canEdit})}
            ${changed ? draftDot("This custom key differs from the keyboard in your draft") : ""}
            <span class="tag"${tagTip ? ` data-tip="${esc(tagTip)}"` : ""}>K${esc(key.slot)}</span></div>
        <div class="card-b stack">
            <div class="macro-context"><span class="eyebrow">Placed on</span>${placedOn(model, key)}
                <button class="btn compact" data-act="place" ${writable() ? "" : "disabled"}>Place on a key…</button></div>
            <div data-shortcut></div>
            <div data-behaviour></div>
        </div></div>`);
    attachTitleName(card, {stored: key.name, perName: (model?.customKeyNameSpace || {perName: NAME_MAX_BYTES}).perName,
        rename: (name) => post(edits.customKeyNameMessage(key.keycode, name, model?.customKeyEditing?.identity))});
    /** @type {HTMLElement} */ (card.querySelector("[data-shortcut]")).replaceWith(shortcutField(model, key, canEdit));
    /** @type {HTMLElement} */ (card.querySelector("[data-behaviour]")).replaceWith(behaviourSection(model, key, canEdit));
    /** @type {HTMLElement} */ (card.querySelector('[data-act="place"]')).addEventListener("click", () => {
        state.placement = {keycode: key.keycode};
        state.screen = "keys"; state.tab = "key"; render();
    });
    /** @type {NodeListOf<HTMLElement>} */ (card.querySelectorAll("[data-goto-layer]")).forEach((button) => button.addEventListener("click", () =>
        showOnLayer(key.keycode, Number(button.dataset.gotoLayer))));
    return card;
}

// Its taps and holds: one line and "Add taps and holds…" until it has a
// behaviour (or that was pressed), then the Keys screen's behaviour editor
// for this key, without its own title, which would repeat the card's. A
// placed key links to Keys → Behaviours, where the board shows the keys that
// reach it: on the layer shown if it reaches the key there, otherwise on the
// first layer that does.
/** @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key @param {boolean} canEdit */
function behaviourSection(model, key, canEdit) {
    const open = key.hasBehavior || state.customKeyAddBehaviour === key.keycode;
    const behaviour = open ? behaviourEditorRow(model, key.keycode) : null;
    const placements = customKeyPlacements(model, layers(), key.keycode);
    const node = el(`<div class="custom-key-behaviour">
        <div class="row custom-key-row"><span class="eyebrow">Taps and holds</span>
            ${open ? "" : `<span class="note">none</span><button class="btn compact" data-act="add-behaviour" ${canEdit ? "" : "disabled"}
                data-tip="Give this key its own taps, holds and multi-taps. Nothing is added to your draft until you set one.">Add taps and holds…</button>`}
            ${open && key.hasBehavior && placements.length ? `<button class="btn text right" data-act="show-behaviour"
                data-tip="Open this behaviour in Keys · Behaviours, with the board showing the keys that reach it.">Show on the Keys screen →</button>` : ""}</div></div>`);
    if (behaviour) node.appendChild(behaviourEditor(behaviour));
    /** @type {HTMLElement | null} */ (node.querySelector('[data-act="add-behaviour"]'))?.addEventListener("click", () => {
        state.customKeyAddBehaviour = key.keycode; render();
    });
    /** @type {HTMLElement | null} */ (node.querySelector('[data-act="show-behaviour"]'))?.addEventListener("click", () => {
        // The open cell belongs to this behaviour, so it stays open there.
        const shown = placements.find((entry) => entry.at === state.layer) || placements[0];
        Object.assign(state, {screen: "keys", tab: "behaviours", behaviourRow: behaviour?.keycode || key.keycode,
            behaviourRoute: null, behaviourRowShown: null, layer: shown ? shown.at : state.layer});
        render();
    });
    return node;
}

// What the key sends, as a keycap that opens the key picker with its
// modifier row (left and right mixed, as the shortcut stores a mask), then
// Clear. One sentence under it says what the key does.
/** @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key @param {boolean} canEdit */
function shortcutField(model, key, canEdit) {
    const identity = model?.customKeyEditing?.identity;
    const name = keyName(model, key.shortcut.key);
    const glyphs = shortcutGlyphs(model, key.shortcut);
    const node = el(`<div class="stack custom-key-sends">
            <div class="row custom-key-row"><span class="eyebrow">Sends</span>
            <button class="value-btn${glyphs ? " keycap" : ""}" data-act="pick-shortcut" ${canEdit ? "" : "disabled"}
                data-tip="${esc(hasShortcut(key) ? `${key.shortcutLabel} · choose another key or modifiers` : "Choose a key and any modifiers, left and right mixed.")}">${glyphs ? esc(glyphs) : '<span class="muted">Nothing · Choose…</span>'}</button>
            <button class="btn text destructive" data-act="clear-shortcut" ${canEdit && hasShortcut(key) ? "" : "disabled"}
                data-tip="Send nothing of its own.">Clear</button></div>
            <p class="note" data-does>${esc(customKeyDoes(key))}</p></div>`);
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
        return `<button class="layer-chip link" data-goto-layer="${at}"
            data-tip="${esc(swatch.tip)} · reached by ${esc(how)} · show on the board">${swatch.html}
            <span>${esc(layerName(layer))}</span><span class="idx">${esc(how)}</span></button>`;
    }).join("");
    return chips ? `<div class="row layer-chips" aria-label="Used on layers">${chips}</div>`
        : `<span class="note" data-tip="No key, behaviour or combo sends this custom key. Place it on a key to use it.">Not on a key yet</span>`;
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
