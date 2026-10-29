// @ts-check
// Authored selectors and dataset values below refer to controls in these
// templates. Placement coordinates come from the published board model; a
// writable draft supplies the complete profile identity used by edit builders.
// Keys: the board stays on screen and the workbench below it switches between
// the key, its behaviour, its combos, and what this layer reaches. The board
// card's parts, the workbench and each of its tabs live in ui/keys/.

import {isOff, label as hsvLabel} from "../lib/colour.mjs";
import {el, esc} from "../lib/dom.mjs";
import {toggleComboInput} from "../view/combo-reach.mjs";
import {layerColourRow, stageEnabled} from "../view/lighting.mjs";
import {currentView, getModel, post, render, state} from "../store.mjs";
import {editGate} from "../view/edit-gate.mjs";
import * as edits from "../view/edits.mjs";
import {draftMarks} from "../view/review.mjs";
import {vocabulary, word} from "../view/vocabulary.mjs";
import {board} from "./board.mjs";
import {layerBar} from "./layerbar.mjs";
import {attachLayersControl} from "./layers.mjs";
import {topbar} from "./frame.mjs";
import {bench} from "./keys/bench.mjs";
import {legend, pickBar, placementBar, previewFoot} from "./keys/board-card.mjs";
import {behaviourKey, selectBehaviourKey} from "./keys/behaviour-selection.mjs";
import {pickKeycodeFor, swapKeys} from "./keys/key-edits.mjs";
import {reachHighlight} from "./keys/reach.mjs";


export function screenKeys() {
    const model = getModel();
    const view = currentView();
    const layer = view.layer;
    const main = el(`<div class="main">${topbar(
        "Keymap",
        "Click a key to change what it does. The tabs under the board edit its behaviour, its combos and what this layer reaches.",
    )}</div>`);

    const gate = editGate(model, "keys");
    if (!layer) {
        const content = el(`<div class="content"><div class="pad"><div class="screen-stub">
            <h3>Nothing read yet</h3><p class="note">${esc(gate.why || "Choose Read keyboard to read this keyboard's layers.")}</p></div></div></div>`);
        main.appendChild(content);
        return main;
    }

    const bar = layerBar();
    attachLayersControl(bar);
    const content = el(`<div class="content"><div class="pad keys-pad"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);

    // The board, how that layer is lit and the layer tabs under them are one
    // card; the legend reads under it. The tabs sit at the card's foot, next to
    // the workbench, so switching layers mid-edit is a short reach.
    const stage = el(`<div class="stack keys-stage"></div>`);
    const card = el(`<div class="board-card"></div>`);
    const row = layerColourRow(model, layer.index);
    const lit = stageEnabled(model, "layers") && row && !isOff(row.color);
    if (state.placement) card.appendChild(placementBar());
    else if (state.combo.picking) card.appendChild(pickBar());
    // One indication at a time: while a combo is being built its inputs are
    // the keys in question, otherwise the keys that reach the picked row.
    const building = state.combo.picking || (state.combo.open && state.tab === "combos");
    card.appendChild(board(view, {
        selected: state.selected,
        drafted: draftMarks(model?.draft?.changes).keys.get(layer.index),
        reach: building ? view.combos.inputKeys(state.combo.inputs) : reachHighlight(view),
        picking: state.combo.picking || Boolean(state.placement),
        onKey: (/** @type {number} */ index) => {
            if (state.placement) {
                const placement = state.placement;
                state.placement = null;
                state.selected = index;
                if (editGate(getModel(), "keys").editable) post(edits.setKey(layer.name, index, placement.keycode));
            } else if (state.combo.picking) {
                // The key the keyboard would answer with here, taken now: a
                // transparent key picks what shows through it, and switching
                // layers afterwards leaves this input as it is.
                const answer = view.combos.answers.get(index);
                state.combo.inputs = toggleComboInput(model, state.combo.inputs, answer, model?.firmware?.keysPerCombo);
            } else {
                state.selected = index;
                // Follow the key the board shows, including one with no
                // authored row. Transparent and disabled keys never get one.
                selectBehaviourKey(behaviourKey(index).keycode);
            }
            render();
        },
        onOpen: gate.editable ? (/** @type {number} */ index) => pickKeycodeFor(index) : undefined,
        onSwap: gate.editable ? (/** @type {number} */ from, /** @type {number} */ to) => swapKeys(from, to) : undefined,
    }));
    card.appendChild(view.previewing ? previewFoot(view) : el(`<div class="board-foot"><span class="board-foot-text">${lit
        ? `lit ${esc(hsvLabel(row.color))} · ${esc(word(vocabulary(model).paintModes, row.mode).toLowerCase())}`
        : "no layer colour · the background effect shows through"}</span></div>`));
    card.append(bar);
    stage.append(card, legend(model));
    pad.append(stage, bench());
    main.appendChild(content);
    return main;
}
