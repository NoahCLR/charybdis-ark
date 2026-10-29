// @ts-check
// Reading a macro payload for display.
//
// The keyboard stores a macro as text: literal characters, {KC_X} to tap,
// {+KC_X} to press, {-KC_X} to release and {120} to wait. This parses it for
// the preview and checks it by the same rules the core enforces on save
// (core/schema/macro-payload.js), so the preview never calls valid what the
// core would refuse. `options.keys` is the core's list of key names a macro
// may send; without it, key names are not checked. A key still held at the end
// is not an error here — the step builder passes through that state — and
// unreleased() reports it.

import {vocabulary, word} from "./vocabulary.mjs";
import {MACRO_LIMITS, macroProblemWords, readMacroPayload} from "../../rules/macro-payload.mjs";
import {macroOfName} from "../../rules/qmk-keycodes.mjs";

/** @typedef {import("./types.js").MacroStep} MacroStep */

// Each kind of macro step, in the order the add buttons offer them; its one
// name (glossary "Macro step"), which the add buttons, the step editor and
// the picker it opens all say, is the vocabulary's (macroSteps).
/** @type {readonly MacroStep["kind"][]} */
export const STEP_KINDS = ["text", "tap", "delay", "press", "release"];
/** @param {import("./vocabulary.mjs").VocabularyModel | null | undefined} model @param {string} kind */
export const stepKindName = (model, kind) => word(vocabulary(model).macroSteps, kind);
// The button that adds a step of this kind.
/** @param {import("./vocabulary.mjs").VocabularyModel | null | undefined} model @param {string} kind */
export const addStepLabel = (model, kind) => `+ ${stepKindName(model, kind)}`;

// A choice of a macro's Uninterruptible playback as its dropdown offers it:
// Automatic says whether it plays the macro uninterruptibly now, in core's
// words ("Automatic · on").
/** @param {import("./vocabulary.mjs").VocabularyModel | null | undefined} model @param {{value: string, label: string}} choice @param {boolean} uninterruptible */
export const protectionChoiceLabel = (model, {value, label}, uninterruptible) => (value === "auto"
    && vocabulary(model).macroUninterruptible.automatic[uninterruptible ? "on" : "off"]) || label;

// A macro slot's number, read from the name its keycode goes by (MACRO_n,
// rules/qmk-keycodes.mjs macroOfName), and null for a keycode that names no
// slot; and its short name, where its whole name will not fit: "M3".
/** @param {string | null | undefined} keycode */
export const macroNumber = (keycode) => macroOfName(String(keycode ?? "")) ?? null;
/** @param {{keycode?: string} | null | undefined} slot */
export const macroShortName = (slot) => `M${macroNumber(slot?.keycode) ?? ""}`;

// A macro's limits (rules/macro-payload.mjs): its longest delay in
// milliseconds, and the keys it holds at once, a chord's included.
export const MAX_DELAY = MACRO_LIMITS.maxDelayMs, MAX_KEYS = MACRO_LIMITS.maxHeldKeys;

// A macro's steps, as far as they read, and what is wrong in words: the shared
// grammar read by key name, a key known by its alias's name, and only the keys
// a macro can send when the model lists them. Text that needs Unicode entry
// with an ordinary key held is said once the rest reads; without a host
// layout, that text is anything past ASCII, and without the model's modifier
// keys no held key counts as ordinary, so core alone says it. A key left
// held is not an error here: the editor names each one (unreleased), as core
// refuses it.
/** @param {unknown} payload @param {import("./types.js").MacroOptions} [options] */
export function parseMacro(payload, options = {}) {
    const allowed = options.keys?.length ? new Set(options.keys) : null;
    const {steps, error} = readMacroPayload(String(payload ?? ""), {
        identity: (key) => options.aliases?.[key] || key,
        sendable: (key) => !allowed || allowed.has(key),
        textEntry: options.textEntry,
        needsEntry: (character) => options.layoutChars ? !options.layoutChars.includes(character) : /[^\x00-\x7F]/u.test(character),
        ordinary: (key) => Boolean(options.modifierKeys) && !options.modifierKeys?.includes(/** @type {string} */ (key)),
        skipEmptyNames: true,
    });
    /** @type {MacroStep[]} */
    const read = steps.map((step) => step.kind === "text" || step.kind === "delay" ? step : {kind: step.kind, keys: step.keys});
    return {steps: read, error: error ? macroProblemWords(error, options.problems) : ""};
}

/** @param {MacroStep} step @param {(name: string) => string} [label] */
export const describeStep = (step, label = (name) => name) => step.kind === "text" ? step.text
    : step.kind === "delay" ? `${step.delay} ms`
    : step.keys.map(label).join(" + ");

/** @param {MacroStep} step */
export function serializeMacroStep(step) {
    if (step.kind === "text") return String(step.text ?? "").replaceAll("{", "{{").replaceAll("}", "}}");
    if (step.kind === "delay") return `{${Math.max(0, Number(step.delay) || 0)}}`;
    const keys = (step.keys || []).join(",");
    if (!keys) return "";
    return step.kind === "press" ? `{+${keys}}` : step.kind === "release" ? `{-${keys}}` : `{${keys}}`;
}

/** @param {readonly MacroStep[]} steps */
export const serializeMacro = (steps) => steps.map(serializeMacroStep).join("");

// Editable steps retain incomplete fields locally. The raw view must reflect
// them verbatim, while incomplete commands are never posted for staging. A
// delay out of range is said in the vocabulary's words for that problem; a
// key step with no key yet is the editor's own.
/** @param {readonly MacroStep[]} steps @param {import("./vocabulary.mjs").VocabularyModel | null | undefined} [model] */
export function macroStepsInput(steps, model) {
    const problems = vocabulary(model).macroProblems;
    let error = "";
    const payload = steps.map(step => {
        if (step.kind === "text") return serializeMacroStep(step);
        if (step.kind === "delay") {
            if (!/^\d+$/.test(String(step.delay)) || Number(step.delay) > MAX_DELAY) error ||= macroProblemWords({code: "delay"}, problems);
            return `{${step.delay}}`;
        }
        if (!step.keys?.length) error ||= "Choose a key for each key step.";
        return `{${step.kind === "press" ? "+" : step.kind === "release" ? "-" : ""}${(step.keys || []).join(",")}}`;
    }).join("");
    return {payload, error};
}

// What a slot shows on its cell, from its steps as the peek reads them
// (macro-cache.mjs). Every macro on a real keyboard tends to open with the
// same modifier press, so the head of the payload makes them all look
// identical; what tells them apart is the key they actually send.
/** @param {MacroStep[]} steps @param {(name: string) => string} [label] */
export function macroPeekSteps(steps, label = (name) => name) {
    const text = steps.filter((step) => step.kind === "text").map((step) => step.text).join("").trim();
    if (text) return text;
    const taps = steps.filter((step) => step.kind === "tap").flatMap((step) => step.keys);
    if (taps.length) return taps.map(label).join(" ");
    const held = steps.filter((step) => step.kind === "press").flatMap((step) => step.keys);
    if (held.length) return held.map(label).join(" + ");
    return steps[0] ? describeStep(steps[0], label) : "";
}

// A macro as its chips read it: each step in order with its kind (a tap of
// several keys marked as a chord), its short label and its full words, up to `limit` steps and how many more follow.
// Typed text is cut to `TEXT_CHIP` characters on the chip and `TEXT_TIP` in its
// tooltip, so a long string cannot swamp the row or the hover card.
export const TEXT_CHIP = 24, TEXT_TIP = 200;
/** @param {string} text @param {number} max */
const clip = (text, max) => [...text].length > max ? `${[...text].slice(0, max - 1).join("").trimEnd()}…` : text;
/** @param {unknown} payload @param {(step: MacroStep) => {label: string, full: string}} [face] @param {number} [limit] */
export function macroChips(payload, face = (step) => ({label: describeStep(step), full: describeStep(step)}), limit = 12) {
    const {steps} = parseMacro(payload);
    const chips = steps.slice(0, limit).map((step) => {
        const {label, full} = face(step);
        if (step.kind === "text") return {kind: step.kind, label: clip(label, TEXT_CHIP), full: clip(full, TEXT_TIP)};
        return step.kind === "tap" && step.keys.length > 1 ? {kind: step.kind, label, full, chord: true} : {kind: step.kind, label, full};
    });
    return {chips, more: Math.max(0, steps.length - limit)};
}

// Held keys that are never released leave the keyboard holding them, so the
// preview says so rather than letting it through quietly.
/** @param {readonly MacroStep[]} steps @param {Readonly<Record<string, string>>} [aliases] */
export function unreleased(steps, aliases = {}) {
    /** @type {string[]} */
    const held = [];
    for (const step of steps) {
        const keys = step.kind === "text" || step.kind === "delay" ? [] : step.keys.map(key => aliases[key] || key);
        if (step.kind === "press") held.push(...keys);
        if (step.kind === "release") for (const key of keys) {
            const at = held.indexOf(key);
            if (at >= 0) held.splice(at, 1);
        }
    }
    return held;
}

// Whether a slot answers a search. A macro is found by the name it was given,
// and by the slot it sits in as the screens label it — "M3", "Macro 3" or its
// keycode — so an unnamed macro can still be found. Case is ignored.
/** @param {{keycode?: string, name?: string, defaultName?: string} | null | undefined} slot @param {unknown} query */
export function macroMatches(slot, query) {
    const needle = String(query ?? "").trim().toLowerCase();
    if (!needle) return true;
    return [slot?.name, macroShortName(slot), slot?.defaultName, slot?.keycode]
        .some((text) => String(text ?? "").toLowerCase().includes(needle));
}

// Whether two payloads are the same macro: the same steps once every key name
// is read through the catalogue's aliases (KC_LGUI is KC_LEFT_GUI). The draft
// holds the keyboard's canonical names, so an edit typed with an alias is not
// "local" once the draft has it. Unparseable text compares as written.
/** @param {unknown} a @param {unknown} b @param {Readonly<Record<string, string>>} [aliases] */
export function samePayload(a, b, aliases = {}) {
    const left = String(a ?? ""), right = String(b ?? "");
    if (left === right) return true;
    const one = parseMacro(left), two = parseMacro(right);
    if (one.error || two.error) return false;
    /** @param {MacroStep} step @returns {MacroStep} */
    const canonical = step => step.kind === "text" || step.kind === "delay" ? step : {...step, keys: step.keys.map(key => aliases[key] || key)};
    return serializeMacro(one.steps.map(canonical)) === serializeMacro(two.steps.map(canonical));
}

// What a macro card's chip says its editor holds, against the draft and the
// keyboard: an edit not kept in the draft yet, a macro the draft changed
// (Review lists it), or the macro as read (in the demo, as the demo profile has
// it). A playback change the host section caused is not a change to the macro.
/** @param {readonly Pick<import("../../contracts/model.js").ReviewChange, "unit">[] | undefined} changes @param {string} keycode @param {boolean} local @returns {{state: "local" | "draft" | "read", dot: string, text: string}} */
export function macroLocalState(changes, keycode, local) {
    if (local) return {state: "local", dot: "draft", text: "edited here"};
    const unit = `macro:${macroNumber(keycode)}`;
    return (changes || []).some((change) => change.unit === unit)
        ? {state: "draft", dot: "draft", text: "changed in draft"}
        : {state: "read", dot: "on", text: "as read"};
}
