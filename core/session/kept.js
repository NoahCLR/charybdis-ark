// @ts-check
"use strict";

// What Ark keeps for one keyboard until a later read of it says what became
// of it, each record with the keyboard it is for:
//
//   restart       a restart Ark asked for: the unsaved edits it puts back
//                 once the keyboard is read again (keyboard-restart.js)
//   saveCutShort  a Save the connection cut short: the edits, until a read
//                 says whether the keyboard saved them (live-edits.js)
//   beforeApply   what the keyboard held before the last Apply, for "Put
//                 back what it had" (panel-controls.js)
//
//   remember        keeps a record for a keyboard, the selected one by default
//   keptFor         the record, when it is for a keyboard
//   keptForAny      the record, whichever keyboard it is for
//   forget          forgets it
//   followKeyboard  a keyboard Ark followed back under a new device id takes
//                   its draft and every record with it
//
// "The same keyboard" is the same device id. A restart and a Save cut short
// may bring it back under a new one (node-hid gives it a new path at every
// enumeration): its serial number, where the adapter shows one, still names
// it, as does the follow-back each of them starts (keyboard-reconnect.js).
// The copy from before an Apply is the device id's alone. Which listed
// keyboard a follow-back waited for is a question of its own
// (keyboard-reconnect.js reconnectTarget).

/**
 * @typedef {import("./types.js").KeptKind} Kind
 * @typedef {import("./types.js").KeptRecords} Records
 * @typedef {Pick<import("./types.js").PanelDeviceState, "devices" | "selectedDeviceId">} State
 * @typedef {Pick<import("./types.js").PanelSession, "kept" | "reconnect">} Session
 */
const {selectedDevice} = require("./device-model");

// How each kind knows its keyboard again, as said above.
/** @type {Readonly<Record<Kind, {bySerial: boolean, followedBack?: (reconnect: import("./types.js").ExpectedReconnect) => boolean}>>} */
const KINDS = Object.freeze({
    restart: {bySerial: true, followedBack: (reconnect) => Boolean(reconnect.restart)},
    saveCutShort: {bySerial: true, followedBack: (reconnect) => reconnect.lost !== undefined},
    beforeApply: {bySerial: false},
});

/** @template {Kind} K @param {Session} session @param {K} kind @param {import("./types.js").KeptValues[K]} value @param {State} state @param {string | null | undefined} [deviceId] */
function remember(session, kind, value, state, deviceId = selectedDevice(state)?.id) {
    const serialNumber = KINDS[kind].bySerial ? (state.devices || []).find((device) => device.id === deviceId)?.serialNumber || "" : "";
    session.kept = {...session.kept, [kind]: {...value, deviceId, serialNumber}};
}

/** @template {Kind} K @param {Session} session @param {K} kind @param {State} state @param {string | null | undefined} [deviceId] @returns {Records[K] | undefined} */
function keptFor(session, kind, state, deviceId = state.selectedDeviceId) {
    const record = session.kept?.[kind];
    if (!record) return undefined;
    const serialNumber = (state.devices || []).find((device) => device.id === deviceId)?.serialNumber || "";
    const followedBack = KINDS[kind].followedBack;
    const same = record.deviceId === deviceId || (Boolean(record.serialNumber) && serialNumber === record.serialNumber)
        || Boolean(session.reconnect && followedBack?.(session.reconnect));
    return same ? record : undefined;
}

/** @template {Kind} K @param {Session} session @param {K} kind @returns {Records[K] | undefined} */
const keptForAny = (session, kind) => session.kept?.[kind];

/** @param {Session} session @param {Kind} kind */
function forget(session, kind) {
    if (session.kept) session.kept = {...session.kept, [kind]: undefined};
}

// The keyboard a follow-back found is the one it waited for, though the
// adapter may list it under a new device id: what Ark keeps for that
// keyboard goes with it, the draft and every record, so the read after it is
// that keyboard's.
/** @param {Pick<import("./types.js").PanelSession, "kept" | "draft">} session @param {string} from @param {string} to */
function followKeyboard(session, from, to) {
    if (from === to) return;
    if (session.draft?.deviceId === from) session.draft.followDevice(to);
    for (const record of Object.values(session.kept || {})) {
        if (record?.deviceId === from) record.deviceId = to;
    }
}

module.exports = {remember, keptFor, keptForAny, forget, followKeyboard};
