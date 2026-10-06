"use strict";

// Charybdis Ark Branch — a developer tool, not part of Ark.
//
// Its own status-bar button lists Ark's branches (every worktree on one, see
// checkouts.js) and opens the picked one in a new window running that
// checkout's Ark. A window loaded this way runs the checkout in place of the
// installed Ark, which keeps running unchanged in every other window. Close the
// window to stop.

const path = require("node:path");
const childProcess = require("node:child_process");
const vscode = require("vscode");

const {listCheckouts} = require("./checkouts");

function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand("charybdisArkBranch.open", pickAndOpen));
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    status.text = "$(git-branch) Ark branch";
    status.tooltip = "Open Charybdis Ark from a branch, in a new window";
    status.command = "charybdisArkBranch.open";
    status.show();
    context.subscriptions.push(status);
}

async function pickAndOpen() {
    let checkouts;
    try {
        // This folder sits in an Ark checkout; git lists all of its worktrees from any of them.
        checkouts = listCheckouts(__dirname);
    } catch (error) {
        vscode.window.showErrorMessage(`Charybdis Ark Branch could not list Ark's branches: ${error.message}`);
        return;
    }
    const picked = await vscode.window.showQuickPick(checkouts.map((checkout) => ({
        label: checkout.branch,
        description: checkout.main ? "main checkout" : "",
        detail: `${checkout.subject} · ${checkout.path}`,
        checkout,
    })), {placeHolder: "Open Charybdis Ark from which branch?", matchOnDetail: true});
    if (picked) openWindow(picked.checkout.path);
}

function openWindow(checkout) {
    const cli = path.join(vscode.env.appRoot, "bin", process.platform === "win32" ? "code.cmd" : "code");
    const child = childProcess.spawn(cli, ["--new-window", `--extensionDevelopmentPath=${checkout}`], {detached: true, stdio: "ignore"});
    child.on("error", (error) => vscode.window.showErrorMessage(`Charybdis Ark Branch could not open a window: ${error.message}`));
    child.unref();
}

function deactivate() {}

module.exports = {activate, deactivate};
