// @ts-check
// Lighting's Layers stage: each layer's colour, where it lights, and the keys
// with their own colour on it (the firmware's layer LED rows). Keys are picked
// on the board; rows are edited in place and dragged to reorder, since a later
// row wins on the keys it shares.

// Selector assertions refer to elements created by this module's authored markup.
import {el, esc} from "../../lib/dom.mjs";
import {css, isOff} from "../../lib/colour.mjs";
import {currentLayer, layerName, layers, positionAt, post, render, showLayer, state, writable} from "../../store.mjs";
import {LED_INDEX, TRACKBALL_LED} from "../../view/geometry.mjs";
import {colourPresets, inheritsStageColour, layerColourRow, layerPaints} from "../../view/lighting.mjs";
import {keyMeaning, keyName} from "../../view/keyface.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import * as edits from "../../view/edits.mjs";
import {keyNameMarked} from "../marks.mjs";
import {colourEditor} from "../colour-editor.mjs";
import {colourControl, section, stack} from "./common.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageLayers(model) {
    const canEdit = writable();
    const marks = draftMarks(model?.draft?.changes);
    const node = el(`<div class="tab-split bench-split"></div>`);
    // The list scrolls on its own beside the editor, as the trackball modes' does.
    const list = el(`<aside class="rowlist compact ${layers().length > 8 ? "many" : ""}" data-scroll-list="layers"><div class="rowlist-h">Layers</div></aside>`);
    layers().forEach((layer, index) => {
        const row = layerColourRow(model, layer.index);
        const lit = row && !isOff(row.color);
        const lights = word(vocabulary(model).paintModes, row?.mode).toLowerCase();
        const meta = !row ? "not reported" : !layerPaints(row.color) ? "no colour" : `${lit ? "" : "black · "}${lights}`;
        // The usual case says nothing in the row; its tooltip still does.
        const shown = row?.mode === "KEYS_MAPPED_ON_THIS_LAYER_ONLY" && lit ? "" : meta;
        const item = el(`<button class="rowitem ${index === state.layer ? "on" : ""}" data-layer="${index}" data-tip="${esc(meta)}">
            <span class="t"><span class="mk-swatch lead ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.color)}` : ""}"></span>${esc(layerName(layer))}${marks.lightingLayers.has(layer.index) ? draftDot() : ""}</span>
            <span class="m">${esc(shown)}</span></button>`);
        item.addEventListener("click", () => { showLayer(index); render(); });
        list.append(item);
    });
    const layer = currentLayer();
    const row = layerColourRow(model, layer?.index);
    const main = el(`<div class="tab-grid two stage-detail"></div>`);
    const colour = section(`${layerName(layer)} colour`);
    colour.append(colourControl(model, {
        colour: row?.color, canEdit, title: `${layerName(layer)} layer`,
        offLabel: "No colour (lower layers show)",
        offNote: "No colour: the layers below and the base effect show through wherever this layer would paint.",
        onChange: (next) => { if (row) post(edits.layerColour(row.layer, row.mode, next)); },
    }));
    const where = section("Where it lights");
    const mode = el(`<label class="field"><span>Lights</span>
        <select data-f="lighting:layer:${layer?.index}:mode" class="input" ${canEdit ? "" : "disabled"}>
            ${vocabulary(model).paintModes.map(([id, text]) => `<option value="${id}" ${(row?.mode || "KEYS_MAPPED_ON_THIS_LAYER_ONLY") === id ? "selected" : ""}>${esc(text)}</option>`).join("")}
        </select></label>`);
    /** @type {HTMLSelectElement} */ (mode.querySelector("select")).addEventListener("change", (event) =>
        { if (row) post(edits.layerColour(row.layer, /** @type {HTMLSelectElement} */ (event.target).value, row.color)); });
    where.append(stack(mode,
        el(`<p class="note">"Keys that do something" leaves transparent and Nothing keys to the layers below.</p>`),
        el(`<p class="note" data-layer-preview>Holding a layer key previews its colours first; this follows Show this stage.</p>`)));
    main.append(colour, where, ownColours(model, layer, canEdit));
    node.append(list, main);
    return node;
}

// Picked keys become a row on the layer shown, in a colour of their own: the
// layer's colour a third of the way round the wheel, so they stand out, then
// opened for editing.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../../../contracts/panel.js").Layer | undefined} layer */
export function colourPickedKeys(model, layer) {
    if (!layer || !state.colourPicks.length) return;
    const own = layerColourRow(model, layer.index)?.color;
    const start = own && layerPaints(own) ? own : colourPresets(model)[0]?.colour;
    const max = Number(model.rgb.maximumBrightness ?? 200);
    const colour = {h: String((Number(start?.h ?? 0) + 85) % 256), s: "255", v: String(Math.min(max, Math.max(Number(start?.v ?? max), 1)))};
    post(edits.ledRow({target: "layer", owner: `Layer ${layer.index}`, source: ""}, ledsOf(state.colourPicks), colour));
    state.colourRow = (model.rgb.layerLedGroups || []).length;
    state.colourPicks = [];
}

/** @param {number[]} picks layout indices */
const ledsOf = (picks) => picks.map((index) => LED_INDEX[index]).filter((value) => value !== undefined);

// "Keys with their own colour": only this layer's rows and the rows for every
// layer (marked), each where it sits in the keyboard's table.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../../../contracts/panel.js").Layer | undefined} layer @param {boolean} canEdit */
function ownColours(model, layer, canEdit) {
    const all = model.rgb.layerLedGroups || [];
    const rows = all.map((row, index) => ({row, index}))
        .filter(({row}) => row.owner === `Layer ${layer?.index}` || row.owner === "RGB_LAYER_GROUP_ALL");
    if (state.colourRow !== null && !rows.some(({index}) => index === state.colourRow)) state.colourRow = null;
    const picks = state.colourPicks.length;
    const node = section(`Keys with their own colour (${rows.length})`, `<span class="right">
        <button class="btn compact" data-act="colour-picked" ${canEdit && picks ? "" : "disabled"}
            data-tip="${picks ? `Give the ${picks} picked key${picks === 1 ? "" : "s"} their own colour on ${esc(layerName(layer))}.` : "Click keys on the board to pick them first."}">+ Colour picked keys</button></span>`);
    node.className = "span own-colours";
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="colour-picked"]')).addEventListener("click", () => colourPickedKeys(model, layer));
    if (!rows.length) {
        node.append(el(`<p class="note">Click keys on the board, then + Colour picked keys, to light them in a colour of their own on ${esc(layerName(layer))}.</p>`));
        return node;
    }
    const box = el(`<div class="own-rows" role="list"></div>`);
    for (const {row, index} of rows) {
        const inherits = inheritsStageColour(row.color);
        const open = state.colourRow === index;
        const item = el(`<div class="own-row${open ? " open" : ""}" role="listitem" data-own-row="${index}" ${canEdit ? 'draggable="true"' : ""}>
            <span class="grip" tabindex="${canEdit ? 0 : -1}" aria-label="Move this row; a later row wins" data-tip="Drag to reorder. A later row wins on the keys it shares.">⋮⋮</span>
            <span class="led-swatch ${inherits ? "swatch-off" : ""}" style="${inherits ? "" : `background:${css(row.color)}`}"></span>
            <span class="own-keys">${keysOf(model, layer, row.ledIndices)}${row.owner === "RGB_LAYER_GROUP_ALL" ? ` <span class="tag">All layers</span>` : ""}${inherits ? ` <span class="note">the layer's colour</span>` : ""}</span>
            <button class="btn text" data-act="edit" aria-expanded="${open}" ${canEdit ? "" : "disabled"}>${open ? "Done" : "Edit"}</button>
            <button class="btn text destructive" data-act="remove" ${canEdit ? "" : "disabled"}>Remove</button></div>`);
        /** @type {HTMLButtonElement} */ (item.querySelector('[data-act="edit"]')).addEventListener("click", () => { state.colourRow = open ? null : index; render(); });
        /** @type {HTMLButtonElement} */ (item.querySelector('[data-act="remove"]')).addEventListener("click", () => {
            if (state.colourRow === index) state.colourRow = null;
            post(edits.deleteLedRow("layer", index));
        });
        if (canEdit) draggable(item, index, rows.map((entry) => entry.index));
        box.append(item);
        if (open) {
            const editor = el(`<div class="own-editor"></div>`);
            editor.append(colourEditor({identity: `lighting:layers:row:${index}`, colour: row.color, canEdit, title: "This row",
                maximumBrightness: model.rgb.maximumBrightness, presets: colourPresets(model),
                offLabel: "Use the layer's colour",
                offNote: "Stored as HSV(0, 0, 0), this row takes the layer's own colour on its keys.",
                onChange: (next) => post(edits.updateLedRow("layer", index, next))}));
            const keys = el(`<button class="btn compact self-start" data-act="use-picks" ${picks ? "" : "disabled"}
                data-tip="Click keys on the board to pick them first.">Use the ${picks || ""} picked key${picks === 1 ? "" : "s"}</button>`);
            keys.addEventListener("click", () => {
                post(edits.updateLedRow("layer", index, row.color, ledsOf(state.colourPicks)));
                state.colourPicks = [];
            });
            editor.append(keys);
            box.append(editor);
        }
    }
    node.append(box, el(`<p class="note">Later rows win where they share keys. Rows for every layer paint on each layer that is on.</p>`));
    return node;
}

// A row's LEDs named by the keys over them on the layer shown.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../../../contracts/panel.js").Layer | undefined} layer @param {number[]} leds */
function keysOf(model, layer, leds) {
    const names = leds.map((led) => {
        if (led === TRACKBALL_LED) return "trackball";
        const index = Object.entries(LED_INDEX).find(([, value]) => value === led)?.[0];
        const position = index === undefined ? undefined : positionAt(layer, Number(index));
        return position ? keyNameMarked(model, keyName(position), keyMeaning(position)) : `LED ${esc(led)}`;
    });
    return names.length > 6 ? `${names.slice(0, 6).join(", ")} <span class="dim">+${names.length - 6}</span>` : names.join(", ");
}

// Drag a row onto another to move it there; with the grip focused, the arrow
// keys move it one place.
/** @param {HTMLElement} item @param {number} index @param {number[]} order this layer's rows, by their place in the table */
function draggable(item, index, order) {
    item.addEventListener("dragstart", (event) => { event.dataTransfer?.setData("text/plain", String(index)); item.classList.add("dragging"); });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", (event) => { event.preventDefault(); item.classList.add("drop-target"); });
    item.addEventListener("dragleave", () => item.classList.remove("drop-target"));
    item.addEventListener("drop", (event) => {
        event.preventDefault();
        item.classList.remove("drop-target");
        const from = Number(event.dataTransfer?.getData("text/plain"));
        if (Number.isInteger(from) && from !== index) post(edits.moveLedRow("layer", from, index));
    });
    /** @type {HTMLElement} */ (item.querySelector(".grip")).addEventListener("keydown", (event) => {
        const at = order.indexOf(index), to = event.key === "ArrowUp" ? order[at - 1] : event.key === "ArrowDown" ? order[at + 1] : undefined;
        if (to === undefined) return;
        event.preventDefault();
        post(edits.moveLedRow("layer", index, to));
    });
}
