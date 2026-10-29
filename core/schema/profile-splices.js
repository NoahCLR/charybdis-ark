// @ts-check
"use strict";

// A live edit as the firmware takes it (D-F32): up to eight splices into
// domain payloads, applied together as one revision. `diffProfiles` turns
// "the keyboard's working copy" and "the profile the draft wants" into those
// splices: one per domain whose payload differs, covering only the bytes
// between the common prefix and the common suffix, so a key change sends a
// few bytes rather than its whole domain. `applySplices` is the firmware's
// side of the same rule, so Ark knows the bytes it just published without
// reading them back.
const {decodeProfileBlob, encodeProfileBlob} = require("./profile-blob-v1");

// The most splices one profile edit carries; the wire's limit
// (protocol/profile-edit-v1.js) is this one.
const MAX_SPLICES = 8;

// Splices are Ark's own, made from its draft: a refusal names their bytes, so
// it is Ark's fault (schema/bytes.js protocolError).
/** @param {string} code @param {string} message */
const fail = (code, message) => Object.assign(new Error(message), {code, fault: "ark"});

/** @typedef {{domainId: number, offset: number, remove: number, insert: number, create?: boolean, drop?: boolean}} Splice */
/** @typedef {{splices: Splice[], stream: Buffer}} SpliceEdit */

// The splices that turn `from` into `to`, and their inserted bytes as one
// stream in splice order. `defaults` is the compiled profile the keyboard
// falls back to for a domain its profile leaves out: a domain `to` holds that
// `from` lacks needs no splice when it is exactly the default. Domains are
// visited in canonical (id) order, so splices are in domain order.
/** @param {Uint8Array} from @param {Uint8Array} to @param {{defaults?: Uint8Array, required?: readonly number[]}} [options] @returns {SpliceEdit} */
function diffProfiles(from, to, {defaults, required = []} = {}) {
    const before = new Map(decodeProfileBlob(from).domains.map(domain => [domain.id, domain]));
    const after = new Map(decodeProfileBlob(to).domains.map(domain => [domain.id, domain]));
    const fallback = defaults ? new Map(decodeProfileBlob(defaults).domains.map(domain => [domain.id, domain])) : new Map();
    /** @type {Splice[]} */
    const splices = [];
    /** @type {Buffer[]} */
    const inserted = [];
    for (const id of [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b)) {
        const old = before.get(id), next = after.get(id);
        if (old && next) {
            if (old.version !== next.version) throw fail("DOMAIN_VERSION_CHANGED", `Domain 0x${id.toString(16)} changes version; send the whole profile instead.`);
            if (old.payload.equals(next.payload)) continue;
            const limit = Math.min(old.payload.length, next.payload.length);
            let prefix = 0;
            while (prefix < limit && old.payload[prefix] === next.payload[prefix]) prefix++;
            let suffix = 0;
            while (suffix < limit - prefix && old.payload[old.payload.length - 1 - suffix] === next.payload[next.payload.length - 1 - suffix]) suffix++;
            const bytes = next.payload.subarray(prefix, next.payload.length - suffix);
            splices.push({domainId: id, offset: prefix, remove: old.payload.length - prefix - suffix, insert: bytes.length});
            inserted.push(bytes);
        } else if (next) {
            const standIn = fallback.get(id);
            if (standIn && standIn.version === next.version && standIn.payload.equals(next.payload)) continue;
            splices.push({domainId: id, offset: 0, remove: 0, insert: next.payload.length, create: true});
            inserted.push(next.payload);
        } else if (old) {
            if (required.includes(id)) throw fail("REQUIRED_DOMAIN", `Domain 0x${id.toString(16)} is required and cannot be dropped.`);
            splices.push({domainId: id, offset: 0, remove: old.payload.length, insert: 0, drop: true});
        }
    }
    if (splices.length > MAX_SPLICES) throw fail("TOO_MANY_SPLICES", `An edit holds at most ${MAX_SPLICES} splices.`);
    return {splices, stream: Buffer.concat(inserted)};
}

// The profile `splices` make of `from`, as the keyboard makes it: each splice
// replaces `remove` bytes at `offset` of its domain with its share of the
// stream, creates a domain whole or drops one. Refuses what the keyboard
// refuses (overlapping or out-of-order splices, a range outside its domain).
/** @param {Uint8Array} from @param {SpliceEdit} edit @param {{versions?: Readonly<Record<number, number>>}} [options] */
function applySplices(from, {splices, stream}, {versions = {}} = {}) {
    const blob = decodeProfileBlob(from);
    const domains = new Map(blob.domains.map(domain => [domain.id, {...domain, payload: Buffer.from(domain.payload)}]));
    let cursor = 0, lastId = 0, lastEnd = -1;
    for (const splice of splices) {
        if (splice.domainId < lastId || (splice.domainId === lastId && splice.offset < lastEnd)) throw fail("INVALID_SPLICE", "Splices go in domain order, then offset order, without overlapping.");
        if (splice.domainId !== lastId) lastEnd = -1;
        lastId = splice.domainId;
        const bytes = stream.subarray(cursor, cursor + splice.insert);
        if (bytes.length !== splice.insert) throw fail("INVALID_SPLICE", "The stream is shorter than the splices insert.");
        cursor += splice.insert;
        const domain = domains.get(splice.domainId);
        if (splice.create) {
            if (domain || splice.offset || splice.remove) throw fail("INVALID_SPLICE", "Only an absent domain is created, whole.");
            const version = versions[splice.domainId];
            if (version === undefined) throw fail("UNSUPPORTED_DOMAIN", `Domain 0x${splice.domainId.toString(16)} has no known version.`);
            domains.set(splice.domainId, {id: splice.domainId, version, payload: Buffer.from(bytes)});
            lastEnd = Infinity;
            continue;
        }
        if (!domain) throw fail("INVALID_SPLICE", `Domain 0x${splice.domainId.toString(16)} is not in the profile.`);
        if (splice.drop) {
            if (splice.offset || splice.remove !== domain.payload.length || splice.insert) throw fail("INVALID_SPLICE", "A dropped domain is removed whole.");
            domains.delete(splice.domainId);
            lastEnd = Infinity;
            continue;
        }
        if (splice.offset + splice.remove > domain.payload.length) throw fail("INVALID_SPLICE", "A splice reaches past its domain.");
        domain.payload = Buffer.concat([domain.payload.subarray(0, splice.offset), bytes, domain.payload.subarray(splice.offset + splice.remove)]);
        lastEnd = splice.offset + splice.remove;
    }
    if (cursor !== stream.length) throw fail("INVALID_SPLICE", "The stream is longer than the splices insert.");
    return encodeProfileBlob({...blob, domains: [...domains.values()]});
}

// Whether the keyboard has room for the edit: its inserted bytes are staged
// above both the current and the resulting profile (firmware D-F32).
/** @param {number} fromLength @param {number} toLength @param {number} insertTotal @param {number} capacity */
const spliceEditFits = (fromLength, toLength, insertTotal, capacity) => insertTotal + Math.max(fromLength, toLength) <= capacity;

module.exports = {diffProfiles, applySplices, spliceEditFits, MAX_SPLICES};
