// @ts-check
"use strict";
const {copyBytes, u8, protocolError} = require("./bytes");
const {LIGHTING_KINDS: KINDS, LIGHTING_REGISTRIES, LIGHTING_SLOTS, parameterLength} = require("./lighting-kinds-v1");
const LIGHTING = Object.freeze({DOMAIN_ID: 0x10, VERSION: 5, BUDGET: 8192, LED_COUNT: 58, PALETTE_MAX: 128});
const LightingProtocolError = protocolError("LightingProtocolError");
/** @typedef {import('./lighting-types.js').LightingOptions} Options */
/** @typedef {import('./lighting-types.js').LightingProfile} Profile */
/** @param {Options} [options] */
function lightingLimits(options = {}) {
    const capabilities = options.capabilities;
    return {tapDepth: options.tapDepth ?? capabilities?.tapDepth ?? 5, logicalLayers: options.logicalLayers ?? 16,
        maximumBrightness: options.maximumBrightness ?? 255, supportedModeMask: options.supportedModeMask ?? 0xffffffff,
        budget: capabilities?.payloadBudget ?? LIGHTING.BUDGET, allowUnknown: options.allowUnknown ?? Boolean(capabilities),
        registries: capabilities?.registries ?? Object.fromEntries(LIGHTING_REGISTRIES.map(name => [name, Object.keys(KINDS[name]).map(Number)]))};
}
/** @param {unknown} value @param {Options} [options] @returns {Profile} */
function decodeLightingDomain(value, options = {}) {
    const data = copyBytes(value, "Lighting payload"), limits = lightingLimits(options);
    /** @param {string} code @param {number} offset @returns {never} */
    const fail = (code, offset) => {throw new LightingProtocolError(code, `${code} in lighting at byte ${offset}.`, {offset});};
    /** @param {number} at @param {number} size @param {string} [code] */
    const need = (at, size, code = "TRUNCATED") => {if (at + size > data.length) fail(code, at);};
    if (data.length > limits.budget) fail("CAPACITY_EXCEEDED", limits.budget);
    need(0, 8);
    if (data[0] !== 5) fail("INVALID_VERSION", 0);
    if (data[1]) fail("RESERVED_BITS", 1);
    if (data[2] !== 58) fail("INCOMPATIBLE_GEOMETRY", 2);
    const [P, T, K, M, R] = [...data.subarray(3, 8)];
    if (P > 128) fail("CAPACITY_EXCEEDED", 3);
    let at = 8;
    /** @type {Profile} */
    const result = {formatVersion: 5, palette: [], things: [], keySets: [], maps: [], rules: [], extensions: [], byteLength: data.length};
    /** @param {import('./lighting-types.js').LightingRegistry} registry @param {number} kind */
    const supported = (registry, kind) => limits.registries[registry].includes(kind) || (!options.capabilities && limits.allowUnknown && !KINDS[registry][kind]);
    /** @param {number} value @param {number} offset */
    const mapValue = (value, offset) => {
        if (value < 128) {if (value >= P) fail("INVALID_REFERENCE", offset); return;}
        const kind = value - 128;
        if (!supported("paints", kind) || kind === 4 || KINDS.paints[kind]?.parameters.length !== 0) fail("INVALID_REFERENCE", offset);
    };
    /** @param {string} type @param {number} offset */
    const parameter = (type, offset) => {
        const v = data[offset];
        if (type === "layer" && v !== 255 && v >= limits.logicalLayers) fail("INVALID_PARAMETER", offset);
        if (type === "mode" && v !== 255 && (v >= 32 || !((limits.supportedModeMask >>> v) & 1))) fail("INVALID_PARAMETER", offset);
        if (type === "role" && ![0, 1, 255].includes(v)) fail("INVALID_PARAMETER", offset);
        if (type === "states" && (!v || v & 240)) fail("INVALID_PARAMETER", offset);
        if (type === "scope" && v > 3) fail("INVALID_PARAMETER", offset);
        if ((type === "set" && v >= K) || (type === "colour" && v >= P) || (type === "map" && v >= M) || (type === "base" && v > R)) fail("INVALID_REFERENCE", offset);
        if (type === "milliseconds" && !(v | data[offset + 1] << 8)) fail("INVALID_PARAMETER", offset);
        if (type === "flags" && v & 254) fail("RESERVED_BITS", offset);
        if (type === "fadeMode" && v > 2 || type === "flashMode" && v !== 1) fail("INVALID_PARAMETER", offset);
    };
    for (let i = 0; i < P; i++) {
        need(at, 3); if (data[at + 2] > limits.maximumBrightness) fail("BRIGHTNESS_EXCEEDED", at + 2);
        result.palette.push({h: data[at], s: data[at + 1], v: data[at + 2]}); at += 3;
    }
    let previous = -1;
    for (let i = 0; i < T; i++) {
        need(at, 2); const kind = data[at], count = data[at + 1];
        if (!supported("things", kind) || !KINDS.things[kind]) fail("UNSUPPORTED_KIND", at);
        if (kind <= previous) fail("NONCANONICAL_ORDER", at); previous = kind;
        if (count > (kind === 1 ? limits.logicalLayers : kind === 2 ? 32 : 128)) fail("CAPACITY_EXCEEDED", at + 1);
        const size = kind === 4 ? 1 + 3 + limits.tapDepth - 1 : 2;
        at += 2; const records = [];
        for (let record = 0; record <= count; record++) {
            need(at, size); const place = data[at];
            if (!(supported("targets", place) && KINDS.targets[place]?.place) && !(record > 0 && place === 254)) fail("INVALID_REFERENCE", at);
            for (let field = 1; field < size; field++) {
                const colour = data[at + field];
                if (colour !== 255 && !(colour === 254 && record > 0) && colour >= P) fail("INVALID_REFERENCE", at + field);
            }
            records.push([...data.subarray(at, at + size)]); at += size;
        }
        result.things.push({kind, default: records[0], records: records.slice(1)});
    }
    for (let i = 0; i < K; i++) {
        need(at, 8); if (data[at + 7] & 252) fail("RESERVED_BITS", at + 7);
        result.keySets.push(Array.from({length: 58}, (_, led) => led).filter(led => data[at + (led >> 3)] & 1 << (led & 7))); at += 8;
    }
    for (let i = 0; i < M; i++) {
        need(at, 1); const values = Array(58).fill(128);
        if (data[at] === 0) {
            need(at, 59); let painted = 0;
            for (let led = 0; led < 58; led++) {const v = data[at + 1 + led]; mapValue(v, at + 1 + led); values[led] = v; painted += Number(v !== 128);}
            if (painted <= 28) fail("NONCANONICAL_ENCODING", at); at += 59;
        } else if (data[at] === 1) {
            need(at, 2); const count = data[at + 1];
            if (count > 28) fail("NONCANONICAL_ENCODING", at + 1);
            need(at, 2 + count * 2); let last = -1;
            for (let entry = 0; entry < count; entry++) {
                const offset = at + 2 + entry * 2, led = data[offset], v = data[offset + 1];
                if (led >= 58) fail("INVALID_REFERENCE", offset);
                if (led <= last) fail("NONCANONICAL_ORDER", offset); last = led;
                if (v === 128) fail("NONCANONICAL_ENCODING", offset + 1);
                mapValue(v, offset + 1); values[led] = v;
            }
            at += 2 + count * 2;
        } else fail("INVALID_ENUM", at);
        result.maps.push(values);
    }
    const ranks = [0, 0, 1, 2, 3, 4, 5];
    for (let i = 0; i < R; i++) {
        need(at, 1); const start = at, size = data[at];
        if (size < 6) fail("INVALID_LENGTH", at); need(at, 1 + size);
        if (data[at + 1] & 254) fail("RESERVED_BITS", at + 1);
        const end = at + 1 + size, rule = {flags: data[at + 1], brightness: data[at + 2], parts: /** @type {import('./lighting-types.js').LightingPart[]} */ ([]), known: true};
        at += 3; let rank = 0, conditions = 0, timings = 0; const singles = new Set(), last = [-1, -1, -1, -1, -1, -1, -1];
        while (at < end) {
            if (at + 2 > end) fail("INVALID_LENGTH", at);
            const slot = data[at] >> 5, length = data[at] & 31, kind = data[at + 1];
            if (slot === 7) fail("INVALID_STRUCTURE", at);
            if (ranks[slot] < rank) fail("NONCANONICAL_ORDER", at); rank = ranks[slot];
            if (slot < 2) {if (++conditions > 4) fail("CAPACITY_EXCEEDED", at);}
            else if (slot <= 4) {if (singles.has(slot)) fail("INVALID_STRUCTURE", at); singles.add(slot);}
            else {
                if (slot === 5 && ++timings > 4) fail("CAPACITY_EXCEEDED", at);
                if (kind <= last[slot]) fail("NONCANONICAL_ORDER", at + 1); last[slot] = kind;
            }
            const registry = LIGHTING_SLOTS[slot], descriptor = KINDS[registry][kind];
            if (!supported(registry, kind) || (!descriptor && !limits.allowUnknown)) fail("UNSUPPORTED_KIND", at + 1);
            if (length > 16 || (descriptor && length !== parameterLength(descriptor)) || at + 2 + length > end) fail("INVALID_LENGTH", at);
            if (descriptor) {
                let p = at + 2;
                for (const type of descriptor.parameters) {parameter(type, p); p += type === "milliseconds" ? 2 : 1;}
            } else rule.known = false;
            rule.parts.push({slot, kind, params: [...data.subarray(at + 2, at + 2 + length)]}); at += 2 + length;
        }
        if (!singles.has(2) || !singles.has(3)) fail("INVALID_STRUCTURE", start);
        result.rules.push(rule);
    }
    need(at, 1); const E = data[at++]; previous = -1;
    for (let i = 0; i < E; i++) {
        need(at, 2); const kind = data[at], length = data[at + 1], descriptor = KINDS.domainExtensions[kind];
        if (!supported("domainExtensions", kind) || (!descriptor && !limits.allowUnknown)) fail("UNSUPPORTED_KIND", at);
        if (kind <= previous) fail("NONCANONICAL_ORDER", at); previous = kind;
        if (descriptor && length !== parameterLength(descriptor)) fail("INVALID_LENGTH", at + 1);
        need(at, 2 + length);
        if (descriptor) descriptor.parameters.forEach((type, index) => parameter(type, at + 2 + index));
        result.extensions.push({kind, params: [...data.subarray(at + 2, at + 2 + length)]}); at += 2 + length;
    }
    if (at !== data.length) fail("TRAILING_BYTES", at);
    return result;
}

/** @param {Profile} value @param {Options} [options] */
function encodeLightingDomain(value, options = {}) {
    /** @param {number[]} bytes */
    const chunk = bytes => Buffer.from(bytes.map(v => u8(v, "Lighting byte")));
    const chunks = [chunk([5, 0, 58, value.palette.length, value.things.length, value.keySets.length, value.maps.length, value.rules.length])];
    value.palette.forEach(c => chunks.push(chunk([c.h, c.s, c.v])));
    value.things.forEach(t => chunks.push(chunk([t.kind, t.records.length, ...t.default, ...t.records.flat()])));
    value.keySets.forEach(leds => {
        const bitmap = Buffer.alloc(8);
        for (const led of leds) {if (!Number.isInteger(led) || led < 0 || led >= 58) throw new RangeError("Invalid lighting LED."); bitmap[led >> 3] |= 1 << (led & 7);}
        chunks.push(bitmap);
    });
    value.maps.forEach(values => {
        if (values.length !== 58) throw new RangeError("A lighting map has exactly 58 values.");
        const pairs = values.flatMap((v, led) => v === 128 ? [] : [led, v]);
        chunks.push(chunk(pairs.length <= 56 ? [1, pairs.length / 2, ...pairs] : [0, ...values]));
    });
    value.rules.forEach(rule => {
        const body = chunk([rule.flags, rule.brightness, ...rule.parts.flatMap(p => [p.slot << 5 | p.params.length, p.kind, ...p.params])]);
        chunks.push(chunk([body.length]), body);
    });
    chunks.push(chunk([value.extensions.length]));
    value.extensions.forEach(e => chunks.push(chunk([e.kind, e.params.length, ...e.params])));
    const bytes = Buffer.concat(chunks); decodeLightingDomain(bytes, options); return bytes;
}
module.exports = {LIGHTING, LightingProtocolError, lightingLimits, decodeLightingDomain, encodeLightingDomain};
