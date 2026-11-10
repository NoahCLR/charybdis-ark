"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {compiled, settings, CURRENT_CAPABILITIES} = require("../fixtures/portable-profile");
const {editDomain} = require("../fixtures/profile-document");
const {draftEdit} = require("../fixtures/draft-edit");
const {fingerprint, validateSnapshot} = require("../../core/model/portable-profile");
const {autocorrectEditorView, newWarnings, tryText, TRY_TEXT_MAX} = require("../../core/model/autocorrect-editor");
const {AUTOCORRECT_DOMAIN_V1, AUTOCORRECT_MATCH: MATCH, autocorrectDomainSize, entryKey} = require("../../core/schema/autocorrect-domain-v1");
const {encodeMacroPayload} = require("../../core/schema/macro-payload");
const {hostLayouts} = require("../../core/data/host-layouts");
const {draftEditLabel} = require("../../core/model/draft-edits");
const {buildDeviceModel} = require("../../core/session/device-model");

const GERMAN = hostLayouts().find(layout => layout.slug === "windows-german").id;
// A profile typed through `layout` holding `entries` as its text replacement
// list: a replacement's text, or a number for the macro slot it plays, then
// its inputs, each its letters or [letters, match]. `macros` gives
// macro slots their steps, and each a name.
function fixture(entries, layout = 0, macros = {}) {
    const policy = settings();
    policy.values[27] = 1 | (layout << 16);
    for (const slot of Object.keys(macros)) policy.macroNames[Number(slot)] = `Macro ${slot} named`;
    let document = editDomain(compiled({policy}), "autocorrect", list => {list.entries = entries.map(([correction, ...typos]) => ({...(typeof correction === "number" ? {correction: "", macro: correction} : {correction}),
        typos: typos.map(typo => typeof typo === "string" ? {typo, match: 0} : {typo: typo[0], match: typo[1]})}));});
    if (Object.keys(macros).length) document = editDomain(document, "macros", slots => {for (const [slot, payload] of Object.entries(macros)) slots[Number(slot)] = encodeMacroPayload(payload);});
    return snapshot(document);
}
const snapshot = document => ({document, fingerprint: fingerprint(document), hostOs: {detected: 1}});
// The same document with its host's system left to detection (Auto) on `layout`.
const fixtureWith = (document, layout) => editDomain(document, "settings", policy => {policy.values[27] = layout << 16;});
const listOf = current => validateSnapshot(current.document).autocorrect.entries.map(entry => [entry.macro ?? entry.correction, ...entry.typos.map(typo => typo.match ? [typo.typo, typo.match] : typo.typo)]);
const edit = (current, message, capabilities = CURRENT_CAPABILITIES) => snapshot(draftEdit(current, message, capabilities));
const says = (fn, pattern, code) => assert.throws(fn, error => (code === undefined || error.code === code) && pattern.test(error.message), String(pattern));

test("the view lists each replacement once with its inputs, as it is written, in the stored order, and counts what the keyboard holds", () => {
    const current = fixture([["the", "teh", "hte"], ["because", "becuase"], ["thing", ["tihng", MATCH.ANYWHERE]], ["receive", ["recieve", MATCH.START]], ["ment", ["mnet", MATCH.END]], [5, "sig"]], 0, {5: "Kind regards"});
    const view = autocorrectEditorView(current, CURRENT_CAPABILITIES);
    assert.equal(view.identity, current.fingerprint);
    assert.deepEqual(view.entries, [
        {id: "because", correction: "because", warnings: [], typos: [{typo: "becuase", input: "becuase", match: 0, warnings: []}]},
        {id: "ment", correction: "ment", warnings: [], typos: [{typo: "mnet", input: "*mnet", match: 2, warnings: []}]},
        {id: "receive", correction: "receive", warnings: [], typos: [{typo: "recieve", input: "recieve*", match: 1, warnings: []}]},
        {id: "the", correction: "the", warnings: [], typos: [{typo: "hte", input: "hte", match: 0, warnings: []}, {typo: "teh", input: "teh", match: 0, warnings: []}]},
        {id: "thing", correction: "thing", warnings: [], typos: [{typo: "tihng", input: "*tihng*", match: 3, warnings: []}]},
        {id: entryKey({macro: 5}), correction: "", macro: 5, warnings: [], typos: [{typo: "sig", input: "sig", match: 0, warnings: []}]}]);
    const bytes = autocorrectDomainSize(validateSnapshot(current.document).autocorrect);
    assert.deepEqual(view.usage, {corrections: 6, maxCorrections: 1024, typos: 7, maxTypos: 1024, textBytes: 58, maxTextBytes: 20480, bytes, capacity: 34824, free: 34824 - bytes, textMax: 32, correctionMax: 128});
    assert.deepEqual([view.notices, view.layoutName], [[], "US"]);
    assert.equal(autocorrectEditorView(null), null);
    assert.equal(autocorrectEditorView({incomplete: true, document: current.document}), null);
});

test("the keyboard's own ceilings and the profile's free room bound the list's", () => {
    const current = fixture([["the", "teh"]]);
    const stored = validateSnapshot(current.document);
    const view = autocorrectEditorView(current, {...CURRENT_CAPABILITIES, maxAutocorrectCorrections: 10, maxAutocorrectTypos: 20, autocorrectTextBytes: 300, autocorrectBytes: 500, maxProfilePayload: stored.candidate.length + 40});
    assert.deepEqual([view.usage.maxCorrections, view.usage.maxTypos, view.usage.maxTextBytes, view.usage.capacity, view.usage.free], [10, 20, 300, 500, 40]);
    const lengths = autocorrectEditorView(current, {...CURRENT_CAPABILITIES, autocorrectTextMax: 30, autocorrectCorrectionMax: 100}).usage;
    assert.deepEqual([lengths.textMax, lengths.correctionMax], [30, 100]);
});

test("warnings are published on the entry or input they are about, and the layout's said once for the list", () => {
    const entries = [["über", "ueber"], ["straße", "strasse"], ["no", ["on", MATCH.END]], ["button", "buton"]];
    const german = autocorrectEditorView(fixture(entries, GERMAN), CURRENT_CAPABILITIES);
    assert.deepEqual(german.notices, []);
    assert.equal(german.layoutName, "German (Windows)");
    const us = autocorrectEditorView(fixture(entries), CURRENT_CAPABILITIES);
    assert.deepEqual(us.notices, ["2 replacements will not fire on US."]);
    assert.equal(us.entries.reduce((total, entry) => total + entry.warnings.length + entry.typos.reduce((sum, typo) => sum + typo.warnings.length, 0), 0), 4);
    assert.match(us.entries.find(entry => entry.correction === "über").warnings[0], /US cannot type “ü”/);
    const on = us.entries.find(entry => entry.correction === "no").typos[0];
    assert.equal(on.warnings.length, 2);
    assert.equal(on.warnings[0], "“*on” is a short input with *, so it fires inside many words.");
    assert.match(on.warnings[1], /inside the replacement “button”/);
    assert.deepEqual(autocorrectEditorView(fixture([["uber", "über"], ["a", "ä"]], 0), CURRENT_CAPABILITIES).notices, ["2 inputs will not fire on US."]);
    assert.deepEqual(autocorrectEditorView(fixture([["über", "ueber"], ["a", "ä"]], 0), CURRENT_CAPABILITIES).notices, ["1 replacement and 1 input will not fire on US."]);
    // A replacement that plays a macro with no steps says so, by the macro's
    // name; one whose macro has steps says nothing.
    const played = autocorrectEditorView(fixture([[5, "sig"], [6, "addr"]], 0, {5: "Kind regards"}), CURRENT_CAPABILITIES);
    assert.deepEqual(played.entries.map(entry => [entry.macro, entry.warnings]), [[5, []], [6, ["“Macro 6” has no steps, so this replacement does nothing yet. Add steps in Macros, or choose another replacement."]]]);
});

test("each edit the screen posts changes the list and nothing else", () => {
    let current = fixture([["the", "teh"]]);
    const before = validateSnapshot(current.document);
    current = edit(current, {type: "addAutocorrectTypos", correction: "because", typos: [{typo: "Becuase"}, {typo: "becasue", match: MATCH.WHOLE_WORD}]});
    current = edit(current, {type: "addAutocorrectTypos", correction: "the", typos: [{typo: "hte"}], expectedFingerprint: current.fingerprint});
    assert.deepEqual(listOf(current), [["because", "becasue", "becuase"], ["the", "hte", "teh"]]);
    current = edit(current, {type: "updateAutocorrectTypo", typo: "hte", to: "hte*"});
    current = edit(current, {type: "updateAutocorrectTypo", typo: "teh", to: "tthe"});
    current = edit(current, {type: "updateAutocorrectTypo", typo: "becasue", correction: "cause"});
    assert.deepEqual(listOf(current), [["because", "becuase"], ["cause", "becasue"], ["the", ["hte", MATCH.START], "tthe"]]);
    current = edit(current, {type: "updateAutocorrectCorrection", correction: "cause", to: "because"});
    current = edit(current, {type: "deleteAutocorrectTypo", typo: "tthe"});
    assert.deepEqual(listOf(current), [["because", "becasue", "becuase"], ["the", ["hte", MATCH.START]]]);
    // A replacement that plays a macro: added, added to, made from text and
    // made text again, moved to and deleted, each named by its slot.
    current = edit(current, {type: "addAutocorrectTypos", macro: 5, typos: [{typo: "sig"}]});
    current = edit(current, {type: "addAutocorrectTypos", macro: 5, typos: [{typo: "sgi"}]});
    current = edit(current, {type: "updateAutocorrectCorrection", correction: "because", toMacro: 9});
    assert.deepEqual(listOf(current), [["the", ["hte", MATCH.START]], [5, "sgi", "sig"], [9, "becasue", "becuase"]]);
    current = edit(current, {type: "updateAutocorrectCorrection", macro: 9, to: "because"});
    current = edit(current, {type: "updateAutocorrectTypo", typo: "becasue", macro: 5});
    assert.deepEqual(listOf(current), [["because", "becuase"], ["the", ["hte", MATCH.START]], [5, "becasue", "sgi", "sig"]]);
    current = edit(current, {type: "deleteAutocorrectEntry", macro: 5});
    current = edit(current, {type: "deleteAutocorrectEntry", correction: "because"});
    current = edit(current, {type: "deleteAutocorrectTypo", typo: "hte"});
    assert.deepEqual(listOf(current), []);
    const after = validateSnapshot(current.document);
    for (const key of ["layers", "macroSlots", "settings", "rgb", "behaviors", "combos", "pdModes"]) assert.deepEqual(after[key], before[key], key);
});

test("a refused edit says why in plain words, and a form drawn from another revision is refused as stale", () => {
    const current = fixture([["the", "teh"]]);
    says(() => edit(current, {type: "addAutocorrectTypos", correction: "ten", typos: [{typo: "teh"}]}), /“teh” is already an input for “the”/, "AUTOCORRECT_EDIT_REFUSED");
    says(() => edit(current, {type: "addAutocorrectTypos", correction: "über", typos: [{typo: "ueber"}]}), /US cannot type “ü”/, "AUTOCORRECT_EDIT_REFUSED");
    says(() => edit(current, {type: "addAutocorrectTypos", correction: "then", typos: [{typo: "te*hn"}]}), /“te\*hn” has \* where it cannot go/, "AUTOCORRECT_EDIT_REFUSED");
    says(() => edit(current, {type: "addAutocorrectTypos", macro: 5, typos: [{typo: "sig*"}]}), /A macro plays for a whole word only/, "AUTOCORRECT_EDIT_REFUSED");
    says(() => edit(current, {type: "addAutocorrectTypos", macro: 128, typos: [{typo: "sig"}]}), /Choose one of the keyboard's macros/, "AUTOCORRECT_EDIT_REFUSED");
    says(() => edit(current, {type: "addAutocorrectTypos", correction: "x".repeat(129), typos: [{typo: "long"}]}), /at most 128 bytes/, "AUTOCORRECT_EDIT_REFUSED");
    says(() => edit(current, {type: "updateAutocorrectTypo", typo: "gone", to: "gone*"}), /no longer in the list/);
    says(() => edit(current, {type: "deleteAutocorrectEntry", correction: "then"}), /no longer in the list/);
    says(() => edit(current, {type: "deleteAutocorrectTypo", typo: "teh", expectedFingerprint: "other"}), /keyboard changed since this list was opened/, "AUTOCORRECT_EDIT_CONFLICT");
    assert.doesNotThrow(() => edit(fixture([], GERMAN), {type: "addAutocorrectTypos", correction: "über", typos: [{typo: "ueber"}]}));
});

test("a list past what the keyboard holds is refused by the count it went past, and a full profile as any edit is", () => {
    const current = fixture([["the", "teh"], ["and", "adn"]]);
    const add = (capabilities, typos = [{typo: "tehn"}]) => edit(current, {type: "addAutocorrectTypos", correction: "then", typos}, {...CURRENT_CAPABILITIES, ...capabilities});
    says(() => add({maxAutocorrectCorrections: 2}), /at most 2 text replacements/, "PROFILE_FULL");
    says(() => add({maxAutocorrectTypos: 3}, [{typo: "tehn"}, {typo: "thne"}]), /at most 3 inputs across all text replacements/, "PROFILE_FULL");
    says(() => add({autocorrectTextBytes: 14}), /at most 14 bytes of text/, "PROFILE_FULL");
    const room = validateSnapshot(current.document).candidate.length;
    says(() => add({maxProfilePayload: room + 4}), /this keyboard holds/);
    assert.doesNotThrow(() => add({maxAutocorrectCorrections: 3, maxAutocorrectTypos: 3, autocorrectTextBytes: 20}));
    assert.equal(AUTOCORRECT_DOMAIN_V1.MAX_CORRECTIONS, CURRENT_CAPABILITIES.maxAutocorrectCorrections ?? 1024);
});

test("a backup whose list is past the keyboard's ceilings is refused in words", () => {
    const current = fixture([["the", "teh"], ["and", "adn"]]);
    assert.throws(() => validateSnapshot(current.document, {...CURRENT_CAPABILITIES, maxAutocorrectCorrections: 1}), /at most 1 text replacements/);
    assert.doesNotThrow(() => validateSnapshot(current.document, CURRENT_CAPABILITIES));
});

test("an edit's new warnings are the ones the list did not already have", () => {
    const current = fixture([["the", ["th", MATCH.START]]]);
    const added = draftEdit(current, {type: "addAutocorrectTypos", correction: "no", typos: [{typo: "*on"}]}, CURRENT_CAPABILITIES);
    const warnings = newWarnings(current, added);
    assert.deepEqual(warnings, ["“*on” is a short input with *, so it fires inside many words."]);
    // A replacement that plays a macro without steps is warned of as it is added.
    assert.match(newWarnings(current, draftEdit(current, {type: "addAutocorrectTypos", macro: 5, typos: [{typo: "sig"}]}, CURRENT_CAPABILITIES))[0], /“Macro 5” has no steps/);
    assert.deepEqual(newWarnings(current, draftEdit(current, {type: "addAutocorrectTypos", correction: "because", typos: [{typo: "becuase"}]}, CURRENT_CAPABILITIES)), []);
});

test("each edit is recorded in its own words", () => {
    const {document} = fixture([["the", "teh"]]);
    assert.equal(draftEditLabel({type: "addAutocorrectTypos", correction: "then", typos: [{typo: "tehn"}]}, document), "Added a replacement");
    assert.equal(draftEditLabel({type: "addAutocorrectTypos", macro: 5, typos: [{typo: "sig"}]}, document), "Added a replacement");
    assert.equal(draftEditLabel({type: "addAutocorrectTypos", correction: " the ", typos: [{typo: "hte"}]}, document), "Added an input to a replacement");
    assert.equal(draftEditLabel({type: "updateAutocorrectTypo", typo: "teh", correction: "then"}, document), "Moved an input to another replacement");
    assert.equal(draftEditLabel({type: "updateAutocorrectTypo", typo: "teh", macro: 5}, document), "Moved an input to another replacement");
    assert.equal(draftEditLabel({type: "updateAutocorrectTypo", typo: "teh", to: "teh*"}, document), "Edited an input");
    assert.equal(draftEditLabel({type: "updateAutocorrectCorrection", correction: "the", to: "The"}, document), "Changed a replacement");
    assert.equal(draftEditLabel({type: "deleteAutocorrectTypo", typo: "teh"}, document), "Removed an input");
    assert.equal(draftEditLabel({type: "deleteAutocorrectEntry", correction: "the"}, document), "Removed a replacement");
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

test("Review lists each changed entry once: added, removed, respelled or made a macro, and each input added, removed, moved or written anew", () => {
    const {profileReview} = require("../../core/model/profile-review");
    const {revertUnits} = require("../../core/model/profile-revert");
    const {UNIT} = require("../../core/model/review-units");
    const before = fixture([["the", "teh", "hte"], ["because", "becuase", "becasue"], ["gone", "goen"], ["thing", ["tihng", MATCH.ANYWHERE]], ["same", "saem"], ["signed", "sig"], [6, "addr"]], 0, {5: "Kind regards"});
    const after = fixture([["The", "teh", "hte"], ["because", "becuase", "beacuse"], ["cause", "becasue"], ["thing", ["tihng", MATCH.END]], ["new", "nwe"], ["same", "saem"], [5, "sig"], [6, "addr", "adres"]], 0, {5: "Kind regards"});
    const items = profileReview(before, after, CURRENT_CAPABILITIES).filter(item => item.area === "Text replacement");
    const brief = items.map(item => [item.title, item.status, item.unit, item.fields.map(field => [field.label, field.status, field.before, field.after])]);
    const macro = slot => entryKey({macro: slot});
    assert.deepEqual(brief, [
        ["because", "changed", UNIT.autocorrect("because"), [["Input", "removed", "becasue · moved to “cause”", null], ["Input", "added", null, "beacuse"]]],
        ["gone", "removed", UNIT.autocorrect("gone"), [["Replacement", "removed", "gone", null], ["Input", "removed", "goen", null]]],
        ["Macro “Macro 5 named”", "changed", UNIT.autocorrect("signed", macro(5)), [["Replacement", "changed", "signed", "Macro “Macro 5 named”"]]],
        ["The", "changed", UNIT.autocorrect("the", "The"), [["Replacement", "changed", "the", "The"]]],
        ["thing", "changed", UNIT.autocorrect("thing"), [["Input", "changed", "*tihng*", "*tihng"]]],
        ["Macro “Macro 6”", "changed", UNIT.autocorrect(macro(6)), [["Input", "added", null, "adres"]]],
        ["cause", "added", UNIT.autocorrect("cause"), [["Replacement", "added", null, "cause"], ["Input", "added", null, "becasue · moved from “because”"]]],
        ["new", "added", UNIT.autocorrect("new"), [["Replacement", "added", null, "new"], ["Input", "added", null, "nwe"]]],
    ]);
    assert.deepEqual(items.map(item => item.place), [{kind: "autocorrect", entry: "because"}, {kind: "autocorrect", entry: "gone"}, {kind: "autocorrect", entry: macro(5)}, {kind: "autocorrect", entry: "The"},
        {kind: "autocorrect", entry: "thing"}, {kind: "autocorrect", entry: macro(6)}, {kind: "autocorrect", entry: "cause"}, {kind: "autocorrect", entry: "new"}]);
    // Discarding one entry's change puts that entry back and leaves the rest.
    const reverted = snapshot(revertUnits(before, after, new Set([UNIT.autocorrect("the", "The")]), CURRENT_CAPABILITIES));
    assert.deepEqual(listOf(reverted).find(([correction]) => String(correction).toLowerCase() === "the"), ["the", "hte", "teh"]);
    assert.equal(profileReview(before, reverted, CURRENT_CAPABILITIES).filter(item => item.area === "Text replacement").length, 7);
    // And a replacement made a macro comes back as its text.
    const texted = snapshot(revertUnits(before, after, new Set([UNIT.autocorrect("signed", macro(5))]), CURRENT_CAPABILITIES));
    assert.deepEqual(listOf(texted).find(([, typed]) => typed === "sig"), ["signed", "sig"]);
    // Discarding them all is the keyboard's list.
    const all = snapshot(revertUnits(before, after, new Set(items.map(item => item.unit)), CURRENT_CAPABILITIES));
    assert.deepEqual(listOf(all), listOf(before));
    assert.equal(all.fingerprint, before.fingerprint);
});

test("an import adds to the list or replaces it in one step, leaving out what the list cannot take", () => {
    const {exportedList, importPreview} = require("../../core/model/autocorrect-editor");
    const {parseAutocorrectFile, starterFile} = require("../../core/model/autocorrect-import");
    const current = fixture([["the", "teh"], ["then", "tehn"]]);
    const entries = [{correction: "the", typos: [{typo: "hte"}, {typo: "teh"}]}, {correction: "ten", typos: [{typo: "tehn"}]}, {correction: "thing", typos: [{typo: "Tihng", match: MATCH.ANYWHERE}]},
        {correction: "receive", typos: [{typo: "recieve*"}]}, {macro: 5, typos: [{typo: "sig"}]}];
    const added = edit(current, {type: "importAutocorrect", mode: "add", entries, expectedFingerprint: current.fingerprint});
    assert.deepEqual(listOf(added), [["receive", ["recieve", MATCH.START]], ["the", "hte", "teh"], ["then", "tehn"], ["thing", ["tihng", MATCH.ANYWHERE]], [5, "sig"]]);
    const replaced = edit(current, {type: "importAutocorrect", mode: "replace", entries});
    assert.deepEqual(listOf(replaced), [["receive", ["recieve", MATCH.START]], ["ten", "tehn"], ["the", "hte", "teh"], ["thing", ["tihng", MATCH.ANYWHERE]], [5, "sig"]]);
    assert.deepEqual(listOf(edit(current, {type: "importAutocorrect", mode: "replace", entries: []})), [], "replacing with nothing empties the list");
    // Past the keyboard's ceilings, what fits is kept and the rest left out.
    assert.deepEqual(listOf(edit(current, {type: "importAutocorrect", mode: "add", entries}, {...CURRENT_CAPABILITIES, maxAutocorrectTypos: 3})), [["the", "hte", "teh"], ["then", "tehn"]]);
    says(() => edit(current, {type: "importAutocorrect", mode: "merge", entries}), /add to the list or replace it/, "AUTOCORRECT_EDIT_REFUSED");
    says(() => edit(current, {type: "importAutocorrect", mode: "add", entries: [{correction: "the", typos: [{typo: 7}]}]}), /not a text replacement list/);
    says(() => edit(current, {type: "importAutocorrect", mode: "add", entries: [{macro: "five", typos: [{typo: "sig"}]}]}), /not a text replacement list/);
    says(() => edit(current, {type: "importAutocorrect", mode: "add", entries: [null]}), /not a text replacement list/);
    assert.equal(draftEditLabel({type: "importAutocorrect", mode: "add", entries}, current.document), "Added to the text replacement list");
    assert.equal(draftEditLabel({type: "importAutocorrect", mode: "replace", entries}, current.document), "Replaced the text replacement list");

    // The preview says what each choice would do, and its entries are what the edit takes.
    const preview = importPreview(current, parseAutocorrectFile(":hte: -> the\n:tehn: -> ten\ntihng -> thing\n", "in.txt"), CURRENT_CAPABILITIES);
    assert.deepEqual([preview.add.replacements, preview.add.inputs, preview.add.refused.length, preview.replace.replacements, preview.replace.removed], [3, 4, 1, 3, 2]);
    assert.deepEqual(listOf(edit(current, {type: "importAutocorrect", mode: "add", entries: preview.entries})), [["the", "hte", "teh"], ["then", "tehn"], ["thing", ["tihng", MATCH.ANYWHERE]]]);
    const starter = importPreview(fixture([]), starterFile(), CURRENT_CAPABILITIES);
    assert.equal(starter.format, "starter");
    assert.deepEqual([starter.add.refused, starter.add.unfit], [[], 0]);
    assert.equal(validateSnapshot(edit(fixture([]), {type: "importAutocorrect", mode: "add", entries: starter.entries}).document).autocorrect.entries.length, starter.add.replacements);

    // The list as a file, named by the day and the format.
    const day = new Date("2026-11-10T08:00:00Z");
    assert.deepEqual(exportedList(current, "txt", day), {fileName: "charybdis-text-replacements-2026-11-10.txt", text: ":teh: -> the\n:tehn: -> then\n", mime: "text/plain"});
    assert.deepEqual([exportedList(current, "csv", day).fileName, exportedList(current, "csv", day).mime], ["charybdis-text-replacements-2026-11-10.csv", "text/csv"]);
    assert.deepEqual([exportedList(current, "json", day).fileName, exportedList(current, "json", day).mime], ["charybdis-text-replacements-2026-11-10.json", "application/json"]);
});

test("Review warns once of the replacements the host layout cannot type, and of each that plays an empty macro; a list that does neither has no check", () => {
    const {profileFindings} = require("../../core/model/profile-checks");
    const untypable = entries => profileFindings(validateSnapshot(fixture(entries).document)).filter(finding => finding.kind === "untypableAutocorrect");
    assert.deepEqual(untypable([["the", "teh"], ["iPhone", "iphone"]]), []);
    const [finding, ...more] = untypable([["über", "ueber"], ["straße", "strasse"], ["the", "teh"], ["a", "ä"]]);
    assert.deepEqual(more, []);
    assert.deepEqual({level: finding.level, count: finding.count, title: finding.title, place: finding.place},
        {level: "warning", count: 3, title: "3 text replacements will not fire on US", place: {kind: "autocorrect", entry: "a"}});
    assert.match(finding.detail, /US cannot type a character in “a”, “straße”, “über”\. The keyboard stores them and skips them\./);
    assert.deepEqual(profileFindings(validateSnapshot(fixture([["über", "ueber"]], GERMAN).document)).filter(row => row.kind === "untypableAutocorrect"), []);
    assert.equal(untypable([["über", "ueber"]])[0].title, "1 text replacement will not fire on US");
    // A replacement whose macro has no steps is a finding of its own, as a
    // pointing mode that runs an empty macro is; one with steps is none.
    const inert = profileFindings(validateSnapshot(fixture([[5, "sig"], [6, "addr"], ["the", "teh"]], 0, {5: "Kind regards"}).document)).filter(finding => finding.kind === "inertAutocorrectMacro");
    assert.deepEqual(inert.map(({level, title, fix, place}) => ({level, title, fix, place})), [{level: "warning", title: "A text replacement plays empty macro 6",
        fix: "Add steps in Macros, or choose another replacement.", place: {kind: "autocorrect", entry: entryKey({macro: 6})}}]);
});

// Try it (firmware autocorrect-v1.md): the draft's list and host layout run
// over text as the keyboard would, with the Caps Lock the box is given.
test("text is tried against the snapshot's list on its host layout, after text already there", () => {
    const current = fixture([["the", "teh", "hte"], ["straße", "strasse"], ["iPhone", "iphone"]]);
    assert.deepEqual(tryText(current, {before: "", typed: "teh Hte ", capsLock: false}), {text: "the The ", fired: [{entry: "the", correction: "the", typo: "teh"}, {entry: "the", correction: "the", typo: "hte"}],
        marks: [{entry: "the", correction: "the", typo: "teh", start: 0, end: 3}, {entry: "the", correction: "the", typo: "hte", start: 4, end: 7}], undone: false});
    assert.deepEqual(tryText(current, {before: "teh ", typed: "teh \b", capsLock: false}), {text: "teh teh", fired: [], marks: [], undone: true}, "what was there is not typing; Backspace undoes");
    assert.equal(tryText(current, {before: "ab", typed: "\b\bteh ", capsLock: false}).text, "teh ", "Backspace into text the keyboard did not see suspends the word");
    assert.equal(tryText(current, {before: "", typed: "strasse ", capsLock: false}).text, "strasse ", "US cannot type ß");
    assert.equal(tryText(fixture([["straße", "strasse"]], GERMAN), {before: "", typed: "strasse ", capsLock: false}).text, "straße ");
    // The host's system is macOS here (hostOs detected 1): Caps Lock types no small letter.
    assert.equal(tryText(current, {before: "", typed: "IPHONe ", capsLock: true}).text, "IPHONe ");
    const windows = {...current, hostOs: {detected: 2}};
    windows.document = fixtureWith(current.document, 0);
    assert.equal(tryText(windows, {before: "", typed: "IPHONe ", capsLock: true}).text, "iPhone ");
});

test("a try plays a replacement's macro: its text when it is only text, nothing shown when it is more, and not at all when it is empty", () => {
    const current = fixture([[5, "sig"], [6, "addr"], [7, "win"], ["the", "teh"]], 0, {5: "Kind regards", 7: "{KC_A}"});
    const tried = tryText(current, {before: "", typed: "sig addr teh ", capsLock: false});
    assert.equal(tried.text, "Kind regards addr the ", "the empty macro is passed over");
    assert.deepEqual(tried.fired, [{entry: entryKey({macro: 5}), correction: "", typo: "sig", macro: 5}, {entry: "the", correction: "the", typo: "teh"}]);
    const keys = tryText(current, {before: "", typed: "win ", capsLock: false});
    assert.deepEqual([keys.text, keys.fired.map(fired => fired.macro)], [" ", [7]], "a macro of keys has no text to show");
    assert.equal(tryText(current, {before: "", typed: "sig \b", capsLock: false}).undone, false, "a macro has no undo");
});

test("a try is bounded and refuses what is not text", () => {
    const current = fixture([["the", "teh"]]);
    says(() => tryText(current, {before: "", typed: "x".repeat(TRY_TEXT_MAX + 1), capsLock: false}), /too long to try/, "AUTOCORRECT_TRY_REFUSED");
    says(() => tryText(current, {before: 4, typed: "teh ", capsLock: false}), /text/, "AUTOCORRECT_TRY_REFUSED");
    says(() => tryText(current, {before: "", typed: "teh ", capsLock: "yes"}), /Caps Lock/, "AUTOCORRECT_TRY_REFUSED");
});
