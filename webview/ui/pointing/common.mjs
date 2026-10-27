// @ts-check
import {vocabulary, word} from "../../view/vocabulary.mjs";

// The words for movement, axes, links and scroll fields come with the
// model (model.vocabulary.pointing), so this editor and the review agree.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model */
export const words = (model) => vocabulary(model).pointing;
// A scroll field's label; a field that shows its unit beside it drops the
// "(ms)" its label carries elsewhere.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {string} key @param {string} [unit] */
export const scrollLabel = (model, key, unit) => {
    const label = word(words(model).scrollFields, key);
    return unit ? label.replace(/\s*\(ms\)$/, "") : label;
};
/** @type {Readonly<Record<string, string>>} */
export const ARROWS = {up: "↑", left: "←", right: "→", down: "↓", upLeft: "↖", upRight: "↗", downLeft: "↙", downRight: "↘"};

// The four scroll fields the Scrolling card shows itself. A field rendered
// twice registers its reader twice, and the second input silently wins, so
// Advanced shows only what the card above does not.
export const SCROLL_LEAD = [["divisorH"], ["divisorV"], ["intervalMs", "ms"], ["lockMs", "ms"]];
// The rest of the scroll record, as Advanced lays it out: single values, then
// the two axis ratios, each as one numerator : denominator pair.
export const SCROLL_SINGLES = [["thresholdH"], ["thresholdV"], ["expireMs", "ms"], ["decayDivisor"]];
export const SCROLL_RATIOS = [["startNumerator", "startDenominator"], ["sustainNumerator", "sustainDenominator"]];
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {number} axis */
export const axisLabel = (model, axis) => word(words(model).axes, axis);
