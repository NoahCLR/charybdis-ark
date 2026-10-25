// @ts-check
// Keep a person's place when the current screen is rebuilt. Every edit comes
// back through the core's model and the webview deliberately redraws from that
// model, but replacing `.content` must not make an ordinary click feel like
// navigation. A slot bank (Macros, Custom keys) keeps its own scroll position
// too, as does a list that scrolls in a pane of its own ([data-scroll-list]:
// the Lighting layers and pointing modes, each Keys reach table), each under
// its own key so one list's place never carries into another's. Moving to
// another screen still starts at its top.

/** @typedef {{top: number, left: number}} ScrollOffset */
/** @typedef {ScrollOffset & {bank?: ScrollOffset, list?: {key: string, top: number}}} ContentScroll */

/** @param {Element} root @param {string | null} previousScreen @param {string} nextScreen */
export function captureContentScroll(root, previousScreen, nextScreen) {
    if (previousScreen !== nextScreen) return null;
    const content = root.querySelector(".content");
    if (!content) return null;
    const bank = root.querySelector(".pad.library .macro-grid");
    const list = /** @type {HTMLElement | null} */ (root.querySelector("[data-scroll-list]"));
    return {top: content.scrollTop, left: content.scrollLeft,
        ...(bank ? {bank: {top: bank.scrollTop, left: bank.scrollLeft}} : {}),
        ...(list?.dataset.scrollList ? {list: {key: list.dataset.scrollList, top: list.scrollTop}} : {})};
}

/** @param {Element} root @param {ContentScroll | null} scroll */
export function restoreContentScroll(root, scroll) {
    if (!scroll) return;
    const content = root.querySelector(".content");
    if (!content) return;
    content.scrollTop = scroll.top;
    content.scrollLeft = scroll.left;
    const bank = root.querySelector(".pad.library .macro-grid");
    if (bank && scroll.bank) {
        bank.scrollTop = scroll.bank.top;
        bank.scrollLeft = scroll.bank.left;
    }
    const list = /** @type {HTMLElement | null} */ (root.querySelector("[data-scroll-list]"));
    if (list && scroll.list && list.dataset.scrollList === scroll.list.key) list.scrollTop = scroll.list.top;
}

// A list that scrolls beside its editor keeps its picked row in view, below
// its sticky heading: after switching to it, or when the pick is made from
// elsewhere. A row already in view stays where it is. A Keys reach table's
// heading is its column header, and the band of the row's own group sticks
// under it; there only a pick that moved is revealed ([data-reveal-selected]),
// so unfolding a group further down never pulls the list back to the pick.
/** @param {Element} root */
export function revealSelectedListRow(root) {
    const list = root.querySelector("[data-scroll-list]");
    const selected = list?.querySelector(".rowitem.on, [data-reveal-selected]");
    if (!list || !selected) return;
    const bounds = list.getBoundingClientRect();
    const band = selected.closest?.("tbody")?.querySelector(".t-group");
    const top = bounds.top + (list.querySelector(".rowlist-h, thead")?.getBoundingClientRect().height || 0)
        + (band?.getBoundingClientRect().height || 0);
    const row = selected.getBoundingClientRect();
    // Whole pixels, rounded out: a list scrolls by device pixels, and a row
    // left a fraction short of the edge reads as cut off.
    if (row.top < top) list.scrollTop -= Math.ceil(top - row.top);
    else if (row.bottom > bounds.bottom) list.scrollTop += Math.ceil(row.bottom - bounds.bottom);
}

// The common Keys floor keeps ordinary tabs level. If one editor grows beyond
// it, carry that height into the next render before restoring the page scroll.
/** @param {Element} root @param {string | null} previousScreen @param {string} nextScreen @param {boolean} [reset] */
export function captureKeysBenchHeight(root, previousScreen, nextScreen, reset = false) {
    if (previousScreen !== "keys" || nextScreen !== "keys" || reset) return 0;
    return root.querySelector(".keys-pad .bench")?.getBoundingClientRect().height || 0;
}

/** @param {Element} root @param {number} height */
export function restoreKeysBenchHeight(root, height) {
    if (!height) return;
    const bench = /** @type {HTMLElement | null} */ (root.querySelector(".keys-pad .bench"));
    if (bench) bench.style.minHeight = `${height}px`;
}

// A behaviour selected from elsewhere may sit below the visible part of the
// content scroller. Once its list has brought it into view, reveal it there.
/** @param {Element} root @param {number} [margin] */
export function revealSelectedContentRow(root, margin = 12) {
    const content = root.querySelector(".content");
    const selected = content?.querySelector("[data-reveal-selected]");
    if (!content || !selected) return;
    const bounds = content.getBoundingClientRect();
    const row = selected.getBoundingClientRect();
    if (row.top < bounds.top + margin) content.scrollTop += row.top - bounds.top - margin;
    else if (row.bottom > bounds.bottom - margin) content.scrollTop += row.bottom - bounds.bottom + margin;
}

// A deliberate jump from an editor to something higher in the same scroller.
// Measure both rectangles after the redraw; offsetTop may belong to a different
// positioned ancestor and cannot tell us where the target is in `.content`.
/** @param {ParentNode} root @param {string} selector @param {number} [margin] */
export function scrollContentTo(root, selector, margin = 20) {
    const content = root.querySelector(".content");
    const target = content?.querySelector(selector);
    if (!content || !target) return;
    const top = content.scrollTop + target.getBoundingClientRect().top - content.getBoundingClientRect().top - margin;
    content.scrollTo({top, left: content.scrollLeft, behavior: "smooth"});
}
