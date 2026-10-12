// @ts-check
"use strict";

// Whether a profile's actions sit where the keyboard can run them. The
// keyboard checks a profile it is asked to save and refuses the whole domain
// when one action is misplaced, so the editors check every row before they
// encode, and an upload is checked before it starts, with a message naming the
// row instead of the keyboard's bare rejection.

/** @typedef {{layerCount?: number, behaviorQmkFunctions?: boolean, capabilities?: import("./types.js").ProfileDestination}} PlacementOptions */

const {PLACEMENT, actionName, behaviorEmitProblem, keycodeAction, placementProblem} = require("../schema/actions");
const {decodeProfileBlob, PROFILE_DOMAIN_IDS} = require("../schema/profile-blob-v1");
const {decodeKeyBehaviorDomain, KEY_BEHAVIOR_HOLD_MODES} = require("../schema/key-behavior-domain-v1");
const {decodeComboDomain} = require("../schema/combo-domain-v1");
const {profileDepthOptions} = require("../schema/profile-depth");
const {decodePdDomain} = require("../schema/pd-mode-domain-v1");
const {pointingClickProblem, pointingMacroProblem} = require("./pointing-taps");

/** @param {import("../schema/types.js").BehaviorRow[]} rows @param {PlacementOptions} [options] */
function behaviorPlacementProblem(rows, options) {
    for (const row of rows) {
        const where = `The behaviour on ${actionName(row.target)}`;
        // The target is sent too: a tap with no branch of its own sends the key.
        /** @param {import("../schema/types.js").SemanticAction} action @param {(typeof PLACEMENT)[keyof typeof PLACEMENT]} placement */
        const at = (action, placement) => placementProblem(action, placement, options) || behaviorEmitProblem(action, options);
        const problem = at(row.target, PLACEMENT.KEY)
            || row.steps.map(step => (step.tap && at(step.tap, PLACEMENT.TAP))
                || [step.hold, step.longHold].map(hold => hold && at(hold.action,
                    hold.mode === KEY_BEHAVIOR_HOLD_MODES.PRESS_AND_HOLD_UNTIL_RELEASE ? PLACEMENT.HOLD_PRESS : PLACEMENT.HOLD_OTHER)).find(Boolean))
                .find(Boolean);
        if (problem) return `${where}: ${problem}`;
    }
    return undefined;
}

/** @param {{output: import("../schema/types.js").SemanticAction}[]} rows @param {PlacementOptions} [options] */
function comboPlacementProblem(rows, options) {
    for (const [index, row] of rows.entries()) {
        const problem = placementProblem(row.output, PLACEMENT.COMBO_OUTPUT, options);
        if (problem) return `Combo ${index}: ${problem}`;
    }
    return undefined;
}

// Whether a native keycode can sit on a layout key. The keyboard's save check
// covers behaviours and combos only; a layout key it does not own (DF(), PDF(),
// a layer past the bank) would reach QMK's own layer code, so the editors
// refuse to place one.
/** @param {number} code @param {PlacementOptions} [options] */
const keyPlacementProblem = (code, options) => placementProblem(keycodeAction(code), PLACEMENT.KEY, options);

// The first misplaced action in an encoded profile, or undefined: a
// pointing mode's mouse-button click is misplaced on a keyboard that does not
// click.
/** @param {Uint8Array} bytes @param {PlacementOptions} [options] */
function profilePlacementProblem(bytes, options) {
    const profile = decodeProfileBlob(bytes);
    /** @param {number} id */
    const domain = id => profile.domains.find(row => row.id === id);
    const behaviors = domain(PROFILE_DOMAIN_IDS.KEY_BEHAVIORS)?.payload;
    const combos = domain(PROFILE_DOMAIN_IDS.COMBOS);
    const pointing = domain(PROFILE_DOMAIN_IDS.PD_MODES)?.payload;
    const slots = pointing ? decodePdDomain(pointing) : undefined;
    const depth = profileDepthOptions(options?.capabilities, domain(PROFILE_DOMAIN_IDS.RGB)?.payload);
    return (behaviors && behaviorPlacementProblem(decodeKeyBehaviorDomain(behaviors, depth.behaviors).rows, options))
        || (combos && comboPlacementProblem(decodeComboDomain(combos.payload).rows, options))
        || (slots && pointingClickProblem(slots, options?.capabilities))
        || (slots && pointingMacroProblem(slots, options?.capabilities))
        || undefined;
}

module.exports = {behaviorPlacementProblem, comboPlacementProblem, keyPlacementProblem, profilePlacementProblem};
