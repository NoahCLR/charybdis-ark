// @ts-check
// Captured events stay separate from the macro text. Compact capture can then
// revise a pending tap into a chord when another key overlaps it.
import {serializeMacroStep} from "./macro.mjs";

/** @typedef {{keycode: string, type: 'keydown' | 'keyup', time: number}} RecordedKey */
/** @typedef {{step: import('./types.js').MacroStep, time: number, end: number}} TimedStep */
/** @typedef {{explicit?: boolean, delays?: boolean, threshold?: number, round?: number, finished?: boolean, finishedAt?: number}} RecordingOptions */

const modifier = (/** @type {string} */ key) => /^KC_(LCTL|LSFT|LALT|LGUI|RCTL|RSFT|RALT|RGUI)$/.test(key);

// A take may end before a physical release. Balance only keys this take
// actually pressed; releases from before Record and repeated downs add nothing.
/** @param {readonly RecordedKey[]} events @param {boolean} closeHeld @param {number | undefined} finishedAt */
function balanced(events, closeHeld, finishedAt) {
    /** @type {Set<string>} */
    const held = new Set();
    /** @type {RecordedKey[]} */
    const result = [];
    for (const event of events) {
        if (event.type === "keydown") {
            if (held.has(event.keycode)) continue;
            held.add(event.keycode);
        } else if (!held.delete(event.keycode)) continue;
        result.push(event);
    }
    const time = Math.max(result.at(-1)?.time ?? 0, finishedAt ?? 0);
    if (closeHeld) for (const keycode of [...held].reverse()) result.push({keycode, type: "keyup", time});
    return result;
}

// Split at moments with no keys held. Each resulting group is independent.
/** @param {readonly RecordedKey[]} events */
function groups(events) {
    /** @type {RecordedKey[][]} */
    const result = [];
    /** @type {Set<string>} */
    const held = new Set();
    let start = 0;
    events.forEach((event, index) => {
        if (event.type === "keydown") held.add(event.keycode);
        else held.delete(event.keycode);
        if (!held.size) {result.push(events.slice(start, index + 1)); start = index + 1;}
    });
    return result;
}

/** @param {readonly RecordedKey[]} events @returns {TimedStep[]} */
const explicitSteps = events => events.map(event => ({
    step: {kind: event.type === "keydown" ? "press" : "release", keys: [event.keycode]},
    time: event.time, end: event.time,
}));

// A simple overlap has all its presses before its first release. Modifiers
// held around several complete groups can join each group's chord. Any other
// overlap keeps its exact event sequence rather than becoming an invented chord.
/** @param {readonly RecordedKey[]} events @param {readonly string[]} [modifiers] @returns {TimedStep[] | null} */
function compactGroup(events, modifiers = []) {
    const first = events[0], last = events.at(-1);
    if (!first || !last) return [];
    const release = events.findIndex(event => event.type === "keyup");
    if (events.slice(release).every(event => event.type === "keyup")) {
        return [{step: {kind: "tap", keys: [...modifiers, ...events.slice(0, release).map(event => event.keycode)]},
            time: first.time, end: last.time}];
    }
    let prefix = 0;
    while (events[prefix]?.type === "keydown" && modifier(events[prefix].keycode)) prefix++;
    if (!prefix) return null;
    const held = events.slice(0, prefix).map(event => event.keycode);
    const suffix = events.slice(-prefix);
    if (!suffix.every(event => event.type === "keyup" && held.includes(event.keycode))) return null;
    const middle = events.slice(prefix, -prefix);
    if (middle.some(event => held.includes(event.keycode))) return null;
    /** @type {TimedStep[]} */
    const steps = [];
    for (const group of groups(middle)) {
        const compact = compactGroup(group, [...modifiers, ...held]);
        if (!compact) return null;
        steps.push(...compact);
    }
    // The wrapper's presses/releases belong to its first/last shortcut, so
    // pauses between independent groups start after all their keys are up.
    if (steps.length) {steps[0].time = first.time; steps[steps.length - 1].end = last.time;}
    return steps;
}

/** @param {number} duration */
function delayPayload(duration) {
    let result = "";
    while (duration > 0) {
        const part = Math.min(65535, duration);
        result += `{${part}}`; duration -= part;
    }
    return result;
}

/** @param {string} before @param {readonly RecordedKey[]} events @param {RecordingOptions} [options] */
export function recordedTakePayload(before, events, {explicit = false, delays = true, threshold = 0, round = 1, finished = true, finishedAt} = {}) {
    const keys = balanced(events, !explicit || finished, finished ? finishedAt : undefined);
    const steps = explicit ? explicitSteps(keys) : groups(keys).flatMap(group => compactGroup(group) ?? explicitSteps(group));
    const rounding = Math.max(1, Number(round) || 1);
    let result = before, previous = null;
    for (const entry of steps) {
        const gap = previous === null ? 0 : Math.max(0, entry.time - previous);
        if (delays && gap > Math.max(0, threshold)) result += delayPayload(Math.round(gap / rounding) * rounding);
        result += serializeMacroStep(entry.step);
        previous = entry.end;
    }
    return result;
}
