// @ts-check
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
const {RAW_HID_UNHANDLED} = require("../../core/protocol/raw-hid-unhandled");
const {PROFILE_ACTIVE_KIND, PROFILE_STATE_FLAGS, PROFILE_WIRE_KNOWN_MASKS, PROFILE_WIRE_V1} = require("../../core/protocol/profile-wire-v1");
const {PROFILE_PAYLOAD_V1} = require("../../core/protocol/profile-payload-v1");
const {COMBO_READBACK_V1} = require("../../core/protocol/combo-readback-v1");
const {PROFILE_CANDIDATE_V1, CANDIDATE_STATE} = require("../../core/protocol/profile-candidate-v1");
const {PROFILE_DOMAIN_IDS, crc32, decodeProfileBlob, fnv1a32} = require("../../core/schema/profile-blob-v1");
const {nativeCode} = require("../../core/schema/actions");
const {validateSnapshot} = require("../../core/model/portable-profile");
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
// Every feature the current flashable pair advertises.
const FEATURES = PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES;

// The domain versions current firmware stores, and refuses any other.
const CURRENT_DOMAINS = "16:4,32:2,48:3,64:8,80:3,96:1,112:1";

// `compiled` is the profile it was built with, which GET 0x05 serves: the
// document's own unless given (current firmware's carries every domain, with
// its authored combos and factory settings). `compiledOnly` runs those
// defaults, with nothing committed; the live combo and settings readbacks
// still answer from the document. `settingsVersion` is the version its
// settings readback reports: any but 8 is firmware Ark does not read.
/** @param {import("./types.js").FakeKeyboardOptions} options @returns {import("./types.js").FakeKeyboard} */
function fakeKeyboard({document, compiled, settingsVersion = 8, compiledOnly = false, slaveKnown = true, generation = 42, firmwareVersion = 0x00010000, brightnessMax = 255, options = keyboardOptions.wire()}) {
    const held = validateSnapshot(document);
    if (document.version !== 5 || held.layers.length !== 16) throw new Error("The fake keyboard runs current firmware: a schema-4, sixteen-layer document.");
    /** @param {Buffer} blob */
    const versions = blob => decodeProfileBlob(blob).domains.map(domain => `${domain.id}:${domain.version}`).join();
    if (versions(held.candidate) !== CURRENT_DOMAINS || (compiled && versions(compiled) !== CURRENT_DOMAINS)) throw new Error("The fake keyboard runs current firmware: RGB 4, key behaviours 2, combos 3, settings 8, PD 3, keymap 1 and macros 1.");
    const profile = held.candidate, digest = fnv1a32(profile), defaults = compiled || profile;
    const settingsDomain = decodeProfileBlob(profile).domains.find(domain => domain.id === PROFILE_DOMAIN_IDS.SETTINGS);
    if (!settingsDomain) throw new Error("The fake keyboard fixture must contain settings.");
    const settings = settingsDomain.payload;

    const capabilities = [page(25, (p) => {
        p.set([PROFILE_WIRE_V1.CAPABILITY_LAYOUT, 3, PROFILE_WIRE_V1.PROTOCOL_MAJOR, PROFILE_WIRE_V1.PROTOCOL_MINOR, 4, 0, RAW_HID_REPORT_SIZE, PROFILE_CANDIDATE_V1.CHUNK_MAX, PROFILE_WIRE_V1.STATUS_PAGE_COUNT]);
        p.writeUInt32LE(FEATURES, 9); p.writeUInt32LE(document.actionAbiDigest, 13);
        p.writeUInt32LE(firmwareVersion, 17); p.writeUInt32LE(fnv1a32(defaults), 21);
    }), page(25, (p) => {
        // Layers, behaviour rows, tap depth, combos, keys per combo, RGB
        // groups, stage rows, LEDs, LED bitmap, custom keys, macros, domain
        // mask, name bytes, mask bits, positions.
        p.set([16, 16, 128, 5, 128, 16, 16, 32, 58, 8, 128, 128, 127, 32, 32, 60]);
    }), page(25, (p) => {
        // Populated steps, slot size, profile payload, slot payload, macro bank.
        p.writeUInt16LE(640, 0); p.writeUInt32LE(131072, 2); p.writeUInt32LE(130048, 6);
        p.writeUInt32LE(130048, 10); p.writeUInt32LE(34903, 14);
    })];
    // Committed (or running its defaults), converged with the slave half,
    // nothing pending.
    const status = [page(25, (p) => {
        p.set([1, 2]);
        p.writeUInt16LE((compiledOnly ? PROFILE_STATE_FLAGS.ACTIVE_IS_COMPILED_DEFAULT : PROFILE_STATE_FLAGS.COMMITTED_VALID) | (slaveKnown ? PROFILE_STATE_FLAGS.PEER_KNOWN | PROFILE_STATE_FLAGS.PEER_CONVERGED : 0), 2);
        for (const offset of [4, 8]) p.writeUInt32LE(fnv1a32(defaults), offset);
        p.writeUInt32LE(compiledOnly ? fnv1a32(defaults) : digest, 12);
        if (!compiledOnly) p.writeUInt32LE(digest, 20);
        p[24] = compiledOnly ? PROFILE_ACTIVE_KIND.COMPILED_ONLY : PROFILE_ACTIVE_KIND.COMMITTED;
    }), page(25, (p) => {
        if (compiledOnly) return;
        p.writeUInt32LE(generation, 0); p.writeUInt32LE(generation, 5); p.writeUInt32LE(generation, 10);
    })];
    // Page 0 is idle with no error, so a reader never asks for page 3.
    const candidateStatus = [page(25, (p) => {
        p.set([PROFILE_CANDIDATE_V1.STATUS_LAYOUT_VERSION, CANDIDATE_STATE.IDLE, 0, 0]);
    })];
    const storage = [undefined, Buffer.from([1, brightnessMax]), options.metadata, ...chunks(options.bytes)];
    /** @type {Partial<Record<number, Buffer[]>>} */
    const values = {
        [VALUE.CAPABILITIES]: capabilities,
        [VALUE.STATUS]: status,
        ...(compiledOnly ? {} : {[VALUE.COMMITTED]: payloadPages(profile, generation)}),
        [VALUE.COMPILED]: payloadPages(defaults, 0),
        [VALUE.COMBOS]: comboPages(held.combos, held.settings.layers.map(record => record.reference)),
        [VALUE.SETTINGS]: storedPages(settingsVersion === settings[0] ? settings : Buffer.from([settingsVersion, ...settings.subarray(1)])),
        [VALUE.STORAGE]: storage,
        [0x0b]: [Buffer.from([1, 0])],
        [VALUE.CANDIDATE_STATUS]: candidateStatus,
    };
    /** @type {import("./types.js").FakeKeyboard} */
    const keyboard = {requests: [], mutations: [], unhandled: [], answer};
    /** @param {Uint8Array} report */
    function answer(report) {
        const request = Buffer.alloc(RAW_HID_REPORT_SIZE);
        Buffer.from(report).copy(request);
        keyboard.requests.push(request);
        if (MUTATING_COMMANDS.has(request[0])) keyboard.mutations.push(request);
        const response = serve(request);
        if (response) return [response];
        keyboard.unhandled.push(request);
        const echo = Buffer.from(request); echo[0] = RAW_HID_UNHANDLED;
        return [echo];
    }
    /** @param {Buffer} request */
    function serve(request) {
        const reply = Buffer.from(request);
        switch (request[0]) {
            case PROFILE_WIRE_V1.COMMAND_GET:
                if (request[1] !== PROFILE_WIRE_V1.CHANNEL) return undefined;
                return profileValue(values[request[2]]?.[request[4] | (request[5] << 8)], reply);
            default: return undefined;
        }
    }
    return keyboard;
}

// A Profile Wire answer: the request's correlation header, status OK, the
// page's length and its bytes.
/** @param {Buffer | undefined} payload @param {Buffer} reply */
function profileValue(payload, reply) {
    if (!payload) return undefined;
    reply.fill(0, 5); reply[6] = payload.length; payload.copy(reply, PROFILE_WIRE_V1.PAYLOAD_OFFSET);
    return reply;
}
/** @param {number} length @param {(bytes: Buffer) => unknown} fill */
function page(length, fill) {
    const bytes = Buffer.alloc(length); fill(bytes); return bytes;
}
/** @param {Buffer} bytes */
function chunks(bytes) {
    const pages = [];
    for (let offset = 0; offset < bytes.length; offset += PAGE) pages.push(Buffer.from(bytes.subarray(offset, offset + PAGE)));
    return pages;
}
// A profile payload: metadata, then the blob in 25-byte pages.
/** @param {Buffer} blob @param {number} generation */
function payloadPages(blob, generation) {
    const metadata = page(25, (p) => {
        p.set([PROFILE_PAYLOAD_V1.LAYOUT_VERSION, PAGE]);
        p.writeUInt32LE(blob.length, 2); p.writeUInt32LE(generation, 6);
        p.writeUInt32LE(fnv1a32(blob), 10); p.writeUInt32LE(crc32(blob), 14);
        p.set([4, 0, 31, 0, 0], 18);
    });
    return [metadata, ...chunks(blob)];
}
// Settings: length, CRC and digest, then the bytes.
/** @param {Buffer} bytes */
function storedPages(bytes) {
    const metadata = page(12, (p) => {
        p.set([1, PAGE]); p.writeUInt16LE(bytes.length, 2);
        p.writeUInt32LE(crc32(bytes), 4); p.writeUInt32LE(fnv1a32(bytes), 8);
    });
    return [metadata, ...chunks(bytes)];
}
// The combo table as the keyboard reports it (readout version 3): keycodes,
// not actions, with each layer's reference from the settings' layer records.
/** @param {ReturnType<typeof import("../../core/schema/combo-domain-v1.js").decodeComboDomain>} table @param {number[]} references */
function comboPages(table, references) {
    const rows = table.rows;
    const metadata = page(25, (p) => {
        p.set([COMBO_READBACK_V1.VERSION, rows.length, COMBO_READBACK_V1.MAX_INPUTS, 16, 1, 0]);
        p.writeUInt16LE(table.defaultTermMs, 10); p.writeUInt16LE(table.holdTermMs, 12); p[14] = COMBO_READBACK_V1.PAGES_PER_ROW;
    });
    const referencePage = page(25, (p) => p.set(references));
    /** @param {import("../../core/schema/types.js").SemanticAction} action */
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

// What a keyboard reports while it starts (firmware D-F61), as Noah's did
// after a restart on 2026-10-24: pending with nothing known yet, then pending
// with both halves holding the same saved profile, then that profile.
const BOOT = Object.freeze([{activeKind: PROFILE_ACTIVE_KIND.PENDING, stateFlags: 0x80, reads: 8},
    {activeKind: PROFILE_ACTIVE_KIND.PENDING, stateFlags: 0xb2, reads: 8}]);

// Any fake keyboard, made to start up again whenever `boot(stages)` is called
// (a restart or a replug): its profile status reports each stage in turn, for
// that many reads of page 0 (Infinity: it never finishes), pending with no
// active digest or generation, then the keyboard as it is. Page 1 reports the
// stage the last page-0 read showed, as the firmware pairs them.
/** @template {import("./types.js").FakeKeyboard} K @param {K} keyboard @returns {K & {boot: (stages?: readonly {activeKind: number, stateFlags: number, reads: number}[]) => void}} */
function booting(keyboard) {
    /** @type {{activeKind: number, stateFlags: number, reads: number}[]} */
    let stages = [];
    /** @type {{activeKind: number, stateFlags: number} | null} */
    let shown = null;
    const answer = keyboard.answer.bind(keyboard);
    const at = PROFILE_WIRE_V1.PAYLOAD_OFFSET;
    return Object.assign(keyboard, {
        boot(/** @type {readonly {activeKind: number, stateFlags: number, reads: number}[]} */ boot = BOOT) {stages = boot.map(stage => ({...stage}));},
        answer(/** @type {Uint8Array} */ report) {
            const responses = answer(report), request = Buffer.from(report);
            if (request[0] !== PROFILE_WIRE_V1.COMMAND_GET || request[1] !== PROFILE_WIRE_V1.CHANNEL || request[2] !== VALUE.STATUS || !responses[0]) return responses;
            const page = request[4] | (request[5] << 8), response = Buffer.from(responses[0]);
            if (page === 0) {
                shown = stages[0] || null;
                if (stages[0] && --stages[0].reads <= 0) stages.shift();
            }
            if (!shown) return responses;
            if (page === 0) {
                response.writeUInt16LE(shown.stateFlags, at + 2);
                response.writeUInt32LE(0, at + 12);
                response[at + 24] = shown.activeKind;
            } else if (page === 1 && shown.activeKind === PROFILE_ACTIVE_KIND.PENDING) {
                response.writeUInt32LE(0, at);
            }
            return [response];
        },
    });
}

// A FakeDeviceAdapter wired to a fake keyboard: each written report is
// answered on a microtask, as a real device answers after the write returns.
// `adapter.keyboard` is the keyboard, for its records; replacing it answers
// from then on as that keyboard, as if the keyboard changed while connected.
/** @param {import("./types.js").FakeKeyboardAdapterOptions} options @returns {import("./types.js").FakeKeyboardAdapter} */
function fakeKeyboardAdapter(options) {
    const keyboard = options.keyboard || ("document" in options ? fakeKeyboard(options) : undefined);
    if (!keyboard) throw new Error("A fake keyboard adapter needs a keyboard or document.");
    const adapter = Object.assign(new FakeDeviceAdapter({
        devices: [{id: "fake-charybdis", product: "Charybdis 4x6", manufacturer: "Bastard Keyboards", serialNumber: "FAKE-1"}],
        onWrite({connection, report}) {
            const responses = adapter.keyboard.answer(report);
            queueMicrotask(() => responses.forEach((response) => connection.emitReport(response)));
        },
    }), {keyboard});
    return adapter;
}

module.exports = {BOOT, booting, fakeKeyboard, fakeKeyboardAdapter};
