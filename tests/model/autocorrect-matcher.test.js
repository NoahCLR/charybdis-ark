"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {typedText, firingTypo, wordsOf} = require("../../core/model/autocorrect-matcher");
const {AUTOCORRECT_MATCH: MATCH} = require("../../core/schema/autocorrect-domain-v1");
const {hostLayouts, US_HOST_LAYOUT} = require("../../core/data/host-layouts");
const fixture = require("../../upstream/firmware/tests/fixtures/autocorrect_v1.json");

const MATCH_OF = {"whole word": MATCH.WHOLE_WORD, "start of word": MATCH.START, "end of word": MATCH.END, anywhere: MATCH.ANYWHERE};
const US = {layout: US_HOST_LAYOUT};
const list = (...entries) => ({entries: entries.map(([correction, ...typos]) => ({correction, typos: typos.map(typo => typeof typo === "string" ? {typo, match: MATCH.WHOLE_WORD} : {typo: typo[0], match: typo[1]})}))});
// A fixture case's list as the codec's model, and its layout by slug.
const listOf = entries => ({entries: entries.map(entry => ({correction: entry.correction, typos: entry.typos.map(typo => {
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
];

const text = fixture.cases.filter(entry => entry.screen !== undefined);
const skipped = fixture.cases.filter(entry => entry.screen === undefined);

test("the firmware's behaviour fixture is the version this matcher reads, and every case is run or skipped for a known reason", () => {
    assert.equal(fixture.version, 1);
    assert.equal(text.length + skipped.length, fixture.cases.length);
    assert.ok(text.length >= 39, "the text cases are run");
    for (const entry of skipped) assert.ok(KEYBOARD_ONLY.includes(entry.keyboardOnly), `${entry.name} is skipped for a reason this test does not know: ${entry.keyboardOnly}`);
    assert.deepEqual([...new Set(skipped.map(entry => entry.keyboardOnly))].sort(), [...KEYBOARD_ONLY].sort(), "every reason listed here still skips a case");
    for (const rule of [1, 2, 3, 4, 5, 6, 7, 9]) assert.ok(text.some(entry => entry.rule === rule), `rule ${rule} has a text case`);
});

for (const entry of text) {
    test(`fixture ${entry.name} (rule ${entry.rule}): ${entry.description}`, () => {
        const result = typedText(listOf(entry.list), hostOf(entry.layout), entry.capsLock, entry.screen).text;
        if (entry.result !== undefined) assert.equal(result, entry.result);
        else assert.ok(result.endsWith(entry.resultEndsWith), `${JSON.stringify(result)} ends with ${JSON.stringify(entry.resultEndsWith)}`);
    });
}
for (const entry of skipped) test(`fixture ${entry.name} needs the keyboard: ${entry.keyboardOnly}`, {skip: entry.keyboardOnly}, () => {});

test("what fired is reported in order, and an undone correction is not", () => {
    const value = list(["the", "teh", "hte"], ["thing", ["tihng", MATCH.ANYWHERE]]);
    assert.deepEqual(typedText(value, US, false, "hte sometihng teh").fired, [{correction: "the", typo: "hte"}, {correction: "thing", typo: "tihng"}]);
    assert.deepEqual(typedText(value, US, false, "teh \b").fired, []);
    assert.deepEqual(typedText(value, US, false, "teh hte \b").fired, [{correction: "the", typo: "teh"}]);
    assert.equal(typedText(value, US, false, "teh hte \b").undone, true);
    assert.equal(typedText(value, US, false, "teh hte \bx").undone, false, "only while the word stands as it was put back");
});

test("a word past 32 characters is left alone, and a correction past 48 key strokes is passed over", () => {
    const long = "a".repeat(29);
    const value = list(["thing", ["tihng", MATCH.ANYWHERE]], ["b".repeat(30), "c".repeat(30)]);
    assert.equal(typedText(value, US, false, `${long}tih `).text, `${long}tih `);
    assert.equal(typedText(value, US, false, `${"a".repeat(27)}tihng `).text, `${"a".repeat(27)}thing `);
    assert.equal(typedText(value, US, false, `${"a".repeat(28)}tihng `).text, `${"a".repeat(28)}tihng `, "the 33rd character suspends the word");
    assert.equal(typedText(value, US, false, `${"c".repeat(30)} `).text, `${"c".repeat(30)} `, "30 erased and 30 typed is 60 strokes");
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
