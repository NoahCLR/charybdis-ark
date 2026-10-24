// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {css, label as hsvLabel} from "../../lib/colour.mjs";
import {getModel, layerName, layers, post, writable} from "../../store.mjs";
import {slotCalled, vocabulary, word} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {inheritsStageColour} from "../../view/lighting.mjs";
import {marked} from "../marks.mjs";

// Where a group is used, as the row lists name it: the table, then the owner.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {{target: string, owner: string}} usage */
export function usageName(model, usage) {
    const table = word(vocabulary(model).ledTables, usage.target);
    return usage.owner ? `${table}: ${ownerName(model, usage.target, usage.owner)}` : table;
}

/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {string} target @param {string} owner */
const ownerName = (model, target, owner) => rowOwners(model, target).find(([value]) => value === owner)?.[1] ?? owner ?? "—";

// A row's owner by the name its dropdown offers, with the owner's mark —
// the layer's or pointing mode's icon in its colour, the feedback tier's dot —
// as the review shows the same row.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {string} target @param {string} owner */
function ownerCell(model, target, owner) {
    const name = ownerName(model, target, owner);
    const layer = target === "layer" && /^Layer (\d+)$/.exec(owner || "");
    const slot = target === "pdMode" ? (model?.rgb.pdModeColors || []).findIndex((row) => row.pointingMode === owner) : -1;
    const tier = target === "keyBehavior" && {KEY_FEEDBACK_GROUP_TAP_COMMITTED: "tap", KEY_FEEDBACK_GROUP_HOLD_ACTIVE: "hold", KEY_FEEDBACK_GROUP_LONG_HOLD_ACTIVE: "long"}[owner];
    /** @type {import("../../../contracts/model.js").ReviewMark | null} */
    const markOf = layer ? {kind: "layer", layer: Number(layer[1])} : slot >= 0 ? {kind: "pointing", slot} : tier ? {kind: "tier", tier} : null;
    return marked(model, markOf, name);
}

/** @param {import("../../../contracts/panel.js").LedRow[] | undefined} rows @param {string} target */
export function groupRowsTable(rows, target) {
    const model = getModel();
    if (!rows?.length) return el(`<p class="note led-rows">No LED override rows in this table. Rows override the stage colour on the LEDs they name.</p>`);
    const node = el(`<table class="t led-rows"><thead><tr><th>Owner</th><th>LEDs</th><th>Colour</th><th></th></tr></thead>
        <tbody>${rows.map((row, index) => `<tr>
            <td>${target === "combo" ? "All combos" : ownerCell(model, target, row.owner)}</td>
            <td class="mono">${esc(row.ledGroup)} · ${row.ledIndices.length} LED${row.ledIndices.length === 1 ? "" : "s"}</td>
            <td><span class="led-swatch ${inheritsStageColour(row.color) ? "swatch-off" : ""}" style="${inheritsStageColour(row.color) ? "" : `background:${css(row.color)}`}"></span>
                <code class="dim">${esc(hsvLabel(row.color))}</code>${inheritsStageColour(row.color) ? ` <span class="note">inherits the stage colour</span>` : ""}</td>
            <td class="t-act"><button class="btn tiny ghost" data-remove="${index}" ${writable() ? "" : "disabled"}>Remove</button></td></tr>`).join("")}</tbody></table>`);
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-remove]")).forEach((button) => button.addEventListener("click", () =>
        post(edits.deleteLedRow(target, Number(button.dataset.remove)))));
    return node;
}

// Who a row belongs to depends on its table: a layer, a pointing mode, a key
// feedback state, or — for combo feedback — nobody, since every combo shares
// one colour. The values are the names the core's RGB enums use.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {string} target @returns {readonly (readonly [string, string])[]} */
export function rowOwners(model, target) {
    if (target === "layer") return [...layers().map((layer) => /** @type {[string, string]} */ ([`Layer ${layer.index}`, layerName(layer)])), ["RGB_LAYER_GROUP_ALL", "All layers"]];
    if (target === "pdMode") return [...(model?.rgb.pdModeColors || []).map((row, index) =>
        /** @type {[string, string]} */ ([row.pointingMode, slotCalled(model, index)])), ["RGB_PD_MODE_GROUP_ALL", "All pointing modes"]];
    if (target === "keyBehavior") return vocabulary(model).feedbackOwners;
    return [];
}
