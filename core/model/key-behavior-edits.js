// @ts-check
"use strict";
const {PROFILE_WIRE_DOMAINS} = require("../schema/profile-domains");

const {nativeCode} = require("../schema/actions");
const keycodes = require("../data/keycode-catalog");
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {decodeKeyBehaviorDomain, encodeKeyBehaviorDomain, KEY_BEHAVIOR_HOLD_MODES} = require("../schema/key-behavior-domain-v1");
const {semanticActionForExpression} = require("../schema/compiled-profile-v1");
const {PD_SLOT_COUNT, actionName, isOwnedLayerCode, knownActionAbi} = require("../schema/actions");
const {behaviorPlacementProblem} = require("./profile-placement");
const {profileDepthOptions} = require("../schema/profile-depth");

/**
 * @typedef {import("../schema/types.js").SemanticAction} Action
 * @typedef {import("../schema/types.js").BehaviorRow} Row
 * @typedef {import("../../contracts/edits.js").BehaviorBranch} Branch
 * @typedef {Omit<import("../../contracts/edits.js").Behavior, 'steps'> & {steps?: import("../../contracts/edits.js").BehaviorStep[]}} BehaviorInput
 * @typedef {Extract<import("../../contracts/edits.js").PanelEdit, {type: 'deleteBehavior' | 'retargetBehavior'}> | {type: 'saveBehavior', behavior: BehaviorInput}} BehaviorEdit
 */
const RETARGET_CONFLICTS = new Set(["overwrite", "swap"]);
/** @param {string} message */
const invalid = message => Object.assign(new Error(message), {code: "INVALID_BEHAVIOR_EDIT"});
/** @param {unknown} value */
const normalized = value => String(value ?? "").replace(/\s+/g, "");

/** @param {unknown} value @param {number} max @param {string} label @param {boolean} [optional] */
function integer(value, max, label, optional = false) {
    if (optional && (value === undefined || value === null || String(value).trim() === "")) return 0;
    if (!["string", "number"].includes(typeof value) || !/^\d+$/.test(String(value).trim())) throw invalid(`${label} must be a whole number.`);
    const result = Number(value);
    if (!Number.isInteger(result) || result < 0 || result > max) throw invalid(`${label} must be between 0 and ${max}.`);
    return result;
}

/** @param {Buffer} payload @param {BehaviorEdit} message @param {import("./types.js").ProfileDestination} [capabilities] */
function editKeyBehaviors(payload, message, capabilities = {}) {
    if (!((capabilities.supportedDomainMask || 0) & PROFILE_WIRE_DOMAINS.KEY_BEHAVIORS)) throw invalid("This firmware does not support saving key behaviours.");
    const maxPdModes = PD_SLOT_COUNT;
    /** @type {{rows: Row[]}} */
    const {rows} = decodeKeyBehaviorDomain(payload, profileDepthOptions(capabilities).behaviors);
    const knownAbi = knownActionAbi(capabilities.actionAbiDigest ?? 0);
    /** @param {Action} action */
    const native = action => action.kind === ACTION.QMK_KEYCODE ? action.operand
        : knownAbi ? nativeCode(action) : undefined;
    /** @param {Action} left @param {Action} right */
    const equivalent = (left, right) => (left.kind === right.kind && left.operand === right.operand)
        || (native(left) !== undefined && native(left) === native(right));
    // The keyboard refuses a profile whose actions sit where it cannot run
    // them, so every row is checked, not only the one being edited.
    const layerCount = capabilities.compiledLayerCount ?? 16;
    /** @param {Row[]} rows */
    const checkPlacements = (rows) => {
        const problem = behaviorPlacementProblem(rows, {layerCount});
        if (problem) throw invalid(problem);
    };
    /** @param {Row[]} rows */
    const encode = (rows) => checkPlacements(rows) ?? encodeKeyBehaviorDomain({rows}, {
        limits: {maxRows: capabilities.maxBehaviorRows, maxPopulatedSteps: capabilities.maxPopulatedBehaviorSteps, maxTapStepsPerBehavior: capabilities.maxTapStepsPerBehavior},
        actionLimits: {maxPdModes, maxLogicalLayers: capabilities.compiledLayerCount, maxViaMacroSlots: capabilities.macroSlots, maxCustomKeys: capabilities.customKeySlots},
    });
    /** @param {unknown} value @param {Action} [previous] @returns {Action} */
    const action = (value, previous) => {
        const name = String(value ?? "").trim();
        if (!name) throw invalid("Choose an action for each enabled behaviour branch.");
        if (previous && normalized(name) === normalized(actionName(previous))) return previous;
        /** @type {Action} */
        let result;
        const encoded = keycodes.encode(name);
        if (encoded !== undefined && !/^MO\s*\(/.test(name)) {
            // Where an owned layer keycode may go is checked with the rest of the
            // row (behaviorPlacementProblem); only keycodes the keyboard does not
            // run through its layer ownership are refused here.
            if (keycodes.resolve(encoded).kind === "layer" && !isOwnedLayerCode(encoded, capabilities.compiledLayerCount ?? 0)) {
                throw invalid("DF and PDF are not supported: layer 0 stays the base. Use MO, TG, TO, TT, OSL or LOCK_LAYER.");
            }
            result = {kind: ACTION.QMK_KEYCODE, operand: encoded};
        } else {
            result = semanticActionForExpression(name, {});
            if (result.kind === ACTION.QMK_KEYCODE) {
                // Native expressions must pass the catalog's structural
                // checks; the legacy compiler accepts invalid modifier wraps.
                if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw invalid(`Unsupported key expression: ${name}.`);
                if (!knownAbi) throw invalid("Named custom actions require a matching keyboard action vocabulary.");
            }
        }
        return previous && equivalent(previous, result) ? previous : result;
    };
    /** @param {string} keycode */
    const rowFor = (keycode) => {
        const named = rows.find(row => normalized(actionName(row.target)) === normalized(keycode));
        const target = action(keycode, named?.target);
        return {target, index: rows.findIndex(row => equivalent(row.target, target))};
    };
    /** @param {Action} target */
    const checkTarget = target => {
        if (native(target) === 0 || native(target) === 1) throw invalid("Transparent keys and KC_NO cannot have a behaviour.");
    };

    // Move a row to the key it listens to. When that key already has a row the
    // edit says what happens to it: replaced, or given the old key in a swap.
    if (message.type === "retargetBehavior") {
        const from = rowFor(message.keycode);
        if (from.index < 0) throw invalid("This behaviour row is no longer present. Choose Read keyboard, then try again.");
        const to = rowFor(message.target);
        checkTarget(to.target);
        if (to.index === from.index) throw invalid("This behaviour already listens to that key.");
        if (to.index >= 0) {
            if ((!message.conflict || !RETARGET_CONFLICTS.has(message.conflict))) throw invalid("That key already has a behaviour. Choose to overwrite it or swap the two.");
            if (message.conflict === "swap") {
                checkTarget(rows[from.index].target);
                rows[to.index] = {...rows[to.index], target: rows[from.index].target};
                rows[from.index] = {...rows[from.index], target: to.target};
            } else {
                rows[from.index] = {...rows[from.index], target: to.target};
                rows.splice(to.index, 1);
            }
        } else {
            rows[from.index] = {...rows[from.index], target: to.target};
        }
        return encode(rows);
    }

    /** @type {BehaviorInput} */
    const form = message.type === "deleteBehavior" ? {keycode: message.keycode} : message.behavior;
    if (!form || typeof form !== "object") throw invalid("Choose a behaviour row to save.");
    const named = rows.find(row => normalized(actionName(row.target)) === normalized(form.keycode));
    const target = action(form.keycode, named?.target);
    const index = rows.findIndex(row => equivalent(row.target, target));
    const previous = rows[index];

    if (message.type === "deleteBehavior") {
        if (!previous) throw invalid("This behaviour row is no longer present. Choose Read keyboard, then try again.");
        rows.splice(index, 1);
    } else {
        checkTarget(target);
        const suppliedSteps = form.steps;
        if (!Array.isArray(suppliedSteps)) throw invalid("A behaviour must include its tap branches.");
        /** @type {import("../schema/types.js").BehaviorStep[]} */
        const steps = [];
        const seen = new Set();
        for (const step of suppliedSteps) {
            const tapIndex = integer(step?.tapCount, (capabilities.maxTapStepsPerBehavior ?? 5) - 1, "Tap branch index");
            if (seen.has(tapIndex)) throw invalid("A behaviour cannot repeat a tap branch index.");
            seen.add(tapIndex);
            const oldStep = previous?.steps.find(row => row.tapIndex === tapIndex);
            /** @type {import("../schema/types.js").BehaviorStep} */
            const next = {tapIndex};
            for (const field of /** @type {const} */ (["tap", "hold", "longHold"])) {
                const branch = step[field];
                if (!branch) continue;
                const helper = String(branch.helper ?? "").trim();
                if (!helper) {
                    if (String(branch.action ?? "").trim() || String(branch.repeatHz ?? "").trim()) throw invalid("Choose a helper for each enabled behaviour branch.");
                    continue;
                }
                if (field === "tap") {
                    if (helper !== "TAP_SENDS") throw invalid("Tap branches require the Tap sends helper.");
                    next.tap = action(branch.action, oldStep?.tap);
                } else {
                    if (!Object.hasOwn(KEY_BEHAVIOR_HOLD_MODES, helper)) throw invalid(`Unknown hold helper: ${helper}.`);
                    next[field] = {
                        mode: KEY_BEHAVIOR_HOLD_MODES[/** @type {keyof typeof KEY_BEHAVIOR_HOLD_MODES} */ (helper)],
                        repeatHz: helper === "REPEAT_WHILE_HELD" ? integer(branch.repeatHz, 100, "Repeat frequency") : 0,
                        action: action(branch.action, oldStep?.[field]?.action),
                    };
                }
            }
            if (next.tap || next.hold || next.longHold) steps.push(next);
        }
        const anchored = form.keepsAutoMouseAnchored ?? previous?.keepsAutoMouseAnchored ?? false;
        if (typeof anchored !== "boolean") throw invalid("The auto-mouse anchor flag must be on or off.");
        const enabled = form.enabled ?? previous?.enabled ?? true;
        if (typeof enabled !== "boolean") throw invalid("The behaviour must be enabled or disabled.");
        const row = {
            target: previous?.target ?? target,
            tapHoldTerm: integer(form.tapHoldTerm, 65535, "Tap/hold time", true),
            longerHoldTerm: integer(form.longerHoldTerm, 65535, "Long-hold time", true),
            multiTapTerm: integer(form.multiTapTerm, 65535, "Multi-tap time", true),
            keepsAutoMouseAnchored: anchored,
            enabled,
            allowedLayers: integer(form.allowedLayers ?? previous?.allowedLayers ?? (2 ** layerCount - 1), 2 ** layerCount - 1, "Allowed layers"),
            steps,
        };
        if (previous) rows[index] = row;
        else rows.push(row);
    }
    return encode(rows);
}

module.exports = {editKeyBehaviors};
