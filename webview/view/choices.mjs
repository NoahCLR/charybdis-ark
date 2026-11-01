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
