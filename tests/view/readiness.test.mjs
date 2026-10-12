import test from "node:test";
import assert from "node:assert/strict";
import {VOCABULARY} from "../../core/model/vocabulary.js";
import {busyText, configureReady, postApplyReadText, readScreen, screenAvailable} from "../../webview/view/readiness.mjs";

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
    assert.match(readScreen({load: {state: "unavailable"}, device: {connected: true}}).detail, /complete profile/);
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

    const failedCapture = {...unsupported, portable: {available: true}};
    assert.equal(screenAvailable(failedCapture, "profile"), true, "a connected device can retry profile export after capture failed");
    const ready = {...failedCapture, load: {state: "ready"}};
    for (const screen of ["keys", "lighting", "profile", "device"]) assert.equal(screenAvailable(ready, screen), true, screen);
});

test("post-Apply readback names the current data instead of a generic operation", () => {
    assert.equal(postApplyReadText(null), "Confirming the completed save");
    assert.equal(postApplyReadText({step: "layout", progress: {done: 12, total: 56}}), "Reading keys and layers · 12 of 56");
    assert.equal(postApplyReadText({step: "profile"}), "Reading saved lighting, behaviours and settings");
    assert.equal(postApplyReadText({step: "combos"}), "Checking active combos");
    assert.equal(postApplyReadText({step: "baseRgb"}), "Checking base lighting");
});

test("a read or export names what it reads and claims nothing about saving", () => {
    assert.deepEqual(busyText("read-complete", {vocabulary: VOCABULARY}), {detail: "Reading the complete profile", writes: false});
    assert.deepEqual(busyText("refresh", {vocabulary: VOCABULARY}), {detail: "Checking both halves", writes: false});
    assert.deepEqual(busyText("connected", {vocabulary: VOCABULARY}), {detail: "Finishing the current step", writes: false}, "a raw phase is never shown");
    assert.deepEqual(busyText("restore-complete", {vocabulary: VOCABULARY}), {detail: "Saving the profile to both halves", writes: true});
});

test("a host that cannot reach a keyboard says why, and a host's words say how to connect", () => {
    const blocked = {host: {blocked: {title: "Ark is open in another tab", detail: "One tab holds the keyboard."}}, load: {state: "unavailable"}, device: {connected: false}};
    assert.deepEqual(readScreen(blocked), {state: "blocked", title: "Ark is open in another tab", detail: "One tab holds the keyboard."});
    assert.deepEqual(readScreen(blocked, "profile").state, "blocked");
    const web = {host: {words: {connectHint: "Choose keyboard and pick it."}}, load: {state: "unavailable"}, device: {connected: false}};
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
