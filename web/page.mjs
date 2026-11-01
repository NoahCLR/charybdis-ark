// @ts-check
// The web shell, started with the page's own globals. The build bundles
// this file and names the worker, the panel and the build it came from
// (scripts/build-web.js). It loads the panel itself, once the shell is running:
// the panel asks for acquirePanelApi() as it loads. On a phone it starts
// neither, and shows only a notice (web/phone.mjs).

import {isPhone, showPhoneNotice} from "./phone.mjs";
import {initialTheme, showLoadFailure, startWebShell} from "./web-shell.mjs";

/* global __ARK_VERSION__, __ARK_COMMIT__, __ARK_SLEEP_WORKER__, __ARK_PANEL__ */
const build = {version: __ARK_VERSION__, commit: __ARK_COMMIT__};
const matchMedia = globalThis.matchMedia?.bind(globalThis);

if (isPhone({matchMedia, screen: globalThis.screen})) {
    document.documentElement.dataset.theme = initialTheme(undefined, Boolean(matchMedia?.("(prefers-color-scheme: light)")?.matches));
    showPhoneNotice({document, root: /** @type {HTMLElement} */ (document.getElementById("root")), address: location.host, build});
} else {
    // WebHID exists only in a secure context (HTTPS or localhost).
    const hid = globalThis.isSecureContext ? navigator.hid : undefined;
    /** @type {import("./types.js").SleepWorker | undefined} */
    let worker;
    // The page requires Trusted Types (scripts/build-web.js POLICY): the one
    // script it starts by URL is this build's worker, and this policy passes
    // that URL alone.
    const workerUrl = new URL(__ARK_SLEEP_WORKER__, import.meta.url).href;
    /** @typedef {{createScriptURL: (url: string) => string}} ScriptPolicy */
    const scripts = /** @type {{trustedTypes?: {createPolicy: (name: string, rules: ScriptPolicy) => ScriptPolicy}}} */ (globalThis)
        .trustedTypes?.createPolicy("ark-worker", {createScriptURL: (url) => {
            if (url !== workerUrl) throw new TypeError(`Only the sleep worker starts by URL, not ${url}.`);
            return url;
        }});
    try {worker = new Worker(scripts ? scripts.createScriptURL(workerUrl) : workerUrl);} catch {worker = undefined;}

    const {api} = startWebShell({
        hid,
        locks: navigator.locks,
        storage: navigator.storage,
        indexedDB: globalThis.indexedDB,
        localStorage: (() => {try {return globalThis.localStorage;} catch {return undefined;}})(),
        matchMedia,
        document,
        window,
        worker,
        build,
    });
    window.acquirePanelApi = () => api;
    // A URL rather than a name, so the build leaves the panel its own file.
    // One that does not load says so rather than leaving the page blank.
    import(new URL(__ARK_PANEL__, import.meta.url).href).catch((error) => {
        console.error(error);
        showLoadFailure(document, /** @type {HTMLElement} */ (document.getElementById("root")));
    });
}
