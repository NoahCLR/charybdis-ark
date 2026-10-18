// @ts-check
// The combo builder's rule, pure: what a combo still needs before it can be
// kept.

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
