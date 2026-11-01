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

// The same, once for each key it is asked with: a view's answer at each key
// position, worked out when first asked there.
/** @template K, T @param {(key: K) => T} work @returns {(key: K) => T} */
export const onceEach = (work) => {
    /** @type {Map<K, T>} */
    const kept = new Map();
    return (key) => {
        if (!kept.has(key)) kept.set(key, work(key));
        return /** @type {T} */ (kept.get(key));
    };
};

// Values kept for each owner (a model, a view) and key, for as long as the
// owner is: the same owner and key give the same value, worked out once.
/** @template {object} O, T @returns {(owner: O, key: string, work: () => T) => T} */
export const keptPer = () => {
    /** @type {WeakMap<O, Map<string, T>>} */
    const kept = new WeakMap();
    return (owner, key, work) => {
        let byKey = kept.get(owner);
        if (!byKey) kept.set(owner, byKey = new Map());
        if (!byKey.has(key)) byKey.set(key, work());
        return /** @type {T} */ (byKey.get(key));
    };
};
