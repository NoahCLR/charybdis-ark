// @ts-check
"use strict";

// The Autocorrect screen's view of a snapshot and the draft edits it makes:
// the list as entries with what will misbehave marked on each, the counts
// and bytes against what the keyboard holds, and one handler for every edit
// the screen posts. The list's own rules are autocorrect-list.js's.

const {decodedOf, editProfileDomains, autocorrectCeilings} = require("./portable-profile");
const {AUTOCORRECT_DOMAIN_V1} = require("../schema/autocorrect-domain-v1");
const {PROFILE_BLOB_V1} = require("../schema/profile-blob-v1");
const {hostSettings} = require("../schema/host-settings");
const {WARNING, addTypos, changeTypo, findEntry, listUsage, listWarnings, removeEntry, removeTypo, respellCorrection} = require("./autocorrect-list");
const {VOCABULARY, word} = require("./vocabulary");

/**
 * @typedef {import("../schema/autocorrect-domain-v1.js").AutocorrectList} AutocorrectList
 * @typedef {import("./autocorrect-list.js").Host} Host
 * @typedef {import("../../contracts/edits.js").AutocorrectEditType} AutocorrectEditType
 */

// The host layout the keyboard types corrections through, with its name.
/** @param {import("./types.js").DecodedProfile} decoded @param {import("./types.js").SnapshotFacts["hostOs"]} [hostOs] @returns {Required<Host>} */
function hostOf(decoded, hostOs) {
    const host = hostSettings(decoded.settings.values, hostOs?.detected);
    return {layout: host.layout, layoutName: word(VOCABULARY.hostLayouts, host.layout)};
}

// How many entries and typos the chosen layout leaves unable to fire, said
// once for the whole list; nothing when it types them all.
/** @param {import("./autocorrect-list.js").Warning[]} warnings @param {string} layoutName */
function untypableNotice(warnings, layoutName) {
    const untypable = warnings.filter(warning => warning.kind === WARNING.UNTYPABLE);
    const entries = untypable.filter(warning => warning.typo === undefined).length, typos = untypable.length - entries;
    /** @param {number} count @param {string} one @param {string} many */
    const counted = (count, one, many) => `${count} ${count === 1 ? one : many}`;
    const parts = [...(entries ? [counted(entries, "entry", "entries")] : []), ...(typos ? [counted(typos, "typo", "typos")] : [])];
    return parts.length ? `${parts.join(" and ")} will not fire on ${layoutName}.` : "";
}

/** @param {import("./types.js").ProfileSnapshot | null | undefined} snapshot @param {import("./types.js").ProfileDestination} [capabilities] */
function autocorrectEditorView(snapshot, capabilities) {
    if (!snapshot?.document || snapshot.incomplete) return null;
    const decoded = decodedOf(snapshot), list = decoded.autocorrect;
    const host = hostOf(decoded, snapshot.hostOs);
    const warnings = listWarnings(list, host);
    /** @param {string} correction @param {string} [typo] */
    const said = (correction, typo) => warnings.filter(warning => warning.correction === correction && warning.typo === typo).map(warning => warning.text);
    const used = listUsage(list), ceilings = autocorrectCeilings(capabilities);
    const capacity = capabilities?.autocorrectBytes ?? AUTOCORRECT_DOMAIN_V1.MAX_SIZE;
    const sharedFree = (capabilities?.maxProfilePayload ?? PROFILE_BLOB_V1.MAX_SIZE) - decoded.candidate.length;
    const notice = untypableNotice(warnings, host.layoutName);
    return {identity: snapshot.fingerprint,
        entries: list.entries.map(entry => ({correction: entry.correction, warnings: said(entry.correction),
            typos: entry.typos.map(typo => ({typo: typo.typo, match: typo.match, warnings: said(entry.correction, typo.typo)}))})),
        usage: {corrections: used.corrections, maxCorrections: ceilings.maxCorrections, typos: used.typos, maxTypos: ceilings.maxTypos,
            textBytes: used.textBytes, maxTextBytes: ceilings.maxTextBytes, bytes: used.bytes, capacity,
            free: Math.max(0, Math.min(capacity - used.bytes, sharedFree)), textMax: AUTOCORRECT_DOMAIN_V1.TEXT_MAX},
        notices: notice ? [notice] : [],
        warningCount: warnings.length,
        layoutName: host.layoutName};
}

// Each edit's change to the list, by the type the screen posts.
/** @type {{[K in AutocorrectEditType]: (list: AutocorrectList, message: import("../../contracts/edits.js").EditOf<K>, host: Host) => void}} */
const CHANGES = {
    addAutocorrectTypos: (list, message, host) => addTypos(list, message.correction, message.typos, host),
    updateAutocorrectCorrection: (list, message, host) => respellCorrection(list, message.correction, message.to, host),
    updateAutocorrectTypo: (list, message, host) => changeTypo(list, message.typo, {to: message.to, match: message.match, correction: message.correction}, host),
    deleteAutocorrectTypo: (list, message) => removeTypo(list, message.typo),
    deleteAutocorrectEntry: (list, message) => removeEntry(list, message.correction),
};

// One edit to the list. The list is opened, changed in place and encoded
// again in its canonical order; a list past what the keyboard holds is
// refused in words by the count it went past (PROFILE_FULL_WORDS.counts).
/** @param {import("./types.js").PortableDocument} document @param {import("../../contracts/edits.js").AutocorrectEdit} message @param {import("./types.js").Draft} draft */
function editAutocorrect(document, message, draft) {
    return editProfileDomains(document, draft, (open, read) => {
        const host = hostOf(read(), draft.hostOs);
        const change = /** @type {(list: AutocorrectList, message: unknown, host: Host) => void} */ (CHANGES[message.type]);
        change(open("autocorrect"), message, host);
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

// What a staged addAutocorrectTypos did, for its history step: a new entry,
// or typos for one the list had.
/** @param {import("../../contracts/edits.js").EditOf<"addAutocorrectTypos">} message @param {import("./types.js").PortableDocument} document */
function addLabel(message, document) {
    const correction = typeof message.correction === "string" ? message.correction.trim() : "";
    return findEntry(decodedOf({document}).autocorrect, correction) ? "Added an autocorrect typo" : "Added an autocorrect entry";
}

module.exports = {addLabel, autocorrectEditorView, editAutocorrect, hostOf, newWarnings};
