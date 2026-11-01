import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {announcements} from "../../webview/view/announcements.mjs";
import {macroMessage} from "../../webview/view/edits.mjs";

const {openDraft, panelModel, profileDocument} = createRequire(import.meta.url)("../fixtures/published-model");

// What core publishes for a connected keyboard under a draft holding one
// edit; each test writes over it what the state it names would publish.
const {draft: opened, state} = openDraft(profileDocument(), {edits: [macroMessage("MACRO_0", "{KC_A}")]});
const published = panelModel(opened, state);
/** @param {{draft?: object, apply?: object | null, health?: object, shell?: object, portable?: object}} [over] @returns {any} */
const model = ({draft = {}, apply = null, health = {}, shell = {}, portable = {}} = {}) => ({...published,
    draft: {...published.draft, ...draft}, apply, shell: {...published.shell, ...shell}, portable: {...published.portable, ...portable},
    device: {...published.device, health: {...published.device.health, ...health}}});
const steps = [{id: "check", label: "Check the keyboard", state: "done"}, {id: "upload", label: "Send the profile", state: "active"}, {id: "verify", label: "Check both halves", state: "pending"}];

test("a draft at rest says nothing", () => {
    assert.deepEqual(announcements(published), {polite: [], assertive: []});
    assert.deepEqual(announcements(null), {polite: [], assertive: []});
});

test("work under way is said politely, a save by its step and never by its bytes", () => {
    const apply = {id: 4, state: "applying", steps, bytes: {completed: 512, total: 4096}};
    assert.deepEqual(announcements(model({draft: {busy: true}, apply})).polite, ["Saving to the keyboard, step 2 of 3: Send the profile"]);
    const further = {...apply, bytes: {completed: 1024, total: 4096}};
    assert.deepEqual(announcements(model({draft: {busy: true}, apply: further})).polite, ["Saving to the keyboard, step 2 of 3: Send the profile"]);
    assert.deepEqual(announcements(model({draft: {busy: true}, apply: {...apply, state: "done"}})).polite, ["Saved — reading back the keyboard"]);
    assert.deepEqual(announcements(model({shell: {progress: "Saving a recovery copy"}, portable: {progress: "Reading profile…"}})).polite,
        ["Saving a recovery copy", "Reading profile…"]);
});

test("a notice is polite, an error assertive, and a save cut short is said once, by its bar", () => {
    assert.deepEqual(announcements(published, {notice: "Saved on both halves."}), {polite: ["Saved on both halves."], assertive: []});
    assert.deepEqual(announcements(published, {notice: "Saved.", error: "The keyboard stopped answering."}),
        {polite: [], assertive: ["The keyboard stopped answering."]});
    assert.deepEqual(announcements(model({health: {error: "Halves apart."}})).assertive, ["Halves apart."]);

    const failure = {label: "Send the profile", reason: "It stopped.", verdict: "Nothing was saved: the keyboard kept the profile it had."};
    const apply = {id: 4, state: "failed", steps, failure};
    const said = announcements(model({apply}), {error: `Failed: ${failure.reason}`});
    assert.deepEqual(said.assertive, ["Save stopped at: Send the profile. It stopped. Nothing was saved: the keyboard kept the profile it had."],
        "the rail leaves the failure to the bar, so it is heard once");
    assert.deepEqual(announcements(model({apply}), {applyDismissed: 4, error: `Failed: ${failure.reason}`}).assertive, [`Failed: ${failure.reason}`],
        "dismissed, the bar is gone and the rail says it");
});
