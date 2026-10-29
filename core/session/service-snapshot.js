// @ts-check
"use strict";
const {evaluateProfileCompatibility, evaluateLiveMutationCompatibility} = require("./firmware-support");
const {storedKeyboardName} = require("../model/keyboard-name");
const {layerName} = require("../model/vocabulary");
const {cloneStatus} = require("./candidate-status");
const {CANDIDATE_STATE_NAMES} = require("../protocol/profile-candidate-v1");

/** @typedef {InstanceType<typeof import("./profile-device-service.js").ProfileDeviceService>} Service */

// What the device service publishes as `snapshot()` (profile-device-service.js):
// the keyboard as the service last saw it, failures included, with its
// compatibility judged now. Every part is a copy, so the panel can keep it
// while the service goes on.
/** @param {Service} service @returns {import("./types.js").ServiceSnapshot} */
function serviceSnapshot(service) {
    return {
        phase: service.phase,
        operationId: service.operationId,
        scanned: service.scanned,
        busy: service.busy,
        connected: Boolean(service.connection?.connected),
        devices: service.devices.map((device) => ({...device})),
        selectedDeviceId: service.connectionPublicId,
        connectionToken: service.connectionToken,
        capabilities: service.capabilities ? {...service.capabilities} : null,
        status: service.status ? {...service.status} : null,
        candidateStatus: service.candidateStatus ? publishedCandidateStatus(service.candidateStatus) : null,
        compatibility: service.capabilities
            ? evaluateProfileCompatibility(service.capabilities)
            : null,
        mutationCompatibility: evaluateLiveMutationCompatibility(
            service.capabilities,
            service.capabilities ? evaluateProfileCompatibility(service.capabilities) : null,
            Boolean(service.connection?.connected),
            service.status
        ),
        storedKeyboardName: storedKeyboardName(service.portable) ?? service.committed?.domains?.settings?.keyboardName,
        portableSummary: service.committed?.domains?.settings ? {names: service.committed.domains.settings.names.map((name, index, names) => layerName(names, index))} : service.portable?.summary || null,
        portableProgress: service.portableProgress || "",
        liveWaiting: service.liveWaiting ? {...service.liveWaiting} : null,
        settingsView: service.settingsView ? clone(service.settingsView) : null,
        macroView: service.macroView ? clone(service.macroView) : null,
        customKeyView: service.customKeyView ? clone(service.customKeyView) : null,
        liveApply: publishedLiveApply(service.liveApply),
        layout: service.layout ? clone(service.layout) : null,
        committed: service.committed ? clone(service.committed) : null,
        baseRgb: service.baseRgb ? clone(service.baseRgb) : null,
        combos: service.combos ? clone(service.combos) : null,
        flashPauses: service.flashPauses ? clone(service.flashPauses) : null,
        editMode: service.editMode ? {...service.editMode} : null,
        runtime: service.runtime ? clone(service.runtime) : null,
        error: service.error ? {...service.error} : null,
        diagnostics: service.diagnostics.slice(),
        lastRefreshedAt: service.lastRefreshedAt,
    };
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

module.exports = {serviceSnapshot, clone};
