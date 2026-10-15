// @ts-check
// Registry walkers over an authored local situation. Inputs use matrix/native
// identities, never host characters or inferred automatic layer provenance.
/** @typedef {import('./lighting-simulator-types.js').Situation} Situation */
/** @typedef {import('./lighting-simulator-types.js').Subject} Subject */
/** @param {number} key @returns {import('./lighting-simulator-types.js').Half} */
export const keyHalf = key => key < 30 ? "left" : "right";
/** @param {number} kind @param {number} thing @param {number} [slot] @param {number[]} [keys] @param {import('./lighting-simulator-types.js').Half[]} [halves] @returns {Subject} */
export const subject = (kind, thing, slot = 0, keys = [], halves = []) => ({kind, thing, slot, keys: [...keys], halves: [...new Set(halves)], outcome: 0});
/** @param {number} want @param {number} actual */
const matches = (want, actual) => want === 255 || want === actual;
/** @param {Situation} s */
export const activeLayers = s => [...new Set([0, ...s.layers ?? []])].sort((a, b) => b - a);
/** @param {number} b @param {number} depth */
const branchSlot = (b, depth) => 3 + (b <= 2 ? 0 : Math.min(b - 2, depth - 2));
/** @type {Record<string, number>} */ const stateBits = {branch: 0, tap: 1, hold: 2, long: 3}, stateSlots = {hold: 0, long: 1, tap: 2};
/** @param {Situation} s @param {number | undefined} key */
function shown(s, key) {const e = key === undefined ? undefined : s.behaviour?.keys[key];return e?.flashing && !e.lit ? undefined : e;}
/** @param {number} key @param {import('./lighting-simulator-types.js').Behaviour} e @param {number} depth @param {number} [thing] @param {import('./lighting-simulator-types.js').Half[]} [halves] */
const behaviourSubject = (key, e, depth, thing = 255, halves = [keyHalf(key)]) => ({...subject(4, thing, e.state === "branch" ? branchSlot(e.branch ?? 0, depth) : stateSlots[e.state], [key], halves), outcome: e.outcome ?? 0});
/** @type {Record<number, (s: Situation, p: number[], depth: number) => Subject[]>} */
const FACTS = {
    1: (s, p) => activeLayers(s).filter(l => matches(p[0], l)).map(l => subject(1, l)),
    2: (s, p) => s.preview !== undefined && matches(p[0], s.preview) ? [subject(1, s.preview)] : [],
    3: (s, p) => s.mode && matches(p[0], s.mode.id) ? [subject(2, s.mode.id, 0, s.mode.keys, s.mode.halves)] : [],
    4: (s, p) => {
        const keys = [...new Set([...(p[0] === 0 || p[0] === 255 ? s.combos?.owning ?? [] : []), ...(p[0] === 1 || p[0] === 255 ? s.combos?.others ?? [] : [])])];
        return keys.length ? [subject(3, 255, 0, keys, keys.map(keyHalf))] : [];
    },
    5: (s, p, depth) => {
        const owners = s.behaviour?.owners ?? {};
        /** @type {[number, import('./lighting-simulator-types.js').Half[] | undefined][]} */ let keys = [];
        if (p[1] === 0) keys = Object.keys(s.behaviour?.keys ?? {}).map(Number).sort((a, b) => a - b).map(k => [k, undefined]);
        else if (p[1] === 1) keys = ["left", "right"].flatMap(h => owners[h] === undefined ? [] : [[owners[h], [/** @type {import('./lighting-simulator-types.js').Half} */ (h)]]]);
        else if (p[1] === 2) keys = owners.board === undefined ? [] : [[owners.board, undefined]];
        else keys = ["long", "hold", "tap", "branch"].flatMap(state => {const k = owners[state], e = shown(s, k);return e && e.state === state && p[0] >> stateBits[state] & 1 ? [[k, undefined]] : [];});
        const covered = [...s.combos?.owning ?? [], ...s.combos?.others ?? []];
        return keys.flatMap(([k, halves]) => {const e = shown(s, k);return e && p[0] >> stateBits[e.state] & 1 && !(e.state === "branch" && covered.includes(k)) ? [behaviourSubject(k, e, depth, 255, halves)] : [];});
    },
    7: (s, p) => (s.combos?.instances ?? []).filter(i => matches(p[0], i.id) && matches(p[1], i.role)).map(i => subject(3, i.id, 0, i.keys, i.keys.map(keyHalf))),
    8: (s, p, depth) => Object.keys(s.behaviour?.keys ?? {}).map(Number).sort((a, b) => a - b).flatMap(k => {
        const e = shown(s, k), covered = [...s.combos?.owning ?? [], ...s.combos?.others ?? []];
        return e && e.id !== undefined && matches(p[0], e.id) && p[1] >> stateBits[e.state] & 1 && !(e.state === "branch" && covered.includes(k)) ? [behaviourSubject(k, e, depth, e.id)] : [];
    }),
    9: (s, p) => {
        const owners = s.layerOwners ?? {}, layers = p[1] === 0 ? [activeLayers(s)[0]] : p[1] === 1 ? [...new Set(Object.values(owners))] : p[1] === 2 ? s.lockedLayers ?? [] : s.oneshotLayer === undefined ? [] : [s.oneshotLayer];
        return layers.sort((a, b) => b - a).filter(l => matches(p[0], l)).map(l => {const keys = Object.keys(owners).map(Number).filter(k => owners[k] === l);return subject(1, l, 0, keys, keys.map(keyHalf));});
    },
    10: (s, p) => s.modeStatus && Boolean(p[1]) === Boolean(s.modeStatus.locked) && matches(p[0], s.modeStatus.id) ? [subject(2, s.modeStatus.id, 0, s.modeStatus.keys, s.modeStatus.halves)] : [],
    11: (s, p) => (s.comboLayers ?? []).filter(i => matches(p[0], i.id) && matches(p[1], i.layer)).map(i => subject(3, i.id, 0, i.keys, i.keys.map(keyHalf))),
    12: (s, p, depth) => Object.keys(s.behaviourPhases ?? {}).map(Number).sort((a, b) => a - b).flatMap(k => {const e = s.behaviourPhases?.[k];return e && matches(p[0], e.id) && e.phases.includes(p[1]) && matches(p[2], e.branch) ? [subject(4, e.id, p[1] === 4 ? 1 : [2, 3].includes(p[1]) ? 0 : p[1] === 1 ? 2 : branchSlot(e.branch, depth), [k], [keyHalf(k)])] : [];}),
    13: (s, p) => s.macroPlaying !== undefined && matches(p[0], s.macroPlaying) ? [subject(5, s.macroPlaying)] : [],
    14: (s, p) => [...s.pressedKeys ?? []].sort((a, b) => a - b).filter(k => matches(p[0], k)).map(k => subject(7, k, 0, [k], [keyHalf(k)])),
    15: (s, p) => [0, 1].filter(side => (p[1] === 2 || p[1] === side) && (s.modifiers?.[p[2]] ?? 0) & 1 << (p[0] + 4 * side)).map(side => subject(6, p[0] + 4 * side)),
    16: (s, p) => (s.hostLocks ?? 0) & 1 << p[0] ? [subject(0, 255)] : [],
    17: (s, p) => (s.pointer ?? 0) & 1 << p[0] ? [subject(0, 255)] : [],
    18: s => s.idle ? [subject(0, 255)] : [],
};
/** @param {number} kind @param {number[]} params @param {Situation} situation @param {number} [depth] */
export function factSubjects(kind, params, situation, depth = 5) {
    if (!FACTS[kind]) throw new Error("This condition needs a newer simulator.");
    return FACTS[kind](situation, params, depth);
}
/** @param {number} code @returns {[number, number] | null} */
export function nativeIdentity(code) {
    for (const lo of [0x5220, 0x5200, 0x5260, 0x5280, 0x52c0]) if (code >= lo && code <= lo + 31) return code - lo < 16 ? [1, code - lo] : null;
    if (code >= 0x4000 && code <= 0x4fff) return [1, code >> 8 & 15];
    if (code >= 0x5000 && code <= 0x51ff) return [1, code >> 5 & 15];
    if (code >= 0x7ec0 && code < 0x7ed0) return [1, code - 0x7ec0];
    if (code >= 0x7e80 && code <= 0x7ebf) return [2, (code - 0x7e80) % 32];
    if (code >= 0x7700 && code <= 0x777f) return [5, code - 0x7700];
    return null;
}
/** @param {number} code @param {number | undefined} behaviour @param {number} q @param {number} selector @param {number} layer @param {Situation['queryCombos']} combos */
export function keyQuery(code, behaviour, q, selector, layer, combos) {
    const b = code >= 0x100 && code <= 0x1fff ? code & 255 : code;
    const between = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => v >= lo && v <= hi;
    const identity = nativeIdentity(code);
    return [() => code !== 0 && code !== 1, () => code === 1, () => code === 0,
        () => between(b, 0xe0, 0xe7) || between(code, 0x100, 0x3fff) || between(code, 0x5000, 0x51ff) || between(code, 0x52a0, 0x52bf),
        () => between(b, 4, 0x1d), () => between(b, 0x1e, 0x27) || between(b, 0x59, 0x62),
        () => between(b, 0x2d, 0x38) || between(b, 0x54, 0x57) || [0x64, 0x67, 0x85].includes(b),
        () => between(b, 0x49, 0x52) || [0x28, 0x29, 0x2a, 0x2b, 0x58].includes(b),
        () => between(b, 0xa5, 0xbe), () => between(b, 0xcd, 0xdf),
        ...[1, 2, 5].map(kind => () => identity?.[0] === kind && matches(selector, identity[1])),
        () => between(code, 0x7f00, 0x7f7f), () => behaviour !== undefined && matches(selector, behaviour),
        () => Object.entries(combos ?? {}).some(([id, c]) => matches(selector, Number(id)) && c.enabled !== false && (c.layers ?? Array.from({length: 16}, (_, l) => l)).includes(layer) && c.inputs.includes(code)),
    ][q]?.() ?? false;
}
