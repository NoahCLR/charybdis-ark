"use strict";
const {test, expect} = require("@playwright/test");
const {openPreview} = require("./host-page");
const {buildDeviceModel} = require("../core/session/device-model");
const {resolve} = require("../core/data/keycode-catalog");
const {hostKeyLabel} = require("../core/model/key-names");

async function sendHost(page, hostOs) {
    const keycodes = [0xe3,0xe6,0x1c04,0x3804,0x502c];
    const patch = buildDeviceModel({settingsView:{host:{effective:hostOs}},layout:{state:"read",layers:[{layer:0,keys:keycodes.map((keycode,layoutIndex)=>({keycode,layoutIndex,resolved:resolve(keycode)}))}]}});
    await page.evaluate(patch => {
        const model=structuredClone(window.__hostBase);
        for(const key of ["vocabulary","qmkKeyLabels","qmkKeycodes","qmkKeycodeAliases"]) model[key]=patch[key];
        window.dispatchEvent(new MessageEvent("message",{data:{type:"model",model}}));
    },patch);
    return patch;
}
for(const theme of ["vscode-dark","vscode-light"]) {
    test(`open editors refresh names through production model messages (${theme})`,async({page})=>{
        await openPreview(page, theme);
        await page.evaluate(async()=>{
            const s=await import('/webview/store.mjs');
            const base=structuredClone(s.getModel());
            base.combos=[{id:0,inputs:['KC_LGUI','KC_RALT'],inputDisplays:['stale GUI','stale Alt'],output:'KC_A'}];
            base.pdModes[0].heldModifiers=132;
            base.pdModes[0].buttons[0]={kind:3,modifiers:132,tap:{keycode:0,modifierPolicy:0,mask:0}};
            window.__hostBase=base;
            s.openComboBuilder(base.combos[0]);s.state.tab='combos';s.state.screen='keys';
        });
        for(const host of [1,2,3,0]) {
            await sendHost(page,host);
            await expect(page.locator('#comboSide [data-remove="KC_LGUI"]').locator('..')).toContainText(hostKeyLabel('Left GUI',host));
            await expect(page.locator('#comboSide [data-remove="KC_RALT"]').locator('..')).toContainText(hostKeyLabel('Right Alt',host));
        }
        await page.evaluate(async()=>{
            const picker=await import('/webview/ui/picker.mjs');
            picker.openPicker({title:'Host switch',contextKeycode:'KC_LGUI',seed:['KC_A'],onPick:keycode=>window.__picked=keycode});
        });
        await page.locator('[data-mod="RGUI"]').click();
        for(const host of [1,2,3,0,1]) {
            const model=await sendHost(page,host);
            for(const {value,label} of model.vocabulary.pickerModifiers) await expect(page.locator(`[data-mod="${value}"]`)).toHaveText(label);
            await expect(page.locator('.picker .sheet-h')).toContainText(hostKeyLabel('Left GUI',host));
            await expect(page.locator('[data-mod="RGUI"]')).toHaveClass(/on/);
            await expect(page.locator('.picker [data-remove="0"]')).toContainText('KC_A');
            await expect(page.locator('.pkb-key[data-pick="KC_LGUI"]')).toHaveAttribute('aria-label',hostKeyLabel('Left GUI',host));
            await expect(page.locator('.pkb-key[data-pick="KC_RALT"]')).toContainText(hostKeyLabel('Alt',host));
            await page.locator('#pickerSearch').fill('SC_LAPO');
            const cadet=page.locator('[data-pick="QK_SPACE_CADET_LEFT_ALT_PARENTHESIS_OPEN"]');
            await expect(cadet).toContainText(hostKeyLabel('Left Alt/(',host));
            await expect(cadet).toHaveAccessibleName(new RegExp(hostKeyLabel('Left Alt',host)));
            await page.locator('#pickerSearch').fill('');
        }
        await page.locator('.picker [data-act="use"]').click();
        expect(await page.evaluate(()=>window.__picked)).toBe('RGUI(KC_A)');
        await page.evaluate(async()=>{const s=await import('/webview/store.mjs');s.state.screen='pointing';s.state.pdAdvanced=true;s.render();});
        for(const host of [1,2,3,0]) {
            await sendHost(page,host);
            await expect(page.getByRole('checkbox',{name:hostKeyLabel('Right GUI',host),exact:true}).first()).toHaveAttribute('aria-label',hostKeyLabel('Right GUI',host));
            await expect(page.locator('.pd-advanced')).toContainText(`${hostKeyLabel('Left Alt',host)}, ${hostKeyLabel('Right GUI',host)}`);
        }
        await page.evaluate(async()=>{
            const s=await import('/webview/store.mjs');
            s.state.screen='macros';s.state.macroSlot='VIA_MACRO_0';s.setMacroForm('VIA_MACRO_0',{draft:'{+KC_RGUI}{KC_LGUI,KC_RALT}{-KC_RGUI}'});s.render();
        });
        for(const host of [1,2,3,0]) {
            await sendHost(page,host);
            await expect(page.locator('.macro-step .tok').nth(0)).toHaveText(hostKeyLabel('Right GUI',host));
            await expect(page.locator('.macro-step .tok').nth(1)).toHaveText(`${hostKeyLabel('Left GUI',host)} + ${hostKeyLabel('Right Alt',host)}`);
            await expect(page.locator('.macro-step .tok').nth(2)).toHaveText(hostKeyLabel('Right GUI',host));
        }
        await page.evaluate(async()=>{const s=await import('/webview/store.mjs');s.setMacroForm('VIA_MACRO_0',{draft:'{+KC_RALT}'});s.render();});
        for(const host of [1,2,3,0]) {
            await sendHost(page,host);
            await expect(page.locator('.unavailable').filter({hasText:'before the macro ends'})).toContainText(hostKeyLabel('Right Alt',host));
        }
    });
}
for(const theme of ['vscode-dark','vscode-light']) {
    test(`behaviour retarget picker keeps current host context and posts its stable assignment (${theme})`,async({page})=>{
        await openPreview(page, theme);
        await page.evaluate(async()=>{
            const s=await import('/webview/store.mjs');
            const base=structuredClone(s.getModel());
            base.keyBehaviors=[{...base.keyBehaviors[0],keycode:'KC_LEFT_GUI'}];
            window.__hostBase=base;
            s.state.screen='keys';s.state.tab='behaviours';s.state.behaviourRow='KC_LEFT_GUI';
            window.__posted.length=0;
        });
        await sendHost(page,1);
        await page.locator('[data-act="rekey"]').click();
        // The actual screen opens this picker; never restore or replace its state.
        for(const host of [1,2,3,0]) {
            await sendHost(page,host);
            await expect(page.locator('.picker .sheet-h')).toContainText(hostKeyLabel('Left GUI',host));
            await expect(page.locator('.picker [data-remove="0"]')).toContainText('KC_LEFT_GUI');
        }
        await page.locator('.picker [data-act="clear"]').click();
        await page.locator('.pkb-key[data-pick="KC_A"]').click();
        await page.locator('.picker [data-act="use"]').click();
        const posted=await page.evaluate(()=>window.__posted.find(m=>m.type==='retargetBehavior'));
        expect(posted).toEqual(expect.objectContaining({keycode:'KC_LEFT_GUI',target:'KC_A'}));
    });
}

for(const theme of ['vscode-dark','vscode-light']) {
    test(`cell-action picker resolves live context and posts the selected code (${theme})`,async({page})=>{
        await openPreview(page, theme);
        await page.evaluate(async()=>{
            const s=await import('/webview/store.mjs');
            const base=structuredClone(s.getModel());
            base.keyBehaviors=[{...base.keyBehaviors[0],keycode:'KC_LEFT_GUI'}];
            window.__hostBase=base;s.state.screen='keys';s.state.tab='behaviours';s.state.behaviourRow='KC_LEFT_GUI';
            window.__posted.length=0;
        });
        await sendHost(page,1);
        await page.locator('[data-cell]').first().click();
        await page.locator('.cell-editor [data-act="pick"]').click();
        for(const host of [1,2,3,0]) {
            await sendHost(page,host);
            await expect(page.locator('.picker .sheet-h')).toContainText(hostKeyLabel('Left GUI',host));
            await expect(page.locator('.picker .sheet-h')).toContainText('tap');
        }
        await page.locator('.picker [data-act="clear"]').click();
        await page.locator('.pkb-key[data-pick="KC_A"]').click();
        await page.locator('.picker [data-act="use"]').click();
        const posted=await page.evaluate(()=>window.__posted.find(m=>m.type==='saveBehavior'));
        expect(posted.behavior.keycode).toBe('KC_LEFT_GUI');
        expect(posted.behavior.steps[0].tap.action).toBe('KC_A');
    });
}
