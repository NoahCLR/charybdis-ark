// @ts-check
// The panel and its shell in one page, joined as if by a process boundary:
// the panel reaches the shell only through acquirePanelApi(), and every
// message arrives later and as a copy. A MessageChannel does both — it
// delivers on a later task and clones what it carries — so the panel can never
// change the core's draft by touching an object it was sent, nor the core the
// panel's.
//
// One exception is made, synchronously and on a copy: `gesture(message)` sees
// each message while the panel's click handler is still running. Chrome opens
// its keyboard picker and file chooser only from a click, so the shell starts
// them there; the message itself still reaches `receive` later, like any other.

/** @param {{receive: (message: import("../contracts/messages.js").PanelRequest) => unknown, gesture?: (message: import("../contracts/messages.js").PanelRequest) => unknown, target?: Pick<EventTarget, "dispatchEvent">}} options */
export function connectPanel({receive, gesture = () => {}, target = globalThis}) {
    const channel = new MessageChannel();
    const panelPort = channel.port1, shellPort = channel.port2;
    shellPort.onmessage = (event) => receive(event.data);
    panelPort.onmessage = (event) => target.dispatchEvent(new MessageEvent("message", {data: event.data}));
    /** @type {unknown} */
    let state;
    const api = {
        postMessage(/** @type {import("../contracts/messages.js").PanelRequest} */ message) {
            gesture(structuredClone(message));
            panelPort.postMessage(message);
        },
        getState: () => (state === undefined ? undefined : structuredClone(state)),
        setState: (/** @type {unknown} */ next) => {state = structuredClone(next); return next;},
    };
    return {
        api,
        // What the shell posts to the panel: the model, cloned on the way.
        post(/** @type {import("../contracts/messages.js").PanelResponse} */ message) {
            shellPort.postMessage(message);
            return Promise.resolve(true);
        },
        close() {
            panelPort.close();
            shellPort.close();
        },
    };
}
