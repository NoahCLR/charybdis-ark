"use strict";

// One run through core/: decode every input, encode it again, stage edits in a
// draft and build the panel model, all into plain data. web-build.spec.js runs
// it on Node's core/ and in Chrome on the web build, and requires the two to
// be equal, so a difference between Node's Buffer and the bundled one shows
// up as a difference here.
//
// It is sent into the page as source text, so it closes over nothing: `core`
// is web/core.mjs's exports, under Node or from the bundle.
function exerciseCore(core, inputs) {
    const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const bytesOf = (text) => core.Buffer.from(text, "hex");
    // Bytes keep whether they are a Buffer, so a decoder that returns a plain
    // Uint8Array in one place and a Buffer in the other is a difference too.
    const plain = (value) => {
        if (value instanceof Uint8Array) return {[core.Buffer.isBuffer(value) ? "buffer" : "bytes"]: hex(value)};
        if (value instanceof Map) return {map: Array.from(value, ([key, entry]) => [plain(key), plain(entry)])};
        if (value instanceof Set) return {set: Array.from(value, plain)};
        if (Array.isArray(value)) return value.map(plain);
        if (value === undefined) return {undefined: true};
        if (typeof value === "number" && !Number.isFinite(value)) return {number: String(value)};
        if (typeof value === "bigint" || typeof value === "function") return {[typeof value]: String(value)};
        if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).map((key) => [key, plain(value[key])]));
        return value;
    };
    const attempt = (run) => {
        try {
            return {value: plain(run())};
        } catch (error) {
            return {error: error.code || error.name, message: error.message};
        }
    };

    const {portable, profileBlob, rgbDomain, keyBehaviorDomain, comboDomain, settingsDomain, pdModeDomain} = core;
    // A profile's domains, each decoded and encoded again the way a snapshot
    // decodes them (portable-profile.js validateSnapshot).
    const domainCodec = (domain) => {
        switch (domain.id) {
            case 0x10: return [(bytes) => rgbDomain.decodeRgbDomainV1(bytes), (value) => rgbDomain.encodeRgbDomainV1(value)];
            case 0x20: return [(bytes) => keyBehaviorDomain.decodeKeyBehaviorDomain(bytes), (value) => keyBehaviorDomain.encodeKeyBehaviorDomain(value)];
            case 0x30: return [(bytes) => comboDomain.decodeComboDomain(bytes), (value) => comboDomain.encodeComboDomain(value)];
            case 0x40: return [(bytes) => settingsDomain.decodeSettings(bytes), (value) => settingsDomain.encodeSettings(value)];
            case 0x50: return [(bytes) => pdModeDomain.decodePdDomain(bytes), (value) => pdModeDomain.encodePdDomain(value)];
            default: return null;
        }
    };
    const blobs = inputs.blobs.map(({name, hex: text}) => attempt(() => {
        const decoded = profileBlob.decodeProfileBlob(bytesOf(text));
        const domains = decoded.domains.map((domain) => {
            const codec = domainCodec(domain);
            if (!codec) return {id: domain.id, payload: domain.payload};
            const value = attempt(() => codec[0](domain.payload));
            const encoded = value.error ? value : attempt(() => codec[1](codec[0](domain.payload)));
            return {id: domain.id, version: domain.version, value, encoded};
        });
        return {name, decoded, domains, encoded: profileBlob.encodeProfileBlob(decoded), crc32: profileBlob.crc32(bytesOf(text)), fnv1a32: profileBlob.fnv1a32(bytesOf(text))};
    }));

    // The firmware's domain vectors, valid and invalid: a rejection has to
    // carry the same code in both.
    const vector = {
        rgb: [(bytes, options) => rgbDomain.decodeRgbDomainV1(bytes, options), (value, options) => rgbDomain.encodeRgbDomainV1(value, options)],
        behaviors: [(bytes, options) => keyBehaviorDomain.decodeKeyBehaviorDomain(bytes, options), (value, options) => keyBehaviorDomain.encodeKeyBehaviorDomain(value, options)],
        behaviorEnvelope: [(bytes, options) => keyBehaviorDomain.decodeKeyBehaviorDomainEnvelope(bytes, options), (value, options) => keyBehaviorDomain.encodeKeyBehaviorDomainEnvelope(value, options)],
        combos: [(bytes, options) => comboDomain.decodeComboDomain(bytes, options), (value, options) => comboDomain.encodeComboDomain(value, options)],
        pd: [(bytes, options) => pdModeDomain.decodePdDomain(bytes, options), (value) => pdModeDomain.encodePdDomain(value)],
    };
    const domains = inputs.domains.map(({name, kind, hex: text, options = {}}) => {
        const [decode, encode] = vector[kind];
        const value = attempt(() => decode(bytesOf(text), options));
        return {name, value, encoded: value.error ? value : attempt(() => encode(decode(bytesOf(text), options), options))};
    });

    // Complete portable documents: the snapshot decode, its fingerprint and
    // summary, and the document written again from what was decoded.
    const documents = inputs.documents.map(({name, document}) => attempt(() => {
        const decoded = portable.validateSnapshot(document);
        const rewritten = portable.createSnapshot({profile: decoded.profile, actionAbiDigest: document.actionAbiDigest,
            via: {layers: document.layers.length, layout: decoded.layout, macros: decoded.macros, macroSlots: document.macros.length}});
        return {name, decoded, fingerprint: portable.fingerprint(document), summary: portable.summary(document), rewritten};
    }));

    // A draft as the host keeps one: staged edits, then the panel model, as
    // scripts/preview.js builds it. The id and the clock are pinned, being the
    // two things two runs may not share.
    const {document, capabilities, messages, deviceId} = inputs.draft;
    const snapshot = {document, fingerprint: portable.fingerprint(document), summary: portable.summary(document), identity: {generation: 42}};
    const draft = new core.ProfileDraftSession(snapshot, deviceId, capabilities);
    draft.id = "draft";
    draft.now = () => 0;
    draft.times = draft.times.map(() => 0);
    const staged = messages.map((message) => attempt(() => draft.stage({draftId: draft.id, draftRevision: draft.revision, ...message})));
    const state = {selectedDeviceId: deviceId, connected: true, busy: false, capabilities,
        status: {committedGeneration: 42, committedDigest: 0x9ac31b70, activeGeneration: 42, peerGeneration: 42},
        devices: [{id: deviceId, label: "Charybdis 4x6 · web build", manufacturer: "Bastard Keyboards", product: "Charybdis 4x6"}]};
    const panel = {service: {portable: null}, draft, portableLayers: core.startLayerEdit(snapshot, draft.revision)};
    const model = core.buildPanelModel(panel, state);

    return {blobs, domains, documents, draft: {staged, document: plain(draft.document), revision: draft.revision}, model: plain(model), rawModel: JSON.parse(JSON.stringify(model))};
}

module.exports = {exerciseCore};
