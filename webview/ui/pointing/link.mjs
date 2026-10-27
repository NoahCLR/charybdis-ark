// @ts-check
// The How it starts card: the mode's keys, then its link (firmware D-F62),
// one row per layer, in the tab order, with two switches: whether the layer
// starts this pointing mode, and whether it is turned on by this pointing
// mode's key. Then what ends a mode its layers started, as three buttons.
// Every link field is read into the slot's one record by readConfig
// (view/pointing-config.mjs linkRecord) and posted with the rest of it.
import {el, esc} from "../../lib/dom.mjs";
import {LINK_ENDS} from "../../view/pointing-config.mjs";
import {linkIgnored, linkRows, pointerLayerCovers} from "../../view/pointing-link.mjs";
import {layerSwitchTable, switchedLayers} from "../layer-switches.mjs";
import {words} from "./common.mjs";
import {keysRow} from "./keys-and-light.mjs";

/** @typedef {ReturnType<typeof import("./form-controls.mjs").formControls>} FormControls */
/** @param {string[]} names */
const listed = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit @param {FormControls} controls */
export function startCard(model, slot, canEdit, {form, disabled}) {
    const P = words(model), L = P.linkLabels;
    const rows = linkRows(model, slot);
    const started = rows.filter((row) => row.starts).map((row) => row.name), keyLayers = rows.filter((row) => row.key).map((row) => row.name);
    // The header sums up only the link; the keys are always there.
    const summary = [started.length ? `also started by ${listed(started)}` : "", keyLayers.length ? `its key turns on ${listed(keyLayers)}` : ""].filter(Boolean).join("; ");
    const card = el(`<div class="card pd-starts">
        <div class="card-h"><h3>How it starts</h3>${summary ? `<span class="right note">${esc(summary)}</span>` : ""}</div>
        <div class="card-b stack">
            <p class="note">Its keys start it. Layers can start it too, and its key can turn layers on.</p>
        </div></div>`);
    const body = /** @type {HTMLElement} */ (card.querySelector(".card-b"));
    body.append(keysRow(model, slot, canEdit));
    const locked = Boolean(disabled);

    const table = layerSwitchTable(model, "Layers", [L.starts, L.keyTurnsOn], rows.map((row) => ({
        layer: row.layer, label: row.name, why: row.why, tip: row.tip, unusable: row.unusable,
        switches: [
            {f: `pointing:${slot.id}:linkedLayers:${row.layer}`, label: `${row.name}: ${L.starts}`, checked: row.starts, disabled: locked || row.startLocked,
                tip: row.startTip || (row.startLocked ? row.tip : "While this layer is on, held or locked, it starts this pointing mode. A mode started by its key wins over one its layers started."), text: row.startsOther},
            {f: `pointing:${slot.id}:linkTurnsOn:${row.layer}`, label: `${row.name}: ${L.keyTurnsOn}`, checked: row.key, disabled: locked || row.keyLocked,
                tip: row.keyLocked ? row.tip : "While this pointing mode's key runs it, held or locked, this layer stays on; it goes off when the mode ends unless something else keeps it."},
        ],
    })));
    body.append(table);
    form.linkedLayers = () => switchedLayers(table, 0);
    form.linkTurnsOn = () => switchedLayers(table, 1);

    // What ends a mode its layers started, so only beside layers that start it.
    if (slot.linkedLayers) {
        const ends = el(`<div class="field pd-link-ends"><span>${esc(L.linkEnds)}</span>
            <div class="seg" role="radiogroup" aria-label="${esc(L.linkEnds)}"
                data-tip="A higher layer: one above the highest layer that starts this pointing mode and is on. Any layer: any layer that is on and is in neither column. Either ends the mode until that layer goes off; the pointer layer and the default layers never do, and a mode its key runs is never ended.">
                ${P.linkEnds.map(([value, text]) => `<label><input type="radio" name="pointing:${esc(slot.id)}:linkEnds" value="${esc(value)}" data-f="pointing:${esc(slot.id)}:linkEnds:${esc(value)}" ${value === slot.linkEnds ? "checked" : ""} ${esc(disabled)}><span>${esc(text)}</span></label>`).join("")}
            </div></div>`);
        form.linkEnds = () => Number(/** @type {HTMLInputElement | null} */ (ends.querySelector("input:checked"))?.value ?? LINK_ENDS.NOTHING);
        body.append(ends);
    }

    const ignored = linkIgnored(model, slot);
    if (ignored) body.append(el(`<div class="callout warn" role="note">${esc(ignored)} Switch it off.</div>`));
    const covers = pointerLayerCovers(model, slot);
    if (covers) {
        const names = listed(covers.covered);
        body.append(el(`<div class="callout warn" role="note">${esc(`${covers.pointer}, the pointer layer, sits above ${names}. This mode keeps the pointer layer on while its key runs it, so the pointer layer's keys cover ${names}'s wherever they are not transparent. Have its key turn on a layer above ${covers.pointer}, or choose Return to the typing layer under Advanced.`)}</div>`));
    }
    return card;
}
