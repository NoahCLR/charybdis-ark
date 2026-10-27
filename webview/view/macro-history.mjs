// @ts-check
/** @typedef {import('../state.js').MacroHistoryEntry} Entry */
/** @typedef {import('../state.js').MacroHistory} History */
const LIMIT = 100;
/** @param {Entry} entry @returns {Entry} */
const copy = entry => structuredClone(entry);
/** @param {Entry} entry */
const content = entry => JSON.stringify([entry.payload, entry.steps]);
/** @param {Entry} entry @returns {History} */
export const createMacroHistory = entry => ({past: [], present: copy(entry), future: [], group: null});
/** @param {History} history @param {Entry} entry @param {string | null} [group] @returns {History} */
export function rememberMacroHistory(history, entry, group = null) {
    if (content(history.present) === content(entry)) return {...history, present: copy(entry)};
    if (group && group === history.group && history.past.length && content(history.past[history.past.length - 1]) === content(entry)) {
        return {past: history.past.slice(0, -1), present: copy(entry), future: [], group: null};
    }
    const past = group && group === history.group ? history.past : [...history.past, copy(history.present)].slice(-LIMIT);
    return {past, present: copy(entry), future: [], group};
}
/** @param {History} history @param {'undo' | 'redo'} action @returns {History} */
export function moveMacroHistory(history, action) {
    if (action === 'undo') {
        if (!history.past.length) return {...history, group: null};
        return {past: history.past.slice(0, -1), present: copy(history.past[history.past.length - 1]), future: [copy(history.present), ...history.future], group: null};
    }
    if (!history.future.length) return {...history, group: null};
    return {past: [...history.past, copy(history.present)].slice(-LIMIT), present: copy(history.future[0]), future: history.future.slice(1), group: null};
}
