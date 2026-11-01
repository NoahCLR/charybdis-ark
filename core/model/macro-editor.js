// @ts-check
"use strict";
const {PROFILE_DOMAIN_IDS} = require("../schema/profile-domains");

const {decodedOf, editProfileDomains} = require("./portable-profile");
const {MACRO_DOMAIN_V1} = require("../schema/macro-domain-v1");
const {SETTINGS} = require("../schema/settings-domain-v1");
const {validName} = require("../schema/profile-name");
const {macroKeycodes, macroModifierKeycodes, encodeMacroPayload, macroProtectionOf} = require("../schema/macro-payload");
const {hostSettings} = require("../schema/host-settings");
const {hostLayout} = require("../data/host-layouts");
const {inspectMacroInput, inspectMacroPlayback, readStoredMacro} = require("./macro-input");
const {PROFILE_FULL_WORDS, VOCABULARY, macroDefaultName, word} = require("./vocabulary");
const {macroName, macroOfName} = require("../../rules/qmk-keycodes.mjs");
/** @param {string} message @param {string} [code] */
const fail = (message, code = "MACRO_EDIT_CONFLICT") => Object.assign(new Error(message), {code});


// Every empty slot keeps room for ten key taps (3 bytes each, the slot's end
// marker already counted). When the free bytes cannot keep that for every
// empty slot, the highest-numbered empty slots are shown as unavailable.
const SLOT_RESERVE_TAPS = 10, KEY_TAP_BYTES = 3;

/** @param {Buffer[]} slots @param {number} capacity @param {number} [sharedFree] */
function macroBudget(slots, capacity, sharedFree = Infinity) {
    const stored = slots.reduce((total, bytes) => total + bytes.length + 1, 0);
    const free = Math.max(0, Math.min(capacity - stored, sharedFree));
    const empty = slots.flatMap((bytes, index) => bytes.length === 0 || (bytes.length === 3 && bytes[0] === 1 && bytes[1] === 5) ? [index] : []);
    const room = Math.min(empty.length, Math.floor(free / (SLOT_RESERVE_TAPS * KEY_TAP_BYTES)));
    return {capacity, stored, free, empty: empty.length, outOfRoom: new Set(empty.slice(room)), available: slots.length - (empty.length - room)};
}

/** @param {import("./types.js").ProfileSnapshot | null | undefined} snapshot @param {import("./types.js").ProfileDestination} [capabilities] */
function macroEditorView(snapshot, capabilities) {
    if (!snapshot?.document || snapshot.incomplete) return null;
    const {macroSlots, settings} = decodedOf(snapshot);
    const host = hostSettings(settings.values, snapshot.hostOs?.detected);
    const names = settings.macroNames;
    // hostSettings selects an existing layout, with US as its fallback.
    const layout = /** @type {NonNullable<ReturnType<typeof hostLayout>>} */ (hostLayout(host.layout));
    const slots = macroSlots;
    const budget = profileMacroBudget(decodedOf(snapshot), capabilities);
    /** @param {Buffer} bytes @param {number} index */
    const slot = (bytes, index) => {
        const payload = readStoredMacro(bytes);
        const playback = inspectMacroPlayback(payload, host);
        const protection = macroProtectionOf(bytes);
        const needsUnicodeEntry = playback.typing.some(route => route.method !== "layout");
        const needsUnicodeSetup = playback.code === "UNICODE_SETUP_REQUIRED";
        return {keycode: macroName(index), name: names[index], defaultName: macroDefaultName(index),
            payload, protection, uninterruptible: protection === "on" || (protection === "auto" && needsUnicodeEntry),
            needsUnicodeEntry, needsUnicodeSetup, playbackError: playback.error, playbackCode: playback.code, empty: !payload, bytes: bytes.length,
            playable: !playback.error, available: !budget.outOfRoom.has(index),
            // How many more key taps this macro can take: what the bank has free.
            roomTaps: Math.floor(budget.free / KEY_TAP_BYTES)};
    };
    return {identity: snapshot.fingerprint,
        // Text types through the host layout; what it cannot type needs Unicode
        // entry (mode), said in `entry`. The interface judges held keys
        // against layoutChars.
        unicode: {mode: host.unicodeMode, enabled: host.unicodeEnabled, os: host.effective,
            layout: host.layout, layoutFits: host.layoutFits, layoutName: layout.name, layoutChars: layout.chars,
            entry: host.unicodeMode ? word(VOCABULARY.unicodeEntry, host.unicodeMode)
                : VOCABULARY.unicodeEntryOff.find(([os]) => os === host.effective)?.[1] ?? word(VOCABULARY.unicodeEntryOff, 0)},
        macros: slots.map(slot),
        macroBank: {capacity: budget.capacity, stored: budget.stored, free: budget.free, available: budget.available,
            slots: slots.length, reserveTaps: SLOT_RESERVE_TAPS},
        // Every slot can hold a full-length name, whatever the others hold.
        names: {perName: SETTINGS.NAME_MAX_BYTES},
        protectionChoices: VOCABULARY.macroProtection.map(([value, label]) => ({value, label})),
        macroPayloadKeycodes: macroKeycodes(), macroPayloadModifierKeycodes: macroModifierKeycodes()};
}

// What the editor is told of a macro's steps before they are staged: whether
// they play, and fit the bank.
/** @param {import("./types.js").CompleteSnapshot} snapshot @param {{keycode: string, payload?: string, protection?: 'auto' | 'on' | 'off'}} message @param {import("./types.js").ProfileDestination} [capabilities] */
const macroInputStatus = (snapshot, message, capabilities) => inputStatus(decodedOf(snapshot), snapshot.hostOs, message, capabilities);

/** @param {import("./types.js").DecodedProfile} decoded @param {import("./types.js").SnapshotFacts["hostOs"]} hostOs @param {{keycode: string, payload?: string, protection?: 'auto' | 'on' | 'off'}} message @param {import("./types.js").ProfileDestination} [capabilities] */
function inputStatus(decoded, hostOs, message, capabilities) {
    const index = macroIndex(message.keycode);
    const {macroSlots: slots, settings} = decoded;
    const budget = profileMacroBudget(decoded, capabilities);
    const host = hostSettings(settings.values, hostOs?.detected);
    return inspectMacroInput(message.payload, {mode: host.unicodeMode, protection: message.protection ?? macroProtectionOf(slots[index]),
        enabled: Boolean(host.unicodeMode), layout: host.layout, os: host.effective, macosIso: host.macosIso, currentBytes: slots[index].length, bankFree: budget.free});
}

/** @param {string} keycode */
function macroIndex(keycode) {
    const index = macroOfName(keycode || "");
    if (index === undefined || index >= MACRO_DOMAIN_V1.SLOTS) throw fail("Choose a macro slot reported by the keyboard.");
    return index;
}

// A macro's steps, its name, or both. A name lives in the profile's settings
// domain.
/** @param {import("./types.js").PortableDocument} document @param {import("../../contracts/edits.js").EditPayloads['updateMacro']} message @param {import("./types.js").Draft} draft */
function editMacro(document, message, draft) {
    const index = macroIndex(message.keycode);
    if (message.payload === undefined && message.name === undefined && message.protection === undefined) throw fail("Send the macro's steps, its name or its playback protection.");
    // A profile too full for the edit is said in a name's words only when the
    // name is all the edit changes; new steps say the profile's.
    const onlyName = message.name !== undefined && message.payload === undefined && message.protection === undefined;
    return editProfileDomains(document, {...draft, full: onlyName ? PROFILE_FULL_WORDS.name : undefined}, (open, read) => {
        const value = read();
        if (message.payload !== undefined) {
            const host = hostSettings(value.settings.values, draft.hostOs?.detected);
            const status = inputStatus(value, draft.hostOs, message, draft.capabilities);
            if (status.error) throw fail(status.error, status.code);
            const slots = open("macros");
            const protection = message.protection ?? macroProtectionOf(slots[index]);
            slots[index] = encodeMacroPayload(message.payload, {textEntry: Boolean(host.unicodeMode), layout: host.layout, protection});
        }
        if (message.protection !== undefined && message.payload === undefined) {
            const slots = open("macros");
            const bytes = slots[index];
            const previous = macroProtectionOf(bytes);
            const prefix = encodeMacroPayload("", {protection: message.protection});
            slots[index] = Buffer.concat([prefix, bytes.subarray(previous === "auto" ? 0 : 3)]);
        }
        if (message.name !== undefined && message.name !== value.settings.macroNames[index]) {
            if (typeof message.name !== "string") throw fail("A macro name must be text.");
            if (!validName(message.name.trim())) throw fail(`A macro name is up to ${SETTINGS.NAME_MAX_BYTES} bytes of text, with no control characters. Accented letters and symbols take two to four bytes each.`, "MACRO_NAME_INVALID");
            open("settings").macroNames[index] = message.name.trim();
        }
    });
}

/** @param {import("./types.js").DecodedProfile} decoded @param {import("./types.js").ProfileDestination} [capabilities] */
function profileMacroBudget(decoded, capabilities) {
    const slots = decoded.macroSlots;
    const {decodeProfileBlob, PROFILE_BLOB_V1} = require("../schema/profile-blob-v1");
    const storedDomain = decodeProfileBlob(decoded.profile).domains.find(domain => domain.id === PROFILE_DOMAIN_IDS.MACROS);
    const canonicalSize = slots.reduce((size, bytes) => size + bytes.length + 1, 0);
    // Replacing macro streams reclaims optional unused domain capacity. Other
    // edits retain those exact bytes, so ordinary profile usage includes them.
    const reclaimed = Math.max(0, (storedDomain?.payload.length ?? canonicalSize) - canonicalSize);
    const sharedFree = (capabilities?.maxProfilePayload ?? PROFILE_BLOB_V1.MAX_SIZE) - decoded.candidate.length + reclaimed;
    return macroBudget(slots, capabilities?.macroBytes ?? MACRO_DOMAIN_V1.MAX_SIZE, sharedFree);
}

module.exports = {profileMacroBudget, macroEditorView, editMacro, macroInputStatus, macroBudget, SLOT_RESERVE_TAPS};
