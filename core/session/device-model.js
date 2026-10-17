// @ts-check
"use strict";

// Builds the model from a decoded snapshot or independent device readback.
//
// The webview renders `model` and posts typed edits back. Draft content comes
// from its snapshot; the keyboard header and diagnostics come from real reads.
//
// Domains the device cannot report yet come back empty rather than invented.
// An empty RGB tab is truthful; a tab populated from the authored source would
// be a lie about what the keyboard is running.

const {PD_SLOT_BINDINGS} = require("../data/pd-bindings");
const {PHASE, VOCABULARY, HALVES_WORDS, slotName} = require("../model/vocabulary");
const keycodeCatalog = require("../data/keycode-catalog");
const {baseEffectForView, baseRgbForView, behaviorRowsForView, builtInForView, comboRowsForView, rgbForView} = require("../model/device-profile-view");
const {effectiveTimings} = require("../model/gesture-timing");
const {compactKeyLabels, hostKeyVocabulary, keyLabel, profileKeyNames, shortcutLabel} = require("../model/key-names");
const {layerName} = require("../model/vocabulary");
const {keycodeAction, knownActionAbi, layerRef, nativeCode} = require("../schema/actions");
const {dpiChoices} = require("../model/pointer-dpi");
const {pointingTapKeys} = require("../model/pointing-taps");
const {decodedOf} = require("../model/portable-profile");
const {baseLighting, settingsEditorView} = require("../model/settings-editor");
const {macroEditorView} = require("../model/macro-editor");
const {customKeyEditorView} = require("../model/custom-key-editor");
const {keyboardNameView} = require("../model/keyboard-name");
const {runningComboRows} = require("../schema/combo-domain-v1");
const {SETTING} = require("../schema/settings-domain-v1");
const {CHARYBDIS_4X6_LAYOUT_MATRIX, matrixPosition} = require("../data/charybdis-layout");
const {PROFILE_WIRE_FEATURES} = require("../protocol/profile-wire-v1");
const {compileLayerAnswers} = require("../model/layer-resolution");
const {PROFILE_WIRE_DOMAINS} = require("../schema/profile-domains");

const {editableDomains} = require("./firmware-support");

const CATALOG_SOURCE = "vendored QMK keycode catalog";

// Internal presentation input: configuration, with no claim that it is a read.
/**
 * @typedef {object} Configuration
 * @property {{layer: number, keys: import("./types.js").LayoutKey[]}[]} layers
 * @property {import("./types.js").ReadDomains} domains
 * @property {Extract<import("./types.js").ComboRead, {state: "read"}>["rows"]} comboRows
 * @property {import("../../contracts/panel.js").PublishedModel["comboReadback"] & {rows?: undefined}} comboInfo
 * @property {ReturnType<typeof baseRgbForView>} baseEffect
 * @property {import("./types.js").DeviceModelInput["settingsView"]} settingsView
 * @property {import("./types.js").DeviceModelInput["macroView"]} macroView
 * @property {import("./types.js").DeviceModelInput["customKeyView"]} customKeyView
 * @property {ReturnType<typeof keyboardNameView>} [keyboardNameView]
 * @property {Partial<import("../../contracts/edits.js").BaseIdentity> | null} identity
 * @typedef {{busy: boolean, behaviors: boolean, pointing: boolean, combos: boolean, macros: boolean, settings: boolean, customKeys: boolean}} Editing
 */

// Independent readback remains useful on older firmware and partial captures.
/** @param {import("./types.js").DeviceModelInput} [state] */
function buildDeviceModel(state = {}) {
    const committed = state.committed?.state === "read";
    const domains = committed ? state.committed?.domains || {} : {};
    return {...configurationModel({
        layers: state.layout?.state === "read" ? state.layout.layers : [], domains,
        comboRows: state.combos?.state === "read" ? state.combos.rows : [],
        comboInfo: state.combos ? {...state.combos, rows: undefined} : {state: "unread"},
        baseEffect: baseRgbForView(state.baseRgb, state.settingsView?.brightnessMax),
        settingsView: state.settingsView, macroView: state.macroView, customKeyView: state.customKeyView,
        identity: committed ? {source: state.committed?.source, generation: state.committed?.generation, digest: state.committed?.digest, originHalf: state.committed?.originHalf} : null,
    }, state.capabilities, editableDomains(state)), ...deviceSummary(state)};
}

// The three editor views of a complete snapshot, built here only: the
// service keeps them for the profile it read, and a draft builds its own.
/** @param {import("../model/types.js").ProfileSnapshot} snapshot @param {import("../model/types.js").ProfileDestination} [capabilities] */
function editorViews(snapshot, capabilities) {
    return {settingsView: settingsEditorView(snapshot, capabilities), macroView: macroEditorView(snapshot, capabilities),
        customKeyView: customKeyEditorView(snapshot, capabilities)};
}

// Drafts render their once-decoded snapshot. Actual device facts describe the
// keyboard; the centralized binding alone decides the draft's editability.
/**
 * @param {import("../model/types.js").CompleteSnapshot} snapshot
 * @param {import("../model/types.js").ProfileDestination} capabilities
 * @param {ReturnType<typeof import("./panel-session-state.js").draftBinding>} binding
 * @param {import("./types.js").DeviceModelInput} [deviceState]
 */
function buildSnapshotModel(snapshot, capabilities, binding, deviceState = {}) {
    const value = decodedOf(snapshot);
    const current = {...snapshot, decoded: value};
    const views = editorViews(current, capabilities);
    const {combos, settings} = value;
    const max = snapshot.limits?.brightnessMax;
    const lighting = baseLighting(settings.values);
    const baseEffect = max === undefined ? baseRgbForView(deviceState.baseRgb) : baseEffectForView({
        effectId: lighting.enabled ? lighting.effect : 0,
        brightness: max ? Math.min(255, Math.round(lighting.brightness * 255 / max)) : 0,
        hue: lighting.hue, saturation: lighting.saturation, speed: lighting.speed,
    }, max);
    const editable = binding.editable;
    const model = configurationModel({
        layers: value.document.layers.map((values, layer) => ({layer, keys: CHARYBDIS_4X6_LAYOUT_MATRIX.map(([row, column], layoutIndex) => ({row, column, layoutIndex, keycode: values[matrixPosition(layoutIndex)], resolved: keycodeCatalog.resolve(values[matrixPosition(layoutIndex)])}))})),
        domains: {rgb: value.rgb, keyBehaviors: value.behaviors, settings, pdModes: value.pdModes},
        comboRows: runningComboRows(combos),
        comboInfo: {state: "read", enabled: Boolean(settings.values[SETTING.COMBOS_ENABLED]), layerReferences: settings.layers.map(record => record.reference),
            version: combos.version, defaultTermMs: combos.defaultTermMs, holdTermMs: combos.holdTermMs},
        baseEffect, ...views,
        // The firmware's built-in name is what a keyboard with no stored name
        // reports over USB, so it is known only while that is the case.
        keyboardNameView: keyboardNameView(current, deviceState.storedKeyboardName === "" ? deviceState.device?.product || "" : ""),
        identity: null,
    }, capabilities, {busy: !editable, behaviors: editable, pointing: editable, combos: editable, macros: editable, settings: editable, customKeys: editable});
    model.layers.forEach((layer, index) => {layer.displayName = snapshot.summary.names[index];});
    return {...model, ...deviceSummary(deviceState)};
}

/** @param {Configuration} content @param {import("./types.js").DeviceModelInput["capabilities"]} capabilities @param {Editing} editing */
function configurationModel(content, capabilities, editing) {
    const catalog = catalogViews();
    // What this profile calls its keys, laid over the catalogue: one rule for
    // the screens and the review (model/key-names.js).
    const names = profileKeyNames({
        hostOs: content.settingsView?.host?.effective,
        hostLayout: content.settingsView?.host?.layout,
        macosIso: content.settingsView?.host?.macosIso,
        layers: content.domains?.settings?.names,
        actionsKnown: knownActionAbi(capabilities?.actionAbiDigest ?? 0),
        macros: content.macroView?.viaMacros,
        customKeys: content.customKeyView?.keys,
        behaviors: content.domains.keyBehaviors?.rows || [],
        pdModes: content.domains?.pdModes,
    });
    Object.assign(catalog.aliases, names.aliases);
    Object.assign(catalog.labels, names.labels);
    for (const entry of catalog.entries) if (names.labels[entry.key] !== undefined) {
        entry.label = names.labels[entry.key];
        entry.searchTerms.push(entry.label);
        entry.search += ` ${entry.label.toLowerCase()}`;
        entry.searchCompact += entry.label.toLowerCase().replaceAll(" ", "");
    }
    // A pointing-mode keycode is offered in the picker under its slot.
    for (const {name, native, code, label} of names.pointing) {
        const entry = catalog.entries.find(entry => entry.keycode === code);
        const presentation = {value: name, key: name, label, group: "Pointing modes", aliases: [native], keycode: code, searchTerms: [name, label], search: `${name} ${label}`.toLowerCase(), searchCompact: `${name}${label}`.toLowerCase()};
        if (entry) Object.assign(entry, presentation); else catalog.entries.push(presentation);
    }
    // So is each custom key, under its name, its tip naming the shortcut it
    // sends.
    const customKeys = (content.customKeyView?.keys || []).map(key => ({...key, shortcutLabel: shortcutLabel(names, key.shortcut)}));
    for (const {name, native, code, label} of names.custom) {
        const entry = catalog.entries.find(entry => entry.keycode === code);
        const sends = customKeys.find(key => key.code === code)?.shortcutLabel;
        const presentation = {value: name, key: name, label, group: "Custom keys", aliases: [native], keycode: code, searchTerms: [name, label], search: `${name} ${label}`.toLowerCase(), searchCompact: `${name}${label}`.toLowerCase(),
            tip: sends ? `${label} · sends ${sends}` : `${label} · no shortcut`};
        if (entry) Object.assign(entry, presentation); else catalog.entries.push(presentation);
    }
    // Every keycode the profile holds is in the table by its name here, so the
    // interface names any of them by keycode and never composes a name itself:
    // a layer-tap cannot be listed ahead of time, one per layer and tap key.
    for (const value of profileKeycodes(content, capabilities)) catalog.labels[keycodeCatalog.resolve(value).name] = keyLabel(names, value);
    const hostVocabulary = hostKeyVocabulary(names.hostOs);
    return {
        // The words for every value the keyboard stores, so the interface
        // names things as the review does (model/vocabulary.js).
        vocabulary: {...VOCABULARY, ...hostVocabulary},
        layers: layersForView(content.layers, catalog.labels, catalog.aliases, names.layers),
        // What each typing key prints: plain, Shift, Option/AltGr, then both,
        // for the picker's board; null on US, whose board is drawn as is.
        hostLayoutLegends: names.legends,

        // Each slot with the name a person reads for it, one rule for every
        // surface (model/vocabulary.js slotName).
        // and the keycodes that bind it (data/pd-bindings.js), so the interface
        // names and finds a pointing-mode key without a registry of its own.
        pdModes: (content.domains?.pdModes || []).map((slot) => ({...slot, displayName: slotName(slot), binding: PD_SLOT_BINDINGS[slot.id]})),
        pdModeEditing: {writable: editing.pointing,
            dpiChoices: dpiChoices({normalSpeed: true}),
            // Whether a direction or button override may click a mouse
            // button 1–8 (Profile Wire feature bit 28).
            clicks: Boolean((capabilities?.featureFlags || 0) & PROFILE_WIRE_FEATURES.POINTING_CLICKS),
            macros: Boolean((capabilities?.featureFlags || 0) & PROFILE_WIRE_FEATURES.POINTING_MACROS),
            // The keys a direction or button override may send, so the
            // picker offers only those (model/pointing-taps.js).
            tapKeys: pointingTapKeys(Boolean((capabilities?.featureFlags || 0) & PROFILE_WIRE_FEATURES.POINTING_CLICKS), Boolean((capabilities?.featureFlags || 0) & PROFILE_WIRE_FEATURES.POINTING_MACROS))},
        keyBehaviors: content.domains.keyBehaviors ? behaviorRowsForView(content.domains.keyBehaviors, behaviorFeatures(capabilities, content), names) : [],
        behaviorEditing: {
            busy: editing.busy,
            writable: editing.behaviors,
            maxTapStepsPerBehavior: capabilities?.maxTapStepsPerBehavior || 5,
            keyDefaults: behaviorDefaults(content, capabilities, catalog.aliases, names),
        },
        profileIdentity: content.identity,
        rgb: {...(content.domains.rgb ? rgbForView(content.domains.rgb) : {}),
            ...(Number.isInteger(content.settingsView?.brightnessMax) ? {maximumBrightness: content.settingsView?.brightnessMax} : {}),
            baseEffect: content.baseEffect},

        // Native combo values, resolved from either capture or snapshot.
        combos: comboRowsForView(content.comboRows, catalog.labels),
        comboReadback: {...content.comboInfo, writable: editing.combos},
        viaMacros: content.macroView?.viaMacros || [],
        macroNameSpace: content.macroView?.names || null,
        macroBank: content.macroView?.macroBank || null,
        hostSettings: content.settingsView?.host || null,
        macroUnicode: content.macroView?.unicode || {supported: false, mode: 0},
        macroProtectionSupported: Boolean(content.macroView?.protectionSupported),
        macroOutputIsolationSupported: Boolean(content.macroView?.outputIsolationSupported),
        macroProtectionChoices: content.macroView?.protectionChoices || [],
        macroEditing: {identity: content.macroView?.identity || "", writable: editing.macros},
        behaviorTimingDefaults: content.settingsView?.timing || {},
        configDefaults: content.settingsView?.sections || [],
        participation: content.domains.settings?.values && content.domains.settings.layers ? {
            comboOutputBehaviors: content.domains.settings.comboOutputBehaviors !== false,
            comboOutputBehaviorsSupported: Boolean((capabilities?.featureFlags || 0) & PROFILE_WIRE_FEATURES.COMBO_OUTPUT_BEHAVIORS),
            behaviorsEnabled: Boolean(content.domains.settings.values[SETTING.BEHAVIORS_ENABLED]),
            combosEnabled: Boolean(content.domains.settings.values[SETTING.COMBOS_ENABLED]),
            behaviorLayers: content.domains.settings.values[SETTING.LAYER_BEHAVIORS],
            comboLayers: content.domains.settings.values[SETTING.LAYER_COMBOS],
            layers: content.domains.settings.layers,
        } : null,
        settingsEditing: {identity: content.settingsView?.identity || "", writable: editing.settings},
        macroPayloadKeycodes: content.macroView?.macroPayloadKeycodes || [],
        macroPayloadModifierKeycodes: content.macroView?.macroPayloadModifierKeycodes || [],
        // The 128 named custom keys, on a keyboard with the keycode blocks.
        customKeys,
        customKeyNameSpace: content.customKeyView?.names || null,
        customKeyShortcutKeys: content.customKeyView?.shortcutKeys ? [...content.customKeyView.shortcutKeys] : [],
        customKeyEditing: {identity: content.customKeyView?.identity || "", writable: editing.customKeys},
        // The keyboard's own name, edited on Settings with the other settings.
        keyboardName: content.keyboardNameView || null,

        // TT(), OSL() and TO() are offered only by a keyboard that runs them
        // through its own layer ownership (Profile Wire feature bit 14).
        ownsLayerKeys: Boolean((capabilities?.featureFlags || 0) & PROFILE_WIRE_FEATURES.OWNED_LAYER_TOGGLES),
        qmkKeycodes: catalog.entries,
        qmkKeyLabels: catalog.labels,
        qmkKeyShortLabels: compactKeyLabels(catalog.labels),
        qmkKeycodeAliases: catalog.aliases,
        qmkKeycodeSource: CATALOG_SOURCE,

    };
}

// The UI keys layers by name and the device only knows indexes, so synthesise
// stable names. They are display strings, not identifiers from source.
/** @param {Configuration["layers"]} layout @param {Record<string, string>} labels @param {Record<string, string>} [aliases] @param {string[]} [layerNames] */
function layersForView(layout, labels, aliases = {}, layerNames = []) {
    const codes = layout.map(entry => {
        /** @type {(number | undefined)[]} */
        const positions = [];
        for (const key of entry.keys) positions[key.layoutIndex] = key.keycode;
        return positions;
    });
    const answers = compileLayerAnswers(codes);
    const layers = layout.map((entry, at) => ({
        name: layerRef(entry.layer),
        index: entry.layer,
        answers: answers[at],
        positions: entry.keys.map((key) => {
            /** @type {import("../data/types.js").ResolvedKeycode & {tapLabel?: string, layerLabel?: string}} */
            const resolved = {...key.resolved, label: labels[key.resolved.name] || key.resolved.label};
            // A dual-role key shows what it taps, named the way that keycode is
            // named everywhere else: `/`, not `SLASH`.
            if (resolved.tap && labels[resolved.tap]) resolved.tapLabel = labels[resolved.tap];
            // A layer key names its layer on the cap by the layer's name.
            if (resolved.layer !== undefined) resolved.layerLabel = layerName(layerNames, resolved.layer);
            return {
                layoutIndex: key.layoutIndex,
                keycode: key.resolved.name,
                // What the value means, beside what the keyboard calls it. A
                // behaviour row, a macro slot and a pointing mode are all named
                // semantically, while a position arrives as `QK_USER_16` or as
                // bare hex, so every lookup that crosses that gap matches on
                // this and nothing has to re-derive the mapping.
                semantic: aliases[key.resolved.name] || key.resolved.name,
                display: displayFor(resolved),
                editLabel: resolved.label,
                ...(resolved.kind === "mod-tap" ? {modifierLabel: resolved.label.split(" / ").at(-1)} : {}),
                ...(resolved.layerLabel ? {layerLabel: resolved.layerLabel} : {}),
                row: key.row,
                column: key.column,
                value: key.keycode,
            };
        }),
    }));
    return /** @type {(typeof layers[number] & {displayName?: string})[]} */ (layers);
}

// Short enough for a key cap, never invented: an unresolved keycode shows its
// hex rather than being blanked or guessed at.
/** @param {import("../data/types.js").ResolvedKeycode & {tapLabel?: string, layerLabel?: string}} resolved */
function displayFor(resolved) {
    if (resolved.name === "KC_TRANSPARENT") {
        return "▽";
    }
    if (resolved.name === "KC_NO") {
        return "";
    }
    if (resolved.kind === "layer") {
        return resolved.layerLabel;
    }
    if (resolved.kind === "layer-tap" || resolved.kind === "mod-tap") {
        return resolved.tapLabel || trim(resolved.tap);
    }
    // The SVG renderer scales labels to fit. Truncating here loses shortcut
    // modifiers and makes distinct unknown device IDs look identical.
    return resolved.label;
}

/** @param {string | undefined} name */
function trim(name) {
    const stripped = String(name || "").replace(/^KC_/, "");
    return stripped.length <= 5 ? stripped : stripped.slice(0, 5);
}

// Every keycode value the profile stores: on its layers, in its behaviours and
// in its combos and pointing-mode taps.
/** @param {Configuration} content @param {import("./types.js").DeviceModelInput["capabilities"]} capabilities @returns {number[]} */
function profileKeycodes(content, capabilities) {
    /** @type {(number | undefined)[]} */
    const values = content.layers.flatMap(layer => layer.keys.map(key => key.keycode));
    if (knownActionAbi(capabilities?.actionAbiDigest ?? 0)) for (const row of content.domains.keyBehaviors?.rows || []) {
        for (const action of [row.target, ...row.steps.flatMap((step) => [step.tap, step.hold?.action, step.longHold?.action])]) {
            if (action) values.push(nativeCode(action));
        }
    }
    for (const row of content.comboRows) values.push(...row.inputs, row.output);
    for (const slot of content.domains.pdModes || []) {
        const taps = [...Object.values(slot.directions || {}), ...Object.values(slot.diagonals || {}), ...(slot.buttons || []).map(button => button.tap)];
        for (const tap of taps) if (tap) values.push(tap.keycode);
    }
    return values.filter(/** @returns {value is number} */ (value) => typeof value === "number" && Number.isInteger(value));
}

// What fills a behaviour's empty tiers depends on the firmware and, for a
// custom key, on whether the profile gives it a shortcut.
/** @param {Partial<import("./types.js").DeviceCapabilities> | null | undefined} capabilities @param {Configuration} content */
function behaviorFeatures(capabilities, content) {
    const flags = capabilities?.featureFlags || 0;
    return {
        physicalGestureTiming: Boolean(flags & PROFILE_WIRE_FEATURES.PHYSICAL_GESTURE_TIMING),
        ownedTapping: Boolean(flags & PROFILE_WIRE_FEATURES.OWNED_TAPPING),
        customKeyShortcuts: content.domains.settings?.customKeyShortcuts || [],
    };
}

// Unstored editor rows need the same built-in actions and timing defaults as
// saved rows. Publish presentation only; these are not profile behaviours.
// Every keycode the profile holds has them, and so does every custom key,
// placed or not: Custom keys edits the behaviour of a key on no layer yet.
/** @param {Configuration} content @param {import("./types.js").DeviceModelInput["capabilities"]} capabilities @param {Record<string, string>} aliases @param {import("../../contracts/model.js").ProfileKeyNames} names @returns {Record<string, {builtIn: ReturnType<typeof builtInForView>, timing: {tapHoldTerm: number | string | undefined, longerHoldTerm: number | string | undefined, multiTapTerm: number | string | undefined}}>} */
function behaviorDefaults(content, capabilities, aliases, names) {
    const defaults = content.settingsView?.timing || {};
    const values = [defaults.tappingTerm, defaults.tapHoldTerm, defaults.longerHoldTerm, defaults.multiTapTerm];
    const features = behaviorFeatures(capabilities, content);
    const customKeys = (content.customKeyView?.keys || []).map(key => key.code);
    return Object.fromEntries([...new Set([...profileKeycodes(content, capabilities), ...customKeys])].filter(code => code > 1).map(code => {
        const target = keycodeAction(code);
        const name = keycodeCatalog.resolve(code).name;
        const timing = effectiveTimings({target}, values);
        return [aliases[name] || name, {builtIn: builtInForView(target, features, names),
            timing: {tapHoldTerm: timing.hold, longerHoldTerm: timing.long, multiTapTerm: timing.repeat}}];
    }));
}

/** @param {import("./types.js").DeviceModelInput} state */
function deviceHeader(state) {
    const connected = Boolean(state.capabilities);
    if (!connected) {
        return {
            connected: false,
            label: "",
            summary: "",
            subtitle: "",
            health: {
                profile: "unavailable",
                converged: false,
                halves: /** @type {import("../../contracts/model.js").HalvesId} */ ("unread"),
                recoveryPending: false,
                restartNeeded: false,
                busy: false,
                phase: state.phase || PHASE.IDLE,
                error: state.error?.message || "",
            },
        };
    }
    // A name the person gave the keyboard stands alone; otherwise the
    // manufacturer and product it reports over USB.
    const label = state.storedKeyboardName || [state.device?.manufacturer, state.device?.product].filter(Boolean).join(" ") || "Charybdis";
    const status = state.status;
    // Say plainly when nothing is committed. "generation 0" reads like a real
    // generation and it is not one.
    const summary = !status
        ? ""
        : state.committed?.source === "compiled" || status.committedGeneration === 0
            ? `no committed profile · running compiled defaults · ${convergence(status)}`
            : `generation ${status.committedGeneration} · ${hex(status.committedDigest)} · ${convergence(status)}`;
    const layers = state.layout?.state === "read" ? state.layout.layers.length : 0;
    const parts = [];
    if (layers) {
        parts.push(`${layers} layers`);
    }
    if (state.committed?.state === "read") {
        parts.push(state.committed.source === "compiled" ? "compiled defaults" : `generation ${state.committed.generation}`);
    }
    const subtitle = parts.length
        ? `${parts.join(" and ")} read from the keyboard`
        : "Connected. Use Read from keyboard to load its configuration.";
    const converged = Boolean(status) && halvesConverged(status);
    return {
        connected: true,
        label,
        summary,
        subtitle,
        health: {
            profile: !status ? "unread" : converged ? "synced" : "attention",
            converged,
            halves: halvesState(status),
            recoveryPending: Boolean(state.mutationCompatibility?.recoveryPending || status?.candidatePending),
            // The slave half never confirmed a cancelled save. Only a restart
            // releases it, and the keyboard refuses new saves until then.
            restartNeeded: Boolean(status?.peerCleanupPending),
            busy: Boolean(state.busy),
            phase: state.phase || PHASE.CONNECTED,
            error: state.error?.message || state.liveApply?.failure?.reason || "",
        },
    };
}

// Both halves agreeing is the thing worth seeing at a glance; anything else
// gets said plainly rather than hidden behind a green chip.
/** @param {Partial<import("./types.js").ProfileStatus> | null | undefined} status */
function convergence(status) {
    return HALVES_WORDS[halvesState(status)].label.toLowerCase();
}

// Which of the halves' words applies: agreeing, the slave half not seen over
// the split link at all, or seen but holding something else.
/** @param {Partial<import("./types.js").ProfileStatus> | null | undefined} status @returns {import("../../contracts/model.js").HalvesId} */
function halvesState(status) {
    if (!status) return "unread";
    if (halvesConverged(status)) return "agree";
    return status.peerKnown ? "apart" : "alone";
}

/** @param {Partial<import("./types.js").ProfileStatus> | null | undefined} status */
function halvesConverged(status) {
    return Boolean(status &&
        status.peerKnown === true &&
        status.peerConverged === true &&
        !status.conflictCount &&
        status.activeGeneration === status.committedGeneration &&
        status.committedGeneration === status.peerGeneration);
}

/** @param {number | undefined} value */
function hex(value) {
    return typeof value === "number" ? `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}` : "";
}

/** @param {import("./types.js").DeviceModelInput} state */
function diagnosticsFor(state) {
    const notes = [];
    if (!state.layout || state.layout.state !== "read") {
        notes.push("Layout has not been read from the keyboard yet.");
    }
    if (state.committed?.state === "read") {
        notes.push(
            state.committed.source === "compiled"
                ? `Showing the firmware's compiled defaults (${state.committed.byteLength} bytes). Nothing is committed to the keyboard yet, so this is what it runs.`
                : `Committed profile generation ${state.committed.generation} read from the keyboard (${state.committed.byteLength} bytes).`
        );
        for (const failure of state.committed.failures || []) {
            notes.push(`Domain 0x${failure.domainId.toString(16)} did not decode: ${failure.message}`);
        }
    } else {
        notes.push("RGB and key behaviours need the committed profile read.");
    }
    if (state.combos?.state === "read") notes.push(`${state.combos.rows.length} combos read from the keyboard. Combos are ${state.combos.enabled ? "enabled" : "disabled"}.`);
    else notes.push(state.combos?.error?.message || "Combos have not been read from the keyboard yet.");
    notes.push((state.capabilities?.supportedDomainMask || 0) & PROFILE_WIRE_DOMAINS.SETTINGS ? "Complete profile backups include both macro banks and global keyboard settings." : "Macro payloads and policy defaults need the complete-profile firmware update.");
    return notes;
}

// The webview's catalog entries key on the keycode *name*; the vendored
// catalog keys on the numeric value, so map between them here.
function catalogViews() {
    const aliases = keycodeCatalog.aliasTable();
    const entries = [];
    /** @type {Record<string, string>} */
    const labels = {};
    for (const entry of keycodeCatalog.entries()) {
        const searchTerms = [entry.name, entry.label, ...entry.aliases].filter(Boolean);
        entries.push({
            value: entry.name,
            key: entry.name,
            label: entry.label,
            group: entry.group,
            aliases: entry.aliases,
            keycode: entry.value,
            searchTerms,
            search: searchTerms.join(" ").toLowerCase(),
            searchCompact: searchTerms.join("").toLowerCase(),
        });
        labels[entry.name] = entry.label;
        for (const alias of entry.aliases) {
            if (!labels[alias]) {
                labels[alias] = entry.label;
            }
        }
    }
    return {aliases, entries, labels};
}

// The keyboard's own header and diagnostics, without the rest of the model:
// with a draft open the panel shows these from the keyboard and everything
// else from the draft.
/** @param {import("./types.js").DeviceModelInput} [state] */
const deviceSummary = (state = {}) => ({device: deviceHeader(state), diagnostics: diagnosticsFor(state)});

// What each listed keyboard is called: the product name it reports over USB,
// which is a renamed keyboard's new name once it has reconnected, or `name`
// where the panel already knows a newer stored one. Two that would read alike
// are told apart by serial number, or else by the number each keeps while it
// is listed; the number leads, so a shortened label keeps it.
/** @param {readonly {product?: string, serialNumber?: string, number?: number, name?: string}[]} devices @returns {string[]} */
function deviceLabels(devices) {
    const bases = devices.map(device => device.name || device.product || "Charybdis 4x6");
    return bases.map((base, index) => bases.indexOf(base) === bases.lastIndexOf(base) ? base
        : devices[index].serialNumber ? `${base} · ${devices[index].serialNumber}` : `Keyboard ${devices[index].number ?? index + 1} · ${base}`);
}

module.exports = {buildDeviceModel, buildSnapshotModel, deviceLabels, deviceSummary, editorViews};
