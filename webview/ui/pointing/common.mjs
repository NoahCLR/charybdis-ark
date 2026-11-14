// @ts-check
import {vocabulary, word} from "../../view/vocabulary.mjs";

// The words for movement, axes, links and scroll fields come with the
// model (model.vocabulary.pointing), so this editor and the review agree.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model */
export const words = (model) => vocabulary(model).pointing;
// What a setting does, by the field it sets (vocabulary pointing.tips).
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {string} key */
export const tipFor = (model, key) => words(model).tips?.[key] || "";
// What each choice of a field does, as a part of its step's info mark
// (vocabulary pointing.about): headed by the field's label, each choice
// named by its own words.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {"emptyDirection" | "directionOutput" | "linkEnds" | "pointerLayer"} key @param {string} heading @returns {import("../info-mark.mjs").InfoPart} */
export const choicesPart = (model, key, heading) => {
    const about = words(model).about[key];
    return {heading, lead: about.lead, rows: about.rows.map(([value, says]) => ({term: word(words(model)[key], value), says}))};
};
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
