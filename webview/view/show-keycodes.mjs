// @ts-check
// Whether a QMK keycode is shown beside the words for a key (decisions R2, §3).
//
// Keycodes are always shown where you act on one: the Key tab's Keycode
// field, the picker's footer expression, "Where it is stored", a macro's raw
// payload and a review value's tooltip. Everywhere else they are a muted
// suffix the Show keycodes preference turns on: one remembered switch, off by
// default. Search matches QMK names whichever way it is set.
//
// Every surface asks here, by the place it draws, so the rule has one home.

/** The places a keycode is always shown, whatever the preference. */
export const ALWAYS = Object.freeze(["keycodeField", "pickerFooter", "stored", "rawPayload", "reviewTooltip"]);
/** The places the Show keycodes preference governs. */
export const OPTIONAL = Object.freeze(["hover", "behaviourRow", "behaviourTitle", "behaviourCell", "comboSends",
    "pointingDirection", "stackRow", "pickerButton", "settingsHint", "reachRow", "placeBar"]);

/** @typedef {typeof ALWAYS[number] | typeof OPTIONAL[number]} KeycodePlace */

/** @param {{showKeycodes?: boolean} | null | undefined} state @param {KeycodePlace} place */
export function keycodeShown(state, place) {
    if (ALWAYS.includes(place)) return true;
    if (!OPTIONAL.includes(place)) throw new Error(`Unknown keycode place: ${place}`);
    return Boolean(state?.showKeycodes);
}

// The keycode to print beside a key's words at a place: empty when the
// preference hides it there, or when it would only repeat the words.
/** @param {{showKeycodes?: boolean} | null | undefined} state @param {KeycodePlace} place @param {string | null | undefined} keycode @param {string} [words] */
export function keycodeAside(state, place, keycode, words) {
    const code = String(keycode ?? "");
    if (!code || code === words || !keycodeShown(state, place)) return "";
    return code;
}
