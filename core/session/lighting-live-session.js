// @ts-check
"use strict";
const {LIVE, LIVE_STATUS: S, buildLiveRead, buildLiveControl, decodeLiveResponse, liveResponseMatcher, decodeLiveStatus, decodeLiveFacts} = require("../protocol/lighting-live-v1");
const {readStorageStatus} = require("../protocol/portable-profile-v1");
const {crc32} = require("../schema/profile-blob-v1");
/** @typedef {import('../../contracts/lighting-live.js').LightingLiveStatus} Status */
/** @typedef {import('./lighting-live-types.js').LiveContext} Context */
/** @typedef {import('./lighting-live-types.js').PreviewIdentity} Identity */
/** @param {string} code @param {string} message */
const failure = (code, message) => Object.assign(new Error(message), {code});
/** @param {number} status */
const rejected = status => failure(`LIVE_STATUS_${status}`, ({3: "Live lighting is unavailable on the keyboard.", 5: "The temporary lighting session or sample expired. Start again explicitly.", 6: "Another lighting command owns the keyboard. Try again after it stops.", 9: "The active profile changed. Read the keyboard again.", 10: "The other half did not acknowledge temporary lighting. The preview has stopped."})[status] ?? `The keyboard refused the lighting command (${status}).`);
/** @param {Status} s @param {Identity} p */
const same = (s, p) => s.owner.every((v, i) => v === p.owner[i]) && s.token === p.token && s.frameRevision === p.revision;
/** @param {unknown} error */
const codeOf = error => /** @type {{code?: string}} */ (error)?.code;
const NO_SUPPORT = {available: false, reason: "Read a keyboard with Live lighting support to use these controls."};

// One owner of the volatile surface, mailbox, sample loop and renewals per
// connected service. Cancellation is cooperative at report boundaries: aborting
// an active coordinator request would invalidate the HID connection. No bulky
// read queues ahead of critical renew/end, and no new mailbox command overtakes
// an outstanding exact retry. A stop latches immediately, even during BEGIN.
class LightingLiveSession {
    /** @param {import('./lighting-live-types.js').LiveOptions} options */
    constructor(options) {
        this.options = options;this.now = options.now ?? (() => performance.now());
        this.visible = false;this.live = false;this.sampleIntent = 0;this.cancel = 0;this.revision = 0;
        /** @type {Promise<void> | null} */ this.running = null;
        /** @type {(() => void) | null} */ this.wake = null;
        /** @type {Identity | null} */ this.preview = null;
        /** @type {Uint8Array | null} */ this.frame = null;
        /** @type {Context | null} */ this.context = null;
        this.mailboxPending = false;this.uncertainKey = "";
        /** @type {(() => void)[]} */
        this.stopped = [];
        this.renewAt = 0;this.lastConfirmed = 0;this.renewal = 0;this.receivedAt = 0;this.sampleKey = "";
        /** @type {import('../../contracts/lighting-live.js').LightingLiveView} */
        this.view = {support: NO_SUPPORT, active: false, state: "paused", reason: "Live is paused.", sample: null, ageMs: null, preview: {state: "off", reason: "Temporary light is never saved.", status: null}};
    }
    snapshot() {
        const context = this.options.context(), support = context?.support ?? NO_SUPPORT;
        const sample = context?.key === this.sampleKey ? this.view.sample : null;
        const ageMs = sample ? Math.max(0, Math.round(this.now() - this.receivedAt)) : null;
        return {...this.view, sample, support, active: this.live, ageMs, state: this.view.state === "current" && ageMs !== null && ageMs > 3000 ? /** @type {const} */ ("stale") : this.view.state};
    }
    /** @param {boolean} visible */
    surface(visible) {this.visible = visible;if (!visible) return this.stop("Lighting was left or hidden.");return Promise.resolve();}
    startLive() {this.require("facts");this.sampleIntent++;this.live = true;this.view.state = "sampling";this.view.reason = "Taking a coherent current sample…";this.launch();}
    pauseLive() {this.sampleIntent++;this.live = false;this.view.state = this.view.sample ? "stale" : "paused";this.view.reason = "Live is paused. This sample is no longer current.";this.wake?.();this.options.changed();}
    /** @param {Uint8Array} bytes */
    startPreview(bytes) {
        const context = this.require("frame"), cap = context.support.capability;
        if (!cap || bytes.length !== cap.frameBytes || bytes.some(v => !Number.isInteger(v) || v < 0 || v > 255)) throw failure("LIVE_FRAME", "Choose a complete known local look for every LED before trying it.");
        if (this.preview || this.frame || this.view.preview.state === "stopping") throw failure("LIVE_BUSY", "Stop the current temporary look before trying another.");
        this.frame = Uint8Array.from(bytes);this.view.preview = {state: "uploading", reason: "Preparing the complete temporary look…", status: null};this.launch();
    }
    /** @param {string} [reason] */
    stopPreview(reason = "Temporary lighting stopped.") {
        this.frame = null;this.cancel++;
        if (this.preview || this.view.preview.state === "uploading") this.view.preview = {...this.view.preview, state: "stopping", reason};
        this.wake?.();this.launch();
        if (!this.live) return this.running ?? Promise.resolve();
        if (!this.preview && this.view.preview.state !== "stopping" && this.view.preview.state !== "uploading") return Promise.resolve();
        return new Promise(resolve => this.stopped.push(() => resolve(undefined)));
    }
    /** @param {string} [reason] */
    stop(reason = "Live is paused.") {this.live = false;this.cancel++;this.view.state = this.view.sample ? "stale" : "paused";this.view.reason = reason;return this.stopPreview(reason);}
    /** @param {'facts' | 'frame'} kind */
    require(kind) {
        const c = this.options.context();
        if (c && this.uncertainKey === c.key) throw failure("LIVE_PENDING", "Reconnect before another lighting command; the previous result is unknown.");
        if (!this.visible || !c?.support.available || !c.support.capability?.[kind]) throw failure("LIVE_UNAVAILABLE", c?.support.reason || "This keyboard does not offer this lighting control.");
        return c;
    }
    launch() {
        this.wake?.();this.options.changed();
        if (this.running) return;
        this.running = Promise.resolve().then(() => this.run()).catch(error => {
            this.live = false;this.frame = null;this.view.state = "unavailable";this.view.reason = /** @type {Error} */ (error).message;
            this.view.preview = {...this.view.preview, state: "failed", reason: /** @type {Error} */ (error).message};
        }).finally(() => {this.running = null;this.resolveStopped();this.options.changed();});
    }
    resolveStopped() {if (!this.preview && !this.frame) for (const done of this.stopped.splice(0)) done();}
    /** @param {number} ms */
    delay(ms) {return new Promise(resolve => {const id = setTimeout(done, ms);const self = this;function done() {clearTimeout(id);if (self.wake === done) self.wake = null;resolve(undefined);}this.wake = done;});}
    /** @param {Context} c @param {number} intent */
    check(c, intent) {
        if (intent !== this.cancel || !this.visible || this.options.context()?.key !== c.key) throw failure("LIVE_CANCELLED", "Lighting activity stopped or its keyboard changed.");
    }
    /** @param {Context} c @param {Buffer} request */
    async exchange(c, request) {
        const remaining = this.view.preview.state === "live" ? this.lastConfirmed + 1500 - this.now() : 100;
        if (remaining <= 0) throw failure("LIVE_DEADLINE", "Temporary lighting could not be confirmed before its renewal deadline. Try again explicitly.");
        const response = await c.connection.request(request, {timeoutMs: Math.max(1, Math.min(100, remaining)), matchResponse: liveResponseMatcher});
        return decodeLiveResponse(response, request);
    }
    // A command's first PENDING is admission only. Drain its exact cached
    // result before using the single mailbox for anything else, including END.
    /** @param {Context} c @param {Buffer} request */
    async command(c, request) {
        this.mailboxPending = true;this.uncertainKey = c.key;
        for (let attempt = 0; attempt < 12; attempt++) {
            const reply = await this.exchange(c, request);
            if (reply.status !== S.PENDING) {this.mailboxPending = false;this.uncertainKey = "";if (reply.status === S.OK) return;throw rejected(reply.status);}
            await this.delay(10 + Math.min(attempt, 4) * 5);
        }
        throw failure("LIVE_PENDING", "The keyboard did not finish its lighting command. Temporary lighting has stopped.");
    }
    /** @param {Context} c @param {number} intent @param {boolean} [priority] @param {boolean} [cleanup] @returns {Promise<Status>} */
    async status(c, intent, priority = true, cleanup = false) {
        for (let attempt = 0; attempt < 3; attempt++) {
            /** @type {Buffer[]} */ const pages = [];let revision = 0, stale = false;
            for (let page = 0; page < 3; page++) {
                if (cleanup) {if (this.options.context()?.key !== c.key) throw failure("LIVE_CANCELLED", "Keyboard changed.");} else this.check(c, intent);if (priority) await this.maintain(c, intent);
                const r = await this.exchange(c, buildLiveRead(LIVE.STATUS, page, revision, c.nextRequestId()));
                if (r.status === S.STALE) {stale = true;break;}
                if (r.status !== S.OK) throw rejected(r.status);
                if (r.payload.length !== 25) throw failure("LIVE_MALFORMED", "Lighting status has an incomplete page.");
                if (!page) revision = r.payload.readUInt32LE();pages.push(r.payload);
            }
            if (!stale) {
                const s = decodeLiveStatus(pages);
                if (s.role !== 1 || s.guard || s.frameBytes !== c.support.capability?.frameBytes) throw failure("LIVE_IDENTITY", "Lighting role, geometry or session namespace changed. Start again after reading the keyboard.");
                return s;
            }
            await this.delay(15 * (attempt + 1));
        }
        throw failure("LIVE_STALE", "Lighting status kept changing during the read. Pause and start Live again.");
    }
    /** @param {Context} c @param {number} intent @param {Identity} p @param {number} state @param {number} operation @param {number} requestId */
    async waitState(c, intent, p, state, operation, requestId) {
        const start = this.now();
        for (let attempt = 0; attempt < 16; attempt++) {
            const s = await this.status(c, intent, false);
            if (!same(s, p) || s.profileDigest !== p.digest || s.crc32 !== p.crc32) throw failure("LIVE_OWNER", "Another session or profile replaced this temporary look.");
            if (s.peerResult !== S.OK && s.peerResult !== S.PENDING) throw rejected(s.peerResult);
            if (s.operation !== operation || s.requestId !== requestId || s.result !== S.OK) throw failure("LIVE_CORRELATION", "Lighting completion does not match this command.");
            this.view.preview.status = s;
            if (s.state === state && (state !== 6 || s.flags & 8 && s.peerEpoch && !s.rpc && s.offset === p.capability.frameBytes) && (state !== 2 || s.offset === 0)) return s;
            if (this.now() - start > 1100) break;
            await this.delay(25);
        }
        throw failure("LIVE_PEER_TIMEOUT", "The halves did not confirm temporary lighting in time. The preview has stopped.");
    }
    /** @param {Context} c @param {number} intent */
    async verifyStorage(c, intent) {
        this.check(c, intent);
        const storage = await readStorageStatus({request: (request, options) => c.connection.request(request, {...options, timeoutMs: 100})}, {next: () => c.nextRequestId()});
        this.check(c, intent);
        if (!storage.ready || storage.generation !== c.storage.generation || storage.digest !== c.storage.digest) throw failure("LIVE_KEYMAP", "The keyboard's layout or storage changed. Read it again before using Live lighting.");
    }
    /** @param {Context} c @param {number} intent */
    async maintain(c, intent) {
        const p = this.preview;
        if (!p || this.view.preview.state !== "live" || this.now() < this.renewAt) return;
        this.check(c, intent);
        if (this.now() - this.lastConfirmed > 1250 || this.renewal === 0xffffffff) throw failure("LIVE_EXPIRED", "The temporary look could no longer be renewed safely. Try it again explicitly.");
        await this.verifyStorage(c, intent);
        const request = buildLiveControl(LIVE.RENEW, c.nextRequestId(), {...p, renewal: ++this.renewal});
        const sent = this.now();await this.command(c, request);this.check(c, intent);
        const s = await this.waitState(c, intent, p, 6, LIVE.RENEW, request[3]);
        if (s.renewal !== this.renewal) throw failure("LIVE_CORRELATION", "Renewal did not confirm this temporary look.");
        this.lastConfirmed = sent;this.renewAt = sent + p.capability.renewMs;this.options.changed();
    }
    /** @param {Context} c @param {number} intent @param {Uint8Array} bytes */
    async upload(c, intent, bytes) {
        const cap = c.support.capability;if (!cap) throw failure("LIVE_UNAVAILABLE", "Temporary frames are unavailable.");
        if (this.revision === 0xffffffff) throw failure("LIVE_EXHAUSTED", "Reopen Ark before starting another temporary look.");
        const owner = this.options.nonce?.() ?? [...globalThis.crypto.getRandomValues(new Uint8Array(8))];
        const p = {owner, token: 0, revision: ++this.revision, digest: c.profile.digest, crc32: crc32(bytes), capability: cap};
        // Retain owner before BEGIN resolves. Stop must discover the assigned
        // token and end this identity even when cancellation raced admission.
        await this.verifyStorage(c, intent);
        this.preview = p;
        const begin = buildLiveControl(LIVE.BEGIN, c.nextRequestId(), {...p, frameBytes: bytes.length});
        await this.command(c, begin);this.check(c, intent);
        const s = await this.status(c, intent, false);
        if (!s.token || s.frameRevision !== p.revision || !s.owner.every((v, i) => v === owner[i])) throw failure("LIVE_OWNER", "Another window replaced this temporary lighting session.");
        p.token = s.token;await this.waitState(c, intent, p, 2, LIVE.BEGIN, begin[3]);
        for (let offset = 0; offset < bytes.length; offset += cap.chunkMax) {
            this.check(c, intent);await this.command(c, buildLiveControl(LIVE.CHUNK, c.nextRequestId(), {...p, offset, bytes: bytes.subarray(offset, offset + cap.chunkMax)}));
        }
        this.check(c, intent);
        const publish = buildLiveControl(LIVE.PUBLISH, c.nextRequestId(), p), sent = this.now();
        await this.command(c, publish);this.check(c, intent);
        await this.waitState(c, intent, p, 6, LIVE.PUBLISH, publish[3]);this.check(c, intent);
        this.view.preview = {...this.view.preview, state: "live", reason: "Temporary look confirmed by both halves. It is not saved; physical LED output is not measured."};
        this.lastConfirmed = sent;this.renewAt = sent + cap.renewMs;this.renewal = 0;this.options.changed();
    }
    /** @param {Context} c @param {number} intent */
    async capture(c, intent) {
        const cap = c.support.capability;if (!cap) return;
        const readStarted = this.now(), sampleIntent = this.sampleIntent;
        await this.maintain(c, intent);this.check(c, intent);await this.verifyStorage(c, intent);
        const command = buildLiveControl(LIVE.CAPTURE, c.nextRequestId());await this.command(c, command);
        const s = await this.status(c, intent, false);
        if (!s.snapshotReady || !s.snapshotId || s.operation !== LIVE.CAPTURE || s.requestId !== command[3] || s.result !== S.OK) throw failure("LIVE_CORRELATION", "The keyboard did not confirm this facts capture.");
        const chunks = [], total = cap.metadataBytes + cap.factsBytes;
        for (let page = 0; page < Math.ceil(total / 21); page++) {
            this.check(c, intent);if (!this.live || sampleIntent !== this.sampleIntent) return;await this.maintain(c, intent);
            const r = await this.exchange(c, buildLiveRead(LIVE.FACTS, page, s.snapshotId, c.nextRequestId()));
            if (r.status !== S.OK) throw rejected(r.status);
            if (r.payload.length !== 4 + Math.min(21, total - page * 21) || r.payload.readUInt32LE() !== s.snapshotId) throw failure("LIVE_CORRELATION", "Lighting pages belong to different captures or lengths.");
            chunks.push(r.payload.subarray(4));
        }
        this.check(c, intent);
        const sample = decodeLiveFacts(Buffer.concat(chunks), cap, s.snapshotId);
        if (JSON.stringify(Object.keys(sample.slices).map(Number)) !== JSON.stringify(c.factKinds)) throw failure("LIVE_MODULES", "The captured fact producers do not match the keyboard capability registry.");
        if (JSON.stringify(sample.profile) !== JSON.stringify(c.profile) || sample.generation !== s.generation || sample.captured !== s.captured) throw failure("LIVE_PROFILE", "The active profile or lighting generation changed. Read the keyboard again.");
        // Revalidate the immutable stream after the last chunk: remaps close it.
        await this.maintain(c, intent);
        const last = await this.exchange(c, buildLiveRead(LIVE.FACTS, 0, sample.id, c.nextRequestId()));
        if (last.status !== S.OK || !last.payload.equals(Buffer.concat([Buffer.from([sample.id & 255, sample.id >>> 8 & 255, sample.id >>> 16 & 255, sample.id >>> 24]), chunks[0]]))) throw failure("LIVE_STALE", "The lighting capture changed or its keymap was remapped.");
        await this.verifyStorage(c, intent);this.check(c, intent);if (!this.live || sampleIntent !== this.sampleIntent) return;this.view.sample = sample;this.sampleKey = c.key;this.receivedAt = readStarted;this.view.state = "current";this.view.reason = "Current facts sampled on the USB half; events and retained tails are not reported.";this.options.changed();
    }
    /** @param {Context} c */
    async release(c) {
        const p = this.preview;this.preview = null;
        if (!p || this.mailboxPending || this.options.context()?.key !== c.key) return;
        try {
            // Do not END another window's new token, nor discover through a
            // different connection. A late BEGIN gets only its own exact token.
            const intent = this.cancel, s = await this.status(c, intent, false, true);
            if (!p.token && s.frameRevision === p.revision && s.owner.every((v, i) => v === p.owner[i])) p.token = s.token;
            if (!p.token || !same(s, p)) return;
            await this.command(c, buildLiveControl(LIVE.END, c.nextRequestId(), p));
        } catch { /* finite device lease remains the lost-exit protection */ }
    }
    async run() {
        let nextCapture = 0;
        while (this.live || this.frame || this.preview) {
            const c = this.options.context();
            if (!c || !this.visible || this.context && this.context.key !== c.key) {
                this.live = false;this.frame = null;if (this.context) await this.release(this.context);this.view.preview = {state: "off", reason: "Lighting stopped because the keyboard or window changed.", status: null};break;
            }
            this.context = c;const intent = this.cancel;
            try {
                if (this.preview && !this.frame) await this.release(c);
                if (this.frame && !this.preview) await this.upload(c, intent, this.frame);
                this.check(c, intent);await this.maintain(c, intent);
                if (this.live && this.now() >= nextCapture) {await this.capture(c, intent);nextCapture = this.now() + 1000;}
            } catch (error) {
                if (codeOf(error) !== "LIVE_CANCELLED") {
                    this.live = false;this.frame = null;this.view.state = "unavailable";this.view.reason = /** @type {Error} */ (error).message;
                    this.view.preview = {...this.view.preview, state: "failed", reason: /** @type {Error} */ (error).message};
                }
                await this.release(c);
            }
            if (!this.frame && !this.preview && !(["failed", "off"].includes(this.view.preview.state))) this.view.preview = {state: "off", reason: "Temporary lighting stopped. Nothing was saved.", status: null};
            this.resolveStopped();this.options.changed();
            if (this.live || this.frame || this.preview) await this.delay(Math.max(10, Math.min(this.preview ? this.renewAt - this.now() : 1000, this.live ? nextCapture - this.now() : 1000, 1000)));
        }
        this.context = null;
        if (this.view.preview.state === "stopping") this.view.preview = {state: "off", reason: "Temporary lighting stopped. Nothing was saved.", status: null};
    }
}
module.exports = {LightingLiveSession};
