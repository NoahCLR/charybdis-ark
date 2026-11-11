"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {typedText, firingTypo, typoFinder, wordsOf} = require("../../core/model/autocorrect-matcher");
const {AUTOCORRECT_MATCH: MATCH} = require("../../core/schema/autocorrect-domain-v1");
const {hostLayouts, US_HOST_LAYOUT} = require("../../core/data/host-layouts");
const fixture = require("../../upstream/firmware/tests/fixtures/autocorrect_v1.json");

const MATCH_OF = {"whole word": MATCH.WHOLE_WORD, "start of word": MATCH.START, "end of word": MATCH.END, anywhere: MATCH.ANYWHERE};
const US = {layout: US_HOST_LAYOUT};
const list = (...entries) => ({entries: entries.map(([correction, ...typos]) => ({correction, typos: typos.map(typo => typeof typo === "string" ? {typo, match: MATCH.WHOLE_WORD} : {typo: typo[0], match: typo[1]})}))});
// A fixture case's list as the codec's model, and its layout by slug.
const listOf = entries => ({entries: entries.map(entry => ({correction: entry.correction ?? "", ...(entry.macro === undefined ? {} : {macro: entry.macro}), typos: entry.typos.map(typo => {
    assert.ok(typo.match in MATCH_OF, `the fixture's match ${typo.match}`);
    return {typo: typo.typo, match: MATCH_OF[typo.match]};
})}))});
const hostOf = slug => {
    const layout = hostLayouts().find(candidate => candidate.slug === slug);
    assert.ok(layout, `the fixture's layout ${slug}`);
    return {layout: layout.id};
};

// What the keyboard does and a text box cannot show: each needs a key, a
// timing or a setting that the characters on screen do not carry.
const KEYBOARD_ONLY = [
    "a dead-key sequence the layout does not resolve", "a cursor key", "a shortcut", "a mouse click", "a macro",
    "a key held until the computer repeats it", "a held modifier", "a macro key pressed during a correction",
    "more keys than the queue holds", "the stored switch",
    // A text matcher cannot tell how a character was typed: the keyboard
    // passes over a word whose ending character a dead key composed, and the
    // preview replaces it (firmware autocorrect-v1.md, "What a word is").
    "a word ended through a dead key",
];

const text = fixture.cases.filter(entry => entry.screen !== undefined);
const skipped = fixture.cases.filter(entry => entry.screen === undefined);

test("the firmware's behaviour fixture is the version this matcher reads, and every case is run or skipped for a known reason", () => {
    assert.equal(fixture.version, 1);
    assert.equal(text.length + skipped.length, fixture.cases.length);
    assert.ok(text.length >= 57, "the text cases are run");
    for (const entry of skipped) assert.ok(KEYBOARD_ONLY.includes(entry.keyboardOnly), `${entry.name} is skipped for a reason this test does not know: ${entry.keyboardOnly}`);
    assert.deepEqual([...new Set(skipped.map(entry => entry.keyboardOnly))].sort(), [...KEYBOARD_ONLY].sort(), "every reason listed here still skips a case");
    for (const rule of [1, 2, 3, 4, 5, 6, 7, 9, 10]) assert.ok(text.some(entry => entry.rule === rule), `rule ${rule} has a text case`);
});

for (const entry of text) {
    test(`fixture ${entry.name} (rule ${entry.rule}): ${entry.description}`, () => {
        // A case's stored macros type text; a slot it leaves out is empty.
        const macros = slot => entry.macros?.[slot] === undefined ? null : {text: entry.macros[slot]};
        const result = typedText(listOf(entry.list), hostOf(entry.layout), entry.capsLock, entry.screen, "", macros).text;
        if (entry.result !== undefined) assert.equal(result, entry.result);
        else assert.ok(result.endsWith(entry.resultEndsWith), `${JSON.stringify(result)} ends with ${JSON.stringify(entry.resultEndsWith)}`);
    });
}
for (const entry of skipped) test(`fixture ${entry.name} needs the keyboard: ${entry.keyboardOnly}`, {skip: entry.keyboardOnly}, () => {});

test("what fired is reported in order, and an undone correction is not", () => {
    const value = list(["the", "teh", "hte"], ["thing", ["tihng", MATCH.ANYWHERE]]);
    assert.deepEqual(typedText(value, US, false, "hte sometihng teh").fired, [{entry: "the", correction: "the", typo: "hte"}, {entry: "thing", correction: "thing", typo: "tihng"}]);
    assert.deepEqual(typedText(value, US, false, "teh \b").fired, []);
    assert.deepEqual(typedText(value, US, false, "teh hte \b").fired, [{entry: "the", correction: "the", typo: "teh"}]);
    assert.equal(typedText(value, US, false, "teh hte \b").undone, true);
    assert.equal(typedText(value, US, false, "teh hte \bx").undone, false, "only while the word stands as it was put back");
});

// Try it's preview marks what each standing replacement typed (D-L86).
test("each standing replacement is marked where its text is, in the text's own offsets, and a part deleted since is not", () => {
    const value = {entries: [{correction: "the", typos: [{typo: "teh", match: MATCH.WHOLE_WORD}, {typo: "hte", match: MATCH.WHOLE_WORD}]}, {correction: "thing", typos: [{typo: "tihng", match: MATCH.ANYWHERE}]},
        {correction: "", macro: 5, typos: [{typo: "sig", match: MATCH.WHOLE_WORD}]}]};
    const marks = (screen, before = "", macros) => { const tried = typedText(value, US, false, screen, before, macros); return tried.marks.map(mark => [tried.text.slice(mark.start, mark.end), mark.typo, mark.start]); };
    assert.deepEqual(marks("Teh sometihng hte."), [["The", "teh", 0], ["something", "tihng", 4], ["the", "hte", 14]], "the word as the replacement leaves it");
    assert.deepEqual(marks("teh ", "😀 "), [["the", "teh", 3]], "offsets count as the text does, an emoji as two");
    assert.deepEqual(marks("teh \b"), [], "an undone replacement is not marked");
    assert.deepEqual(marks("teh \bx \b\b\b\b"), [], "nor is the word put back");
    assert.deepEqual(marks("teh x\b\b\b"), [["th", "teh", 0]], "what Backspace took of a replacement is gone from its mark");
    assert.deepEqual(marks("teh x\b\b\b\b\bab"), [], "and text typed where one stood is not marked");
    assert.deepEqual(marks("sig teh ", "", slot => slot === 5 ? {text: "Kind regards"} : null), [["Kind regards", "sig", 0], ["the", "teh", 13]], "a macro's text is marked as its replacement");
    assert.deepEqual(marks("sig ", "", () => ({text: null})), [], "a macro of keys leaves nothing to mark");
    assert.deepEqual(typedText(value, US, false, "teh ").marks, [{entry: "the", correction: "the", typo: "teh", start: 0, end: 3}]);
});

test("a macro replacement names its slot, plays only what can play, and shows nothing for a macro that is more than text", () => {
    const value = {entries: [{correction: "", macro: 5, typos: [{typo: "sig", match: MATCH.WHOLE_WORD}]}, {correction: "the", typos: [{typo: "teh", match: MATCH.WHOLE_WORD}]}]};
    const typed = typedText(value, US, false, "sig teh ", "", slot => slot === 5 ? {text: "Kind regards"} : null);
    assert.equal(typed.text, "Kind regards the ");
    assert.deepEqual(typed.fired, [{entry: "\u0001macro:5", correction: "", typo: "sig", macro: 5}, {entry: "the", correction: "the", typo: "teh"}]);
    // A macro of keys and waits has no text to show: the input goes.
    assert.equal(typedText(value, US, false, "sig ", "", () => ({text: null})).text, " ");
    // Without its macro, and by default, the input stays.
    assert.equal(typedText(value, US, false, "sig ", "", () => null).text, "sig ");
    assert.equal(typedText(value, US, false, "sig ").text, "sig ");
    // No undo: Backspace takes the ending character only.
    assert.equal(typedText(value, US, false, "sig \b", "", () => ({text: "Kind regards"})).undone, false);
});

test("a word past 32 characters is left alone, and the longest replacement is typed", () => {
    const long = "a".repeat(29);
    const value = list(["thing", ["tihng", MATCH.ANYWHERE]], ["b".repeat(30), "c".repeat(30)]);
    assert.equal(typedText(value, US, false, `${long}tih `).text, `${long}tih `);
    assert.equal(typedText(value, US, false, `${"a".repeat(27)}tihng `).text, `${"a".repeat(27)}thing `);
    assert.equal(typedText(value, US, false, `${"a".repeat(28)}tihng `).text, `${"a".repeat(28)}tihng `, "the 33rd character suspends the word");
    assert.equal(typedText(value, US, false, `${"c".repeat(30)} `).text, `${"b".repeat(30)} `, "30 erased and 30 typed is 60 of the 288 strokes a replacement may take");
    const longest = list(["x".repeat(128), "y".repeat(32)]);
    assert.equal(typedText(longest, US, false, `${"y".repeat(32)} `).text, `${"x".repeat(128)} `, "32 erased and 128 typed");
});

test("the longest typo is counted in characters, and a typo the host cannot type gives way to the next", () => {
    // "éé" is two characters and four bytes; "abc" is three and three.
    const value = list(["x", ["éé", MATCH.ANYWHERE]], ["y", ["abc", MATCH.ANYWHERE]]);
    const dutch = hostOf("macos-dutch");
    assert.equal(typedText(value, dutch, false, "ééabc ").text, "ééy ");
    const fallback = list(["café", "cafe"], ["cat", ["caf", MATCH.START]]);
    assert.equal(typedText(fallback, US, false, "cafe ").text, "cate ", "US cannot type é, so the whole-word typo is as if not listed");
    assert.equal(typedText(fallback, dutch, false, "cafe ").text, "café ");
});

test("only what differs has to be typed: an untypable character the word already shows is kept", () => {
    const value = list(["cafés", "cafée"]);
    assert.equal(typedText(value, US, false, "cafée ").text, "cafés ");
});

test("Caps Lock on macOS types no small letter, so a correction that needs one is passed over", () => {
    const value = list(["iPhone", "iphone"]);
    const mac = hostOf("macos-abc");
    assert.equal(typedText(value, mac, true, "IPHONe ").text, "IPHONe ");
    assert.equal(typedText(value, {layout: US_HOST_LAYOUT, macos: true}, true, "IPHONe ").text, "IPHONe ", "macOS is the host's system as well as a layout's");
    assert.equal(typedText(value, US, true, "IPHONe ").text, "iPhone ");
});

test("words are letters and digits with apostrophes between them, folded", () => {
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

test("of part-of-word typos equally long, the first in the domain's order fires: by their UTF-8 bytes; one finder answers for every word", () => {
    // In bytes z is below é, and a character outside the basic plane is above every one inside it.
    for (const [low, high] of [["a", "b"], ["z", "é"], ["é", "\uffee"], ["\uffee", "\u{10400}"], ["\u{10400}", "\u{10401}"]]) {
        assert.equal(Buffer.compare(Buffer.from(low), Buffer.from(high)), -1, `${low} is below ${high} in bytes`);
        const value = list(["x", [`${high}q`, MATCH.ANYWHERE]], ["y", [`${low}q`, MATCH.ANYWHERE]]);
        const fires = typoFinder(value);
        assert.equal(fires(`${high}q${low}q`)?.typo.typo, `${low}q`, `${low}q before ${high}q`);
        assert.deepEqual(fires(`${low}q${high}q`), {entry: value.entries[1], typo: value.entries[1].typos[0], start: 0, end: 2});
        assert.deepEqual(fires(`${high}q${low}q`), firingTypo(value, `${high}q${low}q`));
        assert.deepEqual(fires(`w${high}q`), {entry: value.entries[0], typo: value.entries[0].typos[0], start: 1, end: 3}, "a place is counted in characters");
    }
});
