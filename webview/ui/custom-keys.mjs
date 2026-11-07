// @ts-check
/**
 * @typedef {import("../../contracts/panel.js").PublishedModel | null} Model
 */
// Selector assertions describe the controls authored in these templates.
// Custom keys: the keyboard's 128 named keys. A key here is its name, its
// shortcut, which is the key's own action (firmware D-F26), and its behaviour,
// which works on top. The selected key shows two cards: the key itself (its
// name as the card's title, as a macro's is, then the layers it is placed on,
// as a macro's are, and its shortcut) and what it does, which is the Keymap screen's behaviour editor for
// that key, placed or not. A key with no stored behaviour shows the unstored
// grid with its built-in defaults; the first edit adds the row. This is the
// only behaviour editor on screen, so the open cell and the timing fields it
// saves are this key's. Place one on a layer, send it from a combo, or send its
// shortcut from another key's behaviour.

import {el, esc} from "../lib/dom.mjs";
import {placementsOf} from "../view/reach.mjs";
import {NAME_MAX_BYTES} from "../view/names.mjs";
import {titleName, attachTitleName} from "./title-name.mjs";
import {getModel, layers, post, render, state} from "../store.mjs";
import {editGate} from "../view/edit-gate.mjs";
import * as edits from "../view/edits.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {topbar} from "./frame.mjs";
import {keycodeName} from "../view/key-identity.mjs";
import {SHORTCUT_MEANS, customKeyInUse, hasShortcut, customKeyShortcutLine, sameShortcut, shortcutAct, shortcutLimitWords} from "../view/custom-key.mjs";
import {openPicker} from "./picker.mjs";
import {behaviourEditorRow} from "../view/behavior-editor.mjs";
import {behaviourActions, behaviourEditor} from "./keys/behaviour-editor.mjs";
import {pickBehaviourKey} from "./keys/retarget.mjs";
import {placedOnMarkup, showPlacements} from "./keys/reach.mjs";
import {mark} from "./marks.mjs";
import {slotBank} from "../view/slot-bank.mjs";
import {SWAP_TIP, allSlotsShown, slotBankControls, swappable} from "./slot-bank.mjs";


// Two custom keys trade places (D-L81). The dragged key is the one open
// afterwards, where it is now, with its behaviour's open cell if it had one.
/** @param {string} from @param {string} to */
function swapCustomKeys(from, to) {
    post(edits.swapCustomKeys(from, to));
    if (state.cellRow === from || state.cellRow === to) state.cellRow = state.cellRow === from ? to : from;
    state.customKey = to;
    render();
}

export function screenCustomKeys() {
    const model = getModel();
    const keys = model?.customKeys || [];
    const key = keys.find((row) => row.keycode === state.customKey) || keys[0];
    const gate = editGate(model, "customKeys"), canEdit = gate.editable;

    const main = el(`<div class="main">${topbar(
        "Custom keys",
        "Keys you name, each with its own shortcut, taps and holds.",
    )}</div>`);

    const content = el(`<div class="content"><div class="pad library"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    if (!keys.length) {
        pad.classList.remove("library");
        pad.appendChild(el(`<div class="screen-stub"><h3>No custom keys read</h3>
            <p class="note">${esc(gate.why || "Choose Read keyboard to read this keyboard's custom keys.")}</p></div>`));
        main.appendChild(content);
        return main;
    }

    // Counted as Macros and Pointing modes count theirs: how many are in use.
    const used = keys.filter(customKeyInUse).length;
    const grid = el(`<div class="card"><div class="card-h"><h3>Keys</h3>
        <input class="input search card-search" id="customKeySearch" data-f="custom-keys:search" type="search" aria-label="Search custom keys by name" placeholder="Search by name" value="${esc(state.customKeySearch || "")}">
        <span class="tag">${used} of ${keys.length} used</span></div>
        <div class="card-b"><div class="macro-grid"></div></div></div>`);
    /** @type {HTMLInputElement} */ (grid.querySelector("#customKeySearch")).addEventListener("input", (event) => { state.customKeySearch = /** @type {HTMLInputElement} */ (event.target).value; render(); });
    const cells = /** @type {HTMLElement} */ (grid.querySelector(".macro-grid"));
    const query = (state.customKeySearch || "").trim().toLowerCase();
    /** @param {import("../../contracts/panel.js").CustomKey} row */
    const matches = (row) => !query || row.name.toLowerCase().includes(query) || String(row.slot) === query;
    if (!keys.some(matches)) cells.replaceWith(el(`<p class="note">No custom key is named “${esc(query)}”.</p>`));
    const changed = draftMarks(model?.draft?.changes).customKeys;
    // The keys in use first; New and the unused ones after them.
    const shelf = slotBank(keys, {
        inUse: customKeyInUse, free: (row) => !customKeyInUse(row),
        keep: (row) => row.keycode === key?.keycode || changed.has(row.keycode),
        matches, searching: Boolean(query), open: allSlotsShown("customKeys"),
    });
    // A tile says what its key is: its name, else what it sends, else that a
    // behaviour holds it; a key with none of them is a dash.
    /** @param {import("../../contracts/panel.js").CustomKey} row */
    const tileWords = (row) => row.name || (hasShortcut(row) ? row.shortcutLabel : row.hasBehavior ? "behaviour" : "—");
    /** @param {string} words */
    const clip = (words) => words.length > 13 ? `${words.slice(0, 12)}…` : words;
    /** @param {import("../../contracts/panel.js").CustomKey} row */
    const tile = (row) => {
        const does = [hasShortcut(row) ? shortcutAct(row) : "", row.hasBehavior ? "has a behaviour" : ""].filter(Boolean).join(" · ");
        const tip = `Custom key ${row.slot}${row.name ? ` · ${row.name}` : ""} · ${does || "no shortcut or behaviour: does nothing yet"}`;
        const cell = el(`<button class="mslot ${customKeyInUse(row) ? "filled" : ""}" data-custom-key="${esc(row.keycode)}"
            aria-current="${row.keycode === key?.keycode}" data-tip="${esc(canEdit ? `${tip} · ${SWAP_TIP}` : tip)}">
            <span class="n">K${esc(row.slot)}</span>${changed.has(row.keycode) ? draftDot(model?.draft, "corner") : ""}
            <span class="v">${esc(clip(tileWords(row)))}</span></button>`);
        cell.addEventListener("click", () => {
            // Another key's behaviour opens with no cell open, as picking
            // another row does on the Keymap screen. Only this key's own cell
            // closes: one open in the Keymap screen's row stays open there.
            if (row.keycode !== key?.keycode && state.cellRow === key?.keycode) Object.assign(state, {cell: null, cellRow: null, cellHow: null});
            state.customKey = row.keycode;
            render();
        });
        swappable(cell, {bank: "customKeys", key: row.keycode, canEdit, keyOf: (other) => /** @type {HTMLElement} */ (other).dataset.customKey ?? null, onSwap: swapCustomKeys});
        return cell;
    };
    cells.append(...shelf.shown.map(tile));
    if (!query) {
        const {add, toggle} = slotBankControls("customKeys", {noun: "custom key", count: keys.length, free: Boolean(shelf.firstFree), canEdit,
            pick: () => {
                const next = shelf.firstFree;
                if (!next) return;
                if (next.keycode !== key?.keycode && state.cellRow === key?.keycode) Object.assign(state, {cell: null, cellRow: null, cellHow: null});
                state.customKey = next.keycode;
            }});
        cells.append(add, toggle, ...shelf.revealed.map(tile));
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
        <div class="card-h name-titlebar"><span class="mark-lg">${mark(model, {kind: "customKey"})}</span>${titleName({f: `custom-key:${key.slot}:name`, value: key.name, placeholder: `Custom key ${key.slot}`,
            label: "Custom key name", perName: (model?.customKeyNameSpace || {perName: NAME_MAX_BYTES}).perName, canEdit})}
            <span class="tag" data-tip="${esc(key.keycode)}">Key ${esc(key.slot)}</span>
            <span class="right row actions">
                <button class="btn tiny link" data-act="place" ${editGate(model, "keys").editable ? "" : "disabled"}>Place on a key →</button>
                <button class="btn tiny ghost destructive" data-act="clear" ${canEdit && customKeyInUse(key) ? "" : "disabled"}
                    data-tip="Empty this custom key: its name, shortcut and behaviour. Keys, behaviours and combos that send it stay, and send nothing until it holds something again.">Clear custom key</button></span></div>
        <div class="card-b stack"><div class="slot-context">${placedOnMarkup(model, "customKeys", key.keycode,
            "No key, behaviour or combo sends this custom key. Place it on a key to use it.")}</div><div data-shortcut></div></div></div>`);
    attachTitleName(card, {stored: key.name, perName: (model?.customKeyNameSpace || {perName: NAME_MAX_BYTES}).perName,
        rename: (name) => post(edits.customKeyNameMessage(key.keycode, name, model?.customKeyEditing?.identity))});
    /** @type {HTMLElement} */ (card.querySelector("[data-shortcut]")).replaceWith(shortcutField(model, key, canEdit));
    /** @type {HTMLElement} */ (card.querySelector('[data-act="place"]')).addEventListener("click", () => {
        state.placement = {keycode: key.keycode};
        state.screen = "keys"; state.tab = "key"; render();
    });
    /** @type {HTMLElement} */ (card.querySelector('[data-act="clear"]')).addEventListener("click", () => {
        // Its behaviour goes with it, so a cell of it open here closes.
        if (state.cellRow === key.keycode) Object.assign(state, {cell: null, cellRow: null, cellHow: null});
        post(edits.clearCustomKeyMessage(key.keycode, model?.customKeyEditing?.identity));
    });
    showPlacements(card, "customKeys", key.keycode);
    return card;
}

// What the key does: its behaviour editor, the same one the Keymap screen's
// Behaviours tab shows, headless: the card is titled by the key, and carries
// the editor's actions in its own title bar. A placed key links to the
// Keymap screen too, where the board shows the keys that reach it: on the
// layer shown if it reaches the key there, otherwise on the first layer that
// does. What the shortcut adds is said under the shortcut itself.
/** @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key */
function behaviourCard(model, key) {
    const behaviour = behaviourEditorRow(model, key.keycode);
    // The actions are the behaviour's, so they follow the behaviours gate.
    const canEdit = editGate(model, "behaviours").editable;
    const placements = placementsOf(model, "customKeys", key.keycode);
    const placed = placements.length > 0;
    const card = el(`<div class="card custom-key-behaviour">
        <div class="card-h"><h3>What it does</h3>
            <span class="tag">${key.hasBehavior ? "Behaviour" : "No behaviour yet"}</span>
            <span class="right row actions">
                ${placed ? `<button class="btn tiny link" data-act="show-behaviour"
                    data-tip="Open this behaviour in Keymap → Behaviours, with the board showing the keys that reach it.">Show on the Keymap screen →</button>` : ""}
                ${behaviour?.stored ? behaviourActions(model, canEdit) : ""}</span></div>
        <div class="card-b stack"></div></div>`);
    const body = /** @type {HTMLElement} */ (card.querySelector(".card-b"));
    if (behaviour) {
        body.appendChild(behaviourEditor(behaviour, {head: false}));
        /** @type {HTMLButtonElement | null} */ (card.querySelector('.card-h [data-act="rekey"]'))?.addEventListener("click", () => pickBehaviourKey(behaviour));
        /** @type {HTMLButtonElement | null} */ (card.querySelector('.card-h [data-act="remove"]'))?.addEventListener("click", () =>
            post(edits.deleteBehaviour(behaviour.keycode, model?.profileIdentity)));
    }
    /** @type {HTMLElement | null} */ (card.querySelector('[data-act="show-behaviour"]'))?.addEventListener("click", () => {
        // The open cell belongs to this behaviour, so it stays open there.
        const shown = placements.find((entry) => entry.at === state.layer) || placements[0];
        Object.assign(state, {screen: "keys", tab: "behaviours", behaviourRow: behaviour?.keycode || key.keycode,
            behaviourRoute: null, behaviourRowShown: null, layer: shown ? shown.at : state.layer});
        render();
    });
    return card;
}

// The key's shortcut, its label saying what a shortcut is on hover
// (SHORTCUT_MEANS), set in the keycode picker as any key is on the Keys screen: a key from those the keyboard accepts, and the modifiers in the
// picker's row, here left and right mixed. Each change posts the whole
// shortcut; Clear posts none. The picker stays open while new models arrive,
// and what it posts is its own whole choice, so it names the draft, and is
// weighed against the key, as they are when it is posted.
/** @param {Model} model @param {import("../../contracts/panel.js").CustomKey} key @param {boolean} canEdit */
function shortcutField(model, key, canEdit) {
    const names = key.shortcut.keys.map((code) => keycodeName(model, code)).filter(Boolean);
    const node = el(`<div class="field"><span data-shortcut-means data-tip="${esc(SHORTCUT_MEANS)}">Shortcut</span>
            <div class="input-row"><input data-f="custom-key:${esc(key.slot)}:shortcut" class="input" data-shortcut value="${esc(hasShortcut(key) ? key.shortcutLabel : "")}" placeholder="None" readonly ${canEdit ? "" : "disabled"}
                data-tip="${shortcutLimitWords(model) ? `${esc(shortcutLimitWords(model, true))}, any` : "Any"} modifiers, left and right mixed, and any layers, held, locked, moved to, tap-toggled or one-shot as a layer key would. Pick… opens the keycode picker with its modifier row and its Layers section.">
            <button class="btn" data-act="pick-shortcut" ${canEdit ? "" : "disabled"}>Pick…</button>
            <button class="btn ghost destructive" data-act="clear-shortcut" ${canEdit && hasShortcut(key) ? "" : "disabled"}
                data-tip="No shortcut: the key does only what its behaviour says.">Clear</button></div>
            <span class="note">${esc(customKeyShortcutLine(key))}</span></div>`);
    /** @param {import("../../contracts/panel.js").CustomKeyShortcut} shortcut */
    const save = (shortcut) => post(edits.customKeyShortcutMessage(key.keycode, shortcut, getModel()?.customKeyEditing?.identity));
    /** @type {HTMLElement} */ (node.querySelector('[data-act="clear-shortcut"]')).addEventListener("click", () => save({mods: 0, keys: [], layers: 0, layerKind: 0}));
    /** @type {HTMLElement} */ (node.querySelector('[data-act="pick-shortcut"]')).addEventListener("click", () => openPicker({
        title: "Shortcut", context: key.name || `Custom key ${key.slot}`,
        seed: names, allowedKeys: model?.customKeyShortcutKeys || [], shortcut: {mods: key.shortcut.mods, layers: key.shortcut.layers, layerKind: key.shortcut.layerKind},
        onShortcut: (shortcut) => {
            const now = getModel()?.customKeys?.find((row) => row.keycode === key.keycode) || key;
            if (!sameShortcut(shortcut, now.shortcut)) save(shortcut);
        },
    }));
    return node;
}
