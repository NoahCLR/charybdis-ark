// @ts-check
"use strict";
const {editLayers} = require("../tests/fixtures/profile-document");

// Developer preview: render the interface against a profile from the test
// fixtures, with no keyboard attached.
//
// This is a build step, not part of the app: it runs by hand, writes into
// `preview/`, and nothing under `webview/` ever reads a file.

const fs = require("node:fs");
const path = require("node:path");
const {PHASE} = require("../core/model/vocabulary");
const {ProfileDraftSession} = require("../core/session/profile-draft-session");
const {buildPanelModel, observeService, startLayerEdit} = require("../core/session/panel-session");
const portable = require("../core/model/portable-profile");
const keycodes = require("../core/data/keycode-catalog");
const {CHARYBDIS_4X6_LAYOUT_MATRIX} = require("../core/data/charybdis-layout");
const {PROFILE_WIRE_KNOWN_MASKS} = require("../core/protocol/profile-wire-v1");
const {document32} = require("../tests/fixtures/pd-slots-32");
const {ACTION_ABI} = require("../core/schema/actions");

// A readable keymap for the preview only. The fixture profile ships an empty
// VIA layout, which renders honestly but tells you nothing about the layout
// surface, so this script writes one in. It is preview data owned by this
// script: nothing here is read by the app or taken from a firmware checkout.
const PREVIEW_BASE = [
    "KC_ESC", "KC_1", "KC_2", "KC_3", "KC_4", "KC_5", "KC_6", "KC_7", "KC_8", "KC_9", "KC_0", "KC_MINS",
    "KC_TAB", "KC_Q", "KC_W", "KC_E", "KC_R", "KC_T", "KC_Y", "KC_U", "KC_I", "KC_O", "KC_P", "KC_BSLS",
    "KC_LSFT", "KC_A", "KC_S", "KC_D", "KC_F", "KC_G", "KC_H", "KC_J", "KC_K", "KC_L", "KC_SCLN", "KC_QUOT",
    "KC_LCTL", "KC_Z", "KC_X", "KC_C", "KC_V", "KC_B", "KC_N", "KC_M", "KC_COMM", "KC_DOT", "KC_SLSH", "KC_RALT",
    "KC_LGUI", "KC_SPC", "KC_ESC", "KC_ENT", "KC_ENT", "KC_DEL", "KC_BSPC", "KC_BSPC",
];

// Keys the keyboard stores as bare user keycodes: configured pointing modes
// (slots 0 and 12), empty slots (6 and 20), a VIA macro and a custom key. The
// preview carries them because they are the values whose stored name and
// semantic name differ.
/** @type {Record<number, number>} */
const PREVIEW_PD_BINDINGS = {50: 0x7e80, 52: 0x7e86, 48: 0x7700, 49: 0x7f00, 53: 0x7e8c, 54: 0x7eb4};

/** @param {import("../core/model/types.js").PortableDocument} document */
function fillPreviewLayer(document) {
    for (const [layoutIndex, code] of Object.entries(PREVIEW_PD_BINDINGS)) {
        const position = CHARYBDIS_4X6_LAYOUT_MATRIX[Number(layoutIndex)];
        if (position) editLayers(document, layers => layers[0][position[0] * 6 + position[1]] = code);
    }
    PREVIEW_BASE.forEach((name, layoutIndex) => {
        if (PREVIEW_PD_BINDINGS[layoutIndex] !== undefined) return;
        const position = CHARYBDIS_4X6_LAYOUT_MATRIX[layoutIndex];
        const code = keycodes.encode(name);
        if (position && typeof code === "number" && Number.isInteger(code)) editLayers(document, layers => layers[0][position[0] * 6 + position[1]] = code);
    });
    return document;
}

/** @type {Partial<import("../core/session/types.js").DeviceCapabilities> & {brightnessMax: number}} */
const capabilities = {
    protocol: {major: 2, minor: 0},
    schema: {major: 4, minor: 0},
    compiledLayerCount: 16,
    supportedDomainMask: 127,
    actionAbiDigest: ACTION_ABI,
    // Current firmware: everything the flashable pair reports.
    featureFlags: PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES,
    responseVersion: 3,
    reportSize: 32,
    brightnessMax: 255,
    // The sizes current firmware advertises, so Profile & backups shows its meter.
    maxProfilePayload: 130048,
    maxBehaviorRows: 128,
    maxPopulatedBehaviorSteps: 640,
    maxCombos: 128,
    maxKeysPerCombo: 16,
    maxTapStepsPerBehavior: 5,
    maxReusableRgbGroups: 16,
    maxRgbStageGroupRows: 32,
    macroBytes: 34903,
};

// The hosts the preview stands in for. The extension's is what it always was;
// the web page's says what the page offers, in its words (web/web-host.mjs),
// with no keyboard yet, or in a browser without WebHID. preview/index.html
// shows the extension's; ?host=web, web-none or web-unsupported the others.
/** @type {import("../core/session/types.js").PanelHost} */
const VSCODE_HOST = {};
/** @returns {Promise<Record<string, import("../core/session/types.js").PanelHost>>} */
async function webHosts() {
    const {BLOCKED, WEB_WORDS} = await import("../web/web-host.mjs");
    const {version} = require("../package.json");
    /** @type {Partial<import("../contracts/model.js").HostPanel>} */
    const offered = {chooseKeyboard: true, theme: "dark", build: {version, commit: "preview"}, recoveries: [
        {id: 2, name: "recovery-2026-10-06T09-14-03-512Z.charybdis.json", savedAt: "2026-10-06T09:14:03.512Z"},
        {id: 1, name: "recovery-2026-10-01T18-40-55-020Z.charybdis.json", savedAt: "2026-10-01T18:40:55.020Z"},
    ]};
    return {
        none: VSCODE_HOST,
        demo: VSCODE_HOST,
        "demo-edited": {words: WEB_WORDS, panel: () => offered},
        web: {words: WEB_WORDS, panel: () => offered},
        live: VSCODE_HOST,
        "web-none": {words: WEB_WORDS, panel: () => ({...offered, recoveries: []})},
        "web-unsupported": {words: WEB_WORDS, panel: () => ({...offered, chooseKeyboard: false, recoveries: [], blocked: BLOCKED.unsupported})},
    };
}

// No keyboard: what a host publishes before one is chosen or connected.
/** @param {import("../core/session/types.js").PanelHost} host */
function emptyModel(host) {
    return buildPanelModel({service: {portable: null}, host}, {connected: false, busy: false, devices: [], phase: PHASE.EMPTY});
}

// The demo, as the host loop opens it: the bundled demo profile in a real
// draft (core/session/demo-session.js), and with `edits` staged in it, so the
// review and leaving with edits not exported can be looked at.
/**
 * @param {import("../core/session/types.js").PanelHost} host
 * @param {Exclude<import("../contracts/edits.js").PanelEdit, {type: "reviewPortableProfile" | "validateViaMacro"}>[]} [edits]
 */
function demoModel(host, edits = []) {
    const {openDemo, panelState} = require("../core/session/demo-session");
    /** @type {import("../core/session/types.js").PanelSession} */
    const session = {service: {portable: null, snapshot: () => ({connected: false, busy: false, devices: []})}, host};
    openDemo(session, session.service.snapshot());
    // openDemo synchronously created this draft from its validated fixture.
    const draft = /** @type {InstanceType<typeof ProfileDraftSession>} */ (session.draft);
    for (const edit of edits) {
        const message = {...edit, draftId: draft.id, draftRevision: draft.revision};
        draft.stage(message);
    }
    return buildPanelModel(session, panelState(session));
}
/** @type {Extract<import("../contracts/edits.js").PanelEdit, {type: "updateConfigDefaults"}>} */
const DEMO_EDIT = {type: "updateConfigDefaults", sectionId: "normalPointerSpeed", fields: [{macro: "normalDpi", value: "1400"}, {macro: "snipingDpi", value: "200"}]};

// `live` renders a keyboard in Live + review (firmware D-F32): the draft is
// its working copy, with one unsaved edit, and a combos key has turned combos
// off for now. ?host=live shows it.
/** @param {import("../core/session/types.js").PanelHost} [host] @param {{live?: boolean}} [options] */
function buildModel(host = VSCODE_HOST, {live = false} = {}) {
    const doc = fillPreviewLayer(document32());
    const snapshot = {
        document: doc,
        fingerprint: portable.fingerprint(doc),
        summary: portable.summary(doc),
        identity: {generation: 42},
        hostOs: {detected: 1},
    };
    const deviceId = "preview-charybdis";
    let liveSnapshot;
    if (live) {
        const working = editLayers(fillPreviewLayer(document32()), layers => {layers[0][13] = /** @type {number} */ (keycodes.encode("KC_ESC"));});
        const bytes = Buffer.from(working.profile, "base64"), saved = Buffer.from(doc.profile, "base64");
        liveSnapshot = {...snapshot, document: working, fingerprint: portable.fingerprint(working), summary: portable.summary(working), saved: snapshot,
            runtime: null, live: {mode: 2, session: 0x5e550001, revision: 1, savedGeneration: 42, savedOrigin: 0, unsaved: true, converged: true, working: bytes, saved, defaults: saved}};
    }
    const session = new ProfileDraftSession(/** @type {any} */ (liveSnapshot || snapshot), deviceId, capabilities);
    /** @type {import("../core/session/types.js").PanelDeviceState} */
    const state = {
        selectedDeviceId: deviceId,
        connected: true,
        busy: false,
        capabilities,
        status: {committedGeneration: 42, committedDigest: 0x9ac31b70, activeGeneration: 42, peerGeneration: 42},
        devices: [
            {id: deviceId, label: "Charybdis 4x6 · preview", manufacturer: "Bastard Keyboards", product: "Charybdis 4x6"},
            ...(process.argv.includes("--multiple") ? [{id: "preview-second", label: "Charybdis 4x6 · second", manufacturer: "Bastard Keyboards", product: "Charybdis 4x6"}] : []),
        ],
        baseRgb: {state: "read", effectId: 1, brightness: 180, hue: 140, saturation: 210, speed: 60},
        // No name of its own: the keyboard reports its built-in one.
        storedKeyboardName: "",
        // How edits reach it, stored on the keyboard: Apply here, Live + review with `live`.
        editMode: {mode: live ? 2 : 0, counter: 1, peerMode: live ? 2 : 0, peerCounter: 1, peerKnown: true, conflict: false, agreed: true},
        runtime: live ? {combos: {master: true, override: false}, behaviours: {master: true, override: true},
            live: {defaultDpi: 1200, snipingDpi: 400, rgbMode: 1, rgbColor: 0, defaultLayers: 1, keymapOptions: 0}} : null,
    };
    // The host's own model builder, so the preview cannot drift from it. The
    // layer editor is open so Rename & Reorder has something to show.
    const panel = {service: {portable: null}, host, draft: session, portableLayers: startLayerEdit(snapshot, session.revision)};
    const model = buildPanelModel(panel, state);
    return model;
}

// `--device` renders the interface against the keyboard that is plugged in,
// read-only, the way the host builds its model. Fixture data cannot show what a
// real profile does to a surface — every naming inconsistency found so far came
// from looking at this.
async function deviceModel() {
    const {ProfileDeviceService} = require("../core/session/profile-device-service");
    const service = new ProfileDeviceService({onChange: () => {}});
    try {
        await service.enumerate();
        const devices = service.snapshot().devices;
        if (!devices.length) throw new Error("no Charybdis Raw HID interface found");
        await service.connect(devices[0].id);
        await service.refresh();
        await service.readLayout();
        await service.readCommittedProfile();
        await service.readBaseRgb();
        await service.readCombos();
        if (require("../core/session/firmware-support").canEdit(service.capabilities)) await service.readKeyboardProfile();

        // Exactly the model the panel would build for this keyboard.
        /** @type {import("../core/session/types.js").PanelSession} */
        const panel = {service, host: VSCODE_HOST};
        observeService(panel, service.snapshot());
        const model = buildPanelModel(panel, service.snapshot());
        if (panel.draft) panel.portableLayers = startLayerEdit(panel.draft.current, panel.draft.revision);
        model.portable.layers = panel.portableLayers ? {key: panel.portableLayers.before.fingerprint, order: panel.portableLayers.order, names: panel.portableLayers.names, keysFollow: panel.portableLayers.keysFollow !== false} : null;
        return model;
    } finally {
        await service.close();
    }
}

const model = process.argv.includes("--device") ? deviceModel() : buildModel();
// `--vscode` also writes the page as the panel actually renders it: the host
// puts its own stylesheet in front of this one (a cascade layer that dresses
// <code> and pads the body) and hangs its theme class on <body>. Both of those
// have broken this interface before, and neither is visible in preview/index.html.
/** @param {string} page */
function writeHostPages(page) {
    const root = "/Applications/Visual Studio Code.app/Contents/Resources/app";
    const shell = path.join(root, "out/vs/workbench/contrib/webview/browser/pre/index.html");
    if (!fs.existsSync(shell)) {
        console.log("skipped --vscode: no VS Code install at " + root);
        return;
    }
    const source = fs.readFileSync(shell, "utf8");
    const opening = source.indexOf("defaultStyles.textContent = `") + "defaultStyles.textContent = `".length;
    const hostStyles = source.slice(opening, source.indexOf("`;", opening));
    /** @param {string} name @returns {Record<string, string>} */
    const theme = (name) => {
        /** @type {import("./preview-types.js").ThemeFile} */
        const data = JSON.parse(fs.readFileSync(path.join(root, "extensions/theme-defaults/themes", name), "utf8"));
        const inherited = data.include ? theme(data.include.replace(/^\.\//, "")) : {};
        return {...inherited, ...(data.colors || {})};
    };
    for (const [label, file, klass] of [["dark", "dark_modern.json", "vscode-dark"], ["light", "light_modern.json", "vscode-light"]]) {
        const colours = theme(file);
        const declarations = Object.entries(colours).map(([key, value]) => `  --vscode-${key.replace(/\./g, "-")}: ${value};`).join("\n");
        const injected = `<style>\n${hostStyles}\n</style>\n<style>\n:root {\n`
            + `  --vscode-font-family: -apple-system, sans-serif;\n  --vscode-font-size: 13px;\n`
            + `  --monaco-monospace-font: "SF Mono", Menlo, monospace;\n${declarations}\n}\n`
            + `html, body { background: var(--vscode-editor-background); }\n</style>\n`;
        fs.writeFileSync(path.join(__dirname, "..", "preview", `vscode-${label}.html`),
            page.replace("<body>", `<body class="vscode-body ${klass}">`).replace("<link rel=", injected + "<link rel="));
        console.log(`written preview/vscode-${label}.html`);
    }
}

const previewDir = path.join(__dirname, "..", "preview");
const macroHost = require("./build-web").bundle("core", {macroHost: "scripts/preview-macro-host.mjs"}, previewDir,
    {inject: [path.join(__dirname, "..", "web", "buffer.mjs")]});
Promise.all([model, webHosts(), macroHost]).then(([model, hosts, macroHost]) => {
fs.mkdirSync(path.join(__dirname, "..", "preview"), {recursive: true});
fs.writeFileSync(path.join(__dirname, "..", "preview", "model.json"), JSON.stringify(model));
for (const [name, host] of Object.entries(hosts)) {
    const web = name === "web" ? buildModel(host) : name === "live" ? buildModel(host, {live: true}) : name === "demo" ? demoModel(host) : name === "demo-edited" ? demoModel(host, [DEMO_EDIT]) : emptyModel(host);
    fs.writeFileSync(path.join(__dirname, "..", "preview", `model-${name}.json`), JSON.stringify(web));
}
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Charybdis Ark — preview</title>
<link rel="stylesheet" href="../webview/styles.css?built=${Date.now()}">
<script>
// Stand in for the extension host: answer the webview's "ready" with one
// fixture model, exactly as the real host answers it after reading a keyboard,
// and log every edit it posts back. ?host=web (web-none, web-unsupported)
// answers as the web page's host does instead, and turns its theme toggle.
// ?host=none is the extension with no keyboard; Explore a demo there opens
// ?host=demo's model, the bundled demo (demo-edited has an edit staged).
const posted = [];
let model = null, wanted = false;
const publish = () => {
    if (!model || !wanted) return;
    window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
};
window.acquireVsCodeApi = () => ({
    postMessage: (message) => {
        posted.push(message);
        console.log("posted", JSON.stringify(message));
        if (message.type === "validateViaMacro") Promise.all([import("./${macroHost.macroHost}"), import("../webview/store.mjs")])
            .then(([host, store]) => window.dispatchEvent(new MessageEvent("message", {data: host.inspect(message, store.getModel())})));
        if (message.type === "ready" || message.type === "refresh") { wanted = true; publish(); }
        if (message.type === "setTheme" && model?.host) { model.host.theme = message.theme; publish(); }
        if (message.type === "openDemo") fetch("./model-demo.json").then((response) => response.json()).then((loaded) => { model = loaded; publish(); });
    },
    getState: () => undefined, setState: () => {},
});
window.__posted = posted;
const host = new URLSearchParams(location.search).get("host");
fetch(host ? "./model-" + host + ".json" : "./model.json").then((response) => response.json()).then((loaded) => { model = loaded; publish(); });
// ?screen=lighting opens a screen by clicking its rail button, the way a
// person would, so the preview needs no hook inside the app.
const wantedScreen = new URLSearchParams(location.search).get("screen");
if (wantedScreen) {
    addEventListener("message", () => setTimeout(() => {
        document.querySelector('[data-screen=' + wantedScreen + ']')?.click();
    }, 0), {once: true});
}
</script>
</head><body><div id="root"></div>
<script type="module" src="../webview/app.mjs?built=${Date.now()}"></script>
</body></html>
`;
fs.writeFileSync(path.join(__dirname, "..", "preview", "index.html"), page);
if (process.argv.includes("--vscode")) writeHostPages(page);
console.log("layers", model.layers.length,
    "· behaviours", model.keyBehaviors.length,
    "· combos", model.combos.length,
    "· pd slots", model.pdModes.length,
    "· macros", model.viaMacros.length,
    "· settings sections", model.configDefaults.length,
    "· rgb layer rows", model.rgb.layerColors?.length);
console.log("written preview/index.html");
}).catch(/** @param {unknown} error */ (error) => {
    const message = error && typeof error === "object" && "message" in error ? error.message : undefined;
    console.error(String(message || error));
    process.exit(1);
});
