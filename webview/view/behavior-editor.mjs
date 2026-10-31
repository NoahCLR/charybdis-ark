// @ts-check
/** @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model */
import {keyKindOf} from "./keyface.mjs";
import {keyIdentity} from "./key-identity.mjs";
import {timingInput} from "./timing-input.mjs";
import {vocabulary} from "./vocabulary.mjs";

// Every key may have a behaviour but a transparent or disabled one, as core
// says which those are (qmkKeyKinds), however it is spelled.
export function canHaveBehaviour(/** @type {Model} */ model, /** @type {string} */ keycode) {
    const kind = keyKindOf(model, String(keycode ?? ""));
    return Boolean(keycode) && kind !== "transparent" && kind !== "disabled";
}

// The row Behaviours shows once the previewed layers change. A row opened from
// the selected key follows what that key answers with now; one picked from the
// list stays.
export function behaviourRowAfterPreview(/** @type {string | null} */ row, /** @type {string} */ before, /** @type {string} */ after) {
    return row === before ? after : row;
}

// A preview is never inserted into model.keyBehaviors: counts, reach markers
// and the board continue to describe only the core's stored draft.
export function behaviourEditorRow(/** @type {Model} */ model, /** @type {string} */ keycode) {
    if (!canHaveBehaviour(model, keycode)) return undefined;
    const {listening: existing, canonical} = keyIdentity(model, keycode);
    const key = existing?.keycode || canonical;
    const defaults = model?.behaviorEditing?.keyDefaults?.[key];
    return {...(existing || {keycode: key, steps: [], tapHoldTerm: "0", longHoldTerm: "0", multiTapTerm: "0",
        keepsAutoMouseAnchored: false, builtIn: defaults?.builtIn || {}}),
        stored: Boolean(existing), timingDefaults: defaults?.timing || model?.behaviorTimingDefaults || {},
        timingWords: timingWords(model, defaults?.timingSources),
        // Unknown counts as yes, so nothing that might matter is dropped.
        timingAlone: defaults?.timingAlone !== false};
}

// The words naming where each timing field's default comes from, as the core
// says it per key (core/model/profile-model.js behaviorDefaults); without it,
// the placeholder says only "default".
/** @param {Model} model @param {import("../../contracts/panel.js").KeyBehaviorDefaults["timingSources"]} sources @returns {Partial<Record<TimingName, string>>} */
function timingWords(model, sources) {
    const words = vocabulary(model).timingSources;
    return Object.fromEntries(Object.entries(sources || {}).map(([name, source]) => [name, words[source] || ""]));
}

/** @typedef {import("../../contracts/edits.js").TimingTerm} TimingName */
// A behaviour's timing as a field: what it stores, the default it follows and
// the words for where that comes from. Only these parts of a row are read.
/** @typedef {Partial<Record<TimingName, import("../../contracts/edits.js").Scalar>> & Pick<import("../../contracts/panel.js").BehaviorView, "timingDefaults" | "timingWords">} TimedBehaviour */
export function behaviourTimingField(/** @type {TimedBehaviour} */ behaviour, /** @type {TimingName} */ name) {
    const stored = String(behaviour[name] ?? "0");
    const followsDefault = Number(stored) === 0;
    const fallback = behaviour.timingDefaults?.[name];
    return {stored, followsDefault, fallback: fallback === undefined ? "" : String(fallback),
        ...timingInput(stored, fallback, followsDefault, behaviour.timingWords?.[name])};
}

// Whether a behaviour as the editor holds it has a timing of its own: stored
// zero, or nothing written, follows the default.
export const behaviourHasTiming = (/** @type {Pick<import("../../contracts/edits.js").Behavior, TimingName>} */ behaviour) =>
    [behaviour.tapHoldTerm, behaviour.longHoldTerm, behaviour.multiTapTerm].some((value) => !/^0*$/.test(String(value ?? "").trim()));

// A behaviour that changes nothing: no branches, not keeping the pointer layer
// on, and no timing that applies to its key. A row without branches is no row
// (firmware D-F27 "Rows without steps"): its timing counts only where
// `timingAlone` says a timing alone does something, and its switch and layers
// gate only what it holds. Review notes a stored one by the same rule
// (core/model/inert-behaviors.js), and the editor keeps none.
export function behaviourChangesNothing(/** @type {import("../../contracts/edits.js").Behavior} */ behaviour) {
    return !(behaviour.steps || []).length && !behaviour.keepsAutoMouseAnchored
        && (!behaviourHasTiming(behaviour) || behaviour.timingAlone === false);
}

// The thresholds a behaviour actually runs on, in ms — its own, or the
// keyboard's default where it follows that: tap / hold whenever a tier waits to be held, long
// hold when a branch has one, repeated taps when a branch starts on a later
// tap. A behaviour with no branches yet still carries its tap / hold term.
export function behaviourThresholds(/** @type {Model} */ model, /** @type {import("../../contracts/panel.js").BehaviorView} */ behaviour) {
    const row = behaviourEditorRow(model, behaviour.keycode) || {...behaviour, timingDefaults: model?.behaviorTimingDefaults || {}};
    const steps = behaviour.steps || [];
    /** @param {TimingName} name */
    const term = (name) => {
        const field = behaviourTimingField(row, name);
        return {name, ms: field.followsDefault ? field.fallback : field.stored};
    };
    const used = {
        tapHoldTerm: !steps.length || steps.some((step) => step.hold || step.longHold),
        longHoldTerm: steps.some((step) => step.longHold),
        multiTapTerm: steps.some((step) => step.tapCount > 0),
    };
    return {tapHoldTerm: term("tapHoldTerm"), longHoldTerm: term("longHoldTerm"), multiTapTerm: term("multiTapTerm"),
        used: /** @type {const} */ (["tapHoldTerm", "longHoldTerm", "multiTapTerm"]).filter((name) => used[name])};
}

// The number a hold tier's hold style turns on, as the card states it beside
// the hold style: a Hold that taps at or after its threshold waits for
// tap / hold and a Long hold for long hold, while one that repeats runs at its
// own rate, given as stored. Empty when the hold style turns on neither.
export function styleDetail(/** @type {import("../../contracts/edits.js").Tier} */ kind, /** @type {{style?: string, repeatHz?: import("../../contracts/edits.js").Scalar}} */ branch, /** @type {ReturnType<typeof behaviourThresholds>} */ terms) {
    if (kind === "tap") return "";
    if (branch.style === "REPEAT_WHILE_HELD") return `${String(branch.repeatHz ?? "0")} Hz`;
    if (branch.style !== "TAP_AT_HOLD_THRESHOLD" && branch.style !== "TAP_ON_RELEASE_AFTER_HOLD") return "";
    const term = terms[kind === "hold" ? "tapHoldTerm" : "longHoldTerm"];
    return term.ms === "" ? "" : `${term.ms} ms`;
}

// Leaving a displayed default untouched must keep the stored inheritance zero.
export function behaviourTimingEdit(/** @type {string} */ value, /** @type {ReturnType<typeof behaviourTimingField>} */ field) {
    const written = String(value).trim();
    if (field.followsDefault && field.fallback !== "" && written === field.fallback) return field.stored;
    return written === field.value ? field.stored : written || "0";
}
