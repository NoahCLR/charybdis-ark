// @ts-check
// The Pointing modes tab: every pointing mode this layer reaches, grouped by
// how, each linking to its slot in the Pointing modes view.

import {el, esc} from "../../lib/dom.mjs";
import {keyMeaning} from "../../view/keyface.mjs";
import {pointingReach, pointingVariant, reachInView, slotKeycodeNames} from "../../view/reach.mjs";
import {linkRows} from "../../view/pointing-link.mjs";
import {pdColourRow} from "../../view/lighting.mjs";
import {getModel, layers, render, state} from "../../store.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import {attachReachRows, reachAttrs, reachTable} from "../groups.mjs";
import {reachEntries} from "../../view/reach-groups.mjs";
import {mark, slotNamedWithKeycodes} from "../marks.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import {layersNamed, layersOfMask, pointingReachLines, pointingView} from "./reach.mjs";

/** @param {HTMLElement} body @param {HTMLElement} right */
export function tabPointing(body, right) {
    const model = getModel();
    const reach = {...pointingReach(model, layers(), state.layer), inView: pointingView(model)};
    right.replaceChildren();
    const open = el(`<button class="btn tiny ghost">Open the Pointing modes screen</button>`);
    open.addEventListener("click", () => { state.screen = "pointing"; render(); });
    right.appendChild(open);

    const changedSlots = draftMarks(model?.draft?.changes).pointing;
    const words = vocabulary(model).pointing;
    // The mode's link (firmware D-F62), as its How it starts card sets it, a
    // column each: the layers that start it, what ends a mode they started,
    // and the layers its key turns on (linkRows). A layer the keyboard
    // ignores in the link is marked so, the card's reason on it. A dash for none.
    /** @param {import("../../view/pointing-link.mjs").LinkRow[]} rows */
    const linkLayers = (rows) => rows.length ? rows.map((row) => row.unusable
        ? `<span class="muted" data-tip="${esc(row.tip)}">${layersNamed(model, layersOfMask(2 ** row.layer))} ${esc(words.linkLabels.ignored)}</span>`
        : layersNamed(model, layersOfMask(2 ** row.layer))).join(", ") : "—";
    // One row per slot, in the table every reach tab uses: the slot with its
    // light, what the mode does, its link, and how this layer reaches it.
    /** @param {string} group @param {string | number} slotId @param {string} reachedBy @param {{variants?: string[], started?: boolean}} [route] */
    const card = (group, slotId, reachedBy, {variants, started = false} = {}) => {
        const slot = (model?.pdModes || []).find((entry) => entry.id === Number(slotId));
        if (!slot) return "";
        const row = pdColourRow(model, slot.id);
        const link = linkRows(model, slot);
        // Named by the keycodes the row's routes send, as a macro row is, each
        // after its hold or lock tag; a row with no route (unreachable) names
        // both. A route starting the mode through its link sends neither, so
        // it adds a tag of its own, with no keycode.
        const [hold, lock] = slotKeycodeNames(slot);
        /** @type {[string, string | null][]} */
        const keycodes = /** @type {[string, string][]} */ ([["hold", hold], ["lock", lock]]).filter(([how, code]) => code && (!variants || variants.includes(how)));
        if (started) keycodes.push([words.linkLabels.started, null]);
        const paints = slot.kind ? `Its colour paints ${row?.locality ? word(vocabulary(model).localities, row.locality).toLowerCase() : "its locality"} while the mode runs.` : "";
        return `<tr${reachAttrs("pointing", group, slot.id)}>
            <td><span class="slot-named"><span${paints ? ` data-tip="${esc(paints)}"` : ""}>${mark(model, {kind: "pointing", slot: slot.id})}</span>
                ${slotNamedWithKeycodes(slot.displayName || `Slot ${slot.id}`, keycodes)}${changedSlots.has(slot.id) ? draftDot() : ""}</span></td>
            <td class="muted">${slot.kind
                ? `${slot.kind === 2 ? "Scrolling" : "Directional"}${slot.dpi ? ` · ${esc(slot.dpi)} DPI` : " · normal pointer speed"}`
                : "Empty · these keys do nothing yet"}</td>
            <td class="muted">${slot.kind ? linkLayers(link.filter((entry) => entry.starts)) : "—"}</td>
            <td class="muted">${slot.kind && slot.linkStarts.length ? esc(word(words.linkEnds, slot.linkEnds)) : "—"}</td>
            <td class="muted">${slot.kind ? linkLayers(link.filter((entry) => entry.key)) : "—"}</td>
            <td class="muted">${reachedBy}</td>
            <td class="reach-edit"><button class="btn tiny ghost" data-editpd="${esc(slot.id)}">Edit</button></td></tr>`;
    };
    // Holding a mode and locking it on are the same mode reached two ways, so
    // the row is named for the keycodes its routes send, and its routes say
    // which only when it has both. A route that starts the mode by turning on
    // a layer in its link (entry.startVia) sends neither.
    /** @param {string} group */
    const reachCard = (group) => (/** @type {ReturnType<typeof reachInView>[number]} */ entry) => {
        const actions = [...entry.keys.map((key) => keyMeaning(key.position)),
            ...(entry.behaviours || []).map((row) => row.action), ...(entry.combos || []).map((route) => route.action)];
        const own = actions.filter((keycode) => !entry.startVia?.[keycode]);
        const variants = [...new Set(own.map((keycode) => pointingVariant(model, keycode)))];
        const lines = pointingReachLines(model, entry, variants.length > 1).map((line) => `<span class="reach-line">${line}</span>`).join("");
        return card(group, entry.name, lines, {variants, started: Boolean(entry.starts?.length) || own.length < actions.length});
    };

    /** @type {{id: string, rows: string[], empty: string, drafted?: boolean, ids?: string[]}[]} */
    const groups = [
        {id: "view", rows: reach.inView.map(reachCard("view")),
            empty: "No pointing mode is reached by the layers in this view."},
        {id: "here", rows: reach.onKeys.map(reachCard("here")),
            empty: "No pointing mode is placed on this layer."},
        {id: "through", rows: reach.throughKeys.map(reachCard("through")),
            empty: "No transparent key falls through to a pointing-mode key."},
        {id: "branches", rows: reach.fromBranches.map(reachCard("branches")),
            empty: "No behaviour mapped on this layer sends a pointing mode."},
        {id: "combos", rows: reach.fromCombos.map(reachCard("combos")),
            empty: "No combo on this layer sends a pointing mode."},
        {id: "belowBranches", rows: reach.fromBranchesBelow.map(reachCard("belowBranches")),
            empty: "No behaviour under a transparent key sends a pointing mode."},
        {id: "belowCombos", rows: reach.fromCombosBelow.map(reachCard("belowCombos")),
            empty: "No combo that needs a transparent key sends a pointing mode."},
        {id: "elsewhere", rows: reach.elsewhere.map((slotId) => card("elsewhere", slotId, "not reached from this layer")),
            empty: "Every configured mode is reached from this layer.", ids: reach.elsewhere},
    ];
    // A folded group holding a changed slot says so on its header.
    for (const group of groups) group.drafted = (group.ids || reachEntries(reach, group.id).map((entry) => entry.name))
        .some((id) => changedSlots.has(Number(id)));
    const node = reachTable("pointing", groups, [["Slot", "24%"], ["Mode", "14%"], [words.linkLabels.startedBy, "10%"], [words.linkLabels.endsWhen, "8%"], [words.linkLabels.keyTurnsOnShort, "9%"], ["Reached by", "29%"], ["", "6%"]]);
    attachReachRows(node, "pointing");
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-editpd]")).forEach((button) => button.addEventListener("click", () => {
        state.pdSlot = Number(button.dataset.editpd);
        state.pdKind = null;
        state.screen = "pointing";
        render();
    }));
    body.replaceChildren(node);
}
