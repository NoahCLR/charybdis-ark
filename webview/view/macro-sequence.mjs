// @ts-check
// Reading, diagnosing and moving the editor's sequence without changing its
// encoding. Focus IDs belong to the editor; moves preserve every step object.
import {describeStep} from "./macro.mjs";
import {actionLabel} from "./keyface.mjs";
import {keyIdentity} from "./key-identity.mjs";
/** @typedef {import('./types.js').MacroStep} Step */
/** @typedef {Partial<import('../../contracts/panel.js').PublishedModel> | null} Model */

/** @param {Model} model @param {Step} step */
export function sequenceFace(model, step) {
    const full = describeStep(step, key => actionLabel(model, key));
    const label = step.kind === "text" ? step.text.replaceAll("\n", " ↵ ").replaceAll("\t", " ⇥ ")
        : step.kind === "delay" ? String(step.delay)
        : step.keys.map(key => model?.qmkKeyShortLabels?.[key] || model?.qmkKeyShortLabels?.[keyIdentity(model, key).name] || actionLabel(model, key)).join(" + ");
    const kind = step.kind === "tap" && step.keys.length > 1 ? "chord" : step.kind;
    return {full, label, wide: step.kind === "text" || ("keys" in step && step.keys.length > 1), kind};
}

/** @param {readonly Step[]} steps @param {Model | undefined} [model] @param {(key: string) => string} [label] */
export function sequenceIssues(steps, model, label = key => key) {
    const issues = steps.map(() => "");
    /** @type {Map<string, {index: number, key: string}>} */
    const held = new Map();
    steps.forEach((step, index) => {
        if (!("keys" in step)) return;
        for (const key of step.keys) {
            const id = keyIdentity(model, key).name;
            if (step.kind === "release") {
                if (!held.delete(id)) issues[index] ||= `${label(key)} is released before it is pressed. Move its release after its press.`;
            } else if (held.has(id)) {
                issues[index] ||= `${label(key)} is already held. Release it before pressing or tapping it again.`;
            } else if (step.kind === "press") held.set(id, {index, key});
        }
    });
    for (const {index, key} of held.values()) issues[index] ||= `Release ${label(key)} before the macro ends.`;
    return issues;
}

// `before` is an insertion position in the original array, including its end.
/** @param {readonly Step[]} steps @param {string} id @param {number} before */
export function moveSequenceStep(steps, id, before) {
    const from = steps.findIndex(step => step.focusId === id);
    if (from < 0 || !Number.isInteger(before) || before < 0 || before > steps.length) return [...steps];
    const next = [...steps], [step] = next.splice(from, 1);
    next.splice(before - (from < before ? 1 : 0), 0, step);
    return next;
}

// Hit-test the complete sequence, including the gutters and wrapped-row gaps.
/** @param {{left: number, top: number, width: number, height: number}[]} boxes @param {number} x @param {number} y */
export function sequenceInsertionAt(boxes, x, y) {
    if (!boxes.length) return 0;
    let closest = 0;
    boxes.forEach((box, index) => {
        if (Math.abs(y - box.top - box.height / 2) < Math.abs(y - boxes[closest].top - boxes[closest].height / 2)) closest = index;
    });
    const row = boxes.map((box, index) => ({box, index})).filter(({box}) => Math.abs(box.top - boxes[closest].top) < 1);
    return row.find(({box}) => x < box.left + box.width / 2)?.index ?? row[row.length - 1].index + 1;
}

// A sole blank text step has no encoded content and should not require cleanup
// before choosing a different first action. Later text blocks stay untouched.
/** @param {readonly Step[]} steps @param {Step} step */
export function appendSequenceStep(steps, step) {
    const empty = steps.length === 1 && steps[0].kind === "text" && steps[0].text === "";
    return [...(empty ? [] : steps), step];
}
