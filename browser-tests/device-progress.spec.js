// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const {document} = require("../tests/fixtures/pd-profile");
const {PROFILE_WIRE_KNOWN_MASKS} = require("../core/protocol/profile-wire-v1");

for (const {screen, source, initial} of [
    {screen: "macros", source: "layout"}, {screen: "keys", source: "layout"},
    {screen: "device", source: "layout"}, {screen: "macros", source: "profile"},
    {screen: "macros", source: "layout", initial: true},
]) {
    test(`${initial ? "initial read" : "readback"} of ${source} preserves the ${screen} screen between replies`, async ({page}) => {
        await page.goto("/preview/index.html");
        const coreFile = fs.readdirSync(path.join(__dirname, "../dist/web")).find(name => /^core-.*\.js$/.test(name));
        const result = await page.evaluate(async ({screen, source, initial, coreFile, doc, featureFlags}) => {
            const store = await import("/webview/store.mjs"), core = await import(`/dist/web/${coreFile}`);
            let models = 0, readContent, preserved = true, replies = 0, lastBar = "", lastProgress, staleIgnored = true;
            const beforePosts = window.__posted.length;
            const loop = core.openPanelLoop({post: message => {
                if (message.type === "model") models++;
                if (message.type === "readProgress") lastProgress = message;
                window.dispatchEvent(new MessageEvent("message", {data: message}));
            }}, {adapter: {listDevices: async () => [], connect: async () => {throw Error("fixture must not connect");}}});
            const service = loop.session.service;
            service.connectionPublicId = "fixture"; service.connectionToken = 1;
            service.capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 1}, reportSize: 32, statusPageCount: 2, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: 0x7fecec81, featureFlags};
            if (!initial) service.portable = {document: doc};
            const bytes = core.portable.validateSnapshot(doc).candidate, metadata = core.Buffer.alloc(25);
            // Payload metadata layout 2 (Profile Wire 2): a 32-bit length.
            metadata[0] = 2; metadata[1] = 25; metadata.writeUInt32LE(bytes.length, 2);
            metadata.writeUInt32LE(core.profileBlob.fnv1a32(bytes), 10);
            metadata.writeUInt32LE(core.profileBlob.crc32(bytes), 14); metadata[18] = 4; metadata[20] = 127;
            let requestId = 0; service.requestIds = {next: () => (++requestId % 255) + 1};
            service.connection = {connected: true, request: async report => {
                if (!readContent) readContent = document.querySelector(".content");
                else preserved &&= readContent === document.querySelector(".content");
                if (replies) lastBar = document.querySelector(initial ? ".read-placeholder" : ".commit")?.textContent;
                if (replies === 20 && lastProgress) {
                    const before = store.getModel();
                    for (const key of ["operationId", "phase", "connectionToken", "selectedDeviceId"]) {
                        const stale = structuredClone(lastProgress);
                        stale.read[key] = "stale";
                        window.dispatchEvent(new MessageEvent("message", {data: stale}));
                        staleIgnored &&= before === store.getModel();
                    }
                    for (const key of ["draftId", "draftRevision"]) {
                        window.dispatchEvent(new MessageEvent("message", {data: {...lastProgress, [key]: "stale"}}));
                        staleIgnored &&= before === store.getModel();
                    }
                    store.state.screen = "device"; store.render();
                    staleIgnored &&= document.querySelector(initial ? ".read-placeholder" : ".commit").textContent === lastBar;
                    readContent = document.querySelector(".content");
                }
                replies++;
                const identity = core.Buffer.alloc(25); identity[0] = 1; identity[1] = 2;
                identity.writeUInt16LE(0x31, 2); identity[24] = 0;
                // Running compiled defaults: status must identify the bytes
                // served below, including the check after the last chunk.
                for (const offset of [4, 8, 12]) identity.writeUInt32LE(core.profileBlob.fnv1a32(bytes), offset);
                const page = report[4];
                const payload = report[2] === 2 ? (page ? core.Buffer.alloc(25) : identity)
                    : page ? bytes.subarray((page - 1) * 25, page * 25) : metadata;
                const response = core.Buffer.from(report); response.fill(0, 5);
                response[6] = payload.length; payload.copy(response, 7); return response;
            }};
            if (initial) loop.session.readBusy = true;
            else {
                loop.session.portableBusy = true; loop.session.applyRunning = true; loop.session.postApplyReadStep = source;
            }
            const apply = new core.ApplyProgress(); apply.finish(); service.liveApply = apply.view();
            store.state.screen = screen;
            const localText = ' {{"key": "{{KC_A}}"}}\ncafé “hello” 🙂. ';
            store.state.macroSlot = "MACRO_17";
            loop.serviceChanged();
            store.setMacroForm("MACRO_17", {draft: localText}); store.render();
            const start = performance.now();
            if (source === "layout") await service.readLayout();
            else await service.readCommittedProfile();
            const elapsed = performance.now() - start;
            const ended = store.getModel();
            window.dispatchEvent(new MessageEvent("message", {data: lastProgress}));
            staleIgnored &&= ended === store.getModel();
            return {preserved, models, replies, elapsed, lastBar, progress: lastProgress?.read.progress,
                layoutMatches: source !== "layout" || service.layout.layers.every(({layer, keys}) => keys.every(key => key.keycode === core.portable.validateSnapshot(doc).layers[layer][key.row * 6 + key.column])),
                profileBytes: bytes.length, staleIgnored, error: service.error?.message,
                localTextPreserved: store.macroForm("MACRO_17").draft === localText,
                posts: window.__posted.length - beforePosts};
        }, {screen, source, initial, coreFile, doc: document(), featureFlags: PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES});
        expect(result.error).toBeUndefined();
        if (source === "layout") {
            // Two payload metadata pages, plus status before and after read.
            expect(result.replies).toBe(Math.ceil(result.profileBytes / 25) + 6);
            expect(result.progress).toMatchObject({done: result.profileBytes, total: result.profileBytes});
            expect(result.lastBar).toContain(`of ${result.profileBytes}`);
        } else expect(result.lastBar).toContain(`${result.profileBytes} of ${result.profileBytes}`);
        expect(result.preserved).toBe(true);
        expect(result.staleIgnored).toBe(true);
        expect(result.localTextPreserved).toBe(true);
        expect(result.layoutMatches).toBe(true);
        expect(result.posts).toBe(0);
        expect(result.models).toBeLessThan(10);
    });
}

test("read phase changes keep the editor, while content and permissions redraw it", async ({page}) => {
    await page.goto("/preview/index.html");
    const result = await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        store.state.screen = "macros";
        const model = structuredClone(store.getModel());
        model.draft.busy = true;
        model.draft.editable = false;
        model.draft.reason = "busy";
        model.device.health.busy = true;
        model.portable.busy = true;
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
        const editor = document.querySelector(".content");
        store.setMacroForm("MACRO_17", {draft: 'literal café “hello” 🙂'});
        const phase = structuredClone(model);
        phase.device.health.phase = "read-profile";
        phase.load.phase = "read-profile"; phase.load.operationId++;
        phase.diagnostics = ["Updated read diagnostics"];
        phase.postApplyRead = {step: "profile", progress: {done: 25, total: 100}};
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model: phase}}));
        const preserved = editor === document.querySelector(".content");
        const keyNames = structuredClone(phase);
        keyNames.vocabulary.keyLabels = {KC_LALT: "Changed host label"};
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model: keyNames}}));
        const namesRedraw = editor !== document.querySelector(".content");
        const afterNames = document.querySelector(".content");
        const idle = structuredClone(keyNames);
        Object.assign(idle.draft, {busy: false, editable: true, reason: ""});
        idle.portable.busy = false;
        idle.device.health.busy = false;
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model: idle}}));
        return {preserved, namesRedraw, permissionRedraw: afterNames !== document.querySelector(".content"),
            formKept: store.macroForm("MACRO_17").draft === 'literal café “hello” 🙂'};
    });
    expect(result).toEqual({preserved: true, namesRedraw: true, permissionRedraw: true, formKept: true});
});


test("phase words render from the model while progress and saving use stable IDs", async ({page}) => {
    await page.goto("/preview/index.html");
    const result = await page.evaluate(async () => {
        const store = await import("/webview/store.mjs");
        const original = structuredClone(store.getModel());
        const loading = structuredClone(original);
        loading.vocabulary.phases["read-layout"].read = "Published read words";
        Object.assign(loading.load, {state: "loading", phase: "read-layout", progress: {done: 2, total: 4}});
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model: loading}}));
        const read = document.querySelector(".read-placeholder").textContent;
        const saving = structuredClone(original);
        saving.vocabulary.phases["restore-complete"].label = "Published restore label";
        saving.vocabulary.phases["restore-complete"].busy = "Published saving words";
        Object.assign(saving.draft, {busy: true, editable: false, reason: "busy"});
        Object.assign(saving.device.health, {busy: true, phase: "restore-complete"});
        window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model: saving}}));
        const commit = document.querySelector(".commit").textContent;
        const rail = document.querySelector(".rail-keyboard .dot.busy")?.getAttribute("data-tip") || "";
        store.state.screen = "device"; store.render();
        const device = document.querySelector(".content").textContent;
        return {read, commit, rail, device};
    });
    expect(result.read).toContain("Published read words · 2 of 4");
    expect(result.commit).toContain("Published saving words");
    expect(result.commit).toContain("until both halves confirm");
    expect(result.rail).toContain("Published restore label");
    expect(result.device).toContain("Published restore label");
});
