// @ts-check
// The grouped lists the Keys tabs share: a counted header per group, shared
// independent open state, and rows that pick themselves. A group folds with the
// same chevron as everything else that folds, turned down while open.
// Titles and order come from view/reach-groups.mjs.

// Selector assertions refer to elements created by this module's authored markup.
import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {render, state} from "../store.mjs";
import {draftDot} from "../view/review.mjs";
import {GROUP_TITLES, inGroupOrder, setReachGroupOpen} from "../view/reach-groups.mjs";

// A folded group holding something the draft changed says so on its header;
// open, its rows carry their own marks.
// A group whose rows depend on a choice elsewhere names it after the title,
// as markup: a key is named as every surface names it (ui/marks.mjs).
/** @param {string} tab @param {string} id @param {number} count @param {boolean} [drafted] @param {string} [detail] */
export function groupHeader(tab, id, count, drafted = false, detail = "") {
    const open = state.reachGroups[id];
    return `<button class="group-h" data-group-tab="${esc(tab)}" data-group="${esc(id)}" aria-expanded="${esc(open)}">
        ${DISCLOSURE}<span class="ttl">${esc(GROUP_TITLES[/** @type {keyof typeof GROUP_TITLES} */ (id)])}${detail ? ` <span class="mono dim">· ${detail}</span>` : ""}${drafted && !open ? draftDot("Holds a change in your draft") : ""}</span>
        <span class="n">${count}</span></button>`;
}

/** @param {string} tab @param {string} id */
export const groupOpen = (tab, id) => state.reachGroups[id];

/** @param {HTMLElement} node */
export const attachGroupToggles = (node) => /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-group-tab]")).forEach((button) =>
    button.addEventListener("click", () => {
        const id = /** @type {string} */ (button.dataset.group);
        state.reachGroups = setReachGroupOpen(state.reachGroups, id, !state.reachGroups[id]);
        state.resetBenchHeight = true;
        render();
    }));

// Rows across the tabs pick themselves the same way, and picking the same row
// again lets go of it.
/** @param {HTMLElement} node @param {keyof import("../state.js").PanelState["reachRow"]} tab */
export const attachReachRows = (node, tab) => /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-reach]")).forEach((row) =>
    row.addEventListener("click", (event) => {
        if (/** @type {Element} */ (event.target).closest("button")) return;
        const picked = /** @type {string} */ (row.dataset.reach);
        state.reachRow[tab] = state.reachRow[tab] === picked ? null : picked;
        render();
    }));

// One thing can be listed under several routes, so a pick names the route it
// was made from — otherwise picking it in one group would ring the keys of all
// of them.
/** @param {keyof import("../state.js").PanelState["reachRow"]} tab @param {string} group @param {string | number} name */
export const reachAttrs = (tab, group, name) => {
    const picked = `${group}:${name}`;
    return ` data-reach="${esc(picked)}"${state.reachRow[tab] === picked ? ' data-picked="true"' : ""}`;
};

// A grouped table: the column header once, then a counted header row per
// group. One table keeps the columns lined up across the groups being
// compared, which is the point of showing them together. Each column is given
// its width, so unfolding a group never re-sizes the ones already on screen.
// The table scrolls inside its pane, under its column header and the band of
// the group in view, so a long list never stretches the workbench; it keeps
// its own place under the tab's key ([data-scroll-list], lib/scroll.mjs).
/** @param {string} tab @param {{id: string, rows: string[], drafted?: boolean, detail?: string, empty?: string}[]} groups @param {string[][]} columns */
export function reachTable(tab, groups, columns) {
    /** @param {{id: string, rows: string[], drafted?: boolean, detail?: string, empty?: string}} group */
    const section = (group) => `<tbody class="rowgroup">
        <tr><td colspan="${columns.length}" class="t-group">${groupHeader(tab, group.id, group.rows.length, group.drafted, group.detail)}</td></tr>
        ${groupOpen(tab, group.id)
            ? (group.rows.length ? group.rows.join("")
                : `<tr><td colspan="${columns.length}"><p class="note">${esc(group.empty)}</p></td></tr>`)
            : ""}</tbody>`;
    const node = el(`<div class="bench-pane"><div class="reach-table" data-scroll-list="${esc(tab)}"><table class="t fixed">
        <colgroup>${columns.map(([, width]) => `<col style="width:${esc(width)}">`).join("")}</colgroup>
        <thead><tr>${columns.map(([name]) => `<th>${esc(name)}</th>`).join("")}</tr></thead>
        ${inGroupOrder(groups).map(section).join("")}
    </table></div></div>`);
    attachGroupToggles(node);
    return node;
}
