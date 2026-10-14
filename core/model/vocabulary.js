// @ts-check
"use strict";

// The words this app uses for keyboard values and operations, in one place.
//
// The model names enum values the way the keyboard does (`RGB_LEFT_HALF`,
// `REPEAT_WHILE_HELD`); these are the words a person reads for them. The
// review builds its rows from here, and the same table travels to the
// interface as `model.vocabulary`, so an editor, its dropdown and the review
// never name one thing two ways. Lists are ordered as the editors offer them.

const {RGB_STAGE_BITS} = require("../schema/rgb-domain-v1");
const {hostLayouts} = require("../data/host-layouts");

// Device phases are identities, never their presentation labels. The same
// words serve progress, status and the browser's active-write warning.
const PHASE = Object.freeze({
    IDLE: "idle",
    AVAILABLE: "available",
    EMPTY: "empty",
    CONNECTED: "connected",
    DEMO: "demo",
    ENUMERATE: "enumerate",
    CONNECT: "connect",
    REFRESH: "refresh",
    READ_LAYOUT: "read-layout",
    READ_PROFILE: "read-profile",
    READ_COMPLETE: "read-complete",
    RESTORE_COMPLETE: "restore-complete",
    DISCONNECT: "disconnect",
    READ_COMBOS: "read-combos",
    READ_BASE_RGB: "read-base-rgb",
});
/** @type {Readonly<Record<import('../../contracts/model.js').PhaseId, Readonly<import('../../contracts/model.js').PhaseWords>>>} */
const PHASE_WORDS = Object.freeze({
    [PHASE.IDLE]: Object.freeze({label: "idle", writes: false}),
    [PHASE.AVAILABLE]: Object.freeze({label: "available", writes: false}),
    [PHASE.EMPTY]: Object.freeze({label: "empty", writes: false}),
    [PHASE.CONNECTED]: Object.freeze({label: "connected", writes: false}),
    [PHASE.DEMO]: Object.freeze({label: "demo", writes: false}),
    [PHASE.ENUMERATE]: Object.freeze({label: "enumerating", read: "Looking for a keyboard", busy: "Looking for a keyboard", writes: false}),
    [PHASE.CONNECT]: Object.freeze({label: "connecting", read: "Connecting to the keyboard", busy: "Connecting to the keyboard", writes: false}),
    [PHASE.REFRESH]: Object.freeze({label: "refreshing", read: "Checking both halves", busy: "Checking both halves", writes: false}),
    [PHASE.READ_LAYOUT]: Object.freeze({label: "reading layout", read: "Reading keys and layers", busy: "Reading keys and layers", writes: false}),
    [PHASE.READ_PROFILE]: Object.freeze({label: "reading profile", read: "Reading lighting and behaviours", busy: "Reading lighting and behaviours", writes: false}),
    [PHASE.READ_COMPLETE]: Object.freeze({label: "reading complete profile", read: "Reading the complete profile", busy: "Reading the complete profile", writes: false}),
    [PHASE.RESTORE_COMPLETE]: Object.freeze({label: "restoring complete profile", busy: "Saving the profile to both halves", writes: true}),
    [PHASE.DISCONNECT]: Object.freeze({label: "disconnecting", writes: false}),
    [PHASE.READ_COMBOS]: Object.freeze({label: "reading combos", read: "Checking active combos", busy: "Checking active combos", writes: false}),
    [PHASE.READ_BASE_RGB]: Object.freeze({label: "reading base RGB", read: "Checking base lighting", busy: "Checking base lighting", writes: false}),
});

// Whether the two halves agree, in words for someone who has never heard of
// generations or a split link. The device model decides which applies. The
// halves are always the master half (on USB) and the slave half, as in the
// firmware and on the board itself: never "the other" or "the second" half.
/** @type {Readonly<Record<import('../../contracts/model.js').HalvesId, Readonly<{label: string, detail: string}>>>} */
const HALVES_WORDS = Object.freeze({
    agree: Object.freeze({label: "Both halves connected",
        detail: "The master and slave halves are connected and hold the same saved settings."}),
    alone: Object.freeze({label: "Slave half not found",
        detail: "The master half can't see the slave half. Check the cable between the halves, then read the keyboard again. Until then Ark can't read or save the whole setup."}),
    apart: Object.freeze({label: "Halves out of sync",
        detail: "The master and slave halves hold different saved settings, or the slave half is still copying them. Wait a moment and read the keyboard again; if it stays like this, reconnect the cable between the halves."}),
    unread: Object.freeze({label: "Not read yet",
        detail: "Ark hasn't read this keyboard yet."}),
});

/** @type {Readonly<Record<string, string>>} */
const OS_WORDS = {macos: "macOS", windows: "Windows", linux: "Linux"};

/** @type {Readonly<import("../../contracts/model.js").Vocabulary>} */
const VOCABULARY = Object.freeze(/** @satisfies {import("../../contracts/model.js").Vocabulary} */ ({
    lighting: {
        bands: {base: "Base", layers: "Layers", preview: "Layer previews", modes: "Pointing modes", combos: "Combos", feedback: "Gesture feedback", other: "Other rules"},
        targets: ["Whole board", "Left half", "Right half", "Saved key set", "Its keys", "Its halves", "Its mapped keys", "Its usual lighting area"],
        paints: ["Let the rules below show", "Off", "Colour", "Its own colour", "Painted map", "Dim the light below", "Tint the light below"],
        states: ["Branch selected", "Tap", "Hold", "Long hold"],
        scopes: ["Each key", "Newest gesture on each half", "Newest gesture", "Newest gesture in each state"],
    },
    phases: PHASE_WORDS,
    halves: HALVES_WORDS,
    hostOs: [[0, "Auto"], [1, "macOS"], [2, "Windows"], [3, "Linux"]],
    macroPlayback: {setup: "setup", tooLong: "too long", blocked: "blocked", noRoom: "no room"},
    macroProtection: [["auto", "Automatic"], ["on", "On"], ["off", "Off"]],
    // A host layout names its OS, since German on macOS and on Windows differ.
    hostLayouts: hostLayouts().map(/** @returns {[number, string]} */ layout => [layout.id, layout.os === "any" ? layout.name : `${layout.name} (${OS_WORDS[layout.os]})`]),
    // How a hold tier runs once its threshold passes, in that tier's words: a
    // helper that names a threshold names the tier's own, the Tap / hold
    // threshold for Hold and the Long hold threshold for Long hold. A tap tier
    // only sends.
    holdHelpers: {
        hold: [
            ["PRESS_AND_HOLD_UNTIL_RELEASE", "held until release"],
            ["TAP_AT_HOLD_THRESHOLD", "tap at Tap / hold threshold"],
            ["TAP_ON_RELEASE_AFTER_HOLD", "tap on release after Tap / hold threshold"],
            ["REPEAT_WHILE_HELD", "repeat while held"],
        ],
        long: [
            ["PRESS_AND_HOLD_UNTIL_RELEASE", "held until release"],
            ["TAP_AT_HOLD_THRESHOLD", "tap at Long hold threshold"],
            ["TAP_ON_RELEASE_AFTER_HOLD", "tap on release after Long hold threshold"],
            ["REPEAT_WHILE_HELD", "repeat while held"],
        ],
    },
    // What a Hold does past the Long hold threshold when no Long hold is set:
    // nothing takes over, so it carries on the way it runs.
    holdWithoutLongHold: [
        ["PRESS_AND_HOLD_UNTIL_RELEASE", "stays held until release"],
        ["TAP_AT_HOLD_THRESHOLD", "already sent at Tap / hold threshold"],
        ["TAP_ON_RELEASE_AFTER_HOLD", "still sends on release"],
        ["REPEAT_WHILE_HELD", "keeps repeating until release"],
    ],
    tapSends: "tap sends",
    tiers: {tap: "Tap", hold: "Hold", long: "Long hold"},
    // A behaviour's branch by how many taps start it.
    branches: ["Single tap", "Double tap", "Triple tap", "Quadruple tap", "Quintuple tap"],

    localities: [
        ["RGB_BOTH_HALVES", "Both halves"], ["RGB_LEFT_HALF", "Left half"], ["RGB_RIGHT_HALF", "Right half"],
        ["RGB_KEY_HALF", "The half holding the trigger key"], ["RGB_KEYS_ONLY", "Only the trigger key"],
    ],
    paintModes: [["KEYS_MAPPED_ON_THIS_LAYER_ONLY", "Keys mapped on this layer only"], ["ALL_KEYS", "All keys"]],
    fadeModes: [
        ["FOLLOW_REAL_DESTINATION", "Follow the real destination"],
        ["END_COLOR_WHERE_BASE_EFFECT_WOULD_SHOW", "End colour where the base effect would show"],
        ["END_COLOR_ON_ALL_KEYS", "End colour on all keys"],
    ],
    tapCommit: [["KEY_FEEDBACK_TAP_COMMIT_OFF", "Off"], ["KEY_FEEDBACK_TAP_COMMIT_NON_BASE_TAPS", "Non-base taps"]],
    feedbackOwners: [
        ["KEY_FEEDBACK_GROUP_ALL", "Every feedback state"],
        ["KEY_FEEDBACK_GROUP_TAP_BRANCH_PENDING", "Tap branch pending"],
        ["KEY_FEEDBACK_GROUP_TAP_COMMITTED", "Tap committed"],
        ["KEY_FEEDBACK_GROUP_HOLD_ACTIVE", "Hold active"],
        ["KEY_FEEDBACK_GROUP_LONG_HOLD_ACTIVE", "Long hold active"],
    ],
    // The lighting stages in the order the firmware paints them. A stage is
    // found by its id or bit, never by its words.
    stages: [
        {id: "base", label: "Base effect"},
        {id: "layers", label: "Layer colours", bit: RGB_STAGE_BITS.LAYER},
        {id: "auto", label: "Auto-mouse fade", bit: RGB_STAGE_BITS.AUTOMOUSE},
        {id: "pd", label: "Pointing modes", bit: RGB_STAGE_BITS.PD_MODE},
        {id: "combo", label: "Combo feedback", bit: RGB_STAGE_BITS.COMBO},
        {id: "key", label: "Key feedback", bit: RGB_STAGE_BITS.KEY_BEHAVIOR},
    ],

    pointing: {
        kinds: [[0, "Empty"], [1, "Directional keys / shortcuts"], [2, "Scrolling"]],
        axes: [[2, "Dominant axis"], [3, "Eight directions"], [0, "Vertical only"], [1, "Horizontal only"]],
        invert: [[0, "Neither axis"], [1, "Horizontal"], [2, "Vertical"], [3, "Both axes"]],
        // Which axes a scrolling mode scrolls.
        scrollAxes: [[0, "Both axes"], [1, "Horizontal only"], [2, "Vertical only"]],
        pointerLayer: [[0, "Keep the pointer layer active"], [1, "Return to the typing layer"]],
        buttons: [[0, "Pass through"], [1, "Consume"], [2, "Tap a shortcut"], [3, "Hold modifiers"]],
        // What moving toward a direction with no shortcut does. "Both" sends
        // the two compass neighbours, 45 degrees either side, the one the
        // movement leans toward first: a diagonal's straight directions, a
        // straight direction's diagonals. Only eight directions has those, so
        // elsewhere it acts as "its neighbours take over".
        emptyDirection: [[0, "Its neighbours take over"], [1, "Send both neighbours"], [2, "Nothing"]],
        // How often a directional mode sends: once for each threshold step,
        // or once per movement: again only after a pause or moving back.
        directionOutput: [[0, "Every step"], [1, "Once per movement"]],
        modifierPolicy: [[0, "Inherit modifiers"], [1, "Ignore"], [2, "Exact shortcut"]],
        scrollFields: [
            ["thresholdH", "Horizontal activation threshold"], ["thresholdV", "Vertical activation threshold"],
            ["divisorH", "Movement per wheel step ↔"], ["divisorV", "Movement per wheel step ↕"],
            ["intervalMs", "Minimum interval (ms)"], ["expireMs", "Gesture expiry (ms)"], ["lockMs", "Axis lock timeout (ms)"],
            ["startNumerator", "Axis selection ratio · numerator"], ["startDenominator", "Axis selection ratio · denominator"],
            ["sustainNumerator", "Axis retention ratio · numerator"], ["sustainDenominator", "Axis retention ratio · denominator"],
            ["decayDivisor", "Cross-axis decay divisor"],
        ],
        heldModifiers: "Hold modifiers while scrolling",
    },
    modifiers: [[1, "Left Ctrl"], [2, "Left Shift"], [4, "Left Alt"], [8, "Left GUI"],
        [16, "Right Ctrl"], [32, "Right Shift"], [64, "Right Alt"], [128, "Right GUI"]],
    comboOptions: {useOutputBehavior: "use output behaviour", mustHold: "must be held", mustTap: "tap only", ordered: "keys in order"},
}));

// A word from one of the ordered lists, by the key the keyboard uses; an
// unknown key reads as itself rather than disappearing.
/** @param {import("../../contracts/model.js").WordList<unknown>} list @param {unknown} key @returns {string} */
const word = (list, key) => (list.find(([id]) => id === key)?.[1] ?? String(key ?? ""));

// The names a person reads for a layer and a pointing slot that have none of
// their own. Layer 0 is the base layer.
/** @param {readonly string[] | null | undefined} names @param {number} index */
const layerName = (names, index) => names?.[index] || (index ? `Layer ${index}` : "Base");
/** @param {{id: number, kind: number, name: string} | null | undefined} slot @param {number} [id] */
const slotName = (slot, id = slot?.id) => (slot?.kind && slot.name) || `Slot ${id}`;
/** @param {number} count */
const branchName = (count) => VOCABULARY.branches[count - 1] || `${count} taps`;
/** @param {number} mask */
const modifierNames = (mask) => VOCABULARY.modifiers.filter(([bit]) => mask & bit).map(([, name]) => name);

module.exports = {PHASE, PHASE_WORDS, HALVES_WORDS, VOCABULARY, word, layerName, slotName, branchName, modifierNames};
