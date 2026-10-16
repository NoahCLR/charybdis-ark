// @ts-check
/** @typedef {{h?: string | number, s?: string | number, v?: string | number} | null | undefined} Colour */

// Colour, exactly as the keyboard means it.
//
// The device stores HSV in QMK's 0–255 space and the model hands it over as
// strings. Everything that turns those numbers into pixels goes through here,
// so one rule decides what a colour looks like and when a legend is black.

/** @param {Colour} colour @returns {[number, number, number]} */
export const hsv = (colour) => colour
    ? [Number(colour.h) || 0, Number(colour.s) || 0, Number(colour.v) || 0]
    : [0, 0, 0];

/** @param {Colour} colour */
export const isOff = (colour) => hsv(colour)[2] === 0;

/** @param {Colour} colour */
export function rgb(colour) {
    const [h255, s255, v255] = hsv(colour);
    const h = h255 * 360 / 255, s = s255 / 255, v = v255 / 255;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [r, g, b].map((channel) => Math.round((channel + m) * 255));
}

/** @param {Colour} colour */
export const css = (colour) => `rgb(${rgb(colour).join(", ")})`;

/** @param {Colour} colour */
export const label = (colour) => {
    const [h, s, v] = hsv(colour);
    return `HSV(${h}, ${s}, ${v})`;
};

/** @param {unknown} value */
export const brightnessLimit = (value) => typeof value === "number" && Number.isInteger(value)
    ? Math.max(0, Math.min(255, value))
    : 255;

/** @param {unknown} value @param {number} maximum */
const clamp = (value, maximum) => Math.max(0, Math.min(maximum, Math.round(Number(value) || 0)));

/** @param {readonly unknown[]} channels @param {unknown} maximumBrightness */
export function clampHsv(channels, maximumBrightness) {
    const maximum = brightnessLimit(maximumBrightness);
    return {h: clamp(channels[0], 255), s: clamp(channels[1], 255), v: clamp(channels[2], maximum)};
}

/** @param {unknown} value @param {unknown} maximumBrightness */
export function valuePercent(value, maximumBrightness) {
    const maximum = brightnessLimit(maximumBrightness);
    return maximum ? clamp(value, maximum) * 100 / maximum : 0;
}

// Relative luminance decides black or white legends: the keyboard picks the
// colour, the label still has to be readable on it.
/** @param {Colour} colour */
export function idealText(colour) {
    return idealTextRgb(rgb(colour));
}
/** @param {readonly number[]} channels @param {boolean} [opaque] */
export function idealTextRgb(channels, opaque = false) {
    const [r, g, b] = channels.map((channel) => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (opaque) return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
    return luminance > 0.32 ? "rgba(0,0,0,.82)" : "rgba(255,255,255,.94)";
}
