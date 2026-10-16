// @ts-check
import {factSubjects, subject, keyHalf, activeLayers, keyQuery, nativeIdentity} from "./lighting-facts.mjs";
import {emptyLifetime, observeLifetime, lifetimeStatus, subjectPriority} from "./lighting-lifetime.mjs";
/** @typedef {import('./lighting-simulator-types.js').Situation} Situation */
/** @typedef {import('./lighting-simulator-types.js').Subject} Subject */
/** @typedef {import('./lighting-simulator-types.js').Timing} Timing */
/** @typedef {import('./lighting-simulator-types.js').Entry} Entry */
/** @typedef {number[]} RGB */
// The pinned RGB matrix association differs from the key layout at the
// final right thumb: matrix56 owns LED55, matrix59 has no LED association. Do not invent
// a key-to-LED connection from the pictorial layout.
/** @type {(number | undefined)[]} */
export const KEY_LEDS = [0,7,8,15,16,20,1,6,9,14,17,21,2,5,10,13,18,22,3,4,11,12,19,23,undefined,28,24,26,27,25,29,36,37,44,45,49,30,35,38,43,46,50,31,34,39,42,47,51,32,33,40,41,48,52,undefined,53,55,54,undefined,undefined];
const ALL = Array.from({length: 58}, (_, n) => n);
/** @param {number[]} keys */
const keyLeds = keys => [...new Set(keys.flatMap(k => KEY_LEDS[k] === undefined ? [] : [/** @type {number} */ (KEY_LEDS[k])]))];
/** @param {{h: number; s: number; v: number}} colour @returns {RGB} */
export function lightingRgb({h, s, v}) {
    if (!s) return [v, v, v];
    const region = Math.floor(h * 6 / 255), rem = (h * 2 - region * 85) * 3;
    const p = v * (255 - s) >> 8, q = v * (255 - (s * rem >> 8)) >> 8, t = v * (255 - (s * (255 - rem) >> 8)) >> 8;
    return region === 0 || region === 6 ? [v, t, p] : region === 1 ? [q, v, p] : region === 2 ? [p, v, t] : region === 3 ? [p, q, v] : region === 4 ? [t, p, v] : [v, p, q];
}
/** @param {RGB} a @param {RGB} b @param {number} n */
const mix = (a, b, n) => a.map((v, i) => Math.floor((v * (255 - n) + b[i] * n + 127) / 255));
/** @param {RGB} c @param {number} n */
const scale = (c, n) => c.map(v => Math.floor((v * n + 127) / 255));
/** @param {import('../../contracts/lighting.js').LightingRule} rule @returns {Timing} */
export function ruleTiming(rule) {
    /** @type {Timing} */ const result = {};
    for (const p of rule.parts.filter(p => p.slot === 5)) result[/** @type {'show_after' | 'linger' | 'flash'} */ (["", "show_after", "linger", "flash"][p.kind])] = p.params[0] | p.params[1] << 8;
    return result;
}
/** @param {import('../../contracts/lighting.js').LightingPart[]} filters @param {Situation} s @param {number} depth */
const qualifies = (filters, s, depth) => filters.every(p => Boolean(factSubjects(p.kind, p.params, s, depth).length) !== (p.slot === 1));
/** @param {import('../../contracts/lighting.js').LightingPart} trigger */
const eventKind = trigger => trigger.slot === 0 && trigger.kind >= 19 && trigger.kind <= 28;
export class LightingSimulator {
    /** @param {import('../../contracts/lighting.js').LightingProgram} program @param {number} [depth] */
    constructor(program, depth = 5) {
        this.program = program;this.depth = depth;this.rgb = program.palette.map(lightingRgb);
        /** @type {Map<string, {rule: number; thing: number; timing: Timing; cell: import('./lighting-simulator-types.js').Lifetime<Subject[]>}>} */ this.histories = new Map();
        /** @type {number | undefined} */ this.lastTime = undefined;
        this.order = 0n;
        /** @type {Set<number>} */ this.seenRules = new Set();
        /** @type {import('./lighting-simulator-types.js').Contribution[]} */ this.contributions = [];
        /** @type {number | null} */ this.inspectLed = null;
    }
    /** @param {Situation} s @param {import('./lighting-simulator-types.js').Event | null} [event] @param {bigint} [order] @param {boolean} [occurrenceOnly] */
    observe(s, event = null, order = this.order + 1n, occurrenceOnly = false) {
        this.order = order;
        const now = (s.time ?? 0) >>> 0;
        let elapsed = this.lastTime === undefined ? 0 : (now - this.lastTime) >>> 0;
        if (elapsed >= 0x80000000) elapsed = 0;else this.lastTime = now;
        /** @type {Set<string>} */ const seen = new Set();
        this.program.rules.forEach((rule, index) => {
            if (rule.flags & 1 || rule.known === false) return;
            const conditions = rule.parts.filter(p => p.slot < 2), first = conditions[0], timing = ruleTiming(rule);
            /** @type {Subject[]} */ let subjects = [];
            const isEvent = first && eventKind(first);
            // The firmware's synchronous occurrence hook qualifies events only;
            // its continuous-state observation happens after native dispatch.
            if (occurrenceOnly && !isEvent) return;
            if (isEvent) {
                if (event && first.kind === 19 + event.kind && (first.params[0] === 255 || first.params[0] === event.thing) && (first.kind !== 25 || event.branch && (first.params[1] === 255 || first.params[1] === event.branch)) && qualifies(conditions.slice(1), s, this.depth)) {
                    const keys = event.owners ?? (event.key !== undefined && event.key < 60 ? [event.key] : []), kind = ({19: 1, 20: 1, 21: 1, 22: 2, 23: 2, 24: 3, 25: 4, 26: 4, 27: 4, 28: 5})[first.kind];
                    subjects = [{...subject(kind ?? 0, event.thing, first.kind === 25 ? event.branch === 1 ? 2 : (event.branch ?? 0) + 1 : event.slot ?? 0, keys, keys.map(keyHalf)), outcome: event.outcome ?? 0}];
                }
            } else if (qualifies(first?.slot === 0 ? conditions.slice(1) : conditions, s, this.depth)) subjects = first?.slot === 0 ? factSubjects(first.kind, first.params, s, this.depth) : [subject(0, 255)];
            /** @type {Map<number, Subject[]>} */ const batches = new Map();
            subjects.forEach((subj, authored) => {
                const natural = first && [1, 2, 9].includes(first.kind) ? 255 - subj.thing : first && [8, 12, 14].includes(first.kind) ? subj.keys[0] : authored;
                const batch = batches.get(subj.thing) ?? [];batch.push({...subj, natural, authored});batches.set(subj.thing, batch);
            });
            for (const [thing, batch] of batches) {
                this.seenRules.add(index);
                const key = `${index}:${thing}`, old = this.histories.get(key)?.cell ?? emptyLifetime();
                this.histories.set(key, {rule: index, thing, timing, cell: observeLifetime(old, timing, elapsed, isEvent ? "event" : "match", batch, order)});seen.add(key);
            }
        });
        for (const [key, h] of this.histories) if (!seen.has(key)) {
            const first = this.program.rules[h.rule].parts[0];
            h.cell = observeLifetime(h.cell, h.timing, elapsed, occurrenceOnly || eventKind(first) ? "idle" : "absent", null, order);
            if (h.cell.phase === "empty") this.histories.delete(key);
        }
    }
    /** @param {Subject} s @param {number} field */
    field(s, field) {
        const table = this.program.things.find(t => t.kind === s.kind);
        if (!table) return undefined;
        const r = table.records[s.thing] ?? table.default, v = r[field];return v === 254 ? table.default[field] : v;
    }
    /** @param {number} kind @param {number[]} p @param {Subject} sub @param {Situation} s @returns {number[]} */
    target(kind, p, sub, s) {
        /** @type {Record<number, () => number[]>} */ const targets = {
            0: () => ALL, 1: () => ALL.slice(0, 29), 2: () => ALL.slice(29), 3: () => this.program.keySets[p[0]],
            4: () => sub.keys.length ? keyLeds(sub.keys) : ALL,
            5: () => sub.halves.length ? ALL.filter(l => sub.halves.includes(l < 29 ? "left" : "right")) : ALL,
            6: () => sub.kind === 1 ? keyLeds(s.mapped?.[sub.thing] ?? []) : [],
            7: () => {const place = this.field(sub, 0);return place === undefined ? [] : this.target(place, [], sub, s);},
            8: () => {
                const layer = sub.kind === 1 ? sub.thing : activeLayers(s)[0];
                return keyLeds(Array.from({length: 60}, (_, k) => k).filter(k => {
                    const item = s.keymap?.[layer]?.[k];return keyQuery(item?.code ?? (s.mapped?.[layer]?.includes(k) ? 4 : 0), item?.behaviour, p[0], p[1], layer, s.queryCombos);
                }));
            },
        };
        if (!targets[kind]) throw new Error("This target needs a newer simulator.");return targets[kind]();
    }
    /** @param {number} kind @param {number[]} p @param {Subject} sub @param {number} led @param {Situation} s @param {() => RGB} below @returns {RGB | null} */
    paint(kind, p, sub, led, s, below) {
        const identity = (/** @type {Subject} */ subj) => {const ref = this.field(subj, 1 + subj.slot);return ref === undefined || ref === 255 ? null : this.rgb[ref];};
        /** @type {Record<number, () => RGB | null>} */ const paints = {
            0: () => null, 1: () => [0, 0, 0], 2: () => this.rgb[p[0]], 3: () => identity(sub),
            4: () => {const v = this.program.maps[p[0]][led];return v < 128 ? this.rgb[v] : this.paint(v - 128, [], sub, led, s, below);},
            5: () => scale(below(), p[0]), 6: () => mix(below(), this.rgb[p[0]], p[1]),
            8: () => sub.kind !== 4 || sub.slot > 1 ? null : sub.outcome >= 1 && sub.outcome <= 16 ? identity(subject(1, sub.outcome - 1)) : sub.outcome >= 33 && sub.outcome <= 64 ? identity(subject(2, sub.outcome - 33)) : null,
            9: () => {const layer = sub.kind === 1 ? sub.thing : activeLayers(s)[0], key = KEY_LEDS.indexOf(led), code = s.keymap?.[layer]?.[key]?.code ?? 0, target = nativeIdentity(code);return target ? identity(subject(...target)) : null;},
        };
        if (!paints[kind]) throw new Error("This paint needs a newer simulator.");return paints[kind]();
    }
    /** @param {Situation} s @param {number} first @param {number} end @param {boolean} [synthetic] @returns {Entry[]} */
    plan(s, first, end, synthetic = false) {
        /** @type {Entry[]} */ const entries = [];
        for (let index = first; index < end; index++) {
            const rule = this.program.rules[index];if (rule.flags & 1) continue;
            if (rule.known === false) throw new Error("This program contains lighting the simulator cannot interpret.");
            const target = rule.parts.find(p => p.slot === 2);
            if (!target) continue;
            /** @type {Subject[]} */ let subs = [];
            if (synthetic) {
                const cs = rule.parts.filter(p => p.slot < 2), c = cs[0];
                if (c && eventKind(c)) continue;
                if (!qualifies(c?.slot === 0 ? cs.slice(1) : cs, s, this.depth)) continue;
                subs = c?.slot === 0 ? factSubjects(c.kind, c.params, s, this.depth) : [subject(0, 255)];
                subs = subs.filter(sub => {const h = this.histories.get(`${index}:${sub.thing}`);return !rule.parts.some(p => p.slot === 5) || h && lifetimeStatus(h.cell, h.timing).visible;});
            } else for (const h of this.histories.values()) if (h.rule === index && lifetimeStatus(h.cell, h.timing).visible) subs.push(...(h.cell.batch ?? []).map(sub => ({...sub, entry: h.cell.entry})));
            subs.sort(subjectPriority);for (const sub of subs) entries.push({index, rule, subject: sub, target: this.target(target.kind, target.params, sub, s)});
        }
        return entries;
    }
    /** @param {Entry[]} entries @param {number} at @param {number} led @param {Situation} s @param {((led: number) => RGB | null) | null} [bottom] @returns {RGB | null} */
    walk(entries, at, led, s, bottom = null) {
        for (; at < entries.length; at++) {
            const e = entries[at], next = at + 1;
            let readsBelow = false, belowStart = this.contributions.length, belowEnd = belowStart;
            const below = () => {readsBelow = true;belowStart = this.contributions.length;const result = this.walk(entries, next, led, s, bottom) ?? effectColour(s.effect?.[led]) ?? [0, 0, 0];belowEnd = this.contributions.length;return result;};
            const paint = e.rule.parts.find(p => p.slot === 3), background = e.rule.parts.find(p => p.slot === 4);
            let colour = paint && e.target.includes(led) ? this.paint(paint.kind, paint.params, e.subject, led, s, below) : null;
            let source = "foreground";
            if (!colour && background) {source = "background";colour = this.paint(background.kind, background.params, e.subject, led, s, below);}
            const used = source === "background" ? background : paint;
            const factor = (used?.kind === 5 ? used.params[0] : used?.kind === 6 ? 255 - used.params[1] : 255) * e.rule.brightness / 255;
            if (this.inspectLed === led && readsBelow) for (const c of this.contributions.slice(belowStart, belowEnd)) c.weight = Math.round((c.weight ?? 255) * factor / 255);
            if (this.inspectLed === led) this.contributions.push({index: e.index, subject: e.subject, source, target: e.target.includes(led), readsBelow, colour: colour ? scale(colour, e.rule.brightness) : null});
            if (colour) return scale(colour, e.rule.brightness);
        }
        return bottom?.(led) ?? null;
    }
    /** @param {Situation} s @param {import('./lighting-simulator-types.js').Event | null} [event] @param {bigint} [order] */
    render(s, event = null, order = this.order + 1n) {
        this.observe(s, event, order);
        return this.frame(s);
    }
    /** Render the already observed history. Explanation and pixels use this same walk.
     * @param {Situation} s @param {number | null} [led] */
    frame(s, led = null) {
        this.inspectLed = led;this.contributions = [];
        if (this.program.extensions.some(e => ![1, 2].includes(e.kind)) || this.program.maps.some(m => m.some(v => v >= 128 && ![0, 1, 3, 8, 9].includes(v - 128)))) throw new Error("Explanation incomplete: this lighting contains a map or extension that needs a newer Ark.");
        const fade = this.program.extensions.find(e => e.kind === 1)?.params;
        const fading = fade && fade[0] & 1 && s.fade && activeLayers(s).includes(s.fade.autoMouseLayer) && s.fade.progress !== 0;
        const scene = fading && fade ? this.program.rules.length - fade[3] : this.program.rules.length;
        const upper = this.plan(s, 0, scene);
        /** @type {((led: number) => RGB | null) | null} */ let bottom = null;
        if (fading && s.fade && fade) {
            const dest = {...s, layers: activeLayers(s).filter(l => l !== s.fade?.autoMouseLayer)}, start = this.plan(s, scene, this.program.rules.length), end = this.plan(dest, scene, this.program.rules.length, true);
            const span = s.fade.timeout - s.fade.deadTime, amount = s.fade.progress >= span ? 255 : Math.floor(s.fade.progress * 255 / span), endColour = this.rgb[fade[2]];
            bottom = led => {
                const before = this.contributions.length, a = this.walk(start, 0, led, s), middle = this.contributions.length, b = fade[1] === 2 ? endColour : this.walk(end, 0, led, dest) ?? (fade[1] === 1 ? endColour : effectColour(s.effect?.[led]));
                if (this.inspectLed === led) {
                    for (const c of this.contributions.slice(before, middle)) {c.scene = "fade from";c.weight = Math.round((c.weight ?? 255) * (a && b ? 255 - amount : a && amount !== 255 ? 255 : 0) / 255);}
                    for (const c of this.contributions.slice(middle)) {c.scene = "fade to";c.weight = Math.round((c.weight ?? 255) * (a && b ? amount : b && amount !== 0 ? 255 : 0) / 255);}
                }
                return a && b ? mix(a, b, amount) : a ? amount === 255 ? null : a : b && amount !== 0 ? b : null;
            };
        }
        const result = ALL.map(led => this.walk(upper, 0, led, s, bottom));
        this.inspectLed = null;return result;
    }
    /** @param {Situation} s @param {number} led */
    explain(s, led) {
        const frame = this.frame(s, led), contributions = this.contributions;
        const rules = this.program.rules.map((rule, index) => {
            const visits = contributions.filter(c => c.index === index), hs = [...this.histories.values()].filter(h => h.rule === index);
            let status = "Covered by a higher contribution";
            const conditions = rule.parts.filter(p => p.slot < 2), first = conditions[0];
            if (rule.flags & 1) status = "Turned off";
            else if (visits.some(v => v.colour && (v.weight ?? 255) > 0)) status = visits.some(v => v.readsBelow) ? "Contributes with light below" : "Contributes opaque light";
            else if (visits.some(v => v.colour)) status = "Covered at this fade or composition endpoint";
            else if (visits.length) status = visits.some(v => v.target) ? "Clear here; light below shows" : "Target misses; background is clear";
            else if (hs.some(h => lifetimeStatus(h.cell, h.timing).visible)) {
                const target = rule.parts.find(p => p.slot === 2), background = rule.parts.find(p => p.slot === 4);
                const reaches = target && hs.flatMap(h => h.cell.batch ?? []).some(sub => this.target(target.kind, target.params, sub, s).includes(led));
                if (!reaches && !background) status = "Target does not reach this LED";
            } else {
                if (hs.some(h => h.cell.phase === "match" || h.cell.phase === "flash")) status = "Waiting for show after";
                else if (first && eventKind(first)) status = this.seenRules.has(index) ? "Flash expired" : "No qualifying event occurrence";
                else if (!qualifies(first?.slot === 0 ? conditions.slice(1) : conditions, s, this.depth)) status = "Condition filter fails";
                else if (this.seenRules.has(index)) status = "Condition ended; no eligible linger remains";
                else status = "Condition does not match";
            }
            return {index, status, visits, subject: first?.slot === 0 ? "First condition supplies the subject; later conditions only filter." : "Board subject; negated conditions only filter."};
        });
        return {frame, rules, contributions};
    }
}
/** @param {string | undefined} hex @returns {RGB | null} */
const effectColour = hex => hex ? [0, 2, 4].map(i => Number.parseInt(hex.slice(i, i + 2), 16)) : null;
/** @param {(RGB | null)[]} frame */
export const frameText = frame => frame.map(c => c ? c.map(n => n.toString(16).padStart(2, "0")).join("") : "-");
