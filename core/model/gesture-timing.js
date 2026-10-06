"use strict";

// Conservative timing facts. Only an empty release interval is a proof of
// impossibility; scan order, immediate holds and transparent inheritance are
// deliberately not collapsed into the same rule.
const {KEY_BEHAVIOR_HOLD_MODES: MODE} = require("../schema/key-behavior-domain-v1");
const {effectiveComboTerm} = require("../schema/combo-domain-v1");
const {nativeCode, actionName} = require("../schema/actions");

const SHORT_WINDOW_MS = 50; // advisory comfort heuristic, never a validity limit
const transparent = action => nativeCode(action) === 1;
function effectiveTimings(row, values) {
    const code = nativeCode(row.target);
    return {hold: row.tapHoldTerm || values[code >= 0x4000 && code <= 0x4fff ? 0 : 1],
        long: row.longerHoldTerm || values[2], repeat: row.multiTapTerm || values[3]};
}
function releaseHoldUnreachable(step, terms) {
    return step.hold?.mode === MODE.TAP_ON_RELEASE_AFTER_HOLD
        && step.longHold?.mode === MODE.TAP_ON_RELEASE_AFTER_HOLD
        && nativeCode(step.hold.action) !== 0 && nativeCode(step.longHold.action) !== 0
        && !transparent(step.hold.action) && !transparent(step.longHold.action)
        && Number.isInteger(terms.hold) && Number.isInteger(terms.long) && terms.long <= terms.hold;
}
function gestureTimingFindings(decoded) {
    const results = [];
    for (const row of decoded.behaviors?.rows || []) {
        const keycode = actionName(row.target), terms = effectiveTimings(row, decoded.settings.values);
        const add = (id, title, detail, fix, level = "warning") => results.push({kind: "gestureTiming", level, layers: [],
            identity: `${nativeCode(row.target)}:${id}`, title: `${keycode}: ${title}`, detail, fix, place: {kind: "behaviour", keycode}});
        for (const step of row.steps) {
            const branch = `Press ${step.tapIndex + 1}`;
            if (releaseHoldUnreachable(step, terms)) {
                add(`release:${step.tapIndex}`, `${branch} hold cannot send its release action`,
                    `Hold needs a release at or after ${terms.hold} ms, but Long hold takes precedence on release from ${terms.long} ms. There is no release time that selects ${actionName(step.hold.action)}.`,
                    "Set the Long hold threshold later than the Tap / hold threshold, or change one of the actions or how it runs.");
            } else if (step.longHold && Number.isInteger(terms.long) && Number.isInteger(terms.hold)) {
                const gap = terms.long - terms.hold;
                if (gap <= 0) add(`order:${step.tapIndex}`, `${branch} hold thresholds overlap`,
                    `The Long hold threshold is ${terms.long} ms and the Tap / hold threshold is ${terms.hold} ms. Which actions run also depends on their hold modes, input delivery and scan order; the normal Hold-then-Long-hold progression is not available.`,
                    "Put the Long hold threshold after the Tap / hold threshold for distinct tiers. This warning does not claim both actions are impossible.");
                else if (step.hold && gap < SHORT_WINDOW_MS) add(`narrow:${step.tapIndex}`, `${branch} has a narrow hold interval`,
                    `Only ${gap} ms separates Hold (${terms.hold} ms) from Long hold (${terms.long} ms). Selecting or using just the first tier may be difficult.`,
                    "Increase the gap if you need to select Hold separately. The 50 ms advisory threshold is a comfort heuristic, not a firmware limit.", "notice");
            }
        }
        if (row.steps.some(step => step.tapIndex > 0)) {
            for (const [name, value] of [["first-press tap", terms.hold], ["released repeat gap", terms.repeat]]) {
                if (Number.isInteger(value) && value > 0 && value < SHORT_WINDOW_MS) add(`short:${name}`, `short ${name}`,
                    `The ${name} window is ${value} ms. This can be physically demanding even though the firmware accepts it.`,
                    "Increase the timing if you cannot perform the gesture comfortably. This is advice, not proof of unreachability.", "notice");
            }
        }
    }
    if (decoded.settings.values[20]) (decoded.combos?.rows || []).forEach((combo, index) => {
        const term = effectiveComboTerm(decoded.combos, combo);
        if (term >= SHORT_WINDOW_MS) return;
        results.push({kind: "comboTiming", level: "notice", layers: [], identity: String(index),
            title: `Combo ${index} has a short chord window`,
            detail: `Its ${combo.inputs.length} keys must complete a chord within the effective ${term} ms window. This may be difficult to perform; it is not proof that the chord is impossible.`,
            fix: "Increase the combo window if needed. Longer windows can postpone individual-key output; they do not consume the repeat gap on firmware with physical gesture timing.",
            place: {kind: "combo", index}});
    });
    return results;
}
module.exports = {effectiveTimings, releaseHoldUnreachable, gestureTimingFindings};
