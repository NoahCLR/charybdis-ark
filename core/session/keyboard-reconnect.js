// @ts-check
"use strict";

// After a save that renames the keyboard, the firmware's master half restarts
// USB by itself once the keyboard is quiet, so it comes back under its new
// product name. That loss of the connection is expected: Ark says it is
// reconnecting rather than reporting a failure, waits a bounded time for the
// same keyboard to come back, connects it and reads it again.
//
// "The same keyboard" is the one with the same serial number where the host
// shows serial numbers (node-hid; the serial is the master half's hardware ID
// and survives the restart). A browser shows none, so there it is the one
// reporting the new name, excluding keyboards present before the save. A name
// shared with another keyboard, or an unknown built-in name after clearing it,
// cannot establish identity: the person chooses.
//
// The wait polls the device list, since VS Code has no hotplug events; the
// web page stops following Chrome's own events while it runs (web-host.mjs).

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

// The name a save gives the keyboard, when it changes the one it had; null
// when the keyboard keeps its name, or the saved profile cannot say. A repair
// with an incomplete previous capture may rename it, so expect that restart.
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

// Stops expecting it, with what the panel should say about it, if anything.
/** @param {Session} session @param {Expected} expected @param {string} [notice] */
function endReconnect(session, expected, notice) {
    if (session.reconnect !== expected) return;
    session.reconnect = undefined;
    session.service.expectReconnect?.(false);
    if (notice) session.notice = notice;
}

// Which listed keyboard is the renamed one: found, ambiguous, or not back yet.
/** @param {Pick<Expected, "serialNumber" | "name" | "otherDevices">} expected @param {readonly Listed[]} devices @returns {{device: Listed} | {ambiguous: true} | null} */
function reconnectTarget(expected, devices) {
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
 * with `read`. Ends at once if the expectation is replaced (the person chose
 * or read a keyboard). Firmware may wait indefinitely for a safe boundary;
 * the bounded return wait starts only after the connection drops. `publish`
 * shows each change.
 * @param {Session} session
 * @param {Expected} expected
 * @param {{read: (deviceId: string) => Promise<unknown>, publish: () => void, sleep?: (ms: number) => Promise<void>, now?: () => number, waitMs?: number, pollMs?: number}} options
 */
async function awaitReconnect(session, expected, {read, publish, sleep = defaultSleep, now = Date.now, waitMs = RECONNECT.WAIT_MS, pollMs = RECONNECT.POLL_MS}) {
    const service = session.service;
    const finish = /** @param {string} notice */ (notice) => {
        endReconnect(session, expected, expected.saved ? `${expected.saved} ${notice}` : notice);
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
            if (late) finish(RECONNECT_WORDS.timeout);
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
            if (late) finish(RECONNECT_WORDS.timeout);
            continue;
        }
        if (session.reconnect !== expected) return;
        const target = reconnectTarget(expected, service.snapshot().devices || []);
        if (target && "device" in target) {
            let failed = false;
            try {await read(target.device.id);} catch {failed = true;}
            const back = service.snapshot();
            // What the save said comes first, so its recovery copy is not lost.
            const outcome = failed || !back.connected || back.error ? RECONNECT_WORDS.failed : RECONNECT_WORDS.back(expected.name);
            finish(outcome);
            return;
        }
        if (target) {finish(RECONNECT_WORDS.ambiguous); return;}
        if (late) {finish(RECONNECT_WORDS.timeout); return;}
    }
}

/** @param {number} ms */
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {RECONNECT, RECONNECT_WORDS, renamedTo, expectReconnect, endReconnect, reconnectTarget, awaitReconnect};
