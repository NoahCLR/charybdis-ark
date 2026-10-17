// @ts-check
/**
 * @typedef {NonNullable<ReturnType<typeof import("../../view/behavior-editor.mjs").behaviourEditorRow>>} EditorBehavior
 */
// The Behaviours tab: the behaviours this layer reaches, grouped by how, and
// the open one's editor beside them.

import {el, esc} from "../../lib/dom.mjs";
import {actionLabel, behaviourTiers} from "../../view/keyface.mjs";
import {behaviourGroups, behavioursInView} from "../../view/reach.mjs";
import {currentLayer, getModel, heldLayers, layerName, layers, render, selectedPosition, state} from "../../store.mjs";
import {behaviourEditorRow} from "../../view/behavior-editor.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import {attachGroupToggles, groupHeader, groupOpen} from "../groups.mjs";
import {inGroupOrder, setReachGroupOpen} from "../../view/reach-groups.mjs";
import {actionMarked, comboInputsMarked, tierDot} from "../marks.mjs";
import {behaviourEditor} from "./behaviour-editor.mjs";
import {behaviourKey, behaviourRoute, selectBehaviourKey} from "./behaviour-selection.mjs";
import {sourceLabel} from "./reach.mjs";

// The combos that send a behaviour, by badge and chord; one that needs a
// transparent key names the layer answering for it. Markup, as every row's
// note is, so the chord's keys carry their layer marks.
/** @param {Pick<ReturnType<typeof behavioursInView>[number], "combos">} entry */
const comboNote = (entry) => entry.combos.map(({combo, keys}) => {
    const sources = [...new Set(keys.filter((key) => key.fellThrough)
        .map((key) => esc(layerName(key.layer)) + (key.whileHeld ? " when held" : "")))];
    return `combo ${esc(combo.badge)} · ${comboInputsMarked(getModel(), combo)}${sources.length ? ` · on ${sources.join(", ")}` : ""}`;
}).join(", ");
/** @param {ReturnType<typeof behavioursInView>[number]} entry */
const viewBehaviourNote = (entry) => {
    const indexes = [...new Set(entry.keys.map((key) => key.position.layoutIndex))];
    const sources = [...new Set(entry.keys.filter((key) => key.fellThrough).map((key) => esc(layerName(key.layer))))];
    return [indexes.length ? `index ${indexes.join(", ")}${sources.length ? ` · on ${sources.join(", ")}` : ""}` : "",
        entry.combos.length ? comboNote(entry) : ""].filter(Boolean).join(" · ");
};

// When the open row is the one the selected transparent key shows through,
// say which layer supplies it and that the row belongs to that keycode, so an
// edit here is not mistaken for one local to this position.
/** @param {EditorBehavior} behaviour */
function followedBelow(behaviour) {
    const position = selectedPosition();
    const followed = behaviourKey(position?.layoutIndex);
    if (!followed.from || followed.keycode !== state.behaviourRow) return "";
    const model = getModel();
    const name = actionMarked(model, behaviour.keycode);
    return `<p class="note beh-note">The selected key on <b>${esc(layerName(currentLayer()))}</b> is transparent,
        so in this preview <b>${esc(layerName(followed.from))}</b> answers with ${name}. A behaviour belongs to its keycode:
        this is ${name}’s, and a change here applies wherever ${name} is pressed, not only at this position.</p>`;
}

/** @param {HTMLElement} body @param {HTMLElement} right */
export function tabBehaviours(body, right) {
    const model = getModel();
    const {here, through, combos, combosBelow, elsewhere} = behaviourGroups(model, layers(), state.layer);
    const inView = behavioursInView(model, layers(), state.layer, heldLayers());
    if (!state.behaviourRow) selectBehaviourKey(behaviourKey(selectedPosition()?.layoutIndex).keycode);
    const behaviour = behaviourEditorRow(model, state.behaviourRow || "");

    right.replaceChildren();

    const route = behaviourRoute();
    const changed = draftMarks(model?.draft?.changes).behaviours;
    /** @param {string} group @param {import("../../../contracts/panel.js").BehaviorView} row @param {string} note */
    const item = (group, row, note) => `<button class="rowitem ${row.keycode === state.behaviourRow && (!route || route === group) ? "on" : ""} ${note ? "quiet" : ""}" data-row="${esc(row.keycode)}" data-route="${group}">
        <span class="t">${actionMarked(model, row.keycode)}${actionLabel(model, row.keycode) === row.keycode ? ""
            : ` <code class="dim">${esc(row.keycode)}</code>`}${changed.has(row.keycode) ? draftDot() : ""}</span>
        <span class="m">${behaviourTiers(row).map((tier) => tierDot(model, tier.kind)).join("")} ${row.steps.length} branch${row.steps.length === 1 ? "" : "es"}${note ? ` · ${note}` : ""}</span></button>`;

    // A selection made anywhere else — the board, the Key tab, a fresh
    // behaviour — can land in a closed group, so the group holding it opens
    // once when the selection moves there. Closing it again then sticks.
    const groups = [
        {id: "view", rows: inView.map((entry) => ({row: entry.row, note: viewBehaviourNote(entry)})),
            empty: "No behaviour is reached by the layers in this view."},
        {id: "here", rows: here.map((row) => ({row, note: ""})),
            empty: "No key behaviour is placed on this layer."},
        {id: "combos", rows: combos.map((entry) => ({row: entry.row, note: comboNote(entry)})),
            empty: "No combo on this layer sends a behaviour."},
        {id: "through", rows: through.map((entry) => ({row: entry.row, note: `on ${sourceLabel(entry)}`})),
            empty: "No transparent key falls through to a behaviour."},
        {id: "belowCombos", rows: combosBelow.map((entry) => ({row: entry.row, note: comboNote(entry)})),
            empty: "No combo that needs a transparent key sends a behaviour."},
        {id: "elsewhere", rows: elsewhere.map((row) => ({row, note: "not on this layer"})),
            empty: "Every behaviour on the board is reached from this layer."},
    ];
    const selectionMoved = state.behaviourRow !== state.behaviourRowShown;
    if (selectionMoved) {
        const holding = groups.find((group) => group.id === route)
            || groups.find((group) => group.rows.some((entry) => entry.row.keycode === state.behaviourRow));
        if (holding) state.reachGroups = setReachGroupOpen(state.reachGroups, holding.id, true);
        state.behaviourRowShown = state.behaviourRow;
    }

    /** @param {{id: string, rows: {row: import("../../../contracts/panel.js").BehaviorView, note: string}[], empty: string}} group */
    const section = (group) => `<div class="rowgroup">
        ${groupHeader("behaviours", group.id, group.rows.length, group.rows.some(({row}) => changed.has(row.keycode)))}
        ${groupOpen("behaviours", group.id)
            ? (group.rows.length ? `<div class="beh-rows"${selectionMoved ? " data-reveal-selected" : ""}>${group.rows.map((entry) => item(group.id, entry.row, entry.note)).join("")}</div>`
                : `<p class="note rowgroup-empty">${esc(group.empty)}</p>`)
            : ""}</div>`;

    const node = el(`<div class="tab-split">
        <aside class="rowlist behaviour-rail">
            ${inGroupOrder(groups).map(section).join("")}
        </aside>
        <div class="beh-main"></div>
    </div>`);
    attachGroupToggles(node);
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-row]")).forEach((button) => button.addEventListener("click", () => {
        state.behaviourRow = button.dataset.row || "";
        state.behaviourRoute = {row: button.dataset.row || "", group: button.dataset.route || "view"};
        state.behaviourRowShown = button.dataset.row || "";
        state.cell = null;
        render();
    }));
    const main = /** @type {HTMLElement} */ (node.querySelector(".beh-main"));
    if (behaviour) {
        const followed = followedBelow(behaviour);
        if (followed) main.appendChild(el(followed));
        main.appendChild(behaviourEditor(behaviour));
    }
    else main.appendChild(el(`<p class="note beh-empty">Transparent keys and KC_NO cannot have a behaviour. Pick a mapped key on the board.</p>`));
    body.replaceChildren(node);
}
