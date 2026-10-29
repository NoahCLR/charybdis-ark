// @ts-check
// The Custom keys tab: every custom key this layer reaches, grouped by how,
// each linking to its slot on the Custom keys screen. A row shows what the
// key does: its shortcut, and its behaviour's branches as the Behaviours tab
// counts them.

import {el, esc} from "../../lib/dom.mjs";
import {behaviourFor, behaviourTiers} from "../../view/keyface.mjs";
import {customKeyOf, customKeyReach, hasShortcut} from "../../view/custom-key.mjs";
import {customKeyNamesOf, reachInView} from "../../view/reach.mjs";
import {currentView, getModel, render, state} from "../../store.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import {attachReachRows, reachAttrs, reachTable} from "../groups.mjs";
import {reachEntries} from "../../view/reach-groups.mjs";
import {actionMarked, tierDot} from "../marks.mjs";
import {reachLabel} from "./reach.mjs";

/** @param {HTMLElement} body @param {HTMLElement} right */
export function tabCustomKeys(body, right) {
    const model = getModel();
    const view = currentView();
    const reach = {...customKeyReach(view), inView: reachInView(view, customKeyNamesOf(model))};
    right.replaceChildren();
    const open = el(`<button class="btn tiny ghost">Open the Custom keys screen</button>`);
    open.addEventListener("click", () => { state.screen = "customKeys"; render(); });
    right.appendChild(open);

    const changedKeys = draftMarks(model?.draft?.changes).customKeys;
    /** @param {string} group @param {string} keycode @param {string} reachedBy */
    const row = (group, keycode, reachedBy) => {
        const key = customKeyOf(model, keycode);
        const behaviour = key?.hasBehavior ? behaviourFor(model, keycode) : undefined;
        return `<tr${reachAttrs("customKeys", group, keycode)}>
            <td>${actionMarked(model, keycode)} <code class="dim">${esc(keycode)}</code>${changedKeys.has(keycode) ? draftDot() : ""}</td>
            <td>${hasShortcut(key) ? `<span class="mono">${esc(key?.shortcutLabel)}</span>` : `<span class="muted">—</span>`}</td>
            <td class="beh-branches">${behaviour
                ? `${behaviourTiers(behaviour).map((tier) => tierDot(model, tier.kind)).join("")} ${behaviour.steps.length}`
                : `<span class="muted">—</span>`}</td>
            <td class="muted">${reachedBy}</td>
            <td class="reach-edit">${key ? `<button class="btn tiny ghost" data-editcustom="${esc(keycode)}">Edit</button>` : ""}</td></tr>`;
    };
    /** @type {{id: string, rows: string[], empty: string, drafted?: boolean, ids?: string[]}[]} */
    const groups = [
        {id: "view", rows: reach.inView.map((entry) => row("view", entry.name, reachLabel(model, entry))),
            empty: "No custom key is reached by the layers in this view."},
        {id: "here", rows: reach.onKeys.map((entry) => row("here", entry.name, reachLabel(model, entry))),
            empty: "No custom key is placed on this layer."},
        {id: "through", rows: reach.throughKeys.map((entry) => row("through", entry.name, reachLabel(model, entry))),
            empty: "No transparent key falls through to a custom key."},
        {id: "branches", rows: reach.fromBranches.map((entry) => row("branches", entry.name, reachLabel(model, entry))),
            empty: "No behaviour mapped on this layer sends a custom key."},
        {id: "combos", rows: reach.fromCombos.map((entry) => row("combos", entry.name, reachLabel(model, entry))),
            empty: "No combo on this layer sends a custom key."},
        {id: "belowBranches", rows: reach.fromBranchesBelow.map((entry) => row("belowBranches", entry.name, reachLabel(model, entry))),
            empty: "No behaviour under a transparent key sends a custom key."},
        {id: "belowCombos", rows: reach.fromCombosBelow.map((entry) => row("belowCombos", entry.name, reachLabel(model, entry))),
            empty: "No combo that needs a transparent key sends a custom key."},
        {id: "elsewhere", rows: reach.elsewhere.map((keycode) => row("elsewhere", keycode, "not reached from this layer")),
            empty: "Every custom key in use is reached from this layer."},
    ];

    // A folded group holding a changed key says so on its header.
    for (const group of groups) group.drafted = (group.id === "elsewhere" ? reach.elsewhere : reachEntries(reach, group.id).map((entry) => entry.name))
        .some((keycode) => changedKeys.has(keycode));
    const node = reachTable("customKeys", groups, [["Key", "26%"], ["Shortcut", "20%"], ["Behaviour", "12%"], ["Reached by", "34%"], ["", "8%"]]);
    attachReachRows(node, "customKeys");
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-editcustom]")).forEach((button) => button.addEventListener("click", () => {
        state.customKey = button.dataset.editcustom || null;
        state.screen = "customKeys";
        render();
    }));
    body.replaceChildren(node);
}
