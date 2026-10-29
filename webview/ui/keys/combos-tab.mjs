// @ts-check
// The Combos tab: every combo this layer reaches, grouped by how, with the
// builder beside the table.

import {el, esc} from "../../lib/dom.mjs";
import {closeComboBuilder, currentView, getModel, openComboBuilder, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import * as edits from "../../view/edits.mjs";
import {draftMarks, draftDot} from "../../view/review.mjs";
import {reachAttrs, reachTable} from "../groups.mjs";
import {reachRowId, setReachGroupOpen} from "../../view/reach-groups.mjs";
import {comboBadge, comboOutputMarked, keyNameMarked} from "../marks.mjs";
import {vocabulary} from "../../view/vocabulary.mjs";
import {keyMeaning, keyName} from "../../view/keyface.mjs";
import {tabReach} from "../../view/tab-reach.mjs";
import {comboBuilder} from "./combo-builder.mjs";
import {keysReach} from "./reach.mjs";

/** @param {HTMLElement} body @param {HTMLElement} right */
export function tabCombos(body, right) {
    const model = getModel();
    const combos = model?.combos || [];
    const canEdit = editGate(model, "combos").editable;

    right.replaceChildren();
    const toggle = el(`<button class="btn tiny" ${canEdit ? "" : "disabled"}>${state.combo.open ? "Close builder" : "New combo"}</button>`);
    toggle.addEventListener("click", () => {
        if (state.combo.open) closeComboBuilder(); else openComboBuilder(null, edits.comboDefaultWindowValue(model));
        render();
    });
    right.appendChild(toggle);

    const node = el(`<div class="tab-split wide">
        <div id="comboTable"></div>
        <div id="comboSide"></div>
    </div>`);

    const view = currentView();
    const reach = tabReach(view, "combos");
    const changedCombos = draftMarks(model?.draft?.changes).combos;
    // A combo asked for by id is picked under the group that lists it on
    // this layer, and that group opens so the row is there to see.
    if (state.pickCombo !== null) {
        const id = String(state.pickCombo);
        const route = reach.groupOf(id);
        state.pickCombo = null;
        state.reachRow.combos = route ? reachRowId(route, id) : null;
        if (route) state.reachGroups = setReachGroupOpen(state.reachGroups, route, true);
    }
    /** @param {string} group @param {Pick<import("../../view/keyface-types.js").ComboGroupEntry, "combo">} entry @param {string} reachedBy */
    const row = (group, entry, reachedBy) => {
        const combo = entry.combo;
        const requires = /** @type {("mustHold" | "mustTap" | "ordered")[]} */ (["mustHold", "mustTap", "ordered"]).filter((flag) => combo[flag]).map((flag) => vocabulary(model).comboOptions[flag]).join(" · ") || "—";
        return `<tr${reachAttrs("combos", group, combo.id)} data-combo="${esc(String(combo.id))}"><td>${comboBadge(model, combo.badge)}${changedCombos.has(combo.id) ? draftDot() : ""}</td>
            <td>${(combo.inputs || []).map((input, at) => `<span class="tok">${keyNameMarked(model, combo.inputDisplays?.[at] ?? input, input)}</span>`).join(" + ")}</td>
            <td class="mono">${comboOutputMarked(model, combo)}</td>
            <td class="mono">${esc(combo.termMs ?? "")} ms${combo.followsDefault ? ` <span class="tag" data-tip="${esc(`Follows the default combo window (${vocabulary(model).settingsScreens.combos}), so it changes with it.`)}">default</span>` : ""}</td>
            <td class="muted">${esc(requires)}</td>
            <td class="muted">${reachedBy}</td></tr>`;
    };
    /** @param {string} group @param {import("../../view/keyface-types.js").ComboReachEntry} entry */
    const reachedBy = (group, entry) => group !== "elsewhere" ? keysReach(entry.keys, {names: false})
        : entry.inputs ? `${entry.covered} of ${entry.inputs} inputs, never at once` : "no inputs";
    // The selected key as the layers in view answer it, and every combo that
    // takes it as an input. Each row still says how this layer reaches that
    // combo, from the group that lists it.
    const onKey = view.combos.onKey(state.selected);
    const routes = new Map(reach.groups.filter((group) => group.id !== "view")
        .flatMap(({id, entries}) => entries.map((entry) => /** @type {const} */ ([entry.combo.id, {group: id, entry}]))));
    const comboGroupRows = [
        {id: "key", detail: onKey.position ? keyNameMarked(model, keyName(onKey.position, model), keyMeaning(onKey.position)) : "nothing answers here",
            rows: onKey.combos.map((combo) => {
                const route = routes.get(combo.id);
                return route ? row("key", route.entry, reachedBy(route.group, route.entry)) : row("key", {combo}, "—");
            }),
            drafted: onKey.combos.some((combo) => changedCombos.has(combo.id)),
            empty: onKey.position ? "No combo takes this key as an input." : "Every layer in view is transparent at the selected key."},
        ...reach.groups.map(({id, empty, entries}) => ({id, empty, drafted: entries.some((entry) => changedCombos.has(entry.combo.id)),
            rows: entries.map((entry) => row(id, entry, reachedBy(id, entry)))})),
    ];
    const comboTable = reachTable("combos", comboGroupRows, [
        ["", "7%"], ["Inputs", "25%"], ["Sends", "21%"], ["Window", "10%"],
        ["Conditions", "13%"], ["Reached by", "24%"]]);
    /** @type {HTMLElement} */ (node.querySelector("#comboTable")).replaceWith(comboTable);

    // A combo row is picked like any reach row — its keys ring on the board —
    // and opens in the builder beside the table. Clicking the row whose combo
    // is open lets go of both; a picked row whose builder was closed opens it.
    /** @type {NodeListOf<HTMLElement>} */ (comboTable.querySelectorAll("[data-reach]")).forEach((tr) => tr.addEventListener("click", () => {
        const combo = combos.find((entry) => String(entry.id) === tr.dataset.combo);
        const editing = state.combo.open && state.combo.editId === combo?.id;
        if (state.reachRow.combos === tr.dataset.reach && (editing || !canEdit)) {
            state.reachRow.combos = null;
            if (editing) closeComboBuilder();
        } else {
            state.reachRow.combos = tr.dataset.reach || null;
            if (canEdit && combo && !editing) openComboBuilder(combo);
        }
        render();
    }));
    const side = /** @type {HTMLElement} */ (node.querySelector("#comboSide"));
    side.appendChild(state.combo.open ? comboBuilder(canEdit, () => edits.comboHoldTermValue(model, undefined)) : el(`<div class="empty-card">
        <p class="note">Pick <b>New combo</b> to build one: choose what it sends, then click its input keys straight on the board.</p></div>`));
    body.replaceChildren(node);
}
