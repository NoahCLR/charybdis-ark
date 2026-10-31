// @ts-check
"use strict";
const {baseLighting} = require("../model/settings-editor");
const {unnamedKeyCount} = require("../model/key-names");
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
 * @typedef {import("./profile-device-service.js").Operation} Operation
 * @typedef {import("./types.js").DeviceConnection} Connection
 * @typedef {import("./types.js").DeviceCapabilities} Caps
 * @typedef {import("./types.js").ReadSnapshot} ReadSnapshot
 */

// The work of the device service's profile reads, each one operation
// (profile-device-service.js), and what the service keeps of each in its
// connection state (connection-state.js): the layout, the committed
// readback, combos, base RGB, and the complete snapshot the editors and the
// draft follow. What a read's bytes turn into is profile-reads.js.

// Reads the layout the keyboard is actually running and resolves each
// keycode through the vendored catalog. This is device-first: nothing here
// consults the authored source. Layer count comes from the firmware's own
// advertised capacity rather than from a compiled constant.
/** @param {Operation} op @param {number} layerCount */
async function readLayout(op, layerCount) {
    const connection = op.connection;
    let keymap;
    try {
        requireCurrentRead(op.state.capabilities);
        keymap = await readKeymap(connection, {nextRequestId: op.nextRequestId, onProgress: progress => op.progress("layout", progress)}, activeReads(op));
    } catch (error) {
        op.state.layout = {state: "unavailable", error: publicError(error), layers: [], progress: null};
        throw error;
    }
    if (!op.current()) {
        throw new Error("The keyboard disconnected while its layout was being read.");
    }

    acceptLayout(op, layoutOf(keymap, layerCount));
}

// The payload reads take the connection's reader, and publish each
// status they read (profile-reads.js).
/** @param {Operation} op @returns {import("./profile-reads.js").ActiveReads} */
function activeReads(op) {
    return {reader: op.reader, onStatus: status => {op.state.status = status;}};
}

/** @param {Operation} op @param {ReturnType<typeof layoutOf>} layers */
function acceptLayout(op, layers) {
    const state = op.state;
    state.layout = layoutRead(layers);
    const unknown = unnamedKeyCount(state.layout.layers, state.capabilities);
    op.say(
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
// fresh metadata still names exactly them (readBack). Otherwise the
// saved bytes always download.
/** @param {Operation} op @param {{reuse?: boolean}} [options] */
async function readCommittedProfile(op, {reuse = false} = {}) {
    requireCurrentRead(op.state.capabilities);
    const connection = op.connection;

    /** @type {import("../protocol/types.js").ReadOptions & {onProgress: (progress: import("../../contracts/model.js").CountedProgress) => void}} */
    const readOptions = {
        nextRequestId: op.nextRequestId,
        onProgress: progress => op.progress("profile", progress),
    };
    const {read, source} = await readActivePayload(connection, readOptions, activeReads(op), reuse);
    if (!op.current()) {
        throw new Error("The keyboard disconnected while its profile was being read.");
    }
    acceptCommitted(op, read, source);
}

/** @param {Operation} op @param {{metadata: Pick<import("../protocol/types.js").PayloadMetadata, "generation" | "digest" | "schema" | "originHalf">, bytes: Buffer}} read @param {string} source */
function acceptCommitted(op, read, source) {
    const {metadata, bytes} = read;
    const committed = committedRead(read, source, op.state.capabilities);
    op.state.committed = committed;
    const {failures} = committed;
    const described = source === "compiled"
        ? "the firmware's compiled defaults"
        : `committed generation ${metadata.generation}`;
    op.say(
        failures.length
            ? `Read ${described}; ${failures.length} domain${failures.length === 1 ? "" : "s"} failed to decode.`
            : `Read ${described} from the keyboard (${bytes.length} bytes).`
    );
}

// Optional: never rejects. A failure while connected is recorded as
// `combos: {state: "unavailable", error}`; a lost connection clears it.
/** @param {Operation} op */
async function readCombos(op) {
    const state = op.state, connection = state.connection;
    try {
        if (!connection?.connected) throw new Error("Connect to a keyboard before reading combos.");
        requireCurrentRead(state.capabilities);
        const read = await readDeviceCombos(connection, {nextRequestId: op.nextRequestId});
        if (!op.current()) return;
        state.combosRead(read);
    } catch (error) {
        if (state.connection !== connection) return;
        state.combos = connection?.connected ? {state: "unavailable", error: publicError(error)} : undefined;
    }
}

// Optional: never rejects. A failure while connected is recorded as
// `baseRgb: {state: "unavailable", error}` and a diagnostic, leaving
// `error` and the profile alone; a lost connection clears it.
/** @param {Operation} op */
async function readBaseRgb(op) {
    const state = op.state, connection = state.connection;
    try {
        if (!connection?.connected) throw new Error("Connect to a keyboard before reading the background effect.");
        requireCurrentRead(state.capabilities);
        const settings = await readBaseLighting(connection, op.ids);
        if (!op.current()) return;
        state.baseRgbRead(settings);
    } catch (error) {
        if (state.connection !== connection) return;
        if (!connection?.connected) {
            state.baseRgb = undefined;
        } else {
            // This optional read must not discard a usable profile or
            // mask an earlier layout/profile error. Clear stale colour.
            state.baseRgb = {state: "unavailable", error: publicError(error)};
            op.say(`Base RGB: ${state.baseRgb.error?.message}`);
        }
    }
}

// One coherent snapshot supplies the editor and the draft
// (readKeyboardProfile); a standalone export (readPortableProfile) uses the
// same read without replacing the editor's state.
/** @param {Operation} op @param {{forRestore?: boolean; reuseReadback?: boolean; forEditor?: boolean}} [options] @returns {Promise<ReadSnapshot>} */
async function readCompleteProfile(op, {forRestore = false, reuseReadback = false, forEditor = false} = {}) {
    const state = op.state;
    state.portableProgress = "";
    try {
        const connection = op.connection;
        const capabilities = op.capabilities();
        if (await readsLive(op)) {
            const result = await readLiveProfile(op, forEditor);
            if (forEditor || forRestore) state.adoptPortable(result);
            return result;
        }
        const snapshot = await snapshotProfile(connection, op.ids, capabilities,
            message => op.progress("portable", message), false, forRestore,
            {sleep: op.sleep, payloadReader: op.reader(), reuseReadback});
        const {readback, ...withoutReadback} = snapshot;
        /** @type {ReadSnapshot} */
        const result = withoutReadback;
        Object.assign(result, await readDeviceFacts(op, connection));
        if (forEditor) {
            if (snapshot.incomplete) throw new Error("The keyboard did not return a complete editor profile.");
            const decoded = validateSnapshot(snapshot.document);
            const lighting = baseRgbOf(baseLighting(decoded.settings.values));
            if (!op.current()) throw new Error("The keyboard disconnected while its profile was being read.");
            acceptLayout(op, layoutOf(decoded.layers, decoded.layers.length));
            acceptCommitted(op, snapshot.readback.active, snapshot.readback.source);
            state.status = result.status;
            state.combosRead(snapshot.readback.combos);
            state.baseRgbRead(lighting);
            // Review and save shows a toggle a key turned off as well.
            await readLiveFacts(op);
        }
        // Export is an independent snapshot. Only an editor read or a
        // restore/rebase read changes the state the editor follows.
        if (forEditor || forRestore) state.adoptPortable(result);
        state.portableProgress = "";
        return result;
    } finally {state.portableProgress = "";}
}

// The working copy and the saved profile, read together
// (live-profile-session.js), with what the keyboard accepts beside them.
/** @param {Operation} op @param {boolean} forEditor @returns {Promise<import("./types.js").LiveSnapshot>} */
async function readLiveProfile(op, forEditor) {
    const state = op.state, connection = op.connection;
    const snapshot = await snapshotLive(connection, op.ids, op.capabilities(), {payloadReader: op.reader(), sleep: op.sleep,
        onProgress: message => op.progress("portable", message)});
    const facts = await readDeviceFacts(op, connection);
    if (!op.current()) throw new Error("The keyboard disconnected while its profile was being read.");
    /** @type {import("./types.js").LiveSnapshot} */
    const result = {...snapshot, ...facts, saved: {...snapshot.saved, ...facts}};
    state.status = snapshot.status;
    state.runtime = snapshot.runtime;
    if (state.editMode) state.editMode = {...state.editMode, mode: snapshot.live.mode};
    if (forEditor) {
        const decoded = validateSnapshot(result.document);
        const lighting = baseLighting(decoded.settings.values);
        acceptLayout(op, layoutOf(decoded.layers, decoded.layers.length));
        // What the editors follow is what the keyboard runs; its schema
        // is the blob's own, its generation the saved one it began from.
        const working = snapshot.live.working;
        acceptCommitted(op, {metadata: {generation: snapshot.live.savedGeneration, digest: fnv1a32(working),
            schema: decodeStoredProfileBlob(working).schema, originHalf: snapshot.live.savedOrigin},
        bytes: working}, snapshot.live.unsaved ? "working" : snapshot.live.savedGeneration ? "committed" : "compiled");
        if (snapshot.combosReadback) state.combosRead(snapshot.combosReadback);
        state.baseRgbRead(baseRgbOf(lighting));
    }
    return result;
}

// What the keyboard accepts beside its profile: its settings limits, its
// lighting effects and the host OS it detected. A profile already read
// from this connection supplies the first two; the host OS is always read
// fresh. Read before anything is written.
/** @param {Operation} op @param {Connection} connection @param {Pick<ReadSnapshot, "limits" | "options">} [known] */
async function readDeviceFacts(op, connection, known) {
    const limits = known?.limits || await readSettingsLimits(connection, op.ids);
    const options = known?.options || await readKeyboardOptions(connection, op.ids);
    return {limits, options, hostOs: await readHostOs(connection, op.ids)};
}

module.exports = {readLayout, readCommittedProfile, readCombos, readBaseRgb, readCompleteProfile, readLiveProfile, readDeviceFacts};
