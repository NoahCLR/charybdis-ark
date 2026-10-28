// @ts-check

// Which compiled answer a position gives under the layers that are on. Core
// compiles each position's candidates (`compileLayerAnswers` in
// core/model/layer-resolution.js), highest layer first: a candidate answers
// while its own layer is on and every higher layer that would answer instead
// is off. The firmware scans the layers that are on from the top and takes the
// first that is not transparent, so the first candidate that answers is the
// answer. Core's layer walk and the interface's board both ask this (D-L73).

/** @typedef {{readonly active: number, readonly blocked: number}} AnswerCandidate */

/** Whether `candidate` answers while the layers in the `active` mask are on. */
export function answersUnder(/** @type {AnswerCandidate} */ candidate, /** @type {number} */ active) {
    return (active & candidate.active) !== 0 && (active & candidate.blocked) === 0;
}

/**
 * The candidate that answers while the layers in the `active` mask are on, or
 * undefined when none does (every layer on is transparent there).
 *
 * @template {AnswerCandidate} T
 * @param {readonly T[] | undefined} candidates
 * @param {number} active
 * @returns {T | undefined}
 */
export function answeringCandidate(candidates, active) {
    return candidates?.find(candidate => answersUnder(candidate, active));
}
