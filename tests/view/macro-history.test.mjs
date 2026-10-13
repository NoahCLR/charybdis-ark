// @ts-check
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMacroHistory, rememberMacroHistory, moveMacroHistory} from '../../webview/view/macro-history.mjs';
const entry = (payload, steps = []) => ({payload, steps, selectedStep: steps[0]?.focusId ?? null, selectedSteps: steps.map(step => step.focusId)});

test('macro history owns snapshots and restores a deleted step with its identity and selection', () => {
    const steps = [{kind: 'tap', keys: ['KC_C'], focusId: 'copy'}], original = entry('{KC_C}', steps);
    let history = createMacroHistory(original);
    steps[0].keys.push('KC_A');
    history = rememberMacroHistory(history, entry(''));
    const undone = moveMacroHistory(history, 'undo');
    assert.deepEqual(undone.present.steps, [{kind: 'tap', keys: ['KC_C'], focusId: 'copy'}]);
    assert.deepEqual(undone.present.selectedSteps, ['copy']);
    assert.equal(history.present.payload, '');
    const redone = moveMacroHistory(undone, 'redo');
    assert.equal(redone.present.payload, '');
    assert.equal(redone.future.length, 0);
});

test('typing coalesces within a field, a boundary separates edits, and returning to the starting value drops a no-op group', () => {
    let history = createMacroHistory(entry('hello'));
    history = rememberMacroHistory(history, entry('hello!'), 'text');
    history = rememberMacroHistory(history, entry('hello!!'), 'text');
    assert.equal(history.past.length, 1);
    assert.equal(moveMacroHistory(history, 'undo').present.payload, 'hello');
    history = rememberMacroHistory(history, entry('hello'), 'text');
    assert.equal(history.past.length, 0);
    history = rememberMacroHistory(history, entry('hello!'), 'text');
    history = rememberMacroHistory({...history, group: null}, entry('hello!!'), 'text');
    assert.equal(moveMacroHistory(history, 'undo').present.payload, 'hello!');
});

test('new edits discard redo, selection alone does not create history, and incomplete step states remain recoverable', () => {
    const base = entry('hello'), first = rememberMacroHistory(createMacroHistory(base), entry('world'));
    const undone = moveMacroHistory(first, 'undo');
    const selected = rememberMacroHistory(undone, {...base, selectedStep: 'other'});
    assert.equal(selected.future.length, 1);
    assert.equal(selected.past.length, 0);
    const invalid = entry('', [{kind: 'delay', delay: '65536', focusId: 'invalid'}]);
    const branched = rememberMacroHistory(selected, invalid);
    assert.equal(branched.future.length, 0);
    assert.deepEqual(moveMacroHistory(moveMacroHistory(branched, 'undo'), 'redo').present, invalid);
});

test('macro history keeps at most 100 commands and a blank Text action is distinct from an empty canvas', () => {
    let history = createMacroHistory(entry(''));
    history = rememberMacroHistory(history, entry('', [{kind: 'text', text: '', focusId: 'blank'}]));
    assert.equal(history.past.length, 1);
    for (let i = 0; i < 120; i++) history = rememberMacroHistory(history, entry(String(i)));
    assert.equal(history.past.length, 100);
    assert.equal(moveMacroHistory(history, 'undo').present.payload, '118');
});
