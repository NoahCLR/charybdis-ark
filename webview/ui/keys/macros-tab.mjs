// @ts-check
// The Macros tab: every macro this layer reaches, grouped by how, each linking
// to its slot in the Macros view. Each row shows its steps as the hover card
// does.

import {el, esc} from "../../lib/dom.mjs";
import {tabReach} from "../../view/tab-reach.mjs";
import {currentView, getModel, render, state} from "../../store.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import {attachReachRows, reachAttrs, reachTable} from "../groups.mjs";
import {reachLabel} from "./reach.mjs";
import {actionMarked, macroSteps} from "../marks.mjs";

/** @param {HTMLElement} body @param {HTMLElement} right */
export function tabMacros(body, right) {
    const model = getModel();
    const slots = model?.macros || [];
    const reach = tabReach(currentView(), "macros");
    right.replaceChildren();
    const open = el(`<button class="btn tiny ghost">Open the Macros screen</button>`);
    open.addEventListener("click", () => { state.screen = "macros"; render(); });
    right.appendChild(open);

    const changedMacros = draftMarks(model?.draft?.changes).macros;
    /** @param {string} group @param {string} keycode @param {string} reachedBy */
    const row = (group, keycode, reachedBy) => {
        const slot = slots.find((entry) => entry.keycode === keycode);
        return `<tr${reachAttrs("macros", group, keycode)}>
            <td>${actionMarked(model, keycode)} <code class="dim">${esc(keycode)}</code>${changedMacros.has(keycode) ? draftDot() : ""}</td>
            <td>${slot?.payload ? macroSteps(model, slot.payload) : `<span class="muted">${slot ? "empty" : "—"}</span>`}</td>
            <td class="muted">${reachedBy}</td>
            <td class="reach-edit">${slot ? `<button class="btn tiny ghost" data-editmacro="${esc(keycode)}">Edit</button>` : ""}</td></tr>`;
    };
    // A folded group holding a changed macro says so on its header.
    const groups = reach.groups.map(({id, empty, entries}) => ({id, empty,
        rows: entries.map((entry) => row(id, entry.name, id === "elsewhere" ? "not reached from this layer" : reachLabel(model, entry))),
        drafted: entries.some((entry) => changedMacros.has(entry.name))}));
    const node = reachTable("macros", groups, [["Slot", "24%"], ["Steps", "44%"], ["Reached by", "24%"], ["", "8%"]]);
    attachReachRows(node, "macros");
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-editmacro]")).forEach((button) => button.addEventListener("click", () => {
        const keycode = button.dataset.editmacro;
        state.macroSlot = keycode || null;
        state.screen = "macros";
        render();
    }));
    body.replaceChildren(node);
}
