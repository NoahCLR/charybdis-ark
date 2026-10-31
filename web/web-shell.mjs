// @ts-check
// The web shell, Ark's one shell (D-L71). It runs the shared panel loop
// (core/session/panel-loop.js) over WebHID and hands the panel what a browser
// has — Chrome's keyboard picker, IndexedDB for recovery copies, the file
// chooser, downloads, and the page itself for progress and errors. web/page.mjs starts it with the page's own globals; everything it
// touches comes in through `env`, so it can be started with stand-ins.

import {FILE_MAX_BYTES, FILE_TOO_LARGE, openPanelLoop, WebHidDeviceAdapter} from "./core.mjs";
import {connectPanel} from "./panel-channel.mjs";
import {nativePopups} from "./native-popups.mjs";
import {openRecoveries} from "./recoveries.mjs";
import {workerSleep} from "./sleep.mjs";

// Why a tab cannot reach a keyboard at all (model.shell.blocked). `demo` says
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

// What the page says when the panel's own file did not load (web/page.mjs),
// in place of a blank page. Text goes in as text, never as markup.
export const LOAD_FAILED = Object.freeze({title: "Ark did not finish loading",
    detail: "Part of the page could not be loaded. Reload the page to try again."});
/** @param {Pick<Document, "createElement">} document @param {Pick<Element, "replaceChildren">} root */
export function showLoadFailure(document, root) {
    const notice = document.createElement("main"), title = document.createElement("h1"), detail = document.createElement("p");
    notice.className = "load-failure";
    title.textContent = LOAD_FAILED.title;
    detail.textContent = LOAD_FAILED.detail;
    notice.append(title, detail);
    root.replaceChildren(notice);
    return notice;
}

const THEME_KEY = "charybdis-ark.theme";
export const COMPILED_DEFAULTS_KEY = "charybdis-ark.compiled-defaults";
const LOCK = "charybdis-ark.keyboard";
// What a recovery copy that has gone from the browser's storage is told.
const GONE = "That recovery copy is no longer in this browser.";

// A saved choice wins; otherwise the system's setting.
/** @param {string | null | undefined} saved @param {boolean} prefersLight @returns {"light" | "dark"} */
export function initialTheme(saved, prefersLight) {
    return saved === "light" || saved === "dark" ? saved : prefersLight ? "light" : "dark";
}

// A chosen profile file as the loop takes it, refused when it is too large.
/** @param {Pick<File, "size" | "text" | "name"> | undefined} file */
export async function readProfileFile(file) {
    if (!file) return undefined;
    // A chosen file is held to the backup's byte ceiling.
    if (file.size > FILE_MAX_BYTES) throw new Error(FILE_TOO_LARGE);
    return {text: await file.text(), name: file.name};
}

/** @param {import("./types.js").WebEnvironment} env */
export function startWebShell(env) {
    const {hid, locks, storage, indexedDB, localStorage, matchMedia, document, window, worker, build} = env;
    const recoveries = openRecoveries(indexedDB);
    const adapter = new WebHidDeviceAdapter({hid});
    /** @type {import("../contracts/model.js").ShellPanel["blocked"]} */
    let blocked = hid ? null : BLOCKED.unsupported;
    let theme = initialTheme(safely(() => localStorage?.getItem(THEME_KEY)), Boolean(matchMedia?.("(prefers-color-scheme: light)")?.matches));
    /** @type {import("../contracts/model.js").RecoveryCopy[]} */
    let recoveryList = [];
    /** @type {string | null} */
    let progress = null;
    /** @type {Promise<unknown> | undefined} */
    let picking;
    /** @type {ReturnType<typeof readProfileFile> | undefined} */
    let choosing;
    document.documentElement.dataset.theme = theme;

    /** @type {import("../core/session/types.js").LoopShell} */
    const shell = {
        post: (message) => panel.post(message),
        progress: async (title, work) => {
            progress = title;
            loop.publish();
            try {return await work();}
            finally {progress = null;}
        },
        saveRecovery: async (copy, about) => {
            const name = await recoveries.save(copy, about);
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
        panel: () => ({chooseKeyboard: Boolean(hid) && !blocked, blocked, theme, recoveries: recoveryList, build, progress}),
    };

    const loop = openPanelLoop(shell, {adapter, sleep: workerSleep(worker), compiledDefaults: compiledDefaultsStore(localStorage)});
    // A live keyboard's own saves and key adjustments show up between edits,
    // looked for only while the page can hear the answer (native-popups.mjs).
    loop.watch({paused: nativePopups(document).paused});
    // A message whose handling failed still gets its answer, a notice; the
    // fault itself goes to the console for whoever looks into it.
    const panel = connectPanel({receive, gesture, target: window, failed: (error) => {
        console.error(error);
        loop.fail(error);
    }});

    // Chrome opens its picker and file chooser only inside the click, so they
    // start here, before the message reaches the loop; the loop then waits
    // for what was picked.
    /** @param {import("../contracts/messages.js").PanelRequest} message */
    function gesture(message) {
        if (message?.type === "chooseKeyboard" && hid && !blocked) {
            picking = adapter.requestDevice();
            picking.catch(() => {});
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
                if (!copy) return loop.fail(new Error(GONE));
                download(document, window, copy.name, copy.text);
                return loop.publish();
            }
            // A recovery copy opens as a backup file does: its comparison
            // with the keyboard first, then Use as draft.
            case "useRecovery": {
                const copy = await recoveries.get(message.id).catch(() => undefined);
                if (!copy) return loop.fail(new Error(GONE));
                return loop.reviewProfile(copy);
            }
            case "deleteRecovery": {
                const deleted = await recoveries.delete(message.id).then(() => true, () => false);
                recoveryList = await recoveries.list().catch(() => recoveryList);
                return deleted ? loop.publish() : loop.fail(new Error("That recovery copy could not be deleted."));
            }
            case "chooseKeyboard": {
                const picked = picking;
                picking = undefined;
                // A tab that opened no picker has nothing to read.
                return picked ? loop.chose(picked, message) : loop.publish();
            }
            case "forgetKeyboard":
                return loop.forget(() => adapter.forget());
            case "ready": case "refresh": case "selectDevice":
                await holding;
                // A tab that reaches no keyboard reads none, but a panel that
                // has loaded still gets the catalog before its model.
                if (blocked) return message.type === "ready" ? loop.ready() : loop.publish();
                return loop.handleMessage(message);
            default:
                return loop.handleMessage(message);
        }
    }

    // What the page shows follows what Chrome lets it open: plugging in an
    // allowed keyboard or unplugging one lists them again (the loop's
    // keyboardsChanged).
    if (hid) {
        // After every listener on the event, so a keyboard that left has
        // already let go of its connection.
        /** @param {"connect" | "disconnect"} type */
        const follow = (type) => hid.addEventListener(type, () => setTimeout(() => void holding.then(loop.keyboardsChanged), 0));
        follow("connect");
        follow("disconnect");
    }

    window.addEventListener("beforeunload", (event) => {
        if (!loop.leaving()) return;
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
