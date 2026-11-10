// @ts-check
"use strict";

// The Text replacement screen's view of a snapshot and the draft edits it
// makes: the list as entries with what will misbehave marked on each, the
// counts and bytes against what the keyboard holds, and one handler for every
// edit the screen posts. The list's own rules are autocorrect-list.js's. The
// code keeps the firmware's names: a replacement is a correction, a typed
// form a typo.

const {decodedOf, editProfileDomains, autocorrectCeilings} = require("./portable-profile");
const {AUTOCORRECT_DOMAIN_V1, entryKey, isMacroSlot} = require("../schema/autocorrect-domain-v1");
const {parsePayload} = require("../schema/macro-payload");
const {inspectMacroPlayback, readStoredMacro} = require("./macro-input");
const {PROFILE_BLOB_V1} = require("../schema/profile-blob-v1");
const {MACOS, hostSettings} = require("../schema/host-settings");
const {hostLayout} = require("../data/host-layouts");
const {typedText} = require("./autocorrect-matcher");
const {WARNING, addTypos, changeReplacement, changeTypo, findEntry, listUsage, listWarnings, removeEntry, removeTypo, typedForm} = require("./autocorrect-list");
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

// The host layout the keyboard types replacements through, with its name, and
// the macros a replacement may play: their names and which hold nothing.
/** @param {import("./types.js").DecodedProfile} decoded @param {import("./types.js").SnapshotFacts["hostOs"]} [hostOs] @returns {Required<Host> & {macos: boolean, plays: ReturnType<typeof macroPlays>}} */
function hostOf(decoded, hostOs) {
    const host = hostSettings(decoded.settings.values, hostOs?.detected);
    const plays = macroPlays(decoded, host);
    // The keyboard takes the host for a Mac by its layout or by its system
    // (firmware autocorrect-v1.md, "What counts as typing").
    return {layout: host.layout, layoutName: word(VOCABULARY.hostLayouts, host.layout), macos: hostLayout(host.layout)?.os === "macos" || host.effective === MACOS,
        macroNames: decoded.settings.macroNames || [], emptyMacros: new Set(plays.flatMap((macro, slot) => macro ? [] : [slot])), plays};
}

// How many replacements and typed forms the chosen layout leaves unable to
// fire, said once for the whole list; nothing when it types them all.
/** @param {import("./autocorrect-list.js").Warning[]} warnings @param {string} layoutName */
function untypableNotice(warnings, layoutName) {
    const untypable = warnings.filter(warning => warning.kind === WARNING.UNTYPABLE);
    const entries = untypable.filter(warning => warning.typo === undefined).length, typos = untypable.length - entries;
    /** @param {number} count @param {string} one @param {string} many */
    const counted = (count, one, many) => `${count} ${count === 1 ? one : many}`;
    const parts = [...(entries ? [counted(entries, "replacement", "replacements")] : []), ...(typos ? [counted(typos, "typed form", "typed forms")] : [])];
    return parts.length ? `${parts.join(" and ")} will not fire on ${layoutName}.` : "";
}

/** @param {import("./types.js").ProfileSnapshot | null | undefined} snapshot @param {import("./types.js").ProfileDestination} [capabilities] */
function autocorrectEditorView(snapshot, capabilities) {
    if (!snapshot?.document || snapshot.incomplete) return null;
    const decoded = decodedOf(snapshot), list = decoded.autocorrect;
    const host = hostOf(decoded, snapshot.hostOs);
    const warnings = listWarnings(list, host);
    /** @param {string} entry @param {string} [typo] */
    const said = (entry, typo) => warnings.filter(warning => warning.entry === entry && warning.typo === typo).map(warning => warning.text);
    const used = listUsage(list), ceilings = autocorrectCeilings(capabilities);
    const capacity = capabilities?.autocorrectBytes ?? AUTOCORRECT_DOMAIN_V1.MAX_SIZE;
    const sharedFree = (capabilities?.maxProfilePayload ?? PROFILE_BLOB_V1.MAX_SIZE) - decoded.candidate.length;
    const notice = untypableNotice(warnings, host.layoutName);
    return {identity: snapshot.fingerprint,
        entries: list.entries.map(entry => ({id: entryKey(entry), correction: entry.correction, ...(entry.macro === undefined ? {} : {macro: entry.macro}), warnings: said(entryKey(entry)),
            typos: entry.typos.map(typo => ({typo: typo.typo, typed: typedForm(typo), match: typo.match, warnings: said(entryKey(entry), typo.typo)}))})),
        usage: {corrections: used.corrections, maxCorrections: ceilings.maxCorrections, typos: used.typos, maxTypos: ceilings.maxTypos,
            textBytes: used.textBytes, maxTextBytes: ceilings.maxTextBytes, bytes: used.bytes, capacity,
            free: Math.max(0, Math.min(capacity - used.bytes, sharedFree)), textMax: capabilities?.autocorrectTextMax ?? AUTOCORRECT_DOMAIN_V1.TEXT_MAX,
            correctionMax: capabilities?.autocorrectCorrectionMax ?? AUTOCORRECT_DOMAIN_V1.CORRECTION_MAX},
        notices: notice ? [notice] : [],
        layoutName: host.layoutName};
}

// Each edit's change to the list, by the type the screen posts.
/** @type {{[K in AutocorrectEditType]: (list: AutocorrectList, message: import("../../contracts/edits.js").EditOf<K>, host: Host, ceilings: Required<import("../schema/autocorrect-domain-v1.js").Ceilings>) => void}} */
const CHANGES = {
    addAutocorrectTypos: (list, message, host) => addTypos(list, message, message.typos, host),
    updateAutocorrectCorrection: (list, message, host) => changeReplacement(list, message, message.toMacro === undefined ? {correction: message.to} : {macro: message.toMacro}, host),
    updateAutocorrectTypo: (list, message, host) => changeTypo(list, message.typo, {to: message.to, correction: message.correction, macro: message.macro}, host),
    deleteAutocorrectTypo: (list, message) => removeTypo(list, message.typo),
    deleteAutocorrectEntry: (list, message, host) => removeEntry(list, message, host),
    // What the list cannot take of an import is left out, as its preview
    // said (autocorrect-import.js planImport); the rest becomes the list.
    importAutocorrect: (list, message, host, ceilings) => {
        if (message.mode !== "add" && message.mode !== "replace") throw refuse("Choose whether to add to the list or replace it.");
        const entries = Array.isArray(message.entries) ? message.entries : [];
        if (entries.some(entry => !entry || (entry.macro === undefined ? typeof entry.correction !== "string" : !Number.isInteger(entry.macro)) || !Array.isArray(entry.typos) || entry.typos.some(typo => !typo || typeof typo.typo !== "string"))) throw refuse("This is not a text replacement list.");
        list.entries = planImport(list, rowsOf(entries), message.mode, host, ceilings).list.entries;
    },
};
/** @param {string} message */
const refuse = message => Object.assign(new Error(message), {code: "AUTOCORRECT_EDIT_REFUSED"});

// One edit to the list. The list is opened, changed in place and encoded
// again in its canonical order; a list past what the keyboard holds is
// refused in words by the count it went past (PROFILE_FULL_WORDS.counts).
/** @param {import("./types.js").PortableDocument} document @param {import("../../contracts/edits.js").AutocorrectEdit} message @param {import("./types.js").Draft} draft */
function editAutocorrect(document, message, draft) {
    return editProfileDomains(document, draft, (open, read) => {
        const host = hostOf(read(), draft.hostOs);
        const change = /** @type {(list: AutocorrectList, message: unknown, host: Host, ceilings: unknown) => void} */ (CHANGES[message.type]);
        change(open("autocorrect"), message, host, autocorrectCeilings(draft.capabilities));
    });
}

// What an edit would newly warn about: the warnings the list has after it
// that it did not have before.
/** @param {import("./types.js").CompleteSnapshot} before @param {import("./types.js").PortableDocument} after */
function newWarnings(before, after) {
    const old = decodedOf(before), next = decodedOf({document: after});
    const had = new Set(listWarnings(old.autocorrect, hostOf(old, before.hostOs)).map(warning => warning.text));
    return listWarnings(next.autocorrect, hostOf(next, before.hostOs)).filter(warning => !had.has(warning.text)).map(warning => warning.text);
}

// What a list file, or the starter list, would do to a snapshot's list,
// added to it and replacing it, on its host layout and within what the
// keyboard holds.
/** @param {import("./types.js").CompleteSnapshot} snapshot @param {Parameters<typeof previewImport>[1]} file @param {import("./types.js").ProfileDestination} [capabilities] */
function importPreview(snapshot, file, capabilities) {
    const decoded = decodedOf(snapshot);
    // A row's match is one of the four the keyboard stores: every reader of a file maps a word to one.
    return /** @type {import("../../contracts/messages.js").AutocorrectImportPreview} */ (previewImport(decoded.autocorrect, file, hostOf(decoded, snapshot.hostOs), autocorrectCeilings(capabilities)));
}

// The most text a try runs: what was there and what was typed, each.
const TRY_TEXT_MAX = 4096;
// Try it: what the keyboard would leave on screen for text typed against a
// snapshot's list, on its host layout and under the Caps Lock given
// (autocorrect-matcher.js), after text that was already there.
/** @param {import("./types.js").CompleteSnapshot} snapshot @param {{before?: unknown, typed?: unknown, capsLock?: unknown}} tried */
function tryText(snapshot, tried) {
    /** @param {string} message */
    const refuse = message => Object.assign(new Error(message), {code: "AUTOCORRECT_TRY_REFUSED"});
    const {before, typed, capsLock} = tried;
    if (typeof before !== "string" || typeof typed !== "string") throw refuse("Try it takes text.");
    if (typeof capsLock !== "boolean") throw refuse("Try it needs Caps Lock on or off.");
    if (before.length > TRY_TEXT_MAX || typed.length > TRY_TEXT_MAX) throw refuse("This text is too long to try. Clear the box and type again.");
    const decoded = decodedOf(snapshot);
    const host = hostOf(decoded, snapshot.hostOs);
    return typedText(decoded.autocorrect, host, capsLock, typed, before, slot => host.plays[slot] ?? null);
}

// A snapshot's list as a file in one of the three formats, and the name a
// shell may suggest for it.
/** @param {import("./types.js").CompleteSnapshot} snapshot @param {import("./autocorrect-import.js").Format} format @param {Date} [now] */
function exportedList(snapshot, format, now = new Date()) {
    return {fileName: `charybdis-text-replacements-${now.toISOString().slice(0, 10)}.${format}`, text: exportAutocorrect(decodedOf(snapshot).autocorrect, format),
        mime: format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/plain"};
}

// What a staged addAutocorrectTypos did, for its history step: a new
// replacement, or something more typed for one the list had.
/** @param {import("../../contracts/edits.js").EditOf<"addAutocorrectTypos">} message @param {import("./types.js").PortableDocument} document */
function addLabel(message, document) {
    const named = isMacroSlot(message.macro) ? {macro: message.macro} : {correction: typeof message.correction === "string" ? message.correction.trim() : ""};
    return findEntry(decodedOf({document}).autocorrect, named) ? "Added a typed form to a replacement" : "Added a replacement";
}

module.exports = {TRY_TEXT_MAX, addLabel, autocorrectEditorView, editAutocorrect, exportedList, importPreview, newWarnings, tryText};
