// @ts-check
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
const EXTENSION_VERSION = require("./package.json").version;
const path = require("node:path");
const vscode = require("vscode");

const {openPanelLoop, FILE_MAX_BYTES} = require("./core/session/panel-loop");
const {writingProfile} = require("./core/session/panel-control-registry");
const {getHtml} = require("./panel-html");

const VIEW_TYPE = "charybdisArk.panel";
// VS Code keys an extension's storage by its identity, and the app was once
// Charybdis Live (D-L47). Its recovery copies are adopted from these folders.
const FORMER_IDENTITIES = ["noah.charybdis-live", "noah.charybdis-live-v2"];

/** @param {import("vscode").ExtensionContext} context */
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
/** @param {string} target */
async function adoptFormerRecoveries(target) {
    await fs.promises.mkdir(target, {recursive: true});
    for (const identity of FORMER_IDENTITIES) {
        const source = path.join(path.dirname(target), identity);
        let names;
        try {names = await fs.promises.readdir(source);} catch (error) {if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") continue; throw error;}
        for (const name of names.filter((entry) => /^recovery-.+\.json$/.test(entry))) {
            try {await fs.promises.copyFile(path.join(source, name), path.join(target, name), fs.constants.COPYFILE_EXCL);}
            catch (error) {if (/** @type {NodeJS.ErrnoException} */ (error).code !== "EEXIST") throw error;}
        }
    }
}

function deactivate() {}

// One panel holds the keyboard in a window, as one tab does on the web page.
// A second panel would open the same keyboard over its own connection and
// read it alongside the first, even while the first is applying.
/** @type {import("vscode").WebviewPanel | undefined} */
let openedPanel;
// A closed panel's connection stays open until the operation it started
// ends, so a save carries on to its end rather than being cut off mid-write.
/** @type {Promise<unknown> | undefined} */
let closing;

/** @param {import("vscode").ExtensionContext} context */
function openPanel(context) {
    if (openedPanel) {
        openedPanel.reveal();
        return;
    }
    if (closing) {
        void vscode.window.showInformationMessage("Charybdis Ark is finishing what it was doing with the keyboard. Open it again in a moment.");
        return;
    }
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, "Charybdis Ark", vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "webview")],
    });
    openedPanel = panel;
    let disposed = false;

    const loop = openPanelLoop(vscodeHost(panel, context.globalStorageUri, () => disposed));
    // A live keyboard's own saves and key adjustments show up between edits.
    loop.watch();
    /** @type {Set<Promise<unknown>>} */
    const running = new Set();
    panel.webview.html = getHtml(panel.webview, context.extensionUri);
    // IPC is untrusted; the shared loop validates the selected command and its payload.
    panel.webview.onDidReceiveMessage((/** @type {unknown} */ message) => {
        const work = loop.handleMessage(message);
        running.add(work);
        void work.finally(() => running.delete(work));
    });
    panel.onDidDispose(() => {
        disposed = true;
        openedPanel = undefined;
        if (writingProfile(loop.session)) {
            void vscode.window.showWarningMessage("Charybdis Ark keeps saving the profile to the keyboard. Keep it connected until the save finishes; open Ark again afterwards to see the result.");
        }
        const done = closing = Promise.allSettled([...running]).then(() => loop.close()).catch(() => undefined)
            .finally(() => {if (closing === done) closing = undefined;});
    });
}

// What only VS Code has, handed to core/session/panel-loop.js, which lists
// what each of these does: the panel, toasts, progress, the recovery copy on
// disk, and the files the person chooses. Once the panel is closed nothing is
// posted to it, while what it started finishes.
/** @param {import("vscode").WebviewPanel} panel @param {import("vscode").Uri} recoveryRoot @param {() => boolean} [disposed] @returns {import("./core/session/types.js").LoopHost} */
function vscodeHost(panel, recoveryRoot, disposed = () => false) {
    return {
        post: (message) => disposed() ? Promise.resolve(false) : panel.webview.postMessage(message),
        showError: (text) => vscode.window.showErrorMessage(`Charybdis Ark: ${text}`),
        progress: async (title, work) => await vscode.window.withProgress({location: vscode.ProgressLocation.Notification, title}, work),
        saveRecovery: (document) => saveRecoveryFile(recoveryRoot, document),
        chooseProfile: async () => {
            const files = await vscode.window.showOpenDialog({title: "Choose a keyboard profile", canSelectMany: false, filters: {"Charybdis profile": ["charybdis.json", "json"]}});
            if (!files?.length) return undefined;
            if ((await vscode.workspace.fs.stat(files[0])).size > FILE_MAX_BYTES) throw new Error("This profile file is too large.");
            const name = files[0].path.split("/").pop();
            return {text: Buffer.from(await vscode.workspace.fs.readFile(files[0])).toString("utf8"), name};
        },
        saveExport: async (file) => {
            const uri = await vscode.window.showSaveDialog({title: "Export complete keyboard profile", saveLabel: "Export profile", filters: {"Charybdis profile": ["charybdis.json", "json"]}});
            if (!uri) return undefined;
            await vscode.workspace.fs.writeFile(uri, Buffer.from(file.text));
            return uri.fsPath;
        },
        // Ark's own version, for the Keyboard screen; the extension has no
        // commit to name.
        panel: () => ({build: {version: EXTENSION_VERSION, commit: ""}}),
    };
}

module.exports = {activate, deactivate, adoptFormerRecoveries, openPanel};

/** @param {import("vscode").Uri} recoveryRoot @param {Parameters<NonNullable<import("./core/session/types.js").LoopHost["saveRecovery"]>>[0]} document */
async function saveRecoveryFile(recoveryRoot, document) {
    await vscode.workspace.fs.createDirectory(recoveryRoot);
    const suffix = document.format === "charybdis-profile" ? ".charybdis.json" : ".diagnostic.json";
    const uri = vscode.Uri.joinPath(recoveryRoot, "recovery-" + new Date().toISOString().replace(/[:.]/g, "-") + suffix);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(document, null, 2) + "\n"));
    return uri.fsPath;
}
