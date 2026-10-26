"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {analyzeLayerStates} = require("../../core/model/layer-state-graph");

const active = (locks, held, always) => locks | held | always;
function matches(condition, mask) {
    if (typeof condition === "boolean") return condition;
    if (condition.all) return condition.all.every(c => matches(c, mask));
    if (condition.any) return condition.any.some(c => matches(c, mask));
    if (condition.not !== undefined) return !matches(condition.not, mask);
    return (mask & (condition.on || 0)) === (condition.on || 0) && !(mask & (condition.off || 0));
}
function apply(state, effect) {
    let locks = state & 65535, held = state >>> 16;
    const bit = 1 << effect.layer;
    if (effect.kind === "hold") held |= bit;
    if (effect.kind === "lock" && effect.layer) locks ^= bit;
    if (effect.kind === "move") locks = effect.layer ? bit : 0;
    if (effect.kind === "release") held &= ~bit;
    return (locks | held << 16) >>> 0;
}
// An independent, explicit state enumeration: an oracle only for tiny graphs.
function exhaustive(input) {
    const edges = new Map(), states = [0], seen = new Set(states), operations = [...input.transitions,
        ...Array.from({length: 16}, (_, layer) => ({kind: "release", layer, when: true}))];
    for (const state of states) {
        const mask = active(state & 65535, state >>> 16, input.always);
        const next = operations.filter(op => matches(op.when, mask)).map(op => apply(state, op));
        edges.set(state, next);
        for (const to of next) if (!seen.has(to)) {seen.add(to); states.push(to);}
    }
    const home = new Set([0]);
    let changed;
    do {
        changed = false;
        for (const [from, next] of edges) if (!home.has(from) && next.some(to => home.has(to))) {home.add(from); changed = true;}
    } while (changed);
    const trapped = locks => seen.has(locks) && !home.has(locks);
    const entries = new Set();
    for (const [from, next] of edges) if (!trapped(from & 65535)) for (const to of next) if (trapped(to & 65535)) entries.add(to & 65535);
    const minimal = new Set([...entries].filter(mask => ![...entries].some(other => other !== mask && (other & mask) === other)));
    return {reachedLayers: states.reduce((m, s) => m | active(s & 65535, s >>> 16, input.always), 0),
        queries: input.queries.map(when => states.some(s => matches(when, active(s & 65535, s >>> 16, input.always)))),
        traps: minimal};
}

test("fifteen independent tap-toggle layers are fully checked without expanding their product", () => {
    const transitions = Array.from({length: 15}, (_, i) => ["hold", "lock"].map(kind => ({kind, layer: i + 1, when: true}))).flat();
    const result = analyzeLayerStates({always: 1, transitions, queries: [{on: 65535}, {on: 32768, off: 2}]});
    assert.equal(result.complete, true);
    assert.equal(result.reachedLayers, 65535);
    assert.deepEqual(result.queries, [true, true]);
    assert.equal(result.trapCount, 0);
});

test("two separately escapable layers can cover each other's exits when combined", () => {
    const transitions = [
        {kind: "lock", layer: 1, when: {off: 4}},
        {kind: "lock", layer: 2, when: {off: 2}},
        {kind: "lock", layer: 2, when: {on: 2, off: 4}},
    ];
    const result = analyzeLayerStates({always: 1, transitions, queries: []});
    assert.equal(result.complete, true);
    assert.deepEqual(result.traps.map(t => t.locks), [6]);
    let state = 0;
    for (const effect of result.traps[0].path) {
        assert(matches(effect.when, active(state & 65535, state >>> 16, 1)));
        state = apply(state, effect);
    }
    assert.equal(state & 65535, 6);
});

test("compact analysis agrees with exhaustive enumeration on seeded interacting graphs", () => {
    let seed = 0x792da; const random = max => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) % max;};
    for (let example = 0; example < 100; example++) {
        const condition = () => {const on = random(16), off = random(16) & ~on; return {on, off};};
        const input = {always: 1 | (random(4) === 0 ? 8 : 0), transitions: Array.from({length: 8}, () => ({
            kind: ["hold", "lock", "move"][random(3)], layer: random(4), when: condition()})),
            queries: Array.from({length: 5}, condition)};
        const expected = exhaustive(input), result = analyzeLayerStates(input);
        assert.equal(result.complete, true, `example ${example}`);
        assert.equal(result.reachedLayers, expected.reachedLayers);
        assert.deepEqual(result.queries, expected.queries);
        assert.equal(result.trapCount, expected.traps.size);
        assert(result.traps.every(trap => expected.traps.has(trap.locks)));
        for (const trap of result.traps) {
            let state = 0;
            for (const effect of trap.path) {
                assert(matches(effect.when, active(state & 65535, state >>> 16, input.always)), `witness in example ${example}`);
                state = apply(state, effect);
            }
            assert.equal(state & 65535, trap.locks);
        }
    }
});

test("an independent bank beside a real trap reports the trapping layer once", () => {
    const transitions = Array.from({length: 14}, (_, i) => ["hold", "lock"].map(kind => ({kind, layer: i + 1, when: true}))).flat();
    transitions.push({kind: "lock", layer: 15, when: {off: 32768}});
    const result = analyzeLayerStates({always: 1, transitions, queries: []});
    assert.equal(result.complete, true);
    assert.equal(result.trapCount, 1);
    assert.deepEqual(result.traps.map(t => t.locks), [32768]);
});

test("an unfinished escape proof preserves completed reachability checks", () => {
    // The first budget that finishes reachability but not the escape proof,
    // found rather than written in, so a cheaper or dearer pass keeps the test.
    const input = {always: 1, transitions: [{kind: "lock", layer: 1, when: {off: 2}}], queries: [{on: 2}, {on: 4}]};
    let work = 1;
    while (work < 1e6 && analyzeLayerStates({...input, limits: {work}}).phase !== "escapes") work = Math.ceil(work * 1.05) + 1;
    assert.ok(work < 1e6, "some budget finishes reachability and not the escape proof");
    const result = analyzeLayerStates({...input, limits: {work}});
    assert.equal(result.complete, false);
    assert.equal(result.phase, "escapes");
    assert.equal(result.reachabilityComplete, true);
    assert.equal(result.reachedLayers, 3);
    assert.deepEqual(result.queries, [true, false]);
    assert.equal(result.traps, undefined);
});

test("budget failure identifies the involved layers and makes no absence claims", () => {
    const result = analyzeLayerStates({always: 1, transitions: [{kind: "lock", layer: 1, when: {off: 4}}], queries: [], limits: {work: 100}});
    assert.equal(result.complete, false);
    assert.equal(result.affectedLayers, 6);
    assert.equal(result.traps, undefined);
});

test("a transition on several layers turns them on together, and its hold is released together", () => {
    // Layers 1 and 2 are only ever held together (firmware D-F26, D-F62), so
    // layer 1 alone is never reached; a layer of its own is released alone.
    const together = analyzeLayerStates({always: 1, transitions: [{kind: "hold", layer: 1, layers: 0b110, when: true}], queries: [{on: 2, off: 4}, {on: 6}]});
    assert.equal(together.complete, true);
    assert.equal(together.reachedLayers, 0b111);
    assert.deepEqual(together.queries, [false, true]);
    const apart = analyzeLayerStates({always: 1, transitions: [{kind: "hold", layer: 1, layers: 0b110, when: true}, {kind: "hold", layer: 1, when: true}], queries: [{on: 2, off: 4}]});
    assert.deepEqual(apart.queries, [true], "a hold of layer 1 alone reaches it alone");
    // A lock of several toggles them all.
    const locked = analyzeLayerStates({always: 1, transitions: [{kind: "lock", layer: 1, layers: 0b110, when: true}], queries: [{on: 2, off: 4}, {on: 6}]});
    assert.deepEqual(locked.queries, [false, true]);
});

test("a lock made after a shared layer was let go is reached with nothing held, so its trap is found", () => {
    // A key holds layers 1 and 2; MO(2) holds 2 alone. Holding both, then
    // letting MO(2) go, leaves layer 1 on (where two holds share a layer the
    // walk lets either drop it), and a lock of 3 made only there has no way
    // back (layer 3 covers its own lock key). The key's release still lets layer 1 go, so that lock is reached
    // with nothing held, and named as a trap.
    // Layer 3 covers every key, its own lock key included.
    const transitions = [{kind: "hold", layer: 1, layers: 0b110, when: {off: 0b1000}}, {kind: "hold", layer: 2, when: {off: 0b1000}},
        {kind: "lock", layer: 3, when: {on: 0b10, off: 0b1100}}];
    const result = analyzeLayerStates({always: 1, transitions, queries: []});
    assert.equal(result.complete, true);
    assert.deepEqual(result.traps.map(trap => trap.locks), [0b1000]);
});

test("a lock of several layers turns them all on, never off one another lock holds on", () => {
    // A pointing mode's lock key turns on layers 1 and 2 (firmware D-F62). A
    // lock of layer 1 alone, usable only while 2 is off, then the mode's lock:
    // both are on, so layer 2 is never on alone; the mode's lock again turns
    // both off.
    const transitions = [{kind: "lock", layer: 1, layers: 0b110, when: true}, {kind: "lock", layer: 1, when: {off: 0b100}}];
    const result = analyzeLayerStates({always: 1, transitions, queries: [{on: 0b100, off: 0b10}, {on: 0b110}]});
    assert.equal(result.complete, true);
    assert.deepEqual(result.queries, [false, true]);
});

test("a hold's release is offered only once that hold can be made", () => {
    // A key holds layers 1 and 2; MO(2) exists only on layer 3, which nothing
    // turns on, so its release never lets layer 2 go alone.
    const transitions = [{kind: "hold", layer: 1, layers: 0b110, when: true}, {kind: "hold", layer: 2, when: {on: 0b1000}}];
    const result = analyzeLayerStates({always: 1, transitions, queries: [{on: 0b10, off: 0b100}]});
    assert.deepEqual(result.queries, [false]);
});

test("a move to several layers locks them alone and lets every other lock go", () => {
    // A custom key's shortcut moves to layers 2 and 3 (firmware D-F26, TO()
    // of a set). Layer 1 locks while 3 is off, the move is offered on layer 1
    // only, and layer 2's own lock toggles it while 3 is on: layer 1 is never
    // on beside them once moved, and locking 2 off leaves 3 alone.
    const transitions = [{kind: "lock", layer: 1, when: {off: 0b1000}}, {kind: "move", layer: 2, layers: 0b1100, when: {on: 0b10}}, {kind: "lock", layer: 2, when: {on: 0b1000}}];
    const result = analyzeLayerStates({always: 1, transitions, queries: [{on: 0b1100, off: 0b10}, {on: 0b1110}, {on: 0b1000, off: 0b100}]});
    assert.equal(result.complete, true);
    assert.deepEqual(result.queries, [true, false, true]);
    // Layer 3 alone has no way home: the trap is found.
    assert.equal(result.trapCount > 0, true);
    // A move to the base alone (TO(0)) offered everywhere lets every lock go,
    // which proves every state safe.
    const home = analyzeLayerStates({always: 1, transitions: [...transitions, {kind: "move", layer: 0, when: true}], queries: []});
    assert.deepEqual([home.complete, home.trapCount], [true, 0]);
});
