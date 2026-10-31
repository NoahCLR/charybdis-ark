// @ts-check
/**
 * @typedef {NonNullable<ReturnType<typeof import("../../view/behavior-editor.mjs").behaviourEditorRow>>} EditorBehavior
 */
// The Behaviours tab: the behaviours this layer reaches, grouped by how, and
// the open one's editor beside them.

import {el, esc} from "../../lib/dom.mjs";
import {behaviourTiers} from "../../view/keyface.mjs";
import {keyIdentity} from "../../view/key-identity.mjs";
import {currentLayer, currentView, getModel, render, selectedPosition, state} from "../../store.mjs";
import {layerCalled} from "../../view/vocabulary.mjs";
import {behaviourEditorRow} from "../../view/behavior-editor.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import {reachTable} from "../groups.mjs";
import {setReachGroupOpen} from "../../view/reach-groups.mjs";
import {tabReach} from "../../view/tab-reach.mjs";
import {actionMarked, comboInputsMarked, tierDot} from "../marks.mjs";
import {behaviourEditor} from "./behaviour-editor.mjs";
import {behaviourKey, behaviourRoute, selectBehaviourKey} from "./behaviour-selection.mjs";
import {sourceLabel} from "./reach.mjs";

// The combos that send a behaviour, by badge and chord; one that needs a
// transparent key names the layer answering for it. Markup, as every row's
// note is, so the chord's keys carry their layer marks.
/** @param {Pick<import("../../view/keyface-types.js").BehaviourInView, "combos">} entry */
const comboNote = (entry) => entry.combos.map(({combo, keys}) => {
    const sources = [...new Set(keys.filter((key) => key.fellThrough)
        .map((key) => esc(layerCalled(key.layer)) + (key.whileHeld ? " when held" : "")))];
    return `combo ${esc(combo.badge)} · ${comboInputsMarked(getModel(), combo)}${sources.length ? ` · on ${sources.join(", ")}` : ""}`;
}).join(", ");
/** @param {Pick<import("../../view/keyface-types.js").BehaviourInView, "keys" | "combos">} entry */
const viewBehaviourNote = (entry) => {
    const indexes = [...new Set(entry.keys.map((key) => key.position.layoutIndex))];
    const sources = [...new Set(entry.keys.filter((key) => key.fellThrough).map((key) => esc(layerCalled(key.layer))))];
    // The row is titled with its key; more than one position is counted, and
    // the board rings them all when the row is picked.
    return [indexes.length > 1 ? `${indexes.length} keys` : "", sources.length ? `on ${sources.join(", ")}` : "",
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
    return `<p class="note beh-note">The selected key on <b>${esc(layerCalled(currentLayer()))}</b> is transparent,
        so ${currentView().previewing ? "in this preview " : ""}<b>${esc(layerCalled(followed.from))}</b> answers with ${name}. A behaviour belongs to its keycode:
        this is ${name}’s, and a change here applies wherever ${name} is pressed, not only at this position.</p>`;
}

/** @param {HTMLElement} body @param {HTMLElement} right */
export function tabBehaviours(body, right) {
    const model = getModel();
    const reach = tabReach(currentView(), "behaviours");
    if (!state.behaviourRow) selectBehaviourKey(behaviourKey(selectedPosition()?.layoutIndex).keycode);
    const behaviour = behaviourEditorRow(model, state.behaviourRow || "");

    right.replaceChildren();

    const route = behaviourRoute();
    const changed = draftMarks(model?.draft?.changes).behaviours;
    // A row as every reach table draws one: the behaviour, then its branches
    // as the grid's tier dots and a count. The name is a button so the list
    // can be walked from the keyboard; a click anywhere on the row picks it.
    /** @param {string} group @param {import("../../../contracts/panel.js").BehaviorView} row @param {string} note */
    const item = (group, row, note) => {
        const picked = row.keycode === state.behaviourRow && (!route || route === group);
        return `<tr class="beh-row${note ? " quiet" : ""}" data-row="${esc(row.keycode)}" data-route="${esc(group)}"${picked ? ' data-picked="true"' : ""}${picked && selectionMoved ? " data-reveal-selected" : ""}>
            <td><button class="row-pick">${actionMarked(model, row.keycode)}${keyIdentity(model, row.keycode).label === row.keycode ? ""
                : ` <code class="dim">${esc(row.keycode)}</code>`}${changed.has(row.keycode) ? draftDot() : ""}</button>${note ? `<span class="sub">${note}</span>` : ""}</td>
            <td class="beh-branches">${behaviourTiers(row).map((tier) => tierDot(model, tier.kind)).join("")} ${row.steps.length}</td></tr>`;
    };

    // A row's note says how its group reaches it, where the group's title
    // does not already.
    /** @param {string} group @param {import("../../view/keyface-types.js").BehaviourReachEntry} entry */
    const note = (group, entry) => group === "view" ? viewBehaviourNote(entry)
        : group === "combos" || group === "belowCombos" ? comboNote(entry)
        : group === "through" ? `on ${sourceLabel(entry)}`
        : group === "elsewhere" ? "not on this layer" : "";

    // A selection made anywhere else — the board, the Key tab, a fresh
    // behaviour — can land in a closed group, so the group holding it opens
    // once when the selection moves there. Closing it again then sticks.
    const selectionMoved = state.behaviourRow !== state.behaviourRowShown;
    if (selectionMoved) {
        const holding = route || reach.groupOf(state.behaviourRow || "");
        if (holding) state.reachGroups = setReachGroupOpen(state.reachGroups, holding, true);
        state.behaviourRowShown = state.behaviourRow;
    }

    const list = reachTable("behaviours", reach.groups.map(({id, empty, entries}) => ({id, empty,
        rows: entries.map((entry) => item(id, entry.row, note(id, entry))),
        drafted: entries.some((entry) => changed.has(entry.name))})), [["Behaviour", "70%"], ["Branches", "30%"]]);
    const node = el(`<div class="tab-split reach-split"><div class="beh-main"></div></div>`);
    node.prepend(list);
    /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll("tr[data-row]")).forEach((tr) => tr.addEventListener("click", () => {
        state.behaviourRow = tr.dataset.row || "";
        state.behaviourRoute = {row: tr.dataset.row || "", group: tr.dataset.route || "view"};
        state.behaviourRowShown = tr.dataset.row || "";
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
