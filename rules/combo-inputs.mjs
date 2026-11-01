// @ts-check

// Which keys press a combo's inputs, and whether they form its chord. A combo
// fires on keycodes (process_combo.c): a key presses an input the combo stores
// by name when it stores that keycode or means it, and the keyboard reports
// per-layer input positions only when its firmware tracks them, so those come
// first when it does. A chord forms once the keys pressed cover every input;
// an input placed on two keys can be pressed on either. Core's combo reach and
// the interface's view of the layers a person turns on both ask this (D-L73).

/** @typedef {{readonly layoutIndex: number, readonly keycode: string, readonly semantic?: string}} ComboKey */
/** @typedef {{readonly inputs?: readonly string[], readonly inputPositions?: readonly number[]}} ComboInputs */

/** What a key means: its semantic name, or the keycode it stores. */
export const keyMeaning = (/** @type {Partial<ComboKey> | null | undefined} */ key) => key?.semantic || key?.keycode || "";

/** Whether a key presses the input a combo stores by this name. */
export const inputOn = (/** @type {string} */ name, /** @type {ComboKey} */ key) => name === key.keycode || name === keyMeaning(key);

/** Whether the keyboard reports where a combo's inputs are, rather than only their keycodes. */
const placed = (/** @type {ComboInputs | null | undefined} */ combo) => Array.isArray(combo?.inputPositions) && combo.inputPositions.length > 0;

/** Whether a key is one of a combo's inputs: by its input positions when the keyboard reports them, otherwise by keycode. */
export const comboTouches = (/** @type {ComboInputs | null | undefined} */ combo, /** @type {ComboKey} */ key) => placed(combo)
    ? /** @type {readonly number[]} */ (combo?.inputPositions).includes(key.layoutIndex)
    : (combo?.inputs || []).some((input) => inputOn(input, key));

/** Whether a key is a combo's input number `at`, by the same rule. */
export const comboInputIsKey = (/** @type {ComboInputs | null | undefined} */ combo, /** @type {number} */ at, /** @type {ComboKey} */ key) => placed(combo)
    ? /** @type {readonly number[]} */ (combo?.inputPositions)[at] === key.layoutIndex
    : inputOn(combo?.inputs?.[at] ?? "", key);

/** The input of a combo a key presses, by the name the combo stores. */
export const inputPressed = (/** @type {ComboInputs | null | undefined} */ combo, /** @type {ComboKey} */ key) =>
    (combo?.inputs || []).find((name) => inputOn(name, key)) ?? key.keycode;

/**
 * The keys among these that press one of a combo's inputs, how many distinct
 * inputs they cover, and whether that forms its chord.
 *
 * @template {ComboKey} K
 * @param {readonly K[]} keys
 * @param {ComboInputs | null | undefined} combo
 * @returns {{keys: K[], covered: number, forms: boolean}}
 */
export function comboKeysAmong(keys, combo) {
    const touched = keys.filter((key) => comboTouches(combo, key));
    const covered = new Set(touched.map((key) => inputPressed(combo, key))).size;
    const inputs = (combo?.inputs || []).length;
    return {keys: touched, covered, forms: inputs > 0 && covered >= inputs};
}
