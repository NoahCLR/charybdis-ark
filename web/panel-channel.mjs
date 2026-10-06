// The panel and its host in one page: a stand-in for VS Code's
// acquireVsCodeApi(). The panel cannot tell the difference, and must not be
// able to: in VS Code every message crosses a process boundary, so it arrives
// later and as a copy. Here a MessageChannel does both — it delivers on a later
// task and clones what it carries — so the panel can never change the host's
// draft by touching an object it was sent, nor the host the panel's.
//
// One exception is made, synchronously and on a copy: `gesture(message)` sees
// each message while the panel's click handler is still running. Chrome opens
// its keyboard picker and file chooser only from a click, so the host starts
// them there; the message itself still reaches `receive` later, like any other.

export function connectPanel({receive, gesture = () => {}, target = globalThis}) {
    const channel = new MessageChannel();
    const panelPort = channel.port1, hostPort = channel.port2;
    hostPort.onmessage = (event) => receive(event.data);
    panelPort.onmessage = (event) => target.dispatchEvent(new MessageEvent("message", {data: event.data}));
    let state;
    const api = {
        postMessage(message) {
            gesture(structuredClone(message));
            panelPort.postMessage(message);
        },
        getState: () => (state === undefined ? undefined : structuredClone(state)),
        setState: (next) => {state = structuredClone(next); return next;},
    };
    return {
        api,
        // What the host posts to the panel: the model, cloned on the way.
        post(message) {
            hostPort.postMessage(message);
            return Promise.resolve(true);
        },
        close() {
            panelPort.close();
            hostPort.close();
        },
    };
}
