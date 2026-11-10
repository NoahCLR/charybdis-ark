"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {addTypos, changeReplacement, changeTypo, findEntry, findTypo, listUsage, listWarnings, removeEntry, removeTypo, replacementCalled, replacementSaid, splitInputs, inputForm, inputOf, WARNING} = require("../../core/model/autocorrect-list");
const {AUTOCORRECT_MATCH: MATCH, encodeAutocorrectDomain, autocorrectDomainSize, entryKey} = require("../../core/schema/autocorrect-domain-v1");
const {hostLayouts, US_HOST_LAYOUT} = require("../../core/data/host-layouts");

const US = {layout: US_HOST_LAYOUT};
// A list from rows: a replacement's text, or a number for the macro slot it
// plays, then its inputs, each its letters or [letters, match].
const list = (...entries) => ({entries: entries.map(([correction, ...typos]) => ({...(typeof correction === "number" ? {correction: "", macro: correction} : {correction}),
    typos: typos.map(typo => typeof typo === "string" ? {typo, match: MATCH.WHOLE_WORD} : {typo: typo[0], match: typo[1]})}))});
const says = (fn, pattern, code = "AUTOCORRECT_EDIT_REFUSED") => assert.throws(fn, error => error.code === code && pattern.test(error.message), String(pattern));
const shape = value => value.entries.map(entry => [entry.macro ?? entry.correction, ...entry.typos.map(typo => typo.match ? [typo.typo, typo.match] : typo.typo)]);
const text = correction => ({correction});

test("a replacement is added with what is first typed for it, and one that exists is added to, never a second copy", () => {
    const value = list();
    addTypos(value, text("because"), [{typo: "becuase"}, {typo: "becasue"}], US);
    assert.deepEqual(shape(value), [["because", "becuase", "becasue"]]);
    addTypos(value, text("because"), [{typo: "beacuse"}], US);
    assert.deepEqual(shape(value), [["because", "becuase", "becasue", "beacuse"]], "the same replacement, stored once");
    addTypos(value, text("thing"), [{typo: "*tihng*"}], US);
    assert.deepEqual(shape(value)[1], ["thing", ["tihng", MATCH.ANYWHERE]]);
    assert.doesNotThrow(() => encodeAutocorrectDomain(value));
});

test("an input is trimmed and stored folded; a replacement is kept as written, and may be any line of text", () => {
    const value = list();
    addTypos(value, text("  iPhone "), [{typo: " IPhone "}], US);
    assert.deepEqual(shape(value), [["iPhone", "iphone"]]);
    assert.equal(findTypo(value, "IPHONE")?.entry.correction, "iPhone", "an input is found whatever its case");
    assert.equal(findTypo(value, "*iphone*")?.entry.correction, "iPhone", "and however it is written");
    addTypos(value, text("+31 6 1234 5678"), [{typo: "pnumber"}], US);
    addTypos(value, text("Kind regards, Sam Example | sam@example.com"), [{typo: "sigoff"}], US);
    assert.deepEqual(shape(value).slice(1), [["+31 6 1234 5678", "pnumber"], ["Kind regards, Sam Example | sam@example.com", "sigoff"]]);
    addTypos(value, text("x".repeat(128)), [{typo: "long"}], US);
    assert.doesNotThrow(() => encodeAutocorrectDomain(value));
});

test("an input is a whole word unless it is written with * where other letters may go", () => {
    assert.deepEqual(inputOf("pnumber"), {typo: "pnumber", match: MATCH.WHOLE_WORD});
    assert.deepEqual(inputOf("Recieve*"), {typo: "recieve", match: MATCH.START});
    assert.deepEqual(inputOf("*mnet"), {typo: "mnet", match: MATCH.END});
    assert.deepEqual(inputOf(" *tihng* "), {typo: "tihng", match: MATCH.ANYWHERE});
    for (const typed of ["pnumber", "recieve*", "*mnet", "*tihng*", "dosen't"]) assert.equal(inputForm(inputOf(typed)), typed, "written back as it was typed");
    says(() => inputOf("re*cieve"), /“re\*cieve” has \* where it cannot go.*only at the start or the end/);
    says(() => inputOf("*"), /“\*” has no letters/);
    says(() => inputOf("**"), /“\*\*” has no letters/);
    says(() => inputOf("**teh"), /has \* where it cannot go/);
    says(() => inputOf("teh**"), /has \* where it cannot go/);
    says(() => inputOf("te h*"), /one word.*a space is neither/);
    const value = list(["the", "teh"]);
    addTypos(value, text("receive"), [{typo: "recieve*"}], US);
    changeTypo(value, "recieve", "*recieve", US);
    assert.deepEqual(shape(value)[1], ["receive", ["recieve", MATCH.END]], "its * is changed where it stands");
    changeTypo(value, "recieve", "recieve", US);
    assert.deepEqual(shape(value)[1], ["receive", "recieve"]);
    // An older file's match stands for a form written without *.
    addTypos(value, text("thing"), [{typo: "tihng", match: MATCH.ANYWHERE}], US);
    assert.deepEqual(shape(value)[2], ["thing", ["tihng", MATCH.ANYWHERE]]);
    says(() => addTypos(value, text("thing"), [{typo: "thnig", match: 7}], US), /Ark cannot tell where “thnig” goes in a word\. Write it with \* where other letters may go/);
});

test("a replacement may play a macro: named by its slot, for whole words only, beside text or in its place", () => {
    const value = list(["the", "teh"]);
    addTypos(value, {macro: 5}, [{typo: "Sig"}], US);
    addTypos(value, {macro: 5}, [{typo: "sgi"}], US);
    assert.deepEqual(shape(value), [["the", "teh"], [5, "sig", "sgi"]]);
    assert.deepEqual(findEntry(value, {macro: 5}), {correction: "", macro: 5, typos: [{typo: "sig", match: 0}, {typo: "sgi", match: 0}]});
    assert.equal(findEntry(value, entryKey({macro: 5}))?.macro, 5, "found by its key too");
    assert.doesNotThrow(() => encodeAutocorrectDomain(value));
    says(() => addTypos(value, {macro: 5}, [{typo: "sig*"}], US), /A macro plays for a whole word only: take the \* out of “sig\*”/);
    says(() => addTypos(value, {macro: 128}, [{typo: "x"}], US), /Choose one of the keyboard's macros/);
    says(() => addTypos(value, {macro: 5, correction: "both"}, [{typo: "x"}], US), /text or a macro, not both/);
    says(() => addTypos(value, {macro: 6}, [{typo: "sig"}], {...US, macroNames: Object.assign([], {5: "Sign-off"})}), /“sig” is already an input for the macro “Sign-off”/);
    // Text made a macro, a macro made text, and a macro changed for another.
    changeReplacement(value, text("the"), {macro: 9}, US);
    assert.deepEqual(shape(value), [[9, "teh"], [5, "sig", "sgi"]]);
    changeReplacement(value, {macro: 9}, text("the"), US);
    changeReplacement(value, {macro: 5}, {macro: 7}, US);
    assert.deepEqual(shape(value), [["the", "teh"], [7, "sig", "sgi"]]);
    // Changed to a macro the list has, the two join; a form with * cannot follow.
    addTypos(value, {macro: 8}, [{typo: "addr"}], US);
    changeReplacement(value, {macro: 8}, {macro: 7}, US);
    assert.deepEqual(shape(value), [["the", "teh"], [7, "sig", "sgi", "addr"]]);
    changeTypo(value, "teh", "teh*", US);
    says(() => changeReplacement(value, text("the"), {macro: 3}, US), /take the \* out of “teh\*” first/);
    says(() => changeTypo(value, "sig", "*sig", US), /A macro plays for a whole word only/);
    removeEntry(value, {macro: 7}, US);
    says(() => removeEntry(value, {macro: 7}, US), /the macro “Macro 7” is no longer in the list/);
    assert.deepEqual(shape(value), [["the", ["teh", MATCH.START]]]);
});

test("a replacement has one name wherever it is listed, and one inside a sentence; a field's text is its inputs, split at spaces", () => {
    const names = Object.assign([], {5: "Sign-off"});
    assert.equal(replacementCalled({correction: "because"}, names), "because");
    assert.equal(replacementCalled({correction: "", macro: 5}, names), "Sign-off");
    assert.equal(replacementCalled({macro: 6}, names), "Macro 6", "a macro with no name by what Macros calls it");
    assert.equal(replacementCalled({macro: 6}), "Macro 6");
    assert.equal(replacementSaid({correction: "because"}, names), "“because”");
    assert.equal(replacementSaid({macro: 5}, names), "the macro “Sign-off”");
    assert.deepEqual(splitInputs("  teh   hte\trecieve* "), ["teh", "hte", "recieve*"]);
    assert.deepEqual(splitInputs("teh,hte"), ["teh,hte"], "a comma is no space: the input it leaves is refused for it");
    assert.deepEqual([splitInputs(""), splitInputs(undefined)], [[], []]);
});

test("each refusal says what is wrong in plain words", () => {
    const value = list(["the", "teh"]);
    says(() => addTypos(value, text(""), [{typo: "x"}], US), /Type the replacement/);
    says(() => addTypos(value, text("then"), [], US), /A replacement needs at least one input/);
    says(() => addTypos(value, text("then"), [{typo: " "}], US), /Type an input/);
    says(() => addTypos(value, text("then"), [{typo: "the-n"}], US), /An input is one word: letters and digits.*“-”/);
    says(() => addTypos(value, text("then"), [{typo: "the,n"}], US), /“,” is neither/);
    says(() => addTypos(value, text("then"), [{typo: "'then"}], US), /An input may hold an apostrophe only between/);
    says(() => addTypos(value, text("then"), [{typo: "then"}], US), /“then” is the replacement itself/);
    says(() => addTypos(value, text("ten"), [{typo: "teh"}], US), /“teh” is already an input for “the”/);
    says(() => addTypos(value, text("the"), [{typo: "TEH"}], US), /“teh” is already an input for “the”/);
    says(() => addTypos(value, text("then"), [{typo: "tehn"}, {typo: "Tehn"}], US), /“tehn” is there twice/);
    says(() => addTypos(value, text("a".repeat(129)), [{typo: "x"}], US), /at most 128 bytes of text.*Use a macro for something longer/);
    says(() => addTypos(value, text("then"), [{typo: "a".repeat(33)}], US), /An input is at most 32 bytes/);
    says(() => addTypos(value, text("then"), [{typo: "é".repeat(17)}], {layout: hostLayouts().find(layout => layout.slug === "windows-german").id}), /at most 32 bytes/);
    says(() => addTypos(value, text("a\tb"), [{typo: "ab"}], US), /one line of text.*Use a macro for more than one line/);
    says(() => addTypos(value, text("two\nlines"), [{typo: "ab"}], US), /one line of text/);
    says(() => addTypos(value, text("then"), [{typo: "tehn", match: 7}], US), /Ark cannot tell where “tehn” goes/);
    assert.deepEqual(shape(value), [["the", "teh"]], "a refused edit changes nothing");
});

test("an entry the chosen layout cannot type is refused when it is added or edited", () => {
    const german = {layout: hostLayouts().find(layout => layout.slug === "windows-german").id, layoutName: "German (Windows)"};
    const value = list();
    says(() => addTypos(value, text("über"), [{typo: "ueber"}], {...US, layoutName: "US"}), /US cannot type “ü”/);
    says(() => addTypos(value, text("uber"), [{typo: "über"}], {...US, layoutName: "US"}), /US cannot type “ü”/);
    addTypos(value, text("über"), [{typo: "ueber"}], german);
    assert.deepEqual(shape(value), [["über", "ueber"]]);
    says(() => changeReplacement(value, text("über"), text("übér"), {...US, layoutName: "US"}), /US cannot type/);
    says(() => changeTypo(value, "ueber", "üeber", {...US, layoutName: "US"}), /US cannot type “ü”/);
    // What was already in the list is only warned about.
    assert.doesNotThrow(() => changeTypo(value, "ueber", "ueber*", {...US, layoutName: "US"}));
    changeTypo(value, "ueber", "ueber", {...US, layoutName: "US"});
    // A macro is not typed through the layout.
    assert.doesNotThrow(() => changeReplacement(value, text("über"), {macro: 1}, {...US, layoutName: "US"}));
});

test("a replacement is respelled where it stands, and respelling it to one that exists joins the two", () => {
    const value = list(["teh", "hte"], ["then", "tehn"]);
    says(() => changeReplacement(value, text("nope"), text("x"), US), /“nope” is no longer in the list/);
    changeReplacement(value, text("teh"), text("the"), US);
    assert.deepEqual(shape(value), [["the", "hte"], ["then", "tehn"]]);
    says(() => changeReplacement(value, text("the"), text("hte"), US), /“hte” is one of its inputs/);
    changeReplacement(value, text("then"), text("the"), US);
    assert.deepEqual(shape(value), [["the", "hte", "tehn"]]);
});

test("an input is written anew where it is, with or without *", () => {
    const value = list(["the", "teh", "hte"], ["then", "tehn"]);
    changeTypo(value, "teh", "Tthe", US);
    changeTypo(value, "tthe", "tthe*", US);
    assert.deepEqual(shape(value)[0], ["the", ["tthe", MATCH.START], "hte"]);
    says(() => changeTypo(value, "hte", "tehn", US), /“tehn” is already an input for “then”/);
    says(() => changeTypo(value, "hte", "the", US), /is the replacement itself/);
    says(() => changeTypo(value, "gone", "*gone", US), /no longer in the list/);
    says(() => changeTypo(value, "hte", " ", US), /Type an input/);
    assert.deepEqual(shape(value), [["the", ["tthe", MATCH.START], "hte"], ["then", "tehn"]], "it stays with its replacement");
});

test("removing a replacement's last input removes the entry; removing an entry removes its inputs", () => {
    const value = list(["the", "teh", "hte"], ["then", "tehn"]);
    removeTypo(value, "TEH");
    assert.deepEqual(shape(value), [["the", "hte"], ["then", "tehn"]]);
    removeTypo(value, "hte");
    assert.deepEqual(shape(value), [["then", "tehn"]]);
    says(() => removeTypo(value, "hte"), /no longer in the list/);
    says(() => removeEntry(value, text("the"), US), /no longer in the list/);
    removeEntry(value, text("then"), US);
    assert.deepEqual(shape(value), []);
});

test("usage counts what the keyboard stores: replacements, inputs, text and the domain's bytes", () => {
    const value = list(["the", "teh", "hte"], ["thing", ["tihng", MATCH.ANYWHERE]], ["café", "cafe"]);
    assert.deepEqual(listUsage(value), {corrections: 3, typos: 4, textBytes: 3 + 5 + 5 + 3 + 3 + 5 + 4, bytes: autocorrectDomainSize(value)});
    // A macro replacement has a row and no text of its own.
    const played = list(["the", "teh"], [5, "sig"]);
    assert.deepEqual(listUsage(played), {corrections: 2, typos: 2, textBytes: 3 + 3 + 3, bytes: 8 + 6 * 4 + 9});
    assert.equal(listUsage(value).bytes, encodeAutocorrectDomain(value).length);
    assert.deepEqual(listUsage(list()), {corrections: 0, typos: 0, textBytes: 0, bytes: 8});
});

test("warnings are found on the list and never refuse it", () => {
    const german = hostLayouts().find(layout => layout.slug === "windows-german").id;
    const value = list(["über", "ueber"], ["straße", "strasse"], ["the", "teh"]);
    assert.deepEqual(listWarnings(value, {layout: german, layoutName: "German (Windows)"}), []);
    const untypable = listWarnings(value, {layout: US_HOST_LAYOUT, layoutName: "US"});
    assert.deepEqual(untypable.map(({kind, entry, typo}) => ({kind, entry, typo})), [
        {kind: WARNING.UNTYPABLE, entry: "über", typo: undefined}, {kind: WARNING.UNTYPABLE, entry: "straße", typo: undefined}]);
    assert.match(untypable[0].text, /US cannot type “ü”, so this replacement will not be typed/);

    const chained = listWarnings(list(["b", "a"], ["c", "b"]), US);
    assert.deepEqual(chained.map(({kind, entry}) => [kind, entry]), [[WARNING.CHAIN, "b"]]);
    assert.match(chained[0].text, /“b” is itself an input for “c”: typing it gives “c”/);
    const loop = listWarnings(list(["b", "a"], ["a", "b"]), US);
    assert.deepEqual(loop.map(({kind, entry}) => [kind, entry]), [[WARNING.LOOP, "b"], [WARNING.LOOP, "a"]]);
    assert.match(loop[0].text, /“a” and “b” replace each other/);

    const parts = listWarnings(list(["the", ["teh", MATCH.ANYWHERE]], ["their", "thier"], ["no", ["on", MATCH.END]], ["button", "buton"]), US);
    assert.deepEqual(parts.map(({kind, typo}) => [kind, typo]), [[WARNING.SHORT_PART, "teh"], [WARNING.SHORT_PART, "on"], [WARNING.INSIDE_CORRECTION, "on"]]);
    assert.equal(parts[0].text, "“*teh*” is a short input with *, so it catches many words.");
    assert.match(parts[2].text, /“\*on” also matches inside the replacement “button”/);
    assert.deepEqual(listWarnings(list(["something", ["tihng", MATCH.ANYWHERE]]), US), [], "a long input with * that matches no replacement is fine");
    assert.deepEqual(listWarnings(list(["iPhone", "iphone"]), US), [], "an input that is its replacement in other capitals changes nothing typed right");
    assert.deepEqual(listWarnings(list(["thee", ["the", MATCH.START]]), US).map(({kind}) => kind), [WARNING.SHORT_PART, WARNING.INSIDE_CORRECTION], "an input with * inside its own replacement");

    // A replacement that plays a macro with no steps does nothing, and says so
    // by the macro's name; one whose macro has steps is fine.
    const macros = list(["the", "teh"], [5, "sig"], [6, "addr"]);
    assert.deepEqual(listWarnings(macros, US), [], "nothing is known of the macros");
    const empty = listWarnings(macros, {...US, macroNames: Object.assign([], {5: "Sign-off"}), emptyMacros: new Set([5])});
    assert.deepEqual(empty.map(({kind, entry, typo}) => ({kind, entry, typo})), [{kind: WARNING.EMPTY_MACRO, entry: entryKey({macro: 5}), typo: undefined}]);
    assert.match(empty[0].text, /“Sign-off” has no steps, so this replacement does nothing yet/);
});

// A list at the keyboard's ceiling of inputs, every one written with `*` at
// both ends, which is how a QMK dictionary's lines without colons import.
const fullList = () => {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const wordOf = (seed, length) => {
        let word = "", value = seed * 7919 + 13;
        for (let at = 0; at < length; at++) {word += letters[value % 26]; value = Math.floor(value / 26) + seed * 31 + at * 17;}
        return word;
    };
    const entries = [], seen = new Set();
    for (let seed = 0; entries.length < 1024; seed++) {
        const typo = wordOf(seed, 8);
        if (seen.has(typo)) continue;
        seen.add(typo);
        entries.push({correction: `${wordOf(seed + 50000, 5)} ${wordOf(seed + 90000, 5)}`, typos: [{typo, match: MATCH.ANYWHERE}]});
    }
    return {entries};
};

test("a full list of inputs with * is checked for warnings within a keystroke's budget", () => {
    const value = fullList();
    assert.doesNotThrow(() => encodeAutocorrectDomain(value), "the list is one the keyboard takes");
    listWarnings(value, US);
    const started = process.hrtime.bigint();
    listWarnings(value, US);
    const took = Number(process.hrtime.bigint() - started) / 1e6;
    // It took seconds while every word of every replacement built the list's
    // index again; a few milliseconds now, and the budget leaves a slow
    // machine a wide margin.
    assert.ok(took < 150, `listWarnings took ${took.toFixed(0)} ms for 1,024 inputs with *`);
});

test("two lists' entries pair by replacement, a changed one with the one that took its inputs", () => {
    const {pairEntries} = require("../../core/model/autocorrect-list");
    const before = list(["the", "teh", "hte"], ["because", "becuase"], ["gone", "goen"]);
    const after = list(["The", "teh", "hte", "tthe"], ["because", "becuase", "becasue"], ["new", "nwe"]);
    assert.deepEqual(pairEntries(before, after).map(pair => [pair.before?.correction, pair.after?.correction]),
        [["the", "The"], ["because", "because"], ["gone", undefined], [undefined, "new"]]);
    // An entry whose typos were split goes with the larger share.
    const split = pairEntries(list(["the", "teh", "hte", "tthe"]), list(["then", "teh"], ["The", "hte", "tthe"]));
    assert.deepEqual(split.map(pair => [pair.before?.correction, pair.after?.correction]), [["the", "The"], [undefined, "then"]]);
    assert.deepEqual(pairEntries(list(), list()), []);
    // Text made a macro is the same entry; a macro is paired by its slot.
    const played = pairEntries(list(["the", "teh"], [5, "sig"]), list([9, "teh"], [5, "sig", "sgi"]));
    assert.deepEqual(played.map(pair => [pair.before?.macro ?? pair.before?.correction, pair.after?.macro ?? pair.after?.correction]), [["the", 9], [5, 5]]);
});

test("an entry is put back with its inputs, each taken from wherever it went, in either direction", () => {
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
    // Text that was made a macro comes back as text, and a macro as a macro.
    const played = list([9, "teh", "hte"], ["then", "tehn"]);
    restoreEntry(played, theirs, "the", entryKey({macro: 9}));
    assert.deepEqual(shape(played), [["then", "tehn"], ["the", "teh", "hte"]]);
    const texted = list(["the", "sig"]);
    restoreEntry(texted, list([5, "sig"]), entryKey({macro: 5}), "the");
    assert.deepEqual(shape(texted), [[5, "sig"]]);
});
