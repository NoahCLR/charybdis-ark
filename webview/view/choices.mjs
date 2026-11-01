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

// A setting's choices as options to draw, [value, words], with its stored
// value first as one more, "… · as stored", when it is none of them, so the
// choice still shows what the keyboard holds.
/** @param {{value: unknown, choices?: readonly (string | number | {value: string | number, label?: string})[]}} field @returns {[string, string][]} */
export function settingOptions(field) {
    const choices = (field.choices || []).map((choice) => typeof choice === "object" ? {value: choice.value, label: choice.label ?? String(choice.value)} : {value: choice, label: String(choice)});
    const known = choices.some((choice) => String(choice.value) === String(field.value));
    return [...(known ? [] : [/** @type {[string, string]} */ ([String(field.value), `${field.value} · as stored`])]),
        ...choices.map((choice) => /** @type {[string, string]} */ ([String(choice.value), choice.label]))];
}
