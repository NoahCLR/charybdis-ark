// The browser host: in a page, what extension.js does in VS Code. It runs the
// shared host loop (core/session/panel-loop.js) over WebHID and hands the
// panel what a browser has — Chrome's keyboard picker, IndexedDB for recovery
// copies, the file chooser, downloads, and the page itself for progress and
// errors. web/page.mjs starts it with the page's own globals; everything it
// touches comes in through `env`, so it can be started with stand-ins.

import {openPanelLoop, WebHidDeviceAdapter} from "./core.mjs";
import {connectPanel} from "./panel-channel.mjs";
import {openRecoveries} from "./recoveries.mjs";
import {workerSleep} from "./sleep.mjs";

// What the panel says about connecting in a browser (model.host.words).
export const WEB_WORDS = Object.freeze({
    noKeyboard: "No keyboard is connected. Choose keyboard to connect one.",
    connectHint: "Plug in your Charybdis, then pick it in Chrome's list with Choose keyboard.",
    noneFound: "Chrome has no Charybdis this page may open yet. Choose keyboard and pick yours.",
});

// Why a tab cannot reach a keyboard at all (model.host.blocked).
export const BLOCKED = Object.freeze({
    unsupported: Object.freeze({title: "Ark needs Chrome or Edge",
        detail: "Ark talks to the keyboard over WebHID, which only Chrome and Edge have, and only on a page served over HTTPS. Open this page there to edit your keyboard."}),
    otherTab: Object.freeze({title: "Ark is open in another tab",
        detail: "One tab holds the keyboard at a time. Keep working in the other Ark tab, or close it: this tab takes over when it does."}),
});

// The same limit the extension sets on a chosen profile file.
export const PROFILE_FILE_LIMIT = 100000;
export const THEME_KEY = "charybdis-ark.theme";
const LOCK = "charybdis-ark.keyboard";

// A saved choice wins; otherwise the system's setting.
export function initialTheme(saved, prefersLight) {
    return saved === "light" || saved === "dark" ? saved : prefersLight ? "light" : "dark";
}

// Whether leaving the page would lose something: unapplied edits, or an
// Apply (or a restore) part way through.
export function leaving(session) {
    return Boolean(session.draft?.dirty || session.applyRunning || session.service?.phase === "restoring complete profile");
}

// A chosen profile file as the loop takes it, refused when it is too large.
export async function readProfileFile(file) {
    if (!file) return undefined;
    if (file.size > PROFILE_FILE_LIMIT) throw new Error("This profile file is too large.");
    return {text: await file.text(), name: file.name};
}

export function startWebHost(env) {
    const {hid, locks, storage, indexedDB, localStorage, matchMedia, document, window, worker, build} = env;
    const recoveries = openRecoveries(indexedDB);
    const adapter = new WebHidDeviceAdapter({hid});
    let blocked = hid ? null : BLOCKED.unsupported;
    let theme = initialTheme(safely(() => localStorage?.getItem(THEME_KEY)), Boolean(matchMedia?.("(prefers-color-scheme: light)")?.matches));
    let recoveryList = [], progress = null, picking, choosing;
    document.documentElement.dataset.theme = theme;

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
            return `${name}, kept in this browser (Profile & backups)`;
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

    const loop = openPanelLoop(host, {adapter, sleep: workerSleep(worker)});
    const panel = connectPanel({receive, gesture, target: window});

    // Chrome opens its picker and file chooser only inside the click, so they
    // start here, before the message reaches the loop; the loop then waits
    // for what was picked.
    function gesture(message) {
        if (message?.type === "chooseKeyboard" && hid && !blocked) {
            picking = adapter.requestDevice().then(() => null, (error) => error);
        }
        if (message?.type === "choosePortableProfile") {
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
        locks.request(LOCK, () => {
            blocked = null;
            void loop.handleMessage({type: "refresh"});
            return new Promise(() => {});
        });
        return false;
    });

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
            case "chooseKeyboard": {
                const failure = await picking;
                picking = undefined;
                if (failure === undefined) return loop.publish();
                if (failure) {
                    loop.session.notice = failure.code === "CANCELLED" ? "No keyboard was chosen." : `Failed: ${failure.message}`;
                    return loop.publish();
                }
                return loop.handleMessage({type: "refresh"});
            }
            case "ready": case "refresh": case "selectDevice":
                await holding;
                if (blocked) return loop.publish();
                return loop.handleMessage(message);
            default:
                return loop.handleMessage(message);
        }
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

function safely(read) {
    try {return read();} catch {return undefined;}
}

// Chrome's file chooser, opened from the click that asked for it.
function chooseFile(document) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    const chosen = new Promise((resolve) => {
        input.addEventListener("change", () => resolve(input.files?.[0]), {once: true});
        input.addEventListener("cancel", () => resolve(undefined), {once: true});
    });
    input.click();
    return chosen.then(readProfileFile);
}

function download(document, window, name, text) {
    const url = window.URL.createObjectURL(new window.Blob([text], {type: "application/json"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
}
