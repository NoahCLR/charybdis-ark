// @ts-check
"use strict";
const {LAYERS, MATRIX_KEYS} = require("../data/charybdis-layout");
const {copyBytes, protocolError} = require("./bytes");

// Keymap domain 0x60, version 1 (firmware profile-wire-v1/keymap-domain.md): sixteen
// layers of sixty matrix positions, row first, then column, each a
// little-endian uint16 QMK keycode. The four unwired matrix positions are
// included. There is no header: the payload is exactly 1,920 bytes. Which
// keycodes a key may hold is the firmware's placement rule, checked by the
// model (profile-placement.js), not by this codec.
const KEYMAP_DOMAIN_V1 = Object.freeze({
    VERSION: 1,
    LAYERS,
    POSITIONS: MATRIX_KEYS,
    KEYCODE_SIZE: 2,
    SIZE: LAYERS * MATRIX_KEYS * 2,
});

const KeymapDomainError = protocolError("KeymapDomainError");

// The layers as a portable document holds them: one array of 60 matrix-order
// keycodes per layer.
/** @param {readonly (readonly number[])[]} layers @returns {Buffer} */
function encodeKeymapDomain(layers) {
    if (!Array.isArray(layers) || layers.length !== LAYERS) throw new KeymapDomainError("INVALID_LAYERS", `The keymap needs all ${LAYERS} layers.`);
    const output = Buffer.alloc(KEYMAP_DOMAIN_V1.SIZE);
    Array.from(layers).forEach((keys, layer) => {
        if (!Array.isArray(keys) || keys.length !== MATRIX_KEYS) throw new KeymapDomainError("INVALID_LAYERS", `Layer ${layer} needs all ${MATRIX_KEYS} matrix positions.`, {layer});
        Array.from(keys).forEach((keycode, position) => {
            if (!Number.isInteger(keycode) || keycode < 0 || keycode > 0xffff) throw new KeymapDomainError("INVALID_KEYCODE", `Layer ${layer} position ${position} is not a 16-bit keycode.`, {layer, position});
            output.writeUInt16LE(keycode, (layer * MATRIX_KEYS + position) * KEYMAP_DOMAIN_V1.KEYCODE_SIZE);
        });
    });
    return output;
}

/** @param {Uint8Array} value @returns {number[][]} */
function decodeKeymapDomain(value) {
    const bytes = copyBytes(value, "Keymap domain");
    if (bytes.length !== KEYMAP_DOMAIN_V1.SIZE) throw new KeymapDomainError("INVALID_LENGTH", `The keymap domain is ${bytes.length} bytes; version 1 is exactly ${KEYMAP_DOMAIN_V1.SIZE}.`);
    return Array.from({length: LAYERS}, (_, layer) => Array.from({length: MATRIX_KEYS}, (_, position) =>
        bytes.readUInt16LE((layer * MATRIX_KEYS + position) * KEYMAP_DOMAIN_V1.KEYCODE_SIZE)));
}

module.exports = {KEYMAP_DOMAIN_V1, KeymapDomainError, encodeKeymapDomain, decodeKeymapDomain};
