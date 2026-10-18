// @ts-check
// Authored selectors and dataset values below refer to controls in these
// templates. Placement coordinates come from the published board model; a
// writable draft supplies the complete profile identity used by edit builders.
// Keys: the board stays on screen and the workbench below it switches between
// the key, its behaviour, its combos, and what this layer reaches. The board
// card's parts, the workbench and each of its tabs live in ui/keys/.

import {isOff, label as hsvLabel} from "../lib/colour.mjs";
import {el, esc} from "../lib/dom.mjs";
import {comboAnswers, comboInputKeys} from "../view/combo-reach.mjs";
import {builderInputs, pickComboInput} from "./keys/combo-builder.mjs";
import {layerColourRow, stageEnabled} from "../view/lighting.mjs";
import {currentLayer, getModel, heldLayers, layers, post, previewing, render, state, writable} from "../store.mjs";
import * as edits from "../view/edits.mjs";
import {draftMarks} from "../view/review.mjs";
import {board} from "./board.mjs";
import {layerBar} from "./layerbar.mjs";
import {attachLayersControl} from "./layers.mjs";
import {topbar, unavailable} from "./shell.mjs";
import {bench} from "./keys/bench.mjs";
import {boardHelp, pickBar, placementBar, previewFoot} from "./keys/board-card.mjs";
import {behaviourKey, selectBehaviourKey} from "./keys/behaviour-selection.mjs";
import {pickKeycodeFor, swapKeys} from "./keys/key-edits.mjs";
import {reachHighlight} from "./keys/reach.mjs";

export {keysShortcut} from "./keys/shortcuts.mjs";
export {previewFoot};

export function screenKeys() {
    const model = getModel();
    const layer = currentLayer();
    const main = el(`<div class="main">${topbar(
        "Keys",
        "Click a key to change what it does. The tabs under the board edit its behaviour, its combos and what this layer reaches.",
    )}</div>`);

    const blocked = unavailable(model);
    if (!layer) {
        const content = el(`<div class="content"><div class="pad"><div class="screen-stub">
            <h3>Nothing read yet</h3><p class="note">${esc(blocked || "Choose Read keyboard to load this keyboard's layers.")}</p></div></div></div>`);
        main.appendChild(content);
        return main;
    }

    const bar = layerBar();
    attachLayersControl(bar);
    const content = el(`<div class="content"><div class="pad keys-pad${state.hideBoard ? " board-hidden" : ""}"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);

    // The board, how that layer is lit and the layer tabs under them are one
    // card, held at the top of the page while the workbench scrolls under it
    // (Hide board folds it to its tabs). What the board's marks mean and its
    // shortcuts are behind its "?". The tabs sit at the card's foot, next to
    // the workbench, so switching layers mid-edit is a short reach.
    const card = el(`<div class="board-card"></div>`);
    const row = layerColourRow(model, layer.index);
    const lit = stageEnabled(model, "layers") && row && !isOff(row.color);
    if (state.placement) card.appendChild(placementBar());
    else if (state.combo.picking) card.appendChild(pickBar());
    // One indication at a time: while a combo is being built its inputs are
    // the keys in question, otherwise the keys that reach the picked row.
    const building = state.combo.picking || (state.combo.open && state.tab === "combos");
    card.appendChild(board(model, layer, {
        selected: state.selected,
        drafted: draftMarks(model?.draft?.changes).keys.get(layer.index),
        reach: building ? comboInputKeys(model, layers(), state.layer, heldLayers(), builderInputs()) : reachHighlight(model),
        picking: state.combo.picking || Boolean(state.placement),
        held: heldLayers(),
        onKey: (/** @type {number} */ index) => {
            if (state.placement) {
                const placement = state.placement;
                state.placement = null;
                state.selected = index;
                if (writable()) post(edits.setKey(layer.name, index, placement.keycode));
            } else if (state.combo.picking) {
                // The key the keyboard would answer with here, taken now: a
                // transparent key picks what shows through it, and switching
                // layers afterwards leaves this input as it is.
                pickComboInput(comboAnswers(model, layers(), state.layer, heldLayers()).get(index));
            } else {
                state.selected = index;
                // Follow the key the board shows, including one with no
                // authored row. Transparent and disabled keys never get one.
                selectBehaviourKey(behaviourKey(index).keycode);
            }
            render();
        },
        onOpen: writable() ? (/** @type {number} */ index) => pickKeycodeFor(index) : undefined,
        onSwap: writable() ? (/** @type {number} */ from, /** @type {number} */ to) => swapKeys(from, to) : undefined,
    }));
    card.appendChild(previewing() ? previewFoot(layer) : el(`<div class="board-foot"><span class="board-foot-text">${lit
        ? `lit ${esc(hsvLabel(row.color))} on ${row.mode === "ALL_KEYS" ? "every key" : "keys mapped here"}`
        : "no layer colour · the base effect shows through"}</span></div>`));
    card.append(bar);
    card.prepend(boardHelp(model));
    pad.append(card, bench());
    main.appendChild(content);
    return main;
}
