// @ts-check
"use strict";

// The Text replacement screen's view of a snapshot and the draft edits it
// makes: the list as entries with what will misbehave marked on each, the
// counts and bytes against what the keyboard holds, and one handler for every
// edit the screen posts. The list's own rules are autocorrect-list.js's. The
// code keeps the firmware's names: a replacement is a correction, an input
// a typo.

const {decodedOf, editProfileDomains, autocorrectCeilings} = require("./portable-profile");
const {AUTOCORRECT_DOMAIN_V1, autocorrectCounts, entryKey, triggerOf} = require("../schema/autocorrect-domain-v1");
const {parsePayload} = require("../schema/macro-payload");
const {inspectMacroPlayback, readStoredMacro} = require("./macro-input");
const {PROFILE_BLOB_V1} = require("../schema/profile-blob-v1");
const {MACOS, hostSettings} = require("../schema/host-settings");
const {hostLayout} = require("../data/host-layouts");
const {LEADER, leaderOutcome, typedText} = require("./autocorrect-matcher");
const {SHORT_INPUT_LETTERS, TRIGGER_NAMES, WARNING, addTypos, changeReplacement, changeTypo, findEntry, listUsage, listWarnings, removeEntry, removeTypo, replacementCalled, replacementSaid, setTrigger, splitInputs, targetOf, inputForm, untypableFix} = require("./autocorrect-list");
const {exportAutocorrect, planImport, previewImport, rowsOf} = require("./autocorrect-import");
const {VOCABULARY, word} = require("./vocabulary");

/**
 * @typedef {import("../schema/autocorrect-domain-v1.js").AutocorrectList} AutocorrectList
 * @typedef {import("./autocorrect-list.js").Host} Host
 * @typedef {import("../../contracts/edits.js").AutocorrectEditType} AutocorrectEditType
 */

// What each macro slot plays, as a replacement that names it would find it:
// nothing for a slot that is empty or that this host's settings cannot play;
// otherwise its text, when it types only text.
/** @param {import("./types.js").DecodedProfile} decoded @param {ReturnType<typeof hostSettings>} host @returns {({text: string | null} | null)[]} */
function macroPlays(decoded, host) {
    return (decoded.macroSlots || []).map(bytes => {
        if (!bytes.length) return null;
        try {
            const payload = readStoredMacro(bytes);
            if (!payload || inspectMacroPlayback(payload, host).error) return null;
            const steps = parsePayload(payload);
            return {text: steps.every(step => step.kind === "text") ? steps.map(step => step.kind === "text" ? step.text : "").join("") : null};
        } catch {
            return null;
        }
    });
}

// What is worked out of a decoded profile for a host system, kept while that
// decoded form lives: a draft revision keeps its own, so the screen's view,
// each check of what is typed and each Try it key read the same answer
// instead of parsing every macro and walking the list again.
/** @typedef {{host: ReturnType<typeof readHost>, warnings?: import("./autocorrect-list.js").Warning[]}} Kept */
/** @type {WeakMap<import("./types.js").DecodedProfile, Map<unknown, Kept>>} */
const kept = new WeakMap();
/** @param {import("./types.js").DecodedProfile} decoded @param {import("./types.js").SnapshotFacts["hostOs"]} [hostOs] @returns {Kept} */
function keptFor(decoded, hostOs) {
    const byHost = kept.get(decoded) ?? new Map();
    kept.set(decoded, byHost);
    /** @type {Kept} */
    const held = byHost.get(hostOs?.detected) ?? {host: readHost(decoded, hostOs)};
    byHost.set(hostOs?.detected, held);
    return held;
}

// The host layout the keyboard types replacements through, with its name, and
// the macros a replacement may play: their names and which hold nothing.
/** @param {import("./types.js").DecodedProfile} decoded @param {import("./types.js").SnapshotFacts["hostOs"]} [hostOs] @returns {Required<Host> & {macos: boolean, plays: ReturnType<typeof macroPlays>}} */
function readHost(decoded, hostOs) {
    const host = hostSettings(decoded.settings.values, hostOs?.detected);
    const plays = macroPlays(decoded, host);
    // The keyboard takes the host for a Mac by its layout or by its system
    // (firmware autocorrect-v1.md, "What counts as typing").
    return {layout: host.layout, layoutName: word(VOCABULARY.hostLayouts, host.layout), macos: hostLayout(host.layout)?.os === "macos" || host.effective === MACOS,
        macroNames: decoded.settings.macroNames || [], emptyMacros: new Set(plays.flatMap((macro, slot) => macro ? [] : [slot])), plays};
}
/** @param {import("./types.js").DecodedProfile} decoded @param {import("./types.js").SnapshotFacts["hostOs"]} [hostOs] */
const hostOf = (decoded, hostOs) => keptFor(decoded, hostOs).host;
// What will misbehave in a decoded profile's list on its host layout
// (autocorrect-list.js listWarnings).
/** @param {import("./types.js").DecodedProfile} decoded @param {import("./types.js").SnapshotFacts["hostOs"]} [hostOs] */
function warningsOf(decoded, hostOs) {
    const held = keptFor(decoded, hostOs);
    return held.warnings ??= listWarnings(decoded.autocorrect, held.host);
}

// How many replacements and inputs the chosen layout cannot type, said once
// for the whole list with what to do about it; nothing when it types them all.
/** @param {import("./autocorrect-list.js").Warning[]} warnings @param {string} layoutName */
function untypableNotice(warnings, layoutName) {
    const untypable = warnings.filter(warning => warning.kind === WARNING.UNTYPABLE);
    const entries = untypable.filter(warning => warning.typo === undefined).length, typos = untypable.length - entries;
    /** @param {number} count @param {string} one @param {string} many */
    const counted = (count, one, many) => `${count} ${count === 1 ? one : many}`;
    const parts = [...(entries ? [counted(entries, "replacement", "replacements")] : []), ...(typos ? [counted(typos, "input", "inputs")] : [])];
    return parts.length ? `${layoutName} cannot type ${parts.join(" and ")}, so the keyboard skips ${untypable.length === 1 ? "it" : "them"}. ${untypableFix()}` : "";
}

// What the keyboard holds of a list, for this profile: its ceilings as the
// keyboard reports them, the bytes of its domain, and the bytes the profile
// may still grow by, which the list shares with everything else in it.
/** @param {import("./types.js").DecodedProfile} decoded @param {import("./types.js").ProfileDestination} [capabilities] */
function roomOf(decoded, capabilities) {
    return {...autocorrectCeilings(capabilities), capacity: capabilities?.autocorrectBytes ?? AUTOCORRECT_DOMAIN_V1.MAX_SIZE,
        sharedFree: Math.max(0, (capabilities?.maxProfilePayload ?? PROFILE_BLOB_V1.MAX_SIZE) - decoded.candidate.length)};
}

/** @param {import("./types.js").ProfileSnapshot | null | undefined} snapshot @param {import("./types.js").ProfileDestination} [capabilities] */
function autocorrectEditorView(snapshot, capabilities) {
    if (!snapshot?.document || snapshot.incomplete) return null;
    const decoded = decodedOf(snapshot), list = decoded.autocorrect;
    const host = hostOf(decoded, snapshot.hostOs);
    const warnings = warningsOf(decoded, snapshot.hostOs);
    /** @param {string} entry @param {string} [typo] */
    const said = (entry, typo) => warnings.filter(warning => warning.entry === entry && warning.typo === typo).map(warning => warning.text);
    const used = listUsage(list), room = roomOf(decoded, capabilities);
    const notice = untypableNotice(warnings, host.layoutName);
    return {identity: snapshot.fingerprint,
        entries: list.entries.map(entry => ({id: entryKey(entry), label: replacementCalled(entry, host.macroNames), correction: entry.correction, ...(entry.macro === undefined ? {} : {macro: entry.macro}),
            fires: TRIGGER_NAMES[triggerOf(entry)], warnings: said(entryKey(entry)),
            typos: entry.typos.map(typo => ({typo: typo.typo, input: inputForm(typo), warnings: said(entryKey(entry), typo.typo)}))})),
        // `share` is the list's bytes of its own limit, the one figure both
        // memory meters draw; `free` is what it can still grow by, which its
        // text's ceiling and the profile's shared room may bound sooner.
        usage: {corrections: used.corrections, typos: used.typos, leaders: used.leaders, maxTypos: room.maxTypos,
            textBytes: used.textBytes, maxTextBytes: room.maxTextBytes, bytes: used.bytes, capacity: room.capacity, share: room.capacity > 0 ? Math.min(1, used.bytes / room.capacity) : 0,
            free: Math.max(0, Math.min(room.capacity - used.bytes, room.maxTextBytes - used.textBytes, room.sharedFree)), textMax: capabilities?.autocorrectTextMax ?? AUTOCORRECT_DOMAIN_V1.TEXT_MAX,
            correctionMax: capabilities?.autocorrectCorrectionMax ?? AUTOCORRECT_DOMAIN_V1.CORRECTION_MAX, shortInput: SHORT_INPUT_LETTERS},
        notices: notice ? [notice] : [],
        layoutName: host.layoutName};
}

// Each edit's change to the list, by the type the screen posts.
// The inputs an add names: a field's text, split as core splits it, or the
// inputs one by one.
/** @param {import("../../contracts/edits.js").EditOf<"addAutocorrectTypos">} message */
const addedTypos = message => typeof message.inputs === "string" ? splitInputs(message.inputs).map(typo => ({typo})) : message.typos || [];
/** @type {{[K in AutocorrectEditType]: (list: AutocorrectList, message: import("../../contracts/edits.js").EditOf<K>, host: Host, room: ReturnType<typeof roomOf>) => void}} */
const CHANGES = {
    // A new replacement fires as the add says; one the list has keeps how it
    // fires.
    addAutocorrectTypos: (list, message, host) => addTypos(list, message, addedTypos(message), host, message.trigger),
    updateAutocorrectTrigger: (list, message, host) => setTrigger(list, message, message.trigger, host),
    updateAutocorrectCorrection: (list, message, host) => changeReplacement(list, message, message.toMacro === undefined ? {correction: message.to} : {macro: message.toMacro}, host),
    updateAutocorrectTypo: (list, message, host) => changeTypo(list, message.typo, message.to, host),
    deleteAutocorrectTypo: (list, message) => removeTypo(list, message.typo),
    deleteAutocorrectEntry: (list, message, host) => removeEntry(list, message, host),
    // What the list cannot take of an import is left out, as its preview
    // said (autocorrect-import.js planImport); the rest becomes the list.
    importAutocorrect: (list, message, host, room) => {
        if (message.mode !== "add" && message.mode !== "replace") throw refuse("Choose whether to add to the list or replace it.");
        const entries = Array.isArray(message.entries) ? message.entries : [];
        if (entries.some(entry => !entry || (entry.macro === undefined ? typeof entry.correction !== "string" : !Number.isInteger(entry.macro)) || !Array.isArray(entry.typos) || entry.typos.some(typo => !typo || typeof typo.typo !== "string"))) throw refuse("This is not a text replacement list.");
        list.entries = planImport(list, rowsOf(entries), message.mode, host, room).list.entries;
    },
};
/** @param {string} message */
const refuse = message => Object.assign(new Error(message), {code: "AUTOCORRECT_EDIT_REFUSED"});

// One edit's change to a list, in place, by the list's own rules: what the
// draft's handler below makes of the profile's list, and what the offline
// preview's stand-in runs to answer a check (scripts/preview-macro-shell.mjs).
/** @param {AutocorrectList} list @param {import("../../contracts/edits.js").AutocorrectEdit} message @param {Host} host @param {ReturnType<typeof roomOf>} room */
function changeList(list, message, host, room) {
    const change = /** @type {(list: AutocorrectList, message: unknown, host: Host, room: unknown) => void} */ (CHANGES[message.type]);
    change(list, message, host, room);
}

// One edit to the list. The list is opened, changed in place and encoded
// again in its canonical order; a list past what the keyboard holds is
// refused in words by the count it went past (PROFILE_FULL_WORDS.counts).
/** @param {import("./types.js").PortableDocument} document @param {import("../../contracts/edits.js").AutocorrectEdit} message @param {import("./types.js").Draft} draft */
function editAutocorrect(document, message, draft) {
    return editProfileDomains(document, draft, (open, read) => {
        changeList(open("autocorrect"), message, hostOf(read(), draft.hostOs), roomOf(read(), draft.capabilities));
    });
}

// What an edit would newly warn about: the warnings the list has after it
// that it did not have before.
/** @param {import("./types.js").CompleteSnapshot} before @param {import("./types.js").PortableDocument} after */
function newWarnings(before, after) {
    const old = decodedOf(before), next = decodedOf({document: after});
    const had = new Set(warningsOf(old, before.hostOs).map(warning => warning.text));
    return warningsOf(next, before.hostOs).filter(warning => !had.has(warning.text)).map(warning => warning.text);
}

// What an edit names, asked before it is made: the entry its replacement is
// once the edit is kept (`entry`, the id the list has or will have for it),
// what that replacement is called (`label`), whether the list already has it
// (`listed`: an add then adds to it, which `listedSaid` says where a new
// replacement is being made, and a change joins it, which `joins` warns of),
// and whether it is an add that names no input yet (`unfinished`), which is
// only asked what it would be. Nothing for an edit that names no replacement
// to go to. A replacement that cannot be one is refused as the edit would
// refuse it.
/** @param {AutocorrectList} list @param {import("./autocorrect-list.js").MacroNames} macroNames @param {import("../../contracts/edits.js").AutocorrectEdit} edit @returns {{entry?: string, label?: string, listed?: boolean, listedSaid?: string, joins?: string, unfinished?: boolean}} */
function listEditNames(list, macroNames, edit) {
    /** @param {import("./autocorrect-list.js").Target} target */
    const said = target => { const words = replacementSaid(target, macroNames); return `${words[0].toUpperCase()}${words.slice(1)} is already on your list`; };
    if (edit.type === "addAutocorrectTypos") {
        const target = targetOf(edit), listed = Boolean(findEntry(list, target));
        return {entry: entryKey(target), label: replacementCalled(target, macroNames), listed, unfinished: !addedTypos(edit).length, ...(listed ? {listedSaid: `${said(target)}. Add inputs to it there.`} : {})};
    }
    if (edit.type !== "updateAutocorrectCorrection") return {};
    const target = targetOf(edit.toMacro === undefined ? {correction: edit.to} : {macro: edit.toMacro});
    const from = edit.macro !== undefined ? entryKey({macro: edit.macro}) : String(edit.correction ?? "");
    const listed = entryKey(target) !== from && Boolean(findEntry(list, target));
    return {entry: entryKey(target), label: replacementCalled(target, macroNames), listed, ...(listed ? {joins: `${said(target)}: this one's inputs will join it.`} : {})};
}
/** @param {{document: import("./types.js").PortableDocument, decoded?: import("./types.js").DecodedProfile}} snapshot @param {import("../../contracts/edits.js").AutocorrectEdit} edit */
function editNames(snapshot, edit) {
    const decoded = decodedOf(snapshot);
    return listEditNames(decoded.autocorrect, decoded.settings.macroNames || [], edit);
}

// What a list file would do to a snapshot's list,
// added to it and replacing it, on its host layout and within what the
// keyboard holds.
/** @param {import("./types.js").CompleteSnapshot} snapshot @param {Parameters<typeof previewImport>[1]} file @param {import("./types.js").ProfileDestination} [capabilities] */
function importPreview(snapshot, file, capabilities) {
    const decoded = decodedOf(snapshot);
    // A row's match is one of the four the keyboard stores: every reader of a file maps a word to one.
    return /** @type {import("../../contracts/messages.js").AutocorrectImportPreview} */ (previewImport(decoded.autocorrect, file, hostOf(decoded, snapshot.hostOs), roomOf(decoded, capabilities)));
}

// The most text a try runs: what was there and what was typed, each.
const TRY_TEXT_MAX = 4096;
// What the leader would do with text typed after the Leader key, for Try it's
// After Leader field (D-L91): the matcher's outcome, and for a send whether
// this host and its macros let it out, as typing it after the key shows.
/** @param {AutocorrectList} list @param {Host & {plays: ({text: string | null} | null)[]}} host @param {boolean} capsLock @param {string} typed @returns {import("../../contracts/messages.js").AutocorrectLeaderTry} */
function leaderTry(list, host, capsLock, typed) {
    if (!autocorrectCounts(list).leaders) return {state: "none"};
    const outcome = leaderOutcome(list, typed);
    if (outcome.state === "waits") return {state: "waits", sends: outcome.exact ? replacementCalled(outcome.exact.entry, host.macroNames) : null, longer: outcome.longer.map(listed => listed.typo.typo)};
    if (outcome.state === "drops") return {state: "drops", held: typed.slice(0, outcome.at + 1)};
    const sent = typedText(list, host, capsLock, `${LEADER}${typed.slice(0, outcome.at + 1)}`, "", slot => host.plays[slot] ?? null).fired;
    return {state: "sends", input: outcome.typo.typo, entry: entryKey(outcome.entry), label: replacementCalled(outcome.entry, host.macroNames),
        ...(outcome.entry.macro === undefined ? {} : {macro: outcome.entry.macro}), finishing: outcome.finishing, passedOver: !sent.length};
}
// Try it: what the keyboard would leave on screen for text typed against a
// snapshot's list, on its host layout and under the Caps Lock given
// (autocorrect-matcher.js), after text that was already there; and, given
// `leader`, what it would do with that typed after the Leader key.
/** @param {import("./types.js").CompleteSnapshot} snapshot @param {{before?: unknown, typed?: unknown, capsLock?: unknown, leader?: unknown}} tried */
function tryText(snapshot, tried) {
    /** @param {string} message */
    const refuse = message => Object.assign(new Error(message), {code: "AUTOCORRECT_TRY_REFUSED"});
    const {before, typed, capsLock, leader} = tried;
    if (typeof before !== "string" || typeof typed !== "string" || (leader !== undefined && typeof leader !== "string")) throw refuse("Try it takes text.");
    if (typeof capsLock !== "boolean") throw refuse("Try it needs Caps Lock on or off.");
    if (before.length > TRY_TEXT_MAX || typed.length > TRY_TEXT_MAX || (leader?.length ?? 0) > TRY_TEXT_MAX) throw refuse("This text is too long to try. Clear the box and type again.");
    const decoded = decodedOf(snapshot);
    const host = hostOf(decoded, snapshot.hostOs);
    const result = typedText(decoded.autocorrect, host, capsLock, typed, before, slot => host.plays[slot] ?? null);
    return leader === undefined ? result : {...result, leader: leaderTry(decoded.autocorrect, host, capsLock, leader)};
}

// A snapshot's list as a file in one of the three formats, and the name a
// shell may suggest for it.
/** @param {import("./types.js").CompleteSnapshot} snapshot @param {import("./autocorrect-import.js").Format} format @param {Date} [now] */
function exportedList(snapshot, format, now = new Date()) {
    return {fileName: `charybdis-text-replacements-${now.toISOString().slice(0, 10)}.${format}`, text: exportAutocorrect(decodedOf(snapshot).autocorrect, format),
        mime: format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/plain"};
}

// What a staged addAutocorrectTypos did, for its history step: a new
// replacement, or one more input for one the list had.
/** @param {import("../../contracts/edits.js").EditOf<"addAutocorrectTypos">} message @param {import("./types.js").PortableDocument} document */
function addLabel(message, document) {
    // A step is named before its edit is judged: one that names no
    // replacement the list could have reads as the new one it would be.
    try { return editNames({document}, message).listed ? "Added an input to a replacement" : "Added a replacement"; } catch { return "Added a replacement"; }
}

module.exports = {TRY_TEXT_MAX, addLabel, autocorrectEditorView, changeList, editAutocorrect, editNames, exportedList, importPreview, listEditNames, newWarnings, tryText};
