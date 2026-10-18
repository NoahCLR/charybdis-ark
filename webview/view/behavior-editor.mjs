// @ts-check
/** @typedef {Partial<import("../../contracts/panel.js").PublishedModel> | null | undefined} Model */
import {behaviourListeningTo, canonicalKeycode, keyFace, keyMeaning} from "./keyface.mjs";
import {resolvedPositions} from "./layer-resolution.mjs";
import {timingInput} from "./timing-input.mjs";

export function canHaveBehaviour(/** @type {Model} */ model, /** @type {string} */ keycode) {
    const key = canonicalKeycode(model, keycode);
    return Boolean(key) && !["KC_NO", "XXXXXXX", "KC_TRANSPARENT", "KC_TRNS", "_______"].includes(key)
        && !/^0x0*[01]$/i.test(key);
}

// The key a board position opens in Behaviours. Rows are keyed by keycode, so
// in a layer preview a transparent position follows the key the board shows
// there, answered from below, and names the layer that supplies it. Outside a
// preview, or with nothing mapped below, it stays the stored key.
export function behaviourKeyAt(/** @type {import("../../contracts/panel.js").Layer[]} */ stack, /** @type {number} */ at, /** @type {number[]} */ held, /** @type {number | undefined} */ index) {
    const own = (stack[at]?.positions || []).find((position) => position.layoutIndex === index);
    if (!held?.length || keyFace(own).kind !== "transparent") return {keycode: keyMeaning(own), from: null};
    const answer = resolvedPositions(stack, at, held).find((entry) => entry.position.layoutIndex === index);
    return answer ? {keycode: keyMeaning(answer.position), from: answer.layer} : {keycode: keyMeaning(own), from: null};
}

// The row Behaviours shows once the previewed layers change. A row opened from
// the selected key follows what that key answers with now; one picked from the
// list stays.
export function behaviourRowAfterPreview(/** @type {string | null} */ row, /** @type {string} */ before, /** @type {string} */ after) {
    return row === before ? after : row;
}

// A preview is never inserted into model.keyBehaviors: counts, reach markers
// and the board continue to describe only the host's stored draft.
export function behaviourEditorRow(/** @type {Model} */ model, /** @type {string} */ keycode) {
    if (!canHaveBehaviour(model, keycode)) return undefined;
    const existing = behaviourListeningTo(model, keycode);
    const key = existing?.keycode || canonicalKeycode(model, keycode);
    const defaults = model?.behaviorEditing?.keyDefaults?.[key];
    return {...(existing || {keycode: key, steps: [], tapHoldTerm: "0", longerHoldTerm: "0", multiTapTerm: "0",
        keepsAutoMouseAnchored: false, builtIn: defaults?.builtIn || {}}),
        stored: Boolean(existing), timingDefaults: defaults?.timing || model?.behaviorTimingDefaults || {}};
}

export function behaviourTimingField(/** @type {import("../../contracts/panel.js").BehaviorView} */ behaviour, /** @type {"tapHoldTerm" | "longerHoldTerm" | "multiTapTerm"} */ name) {
    const stored = String(behaviour[name] ?? "0");
    const followsDefault = Number(stored) === 0;
    const fallback = behaviour.timingDefaults?.[name];
    return {stored, followsDefault, fallback: fallback === undefined ? "" : String(fallback),
        ...timingInput(stored, fallback, followsDefault)};
}

// A stored behaviour row with nothing in it: no branches, no timing of its own
// and not anchoring auto-mouse. A row without branches is no row (firmware
// D-F27 "Rows without steps"), and its switch and layers gate only what it
// holds, so the keyboard runs the key as if the row were not there.
export function behaviourIsEmpty(/** @type {import("../../contracts/panel.js").BehaviorView} */ behaviour) {
    return !(behaviour.steps || []).length && !behaviour.keepsAutoMouseAnchored
        && ["tapHoldTerm", "longerHoldTerm", "multiTapTerm"].every((name) => Number(behaviour[/** @type {"tapHoldTerm"} */ (name)] ?? 0) === 0);
}

// The thresholds a behaviour actually runs on, in ms — its own, or the
// keyboard's default where it follows that: tap / hold whenever a tier waits to be held, long
// hold when a branch has one, repeated taps when a branch starts on a later
// tap. A behaviour with no branches yet still carries its tap / hold term.
export function behaviourThresholds(/** @type {Model} */ model, /** @type {import("../../contracts/panel.js").BehaviorView} */ behaviour) {
    const row = behaviourEditorRow(model, behaviour.keycode) || {...behaviour, timingDefaults: model?.behaviorTimingDefaults || {}};
    const steps = behaviour.steps || [];
    /** @param {"tapHoldTerm" | "longerHoldTerm" | "multiTapTerm"} name */
    const term = (name) => {
        const field = behaviourTimingField(/** @type {any} */ (row), name);
        return {name, ms: field.followsDefault ? field.fallback : field.stored};
    };
    const used = {
        tapHoldTerm: !steps.length || steps.some((step) => step.hold || step.longHold),
        longerHoldTerm: steps.some((step) => step.longHold),
        multiTapTerm: steps.some((step) => step.tapCount > 0),
    };
    return {tapHoldTerm: term("tapHoldTerm"), longerHoldTerm: term("longerHoldTerm"), multiTapTerm: term("multiTapTerm"),
        used: /** @type {const} */ (["tapHoldTerm", "longerHoldTerm", "multiTapTerm"]).filter((name) => used[name])};
}

// The number a hold tier's helper turns on, as the card states it beside the
// helper: a Hold that taps at or after its threshold waits for tap / hold and a
// Long hold for long hold, while one that repeats runs at its own rate, given
// as stored. Empty when the helper turns on neither.
export function helperDetail(/** @type {import("../../contracts/edits.js").Tier} */ kind, /** @type {{helper?: string, repeatHz?: import("../../contracts/edits.js").Scalar}} */ branch, /** @type {ReturnType<typeof behaviourThresholds>} */ terms) {
    if (kind === "tap") return "";
    if (branch.helper === "REPEAT_WHILE_HELD") return `${String(branch.repeatHz ?? "0")} Hz`;
    if (branch.helper !== "TAP_AT_HOLD_THRESHOLD" && branch.helper !== "TAP_ON_RELEASE_AFTER_HOLD") return "";
    const term = terms[kind === "hold" ? "tapHoldTerm" : "longerHoldTerm"];
    return term.ms === "" ? "" : `${term.ms} ms`;
}

// Leaving a displayed default untouched must keep the stored inheritance zero.
export function behaviourTimingEdit(/** @type {string} */ value, /** @type {ReturnType<typeof behaviourTimingField>} */ field) {
    const written = String(value).trim();
    if (field.followsDefault && field.fallback !== "" && written === field.fallback) return field.stored;
    return written === field.value ? field.stored : written || "0";
}
