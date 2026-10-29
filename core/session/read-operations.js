// @ts-check
"use strict";
const {PHASE} = require("../model/vocabulary");
const {baseLighting} = require("../model/settings-editor");
const {unnamedKeyCount} = require("../model/key-names");
const {editorViews} = require("../model/profile-model");
const {validateSnapshot} = require("../model/portable-profile");
const {readSettingsLimits} = require("../protocol/portable-profile-v1");
const {readHostOs} = require("../protocol/host-os-v1");
const {readKeyboardOptions} = require("../protocol/keyboard-options-v1");
const {readDeviceCombos} = require("../protocol/combo-readback-v1");
const {decodeStoredProfileBlob, fnv1a32} = require("../schema/profile-blob-v1");
const {snapshotProfile} = require("./portable-profile-session");
const {snapshotLive} = require("./live-profile-session");
const {publicError} = require("./operation-failure");
const {baseRgbOf, committedRead, layoutOf, layoutRead, readActivePayload, readBaseLighting, readKeymap, requireCurrentRead} = require("./profile-reads");
const {readLiveFacts, readsLive} = require("./edit-mode-reads");

/**
 * @typedef {InstanceType<typeof import("./profile-device-service.js").ProfileDeviceService>} Service
 * @typedef {import("./types.js").DeviceConnection} Connection
 * @typedef {import("./types.js").DeviceCapabilities} Caps
 * @typedef {import("./types.js").ReadSnapshot} ReadSnapshot
 */

// The device service's reads of the keyboard's profile, each one operation
// (profile-device-service.js), and what the service keeps of each: the
// layout, the committed readback, combos, base RGB, and the complete
// snapshot the editors and the draft follow. What a read's bytes turn into
// is profile-reads.js.

// Reads the layout the keyboard is actually running and resolves each
// keycode through the vendored catalog. This is device-first: nothing here
// consults the authored source. Layer count comes from the firmware's own
// advertised capacity rather than from a compiled constant.
/** @param {Service} service */
async function readLayout(service) {
    if (!service.connection?.connected) service.refuse("Connect to a keyboard before reading its layout.");
    const layerCount = service.capabilities?.compiledLayerCount;
    if (typeof layerCount !== "number" || !Number.isInteger(layerCount) || layerCount < 1) {
        service.refuse("Refresh capabilities before reading the layout.");
    }

    return service.runOperation(PHASE.READ_LAYOUT, async () => {
        const connection = service.connectedConnection();

        let keymap;
        try {
            requireCurrentRead(service.capabilities);
            keymap = await readKeymap(connection, {nextRequestId: () => service.nextRequestId(), onProgress: progress => service.reportReadProgress("layout", progress)}, activeReads(service));
        } catch (error) {
            service.layout = {state: "unavailable", error: publicError(error), layers: [], progress: null};
            throw error;
        }
        if (service.connection !== connection || !connection.connected) {
            throw new Error("The keyboard disconnected while its layout was being read.");
        }

        acceptLayout(service, layoutOf(keymap, /** @type {number} */ (layerCount)));
    }, {initialize: () => {service.layout = {state: "reading", progress: {done: 0, total: 0}, layers: [], readAt: ""};}});
}

// The payload reads take the connection's reader, and publish each
// status they read (profile-reads.js).
/** @param {Service} service @returns {import("./profile-reads.js").ActiveReads} */
function activeReads(service) {
    return {reader: () => service.profilePayloadReader(), onStatus: status => {service.status = status;}};
}

/** @param {Service} service @param {ReturnType<typeof layoutOf>} layers */
function acceptLayout(service, layers) {
    service.layout = layoutRead(layers);
    const unknown = unnamedKeyCount(service.layout.layers, service.capabilities);
    service.addDiagnostic(
        unknown === 0
            ? `Read ${layers.length} layers from the keyboard.`
            : `Read ${layers.length} layers; ${unknown} keycodes are ones this app cannot name.`
    );
}

// Reads the committed profile off the keyboard and decodes it.
//
// This is the read D-026 requires and the first time the app can show RGB
// and key behaviours as the device actually holds them, rather than as the
// authored source describes them; a domain that fails to decode leaves the
// others readable (profile-reads.js committedRead).
// `reuse`: a read made right after one that downloaded and checked the
// saved profile may take those bytes again, only while the keyboard's
// fresh metadata still names exactly them (rereadKeyboard). Otherwise the
// saved bytes always download.
/** @param {Service} service @param {{reuse?: boolean}} [options] */
async function readCommittedProfile(service, {reuse = false} = {}) {
    if (!service.connection?.connected) service.refuse("Connect to a keyboard before reading its profile.");

    return service.runOperation(PHASE.READ_PROFILE, async () => {
        requireCurrentRead(service.capabilities);
        const connection = service.connectedConnection();

        /** @type {import("../protocol/types.js").ReadOptions & {onProgress: (progress: import("../../contracts/model.js").CountedProgress) => void}} */
        const readOptions = {
            nextRequestId: () => service.nextRequestId(),
            onProgress: progress => service.reportReadProgress("profile", progress),
        };
        const {read, source} = await readActivePayload(connection, readOptions, activeReads(service), reuse);
        if (service.connection !== connection || !connection.connected) {
            throw new Error("The keyboard disconnected while its profile was being read.");
        }
        acceptCommitted(service, read, source);
    }, {initialize: () => {service.committed = {state: "reading", progress: {done: 0, total: 0}};}});
}

/** @param {Service} service @param {{metadata: Pick<import("../protocol/types.js").PayloadMetadata, "generation" | "digest" | "schema" | "originHalf">, bytes: Buffer}} read @param {string} source */
function acceptCommitted(service, read, source) {
    const {metadata, bytes} = read;
    const committed = committedRead(read, source, service.capabilities);
    service.committed = committed;
    const {failures} = committed;
    const described = source === "compiled"
        ? "the firmware's compiled defaults"
        : `committed generation ${metadata.generation}`;
    service.addDiagnostic(
        failures.length
            ? `Read ${described}; ${failures.length} domain${failures.length === 1 ? "" : "s"} failed to decode.`
            : `Read ${described} from the keyboard (${bytes.length} bytes).`
    );
}

// Optional: never rejects. A failure while connected is recorded as
// `combos: {state: "unavailable", error}`; a lost connection clears it.
/** @param {Service} service */
async function readCombos(service) {
    return service.readOptional(PHASE.READ_COMBOS, async () => {
        const connection = service.connection;
        try {
            if (!connection?.connected) throw new Error("Connect to a keyboard before reading combos.");
            requireCurrentRead(service.capabilities);
            const read = await readDeviceCombos(connection, {nextRequestId: () => service.nextRequestId()});
            if (service.connection !== connection || !connection.connected) return service.snapshot();
            service.combos = {state: "read", ...read, readAt: new Date().toISOString()};
        } catch (error) {
            if (service.connection !== connection) return service.snapshot();
            service.combos = connection?.connected ? {state: "unavailable", error: publicError(error)} : undefined;
        }
        return service.snapshot();
    }, () => {service.combos = {state: "reading"};});
}

// Optional: never rejects. A failure while connected is recorded as
// `baseRgb: {state: "unavailable", error}` and a diagnostic, leaving
// `error` and the profile alone; a lost connection clears it.
/** @param {Service} service */
async function readBaseRgb(service) {
    return service.readOptional(PHASE.READ_BASE_RGB, async () => {
        const connection = service.connection;
        try {
            if (!connection?.connected) throw new Error("Connect to a keyboard before reading the background effect.");
            requireCurrentRead(service.capabilities);
            const settings = await readBaseLighting(connection, service.requestSequence());
            if (service.connection !== connection || !connection.connected) return service.snapshot();
            service.baseRgb = {state: "read", ...settings, readAt: new Date().toISOString()};
        } catch (error) {
            if (service.connection !== connection) return service.snapshot();
            if (!connection?.connected) {
                service.baseRgb = undefined;
            } else {
                // This optional read must not discard a usable profile or
                // mask an earlier layout/profile error. Clear stale colour.
                service.baseRgb = {state: "unavailable", error: publicError(error)};
                service.addDiagnostic(`Base RGB: ${service.baseRgb.error?.message}`);
            }
        }
        return service.snapshot();
    }, () => {service.baseRgb = {state: "reading"};});
}

// One coherent snapshot supplies the editor and the draft
// (readKeyboardProfile); a standalone export (readPortableProfile) uses the
// same read without replacing the editor's state.
/** @param {Service} service @param {{forRestore?: boolean; reuseReadback?: boolean; forEditor?: boolean}} [options] @returns {Promise<ReadSnapshot>} */
async function readCompleteProfile(service, {forRestore = false, reuseReadback = false, forEditor = false} = {}) {
    if (!service.connection?.connected || service.busy) service.refuse("Connect the keyboard and wait for the current operation to finish.");
    /** @type {ReadSnapshot | undefined} */
    let result;
    await service.runOperation(PHASE.READ_COMPLETE, async () => {
        service.portableProgress = "";
        try {
            const connection = service.connectedConnection();
            const capabilities = service.profileCapabilities();
            if (await readsLive(service, connection)) {
                result = await readLiveProfile(service, connection, capabilities, forEditor);
                if (forEditor || forRestore) adoptPortable(service, result);
                return;
            }
            const snapshot = await snapshotProfile(connection, service.requestSequence(), capabilities,
                message => service.reportReadProgress("portable", message), false, forRestore,
                {sleep: service.sleep, payloadReader: service.profilePayloadReader(), reuseReadback});
            const {readback, ...withoutReadback} = snapshot;
            result = withoutReadback;
            Object.assign(result, await readDeviceFacts(service, connection));
            if (forEditor) {
                if (snapshot.incomplete) throw new Error("The keyboard did not return a complete editor profile.");
                const decoded = validateSnapshot(snapshot.document);
                const baseRgb = {state: /** @type {const} */ ("read"), ...baseRgbOf(baseLighting(decoded.settings.values)),
                    readAt: new Date().toISOString()};
                if (service.connection !== connection || !connection.connected) throw new Error("The keyboard disconnected while its profile was being read.");
                acceptLayout(service, layoutOf(decoded.layers, decoded.layers.length));
                acceptCommitted(service, snapshot.readback.active, snapshot.readback.source);
                service.status = result.status;
                service.combos = {state: "read", ...snapshot.readback.combos, readAt: new Date().toISOString()};
                service.baseRgb = baseRgb;
                // Review and save shows a toggle a key turned off as well.
                await readLiveFacts(service, connection);
            }
            // Export is an independent snapshot. Only an editor read or a
            // restore/rebase read changes the state the editor follows.
            if (forEditor || forRestore) adoptPortable(service, result);
            service.portableProgress = "";
        } finally {service.portableProgress = "";}
    });
    if (!result) throw new Error("The keyboard operation returned no verified profile.");
    return result;
}

// The working copy and the saved profile, read together
// (live-profile-session.js), with what the keyboard accepts beside them.
/** @param {Service} service @param {Connection} connection @param {Caps} capabilities @param {boolean} forEditor @returns {Promise<import("./types.js").LiveSnapshot>} */
async function readLiveProfile(service, connection, capabilities, forEditor) {
    const snapshot = await snapshotLive(connection, service.requestSequence(), capabilities, {payloadReader: service.profilePayloadReader(), sleep: service.sleep,
        onProgress: message => service.reportReadProgress("portable", message)});
    const facts = await readDeviceFacts(service, connection);
    if (service.connection !== connection || !connection.connected) throw new Error("The keyboard disconnected while its profile was being read.");
    /** @type {import("./types.js").LiveSnapshot} */
    const result = {...snapshot, ...facts, saved: {...snapshot.saved, ...facts}};
    service.status = snapshot.status;
    service.runtime = snapshot.runtime;
    if (service.editMode) service.editMode = {...service.editMode, mode: snapshot.live.mode};
    if (forEditor) {
        const decoded = validateSnapshot(result.document);
        const lighting = baseLighting(decoded.settings.values);
        acceptLayout(service, layoutOf(decoded.layers, decoded.layers.length));
        // What the editors follow is what the keyboard runs; its schema
        // is the blob's own, its generation the saved one it began from.
        const working = snapshot.live.working;
        acceptCommitted(service, {metadata: {generation: snapshot.live.savedGeneration, digest: fnv1a32(working),
            schema: decodeStoredProfileBlob(working).schema, originHalf: snapshot.live.savedOrigin},
        bytes: working}, snapshot.live.unsaved ? "working" : snapshot.live.savedGeneration ? "committed" : "compiled");
        if (snapshot.combosReadback) service.combos = {state: "read", ...snapshot.combosReadback, readAt: new Date().toISOString()};
        service.baseRgb = {state: "read", ...baseRgbOf(lighting), readAt: new Date().toISOString()};
    }
    return result;
}

// What the keyboard accepts beside its profile: its settings limits, its
// lighting effects and the host OS it detected. A profile already read
// from this connection supplies the first two; the host OS is always read
// fresh. Read before anything is written.
/** @param {Service} service @param {Connection} connection @param {Pick<ReadSnapshot, "limits" | "options">} [known] */
async function readDeviceFacts(service, connection, known) {
    const limits = known?.limits || await readSettingsLimits(connection, service.requestSequence());
    const options = known?.options || await readKeyboardOptions(connection, service.requestSequence());
    return {limits, options, hostOs: await readHostOs(connection, service.requestSequence())};
}

// The profile the editors follow, with their views (profile-model.js).
/** @param {Service} service @param {ReadSnapshot} result */
function adoptPortable(service, result) {
    service.portable = result;
    ({settingsView: service.settingsView, macroView: service.macroView, customKeyView: service.customKeyView} = editorViews(result, service.capabilities));
}

module.exports = {readLayout, readCommittedProfile, readCombos, readBaseRgb, readCompleteProfile, readLiveProfile, readDeviceFacts, adoptPortable};
