// @ts-check
"use strict";

// Presentation of validated device domains. Names here describe wire IDs;
// configuration values and membership always come from the received domain.
const {actionName, layerRef} = require("../schema/actions");
const {VOCABULARY, branchName, failureSentence, ledsCalled} = require("./vocabulary");
const {keyLabel, shortcutLabel} = require("./key-names");
const keycodes = require("../schema/keycodes");
const {ALL_LAYERS} = require("../data/charybdis-layout");
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {KEY_BEHAVIOR_HOLD_STYLES} = require("../schema/key-behavior-domain-v1");
const {builtInActions} = require("./built-in-behavior");
const {emptyCells} = require("./empty-cells");
const {changesNothing} = require("./inert-behaviors");
const {
    RGB_AUTOCORRECT_SEMANTICS, RGB_AUTOMOUSE_MODES, RGB_DOMAIN_V1, RGB_EVERY_OWNER, RGB_KEY_SEMANTICS, RGB_LAYER_MODES,
    RGB_LOCALITIES, RGB_POINTING_MODE_IDS, RGB_TAP_COMMIT_MODES,
} = require("../schema/rgb-domain-v1");

/** @template {Record<string, number>} T @param {T} values @param {number} value @returns {keyof T & string} */
function enumName(values, value) {
    const entry = Object.entries(values).find(([, id]) => id === value);
    if (!entry) throw new Error(`Unsupported device enum value ${value}.`);
    return /** @type {keyof T & string} */ (entry[0]);
}

// A stored keycode's readable name ("#", "Shift+Enter"), for the behaviour
// grid to show. Absent when the catalogue knows the keycode only by itself,
// and for layer, pointing and macro actions, which the interface names from
// the profile's own layers, slots and macros.
/** @param {import("../schema/types.js").SemanticAction} action @param {import("../../contracts/model.js").ProfileKeyNames} [names] */
function actionDisplay(action, names) {
    if (action.kind !== ACTION.QMK_KEYCODE) return {};
    const resolved = keycodes.resolve(action.operand);
    const label = keyLabel(names, action.operand);
    return resolved.known && label !== resolved.name ? {label} : {};
}

// A modifiers-only keycode is how a key holds its modifiers; the catalogue
// names it "Shift+N/A", which reads as a broken key rather than "Shift".
// A custom key's own action is its shortcut, so the cell reads as that.
/** @param {import("../schema/types.js").SemanticAction} action @param {import("../../contracts/model.js").ProfileKeyNames} [names] @param {import("./built-in-behavior.js").BuiltInFeatures} [features] */
function builtInDisplay(action, names, features) {
    if (action.kind === ACTION.CUSTOM_KEY) {
        const label = shortcutLabel(names, features?.customKeyShortcuts?.[action.operand]);
        return label ? {label} : {};
    }
    const display = actionDisplay(action, names);
    return display.label ? {label: display.label.replace(/\+N\/A$/, "")} : display;
}

// The key's own tap and first-press hold, shaped like authored branches, for
// the tiers its row leaves empty (model/built-in-behavior.js). A fallback hold
// gives way to any authored first-press hold or long hold; `releaseTaps` says
// a press with only a long hold still taps when released before it.
// `transparentTap`: the tap is the row's Transparent Single tap, the key
// below; `tapToggle`: with no row the key counts taps all the same; `cells`:
// what each empty grid cell does, for the row's steps
// (core/model/empty-cells.js).
/** @param {import("../schema/types.js").SemanticAction} target @param {Parameters<typeof builtInActions>[1]} features @param {import("../../contracts/model.js").ProfileKeyNames} [names] @param {Parameters<typeof builtInActions>[2]} [steps] The row's steps, when it has one. @returns {import("../../contracts/panel.js").BuiltIn} */
function builtInForView(target, features, names, steps) {
    const builtIn = builtInBranches(target, features, names, steps);
    return {...builtIn, cells: emptyCells(builtIn, steps)};
}

/** @param {import("../schema/types.js").SemanticAction} target @param {Parameters<typeof builtInActions>[1]} features @param {import("../../contracts/model.js").ProfileKeyNames} [names] @param {Parameters<typeof builtInActions>[2]} [steps] @returns {import("../../contracts/panel.js").BuiltIn} */
function builtInBranches(target, features, names, steps) {
    const {tap, hold, fallback, releaseTaps, fromPress, armsOnRelease, transparentTap, tapToggle} = builtInActions(target, features, steps);
    return {
        ...(releaseTaps ? {releaseTaps: true} : {}),
        ...(transparentTap ? {transparentTap: true} : {}),
        ...(tapToggle ? {tapToggle: true} : {}),
        ...(tap ? {tap: {style: "TAP_SENDS", action: actionName(tap), ...builtInDisplay(tap, names, features)}} : {}),
        ...(hold ? {hold: {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: actionName(hold), repeatHz: "0", ...builtInDisplay(hold, names, features),
            ...(fallback ? {fallback: true} : {}), ...(fromPress ? {fromPress: true} : {}), ...(armsOnRelease ? {armsOnRelease: true} : {})}} : {}),
    };
}

/** @param {{rows: import("../schema/types.js").BehaviorRow[]}} domain @param {Parameters<typeof builtInActions>[1]} [features] @param {import("../../contracts/model.js").ProfileKeyNames} [names] @returns {import("../../contracts/panel.js").BehaviorView[]} */
function behaviorRowsForView(domain, features = {}, names) {
    /** @param {import("../schema/types.js").HoldBranch | undefined} branch */
    const hold = (branch) => branch && ({
        style: enumName(KEY_BEHAVIOR_HOLD_STYLES, branch.style),
        action: actionName(branch.action),
        repeatHz: String(branch.repeatHz),
        ...actionDisplay(branch.action, names),
    });
    return domain.rows.map((row) => {
        /** @type {import("../../contracts/panel.js").BehaviorView["steps"]} */
        const steps = row.steps.map((step) => ({
            tapCount: step.tapIndex,
            tapCountName: branchName(step.tapIndex + 1),
            ...(step.tap ? {tap: {style: "TAP_SENDS", action: actionName(step.tap), ...actionDisplay(step.tap, names)}} : {}),
            ...(step.hold ? {hold: hold(step.hold)} : {}),
            ...(step.longHold ? {longHold: hold(step.longHold)} : {}),
        }));
        return {
            keycode: actionName(row.target),
            builtIn: builtInForView(row.target, features, names, row.steps),
            tapHoldTerm: String(row.tapHoldTerm),
            longHoldTerm: String(row.longHoldTerm),
            multiTapTerm: String(row.multiTapTerm),
            keepsAutoMouseAnchored: row.keepsAutoMouseAnchored,
            enabled: row.enabled,
            allowedLayers: row.allowedLayers,
            changesNothing: changesNothing(row, features.customKeyShortcuts),
            steps,
        };
    });
}

/** @param {import("../schema/types.js").Hsv} color */
const colorForView = (color) => ({h: String(color.h), s: String(color.s), v: String(color.v)});
const layerName = layerRef;

/** @param {import("../schema/types.js").RgbProfile} domain */
function rgbForView(domain) {
    // Each accent with the LEDs its group holds; the groups themselves are
    // Ark's to keep and never reach the interface (D-L77).
    /** @template {{groupId: number, color: import("../schema/types.js").Hsv}} T @param {T[]} rows @param {(row: T) => string} [ownerFor] */
    const groupRows = (rows, ownerFor) => rows.map((row, index) => {
        const group = domain.groups.find((entry) => entry.id === row.groupId);
        if (!group) throw new Error(`Device LED group ${row.groupId} is missing.`);
        return {index, owner: ownerFor ? ownerFor(row) : "", color: colorForView(row.color), ledIndices: [...group.leds], leds: ledsCalled(group.leds)};
    });
    const all = RGB_DOMAIN_V1.SELECTOR_ALL;
    return {
        stageEnableMask: domain.stageEnableMask,
        // Stages by id and bit, in the vocabulary's words; the interface finds
        // a stage by its id, never by what it is called.
        stages: VOCABULARY.stages.filter((stage) => stage.bit).map(({id, label, bit}) => ({id, label, bit, enabled: Boolean(domain.stageEnableMask & (bit || 0))})),
        layerColors: domain.layerColors.map((row) => ({
            layer: layerName(row.layerId), layerId: row.layerId,
            color: colorForView(row.color), mode: enumName(RGB_LAYER_MODES, row.mode),
        })),
        // A layer's own group says which layer by number too (ownerLayer).
        layerAccents: groupRows(domain.layerGroupRows, (row) => row.selector === all ? RGB_EVERY_OWNER.layer : layerName(row.selector))
            .map((group, at) => domain.layerGroupRows[at].selector === all ? group : {...group, ownerLayer: domain.layerGroupRows[at].selector}),
        automouseFade: {mode: enumName(RGB_AUTOMOUSE_MODES, domain.automouseFade.mode), end_color: colorForView(domain.automouseFade.endColor)},
        pdModeColors: domain.pdModeColors.map((row) => ({
            pointingMode: enumName(RGB_POINTING_MODE_IDS, row.pdModeId), color: colorForView(row.color), locality: enumName(RGB_LOCALITIES, row.locality),
        })),
        pdModeAccents: groupRows(domain.pdModeGroupRows, (row) => row.selector === all ? RGB_EVERY_OWNER.pdMode : enumName(RGB_POINTING_MODE_IDS, row.selector)),
        comboFeedback: {color: colorForView(domain.comboFeedback.color), locality: enumName(RGB_LOCALITIES, domain.comboFeedback.locality)},
        comboAccents: groupRows(domain.comboGroupRows),
        keyBehaviorFeedback: {
            tapBranchColors: domain.keyFeedback.tapBranchColors.map(colorForView),
            tapCommittedColor: colorForView(domain.keyFeedback.tapCommittedColor),
            holdActiveColor: colorForView(domain.keyFeedback.holdActiveColor),
            longHoldActiveColor: colorForView(domain.keyFeedback.longHoldActiveColor),
            tapCommitMode: enumName(RGB_TAP_COMMIT_MODES, domain.keyFeedback.tapCommitMode),
            locality: enumName(RGB_LOCALITIES, domain.keyFeedback.locality),
        },
        keyFeedbackAccents: groupRows(domain.keyGroupRows, (row) => enumName(RGB_KEY_SEMANTICS, row.semantic)),
        // Replacement feedback (firmware D-F70): a colour for each case, one
        // of saturation and value 0 painting nothing for its own.
        autocorrectFeedback: {
            textColor: colorForView(domain.autocorrectFeedback.textColor),
            macroColor: colorForView(domain.autocorrectFeedback.macroColor),
            undoColor: colorForView(domain.autocorrectFeedback.undoColor),
            locality: enumName(RGB_LOCALITIES, domain.autocorrectFeedback.locality),
        },
        autocorrectFeedbackAccents: groupRows(domain.autocorrectGroupRows, (row) => enumName(RGB_AUTOCORRECT_SEMANTICS, row.semantic)),
    };
}

/** @param {import("./types.js").BaseRgbRead | null | undefined} read @param {number} [maximumBrightness] */
function baseRgbForView(read, maximumBrightness) {
    if (read?.state !== "read") return {state: read?.state || "unread", message: read?.error ? failureSentence(read.error) : "The background effect has not been read from the keyboard."};
    return baseEffectForView(read, maximumBrightness);
}

/** @param {Pick<Extract<import("./types.js").BaseRgbRead, {state: "read"}>, "effectId" | "hue" | "saturation" | "brightness" | "speed" | "readAt">} lighting @param {number} [maximumBrightness] */
function baseEffectForView(lighting, maximumBrightness) {
    const {effectId, hue, saturation, brightness, speed, readAt} = lighting;
    const enabled = effectId !== 0;
    return {
        state: "read", enabled, effectId, hue, saturation, brightness, speed, readAt,
        effectName: !enabled ? "Off" : effectId === 1 ? "Solid colour" : `Effect ${effectId}`,
        brightnessPercent: Math.round(brightness * 100 / 255),
        // Settings scalars report absolute HSV brightness, just like layer colours.
        previewColor: !enabled ? {h: "0", s: "0", v: "0"} : effectId === 1
            ? {h: String(hue), s: String(saturation), v: String(brightness)} : undefined,
    };
}

/** @param {Extract<import("./types.js").ComboRead, {state: "read"}>["rows"]} rows @param {Record<string, string>} labels */
function comboRowsForView(rows, labels) {
    /** @param {number} value */
    const resolve = value => {
        const key = keycodes.resolve(value);
        return {name: key.name, label: labels[key.name] || keyLabel(undefined, value)};
    };
    return rows.map(row => ({
        id: row.id, badge: `C${row.id}`,
        useOutputBehavior: row.useOutputBehavior ?? true, enabled: row.enabled ?? true, allowedLayers: row.allowedLayers ?? ALL_LAYERS,
        inputs: row.inputs.map(value => resolve(value).name),
        inputDisplays: row.inputs.map(value => resolve(value).label),
        output: resolve(row.output).name,
        outputDisplay: row.output === 0 ? "Firmware callback" : resolve(row.output).label,
        termMs: row.termMs, followsDefault: Boolean(row.followsDefault), mustHold: row.mustHold, mustTap: row.mustTap, ordered: row.ordered,
    }));
}

module.exports = {baseEffectForView, baseRgbForView, comboRowsForView, behaviorRowsForView, builtInForView, builtInBranches, rgbForView};
