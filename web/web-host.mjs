// @ts-check
// The browser host: in a page, what extension.js does in VS Code. It runs the
// shared host loop (core/session/panel-loop.js) over WebHID and hands the
// panel what a browser has — Chrome's keyboard picker, IndexedDB for recovery
// copies, the file chooser, downloads, and the page itself for progress and
// errors. web/page.mjs starts it with the page's own globals; everything it
// touches comes in through `env`, so it can be started with stand-ins.

import {closingLoses, demoUnsaved, FILE_MAX_BYTES, openPanelLoop, WebHidDeviceAdapter, writingProfile} from "./core.mjs";
import {connectPanel} from "./panel-channel.mjs";
import {nativePopups} from "./native-popups.mjs";
import {openRecoveries} from "./recoveries.mjs";
import {workerSleep} from "./sleep.mjs";

// What the panel says about connecting in a browser (model.host.words).
export const WEB_WORDS = Object.freeze({
    noKeyboard: "No keyboard is connected. Choose keyboard to connect one.",
    connectHint: "Plug in your Charybdis, then pick it in Chrome's list with Choose keyboard.",
    noneFound: "Chrome has no Charybdis this page may open yet. Choose keyboard and pick yours.",
});

// Why a tab cannot reach a keyboard at all (model.host.blocked). `demo` says
// the demo is still offered there: it needs no keyboard. A tab waiting on
// another does not offer it, since it takes the keyboard over when that one
// closes.
export const BLOCKED = Object.freeze({
    unsupported: Object.freeze({title: "Ark needs Chrome or Edge",
        detail: "Ark talks to the keyboard over WebHID, which only Chrome and Edge have, and only on a page served over HTTPS. Open this page there to edit your keyboard, or explore the demo here.",
        demo: true}),
    otherTab: Object.freeze({title: "Ark is open in another tab",
        detail: "One tab holds the keyboard at a time. Keep working in the other Ark tab, or close it: this tab takes over when it does."}),
});

// Both hosts use the portable document's byte ceiling.
export const PROFILE_FILE_LIMIT = FILE_MAX_BYTES;
export const THEME_KEY = "charybdis-ark.theme";
export const COMPILED_DEFAULTS_KEY = "charybdis-ark.compiled-defaults";
const LOCK = "charybdis-ark.keyboard";

// A saved choice wins; otherwise the system's setting.
/** @param {string | null | undefined} saved @param {boolean} prefersLight @returns {"light" | "dark"} */
export function initialTheme(saved, prefersLight) {
    return saved === "light" || saved === "dark" ? saved : prefersLight ? "light" : "dark";
}

// Whether leaving the page would lose something: unapplied edits (in the
// demo, edits not exported since), edits in Live + review not saved (in Live
// the keyboard keeps and saves them, so only an edit on its way counts), or an
// Apply, a Save (or a restore) part way through.
/** @param {import("../core/session/types.js").PanelSession & {service: {phase?: import("../contracts/model.js").PhaseId}}} session */
export function leaving(session) {
    const edits = session.demo ? demoUnsaved(session) : closingLoses(session);
    return Boolean(edits || writingProfile(session));
}

// A chosen profile file as the loop takes it, refused when it is too large.
/** @param {Pick<File, "size" | "text" | "name"> | undefined} file */
export async function readProfileFile(file) {
    if (!file) return undefined;
    if (file.size > PROFILE_FILE_LIMIT) throw new Error("This profile file is too large.");
    return {text: await file.text(), name: file.name};
}

/** @param {import("./types.js").WebEnvironment} env */
export function startWebHost(env) {
    const {hid, locks, storage, indexedDB, localStorage, matchMedia, document, window, worker, build} = env;
    const recoveries = openRecoveries(indexedDB);
    const adapter = new WebHidDeviceAdapter({hid});
    /** @type {import("../contracts/model.js").HostPanel["blocked"]} */
    let blocked = hid ? null : BLOCKED.unsupported;
    let theme = initialTheme(safely(() => localStorage?.getItem(THEME_KEY)), Boolean(matchMedia?.("(prefers-color-scheme: light)")?.matches));
    /** @type {import("../contracts/model.js").RecoveryCopy[]} */
    let recoveryList = [];
    /** @type {string | null} */
    let progress = null;
    /** @type {Promise<(Error & {code?: string}) | null> | undefined} */
    let picking;
    /** @type {ReturnType<typeof readProfileFile> | undefined} */
    let choosing;
    document.documentElement.dataset.theme = theme;

    /** @type {import("../core/session/types.js").LoopHost} */
    const host = {
        post: (message) => panel.post(message),
        progress: async (title, work) => {
            progress = title;
            loop.publish();
            try {return await work();}
            finally {progress = null;}
        },
        saveRecovery: async (copy) => {
            const name = await recoveries.save(copy);
            recoveryList = await recoveries.list();
            return `${name}, kept in this browser (Backups)`;
        },
        chooseProfile: () => {
            const chosen = choosing || Promise.resolve(undefined);
            choosing = undefined;
            return chosen;
        },
        saveExport: async (file) => {
            download(document, window, file.fileName, file.text);
            return `${file.fileName} in your downloads`;
        },
        words: WEB_WORDS,
        panel: () => ({chooseKeyboard: Boolean(hid) && !blocked, blocked, theme, recoveries: recoveryList, build, progress}),
    };

    const loop = openPanelLoop(host, {adapter, sleep: workerSleep(worker), compiledDefaults: compiledDefaultsStore(localStorage)});
    // A live keyboard's own saves and key adjustments show up between edits,
    // looked for only while the page can hear the answer (native-popups.mjs).
    loop.watch({paused: nativePopups(document).paused});
    const panel = connectPanel({receive, gesture, target: window});

    // Chrome opens its picker and file chooser only inside the click, so they
    // start here, before the message reaches the loop; the loop then waits
    // for what was picked.
    /** @param {import("../contracts/messages.js").PanelRequest} message */
    function gesture(message) {
        if (message?.type === "chooseKeyboard" && hid && !blocked) {
            picking = adapter.requestDevice().then(() => null, (error) => error);
        }
        if (message?.type === "choosePortableProfile" || message?.type === "openDemoProfile") {
            choosing = chooseFile(document);
            choosing.catch(() => {});
        }
    }

    // One tab holds the keyboard: the first to take the lock. Any other waits
    // in line, and takes over when that one closes.
    const holding = !hid ? Promise.resolve(false) : !locks ? Promise.resolve(true) : new Promise((resolve) => {
        locks.request(LOCK, {ifAvailable: true}, (lock) => {
            resolve(Boolean(lock));
            return lock ? new Promise(() => {}) : undefined;
        });
    }).then((held) => {
        if (held) return true;
        blocked = BLOCKED.otherTab;
        locks?.request(LOCK, () => {
            blocked = null;
            void loop.handleMessage({type: "refresh"});
            return new Promise(() => {});
        });
        return false;
    });

    /** @param {import("../contracts/messages.js").PanelRequest} message */
    async function receive(message) {
        switch (message?.type) {
            case "setTheme":
                if (message.theme === "light" || message.theme === "dark") {
                    theme = message.theme;
                    document.documentElement.dataset.theme = theme;
                    safely(() => localStorage?.setItem(THEME_KEY, theme));
                }
                return loop.publish();
            case "downloadRecovery": {
                const copy = await recoveries.get(message.id).catch(() => undefined);
                if (copy) download(document, window, copy.name, copy.text);
                else loop.session.notice = "Failed: That recovery copy is no longer in this browser.";
                return loop.publish();
            }
            // A copy saved before an Apply opens as a backup file does: its
            // comparison with the keyboard first, then Use as draft.
            case "useRecovery": {
                const copy = await recoveries.get(message.id).catch(() => undefined);
                if (!copy) {
                    loop.session.notice = "Failed: That copy is no longer in this browser.";
                    return loop.publish();
                }
                const draft = loop.session.draft;
                return loop.handleMessage({type: "reviewPortableProfile", text: copy.text, name: copy.name, ...(draft ? {draftId: draft.id, draftRevision: draft.revision} : {})});
            }
            case "deleteRecovery": {
                await recoveries.delete(message.id).catch(() => {loop.session.notice = "Failed: That copy could not be deleted.";});
                recoveryList = await recoveries.list().catch(() => recoveryList);
                return loop.publish();
            }
            case "chooseKeyboard": {
                const failure = await picking;
                picking = undefined;
                if (failure === undefined) return loop.publish();
                if (failure) {
                    loop.session.notice = failure.code === "CANCELLED" ? "No keyboard was chosen." : `Failed: ${failure.message}`;
                    return loop.publish();
                }
                // The chosen keyboard lists first; select it by that, so the
                // read opens it even while another one is connected. Choosing
                // from the demo leaves it, as the panel asked; the read does that.
                await loop.session.service.enumerate();
                const chosen = loop.session.service.snapshot().devices[0]?.id;
                const leave = message.discardDemo === true ? {discardDemo: true} : {};
                return loop.handleMessage(chosen ? {type: "selectDevice", deviceId: chosen, ...leave} : {type: "refresh", ...leave});
            }
            case "forgetKeyboard": {
                const service = loop.session.service;
                if (service.snapshot().busy) {
                    loop.session.notice = "Wait for the keyboard to finish before disconnecting it.";
                    return loop.publish();
                }
                await service.disconnect();
                await adapter.forget();
                loop.session.notice = "Disconnected. This page will not open that keyboard again until you choose it.";
                return followAllowed();
            }
            case "ready": case "refresh": case "selectDevice":
                await holding;
                if (blocked) return loop.publish();
                return loop.handleMessage(message);
            default:
                return loop.handleMessage(message);
        }
    }

    // What the page shows follows what Chrome lets it open. Plugging in an
    // allowed keyboard, unplugging one or disconnecting one lists them again,
    // and with none open the first one left is connected: an allowed keyboard
    // is always either the connected one or in the selector. The demo stays
    // the demo; its selector still follows.
    let following = false;
    async function followAllowed() {
        const service = loop.session.service;
        if (following || blocked || !hid) return loop.publish();
        // A keyboard renamed by a save drops off and comes back under its new
        // name; the loop waits for that one (keyboard-reconnect.js) and must
        // not have another connected in its place.
        if (loop.session.reconnect) return loop.publish();
        // A running read or Apply lists the keyboards itself; look again after it.
        if (service.snapshot().busy) {
            setTimeout(() => void followAllowed(), 500);
            return;
        }
        following = true;
        try {
            await service.enumerate();
            const state = service.snapshot();
            if (!state.connected && state.devices.length && !loop.session.demo) return await loop.handleMessage({type: "refresh"});
            loop.publish();
        } catch {
            loop.publish();
        } finally {
            following = false;
        }
    }
    if (hid) {
        // After every listener on the event, so a keyboard that left has
        // already let go of its connection.
        /** @param {"connect" | "disconnect"} type */
        const follow = (type) => hid.addEventListener(type, () => setTimeout(() => void holding.then(followAllowed), 0));
        follow("connect");
        follow("disconnect");
    }

    window.addEventListener("beforeunload", (event) => {
        if (!leaving(loop.session)) return;
        event.preventDefault();
        event.returnValue = "";
    });
    if (hid) {
        // Ask Chrome not to clear this site's storage, recovery copies included,
        // when space runs low. It may decline; the copies are kept either way.
        storage?.persist?.().catch(() => {});
        recoveries.list().then((list) => {recoveryList = list;}, () => {});
    }
    return {loop, panel, api: panel.api};
}

// The keyboard firmware's compiled defaults, last verified, kept between
// visits so a connect need not download them again (profile-payload-reader.js
// checks them against the keyboard). A full or refused storage keeps nothing.
/** @param {Pick<Storage, 'getItem' | 'setItem'> | undefined} localStorage */
export function compiledDefaultsStore(localStorage) {
    return {
        get: () => safely(() => localStorage?.getItem(COMPILED_DEFAULTS_KEY)) ?? undefined,
        /** @param {string} value */
        set: (value) => {safely(() => localStorage?.setItem(COMPILED_DEFAULTS_KEY, value));},
    };
}

/** @template T @param {() => T} read @returns {T | undefined} */
function safely(read) {
    try {return read();} catch {return undefined;}
}

// Chrome's file chooser, opened from the click that asked for it.
/** @param {Document} document */
function chooseFile(document) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    /** @type {Promise<File | undefined>} */
    const chosen = new Promise((resolve) => {
        input.addEventListener("change", () => resolve(input.files?.[0]), {once: true});
        input.addEventListener("cancel", () => resolve(undefined), {once: true});
    });
    input.click();
    return chosen.then(readProfileFile);
}

/** @param {Document} document @param {import("./types.js").WebEnvironment["window"]} window @param {string} name @param {string} text */
function download(document, window, name, text) {
    const url = window.URL.createObjectURL(new window.Blob([text], {type: "application/json"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
}
