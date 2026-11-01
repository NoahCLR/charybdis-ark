// @ts-check
// The page's two live regions: one polite, for what is happening, and one
// assertive, for what failed (webview/view/announcements.mjs says what goes in
// each). They sit outside the root every render replaces, so they are on the
// page before anything is written into them, which is what a screen reader
// needs to hear a change. Each part is written once, when it is new; a part
// still said since the last render is not said again, and one that has gone
// is simply dropped.

/** @typedef {"polite" | "assertive"} Politeness */

/** @type {Record<Politeness, HTMLElement> | null} */
let regions = null;
/** @type {Record<Politeness, string[]>} */
let said = {polite: [], assertive: []};

/** @param {string} id @param {"status" | "alert"} role @param {Politeness} live */
function region(id, role, live) {
    const node = document.createElement("div");
    node.className = "sr";
    node.id = id;
    node.setAttribute("role", role);
    node.setAttribute("aria-live", live);
    node.setAttribute("aria-atomic", "true");
    return node;
}

export function mountAnnouncer() {
    regions = {polite: region("ark-status", "status", "polite"), assertive: region("ark-alert", "alert", "assertive")};
    said = {polite: [], assertive: []};
    document.body.append(regions.polite, regions.assertive);
}

/** @param {import("../view/announcements.mjs").Announcements} parts */
export function announce(parts) {
    if (!regions) return;
    for (const key of /** @type {Politeness[]} */ (["polite", "assertive"])) {
        const now = parts[key].filter(Boolean);
        const fresh = now.filter((part) => !said[key].includes(part));
        said[key] = now;
        if (fresh.length) regions[key].textContent = fresh.join(". ");
        else if (!now.length) regions[key].textContent = "";
    }
}
