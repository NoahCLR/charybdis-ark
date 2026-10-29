// @ts-check
"use strict";

// Builds the model from a decoded snapshot or independent device readback.
//
// The webview renders `model` and posts typed edits back. Draft content comes
// from its snapshot and is presented by the profile model
// (model/profile-model.js); the keyboard header and diagnostics come from real
// reads, and are built here.

const {PHASE, HALVES_WORDS, failureSentence} = require("../model/vocabulary");
const keycodes = require("../schema/keycodes");
const {baseEffectForView, baseRgbForView} = require("../model/device-profile-view");
const {decodedOf} = require("../model/portable-profile");
const {baseLighting} = require("../model/settings-editor");
const {keyboardNameView} = require("../model/keyboard-name");
const {editorViews, profileComboReadback, profileModel} = require("../model/profile-model");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, matrixPosition} = require("../data/charybdis-layout");

const {editableDomains} = require("./firmware-support");
const {baseRgbOf} = require("./profile-reads");

// Independent readback remains useful when a complete read fails.
/** @param {import("./types.js").DeviceModelInput} [state] */
function buildDeviceModel(state = {}) {
    const committed = state.committed?.state === "read";
    const domains = committed ? state.committed?.domains || {} : {};
    return {...profileModel({
        layers: state.layout?.state === "read" ? state.layout.layers : [], domains,
        comboRows: state.combos?.state === "read" ? state.combos.rows : [],
        comboInfo: state.combos ? {...state.combos, rows: undefined} : {state: "unread"},
        baseEffect: baseRgbForView(state.baseRgb, state.settingsView?.brightnessMax),
        settingsView: state.settingsView, macroView: state.macroView, customKeyView: state.customKeyView,
        identity: committed ? {source: state.committed?.source, generation: state.committed?.generation, digest: state.committed?.digest, originHalf: state.committed?.originHalf} : null,
    }, state.capabilities, editableDomains(state)), ...deviceSummary(state)};
}

// Drafts render their once-decoded snapshot. Actual device facts describe the
// keyboard; the centralized binding alone decides the draft's editability.
/**
 * @param {import("../model/types.js").CompleteSnapshot} snapshot
 * @param {import("../model/types.js").ProfileDestination} capabilities
 * @param {ReturnType<typeof import("./panel-session-state.js").draftBinding>} binding
 * @param {import("./types.js").DeviceModelInput} [deviceState]
 */
function buildSnapshotModel(snapshot, capabilities, binding, deviceState = {}) {
    const value = decodedOf(snapshot);
    const current = {...snapshot, decoded: value};
    const views = editorViews(current, capabilities);
    const {settings} = value;
    const {rows: comboRows, ...comboInfo} = profileComboReadback(value);
    const max = snapshot.limits?.brightnessMax;
    const baseEffect = max === undefined ? baseRgbForView(deviceState.baseRgb) : baseEffectForView(baseRgbOf(baseLighting(settings.values)), max);
    const editable = binding.editable;
    const model = profileModel({
        layers: value.layers.map((values, layer) => ({layer, keys: CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column], layoutIndex) => ({row, column, layoutIndex, keycode: values[matrixPosition(layoutIndex)], resolved: keycodes.resolve(values[matrixPosition(layoutIndex)])}))})),
        domains: {rgb: value.rgb, keyBehaviors: value.behaviors, settings, pdModes: value.pdModes},
        comboRows, comboInfo,
        baseEffect, ...views,
        // The firmware's built-in name is what a keyboard with no stored name
        // reports over USB, so it is known only while that is the case.
        keyboardNameView: keyboardNameView(current, deviceState.storedKeyboardName === "" ? deviceState.device?.product || "" : ""),
        identity: null,
    }, capabilities, {busy: !editable, behaviors: editable, pointing: editable, combos: editable, macros: editable, settings: editable, customKeys: editable});
    model.layers.forEach((layer, index) => {layer.displayName = snapshot.summary.names[index];});
    return {...model, ...deviceSummary(deviceState)};
}

// What the keyboard is called: a name the person gave it stands alone;
// otherwise the manufacturer and product it reports over USB.
/** @param {Pick<import("./types.js").DeviceModelInput, "storedKeyboardName" | "device">} state */
const keyboardLabel = (state) => state.storedKeyboardName || [state.device?.manufacturer, state.device?.product].filter(Boolean).join(" ") || "Charybdis";

/** @param {import("./types.js").DeviceModelInput} state */
function deviceHeader(state) {
    const connected = Boolean(state.capabilities);
    if (!connected) {
        return {
            connected: false,
            label: "",
            summary: "",
            savedProfile: "",
            subtitle: "",
            flashPauses: null,
            health: {
                profile: "unavailable",
                converged: false,
                halves: /** @type {import("../../contracts/model.js").HalvesId} */ ("unread"),
                recoveryPending: false,
                restartNeeded: false,
                earlierFormat: false,
                busy: false,
                phase: state.phase || PHASE.IDLE,
                error: state.error ? failureSentence(state.error) : "",
            },
        };
    }
    const label = keyboardLabel(state);
    const status = state.status;
    // Say plainly when nothing is committed. "generation 0" reads like a real
    // generation and it is not one.
    // `savedProfile` says the same in words alone, for the review's footer:
    // the digest is for the Keyboard screen's Diagnostics.
    const unsaved = status && (state.committed?.source === "compiled" || status.committedGeneration === 0);
    const summary = !status ? ""
        : unsaved ? `no committed profile · running compiled defaults · ${convergence(status)}`
            : `generation ${status.committedGeneration} · ${hex(status.committedDigest)} · ${convergence(status)}`;
    const savedProfile = !status ? ""
        : unsaved ? `no saved profile · running the compiled defaults · ${convergence(status)}`
            : `saved profile generation ${status.committedGeneration} · ${convergence(status)}`;
    const layers = state.layout?.state === "read" ? state.layout.layers.length : 0;
    const parts = [];
    if (layers) {
        parts.push(`${layers} layers`);
    }
    if (state.committed?.state === "read") {
        parts.push(state.committed.source === "compiled" ? "compiled defaults" : `generation ${state.committed.generation}`);
    }
    const subtitle = parts.length
        ? `${parts.join(" and ")} read from the keyboard`
        : "Connected. Choose Read keyboard to read its profile.";
    const converged = Boolean(status) && halvesConverged(status);
    return {
        connected: true,
        label,
        summary,
        savedProfile,
        subtitle,
        // Each half's flash pauses as last read, verbatim, for Diagnostics.
        flashPauses: state.flashPauses || null,
        health: {
            profile: !status ? "unread" : converged ? "synced" : "attention",
            converged,
            halves: halvesState(status),
            recoveryPending: Boolean(state.mutationCompatibility?.recoveryPending || status?.candidatePending),
            // The slave half never confirmed a cancelled save. Only a restart
            // releases it, and the keyboard refuses new saves until then.
            restartNeeded: Boolean(status?.slaveCleanupPending),
            // A slot holds a profile from an earlier store format or test layout, which the
            // keyboard neither reads nor converts (D-L64): it runs its built-in
            // defaults until a profile is saved.
            earlierFormat: Boolean(status?.storedEarlierFormat),
            busy: Boolean(state.busy),
            phase: state.phase || PHASE.CONNECTED,
            error: state.error ? failureSentence(state.error) : state.liveApply?.failure?.reason || "",
        },
    };
}

// Both halves agreeing is the thing worth seeing at a glance; anything else
// gets said plainly rather than hidden behind a green chip.
/** @param {Partial<import("./types.js").ProfileStatus> | null | undefined} status */
function convergence(status) {
    return HALVES_WORDS[halvesState(status)].label.toLowerCase();
}

// Which of the halves' words applies: agreeing, the slave half not seen over
// the split link at all, or seen but holding something else.
/** @param {Partial<import("./types.js").ProfileStatus> | null | undefined} status @returns {import("../../contracts/model.js").HalvesId} */
function halvesState(status) {
    if (!status) return "unread";
    if (halvesConverged(status)) return "agree";
    return status.slaveKnown ? "apart" : "alone";
}

/** @param {Partial<import("./types.js").ProfileStatus> | null | undefined} status */
function halvesConverged(status) {
    return Boolean(status &&
        status.slaveKnown === true &&
        status.slaveConverged === true &&
        !status.conflictCount &&
        status.activeGeneration === status.committedGeneration &&
        status.committedGeneration === status.slaveGeneration);
}

/** @param {number | undefined} value */
function hex(value) {
    return typeof value === "number" ? `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}` : "";
}

// What was read, then the device service's log as it keeps it, newest last:
// the faults whose own text no notice says (a code and its message, with what
// lay under it; operation-failure.js), connections and the keyboard's odd
// answers. The service bounds it (addDiagnostic).
/** @param {import("./types.js").DeviceModelInput} state */
function diagnosticsFor(state) {
    const notes = [];
    if (!state.layout || state.layout.state !== "read") {
        notes.push("Layout has not been read from the keyboard yet.");
    }
    if (state.committed?.state === "read") {
        notes.push(
            state.committed.source === "compiled"
                ? `Showing the firmware's compiled defaults (${state.committed.byteLength} bytes). This is what the keyboard is running, even if a newer profile is saved.`
                : `Committed profile generation ${state.committed.generation} read from the keyboard (${state.committed.byteLength} bytes).`
        );
        for (const failure of state.committed.failures || []) {
            notes.push(`Domain 0x${failure.domainId.toString(16)} did not decode: ${failure.message}`);
        }
    } else {
        notes.push("RGB and key behaviours need the committed profile read.");
    }
    if (state.combos?.state === "read") notes.push(`${state.combos.rows.length} combos read from the keyboard. Combos are ${state.combos.enabled ? "enabled" : "disabled"}.`);
    else notes.push(state.combos?.error?.message || "Combos have not been read from the keyboard yet.");
    return [...notes, ...(state.diagnostics || [])];
}

// The keyboard's own header and diagnostics, without the rest of the model:
// with a draft open the panel shows these from the keyboard and everything
// else from the draft.
/** @param {import("./types.js").DeviceModelInput} [state] */
const deviceSummary = (state = {}) => ({device: deviceHeader(state), diagnostics: diagnosticsFor(state)});

// What each listed keyboard is called: the product name it reports over USB,
// which is a renamed keyboard's new name once it has reconnected, or `name`
// where the panel already knows a newer stored one. Two that would read alike
// are told apart by serial number, or else by the number each keeps while it
// is listed; the number leads, so a shortened label keeps it.
/** @param {readonly {product?: string, serialNumber?: string, number?: number, name?: string}[]} devices @returns {string[]} */
function deviceLabels(devices) {
    const bases = devices.map(device => device.name || device.product || "Charybdis 4x6");
    return bases.map((base, index) => bases.indexOf(base) === bases.lastIndexOf(base) ? base
        : devices[index].serialNumber ? `${base} · ${devices[index].serialNumber}` : `Keyboard ${devices[index].number ?? index + 1} · ${base}`);
}

// The keyboard the service selected, as it lists it.
/** @template {{id: string}} D @param {{devices?: readonly D[], selectedDeviceId?: string | null}} state @returns {D | undefined} */
const selectedDevice = (state) => state.devices?.find((entry) => entry.id === state.selectedDeviceId);

module.exports = {buildDeviceModel, buildSnapshotModel, deviceLabels, deviceSummary, halvesConverged, keyboardLabel, selectedDevice};
