import {behaviourListeningTo, canonicalKeycode, keyFace, keyMeaning, resolvedPositions} from "./keyface.mjs";
import {timingInput} from "./timing-input.mjs";

export function canHaveBehaviour(model, keycode) {
    const key = canonicalKeycode(model, keycode);
    return Boolean(key) && !["KC_NO", "XXXXXXX", "KC_TRANSPARENT", "KC_TRNS", "_______"].includes(key)
        && !/^0x0*[01]$/i.test(key);
}

// The key a board position opens in Behaviours. Rows are keyed by keycode, so
// in a layer preview a transparent position follows the key the board shows
// there, answered from below, and names the layer that supplies it. Outside a
// preview, or with nothing mapped below, it stays the stored key.
export function behaviourKeyAt(stack, at, held, index) {
    const own = (stack[at]?.positions || []).find((position) => position.layoutIndex === index);
    if (!held?.length || keyFace(own).kind !== "transparent") return {keycode: keyMeaning(own), from: null};
    const answer = resolvedPositions(stack, at, held).find((entry) => entry.position.layoutIndex === index);
    return answer ? {keycode: keyMeaning(answer.position), from: answer.layer} : {keycode: keyMeaning(own), from: null};
}

// The row Behaviours shows once the previewed layers change. A row opened from
// the selected key follows what that key answers with now; one picked from the
// list stays.
export function behaviourRowAfterPreview(row, before, after) {
    return row === before ? after : row;
}

// A preview is never inserted into model.keyBehaviors: counts, reach markers
// and the board continue to describe only the host's stored draft.
export function behaviourEditorRow(model, keycode) {
    if (!canHaveBehaviour(model, keycode)) return undefined;
    const existing = behaviourListeningTo(model, keycode);
    const key = existing?.keycode || canonicalKeycode(model, keycode);
    const defaults = model?.behaviorEditing?.keyDefaults?.[key];
    return {...(existing || {keycode: key, steps: [], tapHoldTerm: "0", longerHoldTerm: "0", multiTapTerm: "0",
        keepsAutoMouseAnchored: false, builtIn: defaults?.builtIn || {}}),
        stored: Boolean(existing), timingDefaults: defaults?.timing || model?.behaviorTimingDefaults || {}};
}

export function behaviourTimingField(behaviour, name) {
    const stored = String(behaviour[name] ?? "0");
    const followsDefault = Number(stored) === 0;
    const fallback = behaviour.timingDefaults?.[name];
    return {stored, followsDefault, fallback: fallback === undefined ? "" : String(fallback),
        ...timingInput(stored, fallback, followsDefault)};
}

// Leaving a displayed default untouched must keep the stored inheritance zero.
export function behaviourTimingEdit(value, field) {
    const written = String(value).trim();
    if (field.followsDefault && field.fallback !== "" && written === field.fallback) return field.stored;
    return written === field.value ? field.stored : written || "0";
}
