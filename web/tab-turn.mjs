// @ts-check
// Which tab holds the keyboard where the browser gives the page no lock.
// Chrome with site data blocked refuses Web Locks (web-shell.mjs) but leaves
// BroadcastChannel alone, so the tabs at this address ask each other.
//
// A tab asks, and holds the keyboard unless another answers within ASK_MS.
// The tab that holds it answers that it does. Two tabs asking at once each
// answer with their own number, and the lower goes on. A tab that waits asks
// again when the holder says it is leaving and when the person comes back to
// it, so a holder that never answers (crashed, or closed without a word) is
// taken to be gone.

export const TURN_CHANNEL = "charybdis-ark.keyboard";
export const ASK_MS = 250;

/**
 * @typedef {{ask: number} | {claim: number} | {held: number} | {left: number}} TurnMessage
 * @typedef {Pick<BroadcastChannel, "postMessage" | "onmessage">} TurnChannel
 */

/**
 * This tab's turn at the keyboard. Resolves with whether it holds it at
 * first. After that `taken` is called when a tab that waited gets it, and
 * `lost` when one that held it finds another holds it (a page the browser
 * kept and brought back).
 * @param {{channel: TurnChannel, window: Pick<Window, "addEventListener">, document?: Pick<Document, "addEventListener" | "visibilityState">, taken: () => void, lost: () => void, id?: number}} tab
 * @returns {Promise<boolean>}
 */
export function tabTurn({channel, window, document, taken, lost, id = Math.random()}) {
    /** @type {"asking" | "holding" | "waiting"} */
    let state = "waiting";
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    // What the page was last told: nothing before the first answer.
    /** @type {boolean | undefined} */
    let told;
    /** @type {(held: boolean) => void} */
    let answer = () => {};
    /** @type {Promise<boolean>} */
    const first = new Promise((resolve) => {answer = resolve;});
    /** @param {boolean} held */
    const tell = (held) => {
        if (told === held) return;
        const before = told;
        told = held;
        if (before === undefined) answer(held);
        else if (held) taken();
        else lost();
    };
    const hold = () => {state = "holding"; tell(true);};
    const wait = () => {
        state = "waiting";
        clearTimeout(timer);
        tell(false);
    };
    const ask = () => {
        state = "asking";
        channel.postMessage(/** @type {TurnMessage} */ ({ask: id}));
        clearTimeout(timer);
        timer = setTimeout(hold, ASK_MS);
    };
    channel.onmessage = (event) => {
        const data = /** @type {unknown} */ (event.data);
        const message = /** @type {Partial<Record<"ask" | "claim" | "held" | "left", unknown>> | null} */ (data && typeof data === "object" ? data : null);
        if (!message) return;
        if (typeof message.ask === "number") {
            if (state === "holding") channel.postMessage(/** @type {TurnMessage} */ ({held: id}));
            else if (state === "asking") {
                channel.postMessage(/** @type {TurnMessage} */ ({claim: id}));
                if (message.ask < id) wait();
            }
        } else if (typeof message.claim === "number") {
            if (state === "asking" && message.claim < id) wait();
        } else if (typeof message.held === "number") {
            if (state === "asking") wait();
        } else if (typeof message.left === "number" && state === "waiting") ask();
    };
    // Closing, reloading or leaving the page lets the next tab in. The page
    // is not told: it is going, and one the browser brings back asks again.
    window.addEventListener("pagehide", () => {
        if (state !== "holding") return;
        state = "waiting";
        channel.postMessage(/** @type {TurnMessage} */ ({left: id}));
    });
    document?.addEventListener("visibilitychange", () => {if (state === "waiting" && document.visibilityState === "visible") ask();});
    ask();
    return first;
}
