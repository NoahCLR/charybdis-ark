// @ts-check
"use strict";

// Conservative timing facts. Only an empty release interval is a proof of
// impossibility; scan order, immediate holds and transparent inheritance are
// deliberately not collapsed into the same rule.
const {KEY_BEHAVIOR_HOLD_STYLES: STYLE} = require("../schema/key-behavior-domain-v1");
const {effectiveComboWindow} = require("../schema/combo-domain-v1");
const {SETTING, SHORTCUT_LAYER_KINDS} = require("../schema/settings-domain-v1");
const {nativeCode, actionName} = require("../schema/actions");
const {customKeyOfCode} = require("../data/user-keycodes");
const {QK} = require("../data/qmk-keycodes");

/**
 * @typedef {import("../schema/types.js").BehaviorStep} BehaviorStep
 * @typedef {{hold: number, long: number, repeat: number}} Timings
 */

const SHORT_WINDOW_MS = 50; // advisory comfort heuristic, never a validity limit
/** @param {import("../schema/types.js").SemanticAction} action */
const transparent = action => nativeCode(action) === 1;
/** @param {number | undefined} code @param {number} start @param {number} end */
const within = (code, start, end) => code !== undefined && code >= start && code <= end;
// QMK's dual-role keys: MT(), LT(), OSL(), OSM() and TT(), the last three
// side by side.
const DUAL_ROLE = /** @type {const} */ ([[QK.MOD_TAP.first, QK.MOD_TAP.last], [QK.LAYER_TAP.first, QK.LAYER_TAP.last],
    [QK.ONE_SHOT_LAYER.first, QK.LAYER_TAP_TOGGLE.last]]);
// The setting a key's Tap / hold threshold follows when its row sets none, or
// when it has no row. A dual-role key follows the dual-role term either way,
// every other row the behaviour term (firmware D-F27 "Every dual-role key",
// part of the Profile Wire base Ark requires, D-L64). A custom key whose
// shortcut turns its layers on as TT() or OSL() does is one too (firmware
// D-F26), so the profile's shortcuts, by slot, say which.
/** @typedef {readonly ({layers?: number, layerKind?: number} | undefined)[]} KindedShortcuts */
/** @param {import("../schema/types.js").SemanticAction} target @param {KindedShortcuts} [shortcuts] */
function holdTermSetting(target, shortcuts) {
    const code = nativeCode(target);
    const slot = code === undefined ? undefined : customKeyOfCode(code);
    if (slot !== undefined) {
        const shortcut = shortcuts?.[slot];
        const dual = Boolean(shortcut?.layers) && (shortcut?.layerKind === SHORTCUT_LAYER_KINDS.TAP_TOGGLE || shortcut?.layerKind === SHORTCUT_LAYER_KINDS.ONESHOT);
        return dual ? SETTING.TAPPING_TERM : SETTING.TAP_HOLD_TERM;
    }
    return DUAL_ROLE.some(([start, end]) => within(code, start, end)) ? SETTING.TAPPING_TERM : SETTING.TAP_HOLD_TERM;
}
/** @template {number | string | undefined} T @param {Pick<import("../schema/types.js").BehaviorRow, 'target'> & Partial<Pick<import("../schema/types.js").BehaviorRow, 'tapHoldTerm' | 'longHoldTerm' | 'multiTapTerm'>>} row @param {readonly T[]} values @param {KindedShortcuts} [shortcuts] @returns {{hold: number | T, long: number | T, repeat: number | T}} */
function effectiveTimings(row, values, shortcuts) {
    return {hold: row.tapHoldTerm || values[holdTermSetting(row.target, shortcuts)],
        long: row.longHoldTerm || values[SETTING.LONG_HOLD_TERM], repeat: row.multiTapTerm || values[SETTING.MULTI_TAP_TERM]};
}
/** @param {BehaviorStep} step @param {Timings} terms @returns {step is BehaviorStep & {hold: import("../schema/types.js").HoldBranch, longHold: import("../schema/types.js").HoldBranch}} */
function releaseHoldUnreachable(step, terms) {
    return step.hold?.style === STYLE.TAP_ON_RELEASE_AFTER_HOLD
        && step.longHold?.style === STYLE.TAP_ON_RELEASE_AFTER_HOLD
        && nativeCode(step.hold.action) !== 0 && nativeCode(step.longHold.action) !== 0
        && !transparent(step.hold.action) && !transparent(step.longHold.action)
        && Number.isInteger(terms.hold) && Number.isInteger(terms.long) && terms.long <= terms.hold;
}
/** @param {import("./types.js").DecodedProfile} decoded */
function gestureTimingFindings(decoded) {
    /** @type {import("../../contracts/model.js").Finding[]} */
    const results = [];
    for (const row of decoded.behaviors?.rows || []) {
        const keycode = actionName(row.target), terms = effectiveTimings(row, decoded.settings.values, decoded.settings.customKeyShortcuts);
        /** @param {string} id @param {string} title @param {string} detail @param {string} fix @param {import("../../contracts/model.js").FindingLevel} [level] */
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
                    `The Long hold threshold is ${terms.long} ms and the Tap / hold threshold is ${terms.hold} ms. Which actions run also depends on their hold styles, input delivery and scan order; the normal Hold-then-Long-hold progression is not available.`,
                    "Put the Long hold threshold after the Tap / hold threshold for distinct tiers. This warning does not claim both actions are impossible.");
                else if (step.hold && gap < SHORT_WINDOW_MS) add(`narrow:${step.tapIndex}`, `${branch} has a narrow hold interval`,
                    `Only ${gap} ms separates Hold (${terms.hold} ms) from Long hold (${terms.long} ms). Selecting or using just the first tier may be difficult.`,
                    "Increase the gap if you need to select Hold separately. The 50 ms advisory threshold is a comfort heuristic, not a firmware limit.", "notice");
            }
        }
        if (row.steps.some(step => step.tapIndex > 0)) {
            for (const [name, value] of /** @type {[string, number][]} */ ([["first-press tap", terms.hold], ["released repeat gap", terms.repeat]])) {
                if (Number.isInteger(value) && value > 0 && value < SHORT_WINDOW_MS) add(`short:${name}`, `short ${name}`,
                    `The ${name} window is ${value} ms. This can be physically demanding even though the firmware accepts it.`,
                    "Increase the timing if you cannot perform the gesture comfortably. This is advice, not proof of unreachability.", "notice");
            }
        }
    }
    if (decoded.settings.values[SETTING.COMBOS_ENABLED]) (decoded.combos?.rows || []).forEach((combo, index) => {
        const comboWindow = effectiveComboWindow(decoded.combos, combo);
        if (comboWindow >= SHORT_WINDOW_MS) return;
        results.push({kind: "comboTiming", level: "notice", layers: [], identity: String(index),
            title: `Combo ${index} has a short chord window`,
            detail: `Its ${combo.inputs.length} keys must complete a chord within the effective ${comboWindow} ms window. This may be difficult to perform; it is not proof that the chord is impossible.`,
            fix: "Increase the combo window if needed. Longer windows can postpone individual-key output; they do not consume the repeat gap, which the keyboard times from the physical presses.",
            place: {kind: "combo", index}});
    });
    return results;
}
module.exports = {holdTermSetting, effectiveTimings, releaseHoldUnreachable, gestureTimingFindings};
