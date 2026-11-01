// @ts-check
// sleep(ms) for core/'s polls, kept by a worker (web/sleep-worker.js) so a
// hidden tab does not slow an Apply. Without a worker it is the page's timer,
// and so it becomes if the worker fails: one whose script did not load never
// answers, which would leave every poll, reconnect wait and look at a live
// keyboard waiting for good. What was waiting then finishes on the page's
// timer at the time it asked for.

/** @param {import("./types.js").SleepWorker | undefined} worker @returns {(ms: number) => Promise<void>} */
export function workerSleep(worker) {
    /** @param {number} ms @returns {Promise<void>} */
    const timer = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    if (!worker) return timer;
    /** @type {Map<number, {resolve: () => void, until: number}>} */
    const waiting = new Map();
    let next = 1, failed = false;
    worker.onmessage = (event) => {
        const sleeper = waiting.get(event.data);
        waiting.delete(event.data);
        sleeper?.resolve();
    };
    worker.onerror = worker.onmessageerror = () => {
        failed = true;
        for (const {resolve, until} of waiting.values()) setTimeout(resolve, Math.max(0, until - Date.now()));
        waiting.clear();
    };
    return (ms) => failed ? timer(ms) : new Promise((resolve) => {
        const id = next++;
        waiting.set(id, {resolve, until: Date.now() + ms});
        worker.postMessage({id, ms});
    });
}
