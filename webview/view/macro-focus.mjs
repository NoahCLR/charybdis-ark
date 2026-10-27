// @ts-check
// Steps have no stored identity. Local identities follow edits and reorders;
// steps the core newly parsed inherit matching identities without caching payloads.

/** @typedef {import("./types.js").MacroStep} Step */
/** @param {Step} step */
const valueOf = step => JSON.stringify(step.kind === "text" ? [step.kind, step.text]
    : step.kind === "delay" ? [step.kind, step.delay] : [step.kind, step.keys]);

/** @param {Step[]} steps @param {Step[] | undefined} previous @param {() => string} createId @returns {Step[]} */
export function withStepFocus(steps, previous, createId) {
    const remaining = [...(previous || [])];
    return steps.map(step => {
        const match = remaining.findIndex(old => step.focusId ? old.focusId === step.focusId : valueOf(old) === valueOf(step));
        const old = match >= 0 ? remaining.splice(match, 1)[0] : undefined;
        return {...step, focusId: step.focusId || old?.focusId || createId()};
    });
}
