// @ts-check
"use strict";

// After a save that renames the keyboard, the firmware's master half restarts
// USB by itself once the keyboard is quiet, so it comes back under its new
// product name. That loss of the connection is expected: Ark says it is
// reconnecting rather than reporting a failure, waits a bounded time for the
// same keyboard to come back, connects it and reads it again.
//
// "The same keyboard" is the one with the same serial number where the shell
// shows serial numbers (node-hid; the serial is the master half's hardware ID
// and survives the restart). A browser shows none, so there it is the one
// reporting the new name, excluding keyboards present before the save. A name
// shared with another keyboard, or an unknown built-in name after clearing it,
// cannot establish identity: the person chooses.
//
// The wait polls the device list, since VS Code has no hotplug events; the
// web page stops following Chrome's own events while it runs (web-shell.mjs).
//
// A keyboard lost unexpectedly is waited for the same way when nothing else
// would notice it come back: it left a request unanswered (Ark then closes
// the connection, but the keyboard stays plugged in), or it dropped off USB
// where the shell shows serial numbers (node-hid). A web page follows Chrome's
// own connect events for a keyboard that drops off (web-shell.mjs), and Chrome
// shows no serial to tell a returning keyboard by. The same keyboard is the
// one still listed under the same device, or else found as a renamed one is.
// Ark connects it again and reads it once per LOST_GUARD_MS, so a keyboard
// that keeps failing is left to the person rather than reconnected in a loop.
//
// A keyboard Ark restarted (firmware D-F34, keyboard-restart.js) is followed
// back the same way: the same keyboard, under the same name, read again.

/**
 * @typedef {import("./types.js").RunningPanelSession} Session
 * @typedef {import("./types.js").ExpectedReconnect} Expected
 * @typedef {{id: string, product?: string, serialNumber?: string}} Listed
 */
const {storedKeyboardName} = require("../model/keyboard-name");

const RECONNECT = Object.freeze({WAIT_MS: 10000, POLL_MS: 500});
const RECONNECT_WORDS = Object.freeze({
    waiting: "Reconnecting so the keyboard takes its new name…",
    back: /** @param {string} name */ (name) => name ? `The keyboard is back as “${name}”.` : "The keyboard is back under its built-in name.",
    ambiguous: "Ark could not identify the renamed keyboard. Choose yours in the keyboard menu.",
    timeout: "The keyboard did not come back after taking its new name. Check its cable, then read the keyboard again.",
    failed: "The keyboard is back under its new name, but reading it again failed. Read the keyboard again.",
});
const RESTART_WORDS = Object.freeze({
    waiting: "Restarting the keyboard…",
    back: () => "The keyboard restarted; Ark connected it again and read it.",
    ambiguous: "The keyboard restarted, but Ark cannot tell which keyboard is yours now. Choose it in the keyboard menu.",
    timeout: "The keyboard did not come back after restarting. Check its cable, then read the keyboard again.",
    failed: "The keyboard is back after restarting, but reading it again failed. Read the keyboard again.",
});
const LOST_GUARD_MS = 30000;
const LOST_WORDS = Object.freeze({
    waiting: "Lost the keyboard; connecting it again…",
    back: /** @param {string} what */ (what) => `The keyboard ${what}; Ark connected it again and read it.`,
    ambiguous: "Ark lost the keyboard and cannot tell which keyboard is yours now. Choose it in the keyboard menu.",
    timeout: "The keyboard did not come back. Check its cable, then choose it.",
    failed: "The keyboard is back, but reading it again failed. Read the keyboard again.",
    again: "The keyboard stopped answering again soon after Ark connected it again. Check its cable, then choose it.",
});

// The name a save gives the keyboard, when it changes the one it had; null
// when the keyboard keeps its name, or the saved profile cannot say. A repair
// with an incomplete previous read may rename it, so expect that restart.
/** @param {import("../model/types.js").ProfileSnapshot | null | undefined} before @param {import("../model/types.js").ProfileSnapshot | null | undefined} after */
function renamedTo(before, after) {
    const old = storedKeyboardName(before), next = storedKeyboardName(after);
    return next === undefined || old === next ? null : next;
}

// Starts expecting the keyboard to reconnect after a save that renamed it.
// Firmware compares stored names, including the empty built-in-name sentinel:
// saving the built-in text explicitly may restart even with the same USB text.
/** @param {Session} session @param {string | null} name @param {() => number} [now] */
function expectReconnect(session, name, now = Date.now) {
    if (name === null) return undefined;
    const state = session.service.snapshot();
    const device = (state.devices || []).find((entry) => entry.id === state.selectedDeviceId);
    if (!state.connected || !device) return undefined;
    const otherDevices = (state.devices || []).filter((entry) => entry.id !== device.id).map(({id, product}) => ({id, product}));
    /** @type {Expected} */
    const expected = {deviceId: device.id, serialNumber: device.serialNumber || "", name, otherDevices, startedAt: now(), dropped: false};
    session.reconnect = expected;
    session.service.expectReconnect?.(true);
    return expected;
}

// Starts expecting the keyboard Ark just asked to restart to come back: the
// same keyboard under the same name. The service already expects the drop.
/** @param {Session} session @param {() => number} [now] */
function expectRestart(session, now = Date.now) {
    const state = session.service.snapshot();
    const device = (state.devices || []).find((entry) => entry.id === state.selectedDeviceId);
    if (!device) return undefined;
    const otherDevices = (state.devices || []).filter((entry) => entry.id !== device.id).map(({id, product}) => ({id, product}));
    /** @type {Expected} */
    const expected = {deviceId: device.id, serialNumber: device.serialNumber || "", name: device.product || "", otherDevices, startedAt: now(), dropped: !state.connected, restart: true};
    session.reconnect = expected;
    return expected;
}

// Starts waiting for a keyboard lost unexpectedly (the service's takeLost),
// unless Ark already connected one again within LOST_GUARD_MS: then it says
// so and leaves the choice to the person.
/** @param {Session} session @param {import("./types.js").LostKeyboard | undefined} lost @param {() => number} [now] */
function expectLost(session, lost, now = Date.now) {
    if (!lost || session.reconnect || session.demo || (!lost.unanswered && !lost.serialNumber)) return undefined;
    if (session.lostAt !== undefined && now() - session.lostAt < LOST_GUARD_MS) {
        session.notice = LOST_WORDS.again;
        return undefined;
    }
    session.lostAt = now();
    /** @type {Expected} */
    const expected = {deviceId: lost.deviceId, serialNumber: lost.serialNumber, name: lost.product, otherDevices: lost.otherDevices, startedAt: now(), dropped: true, lost: lost.what};
    session.reconnect = expected;
    return expected;
}

// Stops expecting it, with what the panel should say about it, if anything.
/** @param {Session} session @param {Expected} expected @param {string} [notice] */
function endReconnect(session, expected, notice) {
    if (session.reconnect !== expected) return;
    session.reconnect = undefined;
    session.service.expectReconnect?.(false);
    if (notice) session.notice = notice;
}

// Which listed keyboard is the renamed one: found, ambiguous, or not back yet.
/** @param {Pick<Expected, "serialNumber" | "name" | "otherDevices"> & Partial<Pick<Expected, "deviceId" | "lost">>} expected @param {readonly Listed[]} devices @returns {{device: Listed} | {ambiguous: true} | null} */
function reconnectTarget(expected, devices) {
    // A lost keyboard still listed under the same device never left.
    const same = expected.lost !== undefined && devices.find((device) => device.id === expected.deviceId);
    if (same) return {device: same};
    if (expected.serialNumber) {
        const same = devices.filter((device) => device.serialNumber === expected.serialNumber);
        if (same.length === 1) return {device: same[0]};
        if (same.length > 1) return {ambiguous: true};
        // A known serial is identity; never fall back to another keyboard.
        return null;
    }
    const candidates = devices.filter((device) => !expected.otherDevices.some((other) => other.id === device.id));
    if (!candidates.length) return null;
    // Names are not unique identifiers. Even a newly listed device cannot be
    // identified by a name another keyboard already had before this save.
    if (!expected.name || expected.otherDevices.some((other) => other.product === expected.name)) return {ambiguous: true};
    const named = candidates.filter((device) => device.product === expected.name);
    return named.length === 1 ? {device: named[0]} : {ambiguous: true};
}

/**
 * Waits for the renamed keyboard to drop off and come back, then reads it
 * with `read`, which resolves false when the keyboard is not ready to edit
 * after it. Ends at once if the expectation is replaced (the person chose
 * or read a keyboard). Firmware may wait indefinitely for a safe boundary;
 * the bounded return wait starts only after the connection drops. `publish`
 * shows each change.
 * @param {Session} session
 * @param {Expected} expected
 * @param {{read: (deviceId: string) => Promise<boolean | void>, publish: () => void, sleep?: (ms: number) => Promise<void>, now?: () => number, waitMs?: number, pollMs?: number}} options
 */
async function awaitReconnect(session, expected, {read, publish, sleep = defaultSleep, now = Date.now, waitMs = RECONNECT.WAIT_MS, pollMs = RECONNECT.POLL_MS}) {
    const service = session.service;
    const words = expected.restart ? RESTART_WORDS : expected.lost === undefined ? RECONNECT_WORDS : {...LOST_WORDS, back: () => LOST_WORDS.back(/** @type {string} */ (expected.lost))};
    const finish = /** @param {string} notice */ (notice) => {
        const said = expected.saved ? `${expected.saved} ${notice}` : notice;
        endReconnect(session, expected, expected.after ? `${said} ${expected.after}` : said);
        publish();
    };
    while (session.reconnect === expected) {
        await sleep(pollMs);
        if (session.reconnect !== expected) return;
        const state = service.snapshot();
        if (!state.connected && !expected.dropped) {
            expected.dropped = true;
            expected.startedAt = now();
            publish();
        }
        const late = expected.dropped && now() - expected.startedAt >= waitMs;
        if (state.busy || session.portableBusy || session.readBusy) {
            if (late) finish(words.timeout);
            continue;
        }
        if (state.connected) {
            // Another read or choice may already have restored the connection.
            // A still-live old connection can be waiting for safe conditions.
            if (expected.dropped) {endReconnect(session, expected); publish();}
            continue;
        }
        try {await service.enumerate();} catch {
            // A stale list cannot establish which keyboard returned.
            if (late) finish(words.timeout);
            continue;
        }
        if (session.reconnect !== expected) return;
        const target = reconnectTarget(expected, service.snapshot().devices || []);
        if (target && "device" in target) {
            // A read that rejects, or says it is not ready (its complete
            // profile could not be read), failed.
            let failed = false;
            try {failed = await read(target.device.id) === false;} catch {failed = true;}
            const back = service.snapshot();
            // What the save said comes first, so its recovery copy is not lost.
            const outcome = failed || !back.connected || back.error ? words.failed : words.back(expected.name);
            finish(outcome);
            return;
        }
        if (target) {finish(words.ambiguous); return;}
        if (late) {finish(words.timeout); return;}
    }
}

/** @param {number} ms */
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {RECONNECT, RECONNECT_WORDS, LOST_WORDS, RESTART_WORDS, LOST_GUARD_MS, renamedTo, expectReconnect, expectRestart, expectLost, endReconnect, reconnectTarget, awaitReconnect};
