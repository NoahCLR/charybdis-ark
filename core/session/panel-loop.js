// @ts-check
"use strict";

// The loop every shell runs for one open panel: take a message the panel
// posted, route it, run it, publish the model, and turn a failure into the
// panel's notice. It used to live in extension.js; a second shell copying it
// would drift from the first, so VS Code and any other shell share this one.
//
// A shell passes in only what a shell has, as plain functions on `shell`:
//
//   shell.post(message)             delivers a message to the panel (the model)
//   shell.showError(text)           optional: shows a failure outside the panel too
//   shell.progress(title, run)      optional: runs `run` behind a progress indicator
//   shell.saveRecovery(document, about)
//                                   writes a recovery copy with what made it and the
//                                   keyboard's name ({cause, keyboard}; recovery-copy.js),
//                                   resolves to where it went
//   shell.chooseProfile()           resolves to a chosen file ({text, name}, or its
//                                   text), or undefined when nothing was chosen;
//                                   Import and the demo's Open a profile file use it
//   shell.saveExport(file)          saves an exported profile ({fileName, text});
//                                   resolves to where it went, or undefined if cancelled
//   shell.words, shell.panel()      optional: what the panel says and offers in this
//                                   shell (`model.shell`; see panel-session.js)
//
// `options` go to the device service: `adapter` is the device adapter (see
// core/README.md; the native one when omitted) and `sleep(ms)` the wait between
// polls while reading and saving (the timer's when omitted; a browser tab passes
// one its throttling cannot slow). Tests may pass a ready-made `service` instead.
// `reconnect` tunes the wait for a renamed or lost keyboard to come back
// (keyboard-reconnect.js): its `sleep`, `now`, `waitMs` and `pollMs`.
//
// A shell calls `watch()` once its panel is open: between edits it looks at a
// live keyboard about once a second (live-watch.js), for the saves it makes
// by itself and the edits its own keys make; `close()` stops it.

/**
 * @typedef {import("./types.js").RunningPanelSession} Session
 * @typedef {import("./types.js").LoopShell} Shell
 * @typedef {import("../../contracts/messages.js").PanelRequest} Message
 */
const {panelControl} = require("./panel-control-registry");
const {ProfileDeviceService} = require("./profile-device-service");
const {buildPanelModel, observeService, panelRequest, routeMessage} = require("./panel-session");
const {beginRead, boundDraft, closeEditors, endRead, takeOutbox, whilePanelBusy} = require("./panel-session-state");
const {awaitReconnect, endReconnect, expectLost} = require("./keyboard-reconnect");
const {draftControl, portableControl, readKeyboard} = require("./panel-controls");
const {liveEdit} = require("./live-edits");
const {watchLive} = require("./live-watch");
const {demoControl, demoExport, leaveDemo, panelState} = require("./demo-session");
const {macroInputStatus} = require("../model/macro-editor");
const {FILE_MAX_BYTES} = require("../model/portable-profile");

// Reading a keyboard leaves the demo first (asking about unexported edits is
// the panel's, and a message that has not asked is refused).
/** @typedef {{sleep?: (ms: number) => Promise<void>, now?: () => number, waitMs?: number, pollMs?: number}} ReconnectTiming */
/** @param {Shell} shell @param {import("./types.js").DeviceServiceOptions & {service?: import("./types.js").ControlService, reconnect?: ReconnectTiming}} [options] */
function openPanelLoop(shell, options = {}) {
    /** @type {Session} */
    let session;
    const {service, reconnect: timing = {}, ...device} = options;
    const waiting = {timing: {sleep: device.sleep, ...timing}, running: /** @type {Promise<void> | undefined} */ (undefined)};
    /** @type {ReturnType<typeof watchLive> | undefined} */
    let watching;
    const loop = {
        publish: () => publish(session, shell),
        serviceChanged: () => {
            // A keyboard lost unexpectedly is waited for and connected again.
            const lost = session.service.takeLost?.();
            if (lost) expectLost(session, lost, waiting.timing.now);
            serviceChanged(session, shell);
            followReconnect(session, shell, waiting);
        },
        handleMessage: /** @param {unknown} posted */ async (posted) => {
            await handleMessage(session, panelRequest(posted), shell);
            followReconnect(session, shell, waiting);
        },
        // Settles when a wait for a renamed keyboard ends, at once without one.
        reconnected: () => waiting.running || Promise.resolve(),
        watch: /** @param {{intervalMs?: number, paused?: () => boolean}} [options] */ (options = {}) => {
            watching ||= watchLive(session, {publish: () => publish(session, shell), sleep: device.sleep, ...options});
        },
        close: () => {
            if (session.reconnect) endReconnect(session, session.reconnect);
            void watching?.stop();
            watching = undefined;
            return session.service.close();
        },
    };
    const activeService = service || new ProfileDeviceService({...device, onChange: loop.serviceChanged,
        onApplyProgress: apply => {
            void shell.post({type: "applyProgress", apply, draftId: session.draft?.id, draftRevision: session.draft?.revision});
        },
        onReadProgress: read => {
            void shell.post({type: "readProgress", read, draftId: session.draft?.id, draftRevision: session.draft?.revision});
        },
    });
    session = {service: activeService, notice: undefined, shell};
    return {session, ...loop};
}

/** @param {Session} session @param {Shell} shell */
function serviceChanged(session, shell) {
    observeService(session, panelState(session));
    publish(session, shell);
}

/** @param {Session} session @param {Shell} shell */
function publish(session, shell) {
    const model = buildPanelModel(session, panelState(session));
    void shell.post({type: "model", model, ...takeOutbox(session)});
}

// Edit/control paths publish, including the ones that decline or fail:
// the webview waits on that reply — a combo builder closes when its edit is
// accepted and stays open when it is refused — and a refusal reaches the panel
// as a notice rather than as silence.
/** @param {Session} session @param {Message | null | undefined} message @param {Shell} shell */
async function handleMessage(session, message, shell) {
    if (message && panelControl(message.type)?.action === "validateMacro") {
        const inspection = /** @type {Extract<Message, {type: "validateMacro"}>} */ (message);
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
        await shell.post(reply);
        return;
    }
    // Reading or choosing a keyboard is the person's choice: a wait for a
    // renamed keyboard gives way to it.
    const route = message && panelControl(message.type)?.route;
    if (session.reconnect && (route === "read" || route === "shell" && /Keyboard$/.test(message?.type || ""))) endReconnect(session, session.reconnect);
    try {
        if (session.demo && message && panelControl(message.type)?.demo === "leave" && !session.portableBusy) leaveDemo(session, /** @type {import("../../contracts/messages.js").DemoControl} */ (message));
        const route = routeMessage(session, message, panelState(session));
        if (route === "draft") await draftMessage(session, /** @type {import("../../contracts/messages.js").DraftControl & Partial<import("../../contracts/edits.js").DraftIdentity>} */ (message), shell);
        else if (route === "live") {
            try {await whilePanelBusy(session, () => liveEdit(session, /** @type {import("./types.js").DraftEdit} */ (/** @type {unknown} */ (message))));}
            finally {publish(session, shell);}
        }
        else if (route === "demo") await demoMessage(session, /** @type {import("../../contracts/messages.js").DemoControl} */ (message), shell);
        else if (route === "portable") await portableMessage(session, /** @type {import("../../contracts/messages.js").PortableControl} */ (message), shell);
        else if (route === "read") await connectAndRead(session, message?.type === "selectDevice" ? message.deviceId : undefined, shell);
        // A staged edit, and even an unrecognised message, is answered, so the
        // panel is never left waiting on a reply.
        else publish(session, shell);
    } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        shell.showError?.(text);
        // Put it in the panel too. A toast is easy to miss and disappears,
        // and the panel is where someone looks when it seems stuck. It reads
        // as the sentence the failure says; its code (OperationFailure.code)
        // is for the code that handles it, not for the person.
        // A request refused while the keyboard holds an edit for released
        // keys is no failure: its words say what to do (live-edits.js).
        session.notice = /** @type {{code?: string}} */ (error)?.code === "LIVE_EDIT_HELD" ? text : `Failed: ${text}`;
        publish(session, shell);
    }
}

// After a save that renamed the keyboard, or after losing it, wait for it to
// come back and read it again (keyboard-reconnect.js), once at a time.
/** @param {Session} session @param {Shell} shell @param {{timing: ReconnectTiming, running: Promise<void> | undefined}} waiting */
function followReconnect(session, shell, waiting) {
    const expected = session.reconnect;
    if (!expected || waiting.running) return;
    const read = /** @param {string} deviceId */ async (deviceId) => {
        if (deviceId !== session.service.snapshot().selectedDeviceId) closeEditors(session, {resetForms: true});
        beginRead(session);
        return connectAndRead(session, deviceId, shell);
    };
    waiting.running = awaitReconnect(session, expected, {...waiting.timing, read, publish: () => publish(session, shell)})
        .catch(() => {endReconnect(session, expected); publish(session, shell);})
        .finally(() => {
            waiting.running = undefined;
            // A save during the wait may have renamed it again.
            if (session.reconnect && session.reconnect !== expected) followReconnect(session, shell, waiting);
        });
}

// Connect, learn what the keyboard is, and read what it is running; true
// when the keyboard is ready to edit after it.
/** @param {Session} session @param {string | undefined} selectedDeviceId @param {Shell} shell @returns {Promise<boolean>} */
async function connectAndRead(session, selectedDeviceId, shell) {
    /** @type {boolean | undefined} */
    let ready;
    try {
        ready = await readKeyboard(session, selectedDeviceId, shell);
    } finally {
        // Injected services need not emit notifications, and a failed read
        // may still have changed connection facts. Observe once at this
        // explicit operation boundary before projecting the reply.
        observeService(session, panelState(session));
        endRead(session, ready);
        publish(session, shell);
    }
    return Boolean(ready);
}

/** @param {Session} session @param {import("../../contracts/messages.js").DraftControl & Partial<import("../../contracts/edits.js").DraftIdentity>} message @param {Shell} shell */
async function draftMessage(session, message, shell) {
    try {
        await controlOperation(session, message, () => draftControl(session, {...message, draftRevision: message.draftRevision ?? NaN}, shell));
    } finally {publish(session, shell);}
}

// Exporting is split: what to save is decided here, saving it is the shell's
// (a file dialog in VS Code, a download on a web page).
/** @param {Session} session @param {import("../../contracts/messages.js").PortableControl} message @param {Shell} shell */
async function portableMessage(session, message, shell) {
    try {
        await controlOperation(session, message, async () => {
            if (panelControl(message.type)?.action === "export" && session.demo) {
                const {snapshot, saved} = demoExport(/** @type {Session & import("./types.js").ActiveDemoSession} */ (session));
                const where = await shell.saveExport(exportedProfile(snapshot, new Date(), "charybdis-demo"));
                if (where) {
                    saved();
                    session.notice = `Demo setup exported to ${where}. Import it on your keyboard to review and apply it.`;
                }
            } else if (panelControl(message.type)?.action === "export") {
                const file = exportedProfile(await session.service.readPortableProfile());
                const where = await shell.saveExport(file);
                if (where) session.notice = "Complete keyboard profile exported to " + where;
            } else {
                await portableControl(session, message, shell);
            }
        });
    } finally {publish(session, shell);}
}

/** @template T @param {Session} session @param {Message} message @param {() => Promise<T>} work */
function controlOperation(session, message, work) {
    const phase = panelControl(message.type)?.phase;
    return phase === "panel" || phase === "apply" || phase === "restore" ? whilePanelBusy(session, work) : work();
}

// The demo's controls: open it, open a profile file in it, leave it.
/** @param {Session} session @param {import("../../contracts/messages.js").DemoControl} message @param {Shell} shell */
async function demoMessage(session, message, shell) {
    try {
        await controlOperation(session, message, () => demoControl(session, message, shell, session.service.snapshot()));
    } finally {publish(session, shell);}
}

// What an exported profile file holds, and the name a shell may suggest for it.
/** @param {Pick<import("../model/types.js").ProfileSnapshot, "document">} snapshot @param {Date} [now] @param {string} [stem] */
function exportedProfile(snapshot, now = new Date(), stem = "charybdis") {
    return {
        fileName: `${stem}-${now.toISOString().slice(0, 10)}.charybdis.json`,
        text: JSON.stringify(snapshot.document, null, 2) + "\n",
    };
}

module.exports = {exportedProfile, openPanelLoop, FILE_MAX_BYTES};
