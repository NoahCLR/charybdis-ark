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
    // Waiting for a keyboard that has just come back to finish starting
    // before reading it (keyboard-starting.js).
    STARTING: "starting",
    READ_LAYOUT: "read-layout",
    READ_PROFILE: "read-profile",
    READ_COMPLETE: "read-complete",
    RESTORE_COMPLETE: "restore-complete",
    DISCONNECT: "disconnect",
    READ_COMBOS: "read-combos",
    READ_BASE_RGB: "read-base-rgb",
    // Live + review (firmware D-F32): an edit reaching the keyboard's working
    // copy, Save writing it, Revert discarding it, the edit mode changing.
    LIVE_EDIT: "live-edit",
    LIVE_SAVE: "live-save",
    LIVE_REVERT: "live-revert",
    EDIT_MODE: "edit-mode",
    // Restarting both halves (firmware D-F34), the way out of a keyboard
    // that stopped saving.
    RESTART: "restart",
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
    [PHASE.STARTING]: Object.freeze({label: "waiting for the keyboard to start", read: "Waiting for the keyboard to finish starting…", busy: "Waiting for the keyboard to finish starting…", writes: false}),
    [PHASE.READ_LAYOUT]: Object.freeze({label: "reading layout", read: "Reading keys and layers", busy: "Reading keys and layers", writes: false}),
    [PHASE.READ_PROFILE]: Object.freeze({label: "reading profile", read: "Reading lighting and behaviours", busy: "Reading lighting and behaviours", writes: false}),
    [PHASE.READ_COMPLETE]: Object.freeze({label: "reading complete profile", read: "Reading the complete profile", busy: "Reading the complete profile", writes: false}),
    [PHASE.RESTORE_COMPLETE]: Object.freeze({label: "restoring complete profile", busy: "Saving the profile to both halves", writes: true}),
    [PHASE.DISCONNECT]: Object.freeze({label: "disconnecting", writes: false}),
    [PHASE.READ_COMBOS]: Object.freeze({label: "reading combos", read: "Checking active combos", busy: "Checking active combos", writes: false}),
    [PHASE.READ_BASE_RGB]: Object.freeze({label: "reading base RGB", read: "Checking base lighting", busy: "Checking base lighting", writes: false}),
    // An edit and a Revert change only the keyboard's RAM; closing the page
    // during one loses nothing saved. A Save writes flash.
    [PHASE.LIVE_EDIT]: Object.freeze({label: "sending an edit", busy: "Sending the edit to both halves", writes: false}),
    [PHASE.LIVE_SAVE]: Object.freeze({label: "saving", busy: "Saving the keyboard's edits on both halves", writes: true}),
    [PHASE.LIVE_REVERT]: Object.freeze({label: "reverting", busy: "Putting back the saved profile", writes: false}),
    [PHASE.EDIT_MODE]: Object.freeze({label: "changing how edits reach the keyboard", busy: "Changing how edits reach the keyboard", writes: false}),
    // A restart writes nothing: the keyboard reads its saved profile again.
    [PHASE.RESTART]: Object.freeze({label: "restarting", busy: "Restarting both halves", writes: false}),
});

// Why the keyboard did not take a live edit, Save, Revert or mode change, by
// the result it answered (firmware D-F32). Each finishes a sentence that
// starts with what did not happen.
/** @type {Readonly<Record<string, string>>} */
const LIVE_RESULT_WORDS = Object.freeze({
    STALE: "the keyboard changed since Ark last read it (another edit, a key adjustment or a restart).",
    BUSY: "the keyboard was busy with another edit, a save or its slave half.",
    INVALID_ARGUMENT: "the keyboard did not understand the request.",
    INVALID_STATE: "the keyboard was not ready for it.",
    WRONG_TRANSACTION: "another edit was in progress.",
    OUT_OF_ORDER: "part of the edit arrived out of order.",
    CAPACITY_EXCEEDED: "the edit does not fit the keyboard's profile memory.",
    CHECKSUM_MISMATCH: "the edit arrived damaged.",
    UNSUPPORTED_DOMAIN: "the keyboard does not know part of the profile it changes.",
    INVALID_SPLICE: "the keyboard could not place the change in its profile.",
    VALIDATION_REJECTED: "the keyboard's checks refused the result.",
    NOT_CLEAN: "the keyboard has unsaved edits. Save or Revert them first.",
    READ_ERROR: "the keyboard could not read or store it.",
    ABORTED: "a save or the slave half's newer profile replaced the profile meanwhile, or the edit was left unfinished (a Revert, or nothing arrived for 15 seconds).",
    PUBLICATION_FAILED: "the keyboard could not switch to the result.",
    // Not a result: the keyboard's flags say its profile storage stopped.
    STOPPED: "the keyboard stopped saving. Restart it to continue.",
});

// Ark's own live edit or Revert, held by the keyboard until no key is held
// (edit status flag 8), in words the person can act on: what edit status
// page 2 says holds it, where it names something a person lets go of
// (profile-wire-v1/live-edits.md: bit 0 a key is pressed, 4 a lock, 6 a
// modifier or one-shot, 7 a one-shot layer); other reasons are said as held
// keys alone. `refusal` answers another edit asked for meanwhile.
const SAFE_BOUNDARY_WORDS = Object.freeze(/** @type {const} */ ([[1 << 0, "a key"], [1 << 4, "a locked layer or pointer mode"], [1 << 6, "a modifier or one-shot"], [1 << 7, "a one-shot layer"]]));
/** @param {{kind: "edit" | "revert", reasons: number, cancelling: boolean}} waiting @returns {{title: string, detail: string, refusal: string}} */
function heldWords({kind, reasons, cancelling}) {
    const held = SAFE_BOUNDARY_WORDS.filter(([bit]) => reasons & bit).map(([, words]) => words);
    const list = held.length > 1 ? `${held.slice(0, -1).join(", ")} and ${held[held.length - 1]}` : held[0];
    const now = list ? `Held now: ${list}. ` : "";
    if (kind === "revert") return {title: "Let go of the held keys to finish reverting", detail: `${now}The keyboard puts back its saved profile the moment nothing is held; Ark waits for it.`,
        refusal: "Let go of the held keys first: the keyboard is still reverting."};
    return {title: cancelling ? "Cancelling the edit" : "Let go of the held keys to finish the edit",
        detail: cancelling ? "The keyboard drops the edit and keeps running what it ran before." : `${now}The keyboard takes the edit the moment nothing is held; Ark waits for it.`,
        refusal: "Let go of the held keys first: the keyboard is still taking the last edit."};
}

// How long a keyboard in Live waits, with no edit and no key held, before it
// saves by itself, in words: the quiet interval it reports, or 3 seconds
// until it has reported one (firmware D-F32).
const QUIET_FALLBACK_MS = 3000;
/** @param {number | null | undefined} [quietMs] */
function quietWords(quietMs) {
    const seconds = Math.round((quietMs || QUIET_FALLBACK_MS) / 1000);
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

// How edits reach a keyboard (stored on it, firmware D-F32), all three
// offered: what each does and what a replug does to edits not saved yet.
// The keyboard's Apply and Save are both Save to a person (D-L72). Live
// edit's words carry the keyboard's quiet interval.
/** @param {number | null | undefined} [quietMs] @returns {Readonly<Record<number, Readonly<{id: import('../../contracts/model.js').EditModeId, label: string, detail: string}>>>} */
const editModeWords = (quietMs) => Object.freeze({
    0: Object.freeze({id: "apply", label: "Review and save", detail: "Edits stay in Ark's draft until you review and save them. The keyboard runs its saved profile until then."}),
    1: Object.freeze({id: "live", label: "Live edit", detail: `Edits take effect on the keyboard at once. With or without Ark, the keyboard starts saving after ${quietWords(quietMs)} with no edit and no key held; holding a key postpones it. Unplugging loses every edit since the last successful save. A failed automatic save leaves that revision unsaved.`}),
    2: Object.freeze({id: "liveReview", label: "Live preview + save", detail: "Edits take effect on the keyboard at once. Nothing is permanent until you review and save; unplugging the keyboard puts back what was saved."}),
});
const EDIT_MODE_WORDS = editModeWords();

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
    phases: PHASE_WORDS,
    halves: HALVES_WORDS,
    editModes: EDIT_MODE_WORDS,
    hostOs: [[0, "Auto"], [1, "macOS"], [2, "Windows"], [3, "Linux"]],
    // The side a half reports itself as (GET 0x0D's physical half).
    physicalHalves: [[0, "left"], [1, "right"], [0xff, "side not set"]],
    macroPlayback: {setup: "setup", blocked: "blocked", unavailable: "unavailable"},
    macroProtection: [["auto", "Automatic"], ["on", "On"], ["off", "Off"]],
    // A host layout names its OS, since German on macOS and on Windows differ.
    hostLayouts: hostLayouts().map(/** @returns {[number, string]} */ layout => [layout.id, layout.os === "any" ? layout.name : `${layout.name} (${OS_WORDS[layout.os]})`]),
    // How a hold tier runs once its threshold passes, in that tier's words: a
    // hold style that names a threshold names the tier's own, the Tap / hold
    // threshold for Hold and the Long hold threshold for Long hold. A tap tier
    // only sends.
    holdStyles: {
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
    // A built-in hold that starts as the key goes down (MO, LM, pointing modes).
    holdFromPress: "held from the press",
    // The setting a timing default comes from, as a behaviour's timing
    // placeholders name it ("200 · dual-role").
    timingSources: {tappingTerm: "dual-role", tapHoldTerm: "behaviour default", longHoldTerm: "default", multiTapTerm: "default"},
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
        ["END_COLOR_WHERE_BASE_EFFECT_WOULD_SHOW", "End colour where the background effect would show"],
        ["END_COLOR_ON_ALL_KEYS", "End colour on all keys"],
    ],
    tapCommit: [["KEY_FEEDBACK_TAP_COMMIT_OFF", "Off"], ["KEY_FEEDBACK_TAP_COMMIT_NON_BASE_TAPS", "Double taps and more"]],
    feedbackOwners: [
        ["KEY_FEEDBACK_GROUP_ALL", "Every feedback state"],
        ["KEY_FEEDBACK_GROUP_TAP_BRANCH_PENDING", "Tap branch pending"],
        ["KEY_FEEDBACK_GROUP_TAP_COMMITTED", "Tap committed"],
        ["KEY_FEEDBACK_GROUP_HOLD_ACTIVE", "Hold active"],
        ["KEY_FEEDBACK_GROUP_LONG_HOLD_ACTIVE", "Long hold active"],
    ],
    // The four tables of LED group rows, by the target an LED row edit names.
    ledTables: [["layer", "Layer LED groups"], ["pdMode", "Pointing-mode LED groups"], ["combo", "Combo feedback LED groups"], ["keyBehavior", "Key feedback LED groups"]],
    // The lighting stages in the order the firmware paints them. A stage is
    // found by its id or bit, never by its words.
    stages: [
        {id: "base", label: "Background effect"},
        {id: "layers", label: "Layer colours", bit: RGB_STAGE_BITS.LAYER},
        {id: "auto", label: "Auto-mouse fade", bit: RGB_STAGE_BITS.AUTOMOUSE},
        {id: "pd", label: "Pointing modes", bit: RGB_STAGE_BITS.POINTING_MODE},
        {id: "combo", label: "Combo feedback", bit: RGB_STAGE_BITS.COMBO},
        {id: "key", label: "Key feedback", bit: RGB_STAGE_BITS.KEY_BEHAVIOR},
    ],

    // A custom key's shortcut (firmware D-F26): why a layer cannot be one it
    // turns on, said in the layer's row of the shortcut picker, and how it
    // turns its layers on (SHORTCUT_LAYER_KINDS), in the words its layer key
    // reads by ("Lock Navigation").
    customKeys: {alwaysOn: {base: "base layer, always on", default: "default layer, always on"},
        layerKinds: [[0, "Hold"], [1, "Lock"], [2, "Move to"], [3, "Tap-toggle"], [4, "One-shot"]]},
    pointing: {
        kinds: [[0, "Empty"], [1, "Directional keys / shortcuts"], [2, "Scrolling"]],
        axes: [[2, "Dominant axis"], [3, "Eight directions"], [0, "Vertical only"], [1, "Horizontal only"]],
        invert: [[0, "Neither axis"], [1, "Horizontal"], [2, "Vertical"], [3, "Both axes"]],
        // Which axes a scrolling mode scrolls.
        scrollAxes: [[0, "Both axes"], [1, "Horizontal only"], [2, "Vertical only"]],
        pointerLayer: [[0, "Keep the pointer layer active"], [1, "Return to the typing layer"]],
        // A slot's link (firmware D-F62): the layers that start its mode, the
        // layers its key turns on while it runs the mode, and what ends a mode
        // its layers started: a layer above the highest of them that is on, or
        // any layer outside both sets, neither the pointer layer nor a default
        // layer. The editor's two columns of switches, and Review's fields.
        // Each column title describes the layer in its row; "already starts"
        // names the other mode a layer starts. The Keys workbench's Pointing
        // modes tab heads a column for each part of the link (`startedBy`,
        // `endsWhen`, `keyTurnsOnShort`), marks a layer the keyboard ignores in
        // it (`ignored`), and tags a mode its link starts (`started`).
        linkLabels: {starts: "Starts this pointing mode", keyTurnsOn: "Turned on by this pointing mode's key", startsOther: "already starts",
            linkedLayers: "Layers that start this pointing mode", linkTurnsOn: "Layers turned on by this pointing mode's key", linkEnds: "Ends when another layer turns on",
            startedBy: "Started by", endsWhen: "Ends when", keyTurnsOnShort: "Its key turns on", ignored: "ignored", started: "started"},
        linkEnds: [[0, "Never"], [1, "A higher layer"], [2, "Any layer"]],
        // Why a layer cannot be in a link, said in its row.
        linkInert: {default: "default layer, always on", pointer: "pointer layer, follows the trackball"},
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

module.exports = {PHASE, PHASE_WORDS, HALVES_WORDS, LIVE_RESULT_WORDS, heldWords, EDIT_MODE_WORDS, editModeWords, quietWords, VOCABULARY, word, layerName, slotName, branchName, modifierNames};
