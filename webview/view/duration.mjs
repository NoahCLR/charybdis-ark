// @ts-check
// Human units for a millisecond setting. Unit changes never stage an edit.
/** @typedef {'seconds' | 'minutes'} DurationUnit */
/** @param {DurationUnit} unit */
const scale = unit => unit === "minutes" ? 60000 : 1000;

/** @param {string} milliseconds @returns {DurationUnit} */
export const durationUnit = milliseconds => Number(milliseconds) >= 60000 && Number(milliseconds) % 60000 === 0 ? "minutes" : "seconds";

/** @param {string} milliseconds @param {DurationUnit} unit */
export const durationValue = (milliseconds, unit) => String(Number(milliseconds) / scale(unit));

// Round decimal human units to the keyboard's nearest millisecond. Empty or
// malformed text never means zero; zero is an explicit stored value.
/** @param {string} value @param {DurationUnit} unit @returns {string | null} */
export function durationMilliseconds(value, unit) {
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
    const milliseconds = Math.round(Number(value) * scale(unit));
    return Number.isSafeInteger(milliseconds) ? String(milliseconds) : null;
}
