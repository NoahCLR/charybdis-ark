// @ts-check
// What a key does, once, for every surface that says it: the Key tab's "Does"
// line and the board's hover card (decisions R2, §2 hover card).
//
// A layer key says what it does to its layer in one sentence. Any other key is
// the actions it runs, by the press that runs them — Tap, Hold, Long hold, at
// each tap count — from its behaviour row where it has one and from what the
// key does on its own (core/model/built-in-behavior.js) where the row leaves a
// cell empty. A transparent action is resolved to what answers from below, as
// the keyboard runs it (B9). The timings it waits on name where they come from,
// and the costs a person feels (single taps waiting, taps on release) are said
// only when they are true.

import {behaviourEditorRow, behaviourThresholds, behaviourTimingField} from "./behavior-editor.mjs";
import {behaviourFor, canonicalKeycode, inheritedBranch, keyFace, keyMeaning, layerOfKeycode} from "./keyface.mjs";
import {unbuiltKeycode} from "./picker-sections.mjs";
import {dangerOf} from "./picker-choice.mjs";
import {vocabulary} from "./vocabulary.mjs";

/** @typedef {import("../../contracts/panel.js").PublishedModel | null | undefined} Model */
/** @typedef {import("../../contracts/panel.js").Layer} Layer */
/** @typedef {import("../../contracts/panel.js").Position} Position */
/** @typedef {{lead: string, action: string, from?: Layer | null}} Part */

const TRANSPARENT = new Set(["KC_TRANSPARENT", "KC_TRNS", "_______"]);
const LAYER_FORM = /^(MO|TO|TG|OSL|DF|PDF|TT|LOCK_LAYER)\(/;

// The press that runs an action at a tap count: "Tap", "Hold", "2×", "2× hold".
/** @param {number} tapCount @param {"tap" | "hold" | "long"} tier */
function lead(tapCount, tier) {
    const press = tier === "tap" ? "" : tier === "hold" ? "hold" : "long hold";
    if (!tapCount) return tier === "tap" ? "Tap" : tier === "hold" ? "Hold" : "Long hold";
    return `${tapCount + 1}×${press ? ` ${press}` : ""}`;
}

// The key that answers below `at` at this place, with the layers on: the
// highest of them under it that is not transparent there, base last.
/** @param {readonly Layer[]} stack @param {number} at @param {readonly number[]} held @param {number} layoutIndex */
export function answerBelow(stack, at, held, layoutIndex) {
    const under = [...new Set([...held.filter((index) => index < at), 0])].filter((index) => index !== at).sort((a, b) => b - a);
    for (const index of under) {
        const position = (stack[index]?.positions || []).find((entry) => entry.layoutIndex === layoutIndex);
        if (position && !TRANSPARENT.has(position.keycode)) return {layer: stack[index], position};
    }
    return null;
}

/**
 * @param {Model} model
 * @param {Position | null | undefined} position
 * @param {{stack?: readonly Layer[], at?: number, held?: readonly number[]}} [where] the layer the key sits on, for resolving a transparent action
 */
export function keySummary(model, position, {stack = model?.layers || [], at = 0, held = []} = {}) {
    const meaning = keyMeaning(position);
    const face = keyFace(position);
    const keycode = position?.keycode || "";
    const named = model?.qmkKeycodeAliases?.[keycode] || keycode;
    /** @type {{kind: string, effect: string, parts: Part[], timing: {name: string, ms: string, source: string}[], costs: string[], inert: boolean, danger: string}} */
    const summary = {kind: face.kind === "layer" ? "key" : face.kind, effect: "", parts: [], timing: [], costs: [], inert: false, danger: dangerOf(model, keycode)};
    if (face.kind === "transparent" || face.kind === "disabled" || face.kind === "none") return summary;
    summary.inert = unbuiltKeycode(model, named) || unbuiltKeycode(model, keycode);
    const form = LAYER_FORM.exec(keycode)?.[1] || LAYER_FORM.exec(position?.semantic || "")?.[1];
    if (form && layerOfKeycode(model, keycode) !== null || form === "LOCK_LAYER") {
        summary.kind = "layer";
        summary.effect = vocabulary(model).layerKeyEffects?.[/** @type {string} */ (form)] || "";
    }
    const row = behaviourEditorRow(model, meaning);
    if (!row) return summary;
    const stored = behaviourFor(model, meaning) || (row.stored ? row : null);
    const steps = [...(row.steps || [])].sort((a, b) => a.tapCount - b.tapCount);
    if (!steps.some((step) => step.tapCount === 0)) steps.unshift({tapCount: 0});
    /** @param {import("../../contracts/panel.js").Branch | undefined | null} branch */
    const resolve = (branch) => {
        if (!branch) return null;
        if (!TRANSPARENT.has(String(branch.action)) || !position) return {action: String(branch.action), from: null};
        const answer = answerBelow(stack, at, held, position.layoutIndex);
        return answer ? {action: answer.position.semantic || answer.position.keycode, from: answer.layer} : {action: String(branch.action), from: null};
    };
    let holds = false, holdTier = false;
    for (const step of steps) {
        // A plain key held down is the key itself, so its built-in hold says nothing.
        const builtHold = step.hold ? null : inheritedBranch(row, step, "hold");
        const ownHold = builtHold && canonicalKeycode(model, String(builtHold.action)) === canonicalKeycode(model, meaning) ? null : builtHold;
        for (const [tier, branch] of /** @type {const} */ ([["tap", step.tap || inheritedBranch(row, step, "tap")], ["hold", step.hold || ownHold], ["long", step.longHold]])) {
            const shown = resolve(branch);
            if (!shown || !branch) continue;
            // A hold from the press (MO, a trackball mode) waits for nothing.
            if (tier !== "tap" && !branch.fromPress) holds = true;
            if (tier === "hold" && !branch.fromPress) holdTier = true;
            summary.parts.push({lead: lead(step.tapCount, tier), action: shown.action, from: shown.from});
        }
    }
    // A key that only does its own thing on a tap reads as itself.
    if (summary.kind === "layer" || (summary.parts.length === 1 && summary.parts[0].lead === "Tap"
        && canonicalKeycode(model, summary.parts[0].action) === canonicalKeycode(model, meaning) && !summary.parts[0].from)) summary.parts = [];
    if (summary.kind === "layer" && !stored) return summary;

    const terms = behaviourThresholds(model, /** @type {import("../../contracts/panel.js").BehaviorView} */ (stored || row));
    const sources = vocabulary(model).timingSources || {};
    /** @param {"tapHoldTerm" | "longerHoldTerm" | "multiTapTerm"} name */
    const timing = (name) => {
        const field = behaviourTimingField(/** @type {any} */ ({...row, ...(stored || {})}), name);
        const source = field.followsDefault ? (sources[/** @type {keyof typeof sources} */ (row.timingSources?.[name] || "")] || "default") : "its own";
        return {name, ms: terms[name].ms, source};
    };
    const multi = steps.some((step) => step.tapCount > 0 && (step.tap || step.hold || step.longHold));
    if (holdTier) summary.timing.push(timing("tapHoldTerm"));
    if (steps.some((step) => step.longHold)) summary.timing.push(timing("longerHoldTerm"));
    if (multi) summary.timing.push(timing("multiTapTerm"));
    if (multi) summary.costs.push(`Single taps wait ${terms.multiTapTerm.ms || "a moment"}${terms.multiTapTerm.ms ? " ms" : ""} for a second tap.`);
    if (holds && summary.parts.some((part) => part.lead === "Tap")) summary.costs.push("Tap sends on release.");
    return summary;
}

// The timing line, naming where each value comes from: "hold after 200 ms
// (dual-role) · taps within 150 ms (default)".
/** @param {ReturnType<typeof keySummary>["timing"]} timing */
export function timingWords(timing) {
    const words = {tapHoldTerm: "hold after", longerHoldTerm: "long hold after", multiTapTerm: "taps within"};
    return timing.filter((entry) => entry.ms !== "")
        .map((entry) => `${words[/** @type {keyof typeof words} */ (entry.name)]} ${entry.ms} ms (${entry.source})`).join(" · ");
}
