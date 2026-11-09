"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {addTypos, changeTypo, findTypo, firingTypo, listUsage, listWarnings, removeEntry, removeTypo, respellCorrection, wordsOf, WARNING} = require("../../core/model/autocorrect-list");
const {AUTOCORRECT_MATCH: MATCH, encodeAutocorrectDomain, autocorrectDomainSize} = require("../../core/schema/autocorrect-domain-v1");
const {hostLayouts, US_HOST_LAYOUT} = require("../../core/data/host-layouts");

const US = {layout: US_HOST_LAYOUT};
const list = (...entries) => ({entries: entries.map(([correction, ...typos]) => ({correction, typos: typos.map(typo => typeof typo === "string" ? {typo, match: MATCH.WHOLE_WORD} : {typo: typo[0], match: typo[1]})}))});
const says = (fn, pattern, code = "AUTOCORRECT_EDIT_REFUSED") => assert.throws(fn, error => error.code === code && pattern.test(error.message), String(pattern));
const shape = value => value.entries.map(entry => [entry.correction, ...entry.typos.map(typo => typo.match ? [typo.typo, typo.match] : typo.typo)]);

test("a correction is added with its first typos, and typing one that exists adds to it, never a second copy", () => {
    const value = list();
    addTypos(value, "because", [{typo: "becuase"}, {typo: "becasue"}], US);
    assert.deepEqual(shape(value), [["because", "becuase", "becasue"]]);
    addTypos(value, "because", [{typo: "beacuse"}], US);
    assert.deepEqual(shape(value), [["because", "becuase", "becasue", "beacuse"]], "the same correction, stored once");
    addTypos(value, "thing", [{typo: "tihng", match: MATCH.ANYWHERE}], US);
    assert.deepEqual(shape(value)[1], ["thing", ["tihng", MATCH.ANYWHERE]]);
    assert.doesNotThrow(() => encodeAutocorrectDomain(value));
});

test("a typo is trimmed and stored folded; a correction is kept as written", () => {
    const value = list();
    addTypos(value, "  iPhone ", [{typo: " IPhone "}], US);
    assert.deepEqual(shape(value), [["iPhone", "iphone"]]);
    assert.equal(findTypo(value, "IPHONE")?.entry.correction, "iPhone", "a typo is found whatever its case");
});

test("each refusal says what is wrong in plain words", () => {
    const value = list(["the", "teh"]);
    says(() => addTypos(value, "", [{typo: "x"}], US), /Type the correction/);
    says(() => addTypos(value, "then", [], US), /at least one typo/);
    says(() => addTypos(value, "then", [{typo: " "}], US), /Type a typo/);
    says(() => addTypos(value, "then", [{typo: "the-n"}], US), /letters and digits.*“-”/);
    says(() => addTypos(value, "then", [{typo: "'then"}], US), /apostrophe/);
    says(() => addTypos(value, "then", [{typo: "then"}], US), /“then” is the correction itself/);
    says(() => addTypos(value, "ten", [{typo: "teh"}], US), /“teh” already corrects to “the”/);
    says(() => addTypos(value, "the", [{typo: "TEH"}], US), /“teh” is already a typo of “the”/);
    says(() => addTypos(value, "then", [{typo: "tehn"}, {typo: "Tehn"}], US), /“tehn” is there twice/);
    says(() => addTypos(value, "a".repeat(33), [{typo: "x"}], US), /at most 32 bytes/);
    says(() => addTypos(value, "then", [{typo: "é".repeat(17)}], {layout: hostLayouts().find(layout => layout.slug === "windows-german").id}), /at most 32 bytes/);
    says(() => addTypos(value, "a\tb", [{typo: "ab"}], US), /cannot hold/);
    says(() => addTypos(value, "then", [{typo: "tehn", match: 7}], US), /where it matches/);
    assert.deepEqual(shape(value), [["the", "teh"]], "a refused edit changes nothing");
});

test("an entry the chosen layout cannot type is refused when it is added or edited", () => {
    const german = {layout: hostLayouts().find(layout => layout.slug === "windows-german").id, layoutName: "German (Windows)"};
    const value = list();
    says(() => addTypos(value, "über", [{typo: "ueber"}], {...US, layoutName: "US"}), /US cannot type “ü”/);
    says(() => addTypos(value, "uber", [{typo: "über"}], {...US, layoutName: "US"}), /US cannot type “ü”/);
    addTypos(value, "über", [{typo: "ueber"}], german);
    assert.deepEqual(shape(value), [["über", "ueber"]]);
    says(() => respellCorrection(value, "über", "übér", {...US, layoutName: "US"}), /US cannot type/);
    says(() => changeTypo(value, "ueber", {to: "üeber"}, {...US, layoutName: "US"}), /US cannot type “ü”/);
    // What was already in the list is only warned about.
    assert.doesNotThrow(() => changeTypo(value, "ueber", {match: MATCH.START}, {...US, layoutName: "US"}));
});

test("a correction is respelled where it stands, and respelling it to one that exists joins the two", () => {
    const value = list(["teh", "hte"], ["then", "tehn"]);
    says(() => respellCorrection(value, "nope", "x", US), /no longer in the list/);
    respellCorrection(value, "teh", "the", US);
    assert.deepEqual(shape(value), [["the", "hte"], ["then", "tehn"]]);
    says(() => respellCorrection(value, "the", "hte", US), /“hte” is one of its typos/);
    respellCorrection(value, "then", "the", US);
    assert.deepEqual(shape(value), [["the", "hte", "tehn"]]);
});

test("a typo is respelled, matched elsewhere or moved to another correction, new or not", () => {
    const value = list(["the", "teh", "hte"], ["then", "tehn"]);
    changeTypo(value, "teh", {to: "Tthe"}, US);
    changeTypo(value, "tthe", {match: MATCH.START}, US);
    assert.deepEqual(shape(value)[0], ["the", ["tthe", MATCH.START], "hte"]);
    says(() => changeTypo(value, "hte", {to: "tehn"}, US), /“tehn” already corrects to “then”/);
    says(() => changeTypo(value, "hte", {to: "the"}, US), /is the correction itself/);
    says(() => changeTypo(value, "gone", {match: MATCH.END}, US), /no longer in the list/);
    changeTypo(value, "hte", {correction: "then"}, US);
    assert.deepEqual(shape(value), [["the", ["tthe", MATCH.START]], ["then", "tehn", "hte"]]);
    changeTypo(value, "tthe", {correction: "three"}, US);
    assert.deepEqual(shape(value), [["then", "tehn", "hte"], ["three", ["tthe", MATCH.START]]], "its last typo gone, the entry goes; a new correction is made");
    says(() => changeTypo(value, "hte", {correction: "hte"}, US), /is the correction itself/);
});

test("removing a correction's last typo removes the entry; removing an entry removes its typos", () => {
    const value = list(["the", "teh", "hte"], ["then", "tehn"]);
    removeTypo(value, "TEH");
    assert.deepEqual(shape(value), [["the", "hte"], ["then", "tehn"]]);
    removeTypo(value, "hte");
    assert.deepEqual(shape(value), [["then", "tehn"]]);
    says(() => removeTypo(value, "hte"), /no longer in the list/);
    says(() => removeEntry(value, "the"), /no longer in the list/);
    removeEntry(value, "then");
    assert.deepEqual(shape(value), []);
});

test("usage counts what the keyboard stores: corrections, typos, text and the domain's bytes", () => {
    const value = list(["the", "teh", "hte"], ["thing", ["tihng", MATCH.ANYWHERE]], ["café", "cafe"]);
    assert.deepEqual(listUsage(value), {corrections: 3, typos: 4, textBytes: 3 + 5 + 5 + 3 + 3 + 5 + 4, bytes: autocorrectDomainSize(value)});
    assert.equal(listUsage(value).bytes, encodeAutocorrectDomain(value).length);
    assert.deepEqual(listUsage(list()), {corrections: 0, typos: 0, textBytes: 0, bytes: 8});
});

test("a text's words are its letters and digits with apostrophes between them, folded", () => {
    assert.deepEqual(wordsOf("Don't do 'that' a-lot, OK?"), ["don't", "do", "that", "a", "lot", "ok"]);
    assert.deepEqual(wordsOf("iPhone 15"), ["iphone", "15"]);
    assert.deepEqual(wordsOf(" - "), []);
});

test("the typo that fires on a word: the whole word first, then the longest part of it", () => {
    const value = list(["the", "teh"], ["thing", ["tihng", MATCH.ANYWHERE]], ["un", ["nu", MATCH.START]], ["ment", ["mnet", MATCH.END]], ["tehx", ["tehs", MATCH.START]], ["long", ["tihngs", MATCH.END]]);
    assert.equal(firingTypo(value, "teh")?.typo.typo, "teh");
    assert.equal(firingTypo(value, "tehs")?.typo.typo, "tehs", "a part-of-word typo matches a whole word too");
    assert.deepEqual(firingTypo(value, "sometihng"), {entry: value.entries[1], typo: value.entries[1].typos[0], start: 4, end: 9});
    assert.equal(firingTypo(value, "tihngs")?.typo.typo, "tihngs", "the longest typo wins");
    assert.equal(firingTypo(value, "nuclear")?.typo.typo, "nu");
    assert.equal(firingTypo(value, "menu"), null, "a start-of-word typo does not match the end");
    assert.equal(firingTypo(value, "paymnet")?.typo.typo, "mnet");
    assert.equal(firingTypo(value, "mnets"), null, "an end-of-word typo does not match the start");
    assert.equal(firingTypo(value, "tehe"), null, "a whole-word typo matches nothing longer");
    assert.equal(firingTypo(value, "the"), null);
});

test("warnings are found on the list and never refuse it", () => {
    const german = hostLayouts().find(layout => layout.slug === "windows-german").id;
    const value = list(["über", "ueber"], ["straße", "strasse"], ["the", "teh"]);
    assert.deepEqual(listWarnings(value, {layout: german, layoutName: "German (Windows)"}), []);
    const untypable = listWarnings(value, {layout: US_HOST_LAYOUT, layoutName: "US"});
    assert.deepEqual(untypable.map(({kind, correction, typo}) => ({kind, correction, typo})), [
        {kind: WARNING.UNTYPABLE, correction: "über", typo: undefined}, {kind: WARNING.UNTYPABLE, correction: "straße", typo: undefined}]);
    assert.match(untypable[0].text, /US cannot type “ü”, so this entry will not fire/);

    const chained = listWarnings(list(["b", "a"], ["c", "b"]), US);
    assert.deepEqual(chained.map(({kind, correction}) => [kind, correction]), [[WARNING.CHAIN, "b"]]);
    assert.match(chained[0].text, /“b” is itself a typo, corrected to “c”/);
    const loop = listWarnings(list(["b", "a"], ["a", "b"]), US);
    assert.deepEqual(loop.map(({kind, correction}) => [kind, correction]), [[WARNING.LOOP, "b"], [WARNING.LOOP, "a"]]);
    assert.match(loop[0].text, /“a” and “b” correct to each other/);

    const parts = listWarnings(list(["the", ["teh", MATCH.ANYWHERE]], ["their", "thier"], ["no", ["on", MATCH.END]], ["button", "buton"]), US);
    assert.deepEqual(parts.map(({kind, typo}) => [kind, typo]), [[WARNING.SHORT_PART, "teh"], [WARNING.SHORT_PART, "on"], [WARNING.INSIDE_CORRECTION, "on"]]);
    assert.match(parts[0].text, /shorter than four letters/);
    assert.match(parts[2].text, /“on” also matches inside the correction “button”/);
    assert.deepEqual(listWarnings(list(["something", ["tihng", MATCH.ANYWHERE]]), US), [], "a long part-of-word typo that matches no correction is fine");
    assert.deepEqual(listWarnings(list(["iPhone", "iphone"]), US), [], "a typo that is its correction in other capitals changes nothing typed right");
    assert.deepEqual(listWarnings(list(["thee", ["the", MATCH.START]]), US).map(({kind}) => kind), [WARNING.SHORT_PART, WARNING.INSIDE_CORRECTION], "a part-of-word typo inside its own correction");
});

test("two lists' entries pair by correction, a respelled entry with the one that took its typos", () => {
    const {pairEntries} = require("../../core/model/autocorrect-list");
    const before = list(["the", "teh", "hte"], ["because", "becuase"], ["gone", "goen"]);
    const after = list(["The", "teh", "hte", "tthe"], ["because", "becuase", "becasue"], ["new", "nwe"]);
    assert.deepEqual(pairEntries(before, after).map(pair => [pair.before?.correction, pair.after?.correction]),
        [["the", "The"], ["because", "because"], ["gone", undefined], [undefined, "new"]]);
    // An entry whose typos were split goes with the larger share.
    const split = pairEntries(list(["the", "teh", "hte", "tthe"]), list(["then", "teh"], ["The", "hte", "tthe"]));
    assert.deepEqual(split.map(pair => [pair.before?.correction, pair.after?.correction]), [["the", "The"], [undefined, "then"]]);
    assert.deepEqual(pairEntries(list(), list()), []);
});

test("an entry is put back with its typos, each taken from wherever it went, in either direction", () => {
    const {restoreEntry} = require("../../core/model/autocorrect-list");
    const theirs = list(["the", "teh", "hte"], ["then", "tehn"]);
    const moved = list(["the", "teh"], ["then", "tehn", "hte"]);
    restoreEntry(moved, theirs, "the");
    assert.deepEqual(shape(moved), [["then", "tehn"], ["the", "teh", "hte"]]);
    const respelled = list(["The", "teh", "hte"], ["then", "tehn"]);
    restoreEntry(respelled, theirs, "the", "The");
    assert.deepEqual(shape(respelled), [["then", "tehn"], ["the", "teh", "hte"]]);
    // The same unit the other way: the respelling comes back.
    const back = list(["the", "teh", "hte"], ["then", "tehn"]);
    restoreEntry(back, list(["The", "teh", "hte"], ["then", "tehn"]), "the", "The");
    assert.deepEqual(shape(back), [["then", "tehn"], ["The", "teh", "hte"]]);
    const added = list(["the", "teh", "hte"], ["then", "tehn"], ["new", "nwe"]);
    restoreEntry(added, theirs, "new");
    assert.deepEqual(shape(added), [["the", "teh", "hte"], ["then", "tehn"]]);
    const removed = list(["then", "tehn"]);
    restoreEntry(removed, theirs, "the");
    assert.deepEqual(shape(removed), [["then", "tehn"], ["the", "teh", "hte"]]);
    // A typo that became its own entry elsewhere empties that entry.
    const stolen = list(["thee", "teh", "hte"], ["then", "tehn"]);
    restoreEntry(stolen, theirs, "the");
    assert.deepEqual(shape(stolen), [["then", "tehn"], ["the", "teh", "hte"]]);
});
