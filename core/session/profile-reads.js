// @ts-check
"use strict";

// What a read of the keyboard's profile turns into (read-operations.js):
// the payload it runs, checked against its status before and after; its
// keymap; the layout the editors draw and the committed readback, as the
// service publishes them; and its base lighting.

const {evaluateProfileCompatibility} = require("./firmware-support");
const {baseLighting} = require("../model/settings-editor");
const {readSettings} = require("../protocol/portable-profile-v1");
const {decodeSettings} = require("../schema/settings-domain-v1");
const {profileDomain, PROFILE_DOMAIN_IDS} = require("../schema/profile-domains");
const {profileDepthOptions} = require("../schema/profile-depth");
const {decodeKeymapDomain} = require("../schema/keymap-domain-v1");
const keycodeCatalog = require("../data/keycode-catalog");
const keycodes = require("../schema/keycodes");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, matrixPosition} = require("../data/charybdis-layout");
const {payloadMatchesActive} = require("./profile-payload-reader");
const {decodeStoredProfileBlob, firmwareUpdateRequired} = require("../schema/profile-blob-v1");
const {answered} = require("../schema/bytes");
const {PROFILE_ACTIVE_KIND, readProfileStatus} = require("../protocol/profile-wire-v1");

/**
 * @typedef {import("./types.js").DeviceConnection} Connection
 * @typedef {import("../protocol/types.js").ReadOptions} ReadOptions
 * @typedef {import("../protocol/types.js").PayloadRead} PayloadRead
 * @typedef {import("./types.js").ProfileStatus} Status
 * @typedef {{reader: () => InstanceType<typeof import("./profile-payload-reader.js").ProfilePayloadReader>, onStatus: (status: Status) => void}} ActiveReads
 * What a read of the active payload takes from its connection: the payload
 * reader, asked for once the status names what to read, and where each
 * status read goes.
 */

/** @param {Partial<import("./types.js").DeviceCapabilities> | null | undefined} capabilities */
function requireCurrentRead(capabilities) {
    if (!evaluateProfileCompatibility(capabilities).compatible) throw firmwareUpdateRequired();
}

// The keymap the keyboard types: its active profile's keymap domain, or
// the compiled default's when the saved profile has none (the firmware
// falls back to it the same way).
/** @param {Connection} connection @param {ReadOptions & {onProgress: (progress: import("../../contracts/model.js").CountedProgress) => void}} options @param {ActiveReads} reads */
async function readKeymap(connection, options, reads) {
    const {read, source} = await readActivePayload(connection, options, reads);
    /** @param {Uint8Array} bytes */
    const keymapOf = bytes => decodeStoredProfileBlob(bytes).domains.find(domain => domain.id === PROFILE_DOMAIN_IDS.KEYMAP);
    let found = keymapOf(read.bytes);
    if (!found && source === "committed") {
        found = keymapOf((await reads.reader().readCompiled(options)).bytes);
        await confirmActivePayload(connection, read, source, options, reads.onStatus);
    }
    if (!found) throw new Error("The keyboard's profile has no keymap.");
    return answered(() => decodeKeymapDomain(found.payload));
}

/** @param {Connection} connection @param {ReadOptions} options @param {ActiveReads} reads @param {boolean} [reuse] */
async function readActivePayload(connection, options, {reader, onStatus}, reuse = false) {
    const status = await readProfileStatus(connection, options);
    onStatus(status);
    const source = status.activeKind === PROFILE_ACTIVE_KIND.COMPILED_ONLY ? "compiled" : "committed";
    if (status.activeKind !== PROFILE_ACTIVE_KIND.COMPILED_ONLY && status.activeKind !== PROFILE_ACTIVE_KIND.COMMITTED) {
        throw activePayloadUnavailable();
    }
    const payloads = reader();
    const read = source === "compiled" ? await payloads.readCompiled(options) : await payloads.readCommitted({...options, reuse});
    // Read status again even if the first identity did not match: health
    // must report the keyboard now, including recovery that just finished.
    await confirmActivePayload(connection, read, source, options, onStatus);
    if (!payloadMatchesActive(read, status)) throw activePayloadUnavailable();
    return {read, source};
}

/** @param {Connection} connection @param {PayloadRead} read @param {string} source @param {ReadOptions} options @param {ActiveReads["onStatus"]} onStatus */
async function confirmActivePayload(connection, read, source, options, onStatus) {
    const status = await readProfileStatus(connection, options);
    onStatus(status);
    if ((source === "compiled") !== (status.activeKind === PROFILE_ACTIVE_KIND.COMPILED_ONLY)
        || !payloadMatchesActive(read, status)) throw activePayloadUnavailable();
}

function activePayloadUnavailable() {
    return Object.assign(new Error("The keyboard's active profile is unavailable: its readable payload does not match the profile it is running. Let both halves finish recovery, then read the keyboard again."), {code: "ACTIVE_PROFILE_UNAVAILABLE"});
}

// The visible keys of each layer, in layout order, from matrix-order layers.
/** @param {readonly (readonly number[])[]} keymap @param {number} layerCount */
function layoutOf(keymap, layerCount) {
    return keymap.slice(0, layerCount).map((keys, layer) => ({layer,
        positions: CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column], layoutIndex) => ({layoutIndex, row, column, keycode: keys[matrixPosition(layoutIndex)]}))}));
}

// The layout as read, each keycode resolved through the vendored catalog.
/** @param {ReturnType<typeof layoutOf>} layers */
function layoutRead(layers) {
    return {
        state: /** @type {const} */ ("read"),
        progress: null,
        readAt: new Date().toISOString(),
        catalog: keycodeCatalog.metadata(),
        layers: layers.map(({layer, positions}) => ({
            layer,
            keys: positions.map((position) => ({
                ...position,
                resolved: keycodes.resolve(position.keycode),
            })),
        })),
    };
}

// The committed readback: each domain decoded on its own. A domain that
// fails to decode is reported as such and leaves the others readable; the
// alternative is discarding a whole profile because one section drifted.
/** @param {{metadata: Pick<import("../protocol/types.js").PayloadMetadata, "generation" | "digest" | "schema" | "originHalf">, bytes: Buffer}} read @param {string} source @param {Partial<import("./types.js").DeviceCapabilities> | undefined} capabilities */
function committedRead({metadata, bytes}, source, capabilities) {
    const blob = decodeStoredProfileBlob(bytes);
    const rgb = blob.domains.find(domain => domain.id === PROFILE_DOMAIN_IDS.RGB);
    const depth = profileDepthOptions(capabilities, rgb?.payload);
    /** @type {import("./types.js").ReadDomains} */
    const domains = {};
    const failures = [];
    for (const domain of blob.domains) {
        try {
            const registered = profileDomain(domain.id);
            // The keymap and macros reach the editors through the layout
            // and the complete read, not this readback.
            if (registered?.readKey) Object.assign(domains, {[registered.readKey]: registered.decode(domain.payload, depth)});
        } catch (error) {
            failures.push({domainId: domain.id, message: error instanceof Error ? error.message : String(error)});
        }
    }
    return {
        state: /** @type {const} */ ("read"),
        source,
        progress: null,
        readAt: new Date().toISOString(),
        generation: metadata.generation,
        digest: metadata.digest,
        schema: metadata.schema,
        originHalf: metadata.originHalf,
        byteLength: bytes.length,
        domainIds: blob.domains.map((domain) => domain.id),
        domains,
        failures,
    };
}

// The base lighting a profile's settings set, as the base RGB read reports it.
/** @param {ReturnType<typeof baseLighting>} lighting */
const baseRgbOf = lighting => ({effectId: lighting.enabled ? lighting.effect : 0, brightness: lighting.brightness,
    hue: lighting.hue, saturation: lighting.saturation, speed: lighting.speed});

/** @param {Connection} connection @param {import("../protocol/types.js").RequestIds} requestIds */
async function readBaseLighting(connection, requestIds) {
    const settings = await readSettings(connection, requestIds);
    return baseRgbOf(baseLighting(answered(() => decodeSettings(settings)).values));
}

module.exports = {baseRgbOf, committedRead, layoutOf, layoutRead, readActivePayload, readBaseLighting, readKeymap, requireCurrentRead};
