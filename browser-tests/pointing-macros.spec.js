"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted} = require("./control-preview");
const {document} = require("../tests/fixtures/pd-profile");
const {fingerprint, summary, validateSnapshot} = require("../core/model/portable-profile");
const {ProfileDraftSession} = require("../core/session/profile-draft-session");
const {buildSnapshotModel} = require("../core/session/device-model");
const {draftBinding} = require("../core/session/panel-session-state");

for (const theme of ["vscode-dark", "vscode-light"]) {
    test(`pointing macro picks stage directions, diagonals and buttons (${theme})`, async ({page}) => {
        const value = document();
        const capabilities = {compiledLayerCount: 16, supportedDomainMask: 31, actionAbiDigest: value.actionAbiDigest, featureFlags: 1 << 29};
        const draft = new ProfileDraftSession({document: value, fingerprint: fingerprint(value), summary: summary(value)}, "board", capabilities);
        const connection = {connected: true, selectedDeviceId: "board", capabilities};
        draft.stage({type: "updateViaMacro", keycode: "VIA_MACRO_0", payload: "777", name: "Greeting <&>", draftId: draft.id, draftRevision: draft.revision});
        const publish = async () => {
            const editing = draftBinding({draft}, connection);
            const patch = {...buildSnapshotModel(draft.current, capabilities, editing, connection), draft: {...draft.view(connection), ...editing}};
            await page.evaluate(async patch => {
                const store = await import("/webview/store.mjs");
                store.setModel({...store.getModel(), ...patch}); store.render();
            }, patch);
        };
        const stagePosts = async () => {
            const messages = await posted(page);
            expect(messages).toHaveLength(1);
            draft.stage(messages[0]);
            await publish();
            return messages[0];
        };
        await openControls(page, "pointing", {pdSlot: 4, pdAdvanced: true}, theme);
        await publish();
        await clearPosts(page);
        await page.locator('[data-f="pointing:4:axis"]').selectOption("3");
        await stagePosts();

        for (const [field, macro] of [["dir:left", 0], ["diag:upLeft", 127]]) {
            await clearPosts(page);
            await page.locator(`label:has(input[data-f="pointing:4:${field}"]) button`).click();
            const picker = page.getByRole("dialog", {name: "Pick a keycode"});
            await picker.locator('[data-sec="macros"]').click();
            await expect(picker.locator("[data-pick]")).toHaveCount(128);
            if (macro === 0) await expect(picker).toContainText("Greeting <&>");
            await picker.locator(`[data-pick="VIA_MACRO_${macro}"]`).click();
            await picker.locator('[data-mod="C"]').click();
            await expect(picker.locator('[data-act="use"]')).toBeDisabled();
            await picker.locator('[data-mod="C"]').click();
            await picker.locator('[data-act="use"]').click();
            const message = await stagePosts();
            const [group, name] = field.split(":");
            expect(message.config[group === "dir" ? "directions" : "diagonals"][name])
                .toEqual({keycode: `VIA_MACRO_${macro}`, modifierPolicy: 0, mask: 0});
            await expect(page.locator(`[data-f="pointing:4:${field}"]`)).toHaveValue(`VIA_MACRO_${macro}`);
        }
        await expect(page.locator(".pd-cross")).toContainText("Greeting <&>");
        await expect(page.locator(".pd-cross")).toContainText("empty: does nothing yet");
        await expect(page.locator(".pd-cross")).toContainText("Busy triggers are dropped");
        await expect(page.locator('[data-f="pointing:4:dirPolicy:left"]')).toHaveCount(0);
        await expect(page.locator('[data-f="pointing:4:diagPolicy:upLeft"]')).toHaveCount(0);
        await expect(page.locator(".pd-taps")).toContainText("The macro continues after its trigger");

        await clearPosts(page);
        await page.locator('[data-f="pointing:4:directionOutput"]').selectOption("1");
        await stagePosts();
        await expect(page.locator(".pd-cross")).not.toContainText("Busy triggers are dropped");
        // Button 2 already taps a shortcut in the fixture. Choose a macro there.
        await clearPosts(page);
        await page.locator('label:has(input[data-f="pointing:4:button:1:tap"]) button').click();
        const picker = page.getByRole("dialog", {name: "Pick a keycode"});
        await picker.locator('[data-sec="macros"]').click();
        await picker.locator('[data-pick="VIA_MACRO_0"]').click();
        await picker.locator('[data-act="use"]').click();
        const message = await stagePosts();
        expect(message.config.buttons[1].tap).toEqual({keycode: "VIA_MACRO_0", modifierPolicy: 0, mask: 0});
        expect(validateSnapshot(draft.document).pdModes[4].buttons[1].tap.keycode).toBe(0x7700);
        await expect(page.locator(".pd-buttons")).toContainText("Inherit modifiers · the macro continues after its trigger");

        // Both capability gates remain independent, and old firmware retains
        // the imported outputs for review while offering no new macros.
        capabilities.featureFlags = 1 << 28;
        draft.acceptCapabilities(capabilities);
        await publish();
        expect(draft.hasBlockers()).toBe(true);
        await page.locator('label:has(input[data-f="pointing:4:dir:left"]) button').click();
        const legacyPicker = page.getByRole("dialog", {name: "Pick a keycode"});
        await expect(legacyPicker.locator('[data-sec="macros"]')).toHaveCount(0);
        await legacyPicker.locator('[data-f="picker:search"]').fill("Greeting");
        await expect(legacyPicker.locator("[data-pick]")).toHaveCount(0);
    });
}
