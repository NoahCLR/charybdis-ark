// @ts-check
"use strict";

// The loop every host runs for one open panel: take a message the panel
// posted, route it, run it, publish the model, and turn a failure into the
// panel's notice. It used to live in extension.js; a second host copying it
// would drift from the first, so VS Code and any other host share this one.
//
// A host passes in only what a host has, as plain functions on `host`:
//
//   host.post(message)              delivers a message to the panel (the model)
//   host.showError(text)            optional: shows a failure outside the panel too
//   host.progress(title, run)       optional: runs `run` behind a progress indicator
//   host.saveRecovery(document)     writes a recovery copy, resolves to where it went
//   host.chooseProfile()            resolves to a chosen file ({text, name}, or its
//                                   text), or undefined when nothing was chosen;
//                                   Import and the demo's Open a profile file use it
//   host.saveExport(file)           saves an exported profile ({fileName, text});
//                                   resolves to where it went, or undefined if cancelled
//   host.words, host.panel()        optional: what the panel says and offers in this
//                                   host (`model.host`; see panel-session.js)
//
// `options` go to the device service: `adapter` is the device adapter (see
// core/README.md; the native one when omitted) and `sleep(ms)` the wait between
// polls while reading and saving (the timer's when omitted; a browser tab passes
// one its throttling cannot slow). Tests may pass a ready-made `service` instead.
// `reconnect` tunes the wait for a renamed keyboard to come back
// (keyboard-reconnect.js): its `sleep`, `now`, `waitMs` and `pollMs`.

/**
 * @typedef {import("./types.js").RunningPanelSession} Session
 * @typedef {import("./types.js").LoopHost} Host
 * @typedef {import("../../contracts/messages.js").PanelRequest} Message
 */
const {lightingControl} = require("./lighting-controls");
const {panelControl} = require("./panel-control-registry");
const {ProfileDeviceService} = require("./profile-device-service");
const {buildPanelModel, observeService, panelRequest, routeMessage} = require("./panel-session");
const {beginRead, boundDraft, closeEditors, endRead, takeOutbox, whilePanelBusy} = require("./panel-session-state");
const {awaitReconnect, endReconnect} = require("./keyboard-reconnect");
const {draftControl, portableControl, readKeyboard} = require("./panel-controls");
const {demoControl, demoExport, leaveDemo, panelState} = require("./demo-session");
const {macroInputStatus} = require("../model/macro-editor");
const {FILE_MAX_BYTES} = require("../model/portable-profile");

// Reading a keyboard leaves the demo first (asking about unexported edits is
// the panel's, and a message that has not asked is refused).
/** @typedef {{sleep?: (ms: number) => Promise<void>, now?: () => number, waitMs?: number, pollMs?: number}} ReconnectTiming */
/** @param {Host} host @param {import("./types.js").DeviceServiceOptions & {service?: import("./types.js").ControlService, reconnect?: ReconnectTiming}} [options] */
function openPanelLoop(host, options = {}) {
    /** @type {Session} */
    let session;
    const {service, reconnect: timing = {}, ...device} = options;
    let hostVisible = true, lightingVisible = false;
    const waiting = {timing: {sleep: device.sleep, ...timing}, running: /** @type {Promise<void> | undefined} */ (undefined)};
    const loop = {
        publish: () => publish(session, host),
        serviceChanged: () => serviceChanged(session, host),
        handleMessage: /** @param {unknown} posted */ async (posted) => {
            const message = panelRequest(posted);
            if (message && panelControl(message.type)?.route === "lighting") {
                try {
                    await lightingControl(session, /** @type {import('../../contracts/messages.js').ControlsOn<'lighting'> & Partial<import('../../contracts/edits.js').DraftIdentity>} */ (message), {surface: async visible => {
                        lightingVisible = visible;
                        await activeService.lightingLive?.surface(hostVisible && lightingVisible);
                    }});
                } catch (error) {session.notice = error instanceof Error ? error.message : String(error);}
                publish(session, host);return;
            }
            // Profile/device operations release temporary output before routing;
            // a completed edit never silently restarts a preview.
            if (message && message.type !== "ready" && panelControl(message.type)?.route !== "view" && panelControl(message.type)?.route !== "inspect") await activeService.lightingLive?.stop("The editor changed or another action started.");
            await handleMessage(session, message, host);
            followReconnect(session, host, waiting);
        },
        // Settles when a wait for a renamed keyboard ends, at once without one.
        reconnected: () => waiting.running || Promise.resolve(),
        setLightingVisible: (/** @type {boolean} */ visible) => {
            hostVisible = visible;return activeService.lightingLive?.surface(hostVisible && lightingVisible);
        },
        close: () => {
            if (session.reconnect) endReconnect(session, session.reconnect);
            return session.service.close();
        },
    };
    const activeService = service || new ProfileDeviceService({...device, onChange: loop.serviceChanged,
        onApplyProgress: apply => {
            void host.post({type: "applyProgress", apply, draftId: session.draft?.id, draftRevision: session.draft?.revision});
        },
        onReadProgress: read => {
            void host.post({type: "readProgress", read, draftId: session.draft?.id, draftRevision: session.draft?.revision});
        },
    });
    session = {service: activeService, notice: undefined, host};
    return {session, ...loop};
}

/** @param {Session} session @param {Host} host */
function serviceChanged(session, host) {
    observeService(session, panelState(session));
    publish(session, host);
}

/** @param {Session} session @param {Host} host */
function publish(session, host) {
    const model = buildPanelModel(session, panelState(session));
    void host.post({type: "model", model, ...takeOutbox(session)});
}

// Edit/control paths publish, including the ones that decline or fail:
// the webview waits on that reply — a combo builder closes when its edit is
// accepted and stays open when it is refused — and a refusal reaches the panel
// as a notice rather than as silence.
/** @param {Session} session @param {Message | null | undefined} message @param {Host} host */
async function handleMessage(session, message, host) {
    if (message && panelControl(message.type)?.action === "validateMacro") {
        const inspection = /** @type {Extract<Message, {type: "validateViaMacro"}>} */ (message);
        /** @type {Extract<import("../../contracts/messages.js").PanelResponse, {type: "macroValidation"}>} */
        const reply = {type: "macroValidation", keycode: inspection.keycode, payload: inspection.payload,
            requestId: inspection.requestId, draftId: message.draftId, draftRevision: message.draftRevision, validation: {error: "", code: ""}};
        try {
            const draft = boundDraft(session, panelState(session), message, "Read the keyboard and wait for its current operation before editing this macro.");
            reply.validation = macroInputStatus(draft.current, inspection, draft.capabilities);
        } catch (error) {
            reply.validation = {error: /** @type {import("./types.js").OperationFailure} */ (error).message, code: /** @type {import("./types.js").OperationFailure} */ (error).code || "MACRO_EDIT_CONFLICT"};
        }
        // Local inspection neither stages an edit nor emits a toast or HID.
        await host.post(reply);
        return;
    }
    // Reading or choosing a keyboard is the person's choice: a wait for a
    // renamed keyboard gives way to it.
    const route = message && panelControl(message.type)?.route;
    if (session.reconnect && (route === "read" || route === "host" && /Keyboard$/.test(message?.type || ""))) endReconnect(session, session.reconnect);
    try {
        if (session.demo && message && panelControl(message.type)?.demo === "leave" && !session.portableBusy) leaveDemo(session, /** @type {import("../../contracts/messages.js").DemoControl} */ (message));
        const route = routeMessage(session, message, panelState(session));
        if (route === "draft") await draftMessage(session, /** @type {import("../../contracts/messages.js").DraftControl & Partial<import("../../contracts/edits.js").DraftIdentity>} */ (message), host);
        else if (route === "demo") await demoMessage(session, /** @type {import("../../contracts/messages.js").DemoControl} */ (message), host);
        else if (route === "portable") await portableMessage(session, /** @type {import("../../contracts/messages.js").PortableControl} */ (message), host);
        else if (route === "read") await connectAndRead(session, message?.type === "selectDevice" ? message.deviceId : undefined, host);
        // A staged edit, and even an unrecognised message, is answered, so the
        // panel is never left waiting on a reply.
        else publish(session, host);
    } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        const failure = /** @type {import("./types.js").OperationFailure | null | undefined} */ (error);
        const code = failure?.code ? ` [${failure.code}]` : "";
        host.showError?.(text);
        // Put it in the panel too. A toast is easy to miss and disappears,
        // and the panel is where someone looks when it seems stuck.
        session.notice = `Failed${code}: ${text}`;
        publish(session, host);
    }
}

// After a save that renamed the keyboard, wait for it to come back under its
// new name and read it again (keyboard-reconnect.js), once at a time.
/** @param {Session} session @param {Host} host @param {{timing: ReconnectTiming, running: Promise<void> | undefined}} waiting */
function followReconnect(session, host, waiting) {
    const expected = session.reconnect;
    if (!expected || waiting.running) return;
    const read = /** @param {string} deviceId */ async (deviceId) => {
        if (deviceId !== session.service.snapshot().selectedDeviceId) closeEditors(session, {resetForms: true});
        beginRead(session);
        await connectAndRead(session, deviceId, host);
    };
    waiting.running = awaitReconnect(session, expected, {...waiting.timing, read, publish: () => publish(session, host)})
        .catch(() => {endReconnect(session, expected); publish(session, host);})
        .finally(() => {
            waiting.running = undefined;
            // A save during the wait may have renamed it again.
            if (session.reconnect && session.reconnect !== expected) followReconnect(session, host, waiting);
        });
}

// Connect, learn what the keyboard is, and read what it is running.
/** @param {Session} session @param {string | undefined} selectedDeviceId @param {Host} host */
async function connectAndRead(session, selectedDeviceId, host) {
    /** @type {boolean | undefined} */
    let ready;
    try {
        ready = await readKeyboard(session, selectedDeviceId, host);
    } finally {
        // Injected services need not emit notifications, and a failed read
        // may still have changed connection facts. Observe once at this
        // explicit operation boundary before projecting the reply.
        observeService(session, panelState(session));
        endRead(session, ready);
        publish(session, host);
    }
}

/** @param {Session} session @param {import("../../contracts/messages.js").DraftControl & Partial<import("../../contracts/edits.js").DraftIdentity>} message @param {Host} host */
async function draftMessage(session, message, host) {
    try {
        await controlOperation(session, message, () => draftControl(session, {...message, draftRevision: message.draftRevision ?? NaN}, host));
    } finally {publish(session, host);}
}

// Exporting is split: what to save is decided here, saving it is the host's
// (a file dialog in VS Code, a download on a web page).
/** @param {Session} session @param {import("../../contracts/messages.js").PortableControl} message @param {Host} host */
async function portableMessage(session, message, host) {
    try {
        await controlOperation(session, message, async () => {
            if (panelControl(message.type)?.action === "export" && session.demo) {
                const {snapshot, saved} = demoExport(/** @type {Session & import("./types.js").ActiveDemoSession} */ (session));
                const where = await host.saveExport(exportedProfile(snapshot, new Date(), "charybdis-demo"));
                if (where) {
                    saved();
                    session.notice = `Demo setup exported to ${where}. Import it on your keyboard to review and apply it.`;
                }
            } else if (panelControl(message.type)?.action === "export") {
                const file = exportedProfile(await session.service.readPortableProfile());
                const where = await host.saveExport(file);
                if (where) session.notice = "Complete keyboard profile exported to " + where;
            } else {
                await portableControl(session, message, host);
            }
        });
    } finally {publish(session, host);}
}

/** @template T @param {Session} session @param {Message} message @param {() => Promise<T>} work */
function controlOperation(session, message, work) {
    const phase = panelControl(message.type)?.phase;
    return phase === "panel" || phase === "apply" || phase === "restore" ? whilePanelBusy(session, work) : work();
}

// The demo's controls: open it, open a profile file in it, leave it.
/** @param {Session} session @param {import("../../contracts/messages.js").DemoControl} message @param {Host} host */
async function demoMessage(session, message, host) {
    try {
        await controlOperation(session, message, () => demoControl(session, message, host, session.service.snapshot()));
    } finally {publish(session, host);}
}

// What an exported profile file holds, and the name a host may suggest for it.
/** @param {Pick<import("../model/types.js").ProfileSnapshot, "document">} snapshot @param {Date} [now] @param {string} [stem] */
function exportedProfile(snapshot, now = new Date(), stem = "charybdis") {
    return {
        fileName: `${stem}-${now.toISOString().slice(0, 10)}.charybdis.json`,
        text: JSON.stringify(snapshot.document, null, 2) + "\n",
    };
}

module.exports = {exportedProfile, openPanelLoop, FILE_MAX_BYTES};
