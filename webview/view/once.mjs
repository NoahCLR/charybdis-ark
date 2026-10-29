// @ts-check
// Work done on first read and kept. A view value worked out from a model
// (layer-view.mjs, tab-reach.mjs, key-identity.mjs) reads each answer this
// way, since a model is replaced, never mutated.
/** @template T @param {() => T} work @returns {() => T} */
export const once = (work) => {
    /** @type {{value: T} | null} */
    let kept = null;
    return () => (kept ??= {value: work()}).value;
};
