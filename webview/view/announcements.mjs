// @ts-check
// What a screen reader is told as it happens. Every render replaces the page,
// so a status drawn on it is new each time, already holding its words, and
// is not reliably heard. The page keeps one polite and one assertive region
// of its own, outside what renders (webview/lib/announce.mjs), and writes
// into them what this says, when it changes: what the keyboard and Ark are
// doing now, then what went wrong.
//
// The polite parts are the work under way (a read or save of the shell, a
// backup being read or written, the commit bar's save, read back, held key or
// other work, a keyboard asking for a restart) and the rail's notice; the
// assertive ones a save cut short, the keyboard's own save failing and the
// rail's error. A bar that says the rail's notice says it alone, as on screen.
// A save's step is said by its label, not by its bytes, so the region is not
// rewritten for every page sent.

import {barSaysNotice, commitBarState} from "./commit-bar.mjs";

/** @typedef {{polite: string[], assertive: string[]}} Announcements */

/**
 * @param {import("../../contracts/panel.js").PublishedModel | null | undefined} model
 * @param {{notice?: string, error?: string, applyDismissed?: number | null}} panel the panel's notice, error and dismissed Apply
 * @returns {Announcements}
 */
export function announcements(model, {notice = "", error = "", applyDismissed = null} = {}) {
    /** @type {string[]} */
    const polite = [];
    /** @type {string[]} */
    const assertive = [];
    const bar = commitBarState(model, {applyDismissed});
    if (model?.shell?.progress) polite.push(model.shell.progress);
    if (model?.portable?.progress) polite.push(model.portable.progress);
    if (bar?.kind === "applying") {
        const step = bar.apply.steps[bar.step - 1];
        polite.push(`Saving to the keyboard, step ${bar.step} of ${bar.apply.steps.length}${step ? `: ${step.label}` : ""}`);
    }
    if (bar?.kind === "readback") polite.push("Saved. Reading back the keyboard");
    if (bar?.kind === "held") polite.push(bar.wait.title);
    if (bar?.kind === "busy") polite.push("Working with the keyboard");
    if (bar?.kind === "restart") polite.push(bar.offer.title);
    if (bar?.kind === "failed") {
        const failure = bar.apply.failure;
        assertive.push([`Save stopped at: ${failure?.label || ""}.`, failure?.reason, failure?.verdict].filter(Boolean).join(" "));
    }
    if (bar?.kind === "saveFailed") assertive.push(bar.saving.title);
    const failed = error || model?.device?.health?.error || "";
    const said = failed || notice;
    if (said && !barSaysNotice(bar, said)) (failed ? assertive : polite).push(said);
    return {polite, assertive};
}
