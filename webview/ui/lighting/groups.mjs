// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {post, render, state, writable} from "../../store.mjs";
import {LED_INDEX, TRACKBALL_LED} from "../../view/geometry.mjs";
import * as edits from "../../view/edits.mjs";
import {colourEditor} from "../colour-editor.mjs";
import {groupName, groupRowsTable, outlinesOnBoard, rowOwners} from "./led-rows.mjs";

// Who uses a group, in the words its rows' owners are offered in.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {{target: string, owner?: string}} usage */
function usedBy(model, usage) {
    const table = {layer: "layer", pdMode: "trackball mode", combo: "combos", keyBehavior: "key feedback"}[usage.target] || usage.target;
    if (usage.target === "combo") return "All combos";
    const owner = rowOwners(model, usage.target).find(([value]) => value === usage.owner)?.[1];
    return owner ? `${owner}${usage.target === "layer" && !/layers$/.test(owner) ? " layer" : ""}` : table;
}

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageGroups(model) {
    const node = el(`<div class="tab-split builder"></div>`);
    const canEdit = writable();
    node.append(groupBuilder(model, canEdit), groupTables(model, canEdit));
    return node;
}

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {boolean} canEdit */
function groupBuilder(model, canEdit) {
    const groups = model.rgb.ledGroups || [];
    const draft = state.ledRow;
    const owners = rowOwners(model, draft.target);
    if (!owners.some(([value]) => value === draft.owner)) draft.owner = owners[0]?.[0] ?? "";
    if (draft.source && !groups.some((group) => group.name === draft.source)) draft.source = "";
    /** @param {string} value @param {string} text @param {string} current */
    const option = (value, text, current) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(text)}</option>`;
    const node = el(`<aside class="stack gap-12">
        <div class="sect-h"><h4>New row from the selection</h4><span class="right tag">${ledCount(state.ledPicks.length + (state.trackball ? 1 : 0))}</span></div>
        <label class="field"><span>Stage</span><select class="input" data-f="lighting:groups:target" data-target ${canEdit ? "" : "disabled"}>
            ${[["layer", "Layers"], ["pdMode", "Trackball modes"], ["combo", "Combos"], ["keyBehavior", "Key feedback"]]
                .map(([value, text]) => option(value, text, draft.target)).join("")}</select></label>
        ${owners.length ? `<label class="field"><span>For</span><select class="input" data-f="lighting:groups:owner" data-owner ${canEdit ? "" : "disabled"}>
            ${owners.map(([value, text]) => option(value, text, draft.owner)).join("")}</select></label>` : ""}
        <label class="field"><span>LEDs</span><select class="input" data-f="lighting:groups:source" data-source ${canEdit ? "" : "disabled"}>
            ${option("", "The keys picked on the board", draft.source)}
            ${groups.map((group) => option(group.name, `${groupName(group.ledIndices)} · ${ledCount(group.ledIndices.length)}`, draft.source)).join("")}</select></label>
    </aside>`);
    /** @type {HTMLElement} */ (node.querySelector("[data-target]")).addEventListener("change", (event) => { draft.target = /** @type {HTMLSelectElement} */ (event.target).value; draft.owner = ""; render(); });
    /** @type {HTMLElement | null} */ (node.querySelector("[data-owner]"))?.addEventListener("change", (event) => { draft.owner = /** @type {HTMLSelectElement} */ (event.target).value; });
    /** @type {HTMLElement} */ (node.querySelector("[data-source]")).addEventListener("change", (event) => { draft.source = /** @type {HTMLSelectElement} */ (event.target).value; });
    node.append(colourEditor({identity: "lighting:groups:draft",
        colour: state.rowColour || {h: "0", s: "0", v: "0"}, canEdit, title: "Row colour",
        maximumBrightness: model.rgb.maximumBrightness,
        offNote: "A row stored as HSV(0, 0, 0) inherits its stage colour instead of painting its own.",
        onChange: (next) => { state.rowColour = {h: String(next.h), s: String(next.s), v: String(next.v)}; render(); },
    }));
    const actions = el(`<div class="row gap-8">
        <button class="btn primary" data-act="keep" ${canEdit && (draft.source || state.ledPicks.length) ? "" : "disabled"}
            data-tip="Pick LEDs on the board, or choose a saved group, to give the row something to paint.">Add</button>
        <button class="btn" data-act="save" ${canEdit && ledIndices().length ? "" : "disabled"}
            data-tip="Keep the picked keys as a group other rows can point at.">Save selection as a group</button></div>`);
    /** @type {HTMLButtonElement} */ (actions.querySelector('[data-act="keep"]')).addEventListener("click", () => {
        post(edits.ledRow(draft, ledIndices(), state.rowColour));
    });
    /** @type {HTMLButtonElement} */ (actions.querySelector('[data-act="save"]')).addEventListener("click", () =>
        post(edits.saveLedGroup(ledIndices())));
    node.append(actions);
    node.append(el(`<p class="note">Rows are applied in the order the keyboard stores them, so a later row wins on the LEDs it shares.</p>`));
    return node;
}

/** @param {number} count */
const ledCount = (count) => `${count} LED${count === 1 ? "" : "s"}`;
const ledIndices = () => {
    const indices = state.ledPicks.map((index) => LED_INDEX[index]).filter((value) => value !== undefined);
    return state.trackball ? [...indices, TRACKBALL_LED] : indices;
};

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {boolean} canEdit */
function groupTables(model, canEdit) {
    const groups = model.rgb.ledGroups || [];
    const node = el(`<div class="stack gap-16"></div>`);
    node.append(el(`<div><div class="sect-h"><h4>Saved groups</h4><span class="right note">one set of keys, used by many rows</span></div>
        ${groups.length ? `<table class="t"><thead><tr><th>Group</th><th>LEDs</th><th>Used by</th><th></th></tr></thead><tbody>
            ${groups.map((group) => `<tr data-group-row="${esc(group.name)}"><td>${esc(groupName(group.ledIndices))}</td>
                <td class="mono led-count" data-tip="LEDs ${esc(group.ledIndices.join(", "))}">${ledCount(group.ledIndices.length)}</td>
                <td class="muted">${group.usageCount ? esc(group.usages.map((usage) => usedBy(model, usage)).join(", ")) : "not used yet"}</td>
                <td class="t-act"><button class="btn tiny ghost" data-delete="${esc(group.name)}"
                    ${canEdit && !group.usageCount ? "" : "disabled"}
                    data-tip="${group.usageCount ? "Rows still refer to this group, so it cannot be deleted." : "Delete this group."}">Remove</button></td></tr>`).join("")}
            </tbody></table>` : `<p class="note">This keyboard has no reusable LED groups yet.</p>`}</div>`));
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-delete]")).forEach((button) => button.addEventListener("click", () =>
        post(edits.deleteLedGroup(/** @type {string} */ (button.dataset.delete)))));
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-group-row]")).forEach((row) =>
        outlinesOnBoard(row, groups.find((group) => group.name === row.dataset.groupRow)?.ledIndices || []));
    for (const [title, rows, target] of /** @type {[string, import("../../../contracts/panel.js").LedRow[] | undefined, string][]} */ ([
        ["Layer rows", model.rgb.layerLedGroups, "layer"],
        ["Trackball mode rows", model.rgb.pdModeLedGroups, "pdMode"],
        ["Combo rows", model.rgb.comboFeedbackLedGroups, "combo"],
        ["Key feedback rows", model.rgb.keyBehaviorFeedbackLedGroups, "keyBehavior"],
    ])) {
        const count = rows?.length || 0;
        const box = el(`<div><div class="sect-h"><h4>${title}</h4><span class="right tag">${count} row${count === 1 ? "" : "s"}</span></div></div>`);
        box.append(groupRowsTable(rows, target));
        node.append(box);
    }
    return node;
}
