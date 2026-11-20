// @ts-check
// What the rail's message says, and how long it stays (D-L106). A failure
// stays until it is dismissed or something newer is said; the keyboard's own
// error stays while the keyboard reports it, unless it was dismissed, and
// comes back if it changes. A notice the core says holds while its condition
// does (`lasting`) stays until the core takes it back; any other notice
// closes by itself once there has been time to read it (`readingTime`).

import {barSaysNotice} from "./commit-bar.mjs";

// About 200 words a minute, with time to notice the message first, and never
// so short that a glance away misses it or so long that it lingers.
const READING = Object.freeze({startMs: 1500, perWordMs: 300, minMs: 5000, maxMs: 10000});

/** How long a notice that closes by itself stays, in milliseconds. @param {string} text */
export function readingTime(text) {
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.min(READING.maxMs, Math.max(READING.minMs, READING.startMs + words * READING.perWordMs));
}

/**
 * The rail's message, or null when it says nothing: the failure first, then
 * the keyboard's own error, then the notice, with which of them it is
 * (`source`), so ✕ closes the one shown. A failure a failed Apply's bar
 * already says is the bar's alone.
 * @param {import("../../contracts/panel.js").PublishedModel | null | undefined} model
 * @param {{notice?: string, error?: string, noticeLasting?: boolean, healthDismissed?: string}} panel
 * @param {import("./commit-bar.mjs").CommitBar | null} bar
 * @returns {{text: string, source: "error" | "health" | "notice", failed: boolean, fades: boolean} | null}
 */
export function railMessageView(model, {notice = "", error = "", noticeLasting = false, healthDismissed = ""}, bar) {
    const health = model?.device?.health?.error || "";
    /** @type {"error" | "health" | "notice"} */
    const source = error ? "error" : health && health !== healthDismissed ? "health" : "notice";
    const text = {error, health, notice}[source];
    if (!text || barSaysNotice(bar, text)) return null;
    return {text, source, failed: source !== "notice", fades: source === "notice" && !noticeLasting};
}
