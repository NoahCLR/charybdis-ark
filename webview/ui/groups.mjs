// @ts-check
// The grouped lists the workbenches share (groupedTable): a column header, a
// counted band per group that folds with the same chevron as everything else
// that folds, turned down while open, and rows that pick themselves. The
// Keymap tabs list what a layer reaches in them (reachTable), their titles,
// order and shared open state from view/reach-groups.mjs; Lighting lists what
// each stage picks from in them too, so the two read alike.

// Selector assertions refer to elements created by this module's authored markup.
import {DISCLOSURE, el, esc} from "../lib/dom.mjs";
import {render, state} from "../store.mjs";
import {draftDot} from "../view/review.mjs";
import {GROUP_TITLES, inGroupOrder, reachRowId, setReachGroupOpen} from "../view/reach-groups.mjs";

/**
 * One group of a grouped table. A group with a title heads its rows with a
 * band that folds them; one without lists its rows under the column header
 * alone. Its rows are markup. Open with no rows, it says `empty` in their
 * place, a row of its own even when it is blank (every Keymap group has one);
 * without `empty`, it shows its band alone.
 * @typedef {{id: string, title?: string, tip?: string, open?: boolean, toggle?: () => void, rows: string[], drafted?: boolean, detail?: string, empty?: string}} TableGroup
 */

// A folded group holding something the draft changed says so on its header;
// open, its rows carry their own marks.
// A group whose rows depend on a choice elsewhere names it after the title,
// as markup: a key is named as every surface names it (ui/marks.mjs).
/** @param {Parameters<typeof draftDot>[0]} draft @param {string} scroll @param {TableGroup} group */
function groupHeader(draft, scroll, {id, title = "", tip = "", open = true, rows, drafted = false, detail = ""}) {
    const count = rows.length;
    return `<button class="group-h" data-group-tab="${esc(scroll)}" data-group="${esc(id)}" aria-expanded="${esc(open)}"${tip ? ` data-tip="${esc(tip)}"` : ""}>
        ${DISCLOSURE}<span class="ttl">${esc(title)}${detail ? ` <span class="mono dim">· ${detail}</span>` : ""}${drafted && !open ? draftDot(draft, "", {holds: true}) : ""}</span>
        <span class="n">${count}</span></button>`;
}

/**
 * A grouped table: the column header once, then each group, under a counted
 * band where it has a title. One table keeps the columns lined up across the
 * groups being compared, which is the point of showing them together. Each
 * column is given its width, so unfolding a group never re-sizes the ones
 * already on screen. The table scrolls inside its pane, under its column
 * header and the band of the group in view, so a long list never stretches
 * the workbench; it keeps its own place under `scroll` ([data-scroll-list],
 * lib/scroll.mjs).
 * @param {{scroll: string, groups: TableGroup[], columns: string[][], draft: Parameters<typeof draftDot>[0]}} table
 */
export function groupedTable({scroll, groups, columns, draft}) {
    /** @param {TableGroup} group */
    const section = (group) => `<tbody class="rowgroup" data-rows="${esc(group.id)}">
        ${group.title ? `<tr><td colspan="${columns.length}" class="t-group">${groupHeader(draft, scroll, group)}</td></tr>` : ""}
        ${group.open ?? true
            ? (group.rows.length ? group.rows.join("")
                : group.empty !== undefined ? `<tr><td colspan="${columns.length}"><p class="note">${esc(group.empty)}</p></td></tr>` : "")
            : ""}</tbody>`;
    const node = el(`<div class="bench-pane"><div class="reach-table" data-scroll-list="${esc(scroll)}"><table class="t fixed">
        <colgroup>${columns.map(([, width]) => `<col style="width:${esc(width)}">`).join("")}</colgroup>
        <thead><tr>${columns.map(([name]) => `<th>${esc(name)}</th>`).join("")}</tr></thead>
        ${groups.map(section).join("")}
    </table></div></div>`);
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-group-tab]")).forEach((button) =>
        button.addEventListener("click", () => groups.find((group) => group.id === button.dataset.group)?.toggle?.()));
    return node;
}

// A table row that picks itself (a reach row is a Keymap tab's, reachAttrs):
// a click anywhere on it, or on its pick button by Enter or Space
// (pickButton); `picked` shades it with the bar. `data` names what it lists
// for the screen and its tests (data-layer, data-slot…), and `quiet` dims
// it, as a slot with nothing in it is.
/** @param {string} id what the row picks, as data-pick @param {boolean} picked @param {string[]} cells markup @param {{data?: Readonly<Record<string, string | number>>, quiet?: boolean}} [options] */
export const pickableRow = (id, picked, cells, {data = {}, quiet = false} = {}) =>
    `<tr data-pick="${esc(id)}"${picked ? ' data-picked="true"' : ""}${quiet ? ' class="quiet"' : ""}${Object.entries(data).map(([name, value]) => ` data-${esc(name)}="${esc(value)}"`).join("")}>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
// The button naming a row, as rowPick's: walked with Tab, picked with Enter
// or Space, saying whether it is picked, its focus kept across the redraw a
// pick makes by its own identity.
/** @param {string} identity @param {boolean} pressed @param {string} content markup @param {string} [label] */
export const pickButton = (identity, pressed, content, label = "") =>
    `<button class="row-pick" data-row-pick="${esc(identity)}" aria-pressed="${pressed}"${label ? ` aria-label="${esc(label)}"` : ""}>${content}</button>`;
// Rows made by pickableRow call `pick` with what they pick, by a click or
// their button; any other button in a row is its own.
/** @param {HTMLElement} node @param {(id: string) => void} pick */
export const attachPickRows = (node, pick) => /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("tr[data-pick]")).forEach((row) =>
    row.addEventListener("click", (event) => {
        if (/** @type {Element} */ (event.target).closest("button:not(.row-pick)")) return;
        pick(/** @type {string} */ (row.dataset.pick));
    }));

// Rows across the tabs pick themselves the same way, and picking the same row
// again lets go of it. A click anywhere on the row picks it; its row-pick
// button (rowPick) is how the keyboard does, by Enter or Space. Any other
// button in the row is its own.
/** @param {HTMLElement} node @param {keyof import("../state.js").PanelState["reachRow"]} tab */
export const attachReachRows = (node, tab) => /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-reach]")).forEach((row) =>
    row.addEventListener("click", (event) => {
        if (/** @type {Element} */ (event.target).closest("button:not(.row-pick)")) return;
        const picked = /** @type {string} */ (row.dataset.reach);
        state.reachRow[tab] = state.reachRow[tab] === picked ? null : picked;
        render();
    }));

// A row's name, in its first cell, is a button that picks the row, as the
// Behaviours tab's rows have: the list is walked with Tab and picked with
// Enter or Space, and says whether it is picked. It keeps the focus across
// the redraw a pick makes by its own identity (data-row-pick, lib/focus.mjs).
// A row whose name is only a mark (a combo's badge) is named in words too.
/** @param {keyof import("../state.js").PanelState["reachRow"]} tab @param {string} group @param {string | number} name @param {string} content markup @param {string} [label] */
export const rowPick = (tab, group, name, content, label = "") => {
    const picked = reachRowId(group, name);
    return pickButton(`${tab}:${picked}`, state.reachRow[tab] === picked, content, label);
};

// A row names the route it was picked under (reachRowId).
/** @param {keyof import("../state.js").PanelState["reachRow"]} tab @param {string} group @param {string | number} name */
export const reachAttrs = (tab, group, name) => {
    const picked = reachRowId(group, name);
    return ` data-reach="${esc(picked)}"${state.reachRow[tab] === picked ? ' data-picked="true"' : ""}`;
};

// What a Keymap tab lists of what its layer reaches, in a grouped table: each
// group titled and ordered as every tab's are, its open state the one shared
// by section id across the tabs.
/** @param {string} tab @param {{id: string, rows: string[], drafted?: boolean, detail?: string, empty?: string}[]} groups @param {string[][]} columns @param {Parameters<typeof draftDot>[0]} draft whose edit mode words a folded group's mark */
export function reachTable(tab, groups, columns, draft) {
    return groupedTable({scroll: tab, columns, draft, groups: inGroupOrder(groups).map((group) => ({...group,
        title: GROUP_TITLES[/** @type {keyof typeof GROUP_TITLES} */ (group.id)],
        open: state.reachGroups[group.id],
        empty: group.empty ?? "",
        toggle: () => {
            state.reachGroups = setReachGroupOpen(state.reachGroups, group.id, !state.reachGroups[group.id]);
            state.resetBenchHeight = true;
            render();
        }}))});
}
