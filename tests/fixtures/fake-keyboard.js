"use strict";

// A simulated Charybdis that answers the device protocol byte for byte, for
// tests and for a Node-side bridge that forwards a browser's reports.
//
// It holds one portable profile document and serves it the way current
// firmware does: VIA identity and keymap, Profile Wire capabilities and
// status, the committed and compiled payloads, combos, settings, storage
// status, keyboard options and the VIA storage banks. A complete read through
// ProfileDeviceService therefore reproduces the document.
//
// It is read-only. Every request it does not serve gets QMK's unhandled echo,
// a definite refusal; a request that would change the keyboard is recorded in
// `mutations` and refused the same way, so nothing ever looks applied.

const {FakeDeviceAdapter} = require("../../core/transport/fake-device-adapter");
const {RAW_HID_REPORT_SIZE} = require("../../core/transport/device-adapter");
const {VIA_UNHANDLED} = require("../../core/protocol/via-unhandled-v1");
const {PROFILE_ACTIVE_KIND, PROFILE_STATE_FLAGS, PROFILE_WIRE_KNOWN_MASKS, PROFILE_WIRE_V1, VIA_READS} = require("../../core/protocol/profile-wire-v1");
const {PROFILE_PAYLOAD_V1} = require("../../core/protocol/profile-payload-v1");
const {COMBO_READBACK_V1} = require("../../core/protocol/combo-readback-v1");
const {PROFILE_CANDIDATE_V1, CANDIDATE_STATE} = require("../../core/protocol/profile-candidate-v1");
const {VIA_LAYOUT_COMMANDS} = require("../../core/protocol/via-layout-v1");
const {VIA_STORAGE, viaStorageDigest} = require("../../core/protocol/via-storage-v1");
const {PROFILE_DOMAIN_IDS, crc32, decodeProfileBlob, fnv1a32} = require("../../core/schema/profile-blob-v1");
const {nativeCode} = require("../../core/schema/actions");
const {validateSnapshot} = require("../../core/model/portable-profile");
const {baseLighting} = require("../../core/model/settings-editor");
const {rehash} = require("./device-combos");
const keyboardOptions = require("./keyboard-options");

const PAGE = PROFILE_WIRE_V1.PAYLOAD_SIZE;
// Profile Wire values this keyboard serves (COMMAND_GET, channel 0).
const VALUE = {CAPABILITIES: 1, STATUS: 2, COMMITTED: PROFILE_PAYLOAD_V1.VALUE, COMPILED: PROFILE_PAYLOAD_V1.COMPILED_VALUE,
    COMBOS: COMBO_READBACK_V1.VALUE, SETTINGS: 7, STORAGE: 8, CANDIDATE_STATUS: PROFILE_CANDIDATE_V1.VALUE_STATUS};
// VIA commands that change the keyboard: set keyboard value, set keycode,
// keymap reset, custom set (Profile Wire SET, RGB Matrix set), custom save,
// EEPROM reset, bootloader jump, macro write and reset, layout write, encoder set.
const MUTATING_COMMANDS = new Set([0x03, 0x05, 0x06, 0x07, 0x09, 0x0a, 0x0b, 0x0f, 0x10, 0x13, 0x15]);
// Every feature current firmware advertises; it never advertises the retired ones.
const FEATURES = PROFILE_WIRE_KNOWN_MASKS.FEATURE_FLAGS & ~PROFILE_WIRE_KNOWN_MASKS.RETIRED_FEATURES;

// The domain versions current firmware stores, and refuses any other.
const CURRENT_DOMAINS = "16:4,32:2,48:3,64:6,80:3";

// `compiled` is the profile it was built with, which GET 0x05 serves: the
// document's own unless given (current firmware's carries every domain, with
// its authored combos and factory settings). `compiledOnly` runs those
// defaults, with nothing committed; the live combo and settings readbacks
// still answer from the document.
function fakeKeyboard({document, compiled, compiledOnly = false, generation = 42, firmwareVersion = 0x00010000, brightnessMax = 255, options = keyboardOptions.wire()} = {}) {
    const held = validateSnapshot(document);
    if (document.version !== 3 || document.layers.length !== 16) throw new Error("The fake keyboard runs current firmware: a schema-3, sixteen-layer document.");
    const versions = blob => decodeProfileBlob(blob).domains.map(domain => `${domain.id}:${domain.version}`).join();
    if (versions(held.profile) !== CURRENT_DOMAINS || (compiled && versions(compiled) !== CURRENT_DOMAINS)) throw new Error("The fake keyboard runs current firmware: RGB 4, key behaviours 2, combos 3, settings 6 and PD 3.");
    const profile = held.profile, digest = fnv1a32(profile), defaults = compiled || profile;
    const settings = decodeProfileBlob(profile).domains.find(domain => domain.id === PROFILE_DOMAIN_IDS.SETTINGS).payload;
    const storageDigest = viaStorageDigest({layout: held.layout, macros: held.macros});

    const capabilities = [page(25, (p) => {
        p.set([2, 3, 1, 0, 3, 0, RAW_HID_REPORT_SIZE, PROFILE_CANDIDATE_V1.CHUNK_MAX, PROFILE_WIRE_V1.STATUS_PAGE_COUNT]);
        p.writeUInt32LE(FEATURES, 9); p.writeUInt32LE(document.actionAbiDigest, 13);
        p.writeUInt32LE(firmwareVersion, 17); p.writeUInt32LE(fnv1a32(defaults), 21);
    }), page(25, (p) => {
        // Layers, behaviour rows, tap depth, (steps on page 2), combos, keys
        // per combo, RGB groups, stage rows, LEDs, LED bitmap, custom keys, macros.
        p.set([16, 16, 128, 5, 0, 128, 16, 16, 32, 58, 8, 128, 128]);
        p.writeUInt16LE(65504, 13); p.writeUInt16LE(65504, 15);
        p.writeUInt16LE(held.macros.length, 19); p[21] = 31;
    }), page(25, (p) => {
        // Populated steps, tap depth, slot size, name bytes, mask bits, positions.
        p.writeUInt16LE(640, 0); p[2] = 5; p.writeUInt32LE(65536, 3); p.set([32, 32, 60], 7);
    })];
    // Committed (or running its defaults), converged with the other half,
    // nothing pending.
    const status = [page(25, (p) => {
        p.set([1, 2]);
        p.writeUInt16LE((compiledOnly ? PROFILE_STATE_FLAGS.ACTIVE_IS_COMPILED_DEFAULT : PROFILE_STATE_FLAGS.COMMITTED_VALID) | PROFILE_STATE_FLAGS.PEER_KNOWN | PROFILE_STATE_FLAGS.PEER_CONVERGED, 2);
        for (const offset of [4, 8]) p.writeUInt32LE(fnv1a32(defaults), offset);
        p.writeUInt32LE(compiledOnly ? fnv1a32(defaults) : digest, 12);
        if (!compiledOnly) p.writeUInt32LE(digest, 20);
        p[24] = compiledOnly ? PROFILE_ACTIVE_KIND.COMPILED_ONLY : PROFILE_ACTIVE_KIND.COMMITTED;
    }), page(25, (p) => {
        if (compiledOnly) return;
        p.writeUInt32LE(generation, 0); p.writeUInt32LE(generation, 5); p.writeUInt32LE(generation, 10);
    })];
    const candidateStatus = [page(25, (p) => {
        p.set([1, CANDIDATE_STATE.IDLE, 0, 0]);
        p.fill(0xff, 15, 23);
    })];
    const storage = [page(25, (p) => {
        p.set([1, 4]);
        p.writeUInt32LE(generation, 2); p.writeUInt32LE(storageDigest, 6);
        p.writeUInt32LE(generation, 10); p.writeUInt32LE(storageDigest, 14); p.writeUInt32LE(generation, 18);
    }), Buffer.from([1, brightnessMax]), options.metadata, ...chunks(options.bytes)];
    const values = {
        [VALUE.CAPABILITIES]: capabilities,
        [VALUE.STATUS]: status,
        ...(compiledOnly ? {} : {[VALUE.COMMITTED]: payloadPages(profile, generation)}),
        [VALUE.COMPILED]: payloadPages(defaults, 0),
        [VALUE.COMBOS]: comboPages(held.combos, held.settings.layers.map(record => record.reference)),
        [VALUE.SETTINGS]: storedPages(settings),
        [VALUE.STORAGE]: storage,
        [0x0b]: [Buffer.from([1, 0])],
        [VALUE.CANDIDATE_STATUS]: candidateStatus,
    };
    const lighting = baseLighting(held.settings.values);
    const rgb = {1: [lighting.brightness], 2: [lighting.effect], 3: [lighting.speed], 4: [lighting.hue, lighting.saturation]};

    const keyboard = {requests: [], mutations: [], unhandled: [], answer};
    function answer(report) {
        const request = Buffer.alloc(RAW_HID_REPORT_SIZE);
        Buffer.from(report).copy(request);
        keyboard.requests.push(request);
        if (MUTATING_COMMANDS.has(request[0])) keyboard.mutations.push(request);
        const response = serve(request);
        if (response) return [response];
        keyboard.unhandled.push(request);
        const echo = Buffer.from(request); echo[0] = VIA_UNHANDLED;
        return [echo];
    }
    function serve(request) {
        const reply = Buffer.from(request);
        switch (request[0]) {
            case VIA_READS.COMMAND_GET_PROTOCOL_VERSION:
                reply.fill(0, 1); reply.writeUInt16BE(VIA_READS.PROTOCOL_VERSION, 1);
                return reply;
            case VIA_READS.COMMAND_GET_KEYBOARD_VALUE:
                if (request[1] !== VIA_READS.VALUE_FIRMWARE_VERSION) return undefined;
                reply.fill(0, 2); reply.writeUInt32BE(firmwareVersion, 2);
                return reply;
            case VIA_LAYOUT_COMMANDS.GET_KEYCODE: {
                const [layer, row, column] = request.subarray(1, 4);
                if (layer >= 16 || row >= 10 || column >= 6) return undefined;
                reply.fill(0, 4); reply.writeUInt16BE(document.layers[layer][row * 6 + column], 4);
                return reply;
            }
            case PROFILE_WIRE_V1.COMMAND_GET:
                if (request[1] === 3) return rgbValue(request, reply);
                if (request[1] !== PROFILE_WIRE_V1.CHANNEL) return undefined;
                return profileValue(values[request[2]]?.[request[4] | (request[5] << 8)], reply);
            case VIA_STORAGE.LAYER_COUNT: return scalar(reply, [16]);
            case VIA_STORAGE.MACRO_COUNT: return scalar(reply, [128]);
            case VIA_STORAGE.MACRO_SIZE: return scalar(reply, [held.macros.length >> 8, held.macros.length & 255]);
            case VIA_STORAGE.LAYOUT_READ: return region(held.layout, request, reply);
            case VIA_STORAGE.MACRO_READ: return region(held.macros, request, reply);
            default: return undefined;
        }
    }
    // VIA's RGB Matrix channel: brightness, effect, speed and colour, as the
    // document's saved base lighting has them.
    function rgbValue(request, reply) {
        const bytes = rgb[request[2]];
        if (!bytes) return undefined;
        reply.fill(0, 3); reply.set(bytes, 3);
        return reply;
    }
    return keyboard;
}

// A Profile Wire answer: the request's correlation header, status OK, the
// page's length and its bytes.
function profileValue(payload, reply) {
    if (!payload) return undefined;
    reply.fill(0, 5); reply[6] = payload.length; payload.copy(reply, PROFILE_WIRE_V1.PAYLOAD_OFFSET);
    return reply;
}
function scalar(reply, bytes) {
    reply.fill(0, 1); reply.set(bytes, 1);
    return reply;
}
function region(bytes, request, reply) {
    const offset = request.readUInt16BE(1), count = request[3];
    if (count < 1 || count > VIA_STORAGE.CHUNK || offset + count > bytes.length) return undefined;
    reply.fill(0, 4); bytes.copy(reply, 4, offset, offset + count);
    return reply;
}

function page(length, fill) {
    const bytes = Buffer.alloc(length); fill(bytes); return bytes;
}
function chunks(bytes) {
    const pages = [];
    for (let offset = 0; offset < bytes.length; offset += PAGE) pages.push(Buffer.from(bytes.subarray(offset, offset + PAGE)));
    return pages;
}
// A profile payload: metadata, then the blob in 25-byte pages.
function payloadPages(blob, generation) {
    const metadata = page(25, (p) => {
        p.set([PROFILE_PAYLOAD_V1.LAYOUT_VERSION, PAGE]);
        p.writeUInt16LE(blob.length, 2); p.writeUInt32LE(generation, 4);
        p.writeUInt32LE(fnv1a32(blob), 8); p.writeUInt32LE(crc32(blob), 12);
        p.set([2, 0, 31, 0, 0], 16);
    });
    return [metadata, ...chunks(blob)];
}
// Settings: length, CRC and digest, then the bytes.
function storedPages(bytes) {
    const metadata = page(12, (p) => {
        p.set([1, PAGE]); p.writeUInt16LE(bytes.length, 2);
        p.writeUInt32LE(crc32(bytes), 4); p.writeUInt32LE(fnv1a32(bytes), 8);
    });
    return [metadata, ...chunks(bytes)];
}
// The combo table as the keyboard reports it (readout version 3): keycodes,
// not actions, with each layer's reference from the settings' layer records.
function comboPages(table, references) {
    const rows = table.rows;
    const metadata = page(25, (p) => {
        p.set([COMBO_READBACK_V1.VERSION, rows.length, COMBO_READBACK_V1.MAX_INPUTS, 16, 1, 0]);
        p.writeUInt16LE(table.defaultTermMs, 10); p.writeUInt16LE(table.holdTermMs, 12); p[14] = COMBO_READBACK_V1.PAGES_PER_ROW;
    });
    const referencePage = page(25, (p) => p.set(references));
    const code = (action) => {
        const value = nativeCode(action);
        if (value === undefined) throw new Error("A combo in this document has no keycode the keyboard could report.");
        return value;
    };
    const pages = rows.flatMap((row, id) => {
        const slots = Buffer.alloc(32);
        row.inputs.forEach((input, slot) => slots.writeUInt16LE(code(input), 2 * slot));
        return [page(25, (p) => {
            p.set([id, row.inputs.length]);
            p.writeUInt16LE(code(row.output), 2);
            p.writeUInt16LE(row.termMs ?? table.defaultTermMs, 4);
            p[6] = (row.mustHold ? 1 : 0) | (row.mustTap ? 2 : 0) | (row.ordered ? 4 : 0) | (row.termMs === null ? 8 : 0) | (row.enabled === false ? 16 : 0);
            p.writeUInt32LE(row.allowedLayers ?? 0xffff, 7);
            slots.copy(p, 11, 0, 14);
        }), page(25, (p) => slots.copy(p, 0, 14, 32))];
    });
    return rehash([metadata, referencePage, ...pages]);
}

// A FakeDeviceAdapter wired to a fake keyboard: each written report is
// answered on a microtask, as a real device answers after the write returns.
// `adapter.keyboard` is the keyboard, for its records.
function fakeKeyboardAdapter(options = {}) {
    const keyboard = options.keyboard || fakeKeyboard(options);
    const adapter = new FakeDeviceAdapter({
        devices: [{id: "fake-charybdis", product: "Charybdis 4x6", manufacturer: "Bastard Keyboards", serialNumber: "FAKE-1"}],
        onWrite({connection, report}) {
            const responses = keyboard.answer(report);
            queueMicrotask(() => responses.forEach((response) => connection.emitReport(response)));
        },
    });
    adapter.keyboard = keyboard;
    return adapter;
}

module.exports = {fakeKeyboard, fakeKeyboardAdapter};
