// @ts-check
"use strict";

// Layer-state sets share identical Boolean decisions instead of materializing
// their Cartesian product. Locks and holds remain separate, interleaved bits:
// clearing a lock must not release a held layer. Conditions describe active
// layers ({on, off}, {all}, {any}, {not}); callers own keyboard semantics.
// The result contains proved reachability, traps and concrete paths, never the
// decision graph. A budget failure is explicit and carries no absence claims.
const LAYERS = 16, LOCK_BITS = 0x55555555, HOLD_BITS = 0xaaaaaaaa;
const LIMIT = Symbol("layer analysis budget");
/** @typedef {{v: number, lo: number, hi: number}} Decision */
class StateSets {
    /** @param {import("./types.js").LayerAnalysisLimits} [limits] */
    constructor(limits = {}) {
        /** @type {({v: number, lo?: number, hi?: number} | undefined)[]} */
        this.nodes = [{v: 32}, {v: 32}];
        /** @type {Map<string, number>} */
        this.unique = new Map();
        /** @type {Map<string, number>} */
        this.memo = new Map();
        /** @type {number[]} */
        this.free = [];
        this.maxNodes = limits.nodes ?? 50000; this.remaining = limits.work ?? 2000000;
    }
    // Traversals reach only live decisions above the two terminal IDs.
    /** @param {number} id @returns {Decision} */
    decision(id) {return /** @type {Decision} */ (this.nodes[id]);}
    tick() {if (--this.remaining < 0) throw LIMIT;}
    /** @param {number} v @param {number} lo @param {number} hi @returns {number} */
    node(v, lo, hi) {
        this.tick(); if (lo === hi) return lo;
        const key = `${v}:${lo}:${hi}`, found = this.unique.get(key);
        if (found !== undefined) return found;
        if (!this.free.length && this.nodes.length === this.maxNodes) throw LIMIT;
        const id = this.free.length ? /** @type {number} */ (this.free.pop()) : this.nodes.length;
        this.nodes[id] = {v, lo, hi}; this.unique.set(key, id); return id;
    }
    /** @param {string} key @param {() => number} build @returns {number} */
    cached(key, build) {
        this.tick(); const found = this.memo.get(key); if (found !== undefined) return found;
        const value = build(); if (this.memo.size >= 32768) this.memo.clear(); this.memo.set(key, value); return value;
    }
    /** @param {number} v @param {boolean} [on] */
    literal(v, on = true) {return this.node(v, on ? 0 : 1, on ? 1 : 0);}
    /** @param {number} a @param {number} b @returns {number} */
    and(a, b) {return this.combine(a, b, false);}
    /** @param {number} a @param {number} b @returns {number} */
    or(a, b) {return this.combine(a, b, true);}
    /** @param {number} a @param {number} b @param {boolean} union @returns {number} */
    combine(a, b, union) {
        if (a === b) return a;
        if (union ? a === 1 || b === 1 : a === 0 || b === 0) return union ? 1 : 0;
        if (a === (union ? 0 : 1)) return b;
        if (b === (union ? 0 : 1)) return a;
        if (a > b) [a, b] = [b, a];
        return this.cached(`${union ? "o" : "a"}:${a}:${b}`, () => {
            const x = this.decision(a), y = this.decision(b), v = Math.min(x.v, y.v);
            return this.node(v, this.combine(x.v === v ? x.lo : a, y.v === v ? y.lo : b, union),
                this.combine(x.v === v ? x.hi : a, y.v === v ? y.hi : b, union));
        });
    }
    /** @param {number} a @returns {number} */
    not(a) {
        if (a < 2) return 1 - a;
        return this.cached(`n:${a}`, () => {const {v, lo, hi} = this.decision(a); return this.node(v, this.not(lo), this.not(hi));});
    }
    // Quantify all selected bits in one traversal.
    /** @param {number} a @param {number} bits @returns {number} */
    forget(a, bits) {
        if (a < 2) return a;
        return this.cached(`e:${a}:${bits}`, () => {
            const {v, lo, hi} = this.decision(a), left = this.forget(lo, bits), right = this.forget(hi, bits);
            return bits & (1 << v) ? this.or(left, right) : this.node(v, left, right);
        });
    }
    /** @param {number} a @param {number} bits @param {number} values @returns {number} */
    restrict(a, bits, values) {
        if (a < 2) return a;
        return this.cached(`r:${a}:${bits}:${values}`, () => {
            const {v, lo, hi} = this.decision(a);
            return bits & (1 << v) ? this.restrict(values & (1 << v) ? hi : lo, bits, values)
                : this.node(v, this.restrict(lo, bits, values), this.restrict(hi, bits, values));
        });
    }
    /** @param {number} a @param {number} bit @returns {number} */
    flip(a, bit) {
        if (a < 2 || this.decision(a).v > bit) return a;
        return this.cached(`f:${a}:${bit}`, () => {
            const {v, lo, hi} = this.decision(a);
            return v === bit ? this.node(v, hi, lo) : this.node(v, this.flip(lo, bit), this.flip(hi, bit));
        });
    }
    /** @param {number} bits @param {number} [values] */
    cube(bits, values = 0) {
        let root = 1;
        for (let v = 31; v >= 0; v--) if (bits & (1 << v)) root = this.node(v, values & (1 << v) ? 0 : root, values & (1 << v) ? root : 0);
        return root;
    }
    /** @param {number} root @param {number} state */
    has(root, state) {
        while (root > 1) {const {v, lo, hi} = this.decision(root); root = state & (1 << v) ? hi : lo;}
        return root === 1;
    }
    /** @param {number} root */
    witness(root) {
        let state = 0;
        while (root > 1) {
            const {v, lo, hi} = this.decision(root);
            if (lo !== 0) root = lo; else {state |= 1 << v; root = hi;}
        }
        return state >>> 0;
    }
    /** @param {readonly number[]} roots */
    collect(roots) {
        if (this.unique.size < this.maxNodes / 2) return;
        // IDs of live decisions stay stable. Operation caches are discarded
        // before recycling dead intermediate decisions from previous passes.
        this.memo.clear();
        const live = new Set([0, 1]), pending = [...roots];
        while (pending.length) {
            const root = /** @type {number} */ (pending.pop()); if (live.has(root)) continue;
            this.tick(); live.add(root); const {lo, hi} = this.decision(root); pending.push(lo, hi);
        }
        this.unique.clear(); this.free = [];
        for (let id = 2; id < this.nodes.length; id++) {
            if (!live.has(id)) {this.nodes[id] = undefined; this.free.push(id); continue;}
            const {v, lo, hi} = this.decision(id); this.unique.set(`${v}:${lo}:${hi}`, id);
        }
    }
}

/** @param {number} mask */
const bitsOfLocks = mask => {
    let bits = 0; for (let n = 0; n < LAYERS; n++) if (mask & (1 << n)) bits |= 1 << (2 * n); return bits >>> 0;
};
/** @param {number} state @param {number} always */
const activeOf = (state, always) => {
    let active = always; for (let n = 0; n < LAYERS; n++) if (state & (3 << (2 * n))) active |= 1 << n; return active;
};
/** @param {number} mask */
const countBits = mask => {let count = 0; for (; mask; mask &= mask - 1) count++; return count;};

/**
 * @template {import("./types.js").LayerTransition} T
 * @param {import("./types.js").LayerAnalysisInput<T>} input
 * @returns {import("./types.js").LayerAnalysisResult<T>}
 */
function analyzeLayerStates({always = 1, transitions, queries = [], trapLimit = 4, limits}) {
    /** @typedef {{kind: string, layer: number, guard: number, sources: {guard: number, effect: T}[]}} Operation */
    const sets = new StateSets(limits);
    /** @type {Map<string, Operation>} */
    const operations = new Map();
    /** @type {{guard: number, effect: T}[]} */
    const compiled = [];
    /** @type {number[]} */
    const queryRoots = [];
    /** @type {number[]} */
    const waves = [];
    let phase = "reachability", affectedLayers = 0;
    /** @type {(import("./types.js").LayerReachProof<T> & {reachabilityComplete: true}) | undefined} */
    let proved;
    const seenConditions = new WeakSet();
    /** @param {import("./types.js").LayerCondition} value */
    function scope(value) {
        if (typeof value === "boolean" || seenConditions.has(value)) return;
        seenConditions.add(value); affectedLayers |= (value.on || 0) | (value.off || 0);
        for (const child of value.all || value.any || []) scope(child);
        if (value.not !== undefined) scope(value.not);
    }
    transitions.forEach(effect => {affectedLayers |= 1 << effect.layer; scope(effect.when);}); queries.forEach(scope);
    try {
        /** @type {WeakMap<object, number>} */
        let conditions = new WeakMap();
        /** @param {import("./types.js").LayerCondition} value @returns {number} */
        function condition(value) {
            if (typeof value === "boolean") return Number(value);
            const cached = conditions.get(value); if (cached !== undefined) return cached;
            let root;
            if (value.all) root = value.all.reduce((root, part) => sets.and(root, condition(part)), 1);
            else if (value.any) root = value.any.reduce((root, part) => sets.or(root, condition(part)), 0);
            else if (value.not !== undefined) root = sets.not(condition(value.not));
            else {
                affectedLayers |= (value.on || 0) | (value.off || 0);
                root = (value.off || 0) & always ? 0 : 1;
                for (let n = 0; n < LAYERS; n++) {
                    if (always & (1 << n)) continue;
                    const active = () => sets.or(sets.literal(2 * n), sets.literal(2 * n + 1));
                    if ((value.on || 0) & (1 << n)) root = sets.and(root, active());
                    if ((value.off || 0) & (1 << n)) root = sets.and(root, sets.not(active()));
                }
            }
            conditions.set(value, root); return root;
        }
        for (const effect of transitions) {
            if (!["hold", "lock", "move"].includes(effect.kind) || (effect.kind === "lock" && effect.layer === 0)) continue;
            const guard = condition(effect.when), key = `${effect.kind}:${effect.layer}`;
            compiled.push({guard, effect}); if (!guard) continue;
            affectedLayers |= 1 << effect.layer;
            const op = operations.get(key) || {kind: effect.kind, layer: effect.layer, guard: 0, sources: []};
            op.guard = sets.or(op.guard, guard); op.sources.push({guard, effect}); operations.set(key, op);
        }
        for (let layer = 0; layer < LAYERS; layer++) operations.set(`release:${layer}`, {
            kind: "release", layer, guard: sets.literal(2 * layer + 1), sources: []});
        queries.forEach(query => queryRoots.push(condition(query)));
        // Compilation is finished; collection can now recycle intermediate
        // condition nodes that are not referenced by an operation or query.
        conditions = new WeakMap();
        const ops = [...operations.values()], zero = sets.cube(0xffffffff), heldZero = sets.cube(HOLD_BITS);
        const permanent = [zero, heldZero, ...compiled.map(c => c.guard), ...queryRoots, ...ops.map(op => op.guard)];
        /** @param {number} root @param {Operation} op */
        const forward = (root, op) => {
            const v = 2 * op.layer + (op.kind === "lock" ? 0 : 1);
            if (op.kind === "lock") return sets.flip(root, v);
            if (op.kind === "move") return sets.and(sets.forget(root, LOCK_BITS), sets.cube(LOCK_BITS, op.layer ? 1 << (2 * op.layer) : 0));
            return sets.and(sets.forget(root, 1 << v), sets.literal(v, op.kind === "hold"));
        };
        /** @param {number} root @param {Operation} op */
        const backward = (root, op) => {
            const v = 2 * op.layer + (op.kind === "lock" ? 0 : 1);
            if (op.kind === "lock") return sets.flip(root, v);
            if (op.kind === "move") return sets.restrict(root, LOCK_BITS, op.layer ? 1 << (2 * op.layer) : 0);
            return sets.restrict(root, 1 << v, op.kind === "hold" ? 1 << v : 0);
        };
        let reachable = zero;
        waves.push(reachable);
        for (;;) {
            sets.collect([...permanent, ...waves]);
            let next = reachable;
            for (const op of ops) next = sets.or(next, forward(sets.and(reachable, op.guard), op));
            if (next === reachable) break;
            reachable = next; waves.push(reachable);
        }
        let reachedLayers = always;
        for (let n = 0; n < LAYERS; n++) if (sets.and(reachable, condition({on: 1 << n}))) reachedLayers |= 1 << n;
        const witnesses = new Set();
        const queryResults = queryRoots.map(root => {
            const found = sets.and(reachable, root);
            if (found) witnesses.add(activeOf(sets.witness(found), always)); return Boolean(found);
        });
        const effects = compiled.filter(({guard}) => {
            const found = sets.and(reachable, guard);
            if (found) witnesses.add(activeOf(sets.witness(found), always)); return Boolean(found);
        }).map(({effect}) => effect);
        proved = {reachabilityComplete: true, reachedLayers, queries: queryResults, effects, witnesses};
        // A permanent escape or universally available toggles prove every
        // state safe without a backwards search through all combinations.
        const reset = ops.some(op => op.kind === "move" && op.layer === 0 && op.guard === 1);
        const lockTargets = ops.filter(op => op.kind === "lock" || (op.kind === "move" && op.layer));
        const reversible = lockTargets.every(op => operations.get(`lock:${op.layer}`)?.guard === 1);
        if (reset || reversible) return {complete: true, reachedLayers, queries: queryResults, effects, witnesses, traps: [], trapCount: 0};

        phase = "escapes";
        let home = zero;
        for (;;) {
            sets.collect([...permanent, ...waves, home]);
            let next = home;
            for (const op of ops) next = sets.or(next, sets.and(reachable, sets.and(op.guard, backward(home, op))));
            if (next === home) break; home = next;
        }
        const trappedLocks = sets.forget(sets.and(sets.and(reachable, heldZero), sets.not(home)), HOLD_BITS);
        /** @type {{op: Operation, sources: number}[]} */
        const entries = [];
        let entered = 0;
        for (const op of ops.filter(op => op.kind === "lock" || op.kind === "move")) {
            const sources = sets.and(reachable, sets.and(sets.not(trappedLocks), sets.and(op.guard, backward(trappedLocks, op))));
            if (sources) {entries.push({op, sources}); entered = sets.or(entered, sets.forget(forward(sources, op), HOLD_BITS));}
        }
        // Report the smallest trapping combinations. Adding unrelated safe
        // locks to the same trap creates no new repair for the user.
        /** @type {Map<string, number>} */
        const upward = new Map(), minimal = new Map();
        /** @param {number} root @param {number} layer @returns {number} */
        function closure(root, layer) {
            if (root < 2) return root;
            const key = `${root}:${layer}`; const cached = upward.get(key); if (cached !== undefined) return cached;
            const node = sets.decision(root), lo = node.v === 2 * layer ? node.lo : root, hi = node.v === 2 * layer ? node.hi : root;
            const left = closure(lo, layer + 1), right = closure(hi, layer + 1);
            const result = sets.node(2 * layer, left, sets.or(left, right)); upward.set(key, result); return result;
        }
        /** @param {number} root @param {number} [layer] @returns {number} */
        function smallestSets(root, layer = 0) {
            if (!root || layer === LAYERS) return root;
            const key = `${root}:${layer}`; const cached = minimal.get(key); if (cached !== undefined) return cached;
            const node = sets.decision(root), lo = node.v === 2 * layer ? node.lo : root, hi = node.v === 2 * layer ? node.hi : root;
            const left = smallestSets(lo, layer + 1), right = sets.and(smallestSets(hi, layer + 1), sets.not(closure(lo, layer + 1)));
            const result = sets.node(2 * layer, left, right); minimal.set(key, result); return result;
        }
        entered = smallestSets(entered);
        // Count and select lock sets in the shared graph as well: independent
        // safe locks beside one trap must not expand into thousands of rows.
        /** @type {Map<string, number>} */
        const counts = new Map();
        /** @param {number} root @param {number} [layer] @returns {number} */
        function count(root, layer = 0) {
            if (!root) return 0; if (root === 1) return 2 ** (LAYERS - layer);
            const key = `${root}:${layer}`; const cached = counts.get(key); if (cached !== undefined) return cached;
            const {v, lo, hi} = sets.decision(root), next = v / 2;
            const result = 2 ** (next - layer) * (count(lo, next + 1) + count(hi, next + 1));
            counts.set(key, result); return result;
        }
        /** @param {number} root @param {Map<number, number | undefined>} [cache] @returns {number | undefined} */
        function smallest(root, cache = new Map()) {
            if (!root) return undefined; if (root === 1) return 0;
            if (cache.has(root)) return cache.get(root);
            const {v, lo, hi} = sets.decision(root), left = smallest(lo, cache), right = smallest(hi, cache);
            const high = right === undefined ? undefined : right | (1 << (v / 2));
            const result = left === undefined ? high : high === undefined ? left
                : countBits(left) < countBits(high) || (countBits(left) === countBits(high) && left < high) ? left : high;
            cache.set(root, result); return result;
        }
        const trapCount = count(entered), masks = [];
        for (let remaining = entered; remaining && masks.length < trapLimit;) {
            // A nonempty decision set always has a smallest witness.
            const mask = /** @type {number} */ (smallest(remaining)); masks.push(mask);
            remaining = sets.and(remaining, sets.not(sets.cube(LOCK_BITS, bitsOfLocks(mask))));
        }
        /** @param {Operation} op @param {number} source @returns {import("./types.js").LayerPathEffect<T>} */
        function effectFor(op, source) {
            return op.sources.find(({guard}) => sets.has(guard, source))?.effect || {kind: "release", layer: op.layer, when: true};
        }
        /** @param {number} state */
        function pathTo(state) {
            /** @type {import("./types.js").LayerPathEffect<T>[]} */
            const path = [];
            let depth = waves.findIndex(root => sets.has(root, state));
            while (depth > 0) {
                const target = sets.cube(0xffffffff, state);
                for (const op of ops) {
                    const candidates = sets.and(waves[depth - 1], sets.and(op.guard, backward(target, op)));
                    if (!candidates) continue;
                    const source = sets.witness(candidates); path.unshift(effectFor(op, source)); state = source; break;
                }
                depth--;
            }
            return path;
        }
        const traps = masks.slice(0, trapLimit).map(locks => {
            const target = sets.cube(LOCK_BITS, bitsOfLocks(locks));
            for (const wave of waves) for (const {op, sources} of entries) {
                const candidates = sets.and(wave, sets.and(sources, backward(target, op)));
                if (!candidates) continue;
                const source = sets.witness(candidates), effect = effectFor(op, source);
                return {locks, effect, path: [...pathTo(source), effect]};
            }
            throw new Error("A trapped state has no entry witness.");
        });
        return {complete: true, reachedLayers, queries: queryResults, effects, witnesses, traps, trapCount};
    } catch (error) {
        if (error !== LIMIT) throw error;
        const partial = {complete: /** @type {const} */ (false), phase, affectedLayers: affectedLayers & ~always};
        return proved ? {...partial, ...proved} : partial;
    }
}

module.exports = {analyzeLayerStates};
