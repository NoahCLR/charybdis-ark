// @ts-check
// Whether a choice shows its options on screen (ui/segmented.mjs) or keeps
// them in a menu: on screen when there are two to four and their words fit
// one line together, so each is read without opening anything; more, or
// longer, stay a menu.
export const ON_SCREEN_MAX_OPTIONS = 4;
export const ON_SCREEN_MAX_CHARACTERS = 60;

/** @param {readonly string[]} labels the options' words, as shown */
export const onScreenChoice = (labels) => labels.length >= 2 && labels.length <= ON_SCREEN_MAX_OPTIONS
    && labels.reduce((total, label) => total + label.length, 0) <= ON_SCREEN_MAX_CHARACTERS;

// Options to draw, [value, words], with the stored value first as one more,
// "… · as stored", when it is none of them, so the choice still shows what the
// keyboard holds, and a form that reads every field back sends it unchanged
// rather than the first option. No stored value adds none.
/**
 * @template {string | number} V
 * @param {readonly (readonly [V, string])[]} choices @param {V | null | undefined} current
 * @returns {(readonly [V, string])[]}
 */
export function storedChoices(choices, current) {
    if (current === null || current === undefined || choices.some(([value]) => String(value) === String(current))) return [...choices];
    return [[current, `${current} · as stored`], ...choices];
}

// A setting's choices as options to draw (storedChoices).
/** @param {{value: unknown, choices?: readonly (string | number | {value: string | number, label?: string})[]}} field @returns {[string, string][]} */
export function settingOptions(field) {
    const choices = (field.choices || []).map((choice) => /** @type {[string, string]} */ (typeof choice === "object" ? [String(choice.value), choice.label ?? String(choice.value)] : [String(choice), String(choice)]));
    return /** @type {[string, string][]} */ (storedChoices(choices, String(field.value)));
}
