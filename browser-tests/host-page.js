"use strict";

// The panel as the extension host dresses it, without needing VS Code: the host
// puts its own stylesheet in a cascade layer in front of Ark's and hangs its
// theme class on <body>. These styles stand in for the documented host-cascade
// regressions (a padded body, dressed <code>); they are a small fixture, not a
// claim to run the VS Code extension host itself. preview/vscode-*.html, which
// `npm run preview -- --vscode` writes from an installed VS Code, is for looking,
// and a machine without VS Code (CI among them) never has it.
const HOST_STYLES = "@layer vscode-host { body { padding: 0 20px; } code { background: red; color: white; padding: 4px; border-radius: 3px; } }";

// "plain" is the interface alone, preview/index.html.
async function openPreview(page, theme = "plain", search = "") {
    await page.goto(`/preview/index.html${search}`);
    if (theme === "plain") return;
    await page.addStyleTag({content: HOST_STYLES});
    await page.locator("body").evaluate((body, name) => body.classList.add("vscode-body", name), theme);
}

module.exports = {openPreview};
