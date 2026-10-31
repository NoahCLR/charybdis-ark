// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import * as edits from "../../view/edits.mjs";
import {keyLed, offWording, trackballLed} from "../../view/lighting.mjs";
import {colourEditor} from "../colour-editor.mjs";
import {groupRowsTable, rowOwners, usageName} from "./led-rows.mjs";
import {vocabulary} from "../../view/vocabulary.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageGroups(model) {
    const node = el(`<div class="tab-split builder"></div>`);
    const canEdit = editGate(model, "lighting").editable;
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
    const picked = ledIndices(model).length;
    /** @param {string} value @param {string} text @param {string} current */
    const option = (value, text, current) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(text)}</option>`;
    const node = el(`<aside class="stack gap-12">
        <div class="sect-h"><h4>New row from the selection</h4><span class="right tag">${picked} LED${picked === 1 ? "" : "s"}</span></div>
        <label class="field"><span>Table</span><select class="input" data-f="lighting:groups:target" data-target ${canEdit ? "" : "disabled"}>
            ${vocabulary(model).ledTables.map(([value, text]) => option(value, text, draft.target)).join("")}</select></label>
        ${owners.length ? `<label class="field"><span>Owner</span><select class="input" data-f="lighting:groups:owner" data-owner ${canEdit ? "" : "disabled"}>
            ${owners.map(([value, text]) => option(value, text, draft.owner)).join("")}</select></label>` : ""}
        <label class="field"><span>LEDs</span><select class="input" data-f="lighting:groups:source" data-source ${canEdit ? "" : "disabled"}>
            ${option("", "Inline selection from the board", draft.source)}
            ${groups.map((group) => option(group.name, `${group.name} · ${group.ledIndices.length} LED${group.ledIndices.length === 1 ? "" : "s"}`, draft.source)).join("")}</select></label>
    </aside>`);
    /** @type {HTMLElement} */ (node.querySelector("[data-target]")).addEventListener("change", (event) => { draft.target = /** @type {HTMLSelectElement} */ (event.target).value; draft.owner = ""; render(); });
    /** @type {HTMLElement | null} */ (node.querySelector("[data-owner]"))?.addEventListener("change", (event) => { draft.owner = /** @type {HTMLSelectElement} */ (event.target).value; });
    /** @type {HTMLElement} */ (node.querySelector("[data-source]")).addEventListener("change", (event) => { draft.source = /** @type {HTMLSelectElement} */ (event.target).value; });
    node.append(colourEditor({identity: "lighting:groups:draft",
        colour: state.rowColour || {h: "0", s: "0", v: "0"}, canEdit, title: "Row colour",
        maximumBrightness: model.rgb.maximumBrightness,
        ...offWording(model, "groups"),
        onChange: (next) => { state.rowColour = {h: String(next.h), s: String(next.s), v: String(next.v)}; render(); },
    }));
    const actions = el(`<div class="row gap-8">
        <button class="btn primary" data-act="keep" ${canEdit && (draft.source || picked) ? "" : "disabled"}
            data-tip="Pick LEDs on the board, or choose a saved group, to give the row something to paint.">Keep row in draft</button>
        <button class="btn ghost" data-act="save" ${canEdit && picked ? "" : "disabled"}
            data-tip="${picked ? "Store the picked LEDs as a group other rows can point at. Groups are numbered by the LEDs they hold, so the others may renumber." : "Pick LEDs on the board first, then make them a group."}">Make a group from the selection</button></div>`);
    /** @type {HTMLButtonElement} */ (actions.querySelector('[data-act="keep"]')).addEventListener("click", () => {
        post(edits.ledRow(draft, ledIndices(model), state.rowColour));
    });
    /** @type {HTMLButtonElement} */ (actions.querySelector('[data-act="save"]')).addEventListener("click", () =>
        post(edits.saveLedGroup(ledIndices(model))));
    node.append(actions);
    node.append(el(`<p class="note">Rows paint in the order the keyboard stores them, so a later row wins on the LEDs it shares.</p>`));
    return node;
}

// The LEDs picked on the board, by their numbers.
/** @param {import("../../../contracts/panel.js").PublishedModel} model */
const ledIndices = (model) => {
    const indices = state.ledPicks.map((index) => keyLed(model, index)).filter((value) => value !== undefined);
    const trackball = trackballLed(model);
    return state.trackball && trackball !== undefined ? [...indices, trackball] : indices;
};

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {boolean} canEdit */
function groupTables(model, canEdit) {
    const groups = model.rgb.ledGroups || [];
    const node = el(`<div class="stack gap-16"></div>`);
    node.append(el(`<div><div class="sect-h"><h4>Reusable groups</h4><span class="right note">numbered by the LEDs they hold, so saving or removing one can renumber the others</span></div>
        ${groups.length ? `<table class="t"><thead><tr><th>Group</th><th>LEDs</th><th>Used by</th><th></th></tr></thead><tbody>
            ${groups.map((group) => `<tr><td>${esc(group.name)}</td>
                <td class="mono">${esc(group.ledIndices.join(", "))} · ${group.ledIndices.length} LED${group.ledIndices.length === 1 ? "" : "s"}</td>
                <td class="muted">${group.usageCount ? group.usages.map((usage) => `<div>${esc(usageName(model, usage))}</div>`).join("") : "not used yet"}</td>
                <td class="t-act"><button class="btn tiny ghost" data-delete="${esc(group.name)}"
                    ${canEdit && !group.usageCount ? "" : "disabled"}
                    data-tip="${group.usageCount ? "Rows still refer to this group, so it cannot be deleted." : "Delete this group. Groups are numbered by the LEDs they hold, so the others may renumber; their rows keep their LEDs."}">Remove</button></td></tr>`).join("")}
            </tbody></table>` : `<p class="note">This keyboard has no reusable LED groups yet.</p>`}</div>`));
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-delete]")).forEach((button) => button.addEventListener("click", () =>
        post(edits.deleteLedGroup(/** @type {string} */ (button.dataset.delete)))));
    for (const [title, rows, target] of /** @type {[string, import("../../../contracts/panel.js").LedRow[] | undefined, string][]} */ ([
        ["Rows in the layer table", model.rgb.layerLedGroups, "layer"],
        ["Rows in the pointing-mode table", model.rgb.pdModeLedGroups, "pdMode"],
        ["Rows in the combo table", model.rgb.comboFeedbackLedGroups, "combo"],
        ["Rows in the key feedback table", model.rgb.keyBehaviorFeedbackLedGroups, "keyBehavior"],
    ])) {
        const box = el(`<div><div class="sect-h"><h4>${esc(title)}</h4><span class="right tag">${rows?.length || 0} row${rows?.length === 1 ? "" : "s"}</span></div></div>`);
        box.append(groupRowsTable(rows, target));
        node.append(box);
    }
    return node;
}
