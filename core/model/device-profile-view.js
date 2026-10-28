// @ts-check
"use strict";

// Presentation of validated device domains. Names here describe wire IDs;
// configuration values and membership always come from the received domain.
const {actionName, layerRef} = require("../schema/actions");
const {VOCABULARY, branchName} = require("./vocabulary");
const {keyLabel, shortcutLabel} = require("./key-names");
const keycodes = require("../schema/keycodes");
const {ALL_LAYERS} = require("../data/charybdis-layout");
const {PROFILE_ACTION_KINDS: ACTION} = require("../schema/profile-blob-v1");
const {KEY_BEHAVIOR_HOLD_STYLES} = require("../schema/key-behavior-domain-v1");
const {builtInActions} = require("./built-in-behavior");
const {changesNothing} = require("./inert-behaviors");
const {
    RGB_AUTOMOUSE_MODES, RGB_DOMAIN_V1, RGB_KEY_SEMANTICS, RGB_LAYER_MODES,
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
/** @param {import("../schema/types.js").SemanticAction} target @param {Parameters<typeof builtInActions>[1]} features @param {import("../../contracts/model.js").ProfileKeyNames} [names] @param {Parameters<typeof builtInActions>[2]} [steps] The row's steps, when it has one. @returns {import("../../contracts/panel.js").BuiltIn} */
function builtInForView(target, features, names, steps) {
    const {tap, hold, fallback, releaseTaps, fromPress} = builtInActions(target, features, steps);
    return {
        ...(releaseTaps ? {releaseTaps: true} : {}),
        ...(tap ? {tap: {style: "TAP_SENDS", action: actionName(tap), ...builtInDisplay(tap, names, features)}} : {}),
        ...(hold ? {hold: {style: "PRESS_AND_HOLD_UNTIL_RELEASE", action: actionName(hold), repeatHz: "0", ...builtInDisplay(hold, names, features),
            ...(fallback ? {fallback: true} : {}), ...(fromPress ? {fromPress: true} : {})}} : {}),
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
    return domain.rows.map((row) => ({
        keycode: actionName(row.target),
        builtIn: builtInForView(row.target, features, names, row.steps),
        tapHoldTerm: String(row.tapHoldTerm),
        longHoldTerm: String(row.longHoldTerm),
        multiTapTerm: String(row.multiTapTerm),
        keepsAutoMouseAnchored: row.keepsAutoMouseAnchored,
        enabled: row.enabled,
        allowedLayers: row.allowedLayers,
        changesNothing: changesNothing(row, features.customKeyShortcuts),
        steps: row.steps.map((step) => ({
            tapCount: step.tapIndex,
            tapCountName: branchName(step.tapIndex + 1),
            ...(step.tap ? {tap: {style: "TAP_SENDS", action: actionName(step.tap), ...actionDisplay(step.tap, names)}} : {}),
            ...(step.hold ? {hold: hold(step.hold)} : {}),
            ...(step.longHold ? {longHold: hold(step.longHold)} : {}),
        })),
    }));
}

/** @param {import("../schema/types.js").Hsv} color */
const colorForView = (color) => ({h: String(color.h), s: String(color.s), v: String(color.v)});
const layerName = layerRef;

/** @param {import("../schema/types.js").RgbProfile} domain */
function rgbForView(domain) {
    const ledGroups = domain.groups.map((group) => ({
        name: `Group ${group.id}`,
        id: group.id,
        ledIndices: [...group.leds],
        expression: `LEDs ${group.leds.join(", ")}`,
        usageCount: 0,
        usages: /** @type {{target: string, owner: string}[]} */ ([]),
    }));
    /** @template {{groupId: number, color: import("../schema/types.js").Hsv}} T @param {T[]} rows @param {string} target @param {(row: T) => string} [ownerFor] */
    const groupRows = (rows, target, ownerFor) => rows.map((row, index) => {
        const group = ledGroups.find((entry) => entry.id === row.groupId);
        if (!group) throw new Error(`Device LED group ${row.groupId} is missing.`);
        const owner = ownerFor ? ownerFor(row) : "";
        group.usageCount += 1;
        group.usages.push({target, owner});
        return {
            index, owner, color: colorForView(row.color), ledGroup: group.name,
            ledGroupKind: "reusable", ledIndices: [...group.ledIndices],
        };
    });
    const all = RGB_DOMAIN_V1.SELECTOR_ALL;
    return {
        stageEnableMask: domain.stageEnableMask,
        // Stages by id and bit, in the vocabulary's words; the interface finds
        // a stage by its id, never by what it is called.
        stages: VOCABULARY.stages.filter((stage) => stage.bit).map(({id, label, bit}) => ({id, label, bit, enabled: Boolean(domain.stageEnableMask & (bit || 0))})),
        ledGroups,
        layerColors: domain.layerColors.map((row) => ({
            layer: layerName(row.layerId), layerId: row.layerId,
            color: colorForView(row.color), mode: enumName(RGB_LAYER_MODES, row.mode),
        })),
        // A layer's own group says which layer by number too (ownerLayer).
        layerLedGroups: groupRows(domain.layerGroupRows, "layer", (row) => row.selector === all ? "RGB_LAYER_GROUP_ALL" : layerName(row.selector))
            .map((group, at) => domain.layerGroupRows[at].selector === all ? group : {...group, ownerLayer: domain.layerGroupRows[at].selector}),
        automouseFade: {mode: enumName(RGB_AUTOMOUSE_MODES, domain.automouseFade.mode), end_color: colorForView(domain.automouseFade.endColor)},
        pdModeColors: domain.pdModeColors.map((row) => ({
            pointingMode: enumName(RGB_POINTING_MODE_IDS, row.pdModeId), color: colorForView(row.color), locality: enumName(RGB_LOCALITIES, row.locality),
        })),
        pdModeLedGroups: groupRows(domain.pdModeGroupRows, "pdMode", (row) => row.selector === all ? "RGB_POINTING_MODE_GROUP_ALL" : enumName(RGB_POINTING_MODE_IDS, row.selector)),
        comboFeedback: {color: colorForView(domain.comboFeedback.color), locality: enumName(RGB_LOCALITIES, domain.comboFeedback.locality)},
        comboFeedbackLedGroups: groupRows(domain.comboGroupRows, "combo"),
        keyBehaviorFeedback: {
            tapBranchColors: domain.keyFeedback.tapBranchColors.map(colorForView),
            tapCommittedColor: colorForView(domain.keyFeedback.tapCommittedColor),
            holdActiveColor: colorForView(domain.keyFeedback.holdActiveColor),
            longHoldActiveColor: colorForView(domain.keyFeedback.longHoldActiveColor),
            tapCommitMode: enumName(RGB_TAP_COMMIT_MODES, domain.keyFeedback.tapCommitMode),
            locality: enumName(RGB_LOCALITIES, domain.keyFeedback.locality),
        },
        keyBehaviorFeedbackLedGroups: groupRows(domain.keyGroupRows, "keyBehavior", (row) => enumName(RGB_KEY_SEMANTICS, row.semantic)),
    };
}

/** @param {import("./types.js").BaseRgbRead | null | undefined} read @param {number} [maximumBrightness] */
function baseRgbForView(read, maximumBrightness) {
    if (read?.state !== "read") return {state: read?.state || "unread", message: read?.error?.message || "Base RGB has not been read from the keyboard."};
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

module.exports = {baseEffectForView, baseRgbForView, comboRowsForView, behaviorRowsForView, builtInForView, rgbForView};
