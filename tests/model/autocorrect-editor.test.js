"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {compiled, settings, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
const {editDomain} = require("../fixtures/profile-document");
const {draftEdit} = require("../fixtures/draft-edit");
const {fingerprint, validateSnapshot} = require("../../core/model/portable-profile");
const {autocorrectEditorView, newWarnings} = require("../../core/model/autocorrect-editor");
const {AUTOCORRECT_DOMAIN_V1, AUTOCORRECT_MATCH: MATCH, autocorrectDomainSize} = require("../../core/schema/autocorrect-domain-v1");
const {hostLayouts} = require("../../core/data/host-layouts");
const {draftEditLabel} = require("../../core/model/draft-edits");
const {buildDeviceModel} = require("../../core/session/device-model");

const GERMAN = hostLayouts().find(layout => layout.slug === "windows-german").id;
// A profile typed through `layout` holding `entries` as its autocorrect list.
function fixture(entries, layout = 0) {
    const policy = settings();
    policy.values[27] = 1 | (layout << 16);
    const document = editDomain(compiled({policy}), "autocorrect", list => {list.entries = entries.map(([correction, ...typos]) => ({correction, typos: typos.map(typo => typeof typo === "string" ? {typo, match: 0} : {typo: typo[0], match: typo[1]})}));});
    return snapshot(document);
}
const snapshot = document => ({document, fingerprint: fingerprint(document), hostOs: {detected: 1}});
const listOf = current => validateSnapshot(current.document).autocorrect.entries.map(entry => [entry.correction, ...entry.typos.map(typo => typo.match ? [typo.typo, typo.match] : typo.typo)]);
const edit = (current, message, capabilities = CURRENT_CAPABILITIES) => snapshot(draftEdit(current, message, capabilities));
const says = (fn, pattern, code) => assert.throws(fn, error => (code === undefined || error.code === code) && pattern.test(error.message), String(pattern));

test("the view lists each correction once with its typos, in the stored order, and counts what the keyboard holds", () => {
    const current = fixture([["the", "teh", "hte"], ["because", "becuase"], ["thing", ["tihng", MATCH.ANYWHERE]]]);
    const view = autocorrectEditorView(current, CURRENT_CAPABILITIES);
    assert.equal(view.identity, current.fingerprint);
    assert.deepEqual(view.entries, [
        {correction: "because", warnings: [], typos: [{typo: "becuase", match: 0, warnings: []}]},
        {correction: "the", warnings: [], typos: [{typo: "hte", match: 0, warnings: []}, {typo: "teh", match: 0, warnings: []}]},
        {correction: "thing", warnings: [], typos: [{typo: "tihng", match: 3, warnings: []}]}]);
    const bytes = autocorrectDomainSize(validateSnapshot(current.document).autocorrect);
    assert.deepEqual(view.usage, {corrections: 3, maxCorrections: 1024, typos: 4, maxTypos: 1024, textBytes: 33, maxTextBytes: 20480, bytes, capacity: 34824, free: 34824 - bytes, textMax: 32});
    assert.deepEqual([view.notices, view.layoutName], [[], "US"]);
    assert.equal(autocorrectEditorView(null), null);
    assert.equal(autocorrectEditorView({incomplete: true, document: current.document}), null);
});

test("the keyboard's own ceilings and the profile's free room bound the list's", () => {
    const current = fixture([["the", "teh"]]);
    const stored = validateSnapshot(current.document);
    const view = autocorrectEditorView(current, {...CURRENT_CAPABILITIES, maxAutocorrectCorrections: 10, maxAutocorrectTypos: 20, autocorrectTextBytes: 300, autocorrectBytes: 500, maxProfilePayload: stored.candidate.length + 40});
    assert.deepEqual([view.usage.maxCorrections, view.usage.maxTypos, view.usage.maxTextBytes, view.usage.capacity, view.usage.free], [10, 20, 300, 500, 40]);
});

test("warnings are published on the entry or typo they are about, and the layout's said once for the list", () => {
    const entries = [["über", "ueber"], ["straße", "strasse"], ["no", ["on", MATCH.END]], ["button", "buton"]];
    const german = autocorrectEditorView(fixture(entries, GERMAN), CURRENT_CAPABILITIES);
    assert.deepEqual(german.notices, []);
    assert.equal(german.layoutName, "German (Windows)");
    const us = autocorrectEditorView(fixture(entries), CURRENT_CAPABILITIES);
    assert.deepEqual(us.notices, ["2 entries will not fire on US."]);
    assert.equal(us.entries.reduce((total, entry) => total + entry.warnings.length + entry.typos.reduce((sum, typo) => sum + typo.warnings.length, 0), 0), 4);
    assert.match(us.entries.find(entry => entry.correction === "über").warnings[0], /US cannot type “ü”/);
    const on = us.entries.find(entry => entry.correction === "no").typos[0];
    assert.equal(on.warnings.length, 2);
    assert.match(on.warnings[0], /shorter than four letters/);
    assert.match(on.warnings[1], /inside the correction “button”/);
    assert.deepEqual(autocorrectEditorView(fixture([["uber", "über"], ["a", "ä"]], 0), CURRENT_CAPABILITIES).notices, ["2 typos will not fire on US."]);
    assert.deepEqual(autocorrectEditorView(fixture([["über", "ueber"], ["a", "ä"]], 0), CURRENT_CAPABILITIES).notices, ["1 entry and 1 typo will not fire on US."]);
});

test("each edit the screen posts changes the list and nothing else", () => {
    let current = fixture([["the", "teh"]]);
    const before = validateSnapshot(current.document);
    current = edit(current, {type: "addAutocorrectTypos", correction: "because", typos: [{typo: "Becuase"}, {typo: "becasue", match: MATCH.WHOLE_WORD}]});
    current = edit(current, {type: "addAutocorrectTypos", correction: "the", typos: [{typo: "hte"}], expectedFingerprint: current.fingerprint});
    assert.deepEqual(listOf(current), [["because", "becasue", "becuase"], ["the", "hte", "teh"]]);
    current = edit(current, {type: "updateAutocorrectTypo", typo: "hte", match: MATCH.START});
    current = edit(current, {type: "updateAutocorrectTypo", typo: "teh", to: "tthe"});
    current = edit(current, {type: "updateAutocorrectTypo", typo: "becasue", correction: "cause"});
    assert.deepEqual(listOf(current), [["because", "becuase"], ["cause", "becasue"], ["the", ["hte", MATCH.START], "tthe"]]);
    current = edit(current, {type: "updateAutocorrectCorrection", correction: "cause", to: "because"});
    current = edit(current, {type: "deleteAutocorrectTypo", typo: "tthe"});
    assert.deepEqual(listOf(current), [["because", "becasue", "becuase"], ["the", ["hte", MATCH.START]]]);
    current = edit(current, {type: "deleteAutocorrectEntry", correction: "because"});
    current = edit(current, {type: "deleteAutocorrectTypo", typo: "hte"});
    assert.deepEqual(listOf(current), []);
    const after = validateSnapshot(current.document);
    for (const key of ["layers", "macroSlots", "settings", "rgb", "behaviors", "combos", "pdModes"]) assert.deepEqual(after[key], before[key], key);
});

test("a refused edit says why in plain words, and a form drawn from another revision is refused as stale", () => {
    const current = fixture([["the", "teh"]]);
    says(() => edit(current, {type: "addAutocorrectTypos", correction: "ten", typos: [{typo: "teh"}]}), /“teh” already corrects to “the”/, "AUTOCORRECT_EDIT_REFUSED");
    says(() => edit(current, {type: "addAutocorrectTypos", correction: "über", typos: [{typo: "ueber"}]}), /US cannot type “ü”/, "AUTOCORRECT_EDIT_REFUSED");
    says(() => edit(current, {type: "updateAutocorrectTypo", typo: "gone", match: 1}), /no longer in the list/);
    says(() => edit(current, {type: "deleteAutocorrectEntry", correction: "then"}), /no longer in the list/);
    says(() => edit(current, {type: "deleteAutocorrectTypo", typo: "teh", expectedFingerprint: "other"}), /keyboard changed since this list was opened/, "AUTOCORRECT_EDIT_CONFLICT");
    assert.doesNotThrow(() => edit(fixture([], GERMAN), {type: "addAutocorrectTypos", correction: "über", typos: [{typo: "ueber"}]}));
});

test("a list past what the keyboard holds is refused by the count it went past, and a full profile as any edit is", () => {
    const current = fixture([["the", "teh"], ["and", "adn"]]);
    const add = (capabilities, typos = [{typo: "tehn"}]) => edit(current, {type: "addAutocorrectTypos", correction: "then", typos}, {...CURRENT_CAPABILITIES, ...capabilities});
    says(() => add({maxAutocorrectCorrections: 2}), /at most 2 autocorrect corrections/, "PROFILE_FULL");
    says(() => add({maxAutocorrectTypos: 3}, [{typo: "tehn"}, {typo: "thne"}]), /at most 3 autocorrect typos/, "PROFILE_FULL");
    says(() => add({autocorrectTextBytes: 14}), /at most 14 bytes of text/, "PROFILE_FULL");
    const room = validateSnapshot(current.document).candidate.length;
    says(() => add({maxProfilePayload: room + 4}), /this keyboard holds/);
    assert.doesNotThrow(() => add({maxAutocorrectCorrections: 3, maxAutocorrectTypos: 3, autocorrectTextBytes: 20}));
    assert.equal(AUTOCORRECT_DOMAIN_V1.MAX_CORRECTIONS, CURRENT_CAPABILITIES.maxAutocorrectCorrections ?? 1024);
});

test("a backup whose list is past the keyboard's ceilings is refused in words", () => {
    const current = fixture([["the", "teh"], ["and", "adn"]]);
    assert.throws(() => validateSnapshot(current.document, {...CURRENT_CAPABILITIES, maxAutocorrectCorrections: 1}), /at most 1 autocorrect corrections/);
    assert.doesNotThrow(() => validateSnapshot(current.document, CURRENT_CAPABILITIES));
});

test("an edit's new warnings are the ones the list did not already have", () => {
    const current = fixture([["the", ["th", MATCH.START]]]);
    const added = draftEdit(current, {type: "addAutocorrectTypos", correction: "no", typos: [{typo: "on", match: MATCH.END}]}, CURRENT_CAPABILITIES);
    const warnings = newWarnings(current, added);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /“on” matches part of a word and is shorter than four letters/);
    assert.deepEqual(newWarnings(current, draftEdit(current, {type: "addAutocorrectTypos", correction: "because", typos: [{typo: "becuase"}]}, CURRENT_CAPABILITIES)), []);
});

test("each edit is recorded in its own words", () => {
    const {document} = fixture([["the", "teh"]]);
    assert.equal(draftEditLabel({type: "addAutocorrectTypos", correction: "then", typos: [{typo: "tehn"}]}, document), "Added an autocorrect entry");
    assert.equal(draftEditLabel({type: "addAutocorrectTypos", correction: " the ", typos: [{typo: "hte"}]}, document), "Added an autocorrect typo");
    assert.equal(draftEditLabel({type: "updateAutocorrectTypo", typo: "teh", correction: "then"}, document), "Moved an autocorrect typo");
    assert.equal(draftEditLabel({type: "updateAutocorrectTypo", typo: "teh", match: 1}, document), "Edited an autocorrect typo");
    assert.equal(draftEditLabel({type: "updateAutocorrectCorrection", correction: "the", to: "The"}, document), "Respelled an autocorrect correction");
    assert.equal(draftEditLabel({type: "deleteAutocorrectTypo", typo: "teh"}, document), "Removed an autocorrect typo");
    assert.equal(draftEditLabel({type: "deleteAutocorrectEntry", correction: "the"}, document), "Removed an autocorrect entry");
});

test("the list reaches the published model only with a complete read, and is writable with it", () => {
    const current = fixture([["the", "teh"]]);
    const view = autocorrectEditorView(current, CURRENT_CAPABILITIES);
    const model = buildDeviceModel({capabilities: CURRENT_CAPABILITIES, autocorrectView: view});
    assert.deepEqual(model.autocorrect.entries, view.entries);
    assert.deepEqual(model.autocorrectEditing, {identity: current.fingerprint, writable: true});
    assert.equal("identity" in model.autocorrect, false);
    const unread = buildDeviceModel({capabilities: CURRENT_CAPABILITIES});
    assert.equal(unread.autocorrect, null);
    assert.deepEqual(unread.autocorrectEditing, {identity: "", writable: false});
    assert.equal(buildDeviceModel({capabilities: CURRENT_CAPABILITIES, autocorrectView: view, busy: true}).autocorrectEditing.writable, false);
});

test("Review lists each changed entry once: added, removed, respelled, and each typo added, removed, moved or matched elsewhere", () => {
    const {profileReview} = require("../../core/model/profile-review");
    const {revertUnits} = require("../../core/model/profile-revert");
    const {UNIT} = require("../../core/model/review-units");
    const before = fixture([["the", "teh", "hte"], ["because", "becuase", "becasue"], ["gone", "goen"], ["thing", ["tihng", MATCH.ANYWHERE]], ["same", "saem"]]);
    const after = fixture([["The", "teh", "hte"], ["because", "becuase", "beacuse"], ["cause", "becasue"], ["thing", ["tihng", MATCH.END]], ["new", "nwe"], ["same", "saem"]]);
    const items = profileReview(before, after, CURRENT_CAPABILITIES).filter(item => item.area === "Autocorrect");
    const brief = items.map(item => [item.title, item.status, item.unit, item.fields.map(field => [field.label, field.status, field.before, field.after])]);
    assert.deepEqual(brief, [
        ["because", "changed", UNIT.autocorrect("because"), [["Typo", "removed", "becasue · whole word · moved to “cause”", null], ["Typo", "added", null, "beacuse · whole word"]]],
        ["gone", "removed", UNIT.autocorrect("gone"), [["Correction", "removed", "gone", null], ["Typo", "removed", "goen · whole word", null]]],
        ["The", "changed", UNIT.autocorrect("the", "The"), [["Correction", "changed", "the", "The"]]],
        ["thing", "changed", UNIT.autocorrect("thing"), [["Typo", "changed", "tihng · anywhere in a word", "tihng · end of word"]]],
        ["cause", "added", UNIT.autocorrect("cause"), [["Correction", "added", null, "cause"], ["Typo", "added", null, "becasue · whole word · moved from “because”"]]],
        ["new", "added", UNIT.autocorrect("new"), [["Correction", "added", null, "new"], ["Typo", "added", null, "nwe · whole word"]]],
    ]);
    assert.deepEqual(items.map(item => item.place), [{kind: "autocorrect", correction: "because"}, {kind: "autocorrect", correction: "gone"}, {kind: "autocorrect", correction: "The"},
        {kind: "autocorrect", correction: "thing"}, {kind: "autocorrect", correction: "cause"}, {kind: "autocorrect", correction: "new"}]);
    // Discarding one entry's change puts that entry back and leaves the rest.
    const reverted = snapshot(revertUnits(before, after, new Set([UNIT.autocorrect("the", "The")]), CURRENT_CAPABILITIES));
    assert.deepEqual(listOf(reverted).find(([correction]) => correction.toLowerCase() === "the"), ["the", "hte", "teh"]);
    assert.equal(profileReview(before, reverted, CURRENT_CAPABILITIES).filter(item => item.area === "Autocorrect").length, 5);
    // Discarding them all is the keyboard's list.
    const all = snapshot(revertUnits(before, after, new Set(items.map(item => item.unit)), CURRENT_CAPABILITIES));
    assert.deepEqual(listOf(all), listOf(before));
    assert.equal(all.fingerprint, before.fingerprint);
});

test("an import adds to the list or replaces it in one step, leaving out what the list cannot take", () => {
    const {exportedList, importPreview} = require("../../core/model/autocorrect-editor");
    const {parseAutocorrectFile, starterFile} = require("../../core/model/autocorrect-import");
    const current = fixture([["the", "teh"], ["then", "tehn"]]);
    const entries = [{correction: "the", typos: [{typo: "hte"}, {typo: "teh"}]}, {correction: "ten", typos: [{typo: "tehn"}]}, {correction: "thing", typos: [{typo: "Tihng", match: MATCH.ANYWHERE}]}];
    const added = edit(current, {type: "importAutocorrect", mode: "add", entries, expectedFingerprint: current.fingerprint});
    assert.deepEqual(listOf(added), [["the", "hte", "teh"], ["then", "tehn"], ["thing", ["tihng", MATCH.ANYWHERE]]]);
    const replaced = edit(current, {type: "importAutocorrect", mode: "replace", entries});
    assert.deepEqual(listOf(replaced), [["ten", "tehn"], ["the", "hte", "teh"], ["thing", ["tihng", MATCH.ANYWHERE]]]);
    assert.deepEqual(listOf(edit(current, {type: "importAutocorrect", mode: "replace", entries: []})), [], "replacing with nothing empties the list");
    // Past the keyboard's ceilings, what fits is kept and the rest left out.
    assert.deepEqual(listOf(edit(current, {type: "importAutocorrect", mode: "add", entries}, {...CURRENT_CAPABILITIES, maxAutocorrectTypos: 3})), [["the", "hte", "teh"], ["then", "tehn"]]);
    says(() => edit(current, {type: "importAutocorrect", mode: "merge", entries}), /add to the list or replace it/, "AUTOCORRECT_EDIT_REFUSED");
    says(() => edit(current, {type: "importAutocorrect", mode: "add", entries: [{correction: "the", typos: [{typo: 7}]}]}), /not an autocorrect list/);
    says(() => edit(current, {type: "importAutocorrect", mode: "add", entries: [null]}), /not an autocorrect list/);
    assert.equal(draftEditLabel({type: "importAutocorrect", mode: "add", entries}, current.document), "Added to the autocorrect list");
    assert.equal(draftEditLabel({type: "importAutocorrect", mode: "replace", entries}, current.document), "Replaced the autocorrect list");

    // The preview says what each choice would do, and its entries are what the edit takes.
    const preview = importPreview(current, parseAutocorrectFile(":hte: -> the\n:tehn: -> ten\ntihng -> thing\n", "in.txt"), CURRENT_CAPABILITIES);
    assert.deepEqual([preview.add.corrections, preview.add.typos, preview.add.refused.length, preview.replace.corrections, preview.replace.removed], [3, 4, 1, 3, 2]);
    assert.deepEqual(listOf(edit(current, {type: "importAutocorrect", mode: "add", entries: preview.entries})), [["the", "hte", "teh"], ["then", "tehn"], ["thing", ["tihng", MATCH.ANYWHERE]]]);
    const starter = importPreview(fixture([]), starterFile(), CURRENT_CAPABILITIES);
    assert.equal(starter.format, "starter");
    assert.deepEqual([starter.add.refused, starter.add.unfit], [[], 0]);
    assert.equal(validateSnapshot(edit(fixture([]), {type: "importAutocorrect", mode: "add", entries: starter.entries}).document).autocorrect.entries.length, starter.add.corrections);

    // The list as a file, named by the day and the format.
    const day = new Date("2026-11-10T08:00:00Z");
    assert.deepEqual(exportedList(current, "txt", day), {fileName: "charybdis-autocorrect-2026-11-10.txt", text: ":teh: -> the\n:tehn: -> then\n", mime: "text/plain"});
    assert.deepEqual([exportedList(current, "csv", day).fileName, exportedList(current, "csv", day).mime], ["charybdis-autocorrect-2026-11-10.csv", "text/csv"]);
    assert.deepEqual([exportedList(current, "json", day).fileName, exportedList(current, "json", day).mime], ["charybdis-autocorrect-2026-11-10.json", "application/json"]);
});

test("Review warns once of the entries the host layout cannot type, and a list it types has no check", () => {
    const {profileFindings} = require("../../core/model/profile-checks");
    const untypable = entries => profileFindings(validateSnapshot(fixture(entries).document)).filter(finding => finding.kind === "untypableAutocorrect");
    assert.deepEqual(untypable([["the", "teh"], ["iPhone", "iphone"]]), []);
    const [finding, ...more] = untypable([["über", "ueber"], ["straße", "strasse"], ["the", "teh"], ["a", "ä"]]);
    assert.deepEqual(more, []);
    assert.deepEqual({level: finding.level, count: finding.count, title: finding.title, place: finding.place},
        {level: "warning", count: 3, title: "3 autocorrect entries will not fire on US", place: {kind: "autocorrect", correction: "a"}});
    assert.match(finding.detail, /US cannot type a character in “a”, “straße”, “über”\. The keyboard stores them and skips them\./);
    assert.deepEqual(profileFindings(validateSnapshot(fixture([["über", "ueber"]], GERMAN).document)).filter(row => row.kind === "untypableAutocorrect"), []);
    assert.equal(untypable([["über", "ueber"]])[0].title, "1 autocorrect entry will not fire on US");
});
