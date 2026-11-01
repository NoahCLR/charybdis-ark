// @ts-check
// The physical keyboard: where each of the 56 positions sits, and which half
// it belongs to (which LED it carries is published, model.leds). Lifted from
// the app's own board so a second interface cannot teach a different
// keyboard.

// The trackball is a 34mm sphere among 19.05mm key pitches, so it is nearly
// two keys across — drawn at its own size rather than as a marker, and sitting
// where the keyboard puts it: outboard of the thumb cluster, under the inner
// columns of the right half.
export const GEO = {
    keyW: 58, keyH: 58, radius: 7, yOffset: 54, rowStep: 64,
    viewBox: "20 96 1082 478",
    leftX: [36, 102, 168, 234, 300, 366], leftTopY: [118, 118, 78, 54, 78, 78],
    rightX: [698, 764, 830, 896, 962, 1028], rightTopY: [78, 78, 54, 78, 118, 118],
    /** @type {Record<number, {x: number, y: number, angle: number}>} */
    thumbs: {
        48: {x: 328, y: 354, angle: 0}, 49: {x: 396, y: 350, angle: 10}, 50: {x: 468, y: 358, angle: 17},
        51: {x: 576, y: 358, angle: -17}, 52: {x: 648, y: 350, angle: -10}, 53: {x: 398, y: 432, angle: 9},
        54: {x: 468, y: 446, angle: 15}, 55: {x: 578, y: 432, angle: -15},
    },
    trackball: {x: 776, y: 480, r: 58},
};

const RIGHT_THUMBS = new Set([51, 52, 55]);

/** @param {number} layoutIndex */
export const isRightHalf = (layoutIndex) =>
    layoutIndex < 48 ? layoutIndex % 12 >= 6 : RIGHT_THUMBS.has(layoutIndex);

// Where an overlay paints. RGB_KEY_HALF and RGB_KEYS_ONLY depend on the key
// that triggered the mode, so they are answered against that trigger.
/** @param {number} layoutIndex @param {string} locality @param {number} [triggerIndex] */
export function inLocality(layoutIndex, locality, triggerIndex) {
    switch (locality) {
        case "RGB_LEFT_HALF": return !isRightHalf(layoutIndex);
        case "RGB_RIGHT_HALF": return isRightHalf(layoutIndex);
        case "RGB_KEY_HALF":
            return triggerIndex === undefined ? true : isRightHalf(layoutIndex) === isRightHalf(triggerIndex);
        case "RGB_KEYS_ONLY": return triggerIndex === undefined ? false : layoutIndex === triggerIndex;
        default: return true;
    }
}

/** @param {number} layoutIndex */
export function keyVisual(layoutIndex) {
    const thumb = GEO.thumbs[layoutIndex];
    if (thumb) return {x: thumb.x, y: thumb.y + GEO.yOffset, angle: thumb.angle};
    const row = Math.floor(layoutIndex / 12), column = layoutIndex % 12;
    return column < 6
        ? {x: GEO.leftX[column], y: GEO.leftTopY[column] + row * GEO.rowStep + GEO.yOffset, angle: 0}
        : {x: GEO.rightX[column - 6], y: GEO.rightTopY[column - 6] + row * GEO.rowStep + GEO.yOffset, angle: 0};
}

// The board's shape alone, every key and the trackball with no legends: Ark's
// mark in the rail. Only numbers from GEO reach the markup.
/** @param {string} className */
export function boardOutlineMarkup(className) {
    const {x, y, r} = GEO.trackball;
    const keys = Array.from({length: 56}, (_, index) => {
        const visual = keyVisual(index);
        const turn = visual.angle ? ` transform="rotate(${visual.angle} ${visual.x + GEO.keyW / 2} ${visual.y + GEO.keyH / 2})"` : "";
        return `<rect x="${visual.x}" y="${visual.y}" width="${GEO.keyW}" height="${GEO.keyH}" rx="${GEO.radius}"${turn}/>`;
    });
    return `<svg class="${className}" viewBox="${GEO.viewBox}" aria-hidden="true"><circle cx="${x}" cy="${y}" r="${r}"/>${keys.join("")}</svg>`;
}

// The trackball LED answers localities on its own terms: it is soldered on the
// right half, and no key maps to it, so a locality that names the trigger key
// never reaches it.
/** @param {string} locality @param {number} [triggerIndex] */
export function trackballInLocality(locality, triggerIndex) {
    switch (locality) {
        case "RGB_LEFT_HALF": return false;
        case "RGB_RIGHT_HALF": return true;
        case "RGB_KEY_HALF": return triggerIndex === undefined ? true : isRightHalf(triggerIndex);
        case "RGB_KEYS_ONLY": return false;
        default: return true;
    }
}

// ── the key face ────────────────────────────────────────────────────────
//
// Where the marks and legends sit on one cap. The rows are a designed set, not
// a running offset: how far the legend drops depends on how many rows sit above
// it, and each case was tuned against the others. Lifted from the app's own
// board, so the two cannot drift.
/** @param {number} y @param {{tiers?: boolean, combos?: boolean, sub?: boolean}} [options] */
export function keyFaceRows(y, {tiers = false, combos = false, sub = false} = {}) {
    /** @type {Partial<import("./types.js").FaceRows> & {comboHeight: number}} */
    const rows = {comboHeight: 8.2};
    if (tiers && combos) { rows.tierY = y + 6.3; rows.comboY = y + 14.2; }
    else if (tiers) { rows.tierY = y + 7.5; }
    else if (combos) { rows.comboY = y + 7.2; }

    const above = (tiers ? 1 : 0) + (combos ? 1 : 0);
    if (sub) {
        rows.mainY = [y + 24.5, y + 29.3, y + 32.2][above];
        rows.separatorY = [y + 37.4, y + 40.8, y + 43.4][above];
        rows.subY = [y + 48.8, y + 51.8, y + 53.5][above];
    } else {
        rows.mainY = [y + GEO.keyH / 2, y + 36, y + 40.4][above];
    }
    // Every layout above sets mainY; the other rows exist only when drawn.
    return /** @type {import("./types.js").FaceRows} */ (rows);
}

// Roughly how wide a legend runs, so a label can be sized to fit its row rather
// than bucketed by how many characters it happens to have.
/** @param {string} char */
const charWidth = (char) => {
    if (char === " ") return 0.32;
    if (/[.,:;!'|]/.test(char)) return 0.26;
    if (/[/\\()[\]{}]/.test(char)) return 0.34;
    if (/[MW@#%&]/.test(char)) return 0.82;
    if (/[A-Z0-9_]/.test(char)) return 0.62;
    if (/[a-z]/.test(char)) return 0.54;
    return 0.58;
};

/**
 * The size a legend takes to sit inside `width`, never above `max` and never
 * below `min`. `squeeze` is set when even the smallest size overruns, and is
 * the width to compress the glyphs into rather than let them spill off the cap.
 */
/** @param {unknown} text @param {{max: number, min: number, width: number}} bounds */
export function fitText(text, {max, min, width}) {
    const unit = units(text);
    const preferred = unit > 0 ? Math.min(max, width / unit) : max;
    return {size: Math.round(Math.max(min, preferred) * 100) / 100, squeeze: unit * max > width ? width : 0};
}

/** @param {unknown} text */
const units = (text) => [...String(text || "")].reduce((total, char) => total + charWidth(char), 0);

// The smallest a legend with a cap to itself is drawn: past it a name stops
// reading at a laptop's width, so it takes two lines instead.
export const LEGEND_MIN = 8;
// Two lines share the cap, so neither is drawn larger than this.
const TWO_LINE_MAX = 9.5;

/**
 * A legend alone on its cap (no hold under a line): one line while it fits at
 * LEGEND_MIN or more, as `fitText` sizes it; otherwise two, broken between
 * words where the longer line comes out shortest, and a " · " the break falls
 * on dropped, since the break already parts them ("Slot 6" over "hold
 * (empty)"). Each line has its own `squeeze`, set only when a single word
 * overruns the row even at LEGEND_MIN. The words are never cut, so the hover
 * card and the key's label still read the whole name.
 */
/** @param {unknown} text @param {{max: number, width: number}} bounds @returns {{size: number, lines: {text: string, squeeze: number}[]}} */
export function fitLegend(text, {max, width}) {
    const whole = String(text ?? "");
    const one = () => {
        const fit = fitText(whole, {max, min: LEGEND_MIN, width});
        return {size: fit.size, lines: [{text: whole, squeeze: fit.squeeze}]};
    };
    if (units(whole) * LEGEND_MIN <= width) return one();
    const words = whole.split(" ").filter(Boolean);
    /** @param {string[]} part */
    const line = (part) => part.join(" ");
    let best = {first: "", second: "", longest: Infinity};
    for (let at = 1; at < words.length; at++) {
        const first = words.slice(0, at), second = words.slice(at);
        if (first.at(-1) === "·") first.pop();
        if (second[0] === "·") second.shift();
        if (!first.length || !second.length) continue;
        const longest = Math.max(units(line(first)), units(line(second)));
        if (longest < best.longest) best = {first: line(first), second: line(second), longest};
    }
    if (best.longest === Infinity) return one();
    const size = Math.round(Math.max(LEGEND_MIN, Math.min(TWO_LINE_MAX, max, width / best.longest)) * 100) / 100;
    return {size, lines: [best.first, best.second].map((part) => ({text: part, squeeze: units(part) * size > width ? width : 0}))};
}
