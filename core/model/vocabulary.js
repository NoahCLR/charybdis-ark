// @ts-check
"use strict";

// The words this app uses for keyboard values and operations, in one place.
//
// The model names enum values the way the keyboard does (`RGB_LEFT_HALF`,
// `REPEAT_WHILE_HELD`); these are the words a person reads for them. The
// review builds its rows from here, and the same table travels to the
// interface as `model.vocabulary`, so an editor, its dropdown and the review
// never name one thing two ways. Lists are ordered as the editors offer them.

const {RGB_EVERY_OWNER, RGB_STAGE_BITS} = require("../schema/rgb-domain-v1");
const {FIRMWARE_UPDATE} = require("../schema/profile-blob-v1");
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
// the profile as a whole, or a name: every name fits the settings domain, but
// the whole profile shares one ceiling, so a long name can meet it once
// behaviours, combos and other names have used the room. Ark refuses it before the keyboard sees it, so
// nothing is lost and the person chooses what goes.
const PROFILE_FULL_WORDS = Object.freeze({
    /** @type {Readonly<Record<string, (most: number) => string>>} */
    counts: Object.freeze({
        lightingGroups: (most) => `The keyboard holds at most ${most} different LED sets across all accents. Remove an accent, or light LEDs another accent already lights.`,
        lightingGroupRows: (most) => `The keyboard holds at most ${most} accents across layers, pointing modes, combo feedback, behaviour feedback and replacement feedback. Remove one before adding another.`,
        lightingTableGroupRows: (most) => `The keyboard holds at most ${most} accents on any one of layers, pointing modes, combo feedback, behaviour feedback and replacement feedback. Remove one there before adding another.`,
        behaviours: (most) => `The keyboard holds at most ${most} behaviours. Remove one before adding another.`,
        behaviourSteps: (most) => `The keyboard holds at most ${most} behaviour tap counts, added up across all behaviours. Remove a tap count or a behaviour first.`,
        autocorrectCorrections: (most) => `The keyboard holds at most ${most.toLocaleString("en-US")} text replacements. Delete one before adding another.`,
        autocorrectTypos: (most) => `The keyboard holds at most ${most.toLocaleString("en-US")} inputs across all text replacements. Remove one before adding another.`,
        autocorrectText: (most) => `The text replacement list holds at most ${most.toLocaleString("en-US")} bytes of text across its replacements and their inputs. Delete a replacement first.`,
    }),
    profile: "This change does not fit: the keyboard's profile is full. Remove an accent, a behaviour, a combo or a macro first.",
    name: "The keyboard's profile is full, so this name does not fit. Shorten another name, or remove a behaviour or combo.",
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

// Why the open draft takes no edit (D-L60), for each reason core publishes
// (`draft.reason`, `load.held`): the sentence a control says where it is,
// and the title and detail a screen shows in place of the editor. A live
// draft is what the keyboard runs, so its detail (`liveDetail`, where it
// differs) reads it again rather than reviews it. A disconnected keyboard
// says the shell's words, and a busy draft nothing (the commit bar says it).
const REVIEW_AGAIN = "Review the draft against the current keyboard before editing further.";
const DRAFT_BLOCK_NEXT = Object.freeze({
    detail: "Your changes are kept. Choose Review against the keyboard in the bar to compare them with what it runs now, or discard the draft.",
    liveDetail: "Choose Read keyboard in the bar: the draft is what the keyboard runs, so Ark reads it again before the next edit.",
});
/** @type {import('../../contracts/model.js').Vocabulary["draftBlocks"]} */
const DRAFT_BLOCK_WORDS = Object.freeze({
    unsupported: Object.freeze({sentence: FIRMWARE_UPDATE, title: "Update the keyboard's firmware", detail: FIRMWARE_UPDATE}),
    "no-draft": Object.freeze({sentence: "The keyboard's complete profile could not be read, so edits cannot be drafted here. Read the keyboard again.",
        title: "Keyboard not ready for edits", detail: "A complete profile could not be read. Read the keyboard again to retry."}),
    "other-keyboard": Object.freeze({sentence: "The local draft belongs to another keyboard. Select it again or discard the draft here.",
        title: "Draft belongs to another keyboard", detail: "Its changes are kept for that keyboard. Select it to continue editing, or discard the draft in the bar to edit this one."}),
    stale: Object.freeze({sentence: REVIEW_AGAIN, title: "The keyboard changed since this draft began", ...DRAFT_BLOCK_NEXT}),
    "connection-changed": Object.freeze({sentence: REVIEW_AGAIN, title: "Keyboard connection changed", ...DRAFT_BLOCK_NEXT}),
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
    automouseFade: "Auto-mouse fade", lightingPower: "All lighting", rgbAppearance: "Background effect", lightingFeedback: "Behaviour feedback flash", replacementFeedback: "Replacement feedback flash",
    startupLayers: "Default layers", behaviorSettings: "Where behaviours run", comboSettings: "How combos run", comboReferences: "Combo layer matching",
    keyboardOptions: "Key swaps & typing", host: "Your computer", autocorrect: "Text replacement",
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

// QMK's switch keys for autocorrect, which is text replacement here
// (GLOSSARY.md): each key's words, as the switch keys for combos, behaviours
// and auto-mouse are worded (Combo On, Combo Off, Toggle Combo). QMK's own
// words stay among a key's search terms, so either name finds it.
const TEXT_REPLACEMENT_KEYS = Object.freeze({QK_AUTOCORRECT_ON: "Text replacement On", QK_AUTOCORRECT_OFF: "Text replacement Off", QK_AUTOCORRECT_TOGGLE: "Toggle Text replacement"});
// How a macro plays: whether it is uninterruptible, chosen or automatic.
/** @type {import("../../contracts/model.js").WordList<"auto" | "on" | "off">} */
const MACRO_PROTECTION = [["auto", "Automatic"], ["on", "On"], ["off", "Off"]];

// A branch by how many taps start it, as the behaviour grid heads its rows;
// Behaviour feedback names each tap branch's case by the same words.
const BRANCHES = Object.freeze(["Single tap", "Double tap", "Triple tap", "Quadruple tap", "Quintuple tap"]);

/** @type {Readonly<import("../../contracts/model.js").Vocabulary>} */
const VOCABULARY = Object.freeze(/** @satisfies {import("../../contracts/model.js").Vocabulary} */ ({
    phases: PHASE_WORDS,
    readSteps: READ_STEP_WORDS,
    halves: HALVES_WORDS,
    // Why nothing can be edited on a keyboard whose firmware Ark does not
    // support (D-L64), where the control is: the words a refused read says.
    firmwareUpdate: FIRMWARE_UPDATE,
    draftBlocks: DRAFT_BLOCK_WORDS,
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
    // What a text replacement is (schema/autocorrect-domain-v1.js
    // AUTOCORRECT_KIND), as its editor's choice and its tag say it.
    replacementKinds: [["text", "Text"], ["macro", "Macro"]],
    // How a replacement fires (D-L91): as you type, after the Leader key, or
    // both; its inputs are one list whichever. The switch on its editor.
    inputModes: [["word", "As you type"], ["leader", "After Leader"], ["both", "Both"]],
    // The Leader key as its cap names it: before Try it's After Leader field
    // and where a replacement's editor says the key is placed.
    leaderKey: "Leader",
    // The formats a text replacement list is saved in (autocorrect-import.js
    // AUTOCORRECT_FILE_FORMATS), as Export's menu names each.
    listFileFormats: [["txt", "Text (QMK)"], ["csv", "CSV"], ["json", "JSON"]],
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
    // placeholders name it ("200 · dual-role"). Every other default is
    // Behaviour settings' own, so it is only "default": a placeholder fits
    // its field at every width with its unit beside it.
    timingSources: {tappingTerm: "dual-role", tapHoldTerm: "default", longHoldTerm: "default", multiTapTerm: "default"},
    thresholds: THRESHOLDS,
    thresholdNames: {tapHoldTerm: `${THRESHOLDS.tapHoldTerm} threshold`, longHoldTerm: `${THRESHOLDS.longHoldTerm} threshold`, multiTapTerm: THRESHOLDS.multiTapTerm},
    // What each threshold means, said where a behaviour sets its own.
    thresholdTips: {
        tapHoldTerm: "How long a press must last to count as a hold rather than a tap.",
        longHoldTerm: "How long a press must last to count as a long hold.",
        multiTapTerm: "The time allowed from releasing the key to pressing it again for another tap. A Double tap Hold is press, release, then press and keep holding.",
    },
    tiers: {tap: "Tap", hold: "Hold", long: "Long hold"},
    // What lands a press in each tier, said on the grid's headings.
    tierTips: {tap: "Let go before the Tap / hold threshold.", hold: "Held past the Tap / hold threshold.", long: "Held past the Long hold threshold."},
    // A behaviour's branch by how many taps start it.
    branches: BRANCHES,

    localities: [
        ["RGB_BOTH_HALVES", "All LEDs"], ["RGB_LEFT_HALF", "Left half"], ["RGB_RIGHT_HALF", "Right half"],
        ["RGB_KEY_HALF", "The half holding the trigger key"], ["RGB_KEYS_ONLY", "Only the trigger key"],
    ],
    // The same places in a word or two, for a list's cell, so a row stays one
    // line; the Locality field names them whole.
    localitiesBrief: [
        ["RGB_BOTH_HALVES", "all LEDs"], ["RGB_LEFT_HALF", "left half"], ["RGB_RIGHT_HALF", "right half"],
        ["RGB_KEY_HALF", "trigger's half"], ["RGB_KEYS_ONLY", "trigger key"],
    ],
    paintModes: [["KEYS_MAPPED_ON_THIS_LAYER_ONLY", "Keys mapped on this layer only"], ["ALL_KEYS", "All LEDs"]],
    // The same modes in two words, for a list's cell.
    paintModesBrief: [["KEYS_MAPPED_ON_THIS_LAYER_ONLY", "mapped keys"], ["ALL_KEYS", "all LEDs"]],
    fadeModes: [
        ["FOLLOW_REAL_DESTINATION", "Follow the real destination"],
        ["END_COLOR_WHERE_BASE_EFFECT_WOULD_SHOW", "End colour where the background effect would show"],
        ["END_COLOR_ON_ALL_KEYS", "End colour on all LEDs"],
    ],
    tapCommit: [["KEY_FEEDBACK_TAP_COMMIT_OFF", "Off"], ["KEY_FEEDBACK_TAP_COMMIT_NON_BASE_TAPS", "Double taps and more"]],
    // Lighting's fields, as its tabs label them and the review names them.
    lightingFields: {colour: "Colour", locality: "Locality", paintMode: "Which LEDs light up", fadeMode: "Fade mode", endColour: "End colour",
        tapBranchCommit: "Tap branch commit"},
    // The colour editor's choice for a colour that may paint nothing (D-L94,
    // D-L95): a colour, or off, its LEDs dark; passthrough is each stage's
    // `colourOff[stage].offWord`.
    colourChoice: {colour: "Colour", off: "Off"},
    // What the colour editor says about HSV(0, 0, 0) in each stage (D-L94,
    // firmware D-F74): every colour a layer, a pointing slot, combo feedback
    // or a feedback case owns is passthrough at saturation and value 0, at
    // any hue, painting nothing so what is beneath shows; Off, value 0 with
    // saturation, is a choice of its own that turns its LEDs dark. The
    // auto-mouse fade's end colour is literal, so 0, 0, 0 is off there; the
    // background effect offers neither. The editor's choice reads Colour,
    // Off and `offWord` (D-L95); each choice's tip is `ledsOffTip` for Off
    // and `offTip` for Passthrough, the fade end's Off; a passthrough
    // colour's note is `offNote`, and an off one's `ledsOffNote`.
    colourOff: {
        layers: {
            offTip: "Store HSV(0, 0, 0): this layer then paints nothing, and what is beneath shows through.",
            offNote: "This layer is passthrough: it paints nothing, so what is beneath shows through wherever it would paint.",
            offWord: "Passthrough",
            ledsOffTip: "Store brightness 0 with saturation: this layer's keys then go dark, covering what is beneath.",
            ledsOffNote: "The colour is off: this layer's keys go dark, covering what is beneath. Make it passthrough to let what is beneath show.",
        },
        auto: {
            offTip: "Store HSV(0, 0, 0): the fade then ends with the LEDs off.",
        },
        pd: {
            offTip: "Store HSV(0, 0, 0): this mode then paints nothing while it runs, and what is beneath shows. Its accents in a colour of their own still light.",
            offNote: "This mode is passthrough: it paints nothing while it runs, so what is beneath shows. Its accents in a colour of their own still light.",
            offWord: "Passthrough",
            ledsOffTip: "Store brightness 0 with saturation: this mode then turns its area's LEDs off while it runs, covering what is beneath.",
            ledsOffNote: "The colour is off: this mode turns its area's LEDs off while it runs, covering what is beneath. Make it passthrough to let what is beneath show.",
        },
        combo: {
            offTip: "Store HSV(0, 0, 0): combo feedback then paints nothing while a combo's inputs are held, and what is beneath shows. Its accents in a colour of their own still light.",
            offNote: "Combo feedback is passthrough: it paints nothing while a combo's inputs are held, so what is beneath shows. Its accents in a colour of their own still light.",
            offWord: "Passthrough",
            ledsOffTip: "Store brightness 0 with saturation: combo feedback then turns its area's LEDs off while a combo's inputs are held, covering what is beneath.",
            ledsOffNote: "The colour is off: combo feedback turns its area's LEDs off while a combo's inputs are held, covering what is beneath. Make it passthrough to let what is beneath show.",
        },
        key: {
            offTip: "Store HSV(0, 0, 0): this case then paints nothing, and what is beneath shows. The other cases still light, and so do its accents in a colour of their own.",
            offNote: "This case is passthrough: it paints nothing, so what is beneath shows. The other cases still light, and so do its accents in a colour of their own.",
            offWord: "Passthrough",
            ledsOffTip: "Store brightness 0 with saturation: this case then turns its area's LEDs off, covering what is beneath.",
            ledsOffNote: "The colour is off: this case turns its area's LEDs off, covering what is beneath. Make it passthrough to let what is beneath show.",
        },
        autocorrect: {
            offTip: "Store HSV(0, 0, 0): this case then paints nothing, and what is beneath shows. The other cases still light, and so do its accents in a colour of their own.",
            offNote: "This case is passthrough: it paints nothing, so what is beneath shows, and its accents that take its colour stay dark. The other cases still light.",
            offWord: "Passthrough",
            ledsOffTip: "Store brightness 0 with saturation: this case then turns its area's LEDs off, covering what is beneath.",
            ledsOffNote: "The colour is off: this case turns its area's LEDs off, covering what is beneath. Make it passthrough to let what is beneath show.",
        },
    },
    // What Behaviour feedback shows (D-L93; the firmware's behaviour-feedback
    // semantics, D-F73): the tiers, then each tap branch pending, named as
    // the behaviour grid names its tap count (the last for every deeper one
    // too), and all of them, which an accent may light for.
    feedbackOwners: [
        ["KEY_FEEDBACK_GROUP_ALL", "Every behaviour state"],
        ["KEY_FEEDBACK_GROUP_TAP_COMMITTED", "Tap committed"],
        ["KEY_FEEDBACK_GROUP_HOLD_ACTIVE", "Hold active"],
        ["KEY_FEEDBACK_GROUP_LONG_HOLD_ACTIVE", "Long hold active"],
        ...[2, 3, 4, 5].map((count) => /** @type {[string, string]} */ ([`KEY_FEEDBACK_GROUP_TAP_COUNT_${count}`, BRANCHES[count - 1]])),
        ["KEY_FEEDBACK_GROUP_TAP_BRANCH_ANY", "Every tap branch"],
    ],
    // The behaviour tier each behaviour state flashes for, which marks its
    // rows with that tier's dot, as the review does; the other states have
    // none.
    feedbackTiers: {KEY_FEEDBACK_GROUP_TAP_COMMITTED: "tap", KEY_FEEDBACK_GROUP_HOLD_ACTIVE: "hold", KEY_FEEDBACK_GROUP_LONG_HOLD_ACTIVE: "long"},
    // What Replacement feedback shows (D-L89, D-L92; the firmware's
    // replacement-feedback semantics, D-F70, D-F72): the four cases, an input
    // replaced with text, one replaced by its macro and a replacement undone
    // with Backspace, which flash, and the leader waiting, which holds; and
    // all of them, which an accent may light for.
    replacementOwners: [
        ["AUTOCORRECT_FEEDBACK_GROUP_ALL", "Every case"],
        ["AUTOCORRECT_FEEDBACK_GROUP_TEXT", "Replaced with text"],
        ["AUTOCORRECT_FEEDBACK_GROUP_MACRO", "Replaced by a macro"],
        ["AUTOCORRECT_FEEDBACK_GROUP_UNDO", "Replacement undone"],
        ["AUTOCORRECT_FEEDBACK_GROUP_LEADING", "Leader waiting"],
    ],
    // When each case shows (firmware D-F70, D-F72), said in one line under
    // its name on the tab: the three flashes, and Leader waiting, held from
    // the Leader key until the leader sends or gives up. The rest of what a
    // case does is in the stage's info mark (ui/lighting/help.mjs).
    replacementWhen: {
        AUTOCORRECT_FEEDBACK_GROUP_TEXT: "Flashes once as an input is replaced with text, and as the Leader key sends text.",
        AUTOCORRECT_FEEDBACK_GROUP_MACRO: "Flashes once as an input is erased for its macro, and as the Leader key plays a macro.",
        AUTOCORRECT_FEEDBACK_GROUP_UNDO: "Flashes once as Backspace, straight after a replacement, puts the word back.",
        AUTOCORRECT_FEEDBACK_GROUP_LEADING: "Held, not flashed, from the Leader key until the leader sends or gives up.",
    },
    // The case each Replacement feedback colour shows, by the colour's
    // field, in the order the keyboard stores them. The tab lists its
    // colours by it, the review names them by it, and an accent of the case
    // is found by it.
    replacementColourOwners: {textColor: "AUTOCORRECT_FEEDBACK_GROUP_TEXT", macroColor: "AUTOCORRECT_FEEDBACK_GROUP_MACRO", undoColor: "AUTOCORRECT_FEEDBACK_GROUP_UNDO", leadingColor: "AUTOCORRECT_FEEDBACK_GROUP_LEADING"},
    // Accents (D-L77), by the table an accent edit names: when they light,
    // with {owner} for the layer, mode, behaviour state or replacement case picked; the owner
    // that is all of a table's, by the name core reads and writes
    // (`everyOwner`, the schema's RGB_EVERY_OWNER), and what it is called, as an accent lighting for it is
    // tagged and offered and the review names it (combo accents all light for
    // every combo, so that table has no such owner, only its words); and
    // what an accent that takes its stage's colour (HSV(0, 0, 0)) takes.
    accents: {
        layer: {when: "LEDs that light in a colour of their own while {owner} is on, with those for every layer. An accent on a lower layer stays lit over the layers above it.",
            everyOwner: RGB_EVERY_OWNER.layer, every: "Every layer", stageColour: "Same as the layer"},
        pdMode: {when: "LEDs that light in a colour of their own while {owner} runs, with those for every pointing mode.",
            everyOwner: RGB_EVERY_OWNER.pdMode, every: "Every pointing mode", stageColour: "Same as the mode"},
        combo: {when: "LEDs that light in a colour of their own while a combo's inputs are held: the same LEDs for every combo.",
            every: "Every combo", stageColour: "Same as combo feedback"},
        keyBehavior: {when: "LEDs that light in a colour of their own while a key shows {owner}, with those for every behaviour state: the same LEDs whichever key it is.",
            everyOwner: RGB_EVERY_OWNER.keyBehavior, every: "Every behaviour state", stageColour: "Same as the feedback colour",
            // Each tap branch's accents may light for all of them at once
            // (D-L93, firmware D-F75), in the colour of the branch showing.
            group: {owner: "KEY_FEEDBACK_GROUP_TAP_BRANCH_ANY", words: "Every tap branch", members: ["KEY_FEEDBACK_GROUP_TAP_COUNT_2", "KEY_FEEDBACK_GROUP_TAP_COUNT_3", "KEY_FEEDBACK_GROUP_TAP_COUNT_4", "KEY_FEEDBACK_GROUP_TAP_COUNT_5"]}},
        autocorrect: {when: "LEDs that light in a colour of their own while the keyboard shows {owner}, with those for every case: the same LEDs whichever key caused it, or none.",
            everyOwner: RGB_EVERY_OWNER.autocorrect, every: "Every case", stageColour: "Same as the case's colour"},
    },
    // The accent editor's own fields; its colour field is lightingFields.colour.
    accentFields: {lightsFor: "Lights for", ownColour: "Its own"},
    // The case each Behaviour feedback row shows (D-L93), by the row: a
    // tier's colour field, then each tap branch's, `branch:0` the double
    // tap's. Behaviour feedback lists its cases by it, the review names them
    // by it, and an accent of the case is found by it.
    feedbackColourOwners: {tapCommittedColor: "KEY_FEEDBACK_GROUP_TAP_COMMITTED", holdActiveColor: "KEY_FEEDBACK_GROUP_HOLD_ACTIVE",
        longHoldActiveColor: "KEY_FEEDBACK_GROUP_LONG_HOLD_ACTIVE",
        "branch:0": "KEY_FEEDBACK_GROUP_TAP_COUNT_2", "branch:1": "KEY_FEEDBACK_GROUP_TAP_COUNT_3",
        "branch:2": "KEY_FEEDBACK_GROUP_TAP_COUNT_4", "branch:3": "KEY_FEEDBACK_GROUP_TAP_COUNT_5"},
    // The groups of Lighting's lists beside an editor (webview/ui/groups.mjs
    // groupedTable): the layers and slots in use, ahead of the empty ones;
    // Behaviour feedback's two groups of colours, as the behaviour grid's columns
    // and rows; Replacement feedback's cases; and the combos by what holding
    // one shows.
    lightingLists: {
        inUse: "In use",
        tiers: {title: "Tiers", tip: "Flash as a key's tap, hold or long hold fires."},
        tapBranches: {title: "Tap branches", tip: "Flash while a run of taps waits on that tap count, until it resolves."},
        replacements: {title: "Cases", tip: "One flash as text replacement changes what was typed, in the colour of what it did, and a colour held while the leader waits."},
        comboFeedback: {title: "Combo feedback", empty: "No combo on this view lights combo feedback.", tip: "The combos on this view that light combo feedback while held. Pick one for the board to hold it."},
        holdLayer: {title: "Hold a layer", empty: "No combo on this view holds a layer.", tip: "Combos whose output holds a layer. They light no combo feedback: the layer's own light shows the hold."},
    },
    // The lighting stages in the order the firmware paints them, each with
    // the word its tab reads by where the window is too narrow for the
    // whole name (its stage bar still says it whole). A stage is found by its
    // id or bit, never by its words.
    stages: [
        {id: "base", label: "Background effect", short: "Background"},
        {id: "layers", label: "Layer colours", short: "Layers", bit: RGB_STAGE_BITS.LAYER},
        {id: "auto", label: "Auto-mouse fade", short: "Auto-mouse", bit: RGB_STAGE_BITS.AUTOMOUSE},
        {id: "pd", label: "Pointing modes", short: "Pointing", bit: RGB_STAGE_BITS.POINTING_MODE},
        {id: "combo", label: "Combo feedback", short: "Combos", bit: RGB_STAGE_BITS.COMBO},
        {id: "key", label: "Behaviour feedback", short: "Behaviours", bit: RGB_STAGE_BITS.KEY_BEHAVIOR},
        {id: "autocorrect", label: "Replacement feedback", short: "Replacement", bit: RGB_STAGE_BITS.AUTOCORRECT},
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
    // The switch keys for behaviours and for auto-mouse, by their names' homes
    // (data/user-keycodes.js BEHAVIOR_SWITCH_KEYS, AUTO_MOUSE_SWITCH_KEYS),
    // worded as QMK's catalogue words the switch keys for combos: Combo On,
    // Combo Off, Toggle Combo.
    switchKeys: /** @satisfies {Readonly<Record<import("../data/user-keycodes.js").BehaviorSwitchKey | import("../data/user-keycodes.js").AutoMouseSwitchKey, string>>} */ ({
        BH_ON: "Behaviours On", BH_OFF: "Behaviours Off", BH_TOGG: "Toggle Behaviours",
        AM_ON: "Auto-mouse On", AM_OFF: "Auto-mouse Off", AM_TOGG: "Toggle Auto-mouse"}),
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
    // their sections say "settings"; Behaviour feedback flash and Replacement
    // feedback flash are counted with their lighting stages, so they take the
    // stages' names; and Text
    // replacement's section, which is its switch, is counted beside its list
    // and says so.
    fileSections: {
        keyTiming: SETTINGS_SECTIONS.keyTiming, startupLayers: SETTINGS_SECTIONS.startupLayers, behaviorSettings: "Behaviour settings", comboSettings: "Combo settings",
        comboReferences: SETTINGS_SECTIONS.comboReferences, keyboardOptions: SETTINGS_SECTIONS.keyboardOptions, lightingPower: SETTINGS_SECTIONS.lightingPower, rgbAppearance: SETTINGS_SECTIONS.rgbAppearance,
        lightingFeedback: "Behaviour feedback", replacementFeedback: "Replacement feedback", normalPointerSpeed: SETTINGS_SECTIONS.normalPointerSpeed, sniping: SETTINGS_SECTIONS.sniping, autoMouse: SETTINGS_SECTIONS.autoMouse,
        autocorrect: "Text replacement switch",
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
    // (profile-usage.js), as the keyboard's usage table names each, in its order.
    usageCounts: {
        behaviours: {label: "Behaviours", what: "Keys with a behaviour."},
        behaviourSteps: {label: "Behaviour tap counts", what: "Each behaviour's tap counts, up to the deepest one it sets, added up across all behaviours."},
        combos: {label: "Combos", what: "Combos on any layer."},
        macros: {label: "Macros", what: "Macro slots with steps."},
        autocorrectInputs: {label: "Text replacement inputs", what: "Every input of every text replacement, added up across the list."},
        customKeys: {label: "Custom keys", what: "Custom keys with a name, a shortcut or a behaviour."},
        pointingModes: {label: "Pointing modes", what: "Slots that hold a pointing mode."},
        lightingGroups: {label: "LED sets", what: "The different sets of LEDs accents light; accents that light the same LEDs share one."},
        lightingGroupRows: {label: "Accents", what: "Accents on layers, pointing modes, combo feedback, behaviour feedback and replacement feedback."},
    },
    pointing: {
        kinds: [[0, "Empty"], [1, "Send keys"], [2, "Scroll"]],
        // What each movement does, said beside it where a mode picks it, and
        // what that choice is called.
        kindsDo: [[1, "Each direction sends a key or shortcut."], [2, "The ball scrolls the page."]],
        movementLabel: "What the ball does",
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
        // layer. Review's fields; the editor's What starts it step heads its
        // lists with `keyTurnsOnShort` and `endsWhen`, and "already starts"
        // names the other mode a layer starts. The Keys workbench's Pointing
        // modes tab heads a column for each part of the link (`startedBy`,
        // `endsWhen`, `keyTurnsOnShort`), marks a layer the keyboard ignores in
        // it (`ignored`), and tags a mode its link starts (`started`).
        linkLabels: {startsOther: "already starts",
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
            ["divisorH", "Horizontal: ball movement per step"], ["divisorV", "Vertical: ball movement per step"],
            ["intervalMs", "Fastest repeat (ms)"], ["expireMs", "Leftover movement kept for (ms)"], ["lockMs", "Axis kept after the ball stops (ms)"],
            ["startNumerator", "Axis selection ratio · numerator"], ["startDenominator", "Axis selection ratio · denominator"],
            ["sustainNumerator", "Axis retention ratio · numerator"], ["sustainDenominator", "Axis retention ratio · denominator"],
            ["decayDivisor", "Cross-axis decay divisor"],
        ],
        heldModifiers: "Hold modifiers while scrolling",
        // What each setting of a mode does, by the field it sets, as the
        // firmware runs it (its pointing spec; pointing_mode_dragscroll.c for
        // the scroll fields): said as the field's tip wherever it is drawn. A
        // ratio's tip is its numerator's; a directional threshold's is by how
        // often the mode sends (thresholdEvery, thresholdOnce).
        tips: {
            axis: "Which movement this mode turns into keys. Switching to one axis empties the other axis's keys.",
            emptyDirection: "Moving toward a direction with no key: its neighbours take over its share; both neighbours are sent (a diagonal's two straight directions, a straight direction's two diagonals, so in eight directions only); or the move does nothing.",
            directionOutput: "Every step sends the key again each time the ball moves a threshold further. Once per movement sends it once, however far the ball goes; a movement starts again after a 150 ms pause, and only turning more than 90 degrees from the direction that sent sends again before then.",
            thresholdEvery: "How far the ball must move for each key a direction sends: one key per this distance. Lower sends more often.",
            thresholdOnce: "How far the ball must move before a direction sends its key; it sends once however far the ball goes.",
            scrollAxes: "Which way this mode scrolls. With one axis, a swipe the other way does nothing, and its slight drift does not scroll the allowed axis.",
            dpi: "Sensor DPI while this mode runs.",
            pointerLayer: "Keep the pointer layer active: the pointer layer stays on while the mode runs, and a locked mode keeps auto-mouse on. Return to the typing layer: starting the mode turns the pointer layer off, and it stays off while the mode runs. A mode its layers started never keeps the pointer layer on.",
            linkedLayers: "While one of these layers is on, held or locked, it starts this pointing mode. A mode started by its key wins over one its layers started.",
            linkTurnsOn: "While this pointing mode's key runs it, held or locked, these layers stay on; each goes off when the mode ends unless something else keeps it.",
            linkEnds: "A higher layer: one above the highest layer that starts this pointing mode and is on. Any layer: any layer that is on and starts or is turned on by neither. Either ends the mode until that layer goes off; the pointer layer and the default layers never do, and a mode its key runs is never ended.",
            thresholdH: "How far the ball must move sideways, in sensor counts, before a scroll can go sideways. When both axes are below their thresholds, the scroll lets go of its axis.",
            thresholdV: "How far the ball must move up or down, in sensor counts, before a scroll can go up or down. When both axes are below their thresholds, the scroll lets go of its axis.",
            divisorH: "Sensor counts of sideways movement for one scroll step. Lower scrolls faster.",
            divisorV: "Sensor counts of up-and-down movement for one scroll step. Lower scrolls faster.",
            intervalMs: "The shortest time between two scrolls sent. 0 leaves no wait: a scroll is sent as soon as the ball has moved a whole step.",
            lockMs: "How long a scroll keeps its axis once the ball stops. Move again within it and it carries on the same way; after it, the next movement picks its axis afresh.",
            expireMs: "Movement that has not yet made a whole scroll step is kept this long after the ball stops, so a slow movement still adds up; then it is forgotten. At least the axis time.",
            decayDivisor: "Each scroll sent divides the other axis's leftover movement by this, and drops it once it is below that axis's threshold, so drift across a scroll fades instead of building up. Higher fades faster; at least 2.",
            invert: "Reverses which way the page scrolls for that axis: sideways, up and down, or both.",
            heldModifiers: "Modifiers held down while the mode scrolls, for apps that scroll differently with them: Shift to scroll sideways in some, Command or Ctrl to zoom in others.",
            startNumerator: "To pick an axis, its movement must be at least this many times the other axis's: 7 : 4 is 1.75 times. Higher needs a straighter movement before a scroll starts; when neither axis wins, it waits.",
            sustainNumerator: "A scroll keeps its axis while that axis moves at least this many times the other (5 : 4 is 1.25 times, never more than the selection ratio). Below it, the other axis takes over only if it reaches the selection ratio; otherwise the scroll stays on its axis through the wobble.",
        },
        // What the pointer layer does while a mode its key started runs: on,
        // or off so the typing layer's keys stay under the hand.
        pointerLayerLabel: "Pointer layer",
        // The editor's other field labels, which the review names its fields
        // by. A directional threshold is its axis's word and then its
        // directionStep ("Horizontal movement per tap").
        fieldLabels: {name: "Pointing mode name", dpi: "Pointer speed", axis: "Reads", emptyDirection: "When a direction has no key",
            directionOutput: "How often it sends", scrollAxes: "Scrolls", invert: "Reverse scrolling", horizontal: "Horizontal", vertical: "Vertical"},
    },
    // The eight modifiers by their bits, as they read held together: the left
    // one unmarked, the right one named so (D-L83). A modifier key on its own
    // keeps its side ("Left Ctrl"), the catalogue's name for it.
    modifiers: [[1, "Ctrl"], [2, "Shift"], [4, "Alt"], [8, "GUI"],
        [16, "Right Ctrl"], [32, "Right Shift"], [64, "Right Alt"], [128, "Right GUI"]],
    comboOptions: {useOutputBehavior: "use output behaviour", mustHold: "must be held", mustTap: "tap only", ordered: "keys in order"},
    // What a behaviour and a combo share, as both editors label it and the
    // review names it: whether it runs, and on which layers.
    definitionFields: {use: {behaviour: "Use this behaviour", combo: "Use this combo"}, allowedLayers: "Layers it runs on",
        offInSettings: {behaviour: `off in ${SETTINGS_SCREENS.behaviours}`, combo: `off in ${SETTINGS_SCREENS.combos}`}, onceOn: {behaviour: "For a key on this layer, this switch takes effect once that is on again; for a combo sending this behaviour, it applies now.",
            combo: "This switch takes effect once that is on again."}},
    // A banner while a global switch keeps something off, which goes to that
    // switch, and what a lighting stage adds when it is the thing kept off.
    settingOff: {switches: {behaviour: {off: "Behaviours are off.", fix: `Turn them on in ${SETTINGS_SCREENS.behaviours} →`},
        combo: {off: "Combos are off.", fix: `Turn them on in ${SETTINGS_SCREENS.combos} →`},
        autoMouse: {off: "Auto-mouse is off.", fix: `Turn it on in ${SETTINGS_SCREENS.pointer} →`},
        autocorrect: {off: "Text replacement is off.", detail: "The keyboard keeps this list and replaces nothing.", fix: `Turn it on in ${SETTINGS_SCREENS.host} →`}}, stage: "This stage paints nothing.",
        // With a leader input on the list the leader still sends, and its
        // sends still flash (firmware D-F71, D-L91).
        leading: {list: "Words you finish are left as you typed them; the Leader key still sends your leader inputs.", stage: "Words you finish never flash; Leader waiting still lights, and what the Leader key sends still flashes, in the text or macro colour."}},
    // A behaviour's own switch, as its editor labels it and the review names
    // it, and the fold its timings open from.
    behaviourFields: {anchor: "Keeps the pointer layer on", timings: "Timings"},
    // A combo's fields, as the Combos table heads them and the review names them.
    comboFields: {inputs: "Inputs", sends: "Sends", window: "Window", conditions: "Conditions"},
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
// The LEDs an accent lights, by the indices the board numbers them with, a
// run of three or more as a range: "LEDs 24–28, 53–55" (D-L77).
/** @param {readonly number[]} leds */
const ledsCalled = (leds) => {
    const sorted = [...new Set(leds)].sort((left, right) => left - right);
    /** @type {[number, number][]} */
    const runs = [];
    for (const led of sorted) {
        const last = runs[runs.length - 1];
        if (last && led === last[1] + 1) last[1] = led; else runs.push([led, led]);
    }
    const parts = runs.flatMap(([from, to]) => to - from >= 2 ? [`${from}–${to}`] : from === to ? [`${from}`] : [`${from}`, `${to}`]);
    return `LED${sorted.length === 1 ? "" : "s"} ${parts.join(", ")}`;
};
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

// The areas Review groups its changes under, in the order the rail lists
// where they are edited. An area edited on a screen of its own is named as
// that screen is (the pointer's settings are Pointer's); Settings is the
// other Settings screens'. The interface keeps a copy of the order
// (webview/view/review.mjs AREAS, pinned by tests/view/enum-drift.test.mjs).
const REVIEW_AREAS = Object.freeze({keys: "Keys", layers: "Layers", behaviours: "Behaviours", combos: "Combos", customKeys: "Custom keys", macros: "Macros", autocorrect: "Text replacement",
    pointer: "Pointer", pointing: "Pointing modes", lighting: "Lighting", settings: "Settings", profile: "Profile", recovery: "Recovery"});
// Each part of the profile as the area Review groups its changes under, by
// the area core/schema/profile-domains.js gives it: where a refusal says the
// keyboard found a problem.
/** @type {Readonly<Record<import("../schema/profile-domains.js").ProfileDomain["area"], string>>} */
const PROFILE_AREAS = Object.freeze({lighting: REVIEW_AREAS.lighting, behaviours: REVIEW_AREAS.behaviours, combos: REVIEW_AREAS.combos, settings: REVIEW_AREAS.settings,
    pointing: REVIEW_AREAS.pointing, keys: REVIEW_AREAS.keys, macros: REVIEW_AREAS.macros, autocorrect: REVIEW_AREAS.autocorrect});

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

module.exports = {TEXT_REPLACEMENT_KEYS, PHASE, listed, PHASE_WORDS, HALVES_WORDS, LIVE_RESULT_WORDS, SAVE_STEP_WORDS, SAVE_FAILURE_WORDS, APPLY_VERDICTS, SAVE_WORDS, INTERRUPTION_REASONS, PROFILE_FULL_WORDS, heldWords, EDIT_MODE_WORDS, editModeWords, quietWords, VOCABULARY, word, layerName, macroDefaultName, slotName, branchName, ledsCalled, LAYER_KEY_VERBS, wordedMacroError, protectionWords, settingsPath, modifierNames, PROFILE_AREAS, REVIEW_AREAS, FAILURE_WORDS, sayable, arkCode, failureSentence};
