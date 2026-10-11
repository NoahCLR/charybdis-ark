// Compile-time environment checks; this module never runs.
export {};

function workerEnvironment() {
    const clock: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
    clock.postMessage(1);
    // @ts-expect-error The dedicated worker has no page DOM.
    document.getElementById("root");
    // @ts-expect-error Node globals cannot reach the browser worker.
    Buffer.alloc(4);
}
void workerEnvironment;
