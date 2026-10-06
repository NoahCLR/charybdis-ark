// The web page's host, started with the page's own globals. The build bundles
// this file and names the worker and the build it came from (scripts/build-web.js).
// It must run before the panel's module, which asks for acquireVsCodeApi() as
// it loads; index.html lists it first.

import {startWebHost} from "./web-host.mjs";

/* global __ARK_VERSION__, __ARK_COMMIT__, __ARK_SLEEP_WORKER__ */
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
    matchMedia: globalThis.matchMedia?.bind(globalThis),
    document,
    window,
    worker,
    build: {version: __ARK_VERSION__, commit: __ARK_COMMIT__},
});
window.acquireVsCodeApi = () => api;
