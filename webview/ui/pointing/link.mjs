// @ts-check
// Step 3 of a mode, What starts it: its keys, then its link (firmware D-F62)
// as two lists of layer chips, the layers that start it and the layers its
// key turns on, each with an Add menu. A layer that cannot go in a list is in
// the menu, disabled, saying why; the empty layers sit in the menu's own
// group at its end. Then what ends a mode its layers started, and the
// warnings. Every link field is read into the slot's one record by readConfig
// (view/pointing-config.mjs linkRecord) and posted with the rest of it.
import {el, esc} from "../../lib/dom.mjs";
import {LINK_ENDS} from "../../view/pointing-config.mjs";
import {listed} from "../../view/vocabulary.mjs";
import {linkIgnored, linkRows, pointerLayerCovers} from "../../view/pointing-link.mjs";
import {emptyLayers} from "../../view/empty-layers.mjs";
import {marked} from "../marks.mjs";
import {words} from "./common.mjs";
import {keysRow} from "./keys-and-light.mjs";
import {segmented, segmentedValue} from "../segmented.mjs";

/** @typedef {ReturnType<typeof import("./form-controls.mjs").formControls>} FormControls */
/** @typedef {import("../../view/pointing-link.mjs").LinkRow} LinkRow */
/** @typedef {import("../../../contracts/panel.js").PublishedModel} Model */

/** @param {Model} model @param {import("../surface-types.js").PresentedSlot} slot @param {FormControls} controls @param {() => void} stage */
export function startStep(model, slot, {form, disabled}, stage) {
    const P = words(model), L = P.linkLabels;
    const rows = linkRows(model, slot);
    const node = el(`<div class="pd-starts stack">
        <div class="pd-row"><span class="pd-row-l">Its keys</span></div>
        <div class="pd-row" data-tip="While one of these layers is on, held or locked, it starts this pointing mode. A mode started by its key wins over one its layers started."><span class="pd-row-l" id="pd-starts-${esc(slot.id)}">Layers</span></div>
        <div class="pd-row" data-tip="While this pointing mode's key runs it, held or locked, these layers stay on; each goes off when the mode ends unless something else keeps it."><span class="pd-row-l" id="pd-turns-${esc(slot.id)}">${esc(L.keyTurnsOnShort)}</span></div></div>`);
    const [keys, starts, turns] = /** @type {HTMLElement[]} */ ([...node.querySelectorAll(".pd-row")]);
    keys.append(keysRow(model, slot));
    let linked = slot.linkedLayers, turnsOn = slot.linkTurnsOn;
    form.linkedLayers = () => linked;
    form.linkTurnsOn = () => turnsOn;
    const empties = emptyLayers(model);
    starts.append(layerChips(model, rows, "starts", {disabled, empties, labelledBy: `pd-starts-${slot.id}`, id: `pointing:${slot.id}:linkedLayers`,
        change: (layer, on) => { linked = on ? linked | 2 ** layer : linked & ~(2 ** layer); stage(); }}));
    turns.append(layerChips(model, rows, "key", {disabled, empties, labelledBy: `pd-turns-${slot.id}`, id: `pointing:${slot.id}:linkTurnsOn`,
        change: (layer, on) => { turnsOn = on ? turnsOn | 2 ** layer : turnsOn & ~(2 ** layer); stage(); }}));

    // What ends a mode its layers started, so only beside layers that start it.
    if (slot.linkedLayers) {
        const ends = el(`<div class="pd-row"><span class="pd-row-l" aria-hidden="true">${esc(L.endsWhen)}</span>${segmented({label: L.linkEnds, f: `pointing:${slot.id}:linkEnds`,
            choices: P.linkEnds, current: slot.linkEnds, disabled: Boolean(disabled), hideLabel: true,
            tip: "A higher layer: one above the highest layer that starts this pointing mode and is on. Any layer: any layer that is on and starts or is turned on by neither. Either ends the mode until that layer goes off; the pointer layer and the default layers never do, and a mode its key runs is never ended."})}</div>`);
        form.linkEnds = () => Number(segmentedValue(ends) || LINK_ENDS.NOTHING);
        node.append(ends);
    }

    const ignored = linkIgnored(model, slot);
    if (ignored) node.append(el(`<div class="callout warn" role="note">${esc(ignored)} Remove it.</div>`));
    const covers = pointerLayerCovers(model, slot);
    if (covers) {
        const names = listed(covers.covered);
        node.append(el(`<div class="callout warn" role="note">${esc(`${covers.pointer}, the pointer layer, sits above ${names}. This mode keeps the pointer layer on while its key runs it, so the pointer layer's keys cover ${names}'s wherever they are not transparent. Have its key turn on a layer above ${covers.pointer}, or choose Return to the typing layer under While it runs.`)}</div>`));
    }
    return node;
}

// One half of the link as chips: a chip per layer in it, each with ×, then
// an Add menu of the layers that are not. `which` is the row field: "starts"
// or "key".
/** @param {Model} model @param {LinkRow[]} rows @param {"starts" | "key"} which @param {{disabled: string, empties: ReadonlySet<number>, labelledBy: string, id: string, change: (layer: number, on: boolean) => void}} options */
function layerChips(model, rows, which, {disabled, empties, labelledBy, id, change}) {
    const locked = (/** @type {LinkRow} */ row) => which === "starts" ? row.startLocked : row.keyLocked;
    const on = rows.filter((row) => row[which]);
    const off = rows.filter((row) => !row[which]);
    // Why a layer cannot be added, said in its menu entry.
    const why = (/** @type {LinkRow} */ row) => row.why || (which === "starts" && row.startsOther ? row.startsOther : row.tip);
    /** @param {LinkRow} row */
    const option = (row) => `<option value="${esc(row.layer)}" ${locked(row) ? "disabled" : ""}>${esc(row.name)}${locked(row) && why(row) ? ` · ${esc(why(row))}` : ""}</option>`;
    const shown = off.filter((row) => !empties.has(row.layer)), folded = off.filter((row) => empties.has(row.layer));
    const node = el(`<div class="pd-chips" role="group" aria-labelledby="${esc(labelledBy)}">
        ${on.map((row) => `<span class="pd-chip ${row.unusable ? "warn" : ""}" ${row.tip ? `data-tip="${esc(row.tip)}"` : ""}>${marked(model, {kind: "layer", layer: row.layer}, row.name)}
            <button type="button" data-remove="${esc(row.layer)}" aria-label="${esc(`Remove ${row.name}`)}" ${esc(disabled)}>×</button></span>`).join("")}
        ${on.length ? "" : `<span class="note">None</span>`}
        ${off.some((row) => !locked(row)) ? `<select class="input pd-add" data-f="${esc(id)}:add" aria-label="Add a layer" ${esc(disabled)}>
            <option value="">+ Add layer</option>${shown.map(option).join("")}
            ${folded.length ? `<optgroup label="Empty layers">${folded.map(option).join("")}</optgroup>` : ""}</select>` : ""}
    </div>`);
    node.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () =>
        change(Number(/** @type {HTMLElement} */ (button).dataset.remove), false)));
    // The add menu stages by itself, never through the editor's change
    // listener, which would stage the record before the chip was added.
    node.querySelector("select")?.addEventListener("change", (event) => {
        event.stopPropagation();
        const value = /** @type {HTMLSelectElement} */ (event.target).value;
        if (value !== "") change(Number(value), true);
    });
    return node;
}
