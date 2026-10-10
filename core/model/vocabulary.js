"use strict";

// The words this app uses for what the keyboard stores, in one place.
//
// The model names enum values the way the keyboard does (`RGB_LEFT_HALF`,
// `REPEAT_WHILE_HELD`); these are the words a person reads for them. The
// review builds its rows from here, and the same table travels to the
// interface as `model.vocabulary`, so an editor, its dropdown and the review
// never name one thing two ways. Lists are ordered as the editors offer them.

const {RGB_STAGE_BITS} = require("../schema/rgb-domain-v1");
const {hostLayouts} = require("../data/host-layouts");

const OS_WORDS = {macos: "macOS", windows: "Windows", linux: "Linux"};

const VOCABULARY = Object.freeze({
    hostOs: [[0, "Auto"], [1, "macOS"], [2, "Windows"], [3, "Linux"]],
    // A host layout names its OS, since German on macOS and on Windows differ.
    hostLayouts: hostLayouts().map(layout => [layout.id, layout.os === "any" ? layout.name : `${layout.name} (${OS_WORDS[layout.os]})`]),
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
    comboOptions: {mustHold: "must be held", mustTap: "tap only", ordered: "keys in order"},
});

// A word from one of the ordered lists, by the key the keyboard uses; an
// unknown key reads as itself rather than disappearing.
const word = (list, key) => (list.find(([id]) => id === key) || [, String(key ?? "")])[1];

// The names a person reads for a layer and a pointing slot that have none of
// their own. Layer 0 is the base layer.
const layerName = (names, index) => names?.[index] || (index ? `Layer ${index}` : "Base");
const slotName = (slot, id = slot?.id) => (slot?.kind && slot.name) || `Slot ${id}`;
const branchName = (count) => VOCABULARY.branches[count - 1] || `${count} taps`;
const modifierNames = (mask) => VOCABULARY.modifiers.filter(([bit]) => mask & bit).map(([, name]) => name);

module.exports = {VOCABULARY, word, layerName, slotName, branchName, modifierNames};
