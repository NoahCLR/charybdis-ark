// @ts-check
'use strict';
const {test, expect} = require('@playwright/test');
const {openControls, publishAccepted} = require('./control-preview');
const updates = page => page.evaluate(() => window.__posted.filter(m => m.type === 'updateViaMacro'));
const draftHistory = page => page.evaluate(() => window.__posted.filter(m => ['undoProfileDraft', 'redoProfileDraft'].includes(m.type)));
const history = page => page.evaluate(async () => {
    const store = await import('/webview/store.mjs');
    const value = store.macroForm(store.state.macroSlot).stepHistory;
    return {undo: value?.past.length ?? 0, redo: value?.future.length ?? 0, clipboard: store.state.macroClipboard?.length ?? 0};
});
async function command(page, action) {
    await page.locator('[data-sequence-tiles]').focus();
    await page.keyboard.press({undo: 'Control+z', redo: 'Control+Shift+z', paste: 'Control+v'}[action]);
}


async function openMacro(page, payload = '{KC_A}{KC_C}') {
    await openControls(page, 'macros', {macroSlot: 'VIA_MACRO_17', macroEmptyOpen: true});
    await page.evaluate(async payload => {
        const store = await import('/webview/store.mjs'), model = structuredClone(store.getModel());
        Object.assign(model.viaMacros[17], {payload, bytes: 6, empty: false});
        Object.assign(model.draft, {canUndo: true, canRedo: true});
        store.setModel(model); store.resetDraftForms(); store.render();
        window.__posted.length = 0;
    }, payload);
}

test('undo restores a deleted macro step after host acceptance, and redo deletes it without draft history commands', async ({page}) => {
    await openMacro(page);
    const removedId = await page.locator('[data-step-tile="1"]').getAttribute('data-step-id');
    await page.locator('[data-step-tile="1"]').click(); await page.keyboard.press('Delete');
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('{KC_A}');
    await publishAccepted(page, ['viaMacros', 17, 'payload'], '{KC_A}');
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-step-tile]')).toHaveCount(2);
    await expect(page.locator('[data-step-tile="1"]')).toHaveAttribute('data-step-id', removedId);
    await expect(page.locator('[data-step-tile="1"]')).toBeFocused();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('{KC_A}{KC_C}');
    await publishAccepted(page, ['viaMacros', 17, 'payload'], '{KC_A}{KC_C}');
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('[data-step-tile]')).toHaveCount(1);
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('{KC_A}');
    expect(await draftHistory(page)).toEqual([]);
});

for (const modifier of ['Control', 'Meta']) {
    test(`${modifier} shortcuts undo deletion of the last step and never fall through to draft history when empty`, async ({page}) => {
        await openMacro(page, '{KC_A}');
        await page.locator('[data-step-tile="0"]').click(); await page.keyboard.press('Backspace');
        await expect(page.locator('.macro-empty')).toBeVisible();
        await page.keyboard.press(`${modifier}+z`);
        await expect(page.locator('[data-step-tile]')).toHaveCount(1);
        await page.keyboard.press(`${modifier}+z`); // Nothing left in this slot's history.
        await page.keyboard.press(`${modifier}+y`);
        await expect(page.locator('.macro-empty')).toBeVisible();
        expect(await draftHistory(page)).toEqual([]);
    });
}

test('clear, additions and reorders undo independently; a new edit drops redo', async ({page}) => {
    await openMacro(page);
    await page.locator('[data-step-tile="0"]').click();
    await page.locator('[data-step="0"] [data-move="1"]').click();
    await command(page, 'undo');
    await expect(page.locator('[data-step-tile="0"] .macro-token-label')).toHaveText('A');
    await command(page, 'redo');
    await expect(page.locator('[data-step-tile="0"] .macro-token-label')).toHaveText('C');
    await page.locator('[data-act="clear"]').click();
    await expect(page.locator('.macro-empty')).toBeVisible();
    await command(page, 'undo');
    await expect(page.locator('[data-step-tile]')).toHaveCount(2);
    await page.locator('[data-insert-kind="delay"]').click();
    expect((await history(page)).redo).toBe(0);
    await command(page, 'undo');
    await expect(page.locator('[data-step-tile]')).toHaveCount(2);
    await expect(page.locator('[data-step-tile="0"] .macro-token-label')).toHaveText('C');
    expect(await draftHistory(page)).toEqual([]);
});

test('field edits coalesce, invalid delay redo stays local, and a valid correction still posts', async ({page}) => {
    await openMacro(page, '{120}{KC_C}');
    await page.locator('[data-step-tile="0"]').click();
    const delay = page.locator('[data-step-delay]');
    await delay.fill('6'); await delay.fill('655'); await delay.fill('65536');
    await delay.press('Tab');
    await expect(page.locator('[data-macro-feedback]')).toContainText('65,535');
    expect(await updates(page)).toEqual([]);
    await command(page, 'undo');
    await expect(delay).toHaveValue('120');
    await expect(page.locator('[data-macro-feedback]')).toBeHidden();
    await command(page, 'redo');
    await expect(delay).toHaveValue('65536');
    await expect(page.locator('[data-macro-feedback]')).toContainText('not in your draft');
    expect(await updates(page)).toEqual([]);
    await delay.fill('250'); await delay.press('Tab');
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('{250}{KC_C}');
});

test('raw edits retain stable identities and invalid raw input is undoable without enabling paste', async ({page}) => {
    await openMacro(page);
    await page.locator('[data-step-tile="0"]').click(); await page.keyboard.press('Control+c');
    await page.locator('[data-raw-toggle]').click();
    const raw = page.locator('[data-raw-payload]');
    await raw.fill('{KC_A}{KC_C}{KC_ENT}'); await raw.press('Tab');
    const added = await page.locator('[data-step-tile="2"]').getAttribute('data-step-id');
    await page.locator('[data-step-tile="2"]').click();
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-step-tile]')).toHaveCount(2);
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('[data-step-tile="2"]')).toHaveAttribute('data-step-id', added);
    await expect(page.locator('[data-step-tile="2"]')).toBeFocused();
    await raw.fill('broken {'); await raw.press('Tab');
    const before = await updates(page);
    await command(page, 'paste');
    await expect(raw).toHaveValue('broken {');
    expect(await updates(page)).toEqual(before);
    await command(page, 'undo');
    await expect(raw).toHaveValue('{KC_A}{KC_C}{KC_ENT}');
});

test('Shift-click copy/paste preserves order, uses new identities, and paste/group deletion undo as single commands', async ({page}) => {
    await openMacro(page, '{KC_A}{50}{KC_C}');
    const ids = await page.locator('[data-step-id]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-step-id')));
    await page.locator('[data-step-tile="0"]').click();
    await page.locator('[data-step-tile="1"]').click({modifiers: ['Shift']});
    await expect(page.locator('[data-step-id][aria-pressed="true"]')).toHaveCount(2);
    await page.keyboard.press('Control+c');
    expect(await updates(page)).toEqual([]);
    await page.keyboard.press('Control+v');
    await expect(page.locator('[data-step-tile]')).toHaveCount(5);
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('{KC_A}{50}{KC_A}{50}{KC_C}');
    const newIds = await page.locator('[data-step-id]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-step-id')));
    expect(new Set(newIds).size).toBe(5);
    expect(newIds.filter(id => ids.includes(id))).toEqual(ids);
    await page.keyboard.press('Delete');
    await expect(page.locator('[data-step-tile]')).toHaveCount(3);
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-step-tile]')).toHaveCount(5);
    await expect(page.locator('[data-step-id][aria-pressed="true"]')).toHaveCount(2);
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-step-tile]')).toHaveCount(3);
    expect(await draftHistory(page)).toEqual([]);
});

test('select-all and clipboard work between slots while history stays per slot; a host reset clears stale history', async ({page}) => {
    await openMacro(page);
    await page.locator('[data-step-tile="0"]').click(); await page.keyboard.press('Control+a'); await page.keyboard.press('Control+c');
    await page.locator('[data-slot="VIA_MACRO_18"]').click();
    await command(page, 'paste');
    await expect(page.locator('[data-step-tile]')).toHaveCount(2);
    await page.locator('[data-slot="VIA_MACRO_17"]').click();
    expect((await history(page)).undo).toBe(0);
    await page.locator('[data-slot="VIA_MACRO_18"]').click();
    await command(page, 'undo');
    await expect(page.locator('.macro-empty')).toBeVisible();
    expect((await history(page)).redo).toBeGreaterThan(0);
    await page.evaluate(async () => {
        const store = await import('/webview/store.mjs');
        window.dispatchEvent(new MessageEvent('message', {data: {type: 'model', model: structuredClone(store.getModel()), resetDraftForms: true}}));
    });
    expect((await history(page)).undo).toBe(0);
    expect((await history(page)).redo).toBe(0);
    expect((await history(page)).clipboard).toBeGreaterThan(0);
});

test('read-only editors consume step undo/paste without sending draft history or edits; focus outside keeps draft shortcuts', async ({page}) => {
    await openMacro(page);
    await page.locator('[data-step-tile="0"]').click(); await page.keyboard.press('Control+c'); await page.keyboard.press('Delete');
    await page.evaluate(async () => {
        const store = await import('/webview/store.mjs'), model = store.getModel();
        store.setModel({...model, macroEditing: {...model.macroEditing, writable: false}}); store.render(); window.__posted.length = 0;
    });
    await page.locator('[data-step-tile="0"]').focus();
    await page.keyboard.press('Control+z'); await page.keyboard.press('Control+v');
    await expect(page.locator('[data-step-tile]')).toHaveCount(1);
    expect(await updates(page)).toEqual([]); expect(await draftHistory(page)).toEqual([]);
    await page.locator('[data-slot="VIA_MACRO_17"]').focus();
    await page.keyboard.press('Control+z');
    expect(await draftHistory(page)).toEqual([expect.objectContaining({type: 'undoProfileDraft'})]);
});

test('text fields keep native undo and clipboard while typing; renames/protection are not step history', async ({page}) => {
    await openMacro(page, 'hello');
    const field = page.locator('[data-step-text]');
    await field.focus(); await field.evaluate(node => node.setSelectionRange(node.value.length, node.value.length)); await field.pressSequentially('!');
    await expect(field).toHaveValue('hello!');
    await field.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+z`);
    await expect(field).toHaveValue('hello');
    expect(await draftHistory(page)).toEqual([]);
    const title = page.getByRole('textbox', {name: 'Macro name', exact: true});
    await title.fill('Rename'); await title.press('Enter');
    await page.locator('[data-protection]').selectOption('off');
    expect((await history(page)).undo).toBe(0);
});

test('during recording editor shortcuts are captured as chords, and the whole take is one step undo', async ({page}) => {
    await openMacro(page);
    await page.locator('[data-step-tile="0"]').click(); await page.keyboard.press('Control+c');
    await page.getByText('Record delays', {exact: true}).click();
    await page.locator('[data-act="record"]').click();
    await expect(page.locator('[data-macro-command]')).toHaveCount(0);
    for (const key of ['c', 'v', 'z', 'y']) await page.keyboard.press(`Meta+${key}`);
    await page.locator('[data-act="record"]').click();
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload.replace(/\{\d+\}/g, ''))).toBe('{KC_A}{KC_C}{KC_LGUI,KC_C}{KC_LGUI,KC_V}{KC_LGUI,KC_Z}{KC_LGUI,KC_Y}');
    expect(await draftHistory(page)).toEqual([]);
    await command(page, 'undo');
    await expect(page.locator('[data-step-tile]')).toHaveCount(2);
    await command(page, 'redo');
    await expect(page.locator('[data-step-tile]')).toHaveCount(6);
});

test('Ctrl/Meta-click selects disjoint steps; copying includes only selected steps in sequence order', async ({page}) => {
    await openMacro(page, '{KC_A}{50}{KC_C}');
    await page.locator('[data-step-tile="2"]').click();
    await page.locator('[data-step-tile="0"]').click({modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control']});
    await expect(page.locator('[data-step-id][aria-pressed="true"]')).toHaveCount(2);
    await page.keyboard.press('Control+c');
    await page.locator('[data-slot="VIA_MACRO_18"]').click();
    await command(page, 'paste');
    await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe('{KC_A}{KC_C}');
    await expect(page.locator('[data-step-tile]')).toHaveCount(2);
});

test('restoring while a host inspection is pending rejects its late reply and preserves the original draft', async ({page}) => {
    await openMacro(page);
    await page.evaluate(() => {
        window.__heldHistory = []; window.__historyDispatch = window.dispatchEvent.bind(window);
        window.dispatchEvent = event => {
            if (event.data?.type === 'macroValidation') {window.__heldHistory.push(event.data); return true;}
            return window.__historyDispatch(event);
        };
    });
    await page.locator('[data-step-tile="1"]').click(); await page.keyboard.press('Delete');
    await expect.poll(() => page.evaluate(() => window.__heldHistory.length)).toBe(1);
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-step-tile]')).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => window.__heldHistory.length)).toBe(2);
    await page.evaluate(() => {
        window.dispatchEvent = window.__historyDispatch;
        for (const reply of window.__heldHistory) window.dispatchEvent(new MessageEvent('message', {data: reply}));
    });
    await expect(page.locator('[data-macro-feedback]')).toBeHidden();
    expect(await updates(page)).toEqual([]);
});

test('pasting an unsupported key stays local, and a finished take followed by Clear take is separately undoable', async ({page}) => {
    await openMacro(page);
    await page.locator('[data-step-tile="0"]').click(); await page.keyboard.press('Control+c');
    await page.locator('[data-slot="VIA_MACRO_18"]').click();
    await page.evaluate(async () => {
        const store = await import('/webview/store.mjs'), model = store.getModel();
        store.setModel({...model, macroPayloadKeycodes: model.macroPayloadKeycodes.filter(key => key !== 'KC_A')});
        store.render(); window.__posted.length = 0;
    });
    await command(page, 'paste');
    await expect(page.locator('[data-macro-feedback]')).toContainText('not in your draft');
    expect(await updates(page)).toEqual([]);
    await page.keyboard.press('Control+z');
    await page.locator('[data-act="record"]').click(); await page.keyboard.press('b'); await page.locator('[data-act="record"]').click();
    await page.locator('[data-act="clear-take"]').click();
    await expect(page.locator('.macro-empty')).toBeVisible();
    await command(page, 'undo');
    await expect(page.locator('[data-step-tile]')).toHaveCount(1);
    await command(page, 'undo');
    await expect(page.locator('.macro-empty')).toBeVisible();
});

test('clicking an empty sequence gives shortcuts focus; paste replaces a blank Text starter without changing the clipboard', async ({page}) => {
    await openMacro(page, '{50}');
    await page.locator('[data-step-tile="0"]').click(); await page.keyboard.press('Control+c');
    await page.locator('[data-step-delay]').fill('250'); await page.locator('[data-step-delay]').press('Tab');
    await page.locator('[data-slot="VIA_MACRO_18"]').click();
    await page.locator('.macro-empty').click();
    await expect(page.locator('[data-sequence-tiles]')).toBeFocused();
    await page.keyboard.press('Control+v');
    await expect(page.locator('[data-step-delay]')).toHaveValue('50');
    await page.keyboard.press('Control+z');
    await expect(page.locator('.macro-empty')).toBeVisible();
    await page.locator('[data-insert-kind="text"]').click();
    await command(page, 'paste');
    await expect(page.locator('[data-step-tile]')).toHaveCount(1);
    await expect(page.locator('[data-step-text]')).toHaveCount(0);
    await expect(page.locator('[data-step-delay]')).toHaveValue('50');
});

for (const selection of ['range', 'disjoint']) {
    test(`deleting a ${selection} group focuses the next survivor and repeated Delete follows sequence order`, async ({page}) => {
        await openMacro(page, '{KC_A}{KC_B}{KC_C}{KC_D}{KC_E}');
        await page.locator('[data-step-tile="0"]').click();
        const last = selection === 'range' ? 1 : 2;
        await page.locator(`[data-step-tile="${last}"]`).click({modifiers: [selection === 'range' ? 'Shift' : process.platform === 'darwin' ? 'Meta' : 'Control']});
        await page.keyboard.press('Delete');
        await expect(page.locator('[data-step-tile]:focus .macro-token-label')).toHaveText(selection === 'range' ? 'C' : 'D');
        await page.keyboard.press('Delete');
        await expect(page.locator('[data-step-tile]:focus .macro-token-label')).toHaveText(selection === 'range' ? 'D' : 'E');
        await expect.poll(() => updates(page).then(rows => rows.at(-1)?.payload)).toBe(selection === 'range' ? '{KC_D}{KC_E}' : '{KC_B}{KC_E}');
    });
}

test('key picker and draft history dialog keep undo/redo away from the draft', async ({page}) => {
    await openMacro(page);
    await page.locator('[data-insert-kind="tap"]').click();
    const cancel = page.locator('.picker [data-act="cancel"]').first();
    await cancel.focus();
    await page.keyboard.press('Control+z'); await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('.picker')).toBeVisible();
    expect(await draftHistory(page)).toEqual([]);
    await cancel.click();
    await page.locator('.rail [data-act="history"]').click();
    await page.locator('.scrim button').first().focus();
    await page.keyboard.press('Control+z'); await page.keyboard.press('Control+y');
    expect(await draftHistory(page)).toEqual([]);
});
