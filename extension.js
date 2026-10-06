"use strict";

// Charybdis Ark — extension host.
//
// Thin on purpose. It owns the VS Code surface (command, panel, message relay)
// and nothing else. Device, protocol and profile decisions live in core/, which
// has no vscode import so this shell can be replaced by a standalone app later
// without touching it. Nothing here parses a firmware repository; see
// docs/LIVE_EDIT_APP_DIRECTION.md.
//
// The webview renders a keyboard-backed `model` and posts typed edits back.
// What the model holds, where each message goes and the loop that answers it
// are core/session/panel-loop.js; this file adds the VS Code parts — dialogs,
// files, progress, toasts and the panel itself.

const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

const {upgradePdSnapshot, validateSnapshot} = require("./core/session/portable-profile-session");
const {openPanelLoop} = require("./core/session/panel-loop");
const {getHtml} = require("./panel-html");

const VIEW_TYPE = "charybdisArk.panel";
// VS Code keys an extension's storage by its identity, and the app was once
// Charybdis Live (D-L47). Its recovery copies are adopted from these folders.
const FORMER_IDENTITIES = ["noah.charybdis-live", "noah.charybdis-live-v2"];

function activate(context) {
    context.subscriptions.push(
        vscode.commands.registerCommand("charybdisArk.open", () => openPanel(context))
    );

    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 2);
    status.text = "$(radio-tower) Charybdis Ark";
    status.tooltip = "Open Charybdis Ark — edit the connected keyboard";
    status.command = "charybdisArk.open";
    status.show();
    context.subscriptions.push(status);

    adoptFormerRecoveries(context.globalStorageUri.fsPath).catch((error) => {
        vscode.window.showWarningMessage(`Charybdis Ark could not copy recovery files saved as Charybdis Live: ${error.message}`);
    });
}

// Copies, never moves or overwrites: the originals stay where they were, and a
// name already here is left alone, so running this on every start is safe.
async function adoptFormerRecoveries(target) {
    await fs.promises.mkdir(target, {recursive: true});
    for (const identity of FORMER_IDENTITIES) {
        const source = path.join(path.dirname(target), identity);
        let names;
        try {names = await fs.promises.readdir(source);} catch (error) {if (error.code === "ENOENT") continue; throw error;}
        for (const name of names.filter((entry) => /^recovery-.+\.json$/.test(entry))) {
            try {await fs.promises.copyFile(path.join(source, name), path.join(target, name), fs.constants.COPYFILE_EXCL);}
            catch (error) {if (error.code !== "EEXIST") throw error;}
        }
    }
}

function deactivate() {}

function openPanel(context) {
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, "Charybdis Ark", vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "webview")],
    });

    const loop = openPanelLoop(vscodeHost(panel, context.globalStorageUri));
    panel.webview.html = getHtml(panel.webview, context.extensionUri);
    panel.webview.onDidReceiveMessage((message) => loop.handleMessage(message));
    panel.onDidDispose(() => {
        void loop.close();
    });
}

// What only VS Code has, handed to core/session/panel-loop.js, which lists
// what each of these does: the panel, toasts, progress, the recovery copy on
// disk, and the files the person chooses.
function vscodeHost(panel, recoveryRoot) {
    return {
        post: (message) => panel.webview.postMessage(message),
        showError: (text) => vscode.window.showErrorMessage(`Charybdis Ark: ${text}`),
        progress: (title, work) => vscode.window.withProgress({location: vscode.ProgressLocation.Notification, title}, work),
        saveRecovery: (document) => saveRecoveryFile(recoveryRoot, document),
        chooseProfile: async () => {
            const files = await vscode.window.showOpenDialog({title: "Choose a keyboard profile", canSelectMany: false, filters: {"Charybdis profile": ["charybdis.json", "json"]}});
            if (!files?.length) return undefined;
            if ((await vscode.workspace.fs.stat(files[0])).size > 100000) throw new Error("This profile file is too large.");
            const name = files[0].path.split("/").pop();
            return {text: Buffer.from(await vscode.workspace.fs.readFile(files[0])).toString("utf8"), name};
        },
        saveExport: async (file) => {
            const uri = await vscode.window.showSaveDialog({title: "Export complete keyboard profile", saveLabel: "Export profile", filters: {"Charybdis profile": ["charybdis.json", "json"]}});
            if (!uri) return undefined;
            await vscode.workspace.fs.writeFile(uri, Buffer.from(file.text));
            return uri.fsPath;
        },
        exportPdUpgrade,
    };
}

module.exports = {activate, deactivate, adoptFormerRecoveries};

async function saveRecoveryFile(recoveryRoot, document) {
    await vscode.workspace.fs.createDirectory(recoveryRoot);
    const suffix = document.format === "charybdis-profile" ? ".charybdis.json" : ".diagnostic.json";
    const uri = vscode.Uri.joinPath(recoveryRoot, "recovery-" + new Date().toISOString().replace(/[:.]/g, "-") + suffix);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(document, null, 2) + "\n"));
    return uri.fsPath;
}

// The legacy eight-slot upgrade export: two files written and read back, so it
// stays VS Code's.
async function exportPdUpgrade(session) {
    const snapshot = await session.service.readPortableProfile(), upgraded = upgradePdSnapshot(snapshot.document);
    const uri = await vscode.window.showSaveDialog({title: "Save original profile and PD upgrade", saveLabel: "Save both profiles", filters: {"Charybdis profile": ["charybdis.json"]}});
    if (!uri) return;
    const next = uri.with({path: uri.path.replace(/(?:\.charybdis)?\.json$/i, "") + ".pd8.charybdis.json"});
    let exists = false;
    try {await vscode.workspace.fs.stat(next); exists = true;} catch (error) {if (error.code !== "FileNotFound") throw error;}
    if (exists || next.toString() === uri.toString()) throw new Error("The upgraded backup path already exists. Choose a new backup name.");
    for (const [target, value] of [[uri, snapshot.document], [next, upgraded]]) {
        const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n");
        await vscode.workspace.fs.writeFile(target, bytes);
        const verified = Buffer.from(await vscode.workspace.fs.readFile(target));
        if (!verified.equals(bytes)) throw new Error("Backup verification failed. Keep the existing firmware until both backups are saved.");
        validateSnapshot(verified.toString("utf8"));
    }
    session.notice = "Original and eight-slot profiles saved and verified. Keep the original firmware pair too. After installing the new firmware on both halves, import " + next.fsPath;
}
