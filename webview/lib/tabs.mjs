// @ts-check
// A strip of tabs as the keyboard walks it (WAI-ARIA's tabs pattern): one
// stop in the tab order, the picked tab; ArrowLeft and ArrowRight move to the
// tab beside it, wrapping, and Home and End to the first and last. A tab
// reached so is picked, as a click picks it, so the panel under the strip
// always shows the tab that has the focus. Every tab carries an id; the
// picked one controls the panel, which is labelled by it.

/** @param {HTMLElement} strip @returns {HTMLElement[]} */
const tabsOf = (strip) => [.../** @type {NodeListOf<HTMLElement>} */ (strip.querySelectorAll('[role="tab"]'))]
    .filter((tab) => !tab.closest("[hidden]") && !tab.hasAttribute("disabled"));

/** @type {Readonly<Record<string, (at: number, count: number) => number>>} */
const MOVES = Object.freeze({
    ArrowLeft: (at, count) => (at - 1 + count) % count,
    ArrowRight: (at, count) => (at + 1) % count,
    Home: () => 0,
    End: (_at, count) => count - 1,
});

// `strip` holds the tabs; the tab a key reaches is clicked, so it is picked
// by the strip's own click handlers, and the redraw that follows keeps the
// focus on it by its id (lib/focus.mjs).
/** @param {HTMLElement | null} strip @param {HTMLElement | null} [panel] */
export function rovingTabs(strip, panel = null) {
    if (!strip) return;
    const tabs = tabsOf(strip);
    const picked = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0];
    for (const tab of tabs) tab.tabIndex = tab === picked ? 0 : -1;
    if (panel) linkTabPanel(strip, panel);
    strip.addEventListener("keydown", (event) => {
        const move = MOVES[event.key];
        const from = /** @type {Element} */ (event.target).closest?.('[role="tab"]');
        if (!move || !from || event.altKey || event.ctrlKey || event.metaKey) return;
        const walk = tabsOf(strip);
        const next = walk[move(walk.indexOf(/** @type {HTMLElement} */ (from)), walk.length)];
        if (!next) return;
        event.preventDefault();
        next.focus();
        if (next.getAttribute("aria-selected") !== "true") next.click();
    });
}

// The picked tab controls `panel`, a tabpanel labelled by it. A strip built
// apart from what it shows (the layer tabs over the board) is linked once
// both are drawn.
/** @param {HTMLElement | null} strip @param {HTMLElement | null} panel */
export function linkTabPanel(strip, panel) {
    if (!strip || !panel) return;
    const picked = /** @type {HTMLElement | null} */ (strip.querySelector('[role="tab"][aria-selected="true"]'));
    if (!panel.id) panel.id = `${strip.id || strip.dataset.tablist || "tabs"}-panel`;
    panel.setAttribute("role", "tabpanel");
    if (!picked?.id) return;
    picked.setAttribute("aria-controls", panel.id);
    panel.setAttribute("aria-labelledby", picked.id);
}
