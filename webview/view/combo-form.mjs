// @ts-check
// The combo builder's rules, pure: what a new combo still needs before it can
// be added, the wait its Must be held and Tap only switches really mean, and
// moving an input to another place in its order.

// A new combo needs what it sends and at least two keys (the keyboard refuses
// less), and says which is missing (B8). Empty when it can be added.
/** @param {{output?: string}} form @param {readonly string[]} inputs */
export function comboMissing(form, inputs) {
    const output = String(form.output ?? "").trim() !== "";
    const keys = inputs.length;
    if (!output && keys < 2) return keys === 1 ? "Needs what it sends and one more key." : "Needs what it sends and two keys.";
    if (!output) return "Needs what it sends.";
    if (keys < 2) return keys === 1 ? "Needs one more key." : "Needs two keys.";
    return "";
}

// QMK decides a Must be held or Tap only combo once its keys have been down
// for the longer of its window and the combo hold threshold
// (process_combo.c), so the switches state that wait, not the threshold alone.
/** @param {import("../../contracts/edits.js").Scalar | undefined} windowMs @param {import("../../contracts/edits.js").Scalar | undefined} holdMs */
export function comboDecidedAfter(windowMs, holdMs) {
    const values = [windowMs, holdMs].map(Number).filter((value) => Number.isFinite(value) && value > 0);
    return values.length ? Math.max(...values) : null;
}

/** @param {"mustHold" | "mustTap"} flag @param {number | null} wait */
export function comboWaitTip(flag, wait) {
    const after = wait === null ? "the longer of its window and the combo hold threshold (Settings · Combos)" : `${wait} ms, the longer of its window and the combo hold threshold`;
    return flag === "mustHold"
        ? `Fires only once its keys have been held for ${after}. Released sooner, the keys type themselves.`
        : `Fires only if its keys are released within ${after}. Held longer, the keys type themselves.`;
}

// An input dragged to another place: the order Keys in order checks.
/** @template T @param {readonly T[]} list @param {number} from @param {number} to @returns {T[]} */
export function moved(list, from, to) {
    if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return list.slice();
    const next = list.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}
