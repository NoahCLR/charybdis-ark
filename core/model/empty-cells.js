// @ts-check
"use strict";

// What each empty cell of a behaviour's grid does: the standard key, what the
// key does with no row (firmware D-F64), published with the key's built-ins
// (core/model/built-in-behavior.js) so the grid reads it and never works the
// rule out again (D-L73). Nothing from one tap count reaches another.
//
// A cell is `${tapCount}-${tier}` (0-based tap count; tier tap, hold or long)
// and holds what the keyboard does there, `inherited` when the cell is the
// standard key's own tap or hold, or `implied` when it follows from the other
// tiers. A cell names the branch it shows rather than copying it: `{own}` is
// the key's built-in tap or hold, `{step, tier}` a branch the row sets. So a
// key with no row has the same cells as every key with the same kind of
// built-ins, and the model publishes each such set once.
// - An empty Tap is the standard tap, once per press (`times`); a row whose
//   Single tap is Transparent has the key below as its standard tap
//   (`below`). Past the deepest tap count every press is the standard key
//   too, so those rows read the same.
// - The Single tap's empty Hold is the standard hold (`fromPress` when it
//   starts as the key goes down); a fallback hold gives way to an authored
//   long hold.
// - `continues`: with no Long hold, nothing takes over at its threshold, so
//   the press's Hold, set or standard, carries on the way it runs.
// - `tapsBeforeLong`: with a Long hold and no Hold, a release before the Long
//   hold threshold sends that tap count's Tap, set or standard.
// - `tapsOnRelease`: with neither hold, letting go sends the Tap however long
//   the key is held. On the Single tap the standard hold comes first, so only
//   a key with no hold of its own, one whose tap survives a hold
//   (`releaseTaps`), does it there; on a later tap count any key does.
// - `afterTaps`: a later tap count with nothing set, inside the deepest tap
//   count or past it, is the standard key pressed that many times with the
//   last held: the presses before it each send the standard tap, then the
//   standard hold.
// - A key that counts no taps, a row no deeper than its Single tap, treats
//   each press as a Single tap of its own, sent at its release: its later
//   rows tap the Single tap, set or standard, `times` over (`separate`), and
//   hold as a held Single tap does (`asSingle`).
// - A Tap-toggle key with no row counts taps by itself: its
//   TAPPING_TOGGLE-th quick tap locks its layers (`locks`).

const {TAPPING_TOGGLE} = require("../../rules/qmk-keycodes.mjs");
const {KEY_BEHAVIOR_TIER_FIELDS} = require("../schema/key-behavior-domain-v1");
const {DEFAULT_TAP_DEPTH} = require("../schema/profile-depth");
const {tapDepth} = require("./tap-depth");

// The tap counts a grid shows, at most: the firmware's default tap depth
// (webview/view/keyface.mjs behaviourGridSteps caps the grid at it, held by
// tests/view/keyface.test.mjs).
const GRID_TAP_COUNTS = DEFAULT_TAP_DEPTH;

/** @typedef {import("../../contracts/panel.js").BuiltIn} BuiltIn */
/** @typedef {import("../../contracts/edits.js").Tier} Tier */
/** @typedef {import("../../contracts/panel.js").CellRef} CellRef */
/** @typedef {import("../../contracts/panel.js").HoldTierCell} HoldTierCell */
/** @typedef {import("../../contracts/panel.js").ImpliedCell} ImpliedCell */
/** @typedef {import("../../contracts/panel.js").EmptyCell} EmptyCell */
/** @typedef {Pick<import("../schema/types.js").BehaviorStep, "tapIndex" | "tap" | "hold" | "longHold">} Step */

// What every empty cell of a row with `steps` does, given the key's
// built-ins: `{[cell]: {inherited} | {implied}}`, cells that do nothing left
// out.
/** @param {Omit<BuiltIn, "cells">} builtIn @param {readonly Step[]} [steps] @returns {Record<string, EmptyCell>} */
function emptyCells(builtIn, steps = []) {
    const counts = tapDepth(steps) > 1 || Boolean(builtIn.tapToggle && !steps.length);
    /** @param {number} tapIndex @returns {Step} */
    const stepAt = (tapIndex) => steps.find((step) => step.tapIndex === tapIndex) || {tapIndex};
    const single = stepAt(0);
    /** @param {Step} step @param {Tier} kind */
    const set = (step, kind) => Boolean(step[KEY_BEHAVIOR_TIER_FIELDS[kind]]);
    /** @param {Step} step @param {Tier} kind @returns {CellRef} */
    const its = (step, kind) => ({step: step.tapIndex, tier: kind});

    /** @param {Step} step @param {Tier} kind @returns {CellRef | null} */
    const inherited = (step, kind) => {
        if (set(step, kind)) return null;
        if (kind === "tap") {
            if (!step.tapIndex) return builtIn.tap ? {own: "tap"} : null;
            if (!counts) {
                /** @type {CellRef | null} */
                const tap = single.tap ? its(single, "tap") : builtIn.tap ? {own: "tap"} : null;
                return tap ? {...tap, times: step.tapIndex + 1, separate: true} : null;
            }
            if (builtIn.tapToggle && !steps.length && builtIn.hold) return step.tapIndex === TAPPING_TOGGLE - 1 ? {own: "hold", locks: true} : null;
            return builtIn.tap ? {own: "tap", times: step.tapIndex + 1, ...(builtIn.transparentTap ? {below: true} : {})} : null;
        }
        if (kind === "hold") {
            if (!builtIn.hold || step.tapIndex !== 0 || (builtIn.hold.fallback && step.longHold)) return null;
            return {own: "hold"};
        }
        return null;
    };

    /** @param {Step} step @param {Tier} kind @returns {HoldTierCell | null} */
    const tapsAfterHold = (step, kind) => {
        const tap = step.tap ? its(step, "tap") : inherited(step, "tap");
        if (!tap) return null;
        return kind === "hold" && step.longHold ? {meaning: "tapsBeforeLong", tap} : {meaning: "tapsOnRelease", tap};
    };
    // The Single tap's empty holds: its Hold, set or standard, carries on;
    // with none, a key whose tap survives a hold sends the Tap on release.
    /** @param {Step} step @param {Tier} kind @returns {HoldTierCell | null} */
    const singleTapImplied = (step, kind) => {
        const hold = step.hold ? its(step, "hold") : inherited(step, "hold");
        if (kind === "long" && step.longHold) return null;
        if (hold) return kind === "long" ? {meaning: "continues", hold} : null;
        return builtIn.releaseTaps ? tapsAfterHold(step, kind) : null;
    };
    // A later tap count with something set: its Hold carries on; with none,
    // its Tap, set or standard, goes out on release, on any key.
    /** @param {Step} step @param {Tier} kind @returns {HoldTierCell | null} */
    const laterTapImplied = (step, kind) => {
        if (kind === "long" && step.longHold) return null;
        if (step.hold) return kind === "long" ? {meaning: "continues", hold: its(step, "hold")} : null;
        return tapsAfterHold(step, kind);
    };

    /** @param {Step} step @param {Tier} kind @returns {ImpliedCell | null} */
    const implied = (step, kind) => {
        if (kind === "tap" || set(step, kind)) return null;
        if (!step.tapIndex) return singleTapImplied(step, kind);
        if (!counts) {
            const branch = set(single, kind) ? its(single, kind) : inherited(single, kind);
            const as = branch ? {kind, branch} : singleTapImplied(single, kind);
            return as ? {meaning: "asSingle", as} : null;
        }
        if (step.tap || step.hold || step.longHold) return laterTapImplied(step, kind);
        const tap = inherited(step, "tap");
        if (builtIn.hold) {
            if (kind === "long") return {meaning: "continues", hold: {own: "hold"}};
            return {meaning: "afterTaps", ...(tap && !tap.locks ? {tap: {...tap, times: step.tapIndex}} : {}), hold: {own: "hold"}};
        }
        return tap && builtIn.releaseTaps ? {meaning: "tapsOnRelease", tap} : null;
    };

    /** @type {Record<string, EmptyCell>} */
    const cells = {};
    for (let tapIndex = 0; tapIndex < GRID_TAP_COUNTS; tapIndex++) {
        const step = stepAt(tapIndex);
        for (const kind of /** @type {const} */ (["tap", "hold", "long"])) {
            const own = inherited(step, kind);
            const follows = own ? null : implied(step, kind);
            if (own) cells[`${tapIndex}-${kind}`] = {inherited: own};
            else if (follows) cells[`${tapIndex}-${kind}`] = {implied: follows};
        }
    }
    return cells;
}

module.exports = {emptyCells, GRID_TAP_COUNTS};
