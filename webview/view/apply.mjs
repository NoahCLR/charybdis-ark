// @ts-check
// The words and shape of the Apply moment in the draft bar and the Review:
// three steps a person can follow (the keyboard's ten stay in Details), the
// wait for every key to be let go, the end (saved, or one of three verdicts
// on what was saved), and a stale draft named by what changed.
// Pure: it reads the published model and returns words.

/** @typedef {import("../../contracts/model.js").ApplyView} ApplyView */

// The keyboard's ten steps, as three: a copy of what it has, both halves
// written, then the switch to the new profile.
export const USER_STEPS = Object.freeze([
    {id: "save", label: "Save a copy", steps: ["check", "backup"]},
    {id: "write", label: "Write both halves", steps: ["upload", "validate", "stage", "peer"]},
    {id: "switch", label: "Switch over", steps: ["commit", "converge", "local", "verify"]},
]);

/** @param {ApplyView} apply @returns {{id: string, label: string, state: "done" | "active" | "failed" | "pending"}[]} */
export function userSteps(apply) {
    return USER_STEPS.map(({id, label, steps}) => {
        const states = apply.steps.filter((step) => steps.includes(step.id)).map((step) => step.state);
        const state = states.includes("failed") ? "failed" : states.includes("active") ? "active"
            : states.length && states.every((value) => value === "done") ? "done" : "pending";
        return {id, label, state};
    });
}

// The keyboard waits up to a minute for a quiet keyboard before it saves.
export const WAIT_SECONDS = 60;
/** @param {number} since @param {number} now */
export const waitLeft = (since, now) => Math.max(0, WAIT_SECONDS - Math.floor((now - since) / 1000));
/** @param {number} seconds */
export const waitHeadline = (seconds) => `Let go of every key to finish · ${seconds} s`;
export const WAIT_DETAIL = "Release held keys, and turn off locked layers and trackball modes. The keyboard saves as soon as it is quiet.";

// What can honestly be said about what was saved when Apply stops.
/** @type {Readonly<Record<string, {title: string, words: string}>>} */
export const VERDICTS = Object.freeze({
    none: {title: "Nothing was saved", words: "The keyboard kept the profile it had. Your draft is unchanged; you can apply it again."},
    decided: {title: "The keyboard finishes this save by itself", words: "It had already decided to save the new profile and completes it about 15 seconds after both halves are connected. Ark reads the keyboard again then."},
    unknown: {title: "Ark can't tell what was saved", words: "Read the keyboard to see which profile it runs now. Your draft is unchanged."},
});
/** @param {string | undefined} saved */
export const verdict = (saved) => VERDICTS[saved ?? ""] || VERDICTS.unknown;
export const REREAD_SECONDS = 15;

/** @param {number} count */
export const changesKept = (count) => `your ${count} change${count === 1 ? " is" : "s are"} kept`;

// The stale bar: what changed on the keyboard, up to two things and a count.
/** @param {{connectionChanged?: boolean, keyboardChanged?: string[], changes: unknown[]}} draft */
export function staleWords(draft) {
    if (draft.connectionChanged) return {title: "The keyboard reconnected", detail: `Update the draft against it before going on; ${changesKept(draft.changes.length)}.`};
    const changed = draft.keyboardChanged || [];
    const named = changed.slice(0, 2).join("; ") + (changed.length > 2 ? `; and ${changed.length - 2} more` : "");
    return {title: named ? `Changed on the keyboard: ${named}` : "The keyboard changed since this draft began",
        detail: `Update draft keeps your edits on top of it; ${changesKept(draft.changes.length)}.`};
}

// The Review's note before Apply, in the firmware's true order of events.
export const APPLY_NOTE = "Apply first saves a copy of what the keyboard has now. Let go of your keys when asked; typing pauses for a moment while the new setup switches on. If Apply is cut off before then, the keyboard keeps its old setup; after that, it finishes the new one by itself.";

// The Review's footer: where the draft goes.
/** @param {import("../../contracts/panel.js").PublishedModel | null | undefined} model */
export function applyTarget(model) {
    const name = model?.keyboardName?.name || model?.keyboardName?.builtIn || model?.device?.label || "the keyboard";
    const halves = model?.device?.health?.halves;
    const words = halves === "agree" ? "both halves connected" : halves === "alone" ? "left half not answering" : halves === "apart" ? "halves out of sync" : "halves not read";
    return `To ${name} · ${words}`;
}

export const SUCCESS = "✓ Saved to both halves";
