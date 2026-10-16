// @ts-check
"use strict";
// Explicit fake backend only. Wraps the ordinary fake keyboard, so the real
// service/coordinator/capture/panel paths still establish the connection.
const {fakeKeyboard} = require("./fake-keyboard");
const {crc32, fnv1a32} = require("../../core/schema/profile-blob-v1");
const golden = require("../../upstream/firmware/tests/fixtures/lighting_live_v1.json");
/** @param {import('../../core/model/types.js').PortableDocument} document */
function lightingLiveKeyboard(document) {
    const base = fakeKeyboard({document});
    const active = Buffer.from(document.profile, "base64"), digest = fnv1a32(active);
    const profile = Buffer.alloc(22);profile.writeUInt32LE(42);profile.writeUInt32LE(crc32(active), 4);profile.writeUInt32LE(digest, 8);profile.writeUInt32LE(digest, 12);profile.writeUInt32LE(document.actionAbiDigest, 16);profile[20] = 1;
    let revision = 1, token = 0, frameRevision = 0, offset = 0, checksum = 0, renewal = 0, started = 0;
    let state = 0, operation = 0, requestId = 0, snapshot = 0, captured = 0;
    /** @type {Buffer} */ let owner = Buffer.alloc(8);let stage = Buffer.alloc(174), cached = Buffer.alloc(32), pending = false;
    let stream = Buffer.alloc(0), cachedResult = 0;
    const fake = {requests: base.requests, mutations: base.mutations, unhandled: base.unhandled,
        liveRequests: /** @type {Buffer[]} */ ([]), displayed: /** @type {Buffer | null} */ (null),
        now: 100, role: 1, generation: 1, keymap: 1, peerResult: 0, suppressed: 0, guard: 0,
        staleStatus: 0, delayMs: 0, badPage: -1, unknownFormat: false, pendingForever: false,
        /** @type {((request: Buffer) => void) | null} */ before: null,
        /** @param {Uint8Array} report */ answer(report) {
            const r = Buffer.from(report);
            if (r[0] === 8 && r[1] === 0 && r[2] === 13 && r[4] === 16) return [response(r, 0, Buffer.from(golden.capability, "hex"))];
            if (!(r[1] === 0 && (r[0] === 7 && r[2] === 29 || r[0] === 8 && [14, 15].includes(r[2])))) return base.answer(report);
            fake.liveRequests.push(r);fake.requests.push(r);fake.before?.(r);
            if (fake.now - started >= 2000 && state !== 0) {fake.displayed = null;state = 0;revision++;}
            if (r[0] === 7) {
                if (r.equals(cached)) {
                    if (pending && !fake.pendingForever) {pending = false;cachedResult = consume(r);revision++;return [response(r, cachedResult)];}
                    return [response(r, pending ? 4 : cachedResult)];
                }
                if (pending) return [response(r, 6)];
                cached = r;pending = true;return [response(r, 4)];
            }
            const expected = r.readUInt32LE(5), page = r[4];
            if (r[2] === 14) {
                if (!snapshot || expected !== snapshot || fake.keymap !== stream.readUInt32LE(16)) return [response(r, 5)];
                const data = stream.subarray(page * 21, (page + 1) * 21), id = Buffer.alloc(4);id.writeUInt32LE(snapshot);
                const payload = Buffer.concat([id, data]);if (page === fake.badPage) payload[0] ^= 1;
                return [response(r, data.length ? 0 : 2, data.length ? payload : undefined)];
            }
            if (fake.staleStatus && page > 0) {fake.staleStatus--;revision++;}
            if (expected && expected !== revision) return [response(r, 5)];
            const p = Buffer.alloc(25);p.writeUInt32LE(revision);
            if (page === 0) {p.set([1, operation, requestId, 0, state, 0, (fake.displayed ? 8 : 0) | fake.suppressed], 4);p.writeUInt32LE(token, 11);p.writeUInt32LE(frameRevision, 15);p.writeUInt16LE(offset, 19);p.writeUInt16LE(174, 21);p[23] = fake.peerResult;p[24] = fake.guard;}
            else if (page === 1) {p.set(owner, 4);p.writeUInt32LE(started, 12);p.writeUInt32LE(renewal, 16);p.writeUInt32LE(checksum, 20);p[24] = fake.role;}
            else if (page === 2) {p.writeUInt32LE(snapshot, 4);p[8] = snapshot ? 1 : 0;p.writeUInt32LE(digest, 9);p.writeUInt32LE(fake.generation, 13);p.writeUInt32LE(captured, 17);p.writeUInt32LE(1, 21);}
            else return [response(r, 2)];
            return [response(r, 0, p)];
        }};
    /** @param {Buffer} r */
    function consume(r) {
        operation = r[4];requestId = r[3];
        if (operation === 1) {snapshot++;captured = fake.now;stream = facts(snapshot);return 0;}
        if (operation === 2) {
            if (r.readUInt32LE(17) !== digest) return 9;
            owner = r.subarray(5, 13);token++;frameRevision = r.readUInt32LE(13);checksum = r.readUInt32LE(23);stage = Buffer.alloc(174);offset = 0;renewal = 0;started = fake.now;state = 2;fake.displayed = null;return 0;
        }
        if (!r.subarray(5, 13).equals(owner) || r.readUInt32LE(13) !== token || r.readUInt32LE(17) !== frameRevision) return 5;
        if (operation === 6) {state = 0;fake.displayed = null;return 0;}
        if (operation === 3) {const at = r.readUInt16LE(21), n = r[23];if (state !== 2) return 5;if (at < offset) return at + n <= offset && stage.subarray(at, at + n).equals(r.subarray(24, 24 + n)) ? 0 : 8;if (at !== offset || at + n > 174) return 7;r.copy(stage, at, 24, 24 + n);offset += n;started = fake.now;return 0;}
        if (operation === 4) {if (state !== 2) return 5;if (offset !== 174) return 7;if (crc32(stage) !== checksum) return 8;state = fake.peerResult ? 5 : 6;fake.displayed = fake.peerResult ? null : Buffer.from(stage);started = fake.now;return 0;}
        if (operation === 5) {if (state !== 6 || !fake.displayed) return 5;const seq = r.readUInt32LE(21);if (seq < renewal || !seq) return 5;if (seq > renewal) {renewal = seq;started = fake.now;}return 0;}
        return 1;
    }
    /** @param {number} id */
    function facts(id) {
        const slices = golden.slices.map(({id, bytes}) => {
            const p = Buffer.alloc(bytes);if ([2, 3, 7, 10, 11, 13].includes(id)) p.fill(255);
            if (id === 3) {p.fill(0);p[0] = 32;}if (id === 1) p[0] = 1;if (id === 5) p.fill(255, 31, 38);if (id === 9) p[62] = 255;
            const h = Buffer.alloc(3);h[0] = id;h.writeUInt16LE(bytes, 1);return Buffer.concat([h, p]);
        });
        const h = Buffer.alloc(48);h.set([fake.unknownFormat ? 2 : 1, 1, fake.role, 1]);h.writeUInt32LE(id, 4);h.writeUInt32LE(captured, 8);h.writeUInt32LE(fake.generation, 12);h.writeUInt32LE(fake.keymap, 16);h.set(profile, 20);h.writeUInt16LE(719, 42);h.set([17, 58, 29, 60], 44);return Buffer.concat([h, ...slices]);
    }
    return fake;
}
/** @param {Buffer} request @param {number} status @param {Buffer} [payload] */
function response(request, status, payload = Buffer.alloc(0)) {const r = Buffer.alloc(32);request.copy(r, 0, 0, 5);r[5] = status;r[6] = payload.length;payload.copy(r, 7);return r;}
module.exports = {lightingLiveKeyboard, response};
