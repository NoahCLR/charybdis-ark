"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted} = require("./control-preview");
const {document} = require("../tests/fixtures/pd-profile");
const {fingerprint, summary, validateSnapshot} = require("../core/model/portable-profile");
const {ProfileDraftSession} = require("../core/session/profile-draft-session");
const {buildSnapshotModel} = require("../core/session/device-model");
const {draftBinding} = require("../core/session/panel-session-state");
const {PROFILE_WIRE_KNOWN_MASKS} = require("../core/protocol/profile-wire-v1");

for (const theme of ["dark", "light"]) {
    test(`pointing macro picks stage directions and diagonals (${theme})`, async ({page}) => {
        const value = document();
        const capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 2}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: value.actionAbiDigest, featureFlags: PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES};
        const draft = new ProfileDraftSession({document: value, fingerprint: fingerprint(value), summary: summary(value)}, "board", capabilities);
        const connection = {connected: true, selectedDeviceId: "board", capabilities};
        draft.stage({type: "updateMacro", keycode: "MACRO_0", payload: "777", name: "Greeting <&>", draftId: draft.id, draftRevision: draft.revision});
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
            await picker.locator(`[data-pick="MACRO_${macro}"]`).click();
            await picker.locator('[data-mod="C"]').click();
            await expect(picker.locator('[data-act="use"]')).toBeDisabled();
            await picker.locator('[data-mod="C"]').click();
            await picker.locator('[data-act="use"]').click();
            const message = await stagePosts();
            const [group, name] = field.split(":");
            expect(message.config[group === "dir" ? "directions" : "diagonals"][name])
                .toEqual({keycode: `MACRO_${macro}`, modifierPolicy: 0, mask: 0});
            await expect(page.locator(`[data-f="pointing:4:${field}"]`)).toHaveValue(macro === 0 ? "Greeting <&>" : "Macro 127");
        }
        await expect(page.locator(".pd-cross")).toContainText("Empty macro: does nothing yet");
        await expect(page.locator(".pd-cross")).toContainText("Busy triggers are dropped");
        await expect(page.locator('[data-f="pointing:4:dirPolicy:left"]')).toHaveCount(0);
        await expect(page.locator('[data-f="pointing:4:diagPolicy:upLeft"]')).toHaveCount(0);
        await expect(page.locator(".pd-taps")).toContainText("The macro continues after its trigger");

        await clearPosts(page);
        await page.locator('[data-f="pointing:4:directionOutput"]').selectOption("1");
        await stagePosts();
        await expect(page.locator(".pd-cross")).not.toContainText("Busy triggers are dropped");
        expect(validateSnapshot(draft.document).pdModes[4].directions.left.keycode).toBe(0x7700);
    });
}
