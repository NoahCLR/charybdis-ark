// @ts-check
"use strict";

// The panel as VS Code dresses it, without needing VS Code: VS Code
// puts its own stylesheet in a cascade layer in front of Ark's and hangs its
// theme class on <body>. These styles stand in for the documented shell-cascade
// regressions (a padded body, dressed <code>); they are a small fixture, not a
// claim to run the VS Code extension host itself. preview/vscode-*.html, which
// `npm run preview -- --vscode` writes from an installed VS Code, is for looking,
// and a machine without VS Code (CI among them) never has it.
const SHELL_STYLES = "@layer vscode-shell { body { padding: 0 20px; } code { background: red; color: white; padding: 4px; border-radius: 3px; } }";

// "plain" is the interface alone, preview/index.html.
async function openPreview(page, theme = "plain", search = "") {
    await page.goto(`/preview/index.html${search}`);
    if (theme === "plain") return;
    await page.addStyleTag({content: SHELL_STYLES});
    await page.locator("body").evaluate((body, name) => body.classList.add("vscode-body", name), theme);
}

// Opens a folded Settings card or fold by its title, as a person would; one
// already open is left open.
/** @param {import("@playwright/test").Page} page @param {string} id a data-section or data-subfold */
async function openFold(page, id) {
    const fold = page.locator(`details[data-section="${id}"], details[data-subfold="${id}"]`).first();
    if (!(await fold.evaluate((node) => /** @type {HTMLDetailsElement} */ (node).open))) await fold.locator(":scope > summary").click();
}

module.exports = {openFold, openPreview};
