// @ts-check
// The Pointing modes tab: every pointing mode this layer reaches, grouped by
// how, each linking to its slot in the Pointing modes view.

import {el, esc} from "../../lib/dom.mjs";
import {keyMeaning} from "../../view/keyface.mjs";
import {pointingReach, pointingVariant, reachInView} from "../../view/reach.mjs";
import {pdColourRow} from "../../view/lighting.mjs";
import {addedLayers, getModel, layers, render, state} from "../../store.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import {attachReachRows, reachAttrs, reachTable} from "../groups.mjs";
import {reachEntries} from "../../view/reach-groups.mjs";
import {keycodeMark, slotLight} from "../marks.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import {branchReach, comboReach, keysReach, pointingView} from "./reach.mjs";

/** @param {HTMLElement} body @param {HTMLElement} right */
export function tabPointing(body, right) {
    const model = getModel();
    const reach = {...pointingReach(model, layers(), state.layer), inView: pointingView(model)};
    right.replaceChildren();
    const open = el(`<button class="btn text compact">Trackball modes →</button>`);
    open.addEventListener("click", () => { state.screen = "pointing"; render(); });
    right.appendChild(open);

    const changedSlots = draftMarks(model?.draft?.changes).pointing;
    // One row per slot, in the table every reach tab uses: the slot with its
    // light, what the mode does, and how this layer reaches it.
    /** @param {string} group @param {string | number} slotId @param {string} reachedBy @param {string} [variant] */
    const card = (group, slotId, reachedBy, variant) => {
        const slot = (model?.pdModes || []).find((entry) => entry.id === Number(slotId));
        if (!slot) return "";
        const row = pdColourRow(model, slot.id);
        // Named by the keycode the row is about, as a macro row is; a row that
        // is not one of the two names both.
        const keycodes = variant === "lock" ? [slot.binding.lock] : variant === "hold" ? [slot.binding.hold] : [slot.binding.hold, slot.binding.lock];
        const paints = slot.kind ? `Its colour paints ${row?.locality ? word(vocabulary(model).localities, row.locality).toLowerCase() : "its locality"} while the mode runs — not this key.` : "";
        return `<tr${reachAttrs("pointing", group, slot.id)}>
            <td><span${paints ? ` data-tip="${esc(paints)}"` : ""}>${slotLight(model, slot).swatch()}</span>
                ${esc(slot.displayName || `Mode ${slot.id}`)}${variant ? ` · ${esc(variant)}` : ""} <span class="tag">P${slot.id}</span>${(code => code ? ` ${code}` : "")(keycodeMark("reachRow", keycodes.join(" · ")))}${changedSlots.has(slot.id) ? draftDot() : ""}</td>
            <td class="muted">${slot.kind
                ? `${slot.kind === 2 ? "Scrolling" : "Directional"}${slot.dpi ? ` · ${slot.dpi} DPI` : " · normal ball speed"}`
                : "Empty · these keys do nothing yet"}</td>
            <td class="muted">${reachedBy}</td>
            <td class="reach-edit"><button class="btn text compact" data-editpd="${slot.id}">Open →</button></td></tr>`;
    };
    // Holding a mode and toggling it on are the same mode reached two ways, so
    // the card is named for the one its route uses. A route that uses both
    // keeps them in the line beneath, where they can be told apart per key.
    /** @param {string} group */
    const reachCard = (group) => (/** @type {ReturnType<typeof reachInView>[number]} */ entry) => {
        const variants = [...new Set([
            ...entry.keys.map((key) => pointingVariant(model, keyMeaning(key.position))),
            ...(entry.behaviours || []).map((row) => pointingVariant(model, row.action)),
            ...(entry.combos || []).map((route) => pointingVariant(model, route.action)),
        ])];
        const only = variants.length === 1 ? variants[0] : "";
        return card(group, entry.name, [
            entry.keys.length ? keysReach(entry.keys) : "",
            entry.behaviours?.length ? branchReach(model, entry, !only) : "",
            entry.combos?.length ? comboReach(model, entry, !only) : "",
        ].filter(Boolean).join(" · "), only);
    };

    /** @type {{id: string, rows: string[], empty: string, drafted?: boolean, ids?: string[]}[]} */
    const groups = [
        {id: "view", rows: reach.inView.map(reachCard("view")),
            empty: "No trackball mode is reached by the layers in this view."},
        {id: "here", rows: reach.onKeys.map(reachCard("here")),
            empty: "No trackball mode is placed on this layer."},
        {id: "through", rows: reach.throughKeys.map(reachCard("through")),
            empty: "No transparent key falls through to a pointing-mode key."},
        {id: "branches", rows: reach.fromBranches.map(reachCard("branches")),
            empty: "No behaviour mapped on this layer sends a trackball mode."},
        {id: "combos", rows: reach.fromCombos.map(reachCard("combos")),
            empty: "No combo on this layer sends a trackball mode."},
        {id: "belowBranches", rows: reach.fromBranchesBelow.map(reachCard("belowBranches")),
            empty: "No behaviour under a transparent key sends a trackball mode."},
        {id: "belowCombos", rows: reach.fromCombosBelow.map(reachCard("belowCombos")),
            empty: "No combo that needs a transparent key sends a trackball mode."},
        {id: "elsewhere", rows: reach.elsewhere.map((slotId) => card("elsewhere", slotId, "not reached from this layer")),
            empty: "Every configured mode is reached from this layer.", ids: reach.elsewhere},
    ];
    // A folded group holding a changed slot says so on its header.
    for (const group of groups) group.drafted = (group.ids || reachEntries(reach, group.id).map((entry) => entry.name))
        .some((id) => changedSlots.has(Number(id)));
    // "On this view" says something only while other layers are added to the
    // view; over the default layers alone it repeats this layer and below.
    const node = reachTable("pointing", groups.filter((group) => group.id !== "view" || addedLayers().length > 0), [["Trackball mode", "30%"], ["Movement", "24%"], ["Reached by", "36%"], ["", "10%"]], {collapseEmpty: true});
    attachReachRows(node, "pointing");
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-editpd]")).forEach((button) => button.addEventListener("click", () => {
        state.pdSlot = Number(button.dataset.editpd);
        state.pdKind = null;
        state.screen = "pointing";
        render();
    }));
    body.replaceChildren(node);
}
