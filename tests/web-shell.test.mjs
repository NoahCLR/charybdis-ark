// The web shell's pieces that need no browser: the panel channel, the worker's sleep, and the shell's small decisions. The page
// itself, over a fake WebHID keyboard, is browser-tests/web-page.spec.js's.

import assert from "node:assert/strict";
import test from "node:test";
import {connectPanel} from "../web/panel-channel.mjs";
import {workerSleep} from "../web/sleep.mjs";
import {BLOCKED, COMPILED_DEFAULTS_KEY, LIST_FILE, LOAD_FAILED, compiledDefaultsStore, initialTheme, readProfileFile, showLoadFailure, startWebShell} from "../web/web-shell.mjs";
import {listed, openRecoveries} from "../web/recoveries.mjs";
import {CHARYBDIS_PRODUCT_ID, CHARYBDIS_VENDOR_ID, QMK_RAW_HID_USAGE, QMK_RAW_HID_USAGE_PAGE} from "../core/transport/device-adapter.js";
import {FILE_MAX_BYTES} from "../core/model/portable-profile.js";
import {IMPORT_MAX_BYTES} from "../core/model/autocorrect-import.js";

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
        const sent = {type: "updateLayoutKeys", layer: "Layer 0", changes: [{layoutIndex: 0, keycode: "KC_A"}]};
        panel.api.postMessage(sent);
        assert.equal(gestures.length, 1, "the shell sees the message inside the click");
        assert.deepEqual(gestures[0], sent);
        assert.notEqual(gestures[0], sent, "as a copy");
        assert.deepEqual(received, [], "the message itself arrives later, as across a real channel");
        sent.changes[0].keycode = "KC_B";
        await delivered(received);
        assert.equal(received.length, 1);
        assert.equal(received[0].changes[0].keycode, "KC_A", "the panel cannot change what the shell was sent");

        const model = {type: "model", model: {draft: {dirty: false}}};
        await panel.post(model);
        assert.deepEqual(shown, [], "the model arrives later too");
        await delivered(shown);
        assert.deepEqual(shown, [model]);
        shown[0].model.draft.dirty = true;
        assert.equal(model.model.draft.dirty, false, "nor the shell's model by touching what it was sent");

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

// A worker whose script did not load never answers. Its waits finish on the
// page's timer instead, at the time they asked for, and so does every later one.
test("a failed worker's sleeps finish on the page's timer, the waiting ones included", async () => {
    const asked = [];
    const worker = {postMessage: (message) => asked.push(message)};
    const sleep = workerSleep(worker);
    let woke = 0;
    const waiting = [sleep(5), sleep(40)].map((slept) => slept.then(() => {woke++;}));
    worker.onerror(new Event("error"));
    await waiting[0];
    assert.equal(woke, 1, "the shorter wait ends first, on its own time");
    await Promise.all(waiting);
    assert.equal(woke, 2);
    await sleep(1);
    assert.equal(asked.length, 2, "a later sleep never asks the worker");
    // A late answer from it changes nothing.
    worker.onmessage({data: 1});

    const unreadable = {postMessage() {}};
    const sleepOn = workerSleep(unreadable);
    const stuck = sleepOn(1);
    unreadable.onmessageerror(new Event("messageerror"));
    await stuck;
});

// A message the shell could not handle is never dropped: what it threw or
// rejected with reaches `failed`, so the panel gets a notice, not silence.
test("the channel hands every failure of the shell's handling to the shell", async () => {
    const failures = [];
    const panel = connectPanel({
        receive: (message) => {
            if (message.type === "throws") throw new Error("thrown");
            return Promise.reject(new Error("rejected"));
        },
        failed: (error) => failures.push(error.message),
        target: new EventTarget(),
    });
    try {
        panel.api.postMessage({type: "throws"});
        panel.api.postMessage({type: "rejects"});
        await delivered(failures, 2);
        assert.deepEqual(failures, ["thrown", "rejected"]);
    } finally {
        panel.close();
    }
});

test("a panel that did not load leaves a plain message, as text, never a blank page", () => {
    const made = [];
    const document = {createElement: (tag) => {
        const node = {tag, children: [], textContent: "", className: "", append: (...children) => node.children.push(...children)};
        made.push(node);
        return node;
    }};
    let shown;
    showLoadFailure(document, {replaceChildren: (node) => {shown = node;}});
    assert.equal(shown.tag, "main");
    assert.equal(shown.className, "load-failure", "its own style, not the phone notice's");
    assert.deepEqual(shown.children.map((node) => [node.tag, node.textContent]), [["h1", LOAD_FAILED.title], ["p", LOAD_FAILED.detail]]);
    assert.match(LOAD_FAILED.detail, /Reload the page/);
    assert.ok(made.every((node) => !("innerHTML" in node)), "built from text alone");
});

// The page over stand-ins: WebHID with one allowed Charybdis, no locks, no
// storage, no worker. The models the panel is sent arrive on `window`.
function page({getDevices, locks, BroadcastChannel} = {}) {
    const device = Object.assign(new EventTarget(), {vendorId: CHARYBDIS_VENDOR_ID, productId: CHARYBDIS_PRODUCT_ID, productName: "Charybdis 4x6",
        collections: [{usagePage: QMK_RAW_HID_USAGE_PAGE, usage: QMK_RAW_HID_USAGE}], opened: false, async open() {}, async close() {}, async sendReport() {}});
    const listeners = new Map();
    const hid = {
        getDevices: getDevices || (async () => [device]),
        requestDevice: async () => [device],
        addEventListener: (type, listener) => listeners.set(type, [...(listeners.get(type) || []), listener]),
        removeEventListener() {},
    };
    const window = Object.assign(new EventTarget(), {URL, Blob, setTimeout});
    const models = [];
    window.addEventListener("message", (event) => {if (event.data?.type === "model") models.push(event.data);});
    const document = Object.assign(new EventTarget(), {documentElement: {dataset: {}}, visibilityState: "visible"});
    const shell = startWebShell({hid, locks, BroadcastChannel, document, window, build: {version: "test", commit: "test"}});
    const fire = (type) => (listeners.get(type) || []).forEach((listener) => listener(new Event(type)));
    return {...shell, models, fire, window, document, close: async () => {shell.panel.close(); await shell.loop.close();}};
}

// Quiet the console for a shell fault a test causes on purpose.
async function quietly(run) {
    const said = [], error = console.error;
    console.error = (...args) => said.push(args);
    try {await run(said);} finally {console.error = error;}
}

test("choosing a keyboard whose list cannot be read says so, and the panel hears it", async () => {
    const shell = page({getDevices: async () => {throw new Error("blocked");}});
    try {
        shell.api.postMessage({type: "chooseKeyboard"});
        await delivered(shell.models);
        assert.equal(shell.models.at(-1).notice, "Failed: Ark could not list the keyboards this page may open.");
        assert.equal(shell.models.at(-1).failed, true);
    } finally {await shell.close();}
});

// A fault nothing caught, in the shell or the panel, is said as a handled one
// is, once until the panel next posts: a fault that a notice's own drawing
// raises again is not said again for ever.
test("an uncaught error or unhandled rejection in the page becomes a notice, never silence", async () => {
    const {FAILURE_WORDS} = await import("../core/model/vocabulary.js");
    const shell = page();
    const failures = () => shell.models.filter((message) => message.failed);
    try {
        shell.window.dispatchEvent(Object.assign(new Event("error"), {error: new TypeError("x is undefined"), message: "Uncaught TypeError: x is undefined"}));
        await delivered(shell.models);
        assert.equal(shell.models.at(-1).notice, `Failed: ${FAILURE_WORDS.unexpected}`);
        assert.equal(shell.models.at(-1).failed, true);
        shell.window.dispatchEvent(Object.assign(new Event("unhandledrejection"), {reason: new TypeError("again")}));
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(failures().length, 1, "not said again before the panel posts anything");
        shell.api.postMessage({type: "setTheme", theme: "light"});
        await delivered(shell.models, 2);
        shell.window.dispatchEvent(Object.assign(new Event("unhandledrejection"), {reason: new TypeError("later")}));
        await delivered(shell.models, 3);
        assert.equal(failures().length, 2, "said again after the person did something");
    } finally {await shell.close();}
});

// Chrome refuses Web Locks where site data is blocked ("Don't allow sites to
// save data on your device"): the request rejects with a SecurityError. The
// page then goes on as a browser without locks does, so it never waits for
// ever on a lock it cannot have.
test("a browser that refuses the lock still reads the keyboard", async () => {
    const refused = {request: async () => {throw new DOMException("The request was denied.", "SecurityError");}};
    const shell = page({locks: refused});
    try {
        shell.api.postMessage({type: "ready"});
        await delivered(shell.models);
        assert.equal(shell.models.length > 0, true, "the panel gets its model");
        assert.equal(shell.models.at(-1).model.shell?.blocked ?? null, null, "and is not told another tab holds the keyboard");
    } finally {await shell.close();}
});

test("a request the shell's own code fails is still answered with a notice", async () => {
    const shell = page();
    try {
        await quietly(async (said) => {
            shell.loop.forget = async () => {throw new Error("The keyboard could not be let go.");};
            shell.api.postMessage({type: "forgetKeyboard"});
            await delivered(shell.models);
            assert.equal(shell.models.at(-1).notice, "Failed: The keyboard could not be let go.");
            assert.equal(said.length, 1, "and the console has the fault");
        });
    } finally {await shell.close();}
});

// The loop follows the keyboards the page may open (panel-loop-keyboards.test.js);
// the shell hands it each one plugged in or unplugged, after the event's
// other listeners.
test("each keyboard plugged in or unplugged reaches the loop, after the event", async () => {
    const shell = page();
    try {
        let changed = 0;
        shell.loop.keyboardsChanged = async () => {changed++;};
        shell.fire("connect");
        shell.fire("disconnect");
        assert.equal(changed, 0, "not inside the event");
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(changed, 2);
    } finally {await shell.close();}
});

test("the theme starts from a saved choice, then the system's", () => {
    assert.equal(initialTheme("light", false), "light");
    assert.equal(initialTheme("dark", true), "dark");
    assert.equal(initialTheme(null, true), "light");
    assert.equal(initialTheme("sepia", false), "dark");
});

test("the compiled defaults are kept in the page's storage, and a refusing storage keeps nothing", () => {
    const saved = new Map();
    const store = compiledDefaultsStore({getItem: key => saved.get(key) ?? null, setItem: (key, value) => {saved.set(key, value);}});
    assert.equal(store.get(), undefined);
    store.set("copy");
    assert.equal(saved.get(COMPILED_DEFAULTS_KEY), "copy");
    assert.equal(store.get(), "copy");
    const full = compiledDefaultsStore({getItem: () => {throw new Error("denied");}, setItem: () => {throw new Error("quota");}});
    assert.doesNotThrow(() => full.set("copy"));
    assert.equal(full.get(), undefined);
    assert.equal(compiledDefaultsStore(undefined).get(), undefined);
});

test("a chosen profile file has the portable document's size limit", async () => {
    assert.equal(await readProfileFile(undefined), undefined);
    const file = (size) => ({size, name: "mine.charybdis.json", text: async () => "{}"});
    assert.deepEqual(await readProfileFile(file(FILE_MAX_BYTES)), {text: "{}", name: "mine.charybdis.json"});
    await assert.rejects(readProfileFile(file(FILE_MAX_BYTES + 1)), /too large/);
});

test("a chosen text replacement list has its own formats and size limit", async () => {
    assert.deepEqual({accept: LIST_FILE.accept, max: LIST_FILE.max}, {accept: ".txt,.csv,.json,text/plain,text/csv,application/json", max: IMPORT_MAX_BYTES});
    const file = (size) => ({size, name: "typos.csv", text: async () => "teh,the"});
    assert.deepEqual(await readProfileFile(file(IMPORT_MAX_BYTES), LIST_FILE), {text: "teh,the", name: "typos.csv"});
    await assert.rejects(readProfileFile(file(IMPORT_MAX_BYTES + 1), LIST_FILE), /too large for a text replacement list/);
});

test("a stored recovery copy lists with what made it and its keyboard, an older one without", () => {
    const savedAt = "2026-10-06T09:14:03.512Z";
    assert.deepEqual(listed({id: 2, name: "recovery-x-before-save-home.charybdis.json", savedAt, cause: "save", keyboard: "Home", text: "{}"}),
        {id: 2, name: "recovery-x-before-save-home.charybdis.json", savedAt, cause: "save", keyboard: "Home"});
    assert.deepEqual(listed({id: 1, name: "recovery-2026-10-06T09-14-03-512Z.charybdis.json", savedAt, text: "{}"}),
        {id: 1, name: "recovery-2026-10-06T09-14-03-512Z.charybdis.json", savedAt});
});

// BroadcastChannel between the tabs of one test: a message reaches every
// other channel of the same name, later, as in a browser.
function tabs() {
    const open = new Set();
    return class {
        constructor(name) {this.name = name; this.onmessage = null; open.add(this);}
        postMessage(data) {
            for (const other of open) if (other !== this && other.name === this.name) setTimeout(() => other.onmessage?.({data}));
        }
        close() {open.delete(this);}
    };
}
const refusedLocks = () => ({request: async () => {throw new DOMException("The request was denied.", "SecurityError");}});
const blockedIn = (shell) => shell.models.at(-1).model.shell?.blocked ?? null;

// Without the lock the tabs still keep to one: they ask each other over a
// BroadcastChannel, which blocking site data leaves alone (web/tab-turn.mjs).
test("where the browser refuses the lock, a second tab waits and takes over when the first closes", async () => {
    const BroadcastChannel = tabs();
    const first = page({locks: refusedLocks(), BroadcastChannel});
    /** @type {ReturnType<typeof page> | undefined} */
    let opened;
    try {
        first.api.postMessage({type: "ready"});
        await delivered(first.models);
        assert.equal(blockedIn(first), null, "the first tab holds the keyboard");
        const second = opened = page({locks: refusedLocks(), BroadcastChannel});
        second.api.postMessage({type: "ready"});
        await delivered(second.models);
        assert.deepEqual(blockedIn(second), BLOCKED.otherTab, "the second is told Ark is open in another tab");
        const before = second.models.length;
        first.window.dispatchEvent(new Event("pagehide"));
        await delivered(second.models, before + 1);
        assert.equal(blockedIn(second), null, "and takes the keyboard over when the first closes");
        // A page the browser kept and brings back asks again, and gives way
        // to the tab that took the keyboard meanwhile.
        const shown = first.models.length;
        first.document.dispatchEvent(new Event("visibilitychange"));
        await delivered(first.models, shown + 1);
        assert.deepEqual(blockedIn(first), BLOCKED.otherTab, "the first, brought back, finds the second holds it");
        assert.equal(blockedIn(second), null);
    } finally {await first.close(); await opened?.close();}
});

test("two tabs opened at once without the lock leave the keyboard to one of them", async () => {
    const BroadcastChannel = tabs();
    const pages = [page({locks: refusedLocks(), BroadcastChannel}), page({locks: refusedLocks(), BroadcastChannel})];
    try {
        for (const shell of pages) shell.api.postMessage({type: "ready"});
        await Promise.all(pages.map((shell) => delivered(shell.models)));
        assert.deepEqual(pages.map(blockedIn).filter((blocked) => blocked === null).length, 1, "exactly one holds it");
        assert.deepEqual(pages.map(blockedIn).filter(Boolean), [BLOCKED.otherTab]);
    } finally {for (const shell of pages) await shell.close();}
});

// IndexedDB as far as a write that fails: the failed request's error event
// reaches the transaction while the transaction's own `error` is still null,
// as in a browser, and the transaction aborts with it after.
function failingDatabase(error) {
    const transaction = (_store, _mode) => {
        const tx = {error: null, oncomplete: null, onerror: null, onabort: null};
        const failing = () => {
            const request = {error};
            setTimeout(() => {
                tx.onerror?.({target: request});
                tx.error = error;
                tx.onabort?.({target: tx});
            });
            return request;
        };
        tx.objectStore = () => ({add: failing, delete: failing});
        return tx;
    };
    return {open: () => {
        const open = {result: {transaction}};
        setTimeout(() => open.onsuccess?.());
        return open;
    }};
}

test("a recovery copy or a delete the browser's storage refuses rejects with the browser's error, never with nothing", async () => {
    const quota = new DOMException("The quota has been exceeded.", "QuotaExceededError");
    const recoveries = openRecoveries(/** @type {any} */ (failingDatabase(quota)));
    await assert.rejects(recoveries.save({format: "charybdis-profile"}, {cause: "save", keyboard: "Home"}), (error) => error === quota);
    await assert.rejects(recoveries.delete(1), (error) => error === quota);
});

// The panel loop posts the catalog before a panel's first model and after
// each ready (core/session/panel-loop.js); a tab that reaches no keyboard
// answers ready itself, and so must post it too.
test("a tab that reaches no keyboard answers each ready with the catalog, then the model", async () => {
    const window = Object.assign(new EventTarget(), {URL, Blob, setTimeout});
    const posted = [];
    window.addEventListener("message", (event) => posted.push(event.data));
    const document = {documentElement: {dataset: {}}, visibilityState: "visible", addEventListener() {}};
    const shell = startWebShell({hid: undefined, document, window, build: {version: "test", commit: "test"}});
    try {
        shell.api.postMessage({type: "ready"});
        await delivered(posted, 2);
        assert.deepEqual(posted.map((message) => message.type), ["catalog", "model"]);
        assert.equal(posted[1].model.shell.blocked.title, BLOCKED.unsupported.title);
        assert.ok(!("qmkKeycodes" in posted[1].model), "the model leaves the catalog out");
        shell.api.postMessage({type: "ready"});
        await delivered(posted, 4);
        assert.deepEqual(posted.map((message) => message.type), ["catalog", "model", "catalog", "model"]);
    } finally {
        shell.panel.close();
        await shell.loop.close();
    }
});

test("the page says why a tab cannot reach a keyboard", () => {
    assert.match(BLOCKED.unsupported.title, /Chrome or Edge/);
    assert.match(BLOCKED.unsupported.detail, /HTTPS/);
    assert.match(BLOCKED.otherTab.title, /another tab/);
    // The demo needs no keyboard, so a browser without WebHID still offers it;
    // a tab waiting on another does not, since it takes the keyboard over.
    assert.equal(BLOCKED.unsupported.demo, true);
    assert.equal(BLOCKED.otherTab.demo, undefined);
});
