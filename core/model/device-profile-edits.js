// @ts-check
"use strict";
const {PROFILE_WIRE_DOMAINS} = require("../schema/profile-domains");
const {pdTapProblem, isPdMacro, PD_DOMAIN} = require("../schema/pd-mode-domain-v1");
const {RGB_LAYER_MODES, RGB_LOCALITIES, RGB_AUTOMOUSE_MODES, RGB_TAP_COMMIT_MODES, RGB_POINTING_MODE_IDS, RGB_KEY_SEMANTICS} = require("../schema/rgb-domain-v1");

const catalog = require("../data/keycode-catalog");
const keycodes = require("../schema/keycodes");
const {semanticActionForExpression, resolveNativeQmkExpression} = require("../schema/compiled-profile-v1");
const {COMBO_LIMITS} = require("../schema/combo-domain-v1");
const {keycodeAction, knownActionAbi, layerRef, momentaryCall} = require("../schema/actions");
const {comboPlacementProblem} = require("./profile-placement");
const {pointingTaps} = require("./pointing-taps");
const {linkRefusal} = require("./pointing-links");
const {brightnessCeiling, editProfileDomains} = require("./portable-profile");
const {editKeyBehaviors} = require("./key-behavior-edits");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, LAYERS, matrixPosition} = require("../data/charybdis-layout");
/**
 * @typedef {Extract<import("../../contracts/edits.js").PanelEdit, {type: import("./draft-edits.js").InDomain<"combos">}>} ComboEdit
 * @typedef {Extract<import("../../contracts/edits.js").PanelEdit, {type: import("./draft-edits.js").EditedBy<"profile">}>} ProfileEdit
 * @typedef {import("./types.js").OpenDomain} OpenDomain
 * @typedef {Omit<import("../schema/types.js").ComboRowInput, 'inputs' | 'output'> & {inputs: import("../schema/types.js").SemanticAction[], output: import("../schema/types.js").SemanticAction}} SemanticComboRow
 * @typedef {import("../schema/types.js").RgbProfile} Rgb
 * @typedef {Partial<import("../../contracts/edits.js").PdConfig> & {id: number, kind: number, name: string}} EditablePointing
 * @typedef {import("../../contracts/edits.js").Colour & {hue?: import("../../contracts/edits.js").Scalar, sat?: import("../../contracts/edits.js").Scalar, val?: import("../../contracts/edits.js").Scalar}} ColourInput
 */
const PD_NAME_MAX_BYTES = PD_DOMAIN.NAME_MAX_BYTES;
/** @param {string} message */
const invalid = message => Object.assign(new Error(message), {code: "INVALID_PROFILE_EDIT"});
// QMK fires a combo only when its keys land within the window, so a 0 ms
// window never fires; the keyboard would store it, but nothing is gained.
/** @param {unknown} value @param {string} [label] */
function comboWindow(value, label = "Combo window") {
    const ms = integer(value, 65535, label);
    if (ms === 0) throw invalid(`${label} must be at least 1 ms: a 0 ms combo never fires.`);
    return ms;
}

/** @param {unknown} value @param {number} max @param {string} label */
function integer(value, max, label) {
    if (typeof value === "string" && !/^\d+$/.test(value.trim())) throw invalid(`${label} must be a whole number.`);
    if (typeof value !== "string" && typeof value !== "number") throw invalid(`${label} must be a whole number.`);
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > max) throw invalid(`${label} must be between 0 and ${max}.`);
    return number;
}
/** @param {string | undefined} value @param {Record<string, number>} values @param {string} label */
function enumValue(value, values, label) {
    if (value === undefined || !Object.hasOwn(values, value)) throw invalid(`Unknown ${label}: ${value}.`);
    return values[value];
}
/** @param {ColourInput} value @param {number} [maximumBrightness] */
function color(value, maximumBrightness = 255) {
    return {h: integer(value.h ?? value.hue, 255, "Hue"), s: integer(value.s ?? value.sat, 255, "Saturation"), v: integer(value.v ?? value.val, maximumBrightness, "Brightness")};
}
/** @param {unknown} value @param {string} prefix */
function namedId(value, prefix) {
    const match = String(value).match(new RegExp(`^${prefix} (\\d+)$`));
    if (!match) throw invalid(`Choose a reported ${prefix.toLowerCase()}.`);
    return integer(match[1], 255, prefix);
}
// A group is its set of LEDs, so two groups never hold the same set: a row
// or a saved selection that matches an existing group reuses it.
/** @param {number[]} leds */
const ledSet = leds => [...new Set(leds)].sort((left, right) => left - right).join(",");
/** @param {number[]} left @param {number[]} right */
const sameLeds = (left, right) => ledSet(left) === ledSet(right);
/** @param {Rgb} rgb @param {number[]} leds */
function groupFor(rgb, leds) {
    const found = rgb.groups.find(row => sameLeds(row.leds, leds));
    if (found) return found.id;
    rgb.groups.push({id: rgb.groups.length, leds});
    return rgb.groups.length - 1;
}
/** @param {Rgb} rgb @param {string} target */
function groupRows(rgb, target) {
    /** @type {Record<string, "layerGroupRows" | "pdModeGroupRows" | "comboGroupRows" | "keyGroupRows">} */
    const tables = {layer: "layerGroupRows", pdMode: "pdModeGroupRows", combo: "comboGroupRows", keyBehavior: "keyGroupRows"};
    const table = tables[target];
    if (!table) throw invalid("Unknown LED group target.");
    return rgb[table];
}
/** @template T @param {T[]} rows @param {(row: T) => boolean} predicate @param {string} label @returns {T} */
function existing(rows, predicate, label) {
    const row = rows.find(predicate);
    if (!row) throw invalid(`${label} is absent from the keyboard read.`);
    return row;
}

// Every catalog name and alias by its keycode value, built once: a pointing
// mode's shortcuts resolve through it on every save.
/** @type {Record<string, number> | undefined} */
let keycodeValueCache;
const keycodeValues = () => {
    if (!keycodeValueCache) {
        keycodeValueCache = {};
        for (const entry of catalog.entries()) for (const name of [entry.name, ...entry.aliases]) keycodeValueCache[name] = entry.value;
    }
    return keycodeValueCache;
};

// "<name> copy", cut back a whole character at a time to the name's byte limit.
/** @param {string} name */
function copyName(name) {
    let base = String(name || "");
    while (base && Buffer.byteLength(`${base} copy`, "utf8") > PD_NAME_MAX_BYTES) base = [...base].slice(0, -1).join("");
    return `${base.trimEnd()} copy`;
}
// The RGB row of a duplicated pointing slot follows its record: colour and
// locality. A profile without a row for either slot has nothing to copy.
/** @param {Rgb} rgb @param {number} source @param {number} id */
function copyPdColour(rgb, source, id) {
    const from = rgb.pdModeColors.find(row => row.pdModeId === source), to = rgb.pdModeColors.find(row => row.pdModeId === id);
    if (!from || !to) return;
    to.color = {...from.color};
    to.locality = from.locality;
}

// The edits of each profile domain, as model/draft-edits.js files them, for
// applyDraftEdit (model/draft-editor.js). Each makes a new document of
// `document`, checked as any other is.
const PROFILE_EDITS = Object.freeze(/** @satisfies {{[D in import("./draft-edits.js").Domain]: (document: import("./types.js").PortableDocument, message: Extract<ProfileEdit, {type: import("./draft-edits.js").InDomain<D>}>, context: import("./types.js").DomainsContext) => import("./types.js").PortableDocument}} */ ({
    placement: (document, message, context) => editProfileDomains(document, context, open => editPlacement(open("settings"), message)),
    pointing: (document, message, context) => {
        if (!((context.capabilities?.supportedDomainMask || 0) & PROFILE_WIRE_DOMAINS.PD_MODES)) throw invalid("Pointing mode editing needs firmware with configurable pointing slots.");
        return editProfileDomains(document, context, open => editPointing(open, message));
    },
    behaviours: (document, message, context) => editProfileDomains(document, {...context, checkActions: true}, open => editKeyBehaviors(open("behaviors"), message, context.capabilities)),
    lighting: (document, message, context) => editProfileDomains(document, context, open => editLighting(open("rgb"), message, brightnessCeiling(context.limits))),
    combos: editCombos,
}));

// Whether a key uses its layer's behaviours and joins its combos.
/** @param {import("../schema/profile-domains-types.js").DomainModels["settings"]} settings @param {Extract<ProfileEdit, {type: import("./draft-edits.js").InDomain<"placement">}>} message */
function editPlacement(settings, message) {
    const layer = integer(message.layer, settings.layers.length - 1, "Layer");
    const index = integer(message.layoutIndex, CHARYBDIS_4X6_LAYOUT_MATRIX.length - 1, "Key position");
    if (typeof message.useBehavior !== "boolean" || typeof message.joinCombos !== "boolean") throw invalid("Choose both placement switches.");
    const position = matrixPosition(index);
    for (const [field, on] of /** @type {const} */ ([["bypass", message.useBehavior], ["exclude", message.joinCombos]])) {
        const set = new Set(settings.layers[layer][field]);
        if (on) set.delete(position); else set.add(position);
        settings.layers[layer][field] = [...set].sort((a, b) => a - b);
    }
}

/** @param {OpenDomain} open @param {Extract<ProfileEdit, {type: import("./draft-edits.js").InDomain<"pointing">}>} message */
function editPointing(open, message) {
    /** @type {EditablePointing[]} */
    const slots = open("pdModes");
    const id = integer(message.slot, slots.length - 1, "Slot");
    if (message.type === "clearPdMode") slots[id] = {id, kind: 0, name: ""};
    else if (message.type === "duplicatePdMode") {
        const source = integer(message.source, slots.length - 1, "Source slot");
        if (slots[id].kind || !slots[source].kind || id === source) throw invalid("Choose a configured source and an empty destination slot.");
        // A copy is named as one, and takes the source's colour row with
        // it, as the PD domain spec says a duplicate does. It keeps the
        // layers its key turns on, which any number of keys may share, but
        // not the layers that start the source: a layer starts one mode
        // (firmware D-F62), and what ends the mode goes with them.
        slots[id] = {...structuredClone(slots[source]), id, name: copyName(slots[source].name), linkedLayers: 0, linkEnds: 0};
        copyPdColour(open("rgb"), source, id);
    } else {
        const stored = slots[id];
        slots[id] = {...structuredClone(message.config), id};
        // A link the keyboard would refuse or ignore is refused in words
        // before the encoder's bare refusal (pointing-links.js).
        const refusal = linkRefusal(open("settings"), slots, slots[id], stored);
        if (refusal) throw invalid(refusal);
    }
    const keyValues = keycodeValues();
    /** @param {import("../../contracts/edits.js").PdTap | undefined} tap */
    const convertTap = tap => {
        if (!tap || typeof tap.keycode !== "string") return;
        // A pointing record posts a stored shortcut as its decimal keycode,
        // and a picked one by name.
        const native = /^\d+$/.test(tap.keycode) ? (Number(tap.keycode) <= 0xffff ? Number(tap.keycode) : undefined)
            : resolveNativeQmkExpression(tap.keycode, {qmkKeycodeValues: keyValues});
        if (native === undefined) throw invalid(`Unknown PD shortcut: ${tap.keycode}`);
        tap.keycode = native;
    };
    Object.values(slots[id].directions || {}).forEach(convertTap);
    Object.values(slots[id].diagonals || {}).forEach(convertTap);
    // Each shortcut is one the keyboard can send, said in words before the
    // encoder's bare refusal. Every textual shortcut was resolved above; the
    // encoder validates the remaining fields.
    for (const {label, tap} of pointingTaps(slots[id])) {
        const code = tap?.keycode;
        if (typeof code !== "number" || !Number.isInteger(code) || code === 0) continue;
        const problem = pdTapProblem(code);
        if (problem) throw invalid(`${label}: ${problem}`);
        if (isPdMacro(code) && (Number(tap?.modifierPolicy || 0) !== 0 || Number(tap?.mask || 0) !== 0)) throw invalid(`${label}: A macro must inherit held modifiers, with no mask, because playback continues across scans.`);
    }
}

/** @param {Rgb} rgb @param {Extract<ProfileEdit, {type: import("./draft-edits.js").InDomain<"lighting">}>} message @param {number} maximumBrightness */
function editLighting(rgb, message, maximumBrightness) {
    /** @param {ColourInput} value */
    const editColor = (value) => color(value, maximumBrightness);
    switch (message.type) {
        case "updateLayerColor": {
            const row = existing(rgb.layerColors, row => row.layerId === namedId(message.layer, "Layer"), "Layer");
            row.color = editColor(message); row.mode = enumValue(message.mode, RGB_LAYER_MODES, "layer policy"); break;
        }
        case "updatePdModeColor": {
            const id = enumValue(message.pointingMode, RGB_POINTING_MODE_IDS, "pointing mode");
            const row = existing(rgb.pdModeColors, row => row.pdModeId === id, "Pointing mode");
            row.color = editColor(message); row.locality = enumValue(message.locality, RGB_LOCALITIES, "locality"); break;
        }
        case "updateAutomouseFade": rgb.automouseFade = {mode: enumValue(message.mode, RGB_AUTOMOUSE_MODES, "fade policy"), endColor: editColor(message)}; break;
        case "updateComboFeedback": rgb.comboFeedback = {color: editColor(message), locality: enumValue(message.locality, RGB_LOCALITIES, "locality")}; break;
        case "updateKeyBehaviorFeedback": {
            const feedback = message.config;
            rgb.keyFeedback = {tapBranchColors: feedback.tapBranchColors.map(editColor), tapCommittedColor: editColor(feedback.tapCommittedColor), holdActiveColor: editColor(feedback.holdActiveColor), longHoldActiveColor: editColor(feedback.longHoldActiveColor), tapCommitMode: enumValue(feedback.tapCommitMode, RGB_TAP_COMMIT_MODES, "tap policy"), locality: enumValue(feedback.locality, RGB_LOCALITIES, "locality")}; break;
        }
        case "updateRgbStages": rgb.stageEnableMask = integer(message.stageEnableMask, 31, "RGB stage mask"); break;
        case "saveRgbReusableLedGroup": {
            const group = message.group;
            const leds = (/** @type {number[]} */ (group.ledIndices)).map(value => integer(value, 57, "LED index"));
            // The keyboard accepts an empty group, but saving one is never meant.
            if (!leds.length) throw invalid("Pick LEDs on the board before saving them as a group.");
            if (group.originalName) {
                const target = existing(rgb.groups, row => row.id === namedId(group.originalName, "Group"), "LED group");
                const twin = rgb.groups.find(row => row !== target && sameLeds(row.leds, leds));
                if (twin) throw invalid(`Group ${twin.id} already holds exactly these LEDs.`);
                target.leds = leds;
            } else groupFor(rgb, leds);
            break;
        }
        case "deleteRgbReusableLedGroup": {
            const id = namedId(message.name, "Group");
            existing(rgb.groups, row => row.id === id, "LED group");
            const references = [rgb.layerGroupRows, rgb.pdModeGroupRows, rgb.comboGroupRows, rgb.keyGroupRows].flat();
            if (references.some(row => row.groupId === id)) throw invalid("Remove this group's RGB assignments before deleting it.");
            // Group ids are positions: consecutive from zero. Removing one
            // renumbers the ones after it, and every row follows its group.
            rgb.groups = rgb.groups.filter(row => row.id !== id);
            const renumbered = new Map(rgb.groups.map((row, index) => [row.id, index]));
            rgb.groups.forEach((row, index) => {row.id = index;});
            for (const row of references) row.groupId = /** @type {number} */ (renumbered.get(row.groupId));
            break;
        }
        case "addRgbLedGroup": {
            const group = message.group;
            let groupId;
            if (group.ledGroupName) groupId = existing(rgb.groups, row => row.id === namedId(group.ledGroupName, "Group"), "LED group").id;
            else groupId = groupFor(rgb, (/** @type {number[]} */ (group.ledIndices)).map(value => integer(value, 57, "LED index")));
            const row = {color: editColor(group), groupId};
            if (group.target === "layer") rgb.layerGroupRows.push({...row, selector: group.owner === "RGB_LAYER_GROUP_ALL" ? 255 : namedId(group.owner, "Layer")});
            else if (group.target === "pdMode") rgb.pdModeGroupRows.push({...row, selector: group.owner === "RGB_POINTING_MODE_GROUP_ALL" ? 255 : enumValue(group.owner, RGB_POINTING_MODE_IDS, "pointing mode")});
            else if (group.target === "keyBehavior") rgb.keyGroupRows.push({...row, semantic: enumValue(group.owner, RGB_KEY_SEMANTICS, "key feedback type")});
            else {groupRows(rgb, group.target); rgb.comboGroupRows.push(row);} break;
        }
        case "deleteRgbLedGroup": {
            const rows = groupRows(rgb, message.target);
            const index = integer(message.index, rows.length - 1, "Assignment index");
            rows.splice(index, 1); break;
        }
        default: throw invalid("Unsupported profile edit.");
    }
}

// A combo either follows the default window (termMs null) or has its own.
// A form sends an empty window, or followsDefault, to follow it.
/** @param {import("./types.js").PortableDocument} document @param {ComboEdit} message @param {import("./types.js").DomainsContext} context */
function editCombos(document, message, context) {
    if (!((context.capabilities?.supportedDomainMask || 0) & PROFILE_WIRE_DOMAINS.COMBOS)) throw invalid("This firmware can read combos but cannot save them. Flash the updated firmware pair first.");
    const nativeAction = keycodeAction;
    return editProfileDomains(document, context, open => {
        /** @type {Omit<import("../schema/types.js").ComboInput, "rows"> & {version: number, rows: SemanticComboRow[]}} */
        const table = open("combos");
        /** @param {unknown} value */
        const expression = value => {
            const name = String(value).trim();
            if (momentaryCall(name)) return semanticActionForExpression(name, {});
            const native = keycodes.encode(name);
            if (native !== undefined) return nativeAction(native);
            if (!knownActionAbi(context.capabilities?.actionAbiDigest ?? 0)) throw invalid("Named custom actions require a matching keyboard action vocabulary.");
            return semanticActionForExpression(name, {layers: Array.from({length: LAYERS}, (_, id) => ({name: layerRef(id)}))});
        };
        const followsDefault = "followsDefault" in message && message.followsDefault === true || String("termMs" in message ? message.termMs ?? "" : "").trim() === "";
        if (message.type === "updateComboHoldTerm") {
            table.holdTermMs = integer(message.holdTermMs, 65535, "Hold threshold");
        } else if (message.type === "updateComboDefaultWindow") {
            table.defaultTermMs = comboWindow(message.defaultTermMs, "Default combo window");
        } else if (message.type === "deleteCombo") {
            table.rows.splice(integer(message.id, table.rows.length - 1, "Combo index"), 1);
        } else {
            const keysPerCombo = context.capabilities?.maxKeysPerCombo ?? COMBO_LIMITS.maxInputs;
            if (!Array.isArray(message.inputs) || message.inputs.length < 2) throw invalid("A combo needs at least two keys.");
            if (message.inputs.length > keysPerCombo) throw invalid(`A combo takes at most ${keysPerCombo} keys.`);
            const previous = message.type === "saveCombo" ? table.rows[integer(message.id, table.rows.length - 1, "Combo index")] : null;
            if (message.useOutputBehavior !== undefined && typeof message.useOutputBehavior !== "boolean") throw invalid("Output behaviour permission must be on or off.");
            const useOutputBehavior = message.useOutputBehavior ?? previous?.useOutputBehavior ?? true;
            const enabled = message.enabled ?? previous?.enabled ?? true;
            if (typeof enabled !== "boolean") throw invalid("The combo must be enabled or disabled.");
            const bank = 2 ** (context.capabilities?.compiledLayerCount ?? LAYERS) - 1;
            const row = {inputs: message.inputs.map(expression), output: expression(message.output), termMs: followsDefault ? null : comboWindow(message.termMs), mustHold: message.mustHold === true, mustTap: message.mustTap === true, ordered: message.ordered === true,
                enabled, useOutputBehavior, allowedLayers: integer(message.allowedLayers ?? previous?.allowedLayers ?? bank, bank, "Allowed layers")};
            if (message.type === "saveCombo") table.rows[integer(message.id, table.rows.length - 1, "Combo index")] = row;
            else table.rows.push(row);
        }
        // The keyboard refuses a combo table with an output it cannot run, so every
        // row is checked, not only the one being edited.
        const problem = comboPlacementProblem(table.rows, {layerCount: context.capabilities?.compiledLayerCount ?? LAYERS});
        if (problem) throw invalid(problem);
    });
}

module.exports = {PROFILE_EDITS};
