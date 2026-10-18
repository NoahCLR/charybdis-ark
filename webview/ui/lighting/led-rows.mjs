// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {css, label as hsvLabel} from "../../lib/colour.mjs";
import {getModel, layerName, layers, positionAt, post, writable} from "../../store.mjs";
import {slotCalled, vocabulary} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {groupContentName, groupPositions, inheritsStageColour} from "../../view/lighting.mjs";
import {marked} from "../marks.mjs";
import {keyName} from "../../view/keyface.mjs";

// A row's owner by the name its dropdown offers, with the owner's mark —
// the layer's colour, the pointing mode's light, the feedback tier's dot —
// as the review shows the same row.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {string} target @param {string} owner */
function ownerCell(model, target, owner) {
    const name = rowOwners(model, target).find(([value]) => value === owner)?.[1] ?? owner ?? "—";
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
    if (!rows?.length) return el(`<p class="note led-rows">No rows here. A row gives the LEDs it names their own colour while its stage shows.</p>`);
    const node = el(`<table class="t led-rows"><thead><tr><th>For</th><th>LEDs</th><th>Colour</th><th></th></tr></thead>
        <tbody>${rows.map((row, index) => `<tr data-led-row="${index}">
            <td>${target === "combo" ? "All combos" : ownerCell(model, target, row.owner)}</td>
            <td data-tip="LEDs ${esc(row.ledIndices.join(", "))}">${esc(groupName(row.ledIndices))} · ${row.ledIndices.length} LED${row.ledIndices.length === 1 ? "" : "s"}</td>
            <td><span class="led-swatch ${inheritsStageColour(row.color) ? "swatch-off" : ""}" style="${inheritsStageColour(row.color) ? "" : `background:${css(row.color)}`}"></span>
                <code class="dim">${esc(hsvLabel(row.color))}</code>${inheritsStageColour(row.color) ? ` <span class="note">inherits the stage colour</span>` : ""}</td>
            <td class="t-act"><button class="btn tiny ghost" data-remove="${index}" ${writable() ? "" : "disabled"}>Remove</button></td></tr>`).join("")}</tbody></table>`);
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-remove]")).forEach((button) => button.addEventListener("click", () =>
        post(edits.deleteLedRow(target, Number(button.dataset.remove)))));
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-led-row]")).forEach((tr) =>
        outlinesOnBoard(tr, rows[Number(tr.dataset.ledRow)]?.ledIndices || []));
    return node;
}

// Who a row belongs to depends on its table: a layer, a pointing mode, a key
// feedback state, or — for combo feedback — nobody, since every combo shares
// one colour. The values are the names the host's RGB enums use.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {string} target @returns {readonly (readonly [string, string])[]} */
export function rowOwners(model, target) {
    if (target === "layer") return [...layers().map((layer) => /** @type {[string, string]} */ ([`Layer ${layer.index}`, layerName(layer)])), ["RGB_LAYER_GROUP_ALL", "All layers"]];
    if (target === "pdMode") return [...(model?.rgb.pdModeColors || []).map((row, index) =>
        /** @type {[string, string]} */ ([row.pointingMode, slotCalled(model, index)])), ["RGB_PD_MODE_GROUP_ALL", "All trackball modes"]];
    if (target === "keyBehavior") return vocabulary(model).feedbackOwners;
    return [];
}

// A group by what it holds, the keys named as they are on Base.
/** @param {readonly number[]} leds */
export const groupName = (leds) => groupContentName(leds, (index) => {
    const position = positionAt(layers()[0], index);
    return position ? keyName(position) : "";
});

// Hovering a group or a row outlines the keys it lights on the board.
/** @param {HTMLElement} row @param {readonly number[]} leds */
export function outlinesOnBoard(row, leds) {
    const {keys, trackball} = groupPositions(leds);
    /** @param {boolean} on */
    const mark = (on) => {
        const board = row.ownerDocument.querySelector(".board-card .board");
        for (const index of keys) board?.querySelector(`[data-key="${index}"]`)?.classList.toggle("kc-outline", on);
        if (trackball) board?.querySelector(".kc-ball")?.classList.toggle("kc-outline", on);
    };
    row.addEventListener("mouseenter", () => mark(true));
    row.addEventListener("mouseleave", () => mark(false));
}
