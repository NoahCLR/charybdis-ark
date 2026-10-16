"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// A stand-in for the parts of VS Code opening a panel touches.
const calls = {created: 0, revealed: 0, info: [], warnings: [], webviews: []};
/** @type {(() => void)[]} */
let disposeListeners = [];
const vscode = {
    ViewColumn: {One: 1},
    Uri: {joinPath: (base, ...parts) => ({path: [base.path, ...parts].join("/")})},
    window: {
        state: {focused: true},
        onDidChangeWindowState: () => ({dispose() {}}),
        showInformationMessage: async (text) => {calls.info.push(text);},
        showWarningMessage: async (text) => {calls.warnings.push(text);},
        createWebviewPanel: () => {
            calls.created++;
            disposeListeners = [];
            const webview = {cspSource: "vscode-resource:", asWebviewUri: (uri) => uri.path, onDidReceiveMessage: () => {}, postMessage: async () => true, html: ""};
            calls.webviews.push(webview);
            return {
                reveal: () => {calls.revealed++;},
                visible: true, active: true,
                onDidChangeViewState: () => ({dispose() {}}),
                onDidDispose: (listener) => {disposeListeners.push(listener);},
                webview,
            };
        },
    },
};
const load = Module._load;
Module._load = function (request, ...rest) { return request === "vscode" ? vscode : load.call(this, request, ...rest); };
const {openPanel} = require("../extension");
Module._load = load;

const context = {subscriptions: [], extensionUri: {path: "/ark"}, globalStorageUri: {path: "/storage", fsPath: "/storage"}};

test("one panel holds the keyboard in a window: opening again reveals it, and a closed one finishes first", async () => {
    openPanel(context);
    openPanel(context);
    assert.equal(calls.created, 1, "a second open does not start a second connection");
    assert.equal(calls.revealed, 1);

    disposeListeners.forEach((listener) => listener());
    openPanel(context);
    assert.equal(calls.created, 1, "a panel still closing keeps the keyboard until it has");
    assert.match(calls.info.at(-1), /finishing/);
    assert.equal(calls.warnings.length, 0, "closing with nothing being written says nothing");

    await new Promise((resolve) => setTimeout(resolve, 10));
    openPanel(context);
    assert.equal(calls.created, 2, "once closed, the next open starts afresh");

    // Each panel's script nonce is fresh and drawn from 24 random bytes.
    const nonces = calls.webviews.map((webview) => webview.html.match(/script-src 'nonce-([^']+)'/)?.[1]);
    assert.ok(nonces.every((nonce) => nonce && Buffer.from(nonce, "base64").length === 24));
    assert.notEqual(nonces[0], nonces[1]);
    assert.ok(calls.webviews.every((webview, index) => webview.html.includes(`nonce="${nonces[index]}"`)));
});
