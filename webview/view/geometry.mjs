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

// Where an overlay paints. RGB_KEY_HALF and RGB_KEYS_ONLY depend on the keys
// that triggered it: a pointing mode's key, or every input of a held combo,
// whose half is both halves when its keys span them (firmware RGB domain,
// Values). With no trigger key, as a mode no key holds, the half is both
// halves and the keys are every key.
/** @param {number | readonly number[] | undefined} trigger */
const triggerKeys = (trigger) => trigger === undefined ? [] : typeof trigger === "number" ? [trigger] : trigger;
/** @param {number} layoutIndex @param {string} locality @param {number | readonly number[]} [trigger] */
export function inLocality(layoutIndex, locality, trigger) {
    const keys = triggerKeys(trigger);
    switch (locality) {
        case "RGB_LEFT_HALF": return !isRightHalf(layoutIndex);
        case "RGB_RIGHT_HALF": return isRightHalf(layoutIndex);
        case "RGB_KEY_HALF": return !keys.length || keys.some((key) => isRightHalf(key) === isRightHalf(layoutIndex));
        case "RGB_KEYS_ONLY": return !keys.length || keys.includes(layoutIndex);
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
/** @param {string} locality @param {number | readonly number[]} [trigger] */
export function trackballInLocality(locality, trigger) {
    const keys = triggerKeys(trigger);
    switch (locality) {
        case "RGB_LEFT_HALF": return false;
        case "RGB_RIGHT_HALF": return true;
        case "RGB_KEY_HALF": return !keys.length || keys.some(isRightHalf);
        case "RGB_KEYS_ONLY": return !keys.length;
        default: return true;
    }
}

// ── the key face ────────────────────────────────────────────────────────
//
// Where the marks and legends sit on one cap. The rows are a designed set, not
// a running offset: how far the legend drops depends on how many rows sit above
// it, and each case was tuned against the others. Lifted from the app's own
// board, so the two cannot drift.
// A row of icons (`icons`: the macro, custom key or pointing mode a key
// reaches) sits under the legend: along the bottom of the cap, or on a key
// with a line, between its tap and the line, since they belong to what it
// taps. The rows above, and the line and the hold, keep their places; the
// legend rises to make room.
/** @param {number} y @param {{tiers?: boolean, combos?: boolean, sub?: boolean, icons?: boolean}} [options] */
export function keyFaceRows(y, {tiers = false, combos = false, sub = false, icons = false} = {}) {
    /** @type {Partial<import("./types.js").FaceRows> & {comboHeight: number}} */
    const rows = {comboHeight: 8.2};
    if (tiers && combos) { rows.tierY = y + 6.3; rows.comboY = y + 14.2; }
    else if (tiers) { rows.tierY = y + 7.5; }
    else if (combos) { rows.comboY = y + 7.2; }

    const above = (tiers ? 1 : 0) + (combos ? 1 : 0);
    if (icons && sub) {
        rows.iconSize = [8.5, 8.5, 7.4][above];
        rows.iconY = [y + 25.5, y + 29.8, y + 33.8][above];
        rows.mainY = [y + 17, y + 22.5, y + 28][above];
        rows.separatorY = [y + 37.4, y + 40.8, y + 43.4][above];
        rows.subY = [y + 48.8, y + 51.8, y + 53.5][above];
    } else if (icons) {
        rows.iconSize = 8.5;
        rows.iconY = y + GEO.keyH - 3.8 - rows.iconSize;
        rows.mainY = [y + 23, y + 30.5, y + 35.2][above];
    } else if (sub) {
        rows.mainY = [y + 24.5, y + 29.3, y + 32.2][above];
        rows.separatorY = [y + 37.4, y + 40.8, y + 43.4][above];
        rows.subY = [y + 48.8, y + 51.8, y + 53.5][above];
    } else {
        rows.mainY = [y + GEO.keyH / 2, y + 36, y + 40.4][above];
    }
    // Every layout above sets mainY; the other rows exist only when drawn.
    return /** @type {import("./types.js").FaceRows} */ (rows);
}

// Where each of a key's `count` icons stands in its row (keyFaceRows' iconY
// and iconSize): their left edges, the row centred on the cap's middle `cx`.
const ICON_GAP = 2;
/** @param {number} cx @param {number} count @param {number} size */
export function keyIconsX(cx, count, size) {
    const left = cx - (count * size + (count - 1) * ICON_GAP) / 2;
    return Array.from({length: count}, (_, order) => left + order * (size + ICON_GAP));
}

// ── the legends ─────────────────────────────────────────────────────────
//
// A cap's legends are set from one small scale, never sized to their own
// width, so the board reads as one calm surface on every layer and every
// screen (D-L78): a single character, as a keycap prints a letter, digit or
// symbol, large; every name (Esc, Tab, Left Shift, a macro's) at one word
// size; the hold under a dual-role key's line at one size of its own.
// `step` is the one size below the word size, for a name that cannot fit it
// even condensed. Whether a key also carries its LED's number changes
// nothing: the number sits outside the legends (webview/ui/board.mjs).
export const LEGEND_SIZES = Object.freeze({glyph: 12, word: 9, step: 7.6, hold: 6.6});
// How far a line may be condensed at its own size before it steps down:
// condensing keeps its height, which is what the eye compares across caps.
export const LEGEND_CONDENSE = 0.86;
// The weights a legend and a hold are drawn at, as .kc-label and .kc-sub
// draw them (styles.css --fw-regular, --fw-bold), so each is measured as drawn.
export const LEGEND_WEIGHTS = Object.freeze({name: 400, hold: 700});
// Lines of a two-line legend, apart by this much of their size.
const LINE_GAP = 1.12;
// The room a legend line has across a cap: a tap over a line sits a little
// narrower, as the line does.
const ROOM = GEO.keyW - 10, ROOM_OVER_LINE = GEO.keyW - 12;

/**
 * How wide `text` runs at `size` in the board's face, at `weight`. The board
 * measures it in the page; without one (in a test) it is estimated.
 * @typedef {(text: string, size: number, weight: number) => number} MeasureText
 */

/**
 * Where a cap's legends stand and how large they are drawn, for its face rows
 * (keyFaceRows): the main legend, one line or two, each centred on its y, and
 * the hold under the line. A line's `squeeze` is the width it is condensed
 * into, 0 when it runs at its own width.
 * @param {import("./types.js").FaceRows} rows
 * @param {{main: string, sub?: string}} key
 * @param {MeasureText} [measure]
 * @returns {{size: number, lines: {text: string, squeeze: number, y: number}[], sub: {size: number, squeeze: number, y: number} | null}}
 */
export function keyLegends(rows, {main, sub = ""}, measure = estimateWidth) {
    const tap = setLegend(main, {room: sub ? ROOM_OVER_LINE : ROOM, twoLines: !sub}, measure);
    const lines = tap.lines.map((line, order) => ({
        ...line,
        y: rows.mainY + (order - (tap.lines.length - 1) / 2) * tap.size * LINE_GAP,
    }));
    if (!sub) return {size: tap.size, lines, sub: null};
    // The hold keeps its one size: one too long is condensed into the row.
    const size = LEGEND_SIZES.hold;
    return {size: tap.size, lines, sub: {size, squeeze: squeezeInto(measure(sub, size, LEGEND_WEIGHTS.hold), ROOM_OVER_LINE), y: rows.subY ?? 0}};
}

/**
 * One legend set on the scale. A single character takes the glyph size; a
 * name the word size, on two lines when it has two or more words and the cap
 * leaves room for two (legendBreak), else on one. A line too wide is
 * condensed, up to LEGEND_CONDENSE, before the whole legend steps down to
 * `step`; past that it is condensed into the row. Every word is kept, so the
 * cap, the hover card and the key's label all read the whole name.
 * @param {string} text @param {{room: number, twoLines: boolean}} where @param {MeasureText} measure
 * @returns {{size: number, lines: {text: string, squeeze: number}[]}}
 */
export function setLegend(text, {room, twoLines}, measure = estimateWidth) {
    const whole = String(text ?? "");
    if ([...whole].length === 1) return {size: LEGEND_SIZES.glyph, lines: [{text: whole, squeeze: 0}]};
    const parts = (twoLines && legendBreak(whole, measure)) || [whole];
    // Each part's width at the word size; at any other size it scales with it.
    const widths = parts.map((part) => measure(part, LEGEND_SIZES.word, LEGEND_WEIGHTS.name));
    const size = Math.max(...widths) <= room / LEGEND_CONDENSE ? LEGEND_SIZES.word : LEGEND_SIZES.step;
    return {size, lines: parts.map((part, order) => ({text: part, squeeze: squeezeInto(widths[order] * size / LEGEND_SIZES.word, room)}))};
}

// The width a line is condensed into: its row, when it runs wider; else 0.
/** @param {number} width @param {number} room */
const squeezeInto = (width, room) => width > room ? room : 0;

/**
 * Where a name breaks onto two lines: at a " · ", which parts its halves
 * ("Slot 6" over "hold (empty)"), the dot dropped since the break says it;
 * else between words where the longer line comes out shortest. A number is
 * never left on a line of its own ("Custom" over "key 0", "Macro 0" whole).
 * Null for a name that does not break: one word, or a word and its number.
 * @param {string} text @param {MeasureText} [measure]
 * @returns {[string, string] | null}
 */
export function legendBreak(text, measure = estimateWidth) {
    const words = text.split(" ").filter(Boolean);
    /** @type {{lines: [string, string], dot: boolean, longest: number}[]} */
    const breaks = [];
    for (let at = 1; at < words.length; at++) {
        const first = words.slice(0, at), second = words.slice(at);
        const dot = first.at(-1) === "·" || second[0] === "·";
        if (first.at(-1) === "·") first.pop();
        if (second[0] === "·") second.shift();
        if (!first.length || !second.length) continue;
        const lines = /** @type {[string, string]} */ ([first.join(" "), second.join(" ")]);
        if (lines.some((line) => /^\d+$/.test(line)) || /^\d+$/.test(second[0])) continue;
        breaks.push({lines, dot, longest: Math.max(...lines.map((line) => measure(line, 1, LEGEND_WEIGHTS.name)))});
    }
    const atDot = breaks.filter((option) => option.dot);
    const best = (atDot.length ? atDot : breaks).sort((a, b) => a.longest - b.longest)[0];
    return best ? best.lines : null;
}

// Roughly how wide a legend runs in the board's face, for where the page
// cannot measure it.
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
/** @param {unknown} text */
const units = (text) => [...String(text || "")].reduce((total, char) => total + charWidth(char), 0);
/** @type {MeasureText} */
export const estimateWidth = (text, size, weight) => units(text) * size * (weight >= 600 ? 1.06 : 1);
