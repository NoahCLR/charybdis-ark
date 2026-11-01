// @ts-check
"use strict";

// The panel loop as the page runs it, for session tests: a shell that records
// what the loop hands it, the clock the loop waits on, and a loop open on a
// fake keyboard and read once (`openLoop`).
//
// The loop's time is the clock's: every wait it asks for moves the clock on
// instead of waiting, so waiting out a bound (STARTING.WAIT_MS,
// RECONNECT.WAIT_MS, a held key) takes no time, and `at(ms, run)` runs `run`
// once the clock has passed `ms`. A request's own timeout stays the
// transport's. The wait for a keyboard to come back also lets the event loop
// turn once a poll, so a keyboard's own timer, its restart (live-keyboard.js),
// runs.
const {openPanelLoop} = require("../../core/session/panel-loop");
const {checkLive} = require("../../core/session/live-watch");
const {fakeKeyboardAdapter} = require("./fake-keyboard");
const {liveKeyboard} = require("./live-keyboard");
const {document} = require("./portable-profile");
const {withCatalog} = require("../../webview/catalog.mjs");

/** @typedef {ReturnType<typeof testClock>} TestClock */

// A clock every wait moves on: `now()`, `sleep(ms)`, `at(ms, run)`, and
// `waits`, every wait asked for, in order. `pass(ms)` moves it on at once,
// as the time a report takes.
function testClock() {
    let ms = 0;
    /** @type {{at: number, run: () => void}[]} */
    const due = [];
    /** @type {number[]} */
    const waits = [];
    /** @param {number} elapsed */
    const pass = (elapsed) => {
        ms += elapsed;
        for (const job of due.filter((job) => ms >= job.at)) {due.splice(due.indexOf(job), 1); job.run();}
    };
    return {
        now: () => ms,
        waits,
        pass,
        /** @param {number} at @param {() => void} run */
        at: (at, run) => {due.push({at, run});},
        /** @param {number} wait */
        sleep: async (wait) => {waits.push(wait); pass(wait);},
    };
}

/** @param {(ms: number) => Promise<void>} sleep @returns {(ms: number) => Promise<void>} */
const turning = (sleep) => async (ms) => {
    await new Promise((resolve) => setImmediate(resolve));
    await sleep(ms);
};

// A shell that records everything the loop hands it, and keeps the last
// catalog posted as `catalog`; `extra` replaces any of its parts. A recovery
// copy is saved as /recovery/<n>.json, an export as /exports/<file name>.
/** @param {Record<string, unknown>} [extra] */
function fakeShell(extra = {}) {
    const shell = {
        posted: /** @type {any[]} */ ([]), errors: /** @type {string[]} */ ([]), catalog: /** @type {any} */ (null),
        recoveries: /** @type {any[]} */ ([]), made: /** @type {any[]} */ ([]), exports: /** @type {any[]} */ ([]),
        /** @param {any} message */
        post: (message) => {shell.posted.push(message); if (message.type === "catalog") shell.catalog = message.catalog;},
        /** @param {string} text */
        showError: (text) => {shell.errors.push(text);},
        /** @template T @param {string} title @param {() => Promise<T>} work */
        progress: async (title, work) => work(),
        /** @param {any} doc @param {any} about */
        saveRecovery: async (doc, about) => {shell.recoveries.push(doc); shell.made.push(about); return `/recovery/${shell.recoveries.length}.json`;},
        chooseProfile: async () => undefined,
        /** @param {{fileName: string}} file */
        saveExport: async (file) => {shell.exports.push(file); return `/exports/${file.fileName}`;},
        ...extra,
    };
    return shell;
}
/** @typedef {ReturnType<typeof fakeShell>} FakeShell */

// A message as the panel reads it: a model with the shell's catalog laid
// back under it, as the store lays it (webview/catalog.mjs).
/** @param {{catalog?: any}} shell @param {any} message */
const asRead = (shell, message) => message?.type === "model" ? {...message, model: withCatalog(message.model, shell.catalog ?? null)} : message;

// The last model message posted, as the panel reads it, its model, and every
// notice posted, in order.
/** @param {FakeShell} shell */
const lastMessage = (shell) => asRead(shell, shell.posted.filter((message) => message.type === "model").at(-1));
/** @param {FakeShell} shell */
const lastModel = (shell) => lastMessage(shell)?.model;
/** @param {FakeShell} shell @returns {string[]} */
const notices = (shell) => shell.posted.filter((message) => message.notice).map((message) => message.notice);

/**
 * Opens the panel loop on `keyboard` (a live keyboard in Live preview + save
 * unless given) on the clock, and reads it unless `read` is false. `options`
 * go to the loop; its `reconnect` timing is added to the clock's.
 * @param {{after: (fn: () => unknown) => void}} t
 * @param {{keyboard?: import("./types.js").FakeKeyboard, shell?: FakeShell, clock?: TestClock, read?: boolean, reconnect?: object} & Record<string, unknown>} [setup]
 */
async function openLoop(t, {keyboard = liveKeyboard({document: document()}), shell = fakeShell(), clock = testClock(), read = true, reconnect = {}, ...options} = {}) {
    const adapter = fakeKeyboardAdapter({keyboard});
    const loop = openPanelLoop(/** @type {any} */ (shell), {adapter, defaultTimeoutMs: 300, sleep: clock.sleep, now: clock.now, ...options,
        reconnect: {now: clock.now, sleep: turning(clock.sleep), ...reconnect}});
    t.after(() => loop.close());
    if (read) await loop.handleMessage({type: "refresh"});
    /** @param {object} message */
    const send = (message) => loop.handleMessage({draftId: loop.session.draft?.id, draftRevision: loop.session.draft?.revision, ...message});
    /** @param {number} layer @param {number} layoutIndex @param {string} keycode */
    const key = (layer, layoutIndex, keycode) => send({type: "updateLayoutKeys", layer: `Layer ${layer}`, changes: [{layoutIndex, keycode}]});
    // The live watch's look between edits, published when it saw news.
    const look = async () => {const changed = await checkLive(loop.session); if (changed) loop.publish(); return changed;};
    return {keyboard, adapter, shell, loop, session: loop.session, clock, at: clock.at, send, key, look};
}

module.exports = {asRead, fakeShell, lastMessage, lastModel, notices, openLoop, testClock};
