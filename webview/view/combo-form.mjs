// @ts-check
// The combo builder's rule, pure: what a combo still needs before it can be
// kept.

// A new combo needs what it sends and at least two keys, and no more keys than
// the keyboard's combo input limit (the keyboard refuses either), and says
// what is wrong (B8). Empty when it can be added.
/** @param {{output?: string}} form @param {readonly string[]} inputs @param {number | null} [limit] */
export function comboMissing(form, inputs, limit = null) {
    const output = String(form.output ?? "").trim() !== "";
    const keys = inputs.length;
    if (limit && keys > limit) return `${comboLimit(limit)} Remove ${keys - limit === 1 ? "one" : keys - limit}.`;
    if (!output && keys < 2) return keys === 1 ? "Needs what it sends and one more key." : "Needs what it sends and two keys.";
    if (!output) return "Needs what it sends.";
    if (keys < 2) return keys === 1 ? "Needs one more key." : "Needs two keys.";
    return "";
}

// The keyboard's combo input limit, said once the builder reaches it, where it
// says what a combo still needs: Pick on board takes no more keys after that.
/** @param {readonly string[]} inputs @param {number | null} [limit] */
export const comboFull = (inputs, limit = null) => limit && inputs.length >= limit ? comboLimit(limit) : "";
/** @param {number} limit */
const comboLimit = (limit) => `A combo takes at most ${limit} keys.`;
