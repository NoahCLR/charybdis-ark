// @ts-check

// A behaviour's Long hold threshold comes after its Tap / hold threshold
// (D-L82). The keyboard accepts the reverse, but then no press counts as a
// Hold before it counts as a Long hold, so Ark refuses it: core for every
// editor (core/model/gesture-timing.js holdOrderRefusal), and the behaviour
// editor as the person types, before anything is posted. Both say why in the
// one sentence, with the vocabulary's names for the two thresholds.

/** Whether a Long hold threshold of `long` ms leaves no time after a Tap / hold threshold of `hold` ms; unknown values never do. */
export const holdsOutOfOrder = (/** @type {unknown} */ hold, /** @type {unknown} */ long) =>
    Number.isInteger(hold) && Number.isInteger(long) && /** @type {number} */ (long) <= /** @type {number} */ (hold);

/** @param {string} words */
const capitalised = (words) => words.charAt(0).toUpperCase() + words.slice(1);

/**
 * Why, after `whose` ("its", "the"): "its Long hold threshold, 500 ms, must be
 * later than its Tap / hold threshold, 800 ms."
 * @param {{hold: number, long: number}} terms
 * @param {{tapHoldTerm: string, longHoldTerm: string}} names
 * @param {string} whose
 */
export const holdOrderReason = ({hold, long}, names, whose) =>
    `${whose} ${capitalised(names.longHoldTerm)}, ${long} ms, must be later than ${whose} ${capitalised(names.tapHoldTerm)}, ${hold} ms.`;
