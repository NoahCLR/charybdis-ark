"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {APPLY_VERDICTS, SAVE_WORDS, INTERRUPTION_REASONS, interruption, saveResult} = require("../../core/session/interruption");
const {LIVE_LINK_ERROR_CODES, liveLinkError} = require("../../core/transport/device-adapter");

// Words a person never reads in a notice about an Apply or a Save cut short.
const DEVELOPER_WORDS = /DevSrvsID|Device \S+ disconnected|Candidate|candidate|mutation|ambiguous|wait window|decision|commit/;
// Every sentence starts with a capital letter.
const sentences = text => text.split(/(?<=[.!?])\s+/);

test("the Apply verdicts and the Save words are whole sentences in a person's words", () => {
    for (const text of [...Object.values(APPLY_VERDICTS), ...Object.values(INTERRUPTION_REASONS), SAVE_WORDS.cutShort, SAVE_WORDS.later("/r.json"),
        SAVE_WORDS.saved, SAVE_WORDS.unsaved, SAVE_WORDS.gone("/r.json"), SAVE_WORDS.gone(undefined)]) {
        assert.doesNotMatch(text, DEVELOPER_WORDS, text);
        for (const sentence of sentences(text)) assert.match(sentence, /^[A-Z“(/]/, `"${sentence}" starts a sentence`);
        assert.match(text, /\.$/, text);
    }
    assert.equal(APPLY_VERDICTS.none, "Nothing was saved: the keyboard kept the profile it had.");
    assert.equal(SAVE_WORDS.cutShort, "Ark can't tell whether the save finished.");
    assert.equal(INTERRUPTION_REASONS.lost, "The keyboard was disconnected or restarted.");
});

test("a lost connection anywhere in the cause is the interruption; a timeout is a keyboard that stopped answering", () => {
    const lost = liveLinkError(LIVE_LINK_ERROR_CODES.DISCONNECTED, "The keyboard was disconnected.");
    const wrapped = Object.assign(new Error("Candidate status could not be read after a mutation; its outcome is ambiguous."), {code: "TRANSPORT_OUTCOME_AMBIGUOUS", cause: lost});
    assert.equal(interruption(Object.assign(new Error("Apply was cut short."), {code: "RESTORE_INCOMPLETE", cause: wrapped})), "lost");
    assert.equal(interruption({code: "WRITE_FAILED"}), "lost");
    assert.equal(interruption({code: "TIMEOUT"}), "unanswered");
    assert.equal(interruption(Object.assign(new Error("x"), {code: "COMMIT_FAILED", cause: {code: "TIMEOUT", cause: {code: "DISCONNECTED"}}})), "lost", "the lost connection outranks the timeout it caused");
    assert.equal(interruption({code: "LIVE_EDIT_REFUSED"}), "", "the keyboard's own refusal is no interruption");
    assert.equal(interruption(undefined), "");
    const loop = /** @type {any} */ ({code: "X"}); loop.cause = loop;
    assert.equal(interruption(loop), "", "a cause chain that loops ends");
});

test("after a Save cut short, the next read says what became of the edits", () => {
    const read = (saved, current, unsaved) => ({saved: {fingerprint: saved}, fingerprint: current, live: {unsaved}});
    const cut = {edits: "edits", recovery: "/recovery/2.json"};
    assert.equal(saveResult(cut, read("edits", "edits", false)), SAVE_WORDS.saved);
    assert.equal(saveResult(cut, read("old", "edits", true)), SAVE_WORDS.unsaved);
    assert.equal(saveResult(cut, read("old", "old", false)), SAVE_WORDS.gone("/recovery/2.json"));
    assert.match(SAVE_WORDS.gone("/recovery/2.json"), /unsaved edits are gone.*recovery copy.*\/recovery\/2\.json/);
    assert.doesNotMatch(SAVE_WORDS.gone(undefined), /recovery copy/, "no copy is named that was not made");
    assert.equal(saveResult(cut, {fingerprint: "edits"}), "", "a read with no live state says nothing about the save");
});
