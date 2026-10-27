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
// (slots 0 and 12), empty slots (6 and 20), a macro and a custom key. The
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
    schema: {major: 4, minor: 3},
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

// The web page's shell as the preview stands in for it: what the page offers
// (web/web-shell.mjs) with four recovery copies kept, its words being the
// panel's own. preview/index.html shows it with a keyboard read; the other
// states are ?shell=<name>, among them none (no keyboard yet) and unsupported
// (a browser without WebHID).
const {version} = require("../package.json");
/** @type {Partial<import("../contracts/model.js").ShellPanel>} */
const OFFERED = {chooseKeyboard: true, theme: "dark", build: {version, commit: "preview"}, recoveries: [
    // Made by different operations on two keyboards, and one stored
    // before copies recorded either.
    {id: 4, name: "recovery-2026-10-06T09-14-03-512Z-before-save-charybdis-home.charybdis.json", savedAt: "2026-10-06T09:14:03.512Z", cause: "save", keyboard: "Charybdis - Home"},
    {id: 3, name: "recovery-2026-10-04T12-02-10-000Z-before-leave-live-charybdis-home.charybdis.json", savedAt: "2026-10-04T12:02:10.000Z", cause: "leave-live", keyboard: "Charybdis - Home"},
    {id: 2, name: "recovery-2026-10-03T08-30-00-000Z-before-apply-charybdis-office.charybdis.json", savedAt: "2026-10-03T08:30:00.000Z", cause: "apply", keyboard: "Charybdis - Office"},
    {id: 1, name: "recovery-2026-10-01T18-40-55-020Z.charybdis.json", savedAt: "2026-10-01T18:40:55.020Z"},
]};
/** @type {import("../core/session/types.js").PanelShell} */
const WEB_SHELL = {panel: () => OFFERED};
/** @returns {Promise<Record<string, import("../core/session/types.js").PanelShell>>} */
async function webShells() {
    const {BLOCKED} = await import("../web/web-shell.mjs");
    return {
        none: {panel: () => ({...OFFERED, recoveries: []})},
        unsupported: {panel: () => ({...OFFERED, chooseKeyboard: false, recoveries: [], blocked: BLOCKED.unsupported})},
        demo: WEB_SHELL,
        "demo-edited": WEB_SHELL,
        live: WEB_SHELL,
        "live-auto": WEB_SHELL,
        // A keyboard that stopped saving (firmware D-F34), unsaved edits on it.
        "live-stopped": WEB_SHELL,
        // An edit the keyboard holds until a key and a modifier are let go.
        "live-held": WEB_SHELL,
        // A keyboard in Apply, with a draft of edits, that stopped saving.
        "apply-stopped": WEB_SHELL,
        // An Apply cut short by the keyboard restarting during the copy to
        // the slave half: the bar and the notice it leaves.
        "apply-cut-short": WEB_SHELL,
    };
}

// No keyboard: what a shell publishes before one is chosen or connected.
/** @param {import("../core/session/types.js").PanelShell} shell */
function emptyModel(shell) {
    return buildPanelModel({service: {portable: null}, shell}, {connected: false, busy: false, devices: [], phase: PHASE.EMPTY});
}

// The demo, as the shell loop opens it: the bundled demo profile in a real
// draft (core/session/demo-session.js), and with `edits` staged in it, so the
// review and leaving with edits not exported can be looked at.
/**
 * @param {import("../core/session/types.js").PanelShell} shell
 * @param {Exclude<import("../contracts/edits.js").PanelEdit, {type: "reviewPortableProfile" | "validateMacro"}>[]} [edits]
 */
function demoModel(shell, edits = []) {
    const {openDemo, panelState} = require("../core/session/demo-session");
    /** @type {import("../core/session/types.js").PanelSession} */
    const session = {service: {portable: null, snapshot: () => ({connected: false, busy: false, devices: []})}, shell};
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
// off for now. ?shell=live shows it; ?shell=live-auto the same keyboard in Live
// (`mode` 1), waiting to save the edit by itself; ?shell=live-stopped one that
// stopped saving (firmware D-F34, `stopped`), with Restart; ?shell=live-held
// one holding Ark's next edit until a key and a modifier are let go (`held`),
// with Cancel edit. ?shell=apply-stopped is a keyboard in Apply that stopped
// saving (`stopped` without `live`), under a draft holding one edit.
// What the keyboard says of its own saving: nothing pending, its master half
// stopped when `stopped`.
/** @param {boolean} stopped @returns {import("../core/session/types.js").LiveKeyboardStatus} */
const keyboardStatus = (stopped) => ({saving: false, autoSaving: false, savedByKeyboard: false, saveFailed: false, saveError: 0, lastSaveTransaction: 0,
    adjustmentPending: false, storagePaused: false, slaveStoragePaused: false, slaveRefused: false, modeNotStored: false,
    stopped, slaveStopped: false, quietMs: 3000});

/** @param {import("../core/session/types.js").PanelShell} [shell] @param {{live?: boolean, mode?: number, stopped?: boolean, held?: boolean, apply?: import("../contracts/model.js").ApplyView}} [options] */
function buildModel(shell = WEB_SHELL, {live = false, mode = 2, stopped = false, held = false, apply} = {}) {
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
            runtime: null, live: {mode, session: 0x5e550001, revision: 1, savedGeneration: 42, savedOrigin: 0, unsaved: true, converged: true, working: bytes, saved, defaults: saved,
                keyboard: keyboardStatus(stopped)}};
    }
    const session = new ProfileDraftSession(/** @type {any} */ (liveSnapshot || snapshot), deviceId, capabilities);
    if (stopped && !live) {
        // What the look between edits would have read of it.
        const edit = {...DEMO_EDIT, draftId: session.id, draftRevision: session.revision};
        session.stage(edit);
        session.applyKeyboard = keyboardStatus(true);
    }
    /** @type {import("../core/session/types.js").PanelDeviceState} */
    const state = {
        selectedDeviceId: deviceId,
        connected: true,
        busy: held,
        ...(held ? {phase: PHASE.LIVE_EDIT, liveWaiting: {kind: /** @type {const} */ ("edit"), reasons: 1 | 1 << 6, cancelling: false}} : {}),
        capabilities,
        status: {committedGeneration: 42, committedDigest: 0x9ac31b70, activeGeneration: 42, slaveGeneration: 42},
        devices: [
            {id: deviceId, label: "Charybdis 4x6 · preview", manufacturer: "Bastard Keyboards", product: "Charybdis 4x6"},
            ...(process.argv.includes("--multiple") ? [{id: "preview-second", label: "Charybdis 4x6 · second", manufacturer: "Bastard Keyboards", product: "Charybdis 4x6"}] : []),
        ],
        baseRgb: {state: "read", effectId: 1, brightness: 180, hue: 140, saturation: 210, speed: 60},
        // No name of its own: the keyboard reports its built-in one.
        storedKeyboardName: "",
        // How edits reach it, stored on the keyboard: Apply here, Live + review with `live`.
        editMode: {mode: live ? mode : 0, counter: 1, slaveMode: live ? mode : 0, slaveCounter: 1, slaveKnown: true, conflict: false, agreed: true},
        runtime: live ? {combos: {master: true, override: false}, behaviours: {master: true, override: true},
            live: {defaultDpi: 1200, snipingDpi: 400, rgbMode: 1, rgbColor: 0, defaultLayers: 1, keymapOptions: 0}} : null,
        liveApply: apply || null,
    };
    // The shell's own model builder, so the preview cannot drift from it. The
    // layer editor is open so Rename & Reorder has something to show.
    const panel = {service: {portable: null}, shell, draft: session, portableLayers: startLayerEdit(snapshot, session.revision)};
    const model = buildPanelModel(panel, state);
    return model;
}

// `apply-cut-short`: the real Apply against the test fixtures' writable
// keyboard, which restarts (its connection lost) while the slave half takes
// its copy. What the bar shows is that Apply's view, and the notice is the
// sentence its failure carries, as the panel loop would say it.
async function cutShortApply() {
    const {fixture} = require("../tests/fixtures/portable-restore");
    const {liveLinkError, LIVE_LINK_ERROR_CODES} = require("../core/transport/device-adapter");
    const f = fixture();
    f.keyboard.faults.stallCommit = true;
    f.keyboard.faults.beforeRequest = (/** @type {Buffer} */ request, /** @type {{events: string[], faults: {disconnected?: boolean}}} */ keyboard) => {
        if (!keyboard.events.includes("commit") || request[0] !== 8) return;
        keyboard.faults.disconnected = true;
        throw liveLinkError(LIVE_LINK_ERROR_CODES.DISCONNECTED, "The keyboard was disconnected.", {deviceId: "preview"});
    };
    /** @type {import("../contracts/model.js").ApplyView | undefined} */
    let view;
    f.options.onApplyProgress = (/** @type {import("../contracts/model.js").ApplyView} */ applied) => {view = applied;};
    f.options.saveRecovery = async () => "recovery-2026-10-24T09-12-00-000Z-before-apply-charybdis.charybdis.json";
    const failure = await f.restore().then(() => {throw new Error("the preview's Apply was meant to be cut short");}, (/** @type {Error} */ error) => error);
    return {view: /** @type {import("../contracts/model.js").ApplyView} */ (view), notice: failure.message};
}

// `--device` renders the interface against the keyboard that is plugged in,
// read-only, the way the shell builds its model. Fixture data cannot show what a
// real profile does to a surface — every naming inconsistency found so far came
// from looking at this.
async function deviceModel() {
    const {ProfileDeviceService} = require("../core/session/profile-device-service");
    const {NodeHidDeviceAdapter} = require("../core/transport/node-hid-adapter");
    const service = new ProfileDeviceService({adapter: new NodeHidDeviceAdapter(), onChange: () => {}});
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
        // The page's shell, keeping no recovery copies: the fixture's are not this keyboard's.
        const panel = {service, shell: {panel: () => ({...OFFERED, recoveries: []})}};
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
const previewDir = path.join(__dirname, "..", "preview");
const macroShell = require("./build-web").bundle("core", {macroShell: "scripts/preview-macro-shell.mjs"}, previewDir,
    {inject: [path.join(__dirname, "..", "web", "buffer.mjs")]});
Promise.all([model, webShells(), macroShell, cutShortApply()]).then(([model, shells, macroShell, cutShort]) => {
fs.mkdirSync(path.join(__dirname, "..", "preview"), {recursive: true});
fs.writeFileSync(path.join(__dirname, "..", "preview", "model.json"), JSON.stringify(model));
for (const [name, shell] of Object.entries(shells)) {
    // A shell model may carry the notice its publish brings (`notice`, `failed`).
    if (name === "apply-cut-short") {
        fs.writeFileSync(path.join(__dirname, "..", "preview", `model-${name}.json`), JSON.stringify({model: buildModel(shell, {apply: cutShort.view}), notice: cutShort.notice, failed: true}));
        continue;
    }
    const web = name === "live" ? buildModel(shell, {live: true}) : name === "live-auto" ? buildModel(shell, {live: true, mode: 1}) : name === "live-stopped" ? buildModel(shell, {live: true, stopped: true}) : name === "live-held" ? buildModel(shell, {live: true, held: true}) : name === "apply-stopped" ? buildModel(shell, {stopped: true}) : name === "demo" ? demoModel(shell) : name === "demo-edited" ? demoModel(shell, [DEMO_EDIT]) : emptyModel(shell);
    fs.writeFileSync(path.join(__dirname, "..", "preview", `model-${name}.json`), JSON.stringify(web));
}
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Charybdis Ark — preview</title>
<link rel="stylesheet" href="../webview/styles.css?built=${Date.now()}">
<script>
// Stand in for the web shell: answer the panel's "ready" with one fixture
// model, exactly as the shell answers it after reading a keyboard, turn the
// theme toggle, and log every edit the panel posts back. ?shell=none has no
// keyboard and ?shell=unsupported no WebHID; Explore a demo opens
// ?shell=demo's model, the bundled demo (demo-edited has an edit staged).
// ?shell=apply-cut-short is an Apply the keyboard's restart cut short.
// ?theme=light starts in the light theme.
const posted = [];
let model = null, wanted = false, said = null;
const publish = () => {
    if (!model || !wanted) return;
    window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model, ...(said || {})}}));
    said = null;
};
window.acquirePanelApi = () => ({
    postMessage: (message) => {
        posted.push(message);
        console.log("posted", JSON.stringify(message));
        if (message.type === "validateMacro") Promise.all([import("./${macroShell.macroShell}"), import("../webview/store.mjs")])
            .then(([shell, store]) => window.dispatchEvent(new MessageEvent("message", {data: shell.inspect(message, store.getModel())})));
        if (message.type === "ready" || message.type === "refresh") { wanted = true; publish(); }
        if (message.type === "setTheme" && model?.shell) { model.shell.theme = message.theme; publish(); }
        if (message.type === "openDemo") fetch("./model-demo.json").then((response) => response.json()).then((loaded) => { model = loaded; publish(); });
    },
    getState: () => undefined, setState: () => {},
});
window.__posted = posted;
const shell = new URLSearchParams(location.search).get("shell");
const theme = new URLSearchParams(location.search).get("theme");
// ?shell=apply-cut-short also says the notice that model's publish brings.
fetch(shell ? "./model-" + shell + ".json" : "./model.json").then((response) => response.json()).then((loaded) => {
    if (loaded.model) { said = {notice: loaded.notice, failed: loaded.failed}; model = loaded.model; } else model = loaded;
    if (theme && model.shell) model.shell.theme = theme;
    publish();
});
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
console.log("layers", model.layers.length,
    "· behaviours", model.keyBehaviors.length,
    "· combos", model.combos.length,
    "· pd slots", model.pdModes.length,
    "· macros", model.macros.length,
    "· settings sections", model.configDefaults.length,
    "· rgb layer rows", model.rgb.layerColors?.length);
console.log("written preview/index.html");
}).catch(/** @param {unknown} error */ (error) => {
    const message = error && typeof error === "object" && "message" in error ? error.message : undefined;
    console.error(String(message || error));
    process.exit(1);
});
