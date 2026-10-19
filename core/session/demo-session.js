// @ts-check
"use strict";
const {PHASE} = require("../model/vocabulary");
const {LAYERS} = require("../data/charybdis-layout");

// Ark without a keyboard: the demo (D-L53).
//
// The demo is Ark's own draft session over a document with no device behind
// it: the bundled demo profile (core/data/demo-profile.charybdis.json), or a
// profile file opened in its place, under the capabilities of current firmware.
// Every screen, edit, check and review therefore behaves exactly as on a
// keyboard. What needs a keyboard is refused here, in core, and not only hidden
// in the interface: Apply, and reviewing against the keyboard.
//
// A panel session in the demo carries `session.demo` ({name, fileName,
// exported}). While it does, the state everything in the panel answers to is
// demoState(), not the device service's snapshot. In that state the demo is
// the draft's device: `connected` says the draft's source is here, so every
// editing gate holds as it does on a keyboard. What the panel is told about
// the device is demoHeader(): no keyboard, no generation, no halves. The
// device service stays as it was, for when the demo is left.

/**
 * @typedef {import("./types.js").DemoSession} Session
 * @typedef {import("./types.js").PanelDeviceState} State
 * @typedef {Pick<import("../../contracts/messages.js").DemoControl, 'discardDemo'>} CloseOptions
 * @typedef {Session & {demo: import("./types.js").DemoMetadata}} OpenSession
 */
const {panelControl} = require("./panel-control-registry");
const {ProfileDraftSession} = require("./profile-draft-session");
const {replaceDraft} = require("./panel-session-state");
const {validateSnapshot, fingerprint, summary} = require("./portable-profile-session");
const {ACTION_ABI} = require("../schema/actions");
const {PROFILE_WIRE_KNOWN_MASKS} = require("../protocol/profile-wire-v1");
const DEMO_PROFILE = require("../data/demo-profile.charybdis.json");

// The draft's keyboard, which is none. A device id is never this word.
const DEMO_DEVICE_ID = "demo";

// What current firmware (the 32-slot pair) reports about itself, as the device
// service decodes it, without what only a real keyboard has: its firmware
// version and the digest of the profile it was compiled with.
// tests/session/demo-session.test.js holds this to what the simulated current
// keyboard (tests/fixtures/fake-keyboard.js) reports.
const DEMO_CAPABILITIES = Object.freeze({
    responseVersion: 3,
    protocol: Object.freeze({major: 2, minor: 0}),
    schema: Object.freeze({major: 4, minor: 0}),
    reportSize: 32,
    candidateChunkMax: 20,
    statusPageCount: 2,
    featureFlags: PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES,
    actionAbiDigest: ACTION_ABI,
    compiledLayerCount: 16,
    maxLogicalLayers: LAYERS,
    maxBehaviorRows: 128,
    maxTapStepsPerBehavior: 5,
    maxPopulatedBehaviorSteps: 640,
    maxCombos: 128,
    maxKeysPerCombo: 16,
    maxReusableRgbGroups: 16,
    maxRgbStageGroupRows: 32,
    physicalLedCount: 58,
    ledBitmapSize: 8,
    customKeySlots: 128,
    macroSlots: 128,
    maxProfilePayload: 130048,
    profileSlotPayload: 130048,
    profileSlotSize: 131072,
    macroBytes: 34903,
    supportedDomainMask: PROFILE_WIRE_KNOWN_MASKS.SUPPORTED_DOMAINS,
    nameMaxBytes: 32,
    layerMaskBits: 32,
    placementPositions: 60,
});

// What current firmware reports beside its profile, written here as data (it
// is never read from a firmware checkout): its brightness limit, and the
// keyboard options page — the RGB Matrix effects the Charybdis build enables,
// in QMK's order, the QMK key options it supports (Magic and one-shot keys; no
// NKRO or Autocorrect) and the LED classes it has (modifier and key lights).
const DEMO_LIMITS = Object.freeze({brightnessMax: 200});
const DEMO_EFFECTS = [
    "SOLID_COLOR", "ALPHAS_MODS", "GRADIENT_UP_DOWN", "GRADIENT_LEFT_RIGHT", "BREATHING", "BAND_SAT", "BAND_VAL",
    "BAND_PINWHEEL_SAT", "BAND_PINWHEEL_VAL", "BAND_SPIRAL_SAT", "BAND_SPIRAL_VAL", "CYCLE_ALL", "CYCLE_LEFT_RIGHT",
    "CYCLE_UP_DOWN", "RAINBOW_MOVING_CHEVRON", "CYCLE_OUT_IN", "CYCLE_OUT_IN_DUAL", "CYCLE_PINWHEEL", "CYCLE_SPIRAL",
    "DUAL_BEACON", "RAINBOW_BEACON", "RAINBOW_PINWHEELS", "RAINDROPS", "JELLYBEAN_RAINDROPS", "HUE_BREATHING",
    "HUE_PENDULUM", "HUE_WAVE", "TYPING_HEATMAP", "DIGITAL_RAIN", "SOLID_REACTIVE_SIMPLE", "SOLID_REACTIVE",
    "SOLID_REACTIVE_WIDE", "SOLID_REACTIVE_MULTIWIDE", "SOLID_REACTIVE_CROSS", "SOLID_REACTIVE_MULTICROSS",
    "SOLID_REACTIVE_NEXUS", "SOLID_REACTIVE_MULTINEXUS", "SPLASH", "MULTISPLASH", "SOLID_SPLASH", "SOLID_MULTISPLASH",
];
const DEMO_OPTIONS = Object.freeze({
    effects: DEMO_EFFECTS.map((name, index) => Object.freeze({id: index + 1, name})),
    keymapMasks: Object.freeze(Array.from({length: 13}, (_, bit) => 1 << bit)),
    supportedKeymapOptions: 0x0f7f,
    ledFlags: 5,
});


// What core says in the demo: the device it is not, and why Apply is not here.
const DEMO_WORDS = Object.freeze({
    label: "Demo",
    bundled: "the demo setup",
    applyNeedsKeyboard: "Apply needs a keyboard. Export this setup, then import it on your keyboard to review and apply it there.",
});

/** @param {string} text @param {string} [code] */
const fail = (text, code = "DEMO_REFUSED") => Object.assign(new Error(text), {code});

// A document as the demo's keyboard side: checked as Import checks a file
// against current firmware, with the
// limits and options a keyboard would have reported beside it.
/** @param {unknown} value @returns {import("../model/types.js").CompleteSnapshot} */
function demoSnapshot(value) {
    const {document} = validateSnapshot(value, DEMO_CAPABILITIES);
    return {document, fingerprint: fingerprint(document), summary: summary(document), limits: {...DEMO_LIMITS}, options: DEMO_OPTIONS, hostOs: {detected: 0}};
}

// The bundled demo profile, as a fresh copy each time.
/** @returns {unknown} */
const demoProfile = () => JSON.parse(JSON.stringify(DEMO_PROFILE));

// Whether the demo may open now, given the device service's state: never over
// a keyboard that is connected or busy, or over unapplied edits to one. A
// refusal says which.
/** @param {Pick<Session, "demo" | "draft" | "readBusy">} session @param {State} state */
function demoRefusal(session, state) {
    if (state.connected) return "A keyboard is connected. Disconnect it to explore the demo instead.";
    if (state.busy || session.readBusy) return "Ark is working with a keyboard. Wait for it to finish.";
    if (session.draft?.dirty && !session.demo) return "Your draft has changes for a keyboard. Reconnect it to apply them, or discard them, before exploring the demo.";
    return "";
}

// Edits made in the demo and not exported since are lost when it is left or
// replaced.
/** @param {Pick<Session, "demo" | "draft">} session */
const demoUnsaved = (session) => Boolean(session.demo && session.draft?.dirty && session.draft.current.fingerprint !== session.demo.exported);

// The panel asks before losing them and then says so with `discardDemo`; a
// message without it is refused.
/** @param {Session} session @param {CloseOptions | null | undefined} message */
function assertDemoMayClose(session, message) {
    if (demoUnsaved(session) && message?.discardDemo !== true) {
        throw fail("The demo has edits that were not exported. Export them first, or confirm leaving them behind.", "DEMO_UNSAVED");
    }
}

// Opens the demo over `value` (the bundled profile when omitted), or replaces
// the one open. The file is checked before anything is replaced, so a file
// that is refused leaves the demo as it was.
/** @param {Session} session @param {State} state @param {{value?: unknown; fileName?: string | null}} [options] */
function openDemo(session, state, {value, fileName = null} = {}) {
    if (!session.demo) {
        const refused = demoRefusal(session, state);
        if (refused) throw fail(refused);
    }
    const snapshot = demoSnapshot(value === undefined ? demoProfile() : value);
    session.demo = {name: fileName || DEMO_WORDS.bundled, fileName, exported: null};
    replaceDemoDraft(session, new ProfileDraftSession(snapshot, DEMO_DEVICE_ID, DEMO_CAPABILITIES));
}

// Entering or leaving the demo, the draft is no longer one a keyboard read
// opened: the next complete read opens its own.
/** @param {Session} session @param {Session["draft"]} draft */
function replaceDemoDraft(session, draft) {
    replaceDraft(session, draft);
    session.observedPortable = undefined;
    session.readReady = undefined;
}

// Leaves the demo for no keyboard, as before it opened. The caller reads a
// keyboard next, or not.
/** @param {Session} session @param {CloseOptions | null | undefined} message */
function leaveDemo(session, message) {
    if (!session.demo) return;
    assertDemoMayClose(session, message);
    session.demo = undefined;
    session.historyOpen = false;
    replaceDemoDraft(session, undefined);
}

// The demo's own controls. `host.chooseProfile` is the same file chooser
// Import uses; what it returns is checked as Import checks it.
/** @typedef {{session: Session, message: import('../../contracts/messages.js').DemoControl, host: import('./types.js').ProfileChooser, state: State}} DemoContext */
/** @type {Readonly<Record<string, (context: DemoContext) => void | Promise<void>>>} */
const DEMO_ACTIONS = Object.freeze({
    open: ({session, state}) => {
        if (!session.demo) openDemo(session, state);
    },
    leave: ({session, message}) => {
        leaveDemo(session, message);
        session.notice = "Left the demo.";
    },
    openProfile: async ({session, message, host, state}) => {
        if (session.demo) assertDemoMayClose(session, message);
        else {
            const refused = demoRefusal(session, state);
            if (refused) throw fail(refused);
        }
        const chosen = await host.chooseProfile?.();
        if (chosen === undefined) return;
        const name = typeof chosen === "string" ? null : chosen.name || null;
        openDemo(session, state, {value: typeof chosen === "string" ? chosen : chosen.text, fileName: name});
        session.notice = `Opened ${name || "the profile file"} in the demo.`;
        return;
    },
});

/** @param {Session} session @param {import('../../contracts/messages.js').DemoControl} message @param {import('./types.js').ProfileChooser} host @param {State} state */
async function demoControl(session, message, host, state) {
    const control = panelControl(message.type);
    const action = control?.route === "demo" ? DEMO_ACTIONS[control.action] : undefined;
    if (!action) throw fail("Unsupported demo control.");
    await action({session, message, host, state});
}

// Exporting from the demo saves the draft, edits and all: there is no keyboard
// whose profile it could be. What was exported is remembered, so leaving
// afterwards does not ask about edits that are already in a file.
/** @param {import("./types.js").ActiveDemoSession} session */
function demoExport(session) {
    const snapshot = session.draft.current;
    return {snapshot, saved: () => {session.demo.exported = snapshot.fingerprint;}};
}

// The state a demo's model is built from: the demo as the draft's device,
// with the capabilities of current firmware, and nothing else a keyboard has.
/** @returns {State & {demo: true}} */
function demoState() {
    return {
        phase: PHASE.DEMO,
        busy: false,
        connected: true,
        demo: true,
        devices: [],
        selectedDeviceId: DEMO_DEVICE_ID,
        connectionToken: null,
        capabilities: {...DEMO_CAPABILITIES},
        status: null,
        portableSummary: null,
        portableProgress: "",
        liveApply: null,
        error: null,
        diagnostics: [],
    };
}

// The state everything in the panel answers to: the demo's in the demo, the
// device service's otherwise.
/** @param {Session} session */
const panelState = (session) => (session.demo ? demoState() : session.service.snapshot());
/** @param {Session} session */
const panelCapabilities = (session) => (session.demo ? DEMO_CAPABILITIES : session.service.capabilities);

// The demo as the model carries it (`model.demo`): whether it is open, or
// offered, what it was opened from, and whether leaving would lose edits.
/** @param {Pick<Session, "demo" | "draft" | "readBusy">} session @param {State} state */
function demoModel(session, state) {
    const active = Boolean(session.demo);
    return {
        active,
        offered: !active && !demoRefusal(session, state),
        name: session.demo ? session.demo.name : null,
        fileName: session.demo ? session.demo.fileName : null,
        unsaved: demoUnsaved(session),
        applyNeedsKeyboard: DEMO_WORDS.applyNeedsKeyboard,
    };
}

// The rail's header in the demo, in the device's place: no keyboard, no
// generation, no halves to agree.
/** @param {Pick<OpenSession, "demo">} session @param {boolean} busy */
function demoHeader(session, busy) {
    return {
        connected: false,
        demo: true,
        label: DEMO_WORDS.label,
        summary: `No keyboard · ${session.demo.name}`,
        subtitle: "Nothing here was read from a keyboard, and nothing can be applied to one.",
        health: {profile: "demo", converged: false, halves: /** @type {import("../../contracts/model.js").HalvesId} */ ("unread"), recoveryPending: false, earlierFormat: false, restartNeeded: false, busy: Boolean(busy), phase: PHASE.DEMO, error: ""},
    };
}

/** @param {Pick<OpenSession, "demo">} session */
function demoDiagnostics(session) {
    return [
        `No keyboard is connected. The demo opened ${session.demo.name} as current firmware would hold it: sixteen layers, 32 pointing slots, 128 macros and 128 custom keys.`,
        "Edits, checks and the review work as they would on a keyboard. Apply needs one: export the setup, then import it on your keyboard.",
    ];
}

module.exports = {
    DEMO_ACTIONS,
    DEMO_CAPABILITIES, DEMO_DEVICE_ID, DEMO_LIMITS, DEMO_OPTIONS, DEMO_WORDS,
    assertDemoMayClose, demoControl, demoDiagnostics, demoExport, demoHeader, demoModel, demoProfile, demoRefusal, demoSnapshot,
    demoState, demoUnsaved, leaveDemo, openDemo, panelCapabilities, panelState,
};
