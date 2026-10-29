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
const {MACRO_LIMITS, macroProblemWords: wordedProblem} = require("../../rules/macro-payload.mjs");

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
    // Live preview + save (firmware D-F32): an edit reaching the keyboard's
    // working copy, Save writing it, Revert discarding it, the edit mode
    // changing.
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
    [PHASE.READ_BASE_RGB]: Object.freeze({label: "reading the background effect", read: "Checking the background effect", busy: "Checking the background effect", writes: false}),
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
    // Not a result Ark knows: said as one, never by its name.
    unknown: "the keyboard refused it for a reason Ark has no words for.",
});

// The steps of one Apply (core/session/apply-progress.js), as the person
// watching its Save sees them.
/** @type {Readonly<Record<import("../../contracts/model.js").ApplyStep, string>>} */
const SAVE_STEP_WORDS = Object.freeze({
    check: "Check the keyboard",
    backup: "Save a recovery copy",
    upload: "Send the profile",
    validate: "Keyboard checks the profile",
    slave: "Copy the profile to the slave half",
    commit: "Save it on the master half",
    converge: "Finish the slave half",
    verify: "Check both halves",
});

// Why an Apply stopped, in the words of the person who pressed Save
// (apply-progress.js failureReason): the keyboard's candidate error, the
// slave half's last answer to the split transfer (candidate status page 1)
// and why it kept answering busy, and what Ark saw itself. A keyboard error
// or answer not listed is said as one this Ark does not know.
const SAVE_FAILURE_WORDS = Object.freeze({
    /** @type {Readonly<Record<string, string>>} */
    keyboard: Object.freeze({
        CAPACITY_EXCEEDED: "The profile is larger than the keyboard can store.",
        INCOMPATIBLE_SCHEMA: "The keyboard's firmware does not accept this profile format.",
        UNSUPPORTED_DOMAIN: "The keyboard's firmware does not support part of this profile.",
        INCOMPATIBLE_ACTION_ABI: "The profile was made for different firmware.",
        CHECKSUM_MISMATCH: "The profile arrived damaged.",
        STORAGE_FAILURE: "The keyboard could not store the profile.",
        // Where it found the problem follows (PROFILE_AREAS).
        VALIDATION_REJECTED: "The keyboard rejected the profile",
        ACTIVATION_FAILED: "The keyboard saved the profile but could not start using it.",
        DURABILITY_UNKNOWN: "The keyboard could not confirm whether the profile was saved.",
        TIMEOUT: "The keyboard gave up waiting for this save.",
        PEER_SUPERSEDED: "The slave half already had a newer profile.",
        PEER_PREPARE_YIELDED: "The slave half was saving a profile of its own at the same time.",
        POSTCOMMIT_AUTHORITY_LOST: "The slave half reported a newer profile after the master half saved.",
        PEER_COMMIT_CONFLICT: "The two halves disagree about which profile is current.",
        PEER_TRANSFER_FAILED: "The slave half could not take the profile.",
    }),
    unknownKeyboard: "The keyboard stopped the save for a reason this version of Ark does not know.",
    /** @type {Readonly<Record<string, string>>} */
    slave: Object.freeze({
        BUSY: "The slave half kept answering that it was busy.",
        STALE: "The slave half already had a newer profile.",
        CONFLICT: "The slave half holds a conflicting profile.",
        CORRUPT: "The slave half's copy was damaged.",
        INCOMPATIBLE: "The slave half runs incompatible firmware.",
        STORAGE_ERROR: "The slave half could not store the profile, even after trying again.",
        VALIDATION_ERROR: "The slave half rejected the profile.",
        DIGEST_MISMATCH: "The copy on the slave half did not match what was sent.",
        RANGE_ERROR: "The copy to the slave half went out of order.",
        INVALID_FRAME: "The link between the halves garbled a message.",
    }),
    /** @type {Readonly<Record<string, string>>} */
    slaveBusy: Object.freeze({
        MAILBOX_FULL: "The slave half stopped handling requests from the master half.",
        OTHER_COPY: "The slave half was still holding an earlier, unfinished copy.",
        NO_LEASE: "The slave half dropped the copy partway and did not take it up again.",
        STORE_WORKING: "The slave half did not finish storing its copy.",
        PULLING: "The slave half was fetching a profile of its own.",
        CONVERGENCE_ONLY: "The slave half was finishing another save.",
    }),
    held: "A key stayed held, or a layer or pointing mode stayed locked, so the keyboard did not save. Nothing changed.",
    heldArkWait: "A key stayed held, or a layer or pointing mode stayed locked, so the keyboard waited to save until Ark stopped waiting for it.",
    linkSilent: "The link between the halves stopped answering.",
    stalled: "The keyboard stopped making progress, so Ark stopped waiting for it.",
    unexpected: "The keyboard answered in a way Ark did not expect.",
});

// What an edit says that would not fit (profile-draft-session.js propose):
// a count the keyboard caps, by the usage table's name for it (usageCounts),
// or the profile as a whole. Ark refuses it before the keyboard sees it, so
// nothing is lost and the person chooses what goes.
const PROFILE_FULL_WORDS = Object.freeze({
    /** @type {Readonly<Record<string, (most: number) => string>>} */
    counts: Object.freeze({
        lightingGroups: (most) => `The keyboard holds at most ${most} LED groups. Remove one before adding another.`,
        lightingGroupRows: (most) => `The keyboard holds at most ${most} LED overrides across layers, pointing modes, combo feedback and key feedback. Remove one before adding another.`,
        behaviours: (most) => `The keyboard holds at most ${most} behaviours. Remove one before adding another.`,
        behaviourSteps: (most) => `The keyboard holds at most ${most} behaviour tap counts, added up across all behaviours. Remove a tap count or a behaviour first.`,
    }),
    profile: "This change does not fit: the keyboard's profile is full. Remove an LED group, a behaviour, a combo or a macro first.",
});

// What an Apply or a Save cut short says (core/session/interruption.js):
// what can honestly be said about what an Apply saved (a save is all or
// nothing, never "part of it"), a Save cut short and what the next read
// shows, and why, when the connection went away.
/** @type {Readonly<Record<"none" | "decided" | "unknown", string>>} */
const APPLY_VERDICTS = Object.freeze({
    none: "Nothing was saved: the keyboard kept the profile it had.",
    decided: "The keyboard had already decided to save the new profile, and finishes it by itself about 15 seconds after both halves are connected. Read the keyboard then.",
    unknown: "Ark can't tell which profile was saved. Read the keyboard to see what it runs now.",
});

const SAVE_WORDS = Object.freeze({
    cutShort: "Ark can't tell whether the save finished.",
    /** @param {string | undefined} recovery where the edits were kept */
    later: (recovery) => `${recovery ? `A recovery copy on Backups has your edits (${recovery}). ` : ""}Ark says whether they were saved once it reads the keyboard again.`,
    saved: "The save finished: the keyboard saved your edits.",
    unsaved: "The save did not finish: the keyboard still runs your edits, unsaved. Save them again.",
    /** @param {string | undefined} recovery where the edits were kept */
    gone: (recovery) => `The save did not finish, so the keyboard's unsaved edits are gone: it runs its saved profile again.${recovery ? ` The recovery copy on Backups has them (${recovery}).` : ""}`,
});

const INTERRUPTION_REASONS = Object.freeze({
    lost: "The keyboard was disconnected or restarted.",
    unanswered: "The keyboard stopped answering.",
});

// Words as a sentence lists them: "a", "a and b", "a, b and c".
/** @param {readonly string[]} words */
const listed = (words) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);

// Ark's own live edit or Revert, held by the keyboard until no key is held
// (edit status flag 8), in words the person can act on: what edit status
// page 2 says holds it, where it names something a person lets go of
// (profile-wire-v1/live-edits.md: bit 0 a key is pressed, 4 a lock, 6 a
// modifier or one-shot, 7 a one-shot layer); other reasons are said as held
// keys alone. `refusal` answers another edit asked for meanwhile.
const SAFE_BOUNDARY_WORDS = Object.freeze(/** @type {const} */ ([[1 << 0, "a key"], [1 << 4, "a locked layer or pointing mode"], [1 << 6, "a modifier or one-shot"], [1 << 7, "a one-shot layer"]]));
/** @param {{kind: "edit" | "revert", reasons: number, cancelling: boolean}} waiting @returns {{title: string, detail: string, refusal: string}} */
function heldWords({kind, reasons, cancelling}) {
    const held = SAFE_BOUNDARY_WORDS.filter(([bit]) => reasons & bit).map(([, words]) => words);
    const list = listed(held);
    const now = list ? `Held now: ${list}. ` : "";
    if (kind === "revert") return {title: "Let go of the held keys to finish reverting", detail: `${now}The keyboard puts back its saved profile the moment nothing is held; Ark waits for it.`,
        refusal: "Let go of the held keys first: the keyboard is still reverting."};
    return {title: cancelling ? "Cancelling the edit" : "Let go of the held keys to finish the edit",
        detail: cancelling ? "The keyboard drops the edit and keeps running what it ran before." : `${now}The keyboard takes the edit the moment nothing is held; Ark waits for it.`,
        refusal: "Let go of the held keys first: the keyboard is still taking the last edit."};
}

// How long a keyboard in Live edit waits, with no edit and no key held, before
// it saves by itself, in words: the quiet interval it reports, or 3 seconds
// until it has reported one (firmware D-F32).
const QUIET_FALLBACK_MS = 3000;
/** @param {number | null | undefined} [quietMs] */
function quietWords(quietMs) {
    const seconds = Math.round((quietMs || QUIET_FALLBACK_MS) / 1000);
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

// How edits reach a keyboard (stored on it, firmware D-F32), all three
// offered: what each does and what a replug does to edits not saved yet, and
// a hint short enough for one line of the rail's menu. The keyboard's Apply
// and Save are both Save to a person (D-L72). Live edit's words carry the
// keyboard's quiet interval.
/** @param {number | null | undefined} [quietMs] @returns {import('../../contracts/model.js').Vocabulary['editModes']} */
const editModeWords = (quietMs) => Object.freeze({
    0: Object.freeze({id: "apply", label: "Review and save", hint: "Waits in Ark until you review it", detail: "Edits stay in Ark's draft until you review and save them. The keyboard runs its saved profile until then."}),
    1: Object.freeze({id: "live", label: "Live edit", hint: "Runs at once and saves itself", detail: `Edits take effect on the keyboard at once. With or without Ark, the keyboard starts saving after ${quietWords(quietMs)} with no edit and no key held; holding a key postpones it. Unplugging loses every edit since the last successful save. A failed automatic save leaves those edits unsaved.`}),
    2: Object.freeze({id: "liveReview", label: "Live preview + save", hint: "Runs at once, save to keep", detail: "Edits take effect on the keyboard at once. Nothing is permanent until you review and save; unplugging the keyboard puts back what was saved."}),
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
        detail: "The master half can't see the slave half. Check the cable between the halves, then read the keyboard again. Until then Ark can't read or save the whole profile."}),
    apart: Object.freeze({label: "Halves differ",
        detail: "The master and slave halves hold different saved settings, or the slave half is still copying them. Wait a moment and read the keyboard again; if it stays like this, reconnect the cable between the halves."}),
    unread: Object.freeze({label: "Not read yet",
        detail: "Ark hasn't read this keyboard yet."}),
});

// What the bar says while the keyboard is read back after a Save, by the read
// step (`model.postApplyRead.step`).
/** @type {Readonly<Record<import('../../contracts/messages.js').ReadStep, string>>} */
const READ_STEP_WORDS = Object.freeze({
    layout: "Reading keys and layers",
    profile: "Reading saved lighting, behaviours and settings",
    combos: "Checking active combos",
    baseRgb: "Checking the background effect",
});

/** @type {Readonly<Record<string, string>>} */
const OS_WORDS = {macos: "macOS", windows: "Windows", linux: "Linux"};

// Each settings section's heading, by its id in settings-editor.js, which
// draws it; a note says where a section is in these words too.
const SETTINGS_SECTIONS = Object.freeze({
    keyTiming: "Tap & hold timing", normalPointerSpeed: "Pointer speed", sniping: "Auto-sniping", autoMouse: "Auto-mouse",
    automouseFade: "Auto-mouse fade", lightingPower: "All lighting", rgbAppearance: "Background effect", lightingFeedback: "Key feedback flash",
    startupLayers: "Default layers", behaviorSettings: "Behaviours", comboSettings: "Combos", comboReferences: "Combo layer matching",
    keyboardOptions: "Key swaps & typing", host: "Your computer",
});

// A Settings screen as anything but the rail names it. The rail lists
// "Pointer" under Settings; a link, a tip or a fix that sends a person
// there has no rail around it, so it says "Pointer settings".
const SETTINGS_SCREENS = Object.freeze({behaviours: "Behaviour settings", combos: "Combo settings", pointer: "Pointer settings", host: "Host settings"});

// Where a person finds a settings section, as a note core writes names it:
// the Settings screen as it is named outside the rail, then the section's
// heading ("Host settings → Your computer"), as the interface's sectionPath
// (webview/view/settings-layout.mjs) says it.
/** @param {keyof typeof SETTINGS_SCREENS} screen @param {keyof typeof SETTINGS_SECTIONS} section */
const settingsPath = (screen, section) => `${SETTINGS_SCREENS[screen]} → ${SETTINGS_SECTIONS[section]}`;

// A behaviour's thresholds: as its hover card lists the ones it runs on ("tap
// / hold 200 ms"), and as a field or a note names one ("tap / hold
// threshold"); the multi tap window is a window, not a threshold.
/** @type {Readonly<Record<import("../../contracts/edits.js").TimingTerm, string>>} */
const THRESHOLDS = Object.freeze({tapHoldTerm: "tap / hold", longHoldTerm: "long hold", multiTapTerm: "multi tap window"});

// A word from one of the ordered lists, by the key the keyboard uses; an
// unknown key reads as itself rather than disappearing.
/** @param {import("../../contracts/model.js").WordList<unknown>} list @param {unknown} key @returns {string} */
const word = (list, key) => (list.find(([id]) => id === key)?.[1] ?? String(key ?? ""));

// How a macro plays: whether it is uninterruptible, chosen or automatic.
/** @type {import("../../contracts/model.js").WordList<"auto" | "on" | "off">} */
const MACRO_PROTECTION = [["auto", "Automatic"], ["on", "On"], ["off", "Off"]];

/** @type {Readonly<import("../../contracts/model.js").Vocabulary>} */
const VOCABULARY = Object.freeze(/** @satisfies {import("../../contracts/model.js").Vocabulary} */ ({
    phases: PHASE_WORDS,
    readSteps: READ_STEP_WORDS,
    halves: HALVES_WORDS,
    // Why nothing can be edited on a keyboard whose firmware Ark does not
    // support (D-L64), where the control is: the words a refused read says.
    firmwareUpdate: "This keyboard's firmware is not current, and Ark supports only current firmware. Update both halves, then read the keyboard again.",
    editModes: EDIT_MODE_WORDS,
    hostOs: [[0, "Auto"], [1, "macOS"], [2, "Windows"], [3, "Linux"]],
    // The side a half reports itself as (GET 0x0D's physical half).
    physicalHalves: [[0, "left"], [1, "right"], [0xff, "side not set"]],
    macroPlayback: {setup: "setup", blocked: "blocked", unavailable: "unavailable"},
    macroProtection: MACRO_PROTECTION,
    // The setting macroProtection chooses (firmware glossary "Uninterruptible
    // playback"), as its field and Review name it, and Automatic as it says
    // whether it plays the macro uninterruptibly now ("Automatic · on").
    macroUninterruptible: {label: "Uninterruptible playback",
        automatic: {on: `${word(MACRO_PROTECTION, "auto")} · on`, off: `${word(MACRO_PROTECTION, "auto")} · off`}},
    // Why a macro does not read, by the macro grammar's reason
    // (rules/macro-payload.mjs), as the step editor and core's refusals both
    // say it; a key the reason names leads the words of unknown and notHeld
    // (macroProblemWords).
    macroProblems: {
        unexpectedClose: "Unexpected } — use }} for a literal closing brace.",
        unprintable: "Use valid Unicode text, tabs or newlines; control characters and unpaired surrogates are unsupported.",
        missingClose: "A macro command is missing its }.",
        delay: `A macro delay must be between 0 and ${MACRO_LIMITS.maxDelayMs.toLocaleString("en-US")} milliseconds.`,
        empty: "An empty {} is not a macro command.",
        noKeys: "A macro command needs at least one key.",
        pressOne: "A press or release names one key; use a tap for a chord.",
        chord: `A chord is up to ${MACRO_LIMITS.maxHeldKeys} distinct keys.`,
        unknown: "is not a key a macro can send.",
        notHeld: "is released but was never pressed.",
        heldAgain: "A macro presses a key that is already held.",
        tooManyHeld: `A macro holds at most ${MACRO_LIMITS.maxHeldKeys} keys at once.`,
        textHold: "Release ordinary keys before text your keyboard layout cannot type, which needs Unicode entry; modifier holds are supported.",
        stillHeld: "Release every held key before the macro ends.",
    },
    // Each kind of macro step by its one name (glossary "Macro step"): the
    // add buttons, the step editor and the picker it opens all say it so.
    macroSteps: [["text", "Text"], ["tap", "Key or chord"], ["delay", "Delay"], ["press", "Press"], ["release", "Release"]],
    // The same names, short, as the word under a step's tile, the editor's
    // legend beside its mark and a screen reader before a chip say them; a
    // key or chord step says which of the two it is.
    macroStepTiles: {text: "text", key: "key", chord: "chord", delay: "delay", press: "press", release: "release"},
    // A host layout names its OS, since German on macOS and on Windows differ.
    hostLayouts: hostLayouts().map(/** @returns {[number, string]} */ layout => [layout.id, layout.os === "any" ? layout.name : `${layout.name} (${OS_WORDS[layout.os]})`]),
    // How macro text types what its layout cannot, by the Unicode mode it
    // plays with (the host OS it types for), as the macro editor says it.
    unicodeEntry: [
        [1, "Other characters use Unicode entry: keep Unicode Hex Input active in macOS input sources while macros play. Option shortcuts can behave differently in this input source."],
        [2, "Other characters use Unicode entry: install and run WinCompose on Windows with Right Alt as its Compose key."],
        [3, "Other characters use Unicode entry: use an input method or application that accepts Ctrl+Shift+U, hexadecimal digits and Space, such as IBus. This sequence does not work in every Linux application."],
    ],
    // What Unicode entry needs while it is off, by host OS; any other host
    // needs it turned on and the OS known (0).
    unicodeEntryOff: [
        [0, "Characters it cannot type, such as emoji, need Unicode playback on and a known host OS."],
        [1, "Characters it cannot type, such as emoji, need the Unicode Hex Input layout."],
    ],
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
    thresholds: THRESHOLDS,
    thresholdNames: {tapHoldTerm: `${THRESHOLDS.tapHoldTerm} threshold`, longHoldTerm: `${THRESHOLDS.longHoldTerm} threshold`, multiTapTerm: THRESHOLDS.multiTapTerm},
    // What each threshold means, said where a behaviour sets its own.
    thresholdTips: {
        tapHoldTerm: "How long a press must last to count as a hold rather than a tap.",
        longHoldTerm: "How long a press must last to count as a long hold.",
        multiTapTerm: "The time allowed from releasing the key to pressing it again for another tap. A Double tap Hold is press, release, then press and keep holding.",
    },
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
    // What the colour editor says about HSV(0, 0, 0) in each stage: the tip on
    // Turn off and the note shown once it is stored. Outside a layer colour
    // and a group row black is literal black (firmware RGB domain spec,
    // "Black"), so there only the Stage on switch paints nothing. The
    // background effect offers no Turn off.
    colourOff: {
        layers: {
            offTip: "Store HSV(0, 0, 0): this layer then paints nothing, and what is beneath shows through.",
            offNote: "No colour is stored for this layer, so the background effect shows through wherever it would paint.",
        },
        groups: {
            offTip: "Store HSV(0, 0, 0): this row then takes its stage's colour.",
            offNote: "A row stored as HSV(0, 0, 0) inherits its stage colour instead of painting its own.",
        },
        auto: {
            offTip: "Store HSV(0, 0, 0): the fade then ends on black.",
        },
        pd: {
            offTip: "Store HSV(0, 0, 0): this mode then paints its locality black while it runs. To paint nothing, switch Stage on off.",
            offNote: "The colour is black, so this mode paints its locality black while it runs. To paint nothing, switch Stage on off; that turns off every pointing mode's colour.",
        },
        combo: {
            offTip: "Store HSV(0, 0, 0): combo feedback then paints its locality black while a combo's inputs are held. To paint nothing, switch Stage on off.",
            offNote: "The colour is black, so combo feedback paints its locality black while a combo's inputs are held. To paint nothing, switch Stage on off.",
        },
        key: {
            offTip: "Store HSV(0, 0, 0): this state then flashes black. To flash nothing, switch Stage on off.",
            offNote: "The colour is black, so the keyboard flashes black for this state. To flash nothing, switch Stage on off; that turns off every feedback colour.",
        },
    },
    feedbackOwners: [
        ["KEY_FEEDBACK_GROUP_ALL", "Every feedback state"],
        ["KEY_FEEDBACK_GROUP_TAP_BRANCH_PENDING", "Tap branch pending"],
        ["KEY_FEEDBACK_GROUP_TAP_COMMITTED", "Tap committed"],
        ["KEY_FEEDBACK_GROUP_HOLD_ACTIVE", "Hold active"],
        ["KEY_FEEDBACK_GROUP_LONG_HOLD_ACTIVE", "Long hold active"],
    ],
    // The behaviour tier each key feedback state flashes for, which marks its
    // rows with that tier's dot, as the review does; the other states have
    // none.
    feedbackTiers: {KEY_FEEDBACK_GROUP_TAP_COMMITTED: "tap", KEY_FEEDBACK_GROUP_HOLD_ACTIVE: "hold", KEY_FEEDBACK_GROUP_LONG_HOLD_ACTIVE: "long"},
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
    // The line across a key cap marks a dual-role key: what it taps above,
    // what it holds below. A dual-role layer key's cap (OSL(), TT()) names its
    // layer above and, below, what it does to it, by its QMK function. Any
    // other layer key reads by its whole name on one line (LAYER_KEY_VERBS:
    // "Hold Navigation", "Lock Navigation"), as layerKinds above do.
    keyCapLayerVerbs: {OSL: "one-shot", TT: "tap-toggle"},
    // What a layer key does to its layer, in the words its name reads by
    // ("Lock Navigation"), as the picker says them: core names keys with them
    // (key-names.js), and a branch or combo action that acts on a layer is
    // tagged with them. TG is a lock on this firmware (firmware D-F46).
    layerKeyVerbs: {MO: "Hold", TG: "Lock", LOCK_LAYER: "Lock", TT: "Tap-toggle", OSL: "One-shot", TO: "Move to", DF: "Default", PDF: "Default"},
    // Review's checks: each level's word, and where a check that is not new
    // in the draft comes from.
    checkLevels: {blocker: "Blocker", trap: "Trap", warning: "Warning", notice: "Notice"},
    checkStatuses: {new: "new", existing: "on the keyboard", fixed: "fixed"},
    // What made a recovery copy, as its title says it. Both keyboard saves
    // read as Save (D-L72), so a title tells them apart by what was saved: a
    // whole draft (the keyboard's Apply) or the live modes' unsaved edits.
    recoveryCauses: {apply: "Before saving a draft", restore: "Before saving a backup", save: "Before saving live edits", restart: "Before Restart", "leave-live": "Before leaving Live edit"},
    settingsSections: SETTINGS_SECTIONS,
    // A backup's settings sections, as Import's summary counts the
    // file's differences: by their headings, but for three. The summary
    // already names behaviour and combo rows "Behaviours" and "Combos", so
    // their sections say "settings"; Key feedback flash is counted with the
    // Key feedback lighting stage, so it takes the stage's name.
    fileSections: {
        keyTiming: SETTINGS_SECTIONS.keyTiming, startupLayers: SETTINGS_SECTIONS.startupLayers, behaviorSettings: "Behaviour settings", comboSettings: "Combo settings",
        comboReferences: SETTINGS_SECTIONS.comboReferences, keyboardOptions: SETTINGS_SECTIONS.keyboardOptions, lightingPower: SETTINGS_SECTIONS.lightingPower, rgbAppearance: SETTINGS_SECTIONS.rgbAppearance,
        lightingFeedback: "Key feedback", normalPointerSpeed: SETTINGS_SECTIONS.normalPointerSpeed, sniping: SETTINGS_SECTIONS.sniping, autoMouse: SETTINGS_SECTIONS.autoMouse,
    },
    // Why a behaviour, or a key toward a combo, does not take part
    // (participation.js), in the words of the switch that says no, and of the
    // screen it is on; a layer's or a key's name follows the words of layer,
    // layers and placement.
    participationReasons: {
        behavior: {master: `behaviours are off in ${SETTINGS_SCREENS.behaviours}`, layer: `${SETTINGS_SCREENS.behaviours} has behaviours off on`, definition: "Use this behaviour is off",
            layers: "Layers it runs on leaves out", placement: "Use behaviour is off for"},
        combo: {master: `combos are off in ${SETTINGS_SCREENS.combos}`, layer: `${SETTINGS_SCREENS.combos} has combos off on`, definition: "Use this combo is off",
            layers: "Layers it runs on leaves out", placement: "Join combos is off for"},
    },
    settingsScreens: SETTINGS_SCREENS,
    // Where a switch says no, by the place it switches: one key on one layer
    // (a placement, firmware's participation policy), or a layer. The layer's
    // name follows in brackets; a key read through from another layer is
    // "this key on" that layer.
    participationPlaces: {key: "this key on this layer", layer: "this layer", keyOn: "this key on"},
    // What a profile holds that the keyboard counts against a limit
    // (profile-usage.js), as the keyboard's usage table names each.
    usageCounts: {
        behaviours: {label: "Behaviours", what: "Keys with a behaviour."},
        behaviourSteps: {label: "Behaviour tap counts", what: "Each behaviour's tap counts, up to the deepest one it sets, added up across all behaviours."},
        combos: {label: "Combos", what: "Combos on any layer."},
        lightingGroups: {label: "LED groups", what: "Named LED groups on Lighting."},
        lightingGroupRows: {label: "LED overrides", what: "LED override rows on layers, pointing modes, combo feedback and key feedback."},
        macros: {label: "Macros", what: "Macro slots with steps."},
        customKeys: {label: "Custom keys", what: "Custom keys with a name, a shortcut or a behaviour."},
        pointingModes: {label: "Pointing modes", what: "Slots that hold a pointing mode."},
    },
    pointing: {
        kinds: [[0, "Empty"], [1, "Directional keys / shortcuts"], [2, "Scrolling"]],
        // A directional mode's shortcuts, by where the record keeps each: the
        // straight directions, and the diagonals eight directions add.
        directions: [["left", "Left"], ["right", "Right"], ["up", "Up"], ["down", "Down"]],
        diagonals: [["upLeft", "Up-left"], ["upRight", "Up-right"], ["downLeft", "Down-left"], ["downRight", "Down-right"]],
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
        // What a direction's threshold measures, by how often the mode sends:
        // the field after its axis ("Horizontal movement per tap").
        directionStep: [[0, "movement per tap"], [1, "movement before it sends"]],
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

// The names a person reads for a layer and a pointing slot that have none of
// their own. Layer 0 is the base layer.
/** @param {readonly string[] | null | undefined} names @param {number} index */
const layerName = (names, index) => names?.[index] || (index ? `Layer ${index}` : "Base");
// A macro slot's name when it has none of its own.
/** @param {number} index */
const macroDefaultName = (index) => `Macro ${index}`;
/** @param {{id: number, kind: number, name: string} | null | undefined} slot @param {number} [id] */
const slotName = (slot, id = slot?.id) => (slot?.kind && slot.name) || `Slot ${id}`;
/** @param {number} count */
const branchName = (count) => VOCABULARY.branches[count - 1] || `${count} taps`;
// Why a macro does not read, in words (rules/macro-payload.mjs).
/** @param {{code: string, key?: string}} problem */
const macroProblemWords = (problem) => wordedProblem(problem, VOCABULARY.macroProblems);
// What a layer key does to its layer, in words (VOCABULARY.layerKeyVerbs).
/** @type {Readonly<Record<string, string>>} */
const LAYER_KEY_VERBS = VOCABULARY.layerKeyVerbs;

// A refusal from the macro grammar (core/schema/macro-payload.js), in words:
// the schema names the grammar's reason (`problem`), and every reader of a
// macro words it here. Any other refusal already says itself.
/** @param {unknown} error @returns {unknown} */
const wordedMacroError = (error) => error instanceof Error && "problem" in error
    ? Object.assign(new Error(macroProblemWords(/** @type {{code: string, key?: string}} */ (error.problem))), {code: /** @type {{code?: unknown}} */ (error).code, problem: error.problem})
    : error;
// A macro's Uninterruptible playback setting in words: Automatic says
// whether it plays uninterruptibly now ("Automatic · on").
/** @param {"auto" | "on" | "off"} protection @param {boolean} uninterruptible */
const protectionWords = (protection, uninterruptible) => (protection === "auto"
    ? VOCABULARY.macroUninterruptible.automatic[uninterruptible ? "on" : "off"] : word(VOCABULARY.macroProtection, protection));
/** @param {number} mask */
const modifierNames = (mask) => VOCABULARY.modifiers.filter(([bit]) => mask & bit).map(([, name]) => name);

// Each part of the profile as the area Review groups its changes under, by
// the area core/schema/profile-domains.js gives it: where a refusal says the
// keyboard found a problem.
/** @type {Readonly<Record<import("../schema/profile-domains.js").ProfileDomain["area"], string>>} */
const PROFILE_AREAS = Object.freeze({lighting: "Lighting", behaviours: "Behaviours", combos: "Combos", settings: "Settings", pointing: "Pointing modes", keys: "Keys", macros: "Macros"});

// What a failure says to a person (interface contracts: no code or developer
// word reaches one). Ark's own failures are sentences written for a person: a
// plain Error, or one carrying Ark's code (SERVICE_BUSY, TIMEOUT). The
// language's errors (a TypeError, a RangeError) and the browser's are a fault
// in Ark or beneath it, whose text is for the diagnostics; they read as
// `unexpected`. So is an answer from the keyboard that did not read, which
// its protocol marks `fault: "answer"` (schema/bytes.js protocolError), as
// does a read of the profile's bytes (schema/bytes.js answerFault): it
// reads as `unreadable`, or as `incompatible` when the answer is in a form
// this Ark does not support. The device service passes a failure on with its
// name for a code when it had none, and its fault (operation-failure.js
// publicError): "Error" for Ark's plain sentence, "TypeError" for a fault.
const FAILURE_WORDS = Object.freeze({
    unexpected: "Ark ran into a problem of its own. Try again, and reload the page if it keeps happening.",
    unreadable: "The keyboard answered with something Ark could not read. Read the keyboard again; if it keeps happening, the Keyboard screen's Diagnostics say what it sent.",
    incompatible: "The keyboard's firmware answers in a form this Ark does not read. Update both halves to current firmware.",
});
// The codes of an answer in a form this Ark does not support.
const INCOMPATIBLE_ANSWERS = new Set(["INCOMPATIBLE_RESPONSE", "COMBO_INCOMPATIBLE"]);
const ARK_CODE = /^(?!ERR_)[A-Z][A-Z0-9_]*$/;
const LANGUAGE_ERRORS = new Set(["TypeError", "RangeError", "SyntaxError", "ReferenceError", "EvalError", "URIError", "AggregateError"]);
/** @param {unknown} error */
const detailsOf = (error) => /** @type {{name?: unknown, code?: unknown, message?: unknown, fault?: unknown}} */ (error && typeof error === "object" ? error : {});
// Whether a failure's own message is one Ark wrote for a person.
/** @param {unknown} error */
function sayable(error) {
    const {name, code, message, fault} = detailsOf(error);
    if (typeof message !== "string" || !message || fault !== undefined) return false;
    if (typeof code === "string") return (ARK_CODE.test(code) || code === "Error") && !LANGUAGE_ERRORS.has(String(name));
    return name === undefined || name === "Error";
}
// The code a sentence Ark wraps a failure in may carry over from it: Ark's
// own, else `fallback`. A fault's name (TypeError, as the device service
// records one) or a platform's ERR_ code would make the whole sentence read
// as a fault's.
/** @param {unknown} error @param {string} fallback */
function arkCode(error, fallback) {
    const {code} = detailsOf(error);
    return typeof code === "string" && ARK_CODE.test(code) ? code : fallback;
}
/** @param {unknown} error @returns {string} */
function failureSentence(error) {
    if (sayable(error)) return /** @type {{message: string}} */ (error).message;
    const {code, fault} = detailsOf(error);
    if (fault !== "answer") return FAILURE_WORDS.unexpected;
    return INCOMPATIBLE_ANSWERS.has(String(code)) ? FAILURE_WORDS.incompatible : FAILURE_WORDS.unreadable;
}

module.exports = {PHASE, listed, PHASE_WORDS, HALVES_WORDS, LIVE_RESULT_WORDS, SAVE_STEP_WORDS, SAVE_FAILURE_WORDS, APPLY_VERDICTS, SAVE_WORDS, INTERRUPTION_REASONS, PROFILE_FULL_WORDS, heldWords, EDIT_MODE_WORDS, editModeWords, quietWords, VOCABULARY, word, layerName, macroDefaultName, slotName, branchName, LAYER_KEY_VERBS, wordedMacroError, protectionWords, settingsPath, modifierNames, PROFILE_AREAS, FAILURE_WORDS, sayable, arkCode, failureSentence};
