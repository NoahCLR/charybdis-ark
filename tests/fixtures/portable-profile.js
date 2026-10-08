"use strict";
// Current firmware's profile as Ark's tests build it: the pinned compiled
// profile (compiled_profile_pd_v2.fixture: schema 2.0, RGB 3, key behaviours 1,
// combos 2, settings 5, sparse PD 2, slots 0-6 configured), materialized the
// way a keyboard read does, with these settings and a combo table standing in
// for the live readbacks.
const fs = require("node:fs");
const path = require("node:path");
const {createSnapshot, materializeProfile} = require("../../core/model/portable-profile");
const {encodeSettings} = require("../../core/schema/settings-domain-v1");
const {ACTION_ABI} = require("../../core/schema/actions");
const {LAYER_LOCK_BASE} = require("../../core/data/user-keycodes");

const FIXTURE = path.resolve(__dirname, "../../upstream/firmware/tests/fixtures/compiled_profile_pd_v2.fixture");
const CURRENT_CAPABILITIES = Object.freeze({compiledLayerCount: 8, supportedDomainMask: 31, schema: {major: 2}, actionAbiDigest: ACTION_ABI});

// Settings v5: values 10..14 are the retired pointing DPI and stay zero, and
// every macro and custom key name is empty.
function settings() {
    const values = [200, 150, 400, 150, 1, 4, 1200, 25, 1, 3, 0, 0, 0, 0, 0, 200, 400, 900000, 1200, 200, 1, 257, 0xc8ff00, 1, 0, 200, 10, 0x76543210];
    return {values, names: ["Base", "Numbers", "Symbols", "Navigation", "Pointer", "Extra 1", "Extra 2", "Extra 3"],
        macroNames: Array(64).fill(""), customKeyNames: Array(64).fill(""), formatVersion: 5};
}
const compiledBytes = () => Buffer.from(fs.readFileSync(FIXTURE, "utf8").match(/^profile.full.hex=(.+)$/m)[1], "hex");

// The compiled profile with an empty layout and no combos, unless given.
function compiled({combos = [], layout = Buffer.alloc(960), policy = settings()} = {}) {
    const bytes = compiledBytes();
    const profile = materializeProfile(bytes, bytes, {version: 2, defaultTermMs: 50, holdTermMs: 200, rows: combos}, encodeSettings(policy));
    return createSnapshot({profile, actionAbiDigest: ACTION_ABI, via: {layers: 8, layout, macros: Buffer.alloc(7191), macroSlots: 64}});
}

// A backup with keys on its layout (MO(1), LT(1, KC_N), LOCK_LAYER(4), a
// layer-mod and TT(1)) and a combo that follows the default window, so both
// banks and the combo readback carry something.
function document() {
    const layout = Buffer.alloc(960);
    [0x5221, 0x4131, LAYER_LOCK_BASE + 4, 0x5022, 0x52c1].forEach((code, index) => layout.writeUInt16BE(code, index * 2));
    return compiled({layout, combos: [{id: 0, inputs: [4, 5], output: 8, termMs: 50, followsDefault: true, mustHold: false, mustTap: false, ordered: false}]});
}

module.exports = {settings, compiled, document, CURRENT_CAPABILITIES};
