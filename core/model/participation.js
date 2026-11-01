// @ts-check
"use strict";

// Whether a behaviour or a combo takes part where a key is pressed (firmware
// participation-policy.md), judged by the layer the key came from and its
// place in the matrix: the master switch, the layer's switch, the
// definition's own switch and layers, and the placement's switch on that
// layer. Layer reach walks these decisions; the interface's
// (webview/view/participation.mjs) is held to them by
// tests/view/participation-oracle.test.mjs.

const {SETTING} = require("../schema/settings-domain-v1");
const {ALL_LAYERS, CHARYBDIS_4X6_LAYOUT_MATRIX, matrixPosition} = require("../data/charybdis-layout");
const {PROFILE_ACTION_KINDS} = require("../schema/profile-blob-v1");
const {nativeCode} = require("../schema/actions");
const {definitionReasons} = require("../../rules/definition-switches.mjs");

/** @typedef {Pick<import("../schema/types.js").BehaviorRow, "enabled" | "allowedLayers">} Definition */
/** @typedef {import("../../contracts/model.js").ParticipationReason} Reason */
/** @typedef {"behavior" | "combo"} Kind */
/** @param {number} layer */
const bit = (layer) => 1 << layer;

/** @param {Pick<import("../schema/types.js").SettingsDomain, "values" | "layers" | "comboOutputBehaviors">} settings */
function participation(settings) {
    const values = settings.values, records = settings.layers;
    // Why nothing of a kind runs on a layer at all: the master switch, then
    // the layer's own.
    /** @param {number} layer @param {Kind} kind @returns {Reason[]} */
    const layerReasons = (layer, kind) => kind === "behavior"
        ? [...(values[SETTING.BEHAVIORS_ENABLED] === 0 ? /** @type {Reason[]} */ (["master"]) : []), ...(values[SETTING.LAYER_BEHAVIORS] & bit(layer) ? [] : /** @type {Reason[]} */ (["layer"]))]
        : [...(values[SETTING.COMBOS_ENABLED] ? [] : /** @type {Reason[]} */ (["master"])), ...(values[SETTING.LAYER_COMBOS] & bit(layer) ? [] : /** @type {Reason[]} */ (["layer"]))];
    /** @param {number} layer @param {number} layoutIndex @param {Kind} kind */
    const placementOff = (layer, layoutIndex, kind) => Boolean(records?.[layer]?.[kind === "behavior" ? "bypass" : "exclude"].includes(matrixPosition(layoutIndex)));
    // Why a behaviour, or a key toward a combo, does not take part where a
    // key from `layer` is pressed, in the order the switches widen: none when
    // it does.
    /** @param {Definition | undefined} definition @param {number} layer @param {number} layoutIndex @param {Kind} kind @returns {Reason[]} */
    const reasons = (definition, layer, layoutIndex, kind) => [...layerReasons(layer, kind), ...definitionReasons(definition, layer),
        ...(placementOff(layer, layoutIndex, kind) ? /** @type {Reason[]} */ (["placement"]) : [])];
    /** @param {number} layer @param {number} layoutIndex */
    const comboPress = (layer, layoutIndex) => Boolean(values[SETTING.LAYER_COMBOS] & bit(layer)) && !placementOff(layer, layoutIndex, "combo");
    return {
        reasons,
        // Whether a key's behaviour row runs when the key comes from `layer`.
        /** @param {Definition | undefined} row @param {number} layer @param {number} layoutIndex */
        behaviorUsed: (row, layer, layoutIndex) => Boolean(row) && reasons(row, layer, layoutIndex, "behavior").length === 0,
        // Whether a key from `layer` may press toward any combo there.
        comboPress,
        // Whether a key from `layer` counts toward this combo.
        /** @param {Definition} combo @param {number} layer @param {number} layoutIndex */
        comboJoins: (combo, layer, layoutIndex) => reasons(combo, layer, layoutIndex, "combo").length === 0,
        // Generated outputs have no physical placement and do not consult the
        // source-layer behaviour switch. Their row uses the declared owner's origin.
        /** @param {Definition | undefined} row @param {{useOutputBehavior: boolean}} combo */
        generatedLayers: (row, combo) => combo.useOutputBehavior && row && values[SETTING.BEHAVIORS_ENABLED] !== 0 && row.enabled !== false ? (row.allowedLayers ?? ALL_LAYERS) : 0,
        // What the interface reads: per layer, why no behaviour or no combo
        // runs on it at all, and the keys whose Use behaviour or Join combos is
        // off there, by layout index. A definition's own switches it reads from
        // the definition.
        /** @returns {import("../../contracts/model.js").Participation} */
        view: () => ({
            comboOutputBehaviors: settings.comboOutputBehaviors !== false,
            behaviorsEnabled: Boolean(values[SETTING.BEHAVIORS_ENABLED]),
            layers: (records || []).map((_, layer) => ({
                behaviors: layerReasons(layer, "behavior"), combos: layerReasons(layer, "combo"),
                bypass: LAYOUT.filter((layoutIndex) => placementOff(layer, layoutIndex, "behavior")),
                exclude: LAYOUT.filter((layoutIndex) => placementOff(layer, layoutIndex, "combo")),
            })),
        }),
    };
}

const LAYOUT = CHARYBDIS_4X6_LAYOUT_MATRIX.map((_, layoutIndex) => layoutIndex);

// The layers a combo's output runs its behaviour on, as a mask: those of the
// behaviour row of the key it sends, judged from the layer its last declared
// input comes from (generatedLayers), when the combo's Use output behaviour,
// the settings' Combo outputs use behaviours and the row let it; none
// otherwise. The interface reads it per combo (outputBehaviorLayers).
/** @param {Partial<Pick<import("../schema/types.js").SettingsDomain, "values" | "layers" | "comboOutputBehaviors">> | undefined} settings @param {readonly import("../schema/types.js").BehaviorRow[]} rows @returns {(combo: {output: number, useOutputBehavior?: boolean}) => number} */
function comboOutputBehaviorLayers(settings, rows) {
    /** @type {Map<number, import("../schema/types.js").BehaviorRow>} */
    const byCode = new Map();
    for (const row of rows) {
        const code = row.target.kind === PROFILE_ACTION_KINDS.QMK_KEYCODE ? row.target.operand : nativeCode(row.target);
        if (code !== undefined && Number.isInteger(code) && !byCode.has(code)) byCode.set(code, row);
    }
    const {generatedLayers} = participation({values: settings?.values || [], layers: settings?.layers || [], comboOutputBehaviors: settings?.comboOutputBehaviors});
    return (combo) => generatedLayers(byCode.get(combo.output), {useOutputBehavior: combo.useOutputBehavior !== false && settings?.comboOutputBehaviors !== false}) >>> 0;
}

module.exports = {participation, comboOutputBehaviorLayers};
