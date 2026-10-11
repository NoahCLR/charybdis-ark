// @ts-check
// The panel's state is declared one field at a time: its starting value, and
// what becomes of it when the host replaces the draft under it: undo, redo, a
// jump, discard, rebase, Apply, an import, another keyboard or the demo (the
// host's model then carries resetDraftForms).
//
// Each field explicitly keeps its value, resets to its starting value, or
// computes its replacement from the state before the change (`resetsTo`).
// The decision sits beside the field, so a new one cannot be added without
// making it. The store owns which policy fits a particular field.

/** @typedef {"keep" | "reset"} DraftChangePolicy */
/**
 * What a field becomes when the draft is replaced: kept, reset to its starting
 * value, or the value a function makes from it and the state before the change.
 * @template T, S
 * @typedef {DraftChangePolicy | ((value: T, before: S) => T)} DraftChange
 */
/** @template T, S @typedef {{initial: T, draftChange: DraftChange<T, S>}} StateField */
/** @template S @typedef {{[K in keyof S]-?: StateField<S[K], S>}} StateFields */

/** Kept when the draft changes: navigation, preferences, selections that are not edits.
 * @template T @param {T} initial @returns {{initial: T, draftChange: "keep"}} */
export const kept = (initial) => ({initial, draftChange: "keep"});

/** Back to its starting value when the draft changes: a form holding an edit not yet staged.
 * @template T @param {T} initial @returns {{initial: T, draftChange: "reset"}} */
export const resets = (initial) => ({initial, draftChange: "reset"});

/** Reset by a rule of its own when the draft changes, given the state before the change.
 * @template T, S @param {T} initial @param {(value: T, before: S) => T} next @returns {StateField<T, S>} */
export const resetsTo = (initial, next) => ({initial, draftChange: next});

/** @param {unknown} field */
const declared = (field) => {
    const change = /** @type {{draftChange?: unknown} | null} */ (field)?.draftChange;
    return change === "keep" || change === "reset" || typeof change === "function";
};

/**
 * A fresh state from its declarations. A field without a draft-change decision
 * is refused rather than given one.
 * @template S @param {StateFields<S>} fields @returns {S}
 */
export function initialState(fields) {
    const entries = Object.entries(fields);
    const undeclared = entries.filter(([, field]) => !declared(field)).map(([name]) => name);
    if (undeclared.length) throw new Error(`State fields without a draft-change decision: ${undeclared.join(", ")}`);
    return /** @type {S} */ (Object.fromEntries(entries.map(([name, field]) =>
        [name, structuredClone(/** @type {StateField<unknown, S>} */ (field).initial)])));
}

/**
 * The fields a draft change replaces, each computed from the state before it,
 * so one field's rule sees the others as they were. Kept fields are absent.
 * @template S @param {StateFields<S>} fields @param {S} before @returns {Partial<S>}
 */
export function afterDraftChange(fields, before) {
    /** @type {Record<string, unknown>} */
    const next = {};
    for (const [name, field] of /** @type {[string, StateField<unknown, S>][]} */ (Object.entries(fields))) {
        const change = field.draftChange;
        if (change === "keep") continue;
        next[name] = change === "reset" ? structuredClone(field.initial)
            : change(/** @type {Record<string, unknown>} */ (before)[name], before);
    }
    return /** @type {Partial<S>} */ (next);
}

/**
 * Each field's decision by name, for reading and pinning: "keep", "reset" or
 * "custom" for a rule of its own.
 * @template S @param {StateFields<S>} fields @returns {Record<string, DraftChangePolicy | "custom">}
 */
export const draftChangePolicies = (fields) => Object.fromEntries(Object.entries(fields).map(([name, field]) => {
    const change = /** @type {StateField<unknown, S>} */ (field).draftChange;
    return [name, typeof change === "function" ? "custom" : change];
}));
