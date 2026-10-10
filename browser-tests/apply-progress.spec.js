"use strict";
const {test, expect} = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

for (const screen of ["macros", "keys", "device"]) {
    test(`copy progress leaves the ${screen} editor intact and updates the save bar`, async ({page}) => {
        await page.goto("/preview/index.html");
        const coreFile = fs.readdirSync(path.join(__dirname, "../dist/web")).find(name => /^core-.*\.js$/.test(name));
        const result = await page.evaluate(async ({screen, coreFile}) => {
            const store = await import("/webview/store.mjs"), core = await import(`/dist/web/${coreFile}`);
            const model = structuredClone(store.getModel());
            model.draft.busy = true;
            model.device.health.busy = true;
            model.macroUnicode = {supported: true, mode: 1, enabled: true};
            const text = ' {"key": "{KC_A}"}\ncafé “hello” 🙂. ';
            const slot = model.viaMacros.find(slot => slot.keycode === "VIA_MACRO_17");
            slot.payload = text.replaceAll("{", "{{").replaceAll("}", "}}"); slot.empty = false;
            store.state.screen = screen; store.state.macroSlot = slot.keycode;
            store.setMacroForm(slot.keycode, {draft: slot.payload});
            window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
            const main = document.querySelector(".main"), content = main.querySelector(".content");
            const input = main.querySelector("[data-step-text]");
            const loop = core.openPanelLoop({post: message => window.dispatchEvent(new MessageEvent("message", {data: message}))},
                {adapter: {listDevices: async () => [], connect: async () => {throw Error("fixture must not connect");}}});
            loop.session.draft = {id: model.draft.id, revision: model.draft.revision};
            const progress = new core.ApplyProgress();
            progress.report("stage", {completed: 0, total: 1200});
            const before = window.__posted.length;
            for (let completed = 12; completed <= 1200; completed += 12) {
                progress.report("stage", {completed, total: 1200});
                loop.session.service.reportApplyProgress(progress.view());
            }
            const preserved = main === document.querySelector(".main") && content === document.querySelector(".content")
                && (!input || input === document.querySelector("[data-step-text]"));
            // Switching screens during the copy picks up the latest progress.
            store.state.screen = screen === "device" ? "macros" : "device"; store.render();
            const switched = document.querySelector(".ap-bytes").textContent;
            const stale = {type: "applyProgress", apply: {...progress.view(), detail: "STALE"}, draftId: "old draft", draftRevision: model.draft.revision};
            window.dispatchEvent(new MessageEvent("message", {data: stale}));
            stale.draftId = model.draft.id; stale.draftRevision--;
            window.dispatchEvent(new MessageEvent("message", {data: stale}));
            stale.draftRevision = model.draft.revision; stale.apply = {...stale.apply, id: progress.view().id - 1};
            window.dispatchEvent(new MessageEvent("message", {data: stale}));
            const staleIgnored = !document.querySelector(".main").textContent.includes("STALE");
            const posts = window.__posted.length - before;
            progress.finish(); loop.session.service.reportApplyProgress(progress.view());
            const readback = document.querySelector(".commit.readback")?.textContent;
            // A late update after the busy state ends must not resurrect a save.
            const ended = {...store.getModel(), apply: null, draft: {...model.draft, busy: false}};
            window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model: ended}}));
            stale.draftRevision = model.draft.revision;
            window.dispatchEvent(new MessageEvent("message", {data: stale}));
            return {preserved, switched, posts, staleIgnored, readback, applyAfterEnd: store.getModel().apply,
                localText: store.macroForm(slot.keycode).draft};
        }, {screen, coreFile});
        expect(result.preserved).toBe(true);
        expect(result.switched).toContain("1200 / 1200 bytes");
        expect(result.applyAfterEnd).toBeNull();
        expect(result.posts).toBe(0);
        expect(result.staleIgnored).toBe(true);
        expect(result.readback).toContain("Applied — reading back");
        expect(result.localText).toBe(' {{"key": "{{KC_A}}"}}\ncafé “hello” 🙂. ');
        await expect(page.locator(".commit.applying")).toHaveCount(0);
    });
}
