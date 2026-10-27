// @ts-check
"use strict";
// The web shell's clock: a dedicated worker that answers each request after
// the time it asks for. Chrome throttles the timers of a page in a background
// tab — a 20 ms poll becomes a second or more, which would stretch an Apply
// many times over — but not a dedicated worker's, and the worker's answer
// reaches the page as a message, which is not throttled either.
// This file is checked in its dedicated-worker environment, apart from the page.
/** @type {DedicatedWorkerGlobalScope} */
const clock = /** @type {DedicatedWorkerGlobalScope} */ (self);
clock.onmessage = (/** @type {MessageEvent<{id: number; ms: number}>} */ event) => {
    const {id, ms} = event.data;
    setTimeout(() => clock.postMessage(id), ms);
};
