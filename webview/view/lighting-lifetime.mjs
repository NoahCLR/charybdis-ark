// @ts-check
// Local lifetime and whole-batch ownership. No transport replay or fresh window
// on arrival is inferred here. Split freshness has an explicit logical model.
/** @template T @returns {import('./lighting-simulator-types.js').Lifetime<T>} */
export const emptyLifetime = () => ({phase: "empty", age: 0, eligible: false, batch: null, entry: 0n});
/** @template T @param {import('./lighting-simulator-types.js').Lifetime<T>} cell @param {import('./lighting-simulator-types.js').Timing} timing @param {number} elapsed @param {'idle' | 'match' | 'absent' | 'depart' | 'event' | 'nonqualifying'} observation @param {T | null} batch @param {bigint} [order] */
export function observeLifetime(cell, timing, elapsed, observation, batch, order = 0n) {
    const c = {...cell, age: Math.min(65535, cell.age + elapsed)};
    if (c.phase === "tail" && c.age >= (timing.linger ?? 0) || c.phase === "flash" && c.age >= (timing.flash ?? 0)) Object.assign(c, {...emptyLifetime(), entry: c.entry});
    if (observation === "event") Object.assign(c, {phase: "flash", age: 0, batch, entry: order, eligible: false});
    else if (observation === "match") {
        if (c.phase !== "match") Object.assign(c, {age: 0, entry: order, eligible: false});
        c.phase = "match";c.batch = batch;
        if (c.age >= (timing.show_after ?? 0)) c.eligible = true;
    } else if ((observation === "absent" || observation === "depart") && c.phase === "match") {
        if (c.eligible && timing.linger) {c.phase = "tail";c.age = 0;} else Object.assign(c, {...emptyLifetime(), entry: c.entry});
    }
    return c;
}
/** @template T @param {import('./lighting-simulator-types.js').Lifetime<T>} c @param {import('./lighting-simulator-types.js').Timing} p */
export function lifetimeStatus(c, p) {
    const visible = c.phase === "match" ? c.eligible : c.phase === "tail" ? c.age < (p.linger ?? 0) : c.phase === "flash" && c.age >= (p.show_after ?? 0) && c.age < (p.flash ?? 0);
    const wake = c.phase === "match" && !c.eligible ? Math.max(0, (p.show_after ?? 0) - c.age) : c.phase === "tail" ? Math.max(0, (p.linger ?? 0) - c.age) : c.phase === "flash" ? Math.min((p.flash ?? 0) - c.age, c.age < (p.show_after ?? 0) ? (p.show_after ?? 0) - c.age : Infinity) : 0;
    return {visible, wake: Math.max(0, wake), batch: c.phase === "match" && !c.eligible ? null : c.batch};
}
/** @param {import('./lighting-simulator-types.js').Subject} a @param {import('./lighting-simulator-types.js').Subject} b */
export const subjectPriority = (a, b) => (a.natural ?? 0) - (b.natural ?? 0) || ((a.entry ?? 0n) > (b.entry ?? 0n) ? -1 : (a.entry ?? 0n) < (b.entry ?? 0n) ? 1 : 0) || a.kind - b.kind || a.thing - b.thing || (a.authored ?? 0) - (b.authored ?? 0);
/** @param {number} capture @param {number} before @param {number} remote @param {number} after @param {number} now @returns {number[] | null} */
export function freshnessInterval(capture, before, remote, after, now) {
    const diff = (/** @type {number} */ a, /** @type {number} */ b) => (a - b) >>> 0;
    const a = diff(before, capture), b = diff(after, capture), c = diff(now, remote);
    if (a >= 0x80000000 || b >= 0x80000000 || c >= 0x80000000 || b < a || b + c >= 0x80000000) return null;
    return [Math.min(65535, Math.max(0, a + c - 2)), Math.min(65535, b + c + 2)];
}
