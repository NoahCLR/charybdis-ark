// @ts-check
// The Custom keys tab: every custom key this layer reaches, grouped by how,
// each linking to its slot on the Custom keys screen. A row shows what the
// key does: its shortcut, and its behaviour's branches as the Behaviours tab
// counts them.

import {el, esc} from "../../lib/dom.mjs";
import {behaviourTiers} from "../../view/keyface.mjs";
import {keyIdentity} from "../../view/key-identity.mjs";
import {customKeyOf, hasShortcut} from "../../view/custom-key.mjs";
import {tabReach} from "../../view/tab-reach.mjs";
import {currentView, getModel, render, state} from "../../store.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import {attachReachRows, reachAttrs, reachTable} from "../groups.mjs";
import {actionMarked, tierDot} from "../marks.mjs";
import {reachLabel} from "./reach.mjs";

/** @param {HTMLElement} body @param {HTMLElement} right */
export function tabCustomKeys(body, right) {
    const model = getModel();
    const reach = tabReach(currentView(), "customKeys");
    right.replaceChildren();
    const open = el(`<button class="btn tiny ghost">Open the Custom keys screen</button>`);
    open.addEventListener("click", () => { state.screen = "customKeys"; render(); });
    right.appendChild(open);

    const changedKeys = draftMarks(model?.draft?.changes).customKeys;
    /** @param {string} group @param {string} keycode @param {string} reachedBy */
    const row = (group, keycode, reachedBy) => {
        const key = customKeyOf(model, keycode);
        const behaviour = key?.hasBehavior ? keyIdentity(model, keycode).behaviour : undefined;
        return `<tr${reachAttrs("customKeys", group, keycode)}>
            <td>${actionMarked(model, keycode)} <code class="dim">${esc(keycode)}</code>${changedKeys.has(keycode) ? draftDot() : ""}</td>
            <td>${hasShortcut(key) ? `<span class="mono">${esc(key?.shortcutLabel)}</span>` : `<span class="muted">—</span>`}</td>
            <td class="beh-branches">${behaviour
                ? `${behaviourTiers(behaviour).map((tier) => tierDot(model, tier.kind)).join("")} ${behaviour.steps.length}`
                : `<span class="muted">—</span>`}</td>
            <td class="muted">${reachedBy}</td>
            <td class="reach-edit">${key ? `<button class="btn tiny ghost" data-editcustom="${esc(keycode)}">Edit</button>` : ""}</td></tr>`;
    };
    // A folded group holding a changed key says so on its header.
    const groups = reach.groups.map(({id, empty, entries}) => ({id, empty,
        rows: entries.map((entry) => row(id, entry.name, id === "elsewhere" ? "not reached from this layer" : reachLabel(model, entry))),
        drafted: entries.some((entry) => changedKeys.has(entry.name))}));
    const node = reachTable("customKeys", groups, [["Key", "26%"], ["Shortcut", "20%"], ["Behaviour", "12%"], ["Reached by", "34%"], ["", "8%"]]);
    attachReachRows(node, "customKeys");
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-editcustom]")).forEach((button) => button.addEventListener("click", () => {
        state.customKey = button.dataset.editcustom || null;
        state.screen = "customKeys";
        render();
    }));
    body.replaceChildren(node);
}
