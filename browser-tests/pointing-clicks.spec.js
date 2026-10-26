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
    test(`pointing picks post and stage mouse buttons 3/4 (${theme})`, async ({page}) => {
        const value = document();
        const capabilities = {protocol: {major: 2, minor: 0}, schema: {major: 4, minor: 1}, compiledLayerCount: 16, supportedDomainMask: 127, actionAbiDigest: value.actionAbiDigest, featureFlags: PROFILE_WIRE_KNOWN_MASKS.CURRENT_PAIR_FEATURES};
        const draft = new ProfileDraftSession({document: value, fingerprint: fingerprint(value), summary: summary(value)}, "board", capabilities);
        const connection = {connected: true, selectedDeviceId: "board", capabilities};
        const publish = async () => {
            const editing = draftBinding({draft}, connection);
            const patch = {...buildSnapshotModel(draft.current, capabilities, editing, connection), draft: {...draft.view(connection), ...editing}};
            await page.evaluate(async patch => {
                const store = await import("/webview/store.mjs");
                store.setModel({...store.getModel(), ...patch}); store.render();
            }, patch);
        };
        await openControls(page, "pointing", {pdSlot: 4}, theme);
        await publish();
        for (const [direction, button] of [["left", 3], ["right", 4]]) {
            await clearPosts(page);
            await page.locator(`label:has(input[data-f="pointing:4:dir:${direction}"]) button`).click();
            const picker = page.getByRole("dialog", {name: "Pick a keycode"});
            await picker.locator('[data-sec="mouse"]').click();
            await expect(picker.locator("[data-pick]")).toHaveCount(8);
            await picker.locator(`[data-pick="QK_MOUSE_BUTTON_${button}"]`).click();
            await picker.locator('[data-mod="C"]').click();
            await expect(picker.locator('[data-act="use"]')).toBeDisabled();
            await expect(picker).toContainText("Only keyboard keys take modifiers here");
            await picker.locator('[data-mod="C"]').click();
            await picker.locator('[data-act="use"]').click();
            const messages = await posted(page);
            expect(messages).toHaveLength(1);
            expect(messages[0]).toMatchObject({type: "savePdMode", slot: 4,
                config: {directions: {[direction]: {keycode: `QK_MOUSE_BUTTON_${button}`, modifierPolicy: 0, mask: 0}}}});
            draft.stage(messages[0]);
            expect(validateSnapshot(draft.document).pdModes[4].directions[direction].keycode).toBe(0xd0 + button);
            await publish();
            await expect(page.locator(`[data-f="pointing:4:dir:${direction}"]`)).toHaveValue(`Mouse Button ${button}`);
        }
        // A QMK name or alias typed into a field stages that keycode; the
        // fields left as shown keep theirs.
        for (const [direction, typed] of [["up", "MS_BTN3"], ["down", "QK_MOUSE_BUTTON_3"]]) {
            await clearPosts(page);
            const input = page.locator(`[data-f="pointing:4:dir:${direction}"]`);
            await input.fill(typed);
            await input.dispatchEvent("change");
            const messages = await posted(page);
            expect(messages).toHaveLength(1);
            expect(messages[0].config.directions).toMatchObject({[direction]: {keycode: typed}, left: {keycode: "QK_MOUSE_BUTTON_3"}, right: {keycode: "QK_MOUSE_BUTTON_4"}});
            draft.stage(messages[0]);
            expect(validateSnapshot(draft.document).pdModes[4].directions[direction].keycode).toBe(0xd3);
            await publish();
            await expect(input).toHaveValue("Mouse Button 3");
        }
        expect(draft.changes().find(row => row.unit === "pd:4").fields.filter(field => ["Left", "Right"].includes(field.label)).map(field => field.after))
            .toEqual(["Mouse Button 3 · Inherit modifiers", "Mouse Button 4 · Inherit modifiers"]);
    });
}
