// The web page's host, started with the page's own globals. The build bundles
// this file and names the worker, the panel and the build it came from
// (scripts/build-web.js). It loads the panel itself, once the host is running:
// the panel asks for acquireVsCodeApi() as it loads. On a phone it starts
// neither, and shows only a notice (web/phone.mjs).

import {isPhone, showPhoneNotice} from "./phone.mjs";
import {initialTheme, startWebHost} from "./web-host.mjs";

/* global __ARK_VERSION__, __ARK_COMMIT__, __ARK_SLEEP_WORKER__, __ARK_PANEL__ */
const build = {version: __ARK_VERSION__, commit: __ARK_COMMIT__};
const matchMedia = globalThis.matchMedia?.bind(globalThis);

if (isPhone({matchMedia, screen: globalThis.screen})) {
    document.documentElement.dataset.theme = initialTheme(undefined, Boolean(matchMedia?.("(prefers-color-scheme: light)")?.matches));
    showPhoneNotice({document, root: document.getElementById("root"), address: location.host, build});
} else {
    // WebHID exists only in a secure context (HTTPS or localhost).
    const hid = globalThis.isSecureContext ? navigator.hid : undefined;
    let worker;
    try {worker = new Worker(new URL(__ARK_SLEEP_WORKER__, import.meta.url));} catch {worker = undefined;}

    const {api} = startWebHost({
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
    window.acquireVsCodeApi = () => api;
    // A URL rather than a name, so the build leaves the panel its own file.
    import(new URL(__ARK_PANEL__, import.meta.url).href);
}
