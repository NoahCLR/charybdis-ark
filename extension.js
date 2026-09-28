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
// What the model holds and where each message goes is decided in
// core/session/panel-session.js; this file adds the VS Code parts — dialogs,
// files, progress and the panel itself.

const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

const {upgradePdSnapshot, validateSnapshot} = require("./core/session/portable-profile-session");
const {ProfileDeviceService} = require("./core/session/profile-device-service");
const {buildPanelModel, routeMessage, takeOutbox} = require("./core/session/panel-session");
const {draftControl, portableControl, readKeyboard} = require("./core/session/panel-controls");
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

    const session = {service: undefined, notice: undefined, recoveryRoot: context.globalStorageUri};
    session.service = new ProfileDeviceService({
        onChange: () => publish(panel, session),
    });

    panel.webview.html = getHtml(panel.webview, context.extensionUri);
    panel.webview.onDidReceiveMessage((message) => handleMessage(panel, session, message));
    panel.onDidDispose(() => {
        void session.service.close();
    });
}

function publish(panel, session) {
    const model = buildPanelModel(session, session.service.snapshot());
    void panel.webview.postMessage({type: "model", model, ...takeOutbox(session)});
}

// Every path through here publishes, including the ones that decline or fail:
// the webview waits on that reply — a combo builder closes when its edit is
// accepted and stays open when it is refused — and a refusal reaches the panel
// as a notice rather than as silence.
async function handleMessage(panel, session, message) {
    try {
        const route = routeMessage(session, message, session.service.snapshot());
        if (route === "draft") await draftMessage(panel, session, message);
        else if (route === "portable") await portableMessage(panel, session, message);
        else if (route === "read") await connectAndRead(panel, session, message.type === "selectDevice" ? message.deviceId : undefined);
        // A staged edit, and even an unrecognised message, is answered, so the
        // panel is never left waiting on a reply.
        else publish(panel, session);
    } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        const code = error?.code ? ` [${error.code}]` : "";
        vscode.window.showErrorMessage(`Charybdis Ark: ${text}`);
        // Put it in the panel too. A toast is easy to miss and disappears,
        // and the panel is where someone looks when it seems stuck.
        session.notice = `Failed${code}: ${text}`;
        publish(panel, session);
    }
}

// What only a host has, handed to core/session/panel-controls.js: progress,
// the recovery copy on disk, and a profile file the person chose.
function hostFor(session) {
    return {
        progress: (title, work) => vscode.window.withProgress({location: vscode.ProgressLocation.Notification, title}, work),
        saveRecovery: (document) => saveRecoveryFile(session, document),
        chooseProfile: async () => {
            const files = await vscode.window.showOpenDialog({title: "Choose a keyboard profile", canSelectMany: false, filters: {"Charybdis profile": ["charybdis.json", "json"]}});
            if (!files?.length) return undefined;
            if ((await vscode.workspace.fs.stat(files[0])).size > 100000) throw new Error("This profile file is too large.");
            const name = files[0].path.split("/").pop();
            return {text: Buffer.from(await vscode.workspace.fs.readFile(files[0])).toString("utf8"), name};
        },
    };
}

// Connect, learn what the keyboard is, and read what it is running.
async function connectAndRead(panel, session, selectedDeviceId) {
    try {
        session.readReady = await readKeyboard(session, selectedDeviceId, hostFor(session));
    } finally {
        session.readBusy = false;
        publish(panel, session);
    }
}

module.exports = {activate, deactivate, adoptFormerRecoveries};

async function saveRecoveryFile(session, document) {
    await vscode.workspace.fs.createDirectory(session.recoveryRoot);
    const suffix = document.format === "charybdis-profile" ? ".charybdis.json" : ".diagnostic.json";
    const uri = vscode.Uri.joinPath(session.recoveryRoot, "recovery-" + new Date().toISOString().replace(/[:.]/g, "-") + suffix);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(document, null, 2) + "\n"));
    session.lastRecovery = uri;
    return uri.fsPath;
}

// Exports are dialogs and files, so they stay here; everything else a
// portable message does is core/session/panel-controls.js.
async function portableMessage(panel, session, message) {
    session.portableBusy = true;
    try {
        const service = session.service;
        if (message.type === "exportPdUpgrade") {
            const snapshot = await service.readPortableProfile(), upgraded = upgradePdSnapshot(snapshot.document);
            const uri = await vscode.window.showSaveDialog({title: "Save original profile and PD upgrade", saveLabel: "Save both profiles", filters: {"Charybdis profile": ["charybdis.json"]}});
            if (uri) {
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
        } else if (message.type === "exportPortableProfile") {
            const snapshot = await service.readPortableProfile();
            const uri = await vscode.window.showSaveDialog({title: "Export complete keyboard profile", saveLabel: "Export profile", filters: {"Charybdis profile": ["charybdis.json", "json"]}});
            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(snapshot.document, null, 2) + "\n"));
                session.notice = "Complete keyboard profile exported to " + uri.fsPath;
            }
        } else {
            await portableControl(session, message, hostFor(session));
        }
    } finally {session.portableBusy = false; publish(panel, session);}
}

async function draftMessage(panel, session, message) {
    session.portableBusy = true;
    try {
        await draftControl(session, message, hostFor(session));
    } finally {session.portableBusy = false; publish(panel, session);}
}
