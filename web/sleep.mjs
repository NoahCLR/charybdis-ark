// @ts-check
// sleep(ms) for core/'s polls, kept by a worker (web/sleep-worker.js) so a
// hidden tab does not slow an Apply. Without a worker it is the page's timer.

/** @param {Pick<Worker, "onmessage" | "postMessage"> | undefined} worker @returns {(ms: number) => Promise<void>} */
export function workerSleep(worker) {
    if (!worker) return (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    /** @type {Map<number, () => void>} */
    const waiting = new Map();
    let next = 1;
    worker.onmessage = (event) => {
        const resolve = waiting.get(event.data);
        waiting.delete(event.data);
        resolve?.();
    };
    return (ms) => new Promise((resolve) => {
        const id = next++;
        waiting.set(id, resolve);
        worker.postMessage({id, ms});
    });
}
