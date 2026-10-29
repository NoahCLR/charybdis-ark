// @ts-check
"use strict";
// The model core publishes, for the interface's tests: a profile document
// built with the test profile's helpers, opened as a draft on current
// firmware (the demo's capabilities), with any edits staged as the panel posts
// them, and published by core's own builders. A view test reads what core
// publishes, so a fact renamed or reshaped there fails the view test too.
const portable = require("../../core/model/portable-profile");
const keycodes = require("../../core/schema/keycodes");
const {buildSnapshotModel} = require("../../core/session/device-model");
const {buildPanelModel} = require("../../core/session/panel-session");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const {DEMO_CAPABILITIES, DEMO_LIMITS, DEMO_OPTIONS} = require("../../core/session/demo-session");
const {PROFILE_DOMAIN_IDS, domainCodec, replaceDomain} = require("../../core/schema/profile-domains");
const {PD_MODE_KEYS} = require("../../core/data/pd-mode-keys");
const {LAYERS, matrixPosition} = require("../../core/data/charybdis-layout");
const {customKeyCode, customKeyOfName} = require("../../core/data/user-keycodes");
const {compiled, settings: testSettings} = require("./portable-profile");

const DEMO_PROFILE = require("../../core/data/demo-profile.charybdis.json");

// A keycode by any name a test writes for it: QMK's, or the semantic name of
// a macro, a custom key or a pointing mode.
/** @param {string | number} name */
function keycodeOf(name) {
    if (typeof name === "number") return name;
    const macro = /^MACRO_(\d+)$/.exec(name);
    if (macro) return /** @type {number} */ (keycodes.encode(`QK_MACRO_${macro[1]}`));
    const custom = customKeyOfName(name);
    if (custom !== undefined) return customKeyCode(custom);
    const mode = PD_MODE_KEYS.find((keys) => keys.hold === name || keys.lock === name);
    if (mode) return mode.hold === name ? mode.holdCode : mode.lockCode;
    const code = keycodes.encode(name);
    if (typeof code !== "number") throw new Error(`No keycode is called ${name}.`);
    return code;
}

/**
 * The test profile (./portable-profile) with an empty layout but for `keys`,
 * by layer and layout index; these combos; its settings as `settings` leaves
 * them; and its pointing slots as `slots` leaves them.
 * @param {{keys?: Record<number, Record<number, string | number>>, combos?: {inputs: (string | number)[], output: string | number, termMs?: number, followsDefault?: boolean, mustHold?: boolean, mustTap?: boolean, ordered?: boolean, enabled?: boolean, useOutputBehavior?: boolean, allowedLayers?: number}[], settings?: (settings: import("../../core/schema/types.js").SettingsDomain) => unknown, slots?: (records: any[]) => unknown}} [described]
 */
function profileDocument({keys = {}, combos = [], settings, slots} = {}) {
    const layers = Array.from({length: LAYERS}, () => Array(60).fill(0));
    for (const [layer, placed] of Object.entries(keys)) {
        for (const [layoutIndex, name] of Object.entries(placed)) layers[Number(layer)][matrixPosition(Number(layoutIndex))] = keycodeOf(name);
    }
    const policy = testSettings();
    settings?.(policy);
    const doc = compiled({layers, policy, combos: combos.map(({inputs, output, ...row}, id) => ({id, termMs: 50, followsDefault: true, mustHold: false, mustTap: false, ordered: false,
        ...row, inputs: inputs.map(keycodeOf), output: keycodeOf(output)}))});
    if (slots) {
        const codec = domainCodec("pdModes");
        doc.profile = replaceDomain(Buffer.from(doc.profile, "base64"), PROFILE_DOMAIN_IDS.PD_MODES, (payload) => {
            const records = codec.decode(payload); slots(records); return codec.encode(records);
        }).toString("base64");
    }
    return doc;
}

// The bundled demo profile, a fresh copy each time.
/** @returns {import("../../core/model/types.js").PortableDocument} */
const demoDocument = () => /** @type {any} */ (structuredClone(DEMO_PROFILE));

/** @param {import("../../core/model/types.js").PortableDocument} doc */
const snapshotOf = (doc) => ({document: doc, fingerprint: portable.fingerprint(doc), summary: portable.summary(doc), limits: {...DEMO_LIMITS}, options: DEMO_OPTIONS});

// The state the panel answers to with this keyboard connected and selected.
/** @param {any} [capabilities] @param {string} [deviceId] */
const connectedState = (capabilities = DEMO_CAPABILITIES, deviceId = "board") =>
    ({connected: true, busy: false, selectedDeviceId: deviceId, capabilities, devices: [{id: deviceId, label: "Charybdis 4x6", product: "Charybdis 4x6"}]});

/**
 * A draft on `doc` for a connected keyboard, with `edits` staged as the panel
 * posts them (each takes the draft's id and revision), and the state the
 * panel answers to.
 * @param {import("../../core/model/types.js").PortableDocument} [doc]
 * @param {{capabilities?: any, edits?: object[], deviceId?: string}} [options]
 */
function openDraft(doc = demoDocument(), {capabilities = DEMO_CAPABILITIES, edits = [], deviceId = "board"} = {}) {
    const draft = new ProfileDraftSession(snapshotOf(doc), deviceId, capabilities);
    for (const edit of edits) draft.stage(/** @type {any} */ ({...edit, draftId: draft.id, draftRevision: draft.revision}));
    return {draft, state: connectedState(capabilities, deviceId)};
}

/**
 * What core publishes for `doc` (the demo profile unless given), with `edits`
 * staged first: buildSnapshotModel, as the panel builds it for an open draft.
 * @param {import("../../core/model/types.js").PortableDocument} [doc]
 * @param {{capabilities?: any, edits?: object[], editable?: boolean}} [options]
 */
function publishedModel(doc, {capabilities = DEMO_CAPABILITIES, edits = [], editable = true} = {}) {
    const {draft, state} = openDraft(doc, {capabilities, edits});
    return buildSnapshotModel(draft.current, draft.capabilities, {editable, reason: editable ? "" : "busy"}, state);
}

/**
 * The panel's whole model for a draft, as the shell posts it
 * (buildPanelModel): what a browser test publishes to the page.
 * @param {InstanceType<typeof ProfileDraftSession>} draft @param {any} state
 */
const panelModel = (draft, state) => buildPanelModel({service: {portable: null}, draft}, state);

// A published key, by layer and layout index.
/** @param {any} model @param {number} layer @param {number} layoutIndex */
const keyAt = (model, layer, layoutIndex) => model.layers[layer].positions.find((/** @type {{layoutIndex: number}} */ position) => position.layoutIndex === layoutIndex);

module.exports = {connectedState, demoDocument, keyAt, keycodeOf, openDraft, panelModel, profileDocument, publishedModel};
