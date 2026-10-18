// @ts-check
// What the panel remembers about how it is shown, per host, between sessions:
// whether QMK keycodes are shown beside names, whether the board is hidden on
// Keys and Lighting, and whether a behaviour's grid shows every tap count. They live in the host's own panel state
// (acquireVsCodeApi().getState / setState): VS Code keeps it with the panel,
// and the web page in its own storage (web/panel-channel.mjs). Nothing here
// is part of a profile, so none of it is ever posted to the keyboard.

/** @typedef {{showKeycodes: boolean, hideBoard: boolean, allTapCounts: boolean}} Preferences */

/** @type {Readonly<Preferences>} */
export const DEFAULT_PREFERENCES = Object.freeze({showKeycodes: false, hideBoard: false, allTapCounts: false});

/** @param {unknown} value @returns {Record<string, unknown>} */
const record = (value) => (value && typeof value === "object" && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : {});

// The remembered preferences in a stored panel state. Anything missing or of
// the wrong kind falls back to its default, so an old or damaged state never
// stops the panel opening.
/** @param {unknown} stored @returns {Preferences} */
export function readPreferences(stored) {
    const saved = record(record(stored).preferences);
    return {
        showKeycodes: typeof saved.showKeycodes === "boolean" ? saved.showKeycodes : DEFAULT_PREFERENCES.showKeycodes,
        hideBoard: typeof saved.hideBoard === "boolean" ? saved.hideBoard : DEFAULT_PREFERENCES.hideBoard,
        allTapCounts: typeof saved.allTapCounts === "boolean" ? saved.allTapCounts : DEFAULT_PREFERENCES.allTapCounts,
    };
}

// The stored panel state with one preference changed, keeping everything
// else the host stored beside it.
/** @param {unknown} stored @param {keyof Preferences} name @param {boolean} value */
export function withPreference(stored, name, value) {
    const base = record(stored);
    return {...base, preferences: {...readPreferences(base), [name]: Boolean(value)}};
}
