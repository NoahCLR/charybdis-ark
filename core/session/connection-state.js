// @ts-check
"use strict";
const {evaluateProfileCompatibility, evaluateLiveMutationCompatibility} = require("./firmware-support");
const {editorViews} = require("../model/profile-model");
const {storedKeyboardName} = require("../model/keyboard-name");
const {layerName} = require("../model/vocabulary");
const {cloneStatus} = require("./candidate-status");
const {CANDIDATE_STATE_NAMES} = require("../protocol/profile-candidate-v1");

/**
 * @typedef {import("./types.js").DeviceConnection} Connection
 * @typedef {import("./types.js").DeviceCapabilities} Caps
 * @typedef {import("./types.js").ReadSnapshot} ReadSnapshot
 * @typedef {import("./types.js").RestoredProfile} Restored
 */

// What the device service holds of one connection (profile-device-service.js):
// the keyboard as the service last saw it, from its capabilities to the
// profile the editors follow. It ends with the connection, cleared as one
// (`clear`), and is published as the connection's part of the service's
// `snapshot()` (`published`), every part a copy, so the panel can keep it
// while the service goes on.
class ConnectionState {
    /** @type {Connection | undefined} */
    connection = undefined;
    connectionPublicId = "";
    /** @type {number | null} */
    connectionToken = null;
    /** @type {(() => void) | undefined} */
    disposeConnectionListener = undefined;
    /** @type {import("../protocol/types.js").RequestIds | undefined} */
    requestIds = undefined;
    /** @type {Caps | undefined} */
    capabilities = undefined;
    /** @type {import("./types.js").ProfileStatus | undefined} */
    status = undefined;
    /** @type {import("./types.js").CandidateStatus | undefined} */
    candidateStatus = undefined;
    lastRefreshedAt = "";
    // How edits reach this keyboard (firmware D-F32), read with its
    // capabilities; undefined when the keyboard does not say.
    /** @type {(import("../protocol/types.js").EditModeRead & {notStored?: boolean}) | undefined} */
    editMode = undefined;
    // The edit mode could not be read (not refused as unknown): Review and
    // save's reads meanwhile, and the next status refresh or read tries
    // again.
    editModeUnknown = false;
    // The toggles' stored masters and runtime overrides (GET 0x22).
    /** @type {import("../protocol/types.js").RuntimeRead | null} */
    runtime = null;
    // The live watch's looks left unanswered in a row (background-reads.js).
    missedLooks = 0;
    /** @type {import("./types.js").LayoutRead | undefined} */
    layout = undefined;
    /** @type {import("./types.js").CommittedRead | undefined} */
    committed = undefined;
    /** @type {import("./types.js").BaseRgbRead | undefined} */
    baseRgb = undefined;
    /** @type {import("./types.js").ComboRead | undefined} */
    combos = undefined;
    // Each half's flash pauses, read for the Keyboard screen's Diagnostics.
    /** @type {import("../../contracts/model.js").FlashPausesView | undefined} */
    flashPauses = undefined;
    /** @type {ReadSnapshot | Restored | undefined} */
    portable = undefined;
    portableProgress = "";
    /** @type {ReturnType<typeof editorViews>["settingsView"] | undefined} */
    settingsView = undefined;
    /** @type {ReturnType<typeof editorViews>["macroView"] | undefined} */
    macroView = undefined;
    /** @type {ReturnType<typeof editorViews>["customKeyView"] | undefined} */
    customKeyView = undefined;
    /** @type {NonNullable<import("./types.js").DeviceModelInput["liveApply"]>} */
    liveApply = {state: "idle"};
    // The connection's payload reader and live edit coordinator, each made
    // for it on first use (profile-device-service.js).
    /** @type {InstanceType<typeof import("./profile-payload-reader.js").ProfilePayloadReader> | undefined} */
    payloadReader = undefined;
    /** @type {InstanceType<typeof import("./live-edit-coordinator.js").LiveEditCoordinator> | undefined} */
    liveEdits = undefined;

    get connected() {return Boolean(this.connection?.connected);}

    // The connection ended: stop listening to it, and hold nothing of it.
    clear() {
        this.disposeConnectionListener?.();
        Object.assign(this, new ConnectionState());
    }

    // The profile the editors follow, with their views (profile-model.js).
    /** @param {ReadSnapshot | Restored} profile */
    adoptPortable(profile) {
        this.portable = profile;
        ({settingsView: this.settingsView, macroView: this.macroView, customKeyView: this.customKeyView} = editorViews(profile, this.capabilities));
    }

    // The combos, or the background effect, as just read.
    /** @param {Omit<Extract<import("./types.js").ComboRead, {state: "read"}>, "state" | "readAt">} read */
    combosRead(read) {this.combos = {state: "read", ...read, readAt: new Date().toISOString()};}
    /** @param {Omit<Extract<import("./types.js").BaseRgbRead, {state: "read"}>, "state" | "readAt">} settings */
    baseRgbRead(settings) {this.baseRgb = {state: "read", ...settings, readAt: new Date().toISOString()};}

    // Whether the keyboard still owes its edit mode's write (firmware D-F32,
    // flag 12), as it says now; resolves true when that changed. Nothing
    // without an edit mode.
    /** @param {boolean} notStored */
    modeNotStored(notStored) {
        if (!this.editMode || Boolean(this.editMode.notStored) === notStored) return false;
        this.editMode = {...this.editMode, notStored};
        return true;
    }

    // The connection's part of the service's `snapshot()`, with its
    // compatibility judged now.
    published() {
        const compatibility = this.capabilities ? evaluateProfileCompatibility(this.capabilities) : null;
        return {
            connected: this.connected,
            selectedDeviceId: this.connectionPublicId,
            connectionToken: this.connectionToken,
            capabilities: this.capabilities ? {...this.capabilities} : null,
            status: this.status ? {...this.status} : null,
            candidateStatus: this.candidateStatus ? publishedCandidateStatus(this.candidateStatus) : null,
            compatibility,
            mutationCompatibility: evaluateLiveMutationCompatibility(this.capabilities, compatibility, this.connected, this.status),
            storedKeyboardName: storedKeyboardName(this.portable) ?? this.committed?.domains?.settings?.keyboardName,
            portableSummary: this.committed?.domains?.settings ? {names: this.committed.domains.settings.names.map((name, index, names) => layerName(names, index))} : this.portable?.summary || null,
            portableProgress: this.portableProgress || "",
            settingsView: this.settingsView ? clone(this.settingsView) : null,
            macroView: this.macroView ? clone(this.macroView) : null,
            customKeyView: this.customKeyView ? clone(this.customKeyView) : null,
            liveApply: publishedLiveApply(this.liveApply),
            layout: this.layout ? clone(this.layout) : null,
            committed: this.committed ? clone(this.committed) : null,
            baseRgb: this.baseRgb ? clone(this.baseRgb) : null,
            combos: this.combos ? clone(this.combos) : null,
            flashPauses: this.flashPauses ? clone(this.flashPauses) : null,
            editMode: this.editMode ? {...this.editMode} : null,
            runtime: this.runtime ? clone(this.runtime) : null,
            lastRefreshedAt: this.lastRefreshedAt,
        };
    }
}

/** @param {NonNullable<import("./types.js").DeviceModelInput["liveApply"]>} value */
function publishedLiveApply(value) {
    return value && value.state !== "idle" ? clone(value) : {state: /** @type {const} */ ("idle")};
}

// A candidate status with its state's name, an unknown state's included.
/** @param {import("./types.js").CandidateStatus} status */
const publishedCandidateStatus = status => ({...cloneStatus(status), stateName: candidateStateName(status.state)});

/** @param {number} state */
function candidateStateName(state) {
    return CANDIDATE_STATE_NAMES[state] || `UNKNOWN_${state}`;
}

// A JSON copy, which shares nothing with what the service holds.
/** @template T @param {T} value @returns {T} */
function clone(value) {return JSON.parse(JSON.stringify(value));}

module.exports = {ConnectionState, clone};
