// @ts-check
"use strict";
const {PROFILE_WIRE_DOMAINS} = require("../schema/profile-domains");
const {encodePdDomain, decodePdDomain, pdTapProblem, supportsPdClicks, supportsPdMacros, isPdMacro} = require("../schema/pd-mode-domain-v1");
const {decodeProfileBlob, encodeProfileBlob, PROFILE_DOMAIN_IDS} = require("../schema/profile-blob-v1");
const {decodeRgbDomainV1, encodeRgbDomainV1, RGB_LAYER_MODES, RGB_LOCALITIES, RGB_AUTOMOUSE_MODES, RGB_TAP_COMMIT_MODES, RGB_PD_MODE_IDS, RGB_KEY_SEMANTICS} = require("../schema/rgb-domain-v1");

const keycodes = require("../data/keycode-catalog");
const {semanticActionForExpression, resolveNativeQmkExpression} = require("../schema/compiled-profile-v1");
const {decodeComboDomain, encodeComboDomain, runningComboRows} = require("../schema/combo-domain-v1");
const {actionName, keycodeAction, knownActionAbi, layerRef} = require("../schema/actions");
const {comboPlacementProblem} = require("./profile-placement");
const {pointingTaps} = require("./pointing-taps");
const {comboTableOf} = require("./portable-profile");
const {decodeKeyBehaviorDomain} = require("../schema/key-behavior-domain-v1");
const {rewriteLightingThings} = require("./lighting-references");
const {editKeyBehaviors} = require("./key-behavior-edits");
const {inDomain} = require("./draft-edits");
const {decodeSettings, encodeSettings} = require("../schema/settings-domain-v1");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, matrixPosition} = require("../data/charybdis-layout");
const {profileDepthOptions} = require("../schema/profile-depth");
/**
 * @typedef {Extract<import("../../contracts/edits.js").PanelEdit, {type: import("./draft-edits.js").InDomain<"combos">}>} ComboEdit
 * @typedef {Extract<import("../../contracts/edits.js").PanelEdit, {type: import("./draft-edits.js").EditedBy<"profile">}>} ProfileEdit
 * @typedef {{capabilities?: import("./types.js").ProfileDestination, combos?: import("./types.js").ComboRead, maximumBrightness?: number, factoryLighting?: string}} EditContext
 * @typedef {Omit<import("../schema/types.js").ComboRowInput, 'inputs' | 'output'> & {inputs: import("../schema/types.js").SemanticAction[], output: import("../schema/types.js").SemanticAction}} SemanticComboRow
 * @typedef {import("../schema/types.js").RgbProfile} Rgb
 * @typedef {Partial<import("../../contracts/edits.js").PdConfig> & {id: number, kind: number, name: string}} EditablePointing
 * @typedef {import("../../contracts/edits.js").Colour & {hue?: import("../../contracts/edits.js").Scalar, sat?: import("../../contracts/edits.js").Scalar, val?: import("../../contracts/edits.js").Scalar}} ColourInput
 */
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
        for (const entry of keycodes.entries()) for (const name of [entry.name, ...entry.aliases]) keycodeValueCache[name] = entry.value;
    }
    return keycodeValueCache;
};

// One profile edit, sent to its domain as model/draft-edits.js files it.
/** @param {Buffer} bytes @param {ProfileEdit} message @param {EditContext} [context] */
function editDeviceProfile(bytes, message, context = {}) {
    if (inDomain(message, "placement")) {
        const profile = decodeProfileBlob(bytes);
        const domain = existing(profile.domains, row => row.id === PROFILE_DOMAIN_IDS.SETTINGS, "Settings");
        const settings = decodeSettings(domain.payload);
        const layer = integer(message.layer, settings.layers.length - 1, "Layer");
        const index = integer(message.layoutIndex, CHARYBDIS_4X6_LAYOUT_MATRIX.length - 1, "Key position");
        if (typeof message.useBehavior !== "boolean" || typeof message.joinCombos !== "boolean") throw invalid("Choose both placement switches.");
        const position = matrixPosition(index);
        for (const [field, on] of /** @type {const} */ ([["bypass", message.useBehavior], ["exclude", message.joinCombos]])) {
            const set = new Set(settings.layers[layer][field]);
            if (on) set.delete(position); else set.add(position);
            settings.layers[layer][field] = [...set].sort((a, b) => a - b);
        }
        domain.payload = encodeSettings(settings);
        return encodeProfileBlob(profile);
    }
    if (inDomain(message, "pointing")) {
        if (!((context.capabilities?.supportedDomainMask || 0) & PROFILE_WIRE_DOMAINS.PD_MODES)) throw invalid("PD editing needs firmware with configurable pointing slots.");
        const profile = decodeProfileBlob(bytes);
        const domain = existing(profile.domains, row => row.id === PROFILE_DOMAIN_IDS.PD_MODES, "Pointing modes");
        /** @type {EditablePointing[]} */
        const slots = decodePdDomain(domain.payload);
        const id = integer(message.slot, slots.length - 1, "Slot");
        const before = /** @type {import("../schema/types.js").PdSlot} */ (slots[id]);
        if (message.type === "clearPdMode") slots[id] = {id, kind: 0, name: ""};
        else if (message.type === "duplicatePdMode") {
            const source = integer(message.source, slots.length - 1, "Source slot");
            if (slots[id].kind || !slots[source].kind || id === source) throw invalid("Choose a configured source and an empty destination slot.");
            slots[id] = {...slots[source], id};
        } else slots[id] = {...structuredClone(message.config), id};
        const keyValues = keycodeValues();
        /** @param {import("../../contracts/edits.js").PdTap | undefined} tap */
        const convertTap = tap => {
            if (!tap || typeof tap.keycode !== "string") return;
            const native = resolveNativeQmkExpression(tap.keycode, {qmkKeycodeValues: keyValues});
            if (native === undefined) throw invalid(`Unknown PD shortcut: ${tap.keycode}`);
            tap.keycode = native;
        };
        Object.values(slots[id].directions || {}).forEach(convertTap);
        Object.values(slots[id].diagonals || {}).forEach(convertTap);
        slots[id].buttons?.forEach(button => convertTap(button.tap));
        // Each shortcut is one the keyboard can send, said in words before the
        // encoder's bare refusal. A click needs firmware that clicks, unless
        // the slot already stored that click there: an imported click is not
        // rewritten, and removing another one must stay possible.
        const clicks = supportsPdClicks(context.capabilities), macros = supportsPdMacros(context.capabilities);
        for (const {label, tap, stored} of pointingTaps(slots[id], before)) {
            const code = tap?.keycode;
            if (typeof code !== "number" || !Number.isInteger(code) || code === 0) continue;
            const problem = pdTapProblem(code, {clicks: clicks || code === stored?.keycode, macros: macros || code === stored?.keycode});
            if (problem) throw invalid(`${label}: ${problem}`);
            if (isPdMacro(code) && (Number(tap?.modifierPolicy || 0) !== 0 || Number(tap?.mask || 0) !== 0)) throw invalid(`${label}: A macro must inherit held modifiers, with no mask, because playback continues across scans.`);
        }
        // Every textual shortcut was resolved above; the encoder validates the remaining fields.
        domain.payload = encodePdDomain(/** @type {import("../schema/types.js").PdSlotInput[]} */ (slots));
        return encodeProfileBlob(profile);
    }
    if (inDomain(message, "combos")) return editCombos(bytes, message, context);
    if (inDomain(message, "behaviours")) {
        const profile = decodeProfileBlob(bytes);
        const domain = existing(profile.domains, row => row.id === PROFILE_DOMAIN_IDS.KEY_BEHAVIORS, "Key behaviours");
        const options = profileDepthOptions(context.capabilities), before = decodeKeyBehaviorDomain(domain.payload, options.behaviors).rows;
        domain.payload = editKeyBehaviors(domain.payload, message, context.capabilities);
        const after = decodeKeyBehaviorDomain(domain.payload, options.behaviors).rows;
        const canonical = (/** @type {string} */ name) => {const code = keycodes.encode(name);return code === undefined ? name : actionName(keycodeAction(code));};
        const keys = before.map(row => actionName(row.target));
        const owners = [...keys];
        if (message.type === "retargetBehavior") {
            const from = keys.indexOf(canonical(message.keycode)), to = keys.indexOf(canonical(message.target));
            if (from >= 0) owners[from] = canonical(message.target);
            if (to >= 0) owners[to] = message.conflict === "swap" ? canonical(message.keycode) : "";
        }
        rewriteLightingThings(profile, 4, after.map(row => {const old = owners.indexOf(actionName(row.target));return old < 0 ? null : old;}), {...options.rgb, maximumBrightness: context.maximumBrightness ?? 255});
        return encodeProfileBlob(profile);
    }
    if (!inDomain(message, "lighting")) throw invalid("Unsupported profile edit.");
    const profile = decodeProfileBlob(bytes);
    const domain = existing(profile.domains, row => row.id === PROFILE_DOMAIN_IDS.RGB, "RGB");
    const maximumBrightness = context.maximumBrightness ?? 255;
    if (message.type === "replaceLightingPreset") {
        if (message.expectedLighting !== domain.payload.toString("base64")) throw invalid("Lighting changed. Preview the preset again before keeping it.");
        const options = {...profileDepthOptions(context.capabilities).rgb, maximumBrightness};
        const current = require("../schema/lighting-domain-v1").decodeLightingDomain(domain.payload, options);
        const comboDomain = profile.domains.find(d => d.id === PROFILE_DOMAIN_IDS.COMBOS);
        const combos = comboDomain ? decodeComboDomain(comboDomain.payload).rows : context.combos?.state === "read" ? comboTableOf(context.combos).rows : [];
        const factory = context.factoryLighting ? Buffer.from(context.factoryLighting, "base64") : null;
        const result = require("./lighting-presets").lightingPreset(current, factory, combos, options, message.preset);
        if (result.replacesUnknown && message.replaceUnknown !== true) throw invalid("This replaces lighting Ark cannot interpret. Export a backup, then explicitly confirm replacement; Undo also keeps the original bytes.");
        domain.payload = result.bytes;return encodeProfileBlob(profile);
    }
    if (message.type === "editLightingIdentity" || message.type === "paintLightingMap") {
        const painting = require("./lighting-painting");
        const options = {...profileDepthOptions(context.capabilities).rgb, maximumBrightness};
        domain.payload = message.type === "editLightingIdentity" ? painting.editLightingIdentity(domain.payload, message, options) : painting.paintLightingMap(domain.payload, message, options);
        return encodeProfileBlob(profile);
    }
    if (message.type === "editLightingRule") {
        domain.payload = require("./lighting-editor").editLightingRule(domain.payload, message, {...profileDepthOptions(context.capabilities).rgb, maximumBrightness});
        return encodeProfileBlob(profile);
    }
    const rgbOptions = {...profileDepthOptions(context.capabilities, domain.payload).rgb, maximumBrightness, tapBranchColorCount: (context.capabilities?.maxTapStepsPerBehavior ?? 5) - 1};
    const rgb = decodeRgbDomainV1(domain.payload, rgbOptions);
    /** @param {ColourInput} value */
    const editColor = (value) => color(value, maximumBrightness);
    switch (message.type) {
        case "updateLayerColor": {
            const row = existing(rgb.layerColors, row => row.layerId === namedId(message.layer, "Layer"), "Layer");
            row.color = editColor(message); row.mode = enumValue(message.mode, RGB_LAYER_MODES, "layer policy"); break;
        }
        case "updatePdModeColor": {
            const id = enumValue(message.pointingMode, RGB_PD_MODE_IDS, "pointing mode");
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
            else if (group.target === "pdMode") rgb.pdModeGroupRows.push({...row, selector: group.owner === "RGB_PD_MODE_GROUP_ALL" ? 255 : enumValue(group.owner, RGB_PD_MODE_IDS, "pointing mode")});
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
    domain.payload = encodeRgbDomainV1(rgb, rgbOptions);
    return encodeProfileBlob(profile);
}

// A combo either follows the default window (termMs null) or has its own.
// A form sends an empty window, or followsDefault, to follow it.
/** @param {Buffer} bytes @param {ComboEdit} message @param {EditContext} context */
function editCombos(bytes, message, context) {
    if (!((context.capabilities?.supportedDomainMask || 0) & PROFILE_WIRE_DOMAINS.COMBOS)) throw invalid("This firmware can read combos but cannot save them. Flash the updated firmware pair first.");
    const read = context.combos;
    if (read?.state !== "read") throw invalid("Read the keyboard's combos before saving.");
    if (read.noTimer || read.customTrigger || read.customRelease || read.customRepress) throw invalid("This firmware has custom combo hooks or disabled timing that the profile editor cannot replace.");
    const profile = decodeProfileBlob(bytes);
    const domain = profile.domains.find(row => row.id === PROFILE_DOMAIN_IDS.COMBOS);
    const nativeAction = keycodeAction;
    /** @type {Omit<import("../schema/types.js").ComboInput, "rows"> & {version: number, rows: SemanticComboRow[]}} */
    const table = domain ? decodeComboDomain(domain.payload) : comboTableOf(read);
    /** @param {unknown} value */
    const expression = value => {
        const name = String(value).trim();
        if (/^MO\(/.test(name)) return semanticActionForExpression(name, {});
        const native = keycodes.encode(name);
        if (native !== undefined) return nativeAction(native);
        if (!knownActionAbi(context.capabilities?.actionAbiDigest ?? 0)) throw invalid("Named custom actions require a matching keyboard action vocabulary.");
        return semanticActionForExpression(name, {layers: Array.from({length: read.layerReferences.length}, (_, id) => ({name: layerRef(id)}))});
    };
    const followsDefault = "followsDefault" in message && message.followsDefault === true || String("termMs" in message ? message.termMs ?? "" : "").trim() === "";
    if (message.type === "updateComboHoldTerm") {
        table.holdTermMs = integer(message.holdTermMs, 65535, "Hold threshold");
    } else if (message.type === "updateComboDefaultTerm") {
        table.defaultTermMs = comboWindow(message.defaultTermMs, "Default combo window");
    } else if (message.type === "deleteCombo") {
        table.rows.splice(integer(message.id, table.rows.length - 1, "Combo index"), 1);
    } else {
        if (!Array.isArray(message.inputs) || message.inputs.length < 2 || message.inputs.length > (context.capabilities?.maxKeysPerCombo ?? 16)) throw invalid("Choose between two inputs and the keyboard's combo input limit.");
        const previous = message.type === "saveCombo" ? table.rows[integer(message.id, table.rows.length - 1, "Combo index")] : null;
        if (message.useOutputBehavior !== undefined && typeof message.useOutputBehavior !== "boolean") throw invalid("Output behaviour permission must be on or off.");
        const useOutputBehavior = message.useOutputBehavior ?? previous?.useOutputBehavior ?? true;
        const enabled = message.enabled ?? previous?.enabled ?? true;
        if (typeof enabled !== "boolean") throw invalid("The combo must be enabled or disabled.");
        const bank = 2 ** (context.capabilities?.compiledLayerCount ?? 16) - 1;
        const row = {inputs: message.inputs.map(expression), output: expression(message.output), termMs: followsDefault ? null : comboWindow(message.termMs), mustHold: message.mustHold === true, mustTap: message.mustTap === true, ordered: message.ordered === true,
            enabled, useOutputBehavior, allowedLayers: integer(message.allowedLayers ?? previous?.allowedLayers ?? bank, bank, "Allowed layers")};
        if (message.type === "saveCombo") table.rows[integer(message.id, table.rows.length - 1, "Combo index")] = row;
        else table.rows.push(row);
    }
    // The keyboard refuses a combo table with an output it cannot run, so every
    // row is checked, not only the one being edited.
    const problem = comboPlacementProblem(table.rows, {layerCount: context.capabilities?.compiledLayerCount ?? 16});
    if (problem) throw invalid(problem);
    if (message.type === "deleteCombo") {
        const count = table.rows.length + 1;
        rewriteLightingThings(profile, 3, Array.from({length: count}, (_, id) => id).filter(id => id !== message.id), {...profileDepthOptions(context.capabilities).rgb, maximumBrightness: context.maximumBrightness ?? 255});
    }
    const payload = encodeComboDomain(table);
    if (domain) Object.assign(domain, {version: table.version, payload});
    else profile.domains.push({id: PROFILE_DOMAIN_IDS.COMBOS, version: table.version, payload});
    return encodeProfileBlob(profile);
}

// The stored table against what the keyboard now runs: every window as it
// resolves, which combos follow the default, and the shared values.
/** @param {Buffer} bytes @param {import("./types.js").ComboRead | null | undefined} read */
function assertEffectiveCombos(bytes, read) {
    const profile = decodeProfileBlob(bytes);
    const domain = profile.domains.find(row => row.id === PROFILE_DOMAIN_IDS.COMBOS);
    if (!domain) return;
    if (read?.state !== "read") throw invalid("The profile was saved, but the running combos could not be verified. Read from keyboard before retrying.");
    const table = decodeComboDomain(domain.payload);
    const expected = runningComboRows(table);
    const shared = table.defaultTermMs === read.defaultTermMs && table.holdTermMs === read.holdTermMs;
    if (!shared || expected.length !== read.rows.length || expected.some((row, index) => { const actual = read.rows[index]; return row.useOutputBehavior !== (actual.useOutputBehavior ?? true) || (/** @type {const} */ (["id", "output", "termMs", "followsDefault", "mustHold", "mustTap", "ordered", "enabled", "allowedLayers"])).some(key => row[key] !== actual[key]) || JSON.stringify(row.inputs) !== JSON.stringify(actual.inputs); })) throw invalid("The saved combo profile does not match the running combo table. Flash the current firmware pair and read from keyboard again.");
}

module.exports = {editDeviceProfile, assertEffectiveCombos};
