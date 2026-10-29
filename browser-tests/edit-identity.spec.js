// @ts-check
"use strict";
const {test, expect} = require("@playwright/test");
const {openControls, clearPosts, posted, change} = require("./control-preview");

// An edit that names what it was drawn from (expectedBase, the draft's
// profile identity, or expectedFingerprint, its fingerprint) takes it from
// the model its form was drawn with. That is the draft's newest only if an
// open form is drawn again from each model the core publishes. Here the model
// changes while each form below is open: the form is drawn again, still
// showing what it showed, and what it posts next names the new draft.

// Another edit accepted, as the core publishes it: the draft's next revision,
// and a new fingerprint for every editor that names it. The preview never
// applies edits itself (control-preview.js publishAccepted).
/** @param {import("@playwright/test").Page} page */
const anotherEdit = (page) => page.evaluate(async () => {
    const {getModel} = await import("/webview/store.mjs");
    const model = structuredClone(getModel());
    const revision = ++model.draft.revision, fingerprint = `unrelated-edit-${revision}`;
    model.profileIdentity = {...model.profileIdentity, generation: revision, digest: fingerprint};
    for (const editing of [model.macroEditing, model.settingsEditing, model.customKeyEditing, model.keyboardName]) editing.identity = fingerprint;
    window.dispatchEvent(new MessageEvent("message", {data: {
        type: "model", model,
        acceptedEdit: {message: {type: "updateLayoutKeys"}, previousFingerprint: "before", fingerprint},
    }}));
    return {revision, base: model.profileIdentity, fingerprint};
});

// The keyboard back under a new device id (core/session/keyboard-reconnect.js
// followKeyboard): the draft follows it with no new revision, so only the
// half its identity names changes, and no edit or notice comes with it.
/** @param {import("@playwright/test").Page} page */
const followedKeyboard = (page) => page.evaluate(async () => {
    const {getModel} = await import("/webview/store.mjs");
    const model = structuredClone(getModel());
    model.profileIdentity = {...model.profileIdentity, originHalf: `${model.profileIdentity.originHalf}-again`};
    window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model}}));
    return {revision: model.draft.revision, base: model.profileIdentity, fingerprint: model.macroEditing.identity};
});

/** @type {[string, typeof anotherEdit, ReadonlyArray<"base" | "fingerprint">][]} */
const changes = [["another edit", anotherEdit, ["base", "fingerprint"]], ["the keyboard followed under a new device id", followedKeyboard, ["base"]]];

// A title renamed as a person does: typed, then kept with Enter.
/** @param {import("@playwright/test").Page} page @param {string} field @param {string} name */
const rename = async (page, field, name) => {
    await page.locator(field).fill(name);
    await page.locator(field).press("Enter");
};

/** @param {import("@playwright/test").Page} page */
const pickModifiersForCustomKey = async (page) => {
    for (const mod of ["C", "S", "RCTL", "RSFT"]) await page.locator(`.picker [data-mod="${mod}"]`).click();
    await page.locator('.picker [data-act="use-custom-key"]').click();
};

/**
 * One form: where it is, how to open it (`open`, before the other edit), the
 * control it shows (`shown`), and how its edit is made
 * (`commit`, after). `names` is which identity the edit carries, and
 * `thenNamesBase` that the edit it carries (D-L63) names the draft's too.
 * @typedef {{name: string, screen: string, state?: object, open?: (page: import("@playwright/test").Page) => Promise<void>,
 *     shown: string, commit: (page: import("@playwright/test").Page) => Promise<void>, type: string, names: "base" | "fingerprint", thenNamesBase?: boolean}} Form
 */
/** @type {Form[]} */
const forms = [
    // Names, typed and kept once the other edit has drawn the title again.
    {name: "keyboard name", screen: "device", shown: '[data-f="keyboard:name"]',
        commit: page => rename(page, '[data-f="keyboard:name"]', "Desk"), type: "renameKeyboard", names: "fingerprint"},
    {name: "custom key name", screen: "customKeys", state: {customKey: "CUSTOM_KEY_3"}, shown: '[data-f="custom-key:3:name"]',
        commit: page => rename(page, '[data-f="custom-key:3:name"]', "Copy line"), type: "updateCustomKey", names: "fingerprint"},
    {name: "macro name", screen: "macros", state: {macroSlot: "MACRO_17"}, shown: '[data-f="macro:MACRO_17:name"]',
        commit: page => rename(page, '[data-f="macro:MACRO_17:name"]', "Sign off"), type: "updateMacro", names: "fingerprint"},

    // Custom keys and macros.
    {name: "custom key shortcut, cleared", screen: "customKeys", state: {customKey: "CUSTOM_KEY_1"}, shown: '[data-f="custom-key:1:shortcut"]',
        open: page => page.evaluate(async () => {
            const store = await import("/webview/store.mjs");
            const model = structuredClone(store.getModel());
            Object.assign(model.customKeys[1], {shortcut: {mods: 0x01, keys: [0x0e], layers: 0, layerKind: 0}, shortcutLabel: "Left Ctrl + K"});
            store.setModel(model); store.render();
        }),
        commit: page => page.locator('[data-act="clear-shortcut"]').click(), type: "updateCustomKeyShortcut", names: "fingerprint"},
    {name: "macro protection", screen: "macros", state: {macroSlot: "MACRO_17"}, shown: '[data-f="macro:MACRO_17:protection"]',
        commit: page => page.locator('[data-f="macro:MACRO_17:protection"]').selectOption("off"), type: "updateMacro", names: "fingerprint"},
    {name: "macro steps, as raw text", screen: "macros", state: {macroSlot: "MACRO_17"}, shown: '[data-f="macro:MACRO_17:raw"]',
        open: page => page.locator("[data-raw-toggle]").click(),
        commit: page => change(page.locator("[data-raw-payload]"), "{KC_A}{KC_C}"), type: "updateMacro", names: "fingerprint"},

    // Settings sections, saved whole.
    {name: "a settings section", screen: "combos", shown: '[data-f="setting:combosEnabled"]',
        commit: page => page.locator('label:has([data-f="setting:combosEnabled"])').click(), type: "updateConfigDefaults", names: "fingerprint"},
    {name: "combo layer matching", screen: "combos", shown: '[data-f="setting:comboReference1"]',
        commit: page => page.locator('[data-f="setting:comboReference1"]').selectOption("Layer 0"), type: "updateConfigDefaults", names: "fingerprint"},
    {name: "default combo window", screen: "combos", shown: '[data-f="settings:combo:default"]',
        commit: page => change(page.locator('[data-f="settings:combo:default"]'), 77), type: "updateComboDefaultWindow", names: "base"},
    {name: "combo hold threshold", screen: "combos", shown: '[data-f="settings:combo:hold"]',
        commit: page => change(page.locator('[data-f="settings:combo:hold"]'), 233), type: "updateComboHoldTerm", names: "base"},
    {name: "lighting power", screen: "lighting", state: {stage: "base"}, shown: '[data-f="setting:lightingEnabled"]',
        commit: page => page.locator('label:has([data-f="setting:lightingEnabled"])').click(), type: "updateConfigDefaults", names: "fingerprint"},
    {name: "background effect speed", screen: "lighting", state: {stage: "base"}, shown: '[data-f="setting:effectSpeed"]',
        commit: page => page.locator('[data-f="setting:effectSpeed"]').evaluate(node => {
            /** @type {HTMLInputElement} */ (node).value = "77"; node.dispatchEvent(new Event("change", {bubbles: true}));
        }), type: "updateConfigDefaults", names: "fingerprint"},
    {name: "key feedback flash", screen: "lighting", state: {stage: "key"}, shown: '[data-f="setting:feedbackFlash"]',
        commit: page => change(page.locator('[data-f="setting:feedbackFlash"]'), 77), type: "updateConfigDefaults", names: "fingerprint"},
    {name: "auto-mouse hold", screen: "lighting", state: {stage: "auto"}, shown: '[data-f="lighting:auto:mouseFadeHold"]',
        commit: page => page.locator('[data-f="lighting:auto:mouseFadeHold"]').evaluate(node => {
            /** @type {HTMLInputElement} */ (node).value = "77"; node.dispatchEvent(new Event("change", {bubbles: true}));
        }), type: "updateConfigDefaults", names: "fingerprint"},

    // Behaviours.
    {name: "behaviour timing", screen: "keys", state: {tab: "behaviours", behaviourRow: "KC_LEFT_GUI"}, shown: '[data-f="behaviour:KC_LEFT_GUI:timing:tapHoldTerm"]',
        commit: page => change(page.locator('[data-f="behaviour:KC_LEFT_GUI:timing:tapHoldTerm"]'), 177), type: "saveBehavior", names: "base"},
    {name: "behaviour on or off", screen: "keys", state: {tab: "behaviours", behaviourRow: "KC_LEFT_GUI"}, shown: '[data-f="behaviour:KC_LEFT_GUI:definition:enabled"]',
        commit: page => page.locator('label:has([data-f="behaviour:KC_LEFT_GUI:definition:enabled"])').click(), type: "saveBehavior", names: "base"},
    {name: "behaviour removed", screen: "keys", state: {tab: "behaviours", behaviourRow: "KC_LEFT_GUI"}, shown: '[data-f="behaviour:KC_LEFT_GUI:anchor"]',
        commit: page => page.locator('[data-act="remove"]').click(), type: "deleteBehavior", names: "base"},
    {name: "behaviour cell", screen: "customKeys", state: {customKey: "CUSTOM_KEY_5"}, shown: '[data-f="behaviour:CUSTOM_KEY_5:0-hold:action"]',
        open: page => page.locator('.custom-key-behaviour [data-cell="0-hold"]').click(),
        commit: page => change(page.locator('[data-f="behaviour:CUSTOM_KEY_5:0-hold:action"]'), "KC_B"), type: "saveBehavior", names: "base"},
    // The picker stays open across the other edit; what it hands back is
    // posted with the model of the moment it is used.
    {name: "behaviour moved to another key, in the picker", screen: "keys", state: {tab: "behaviours", behaviourRow: "KC_LEFT_GUI"}, shown: "#pickerSearch",
        open: page => page.locator('[data-act="rekey"]').click(),
        commit: async page => {
            await page.locator('.picker [data-remove="0"]').click();
            await page.locator("#pickerSearch").fill("KC_F13");
            await page.locator('.picker [data-pick="KC_F13"]').first().click();
            await page.locator('.picker [data-act="use"]').click();
        }, type: "retargetBehavior", names: "base"},
    {name: "custom key made for a layout key, in the picker", screen: "keys", shown: "#pickerSearch",
        open: async page => {
            await page.evaluate(async () => (await import("/webview/ui/keys/key-edits.mjs")).pickKeycodeFor(27));
            await page.locator('.picker [data-remove="0"]').click();
        },
        commit: pickModifiersForCustomKey, type: "updateCustomKeyShortcut", names: "fingerprint"},
    {name: "custom key made for a behaviour cell, in the picker", screen: "customKeys", state: {customKey: "CUSTOM_KEY_5"}, shown: "#pickerSearch",
        open: async page => {
            await page.locator('.custom-key-behaviour [data-cell="0-hold"]').click();
            await page.locator('.cell-editor [data-act="pick"]').click();
        },
        commit: pickModifiersForCustomKey, type: "updateCustomKeyShortcut", names: "fingerprint", thenNamesBase: true},
    {name: "custom key made for a combo output, kept with the combo", screen: "keys", state: {tab: "combos"}, shown: "[data-output]",
        open: async page => {
            await page.getByRole("button", {name: "New combo", exact: true}).click();
            await page.locator('[data-act="pickout"]').click();
            await pickModifiersForCustomKey(page);
            await page.evaluate(async () => {
                const store = await import("/webview/store.mjs");
                store.state.combo.inputs = ["KC_A", "KC_B"]; store.render();
            });
        },
        commit: page => page.locator('.combo-builder [data-act="keep"]').click(), type: "updateCustomKeyShortcut", names: "fingerprint"},

    // Pointing modes.
    {name: "pointing mode", screen: "pointing", state: {pointingSlot: 0}, shown: '[data-f="pointing:0:name"]',
        commit: page => change(page.locator('[data-f="pointing:0:name"]'), "Trackball"), type: "savePdMode", names: "base"},
    {name: "pointing mode cleared", screen: "pointing", state: {pointingSlot: 0}, shown: '[data-f="pointing:0:name"]',
        commit: page => page.locator('[data-act="clear"]').click(), type: "clearPdMode", names: "base"},
    {name: "pointing mode duplicated", screen: "pointing", state: {pointingSlot: 0}, shown: '[data-f="pointing:0:name"]',
        commit: page => page.locator('[data-act="duplicate"]').click(), type: "duplicatePdMode", names: "base"},
    {name: "new pointing mode", screen: "pointing", state: {pointingSlot: 20}, shown: '[data-f="pointing:20:copy"]',
        commit: page => page.locator("[data-new]").first().click(), type: "savePdMode", names: "base"},
    {name: "pointing mode copied into an empty slot", screen: "pointing", state: {pointingSlot: 20}, shown: '[data-f="pointing:20:copy"]',
        commit: page => page.locator('[data-act="duplicate"]').click(), type: "duplicatePdMode", names: "base"},
];

for (const [cause, publish, carried] of changes) {
    for (const form of forms.filter(entry => carried.includes(entry.names) || (entry.thenNamesBase && carried.includes("base")))) {
        test(`${form.name}: drawn again after ${cause}, it posts the new draft's identity`, async ({page}) => {
            await openControls(page, form.screen, form.state);
            if (form.open) await form.open(page);
            const shown = page.locator(form.shown);
            await expect(shown).toHaveCount(1);
            const before = await shown.evaluate(node => /** @type {HTMLInputElement} */ (node).value);
            const old = await shown.elementHandle();
            const after = await publish(page);
            // Drawn again from the new model, still showing what it showed.
            expect(await old?.evaluate(node => node.isConnected)).toBe(false);
            await expect(shown).toHaveValue(before);
            await clearPosts(page);
            await form.commit(page);
            const sent = () => posted(page).then(rows => rows.filter(row => row.type !== "validateMacro"));
            await expect.poll(sent).toEqual([expect.objectContaining({type: form.type, draftRevision: after.revision,
                ...(form.names === "base" ? {expectedBase: after.base} : {expectedFingerprint: after.fingerprint}),
                ...(form.thenNamesBase ? {then: expect.objectContaining({expectedBase: after.base})} : {})})]);
        });
    }
}
