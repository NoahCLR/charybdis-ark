import test from "node:test";
import assert from "node:assert/strict";
import {VOCABULARY} from "../../core/model/vocabulary.js";
import {busyText, postApplyReadText, readScreen} from "../../webview/view/readiness.mjs";
import {configureReady, screenAvailable} from "../../webview/view/screens.mjs";

test("loading names the active read and never claims the board is ready", () => {
    assert.deepEqual(readScreen(null), {state: "loading", title: "Reading your keyboard", detail: "Looking for a keyboard"});
    assert.match(readScreen({vocabulary: VOCABULARY, load: {state: "loading", phase: "read-layout", progress: {done: 5, total: 8}}}).detail,
        /Reading keys and layers · 5 of 8/);
    assert.match(readScreen({vocabulary: VOCABULARY, load: {state: "loading", phase: "read-complete"}}).detail, /Reading the complete profile/);
});

test("only a ready model releases Configure screens", () => {
    assert.equal(configureReady(null), false);
    assert.equal(configureReady({load: {state: "loading"}}), false);
    assert.equal(configureReady({load: {state: "unavailable"}}), false);
    assert.equal(configureReady({load: {state: "ready"}}), true);
    assert.equal(readScreen({load: {state: "ready"}}), null);
    assert.match(readScreen({vocabulary: VOCABULARY, load: {state: "unavailable"}, device: {connected: true}}).detail, /complete profile/);
});

test("rail screens follow the read and the capability each screen needs", () => {
    const loading = {load: {state: "loading"}, device: {connected: true}, portable: {available: true}};
    for (const screen of ["keys", "lighting", "profile", "device"]) assert.equal(screenAvailable(loading, screen), false, screen);

    const noKeyboard = {load: {state: "unavailable"}, device: {connected: false}, portable: {available: false}};
    assert.equal(screenAvailable(noKeyboard, "keys"), false);
    assert.equal(screenAvailable(noKeyboard, "profile"), false);
    assert.equal(screenAvailable(noKeyboard, "device"), false, "a scan without a keyboard has no device status to show");
    assert.match(readScreen(noKeyboard, "profile").title, /Backups unavailable/);
    assert.equal(screenAvailable({...noKeyboard, portable: {available: false, review: {fileName: "old.json"}}}, "profile"), false,
        "a retained review cannot make a disconnected keyboard available");

    const unsupported = {load: {state: "unavailable"}, device: {connected: true}, portable: {available: false}};
    assert.equal(screenAvailable(unsupported, "keys"), false);
    assert.equal(screenAvailable(unsupported, "profile"), false, "unsupported firmware cannot export a complete current profile");
    assert.equal(screenAvailable(unsupported, "device"), true);

    const failedRead = {...unsupported, portable: {available: true}};
    assert.equal(screenAvailable(failedRead, "profile"), true, "a connected device can retry profile export after the read failed");
    const ready = {...failedRead, load: {state: "ready"}};
    for (const screen of ["keys", "lighting", "profile", "device"]) assert.equal(screenAvailable(ready, screen), true, screen);
});

test("post-Apply readback names the current data instead of a generic operation", () => {
    const model = {vocabulary: VOCABULARY};
    assert.equal(postApplyReadText(model, null), "Confirming the completed save");
    assert.equal(postApplyReadText(model, {step: "layout", progress: {done: 12, total: 56}}), "Reading keys and layers · 12 of 56");
    assert.equal(postApplyReadText(model, {step: "profile"}), "Reading saved lighting, behaviours and settings");
    assert.equal(postApplyReadText(model, {step: "combos"}), "Checking active combos");
    assert.equal(postApplyReadText(model, {step: "baseRgb"}), "Checking the background effect");
});

test("a read or export names what it reads and claims nothing about saving", () => {
    assert.deepEqual(busyText("read-complete", {vocabulary: VOCABULARY}), {detail: "Reading the complete profile", writes: false});
    assert.deepEqual(busyText("refresh", {vocabulary: VOCABULARY}), {detail: "Checking both halves", writes: false});
    assert.deepEqual(busyText("connected", {vocabulary: VOCABULARY}), {detail: "Finishing the current step", writes: false}, "a raw phase is never shown");
    assert.deepEqual(busyText("restore-complete", {vocabulary: VOCABULARY}), {detail: "Saving the profile to both halves", writes: true});
});

test("a shell that cannot reach a keyboard says why, and a shell's words say how to connect", () => {
    const blocked = {shell: {blocked: {title: "Ark is open in another tab", detail: "One tab holds the keyboard."}}, load: {state: "unavailable"}, device: {connected: false}};
    assert.deepEqual(readScreen(blocked), {state: "blocked", title: "Ark is open in another tab", detail: "One tab holds the keyboard."});
    assert.deepEqual(readScreen(blocked, "profile").state, "blocked");
    const web = {shell: {words: {connectHint: "Choose keyboard and pick it."}}, load: {state: "unavailable"}, device: {connected: false}};
    assert.equal(readScreen(web).detail, "Choose keyboard and pick it.");
    assert.equal(readScreen({...web, device: {connected: false, health: {error: "Unplugged."}}}).detail, "Unplugged.", "what the keyboard said comes first");
});


test("phase presentation consumes the published vocabulary rather than labels as identities", () => {
    const model = {vocabulary: {...VOCABULARY, phases: {...VOCABULARY.phases,
        "read-layout": {label: "Changed read label", read: "Changed read detail", busy: "Changed busy detail", writes: false},
        "restore-complete": {label: "Changed restore label", busy: "Changed saving detail", writes: true},
    }}, load: {state: "loading", phase: "read-layout", progress: {done: 2, total: 4}}};
    assert.equal(readScreen(model).detail, "Changed read detail · 2 of 4");
    assert.deepEqual(busyText("read-layout", model), {detail: "Changed busy detail", writes: false});
    assert.deepEqual(busyText("restore-complete", model), {detail: "Changed saving detail", writes: true});
});

test("unknown and missing phase facts use the existing honest fallbacks", () => {
    assert.deepEqual(busyText("unknown", {vocabulary: VOCABULARY}), {detail: "Finishing the current step", writes: false});
    assert.deepEqual(busyText(undefined, null), {detail: "Finishing the current step", writes: false});
    assert.equal(readScreen({vocabulary: VOCABULARY, load: {state: "loading", phase: "unknown"}}).detail, "Finishing the read");
    assert.equal(readScreen(null).detail, "Looking for a keyboard");
});

test("unknown screen IDs show a recoverable unavailable surface", () => {
    assert.deepEqual(readScreen({load: {state: "ready"}}, "unknown-screen"), {
        state: "unavailable", title: "Screen unavailable", detail: "Choose a screen from the menu to continue.",
    });
});

test("a keyboard whose halves are not together says what is wrong and what to do", async () => {
    const {halvesWords} = await import("../../webview/view/vocabulary.mjs");
    const model = (halves, error = "") => ({vocabulary: VOCABULARY, load: {state: "unavailable"}, device: {connected: true, health: {halves, error}}});
    assert.equal(readScreen(model("alone", "The slave half is not connected.")).detail, VOCABULARY.halves.alone.detail);
    assert.equal(readScreen(model("apart")).detail, VOCABULARY.halves.apart.detail);
    assert.equal(readScreen(model("agree", "Read failed.")).detail, "Read failed.", "halves that agree leave the keyboard's own words");
    assert.deepEqual(halvesWords({vocabulary: VOCABULARY}, "alone"), VOCABULARY.halves.alone);
    assert.deepEqual(halvesWords(null, "alone"), {label: "alone", detail: ""}, "an unknown table reads as the state itself");
});

test("a draft that holds editing says why, not that the read failed", () => {
    const held = (reason, extra = {}) => readScreen({vocabulary: VOCABULARY, load: {state: "unavailable", held: reason}, device: {connected: true, health: {halves: "agree"}}, ...extra});
    const stale = held("stale", {draft: {live: null}});
    assert.equal(stale.title, "The keyboard changed since this draft began");
    assert.match(stale.detail, /Review against the keyboard/);
    assert.doesNotMatch(stale.detail, /could not be read/);
    assert.match(held("stale", {draft: {live: {unsaved: true}}}).detail, /Choose Read keyboard in the bar/, "a live draft is read again, as its bar says");
    assert.equal(held("connection-changed").title, "Keyboard connection changed");
    assert.match(held("connection-changed").detail, /Review against the keyboard/);
    const other = held("other-keyboard");
    assert.equal(other.title, "Draft belongs to another keyboard");
    assert.match(other.detail, /Select it to continue editing, or discard the draft/);
    assert.equal(held("unsupported").detail, VOCABULARY.firmwareUpdate, "firmware Ark does not support says so, as the edit controls do");
});

test("only a read that failed says the complete profile could not be read; halves and errors keep their words", () => {
    const failed = readScreen({vocabulary: VOCABULARY, load: {state: "unavailable"}, device: {connected: true, health: {halves: "agree"}}});
    assert.deepEqual(failed, {state: "unavailable", title: "Keyboard not ready for edits", detail: "A complete profile could not be read. Read the keyboard again to retry."});
    const withHalves = (halves, error = "") => readScreen({vocabulary: VOCABULARY, load: {state: "unavailable", held: "stale"}, device: {connected: true, health: {halves, error}}});
    assert.equal(withHalves("alone").detail, VOCABULARY.halves.alone.detail);
    assert.equal(withHalves("apart").detail, VOCABULARY.halves.apart.detail);
    assert.equal(withHalves("agree", "The keyboard did not answer.").detail, "The keyboard did not answer.");
});
