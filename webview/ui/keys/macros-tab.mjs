// @ts-check
// The Macros tab: every macro this layer reaches, grouped by how, each linking
// to its slot in the Macros view. Each row shows its steps as the hover card
// does.

import {el, esc} from "../../lib/dom.mjs";
import {macroReach} from "../../view/reach.mjs";
import {getModel, layers, render, state} from "../../store.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import {attachReachRows, reachAttrs, reachTable} from "../groups.mjs";
import {reachEntries} from "../../view/reach-groups.mjs";
import {macroView, reachLabel} from "./reach.mjs";
import {actionMarked, macroSteps, keycodeMark} from "../marks.mjs";

/** @param {HTMLElement} body @param {HTMLElement} right */
export function tabMacros(body, right) {
    const model = getModel();
    const slots = model?.viaMacros || [];
    const reach = {...macroReach(model, layers(), state.layer), inView: macroView(model)};
    right.replaceChildren();
    const open = el(`<button class="btn tiny ghost">Open the Macros view</button>`);
    open.addEventListener("click", () => { state.screen = "macros"; render(); });
    right.appendChild(open);

    const changedMacros = draftMarks(model?.draft?.changes).macros;
    /** @param {string} group @param {string} keycode @param {string} reachedBy */
    const row = (group, keycode, reachedBy) => {
        const slot = slots.find((entry) => entry.keycode === keycode);
        return `<tr${reachAttrs("macros", group, keycode)}>
            <td>${actionMarked(model, keycode)}${(code => code ? ` ${code}` : "")(keycodeMark("reachRow", keycode))}${changedMacros.has(keycode) ? draftDot() : ""}</td>
            <td>${slot?.payload ? macroSteps(model, slot.payload) : `<span class="muted">${slot ? "empty" : "—"}</span>`}</td>
            <td class="muted">${reachedBy}</td>
            <td class="reach-edit">${slot ? `<button class="btn tiny ghost" data-editmacro="${esc(keycode)}">Edit</button>` : ""}</td></tr>`;
    };
    /** @type {{id: string, rows: string[], empty: string, drafted?: boolean, ids?: string[]}[]} */
    const groups = [
        {id: "view", rows: reach.inView.map((entry) => row("view", entry.name, reachLabel(model, entry))),
            empty: "No macro is reached by the layers in this view."},
        {id: "here", rows: reach.onKeys.map((entry) => row("here", entry.name, reachLabel(model, entry))),
            empty: "No macro keycode is placed on this layer."},
        {id: "through", rows: reach.throughKeys.map((entry) => row("through", entry.name, reachLabel(model, entry))),
            empty: "No transparent key falls through to a macro key."},
        {id: "branches", rows: reach.fromBranches.map((entry) => row("branches", entry.name, reachLabel(model, entry))),
            empty: "No behaviour mapped on this layer sends a macro."},
        {id: "combos", rows: reach.fromCombos.map((entry) => row("combos", entry.name, reachLabel(model, entry))),
            empty: "No combo on this layer sends a macro."},
        {id: "belowBranches", rows: reach.fromBranchesBelow.map((entry) => row("belowBranches", entry.name, reachLabel(model, entry))),
            empty: "No behaviour under a transparent key sends a macro."},
        {id: "belowCombos", rows: reach.fromCombosBelow.map((entry) => row("belowCombos", entry.name, reachLabel(model, entry))),
            empty: "No combo that needs a transparent key sends a macro."},
        {id: "elsewhere", rows: reach.elsewhere.map((keycode) => row("elsewhere", keycode, "not reached from this layer")),
            empty: "Every stored macro is reached from this layer."},
    ];

    // A folded group holding a changed macro says so on its header.
    for (const group of groups) group.drafted = (group.id === "elsewhere" ? reach.elsewhere : reachEntries(reach, group.id).map((entry) => entry.name))
        .some((keycode) => changedMacros.has(keycode));
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
