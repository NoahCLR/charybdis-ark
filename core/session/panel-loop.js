// @ts-check
"use strict";

// The loop the shell runs for one open panel: take a message the panel
// posted, route it, run it, publish the model, and turn a failure into the
// panel's notice. The web page runs it (web/web-shell.mjs), and so do the
// tests, with stand-in shells.
//
// A shell passes in only what a shell has, as plain functions on `shell`:
//
//   shell.post(message)             delivers a message to the panel (the catalog,
//                                   the model), in the order posted
//   shell.showError(text)           optional: hears each failure the panel's notice says
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
// core/README.md; there is no default) and `sleep(ms)` the wait between
// polls while reading and saving (the timer's when omitted; a browser tab passes
// one its throttling cannot slow). Tests may pass a ready-made `service` instead.
// `reconnect` tunes the wait for a renamed or lost keyboard to come back
// (keyboard-reconnect.js): its `sleep`, `now`, `waitMs` and `pollMs`.
//
// A shell calls `watch()` once its panel is open: between edits it looks at a
// live keyboard about once a second (live-watch.js), for the saves it makes
// by itself and the edits its own keys make; `close()` stops it.
//
// What the shell's browser says about keyboards, it hands over as verbs:
//
//   chose(picked, request)          its keyboard picker closed: `picked` is what
//                                   the adapter's requestDevice settled with,
//                                   `request` the panel's chooseKeyboard
//   forget(letGo)                   Disconnect: let go of the keyboard, then
//                                   `letGo()` takes back the page's permission
//                                   to open it, and the keyboards are followed
//   keyboardsChanged()              a keyboard the page may open came or went
//   reviewProfile({text, name})     a profile the shell holds (a recovery copy),
//                                   opened for review as Import opens a file
//
// A shell whose panel() says it is `blocked` reaches no keyboard, so
// keyboardsChanged() only publishes.
//
// What every model of a build starts from (model/profile-model.js
// panelCatalog) is posted once, as {type: "catalog"}, before the first model,
// and again after the panel says it is `ready`, since a panel that has loaded
// again has lost it, as has one that loaded only after it was posted. A shell
// that answers `ready` itself, without handleMessage, calls `ready()`. Each
// model then leaves the catalog's fields out and says what it lays over them
// (postedModel); the interface lays them back (webview/catalog.mjs).

/**
 * @typedef {import("./types.js").RunningPanelSession} Session
 * @typedef {import("./types.js").LoopShell} Shell
 * @typedef {import("../../contracts/messages.js").PanelRequest} Message
 */
const {panelControl} = require("./panel-control-registry");
const {ProfileDeviceService} = require("./profile-device-service");
const {buildPanelModel, panelRequest, routeMessage} = require("./panel-session");
const {followService} = require("./draft-follow");
const {panelCatalog} = require("../model/profile-model");
const {beginRead, boundDraft, closeEditors, endRead, takeOutbox, whilePanelBusy} = require("./panel-session-state");
const {awaitReconnect, endReconnect, expectLost} = require("./keyboard-reconnect");
const {draftControl, portableControl, readKeyboard} = require("./panel-controls");
const {liveEdit} = require("./live-edits");
const {watchLive} = require("./live-watch");
const {readFlashFigures} = require("./flash-pauses");
const {demoControl, demoExport, leaveDemo, panelState} = require("./demo-session");
const {macroInputStatus} = require("../model/macro-editor");
const {FILE_MAX_BYTES} = require("../model/portable-profile");
const {failureSentence, sayable} = require("../model/vocabulary");

// Reading a keyboard leaves the demo first (asking about unexported edits is
// the panel's, and a message that has not asked is refused).
/** @typedef {{sleep?: (ms: number) => Promise<void>, now?: () => number, waitMs?: number, pollMs?: number}} ReconnectTiming */
/** @param {Shell} shell @param {(import("./types.js").DeviceServiceOptions | (Partial<import("./types.js").DeviceServiceSettings> & {service: import("./types.js").ControlService})) & {reconnect?: ReconnectTiming}} options */
function openPanelLoop(shell, options) {
    /** @type {Session} */
    let session;
    const {service, reconnect: timing = {}, ...device} = /** @type {import("./types.js").DeviceServiceOptions & {service?: import("./types.js").ControlService, reconnect?: ReconnectTiming}} */ (options);
    const waiting = {timing: {sleep: device.sleep, ...timing}, running: /** @type {Promise<void> | undefined} */ (undefined)};
    /** @type {ReturnType<typeof watchLive> | undefined} */
    let watching;
    const allowed = {following: false, lookAgain: /** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined)};
    const loop = {
        publish: () => publish(session, shell),
        // A panel that has just loaded: the catalog, then the model.
        ready: () => {
            session.catalogPosted = false;
            publish(session, shell);
        },
        // A shell's own failure, said and published as the loop says its own.
        fail: /** @param {unknown} error */ (error) => fail(session, error, shell),
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
        /** @param {Promise<unknown>} picked @param {{discardDemo?: unknown}} [request] */
        chose: (picked, {discardDemo} = {}) => choseKeyboard(session, picked, discardDemo === true ? {discardDemo: true} : {}, shell, loop.handleMessage),
        /** @param {() => Promise<unknown>} letGo */
        forget: async (letGo) => {
            if (session.service.snapshot().busy) return fail(session, new Error("Wait for the keyboard to finish before disconnecting it."), shell);
            await session.service.disconnect();
            await letGo();
            session.notice = "Disconnected. This page will not open that keyboard again until you choose it.";
            return loop.keyboardsChanged();
        },
        keyboardsChanged: () => followAllowed(session, shell, allowed, loop.handleMessage),
        /** @param {{text: string, name?: string}} file */
        reviewProfile: ({text, name}) => {
            const draft = session.draft;
            return loop.handleMessage({type: "reviewPortableProfile", text, name, ...(draft ? {draftId: draft.id, draftRevision: draft.revision} : {})});
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
    followService(session, panelState(session));
    publish(session, shell);
}

/** @param {Session} session @param {Shell} shell */
function publish(session, shell) {
    const model = buildPanelModel(session, panelState(session));
    if (!session.catalogPosted) {
        session.catalogPosted = true;
        void shell.post({type: "catalog", catalog: panelCatalog()});
    }
    void shell.post({type: "model", model: postedModel(model), ...takeOutbox(session)});
}

// A model as it is posted: each field the catalog holds left out, and what
// the model lays over it in `catalogOverlay`, so a publish carries only what
// this profile names. A field that does not start from the catalog's is
// posted whole.
/** @param {import("../../contracts/panel.js").PublishedModel} model @returns {import("../../contracts/panel.js").PostedModel} */
function postedModel(model) {
    const catalog = panelCatalog();
    /** @type {Record<string, unknown>} */
    const posted = {...model};
    /** @type {Record<string, unknown>} */
    const overlay = {};
    for (const field of /** @type {import("../../contracts/panel.js").CatalogField[]} */ (Object.keys(catalog))) {
        const laid = overlayOf(model[field], catalog[field]);
        if (laid === undefined) continue;
        delete posted[field];
        if (laid) overlay[field] = laid;
    }
    return /** @type {import("../../contracts/panel.js").PostedModel} */ ({...posted, catalogOverlay: overlay});
}

// What `value` lays over the catalog's `base`, with which it shares every
// object it leaves alone (profile-model.js): an array's entries that differ, by
// index, or a record's keys whose value differs; null for nothing, undefined
// when it does not start from `base` at all (an array shorter than it, a
// record without one of its keys, anything else).
/** @param {unknown} value @param {unknown} base @returns {[number, unknown][] | Record<string, unknown> | null | undefined} */
function overlayOf(value, base) {
    if (value === base) return null;
    if (Array.isArray(base)) {
        if (!Array.isArray(value) || value.length < base.length) return undefined;
        /** @type {[number, unknown][]} */
        const laid = [];
        value.forEach((entry, index) => {if (index >= base.length || entry !== base[index]) laid.push([index, entry]);});
        return laid.length ? laid : null;
    }
    if (!isRecord(base) || !isRecord(value) || Object.keys(base).some((key) => !Object.hasOwn(value, key))) return undefined;
    const laid = Object.fromEntries(Object.entries(value).filter(([key, entry]) => !Object.hasOwn(base, key) || entry !== base[key]));
    return Object.keys(laid).length ? laid : null;
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

// Edit/control paths publish, including the ones that decline or fail:
// the webview waits on that reply — a combo builder closes when its edit is
// accepted and stays open when it is refused — and a refusal reaches the panel
// as a notice rather than as silence.
/** @param {Session} session @param {Message | null | undefined} message @param {Shell} shell */
async function handleMessage(session, message, shell) {
    // A panel that says it is ready has loaded: its answer brings the catalog.
    if (message?.type === "ready") session.catalogPosted = false;
    if (message && panelControl(message.type)?.action === "validateMacro") {
        const inspection = /** @type {Extract<Message, {type: "validateMacro"}>} */ (message);
        /** @type {Extract<import("../../contracts/messages.js").PanelResponse, {type: "macroValidation"}>} */
        const reply = {type: "macroValidation", keycode: inspection.keycode, payload: inspection.payload,
            requestId: inspection.requestId, draftId: message.draftId, draftRevision: message.draftRevision, validation: {error: "", code: ""}};
        try {
            const draft = boundDraft(session, panelState(session), message, "Read the keyboard and wait for its current operation before editing this macro.");
            reply.validation = macroInputStatus(draft.current, inspection, draft.capabilities);
        } catch (error) {
            reply.validation = {error: failureSentence(error), code: /** @type {import("./types.js").OperationFailure} */ (error).code || "MACRO_EDIT_CONFLICT"};
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
        else if (route === "read") {
            await connectAndRead(session, message?.type === "selectDevice" ? message.deviceId : undefined, shell);
            if (message?.type === "refresh" && message.flashPauses) await diagnose(session, shell);
        }
        else if (route === "diagnose") await diagnose(session, shell);
        // A staged edit, and even an unrecognised message, is answered, so the
        // panel is never left waiting on a reply.
        else publish(session, shell);
    } catch (error) {
        fail(session, error, shell);
    }
}

// A failure as the panel's notice, published. The panel says it: that is
// where someone looks when it seems stuck. It reads as the sentence the
// failure says when Ark wrote one for a person (failureSentence, vocabulary.js);
// its code (OperationFailure.code) is for the code that handles it, and a
// fault's own text goes to the diagnostics instead. A request refused while
// the keyboard holds an edit for released keys is no failure: its words say
// what to do (live-edits.js). An Apply or Save cut short starts with its
// verdict (interruption.js), which says what happened better than "Failed".
/** @param {Session} session @param {unknown} error @param {Shell} shell */
function fail(session, error, shell) {
    const text = failureSentence(error);
    keepFault(session, error);
    shell.showError?.(text);
    const held = /** @type {{code?: string}} */ (error)?.code === "LIVE_EDIT_HELD";
    const verdict = /** @type {{verdict?: unknown}} */ (error)?.verdict;
    session.notice = held || (typeof verdict === "string" && verdict && text.startsWith(verdict)) ? text : `Failed: ${text}`;
    session.noticeFailed = !held;
    publish(session, shell);
}

// The first fault in a failure or what it carries, kept in the diagnostics
// (the device service's) for whoever looks into it.
/** @param {Session} session @param {unknown} error */
function keepFault(session, error) {
    let cause = error;
    for (let depth = 0; cause && depth < 8 && sayable(cause); depth++) cause = /** @type {{cause?: unknown}} */ (cause).cause;
    if (!cause || sayable(cause)) return;
    const {code, name, message} = /** @type {{code?: unknown, name?: unknown, message?: unknown}} */ (typeof cause === "object" ? cause : {});
    const kind = [code, name].find(value => typeof value === "string" && value) || "Failure";
    /** @type {{addDiagnostic?: (text: string) => void}} */ (session.service).addDiagnostic?.(`${kind}: ${typeof message === "string" && message || String(cause)}`);
}

// Each half's flash pauses, published as each read lands (flash-pauses.js).
/** @param {Session} session @param {Shell} shell */
async function diagnose(session, shell) {
    const sleep = session.service.sleep;
    if (!await readFlashFigures(session, {publish: () => publish(session, shell), ...(sleep ? {sleep} : {})})) publish(session, shell);
}

// Chrome's picker allowed a keyboard: it lists first, so it is selected by
// that and the read opens it even while another one is connected. Choosing
// from the demo leaves it, as the panel asked; the read does that. Listing
// fails while a read or Apply holds the keyboard, and says so.
/** @param {Session} session @param {Promise<unknown>} picked @param {{discardDemo?: true}} leave @param {Shell} shell @param {(message: Message) => Promise<void>} handle */
async function choseKeyboard(session, picked, leave, shell, handle) {
    try {await picked;}
    catch (error) {
        if (/** @type {{code?: unknown}} */ (error)?.code !== "CANCELLED") return fail(session, error, shell);
        session.notice = "No keyboard was chosen.";
        return publish(session, shell);
    }
    try {await session.service.enumerate();}
    catch (error) {return fail(session, error, shell);}
    const chosen = session.service.snapshot().devices[0]?.id;
    return handle(chosen ? {type: "selectDevice", deviceId: chosen, ...leave} : {type: "refresh", ...leave});
}

// What the page shows follows the keyboards it may open. Plugging in an
// allowed keyboard, unplugging one or disconnecting one lists them again,
// and with none open the first one left is connected: an allowed keyboard
// is always either the connected one or in the selector. The demo stays
// the demo; its selector still follows.
/** @param {Session} session @param {Shell} shell @param {{following: boolean, lookAgain: ReturnType<typeof setTimeout> | undefined}} allowed @param {(message: Message) => Promise<void>} handle @returns {Promise<void>} */
async function followAllowed(session, shell, allowed, handle) {
    const service = session.service;
    if (allowed.following || shell.panel?.().blocked) return publish(session, shell);
    // A keyboard renamed by a save drops off and comes back under its new
    // name; the loop waits for that one (keyboard-reconnect.js) and must
    // not have another connected in its place.
    if (session.reconnect) return publish(session, shell);
    // A running read or Apply lists the keyboards itself; look again after
    // it, once however many keyboards came and went meanwhile.
    if (service.snapshot().busy) {
        allowed.lookAgain ??= setTimeout(() => {
            allowed.lookAgain = undefined;
            void followAllowed(session, shell, allowed, handle);
        }, 500);
        return;
    }
    allowed.following = true;
    try {
        await service.enumerate();
        const state = service.snapshot();
        if (!state.connected && state.devices.length && !session.demo) return await handle({type: "refresh"});
        publish(session, shell);
    } catch {
        publish(session, shell);
    } finally {
        allowed.following = false;
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
        followService(session, panelState(session));
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
// (a download on the web page).
/** @param {Session} session @param {import("../../contracts/messages.js").PortableControl} message @param {Shell} shell */
async function portableMessage(session, message, shell) {
    try {
        await controlOperation(session, message, async () => {
            if (panelControl(message.type)?.action === "export" && session.demo) {
                const {snapshot, saved} = demoExport(/** @type {Session & import("./types.js").ActiveDemoSession} */ (session));
                const where = await shell.saveExport(exportedProfile(snapshot, new Date(), "charybdis-demo"));
                if (where) {
                    saved();
                    session.notice = `Demo profile exported to ${where}. Import it on your keyboard to review and save it.`;
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

module.exports = {exportedProfile, openPanelLoop, postedModel};
