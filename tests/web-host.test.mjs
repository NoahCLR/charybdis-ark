// The web page's host pieces that need no browser: the acquireVsCodeApi
// stand-in, the worker's sleep, and the host's small decisions. The page
// itself, over a fake WebHID keyboard, is browser-tests/web-page.spec.js's.

import assert from "node:assert/strict";
import test from "node:test";
import {connectPanel} from "../web/panel-channel.mjs";
import {workerSleep} from "../web/sleep.mjs";
import {BLOCKED, PROFILE_FILE_LIMIT, WEB_WORDS, initialTheme, leaving, readProfileFile} from "../web/web-host.mjs";
import {recoveryName} from "../web/recoveries.mjs";

// A MessageChannel delivers on a later task, but not within any fixed time: a
// loaded runner can take longer than a few milliseconds. Wait for the delivery
// itself, giving up only after a generous bound.
async function delivered(list, count = 1) {
    for (const end = Date.now() + 2000; list.length < count && Date.now() < end;) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

test("the stand-in delivers both ways later and as copies, and shows the click its message at once", async () => {
    const received = [], gestures = [], target = new EventTarget(), shown = [];
    target.addEventListener("message", (event) => shown.push(event.data));
    const panel = connectPanel({receive: (message) => received.push(message), gesture: (message) => gestures.push(message), target});
    try {
        const sent = {type: "updateLayoutKeys", layers: [{layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]}]};
        panel.api.postMessage(sent);
        assert.equal(gestures.length, 1, "the host sees the message inside the click");
        assert.deepEqual(gestures[0], sent);
        assert.notEqual(gestures[0], sent, "as a copy");
        assert.deepEqual(received, [], "the message itself arrives later, as in VS Code");
        sent.layers[0].changes[0].keycode = "KC_B";
        await delivered(received);
        assert.equal(received.length, 1);
        assert.equal(received[0].layers[0].changes[0].keycode, "KC_A", "the panel cannot change what the host was sent");

        const model = {type: "model", model: {draft: {dirty: false}}};
        await panel.post(model);
        assert.deepEqual(shown, [], "the model arrives later too");
        await delivered(shown);
        assert.deepEqual(shown, [model]);
        shown[0].model.draft.dirty = true;
        assert.equal(model.model.draft.dirty, false, "nor the host's model by touching what it was sent");

        panel.api.setState({screen: "keys"});
        assert.deepEqual(panel.api.getState(), {screen: "keys"});
    } finally {
        panel.close();
    }
});

test("the worker's sleep waits for the worker's answer", async () => {
    const asked = [];
    const worker = {postMessage: (message) => asked.push(message)};
    const sleep = workerSleep(worker);
    let woke = false;
    const waiting = sleep(20).then(() => {woke = true;});
    assert.deepEqual(asked, [{id: 1, ms: 20}]);
    await Promise.resolve();
    assert.equal(woke, false);
    worker.onmessage({data: 1});
    await waiting;
    assert.equal(woke, true);
    // Without a worker it is the page's own timer.
    await workerSleep(undefined)(1);
});

test("the theme starts from a saved choice, then the system's", () => {
    assert.equal(initialTheme("light", false), "light");
    assert.equal(initialTheme("dark", true), "dark");
    assert.equal(initialTheme(null, true), "light");
    assert.equal(initialTheme("sepia", false), "dark");
});

test("leaving asks first with unapplied edits or an Apply running", () => {
    assert.equal(leaving({}), false);
    assert.equal(leaving({draft: {dirty: false}}), false);
    assert.equal(leaving({draft: {dirty: true}}), true);
    assert.equal(leaving({applyRunning: true}), true);
    assert.equal(leaving({service: {phase: "restoring complete profile"}}), true);
    assert.equal(leaving({service: {phase: "reading layout"}}), false);
});

test("in the demo, leaving asks only about edits not exported", () => {
    const draft = (print) => ({dirty: true, current: {fingerprint: print}});
    assert.equal(leaving({demo: {exported: null}, draft: draft(1)}), true);
    assert.equal(leaving({demo: {exported: 1}, draft: draft(1)}), false, "exported as they are");
    assert.equal(leaving({demo: {exported: 1}, draft: draft(2)}), true, "edited since");
    assert.equal(leaving({demo: {exported: null}, draft: {dirty: false}}), false);
});

test("a chosen profile file has the extension's size limit", async () => {
    assert.equal(await readProfileFile(undefined), undefined);
    const file = (size) => ({size, name: "mine.charybdis.json", text: async () => "{}"});
    assert.deepEqual(await readProfileFile(file(PROFILE_FILE_LIMIT)), {text: "{}", name: "mine.charybdis.json"});
    await assert.rejects(readProfileFile(file(PROFILE_FILE_LIMIT + 1)), /too large/);
});

test("a recovery copy downloads under the extension's name for it", () => {
    const at = new Date("2026-10-06T09:14:03.512Z");
    assert.equal(recoveryName({format: "charybdis-profile"}, at), "recovery-2026-10-06T09-14-03-512Z.charybdis.json");
    assert.equal(recoveryName({format: "charybdis-recovery-capture"}, at), "recovery-2026-10-06T09-14-03-512Z.diagnostic.json");
});

test("the page's words are its own", () => {
    for (const words of Object.values(WEB_WORDS)) assert.match(words, /Choose keyboard/);
    assert.match(BLOCKED.unsupported.title, /Chrome or Edge/);
    assert.match(BLOCKED.unsupported.detail, /HTTPS/);
    assert.match(BLOCKED.otherTab.title, /another tab/);
    // The demo needs no keyboard, so a browser without WebHID still offers it;
    // a tab waiting on another does not, since it takes the keyboard over.
    assert.equal(BLOCKED.unsupported.demo, true);
    assert.equal(BLOCKED.otherTab.demo, undefined);
});
