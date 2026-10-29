// @ts-check
"use strict";

// The profile's part of the model the webview renders: its layers and keys,
// combos, behaviours, pointing slots, macros, custom keys and settings, with
// the catalogue's names laid over them and the firmware decisions that depend
// only on the profile (D-L73). It reads a decoded snapshot or the keyboard's
// independent readback, whichever session/device-model.js passes in, and holds
// nothing: the keyboard's header and diagnostics are the session's.
//
// Domains the device cannot report yet come back empty rather than invented.
// An empty RGB tab is truthful; a tab populated from the authored source would
// be a lie about what the keyboard is running.

const {PD_MODE_KEYS, formerNames, pdModeKeyOfCode} = require("../data/pd-mode-keys");
const {VOCABULARY, layerName, slotName} = require("./vocabulary");
const {comboOutputBehaviorLayers, participation} = require("./participation");
const {comboReferenceLayers, publishedComboReach} = require("./combo-reach");
const keycodeCatalog = require("../data/keycode-catalog");
const {offered} = require("../data/offered-keycodes");
const keycodes = require("../schema/keycodes");
const keycodeLegacy = require("../data/keycode-legacy");
const {behaviorRowsForView, builtInForView, comboRowsForView, rgbForView} = require("./device-profile-view");
const {dualRole, effectiveTimings, holdTermSetting} = require("./gesture-timing");
const {timingAlone} = require("./inert-behaviors");
const {compactKeyLabels, heldModifierWords, hostKeyVocabulary, keyKind, keyLabel, keyLayer, keyLayerForm, layerModWords, layerTapWords, profileKeyNames, shortcutAct, shortcutKeys, shortcutLabel, shortcutLayerNames} = require("./key-names");
const {keycodeAction, knownActionAbi, layerRef, nativeCode} = require("../schema/actions");
const {dpiChoices} = require("./pointer-dpi");
const {pointingTapKeys} = require("./pointing-taps");
const {linkStarts, linkTargets, pointerCoveredLayers} = require("./pointing-links");
const {keycodeLayersOn} = require("./layer-effects");
const {settingsEditorView} = require("./settings-editor");
const {macroEditorView} = require("./macro-editor");
const {customKeyEditorView} = require("./custom-key-editor");
const {runningComboRows} = require("../schema/combo-domain-v1");
const {SETTING, SHORTCUT_KEY_LIMITS, alwaysOnLayers} = require("../schema/settings-domain-v1");
const {KEY_LEDS, TRACKBALL_LED} = require("../data/charybdis-layout");
const {MACRO_DOMAIN_V1} = require("../schema/macro-domain-v1");
const {macroName} = require("../../rules/qmk-keycodes.mjs");
const {compileLayerAnswers} = require("./layer-resolution");

const CATALOG_SOURCE = "vendored QMK keycode catalog";

// What the profile model presents: configuration, with no claim that it is a
// read.
/**
 * @typedef {object} Configuration
 * @property {{layer: number, keys: import("./types.js").LayoutKey[]}[]} layers
 * @property {import("./types.js").ReadDomains} domains
 * @property {Extract<import("./types.js").ComboRead, {state: "read"}>["rows"]} comboRows
 * @property {import("../../contracts/panel.js").PublishedModel["comboReadback"] & {rows?: undefined}} comboInfo
 * @property {ReturnType<typeof import("./device-profile-view.js").baseRgbForView>} baseEffect
 * @property {ReturnType<typeof settingsEditorView> | null} [settingsView]
 * @property {ReturnType<typeof macroEditorView> | null} [macroView]
 * @property {ReturnType<typeof customKeyEditorView> | null} [customKeyView]
 * @property {ReturnType<typeof import("./keyboard-name.js").keyboardNameView>} [keyboardNameView]
 * @property {Partial<import("../../contracts/edits.js").BaseIdentity> | null} identity
 * @typedef {{busy: boolean, behaviors: boolean, pointing: boolean, combos: boolean, macros: boolean, settings: boolean, customKeys: boolean}} Editing
 * @typedef {{actionAbiDigest?: number, maxTapStepsPerBehavior?: number} | null | undefined} Capabilities
 * @typedef {import("../../contracts/panel.js").CatalogEntry} CatalogEntry
 */

// The three editor views of a complete snapshot, built here only: the
// service keeps them for the profile it read, and a draft builds its own.
/** @param {import("./types.js").ProfileSnapshot} snapshot @param {import("./types.js").ProfileDestination} [capabilities] */
function editorViews(snapshot, capabilities) {
    return {settingsView: settingsEditorView(snapshot), macroView: macroEditorView(snapshot, capabilities),
        customKeyView: customKeyEditorView(snapshot, capabilities)};
}

// A profile's combos as the keyboard would report them (GET 0x06): every
// window as it resolves and whether it follows the default, and each layer's
// combo reference as its record stores it.
/** @param {Pick<import("./types.js").DecodedProfile, "combos" | "settings">} decoded */
function profileComboReadback({combos, settings}) {
    return {state: /** @type {const} */ ("read"), enabled: Boolean(settings.values[SETTING.COMBOS_ENABLED]), layerReferences: settings.layers.map(record => record.reference),
        version: combos.version, defaultTermMs: combos.defaultTermMs, holdTermMs: combos.holdTermMs, rows: runningComboRows(combos)};
}

/** @param {Configuration} content @param {Capabilities} capabilities @param {Editing} editing */
function profileModel(content, capabilities, editing) {
    const base = catalogBase();
    // What this profile calls its keys, laid over the catalogue: one rule for
    // the screens and the review (model/key-names.js).
    const names = profileKeyNames({
        hostOs: content.settingsView?.host?.effective,
        hostLayout: content.settingsView?.host?.layout,
        macosIso: content.settingsView?.host?.macosIso,
        layers: content.domains?.settings?.names,
        actionsKnown: knownActionAbi(capabilities?.actionAbiDigest ?? 0),
        macros: content.macroView?.macros,
        customKeys: content.customKeyView?.keys,
        behaviors: content.domains.keyBehaviors?.rows || [],
        pdModes: content.domains?.pdModes,
    });
    // The profile's names laid over the catalogue's, on copies: an entry the
    // profile names nothing on, or names as the catalogue does, stays the
    // catalogue's own object.
    const catalog = {aliases: {...base.catalog.qmkKeycodeAliases, ...names.aliases}, labels: {...base.catalog.qmkKeyLabels, ...names.labels},
        entries: base.catalog.qmkKeycodes.slice()};
    catalog.entries.forEach((entry, at) => {
        const label = names.labels[entry.key];
        if (label !== undefined && label !== entry.label) catalog.entries[at] = publishedEntry({...entry, label, searchTerms: [...entry.searchTerms, label],
            search: `${entry.search} ${label.toLowerCase()}`, searchCompact: entry.searchCompact + label.toLowerCase().replaceAll(" ", "")});
    });
    // A keycode's entry takes its presentation; one the catalogue lacks is added.
    /** @type {Map<number, number>} */
    const added = new Map();
    /** @param {number} code @param {Omit<CatalogEntry, "offered">} presentation */
    const present = (code, presentation) => {
        const index = base.at.get(code) ?? added.get(code);
        if (index === undefined) {
            added.set(code, catalog.entries.length);
            catalog.entries.push(publishedEntry(presentation));
        } else catalog.entries[index] = publishedEntry({...catalog.entries[index], ...presentation});
    };
    // A pointing-mode keycode is offered in the picker under its slot, and
    // its former names (PD_SLOT_n, a preset's) still reach it when typed.
    for (const {name, native, code, label} of names.pointing) {
        const key = /** @type {{slot: number, locked: boolean}} */ (pdModeKeyOfCode(code));
        const former = formerNames(key.slot).map(names => (key.locked ? names.lock : names.hold));
        present(code, {value: name, key: name, label, group: "Pointing modes", aliases: [native, ...former], keycode: code, searchTerms: [name, label], search: `${name} ${label}`.toLowerCase(), searchCompact: `${name}${label}`.toLowerCase()});
    }
    // So is each custom key, under its name, its tip saying what its shortcut
    // does.
    const customKeys = (content.customKeyView?.keys || []).map(key => ({...key, shortcutLabel: shortcutLabel(names, key.shortcut), shortcutKeys: shortcutKeys(names, key.shortcut), shortcutLayerNames: shortcutLayerNames(names, key.shortcut)}));
    for (const {name, native, code, label} of names.custom) {
        const shortcut = customKeys.find(key => key.code === code)?.shortcut;
        const does = shortcutAct(names, shortcut);
        present(code, {value: name, key: name, label, group: "Custom keys", aliases: [native], keycode: code, searchTerms: [name, label], search: `${name} ${label}`.toLowerCase(), searchCompact: `${name}${label}`.toLowerCase(),
            tip: does ? `${label} · ${does}` : `${label} · no shortcut`});
    }
    // Every keycode the profile holds is in the table by its name here, so the
    // interface names any of them by keycode and never composes a name itself:
    // a layer-tap cannot be listed ahead of time, one per layer and tap key.
    // The layer each one acts on is beside it, so the interface marks the
    // layer a name ends in without working it out again.
    // A layer-mod's modifiers are beside them, in the words its name ends in,
    // and a layer-tap's tap key, in the words its name starts with.
    const keyLayers = {...names.keyLayers}, keyLayerForms = {...names.keyLayerForms};
    /** @type {Record<string, string>} */
    const keyLayerMods = {};
    /** @type {Record<string, string>} */
    const keyLayerTaps = {};
    for (const value of profileKeycodes(content, capabilities)) {
        const name = keycodes.resolve(value).name, layer = keyLayer(value), form = keyLayerForm(value), mods = layerModWords(names, value), tap = layerTapWords(names, value);
        catalog.labels[name] = keyLabel(names, value);
        if (layer !== undefined) keyLayers[name] = layer;
        if (form !== undefined) keyLayerForms[name] = form;
        if (mods !== undefined) keyLayerMods[name] = mods;
        if (tap !== undefined) keyLayerTaps[name] = tap;
    }
    const hostVocabulary = hostKeyVocabulary(names.hostOs);
    // The settings a pointing slot's link is judged against, once read.
    const linkSettings = content.domains.settings?.values ? content.domains.settings : null;
    // The layers each keycode the profile holds turns on, and each mode's
    // and custom key's, by every name the interface reads it under, so the
    // interface says which keys reach a mode its layers start without
    // working out what a keycode does (layer-effects.js keycodeLayersOn).
    const turnsOn = keycodeLayersOn(linkSettings ? {settings: linkSettings, pdModes: content.domains.pdModes || []} : {settings: {values: [], names: [], customKeyShortcuts: []}, pdModes: []});
    /** @type {Record<string, number>} */
    const keyTurnsOn = {};
    const pointingKeys = PD_MODE_KEYS.flatMap((keys) => [keys.holdCode, keys.lockCode]);
    for (const value of new Set([...profileKeycodes(content, capabilities), ...pointingKeys, ...customKeys.map((key) => key.code)])) {
        const mask = turnsOn(value), name = keycodes.resolve(value).name;
        if (mask) for (const spelled of [name, catalog.aliases[name]]) if (spelled) keyTurnsOn[spelled] = mask;
    }
    // What each keycode the interface treats apart is (key-names.js keyKind):
    // transparent, disabled, a macro's or a custom key's, by every name it is
    // read under, so no screen knows one by how it is spelled. A profile on
    // current firmware names its macros and custom keys as every other does,
    // so its kinds are the catalog's own.
    const keyKinds = sharedRecord(keyKindsByName(catalog.aliases), base.catalog.qmkKeyKinds);
    const layers = layersForView(content.layers, catalog.labels, catalog.aliases, names, content.domains.settings?.values ? alwaysOnLayers(content.domains.settings.values) : 1);
    const outputLayers = comboOutputBehaviorLayers(content.domains.settings, content.domains.keyBehaviors?.rows || []);
    const combos = comboRowsForView(content.comboRows, catalog.labels).map((combo, index) => ({...combo, outputBehaviorLayers: outputLayers(content.comboRows[index])}));
    // Which layer's keys combos match while each layer is on top
    // (combo-reach.js): the profile's records, else the keyboard's readback.
    const references = comboReferenceLayers(content.settingsView?.comboReferences, content.comboInfo?.layerReferences);
    return {
        // The words for every value the keyboard stores, so the interface
        // names things as the review does (model/vocabulary.js).
        vocabulary: {...VOCABULARY, ...hostVocabulary},
        // The LED each key carries, by layout index, and the trackball's.
        leds: base.catalog.leds,
        layers,
        // What each typing key prints: plain, Shift, Option/AltGr, then both,
        // for the picker's board; null on US, whose board is drawn as is.
        hostLayoutLegends: names.legends,

        // Each slot with the name a person reads for it, one rule for every
        // surface (model/vocabulary.js slotName), the keys that run its mode
        // (data/pd-mode-keys.js), so the interface names and finds a
        // pointing-mode key without a registry of its own, and the layers its
        // key turns on that the pointer layer covers (model/pointing-links.js),
        // and the layers that start its mode, each with the layers that end a
        // start from it (model/pointing-links.js linkStarts).
        pdModes: (content.domains?.pdModes || []).map((slot) => ({...slot, displayName: slotName(slot), keys: PD_MODE_KEYS[slot.id],
            pointerCovers: linkSettings ? pointerCoveredLayers(linkSettings, slot) : 0, linkStarts: linkSettings ? linkStarts(linkSettings, slot) : []})),
        pdModeEditing: {writable: editing.pointing,
            dpiChoices: dpiChoices({normalSpeed: true}),
            // Which layers a slot's link may name, and why not
            // (model/pointing-links.js), and the pointer layer, by which the
            // interface names what covers a slot's pointerCovers.
            linkTargets: linkSettings ? linkTargets(linkSettings, content.domains.pdModes || []) : [],
            pointerLayer: linkSettings ? linkSettings.values[SETTING.AUTO_MOUSE_LAYER] : null,
            // The keys a direction may send, so the
            // picker offers only those (model/pointing-taps.js).
            tapKeys: pointingTapKeys()},
        keyBehaviors: content.domains.keyBehaviors ? behaviorRowsForView(content.domains.keyBehaviors, behaviorFeatures(content), names) : [],
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

        // Native combo values, resolved from either the readback or the snapshot.
        combos,
        comboReadback: {...content.comboInfo, writable: editing.combos},
        comboReferenceLayers: references,
        // Which combos fire from each layer, and on which keys (combo-reach.js).
        comboReach: publishedComboReach(layers, combos, references),
        macros: content.macroView?.macros || [],
        macroNameSpace: content.macroView?.names || null,
        macroBank: content.macroView?.macroBank || null,
        hostSettings: content.settingsView?.host || null,
        macroUnicode: content.macroView?.unicode || {mode: 0},
        macroProtectionChoices: content.macroView?.protectionChoices || [],
        macroEditing: {identity: content.macroView?.identity || "", writable: editing.macros},
        behaviorTimingDefaults: content.settingsView?.timing || {},
        configDefaults: content.settingsView?.sections || [],
        participation: content.domains.settings?.values && content.domains.settings.layers ? participation(content.domains.settings).view() : null,
        settingsEditing: {identity: content.settingsView?.identity || "", writable: editing.settings},
        macroPayloadKeycodes: content.macroView?.macroPayloadKeycodes || [],
        macroPayloadModifierKeycodes: content.macroView?.macroPayloadModifierKeycodes || [],
        // The 128 named custom keys, on a keyboard with the keycode blocks.
        customKeys,
        customKeyNameSpace: content.customKeyView?.names || null,
        customKeyShortcutKeys: content.customKeyView?.shortcutKeys ? [...content.customKeyView.shortcutKeys] : [],
        // The limits are the codec's whether or not a profile is open.
        customKeyShortcutKeyLimits: /** @type {import("../../contracts/panel.js").PublishedModel["customKeyShortcutKeyLimits"]} */ (structuredClone(content.customKeyView?.shortcutKeyLimits ?? SHORTCUT_KEY_LIMITS)),
        // Every layer with why a shortcut cannot turn it on (shortcut-layers.js).
        customKeyShortcutLayers: content.customKeyView?.shortcutLayers ? content.customKeyView.shortcutLayers.map(target => ({...target})) : [],
        customKeyEditing: {identity: content.customKeyView?.identity || "", writable: editing.customKeys},
        // The keyboard's own name, edited on Settings with the other settings.
        keyboardName: content.keyboardNameView || null,

        // By the names and groups the entries end with, the profile's keys
        // laid over the catalog's.
        qmkKeycodes: catalog.entries,
        qmkKeyLabels: catalog.labels,
        qmkKeyLayers: keyLayers,
        qmkKeyLayerForms: keyLayerForms,
        qmkKeyLayerMods: keyLayerMods,
        qmkKeyLayerTaps: keyLayerTaps,
        qmkKeyTurnsOn: keyTurnsOn,
        qmkKeyKinds: keyKinds,
        qmkKeyShortLabels: compactKeyLabels(catalog.labels),
        qmkKeycodeAliases: catalog.aliases,
        qmkKeycodeSource: base.catalog.qmkKeycodeSource,
        qmkSpellings: base.catalog.qmkSpellings,

    };
}

// Every name in the alias table (the catalogue's names and other spellings,
// and the profile's names, which it maps the stored names to) with the kind
// of the keycode it reads as, and that keycode's stored name and hex.
/** @param {Record<string, string>} aliases */
function keyKindsByName(aliases) {
    /** @type {Record<string, import("../../contracts/model.js").KeyKind>} */
    const kinds = {};
    for (const [name, meaning] of Object.entries(aliases)) {
        const value = keycodes.encode(name);
        const kind = value === undefined ? undefined : keyKind(value);
        if (value === undefined || !kind) continue;
        const hex = `0x${value.toString(16).toUpperCase().padStart(4, "0")}`;
        for (const spelled of [name, meaning, keycodes.resolve(value).name, hex]) kinds[spelled] = kind;
    }
    return kinds;
}

// The catalog's own record when a profile's holds just what it does, so the
// model shares it.
/** @template {Record<string, unknown>} T @param {T} record @param {T} base @returns {T} */
function sharedRecord(record, base) {
    const keys = Object.keys(record);
    return keys.length === Object.keys(base).length && keys.every((key) => Object.hasOwn(base, key) && record[key] === base[key]) ? base : record;
}

// The UI keys layers by name and the device only knows indexes, so synthesise
// stable names. They are display strings, not identifiers from source.
/** @param {Configuration["layers"]} layout @param {Record<string, string>} labels @param {Record<string, string>} [aliases] @param {Partial<import("../../contracts/model.js").ProfileKeyNames>} [names] the profile's names for its layers and host */
function layersForView(layout, labels, aliases = {}, names = {}, alwaysOn = 1) {
    const layerNames = names.layers || [];
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
        // Base, and every default layer the keyboard keeps, is always on.
        alwaysOn: Boolean(alwaysOn & (1 << entry.layer)),
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
                display: displayFor(resolved, key.keycode),
                editLabel: resolved.label,
                // What a mod-tap's hold sends, from its modifier bits.
                ...(resolved.kind === "mod-tap" ? {modifierLabel: heldModifierWords(names, key.resolved.value)} : {}),
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
/** @param {import("../data/types.js").ResolvedKeycode & {tapLabel?: string, layerLabel?: string}} resolved @param {number} value the stored keycode */
function displayFor(resolved, value) {
    if (keyKind(value) === "transparent") {
        return "▽";
    }
    if (keyKind(value) === "disabled") {
        return "";
    }
    // A dual-role layer key (OSL(), TT()) shows its layer, and its cap's
    // second line what it does to it; any other reads by its whole name
    // ("Hold Navigation"), on one line.
    if (resolved.kind === "layer") {
        return dualRole(resolved.value) ? resolved.layerLabel : resolved.label;
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
/** @param {Configuration} content @param {Capabilities} capabilities @returns {number[]} */
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
        const taps = [...Object.values(slot.directions || {}), ...Object.values(slot.diagonals || {})];
        for (const tap of taps) if (tap) values.push(tap.keycode);
    }
    return values.filter(/** @returns {value is number} */ (value) => typeof value === "number" && Number.isInteger(value));
}

// What fills a custom key's empty tiers depends on whether the profile gives
// it a shortcut.
/** @param {Configuration} content */
function behaviorFeatures(content) {
    return {customKeyShortcuts: content.domains.settings?.customKeyShortcuts || []};
}

// Unstored editor rows need the same built-in actions and timing defaults as
// saved rows. Publish presentation only; these are not profile behaviours.
// Every keycode the profile holds has them, and so does every custom key,
// placed or not: Custom keys edits the behaviour of a key on no layer yet.
/** @param {Configuration} content @param {Capabilities} capabilities @param {Record<string, string>} aliases @param {import("../../contracts/model.js").ProfileKeyNames} names @returns {import("../../contracts/panel.js").PublishedModel["behaviorEditing"]["keyDefaults"]} */
function behaviorDefaults(content, capabilities, aliases, names) {
    const defaults = content.settingsView?.timing || {};
    const values = [defaults.tappingTerm, defaults.tapHoldTerm, defaults.longHoldTerm, defaults.multiTapTerm];
    const features = behaviorFeatures(content);
    const customKeys = (content.customKeyView?.keys || []).map(key => key.code);
    return Object.fromEntries([...new Set([...profileKeycodes(content, capabilities), ...customKeys])].filter(code => code > 1).map(code => {
        const target = keycodeAction(code);
        const name = keycodes.resolve(code).name;
        const timing = effectiveTimings({target}, values, features.customKeyShortcuts);
        // Where each default comes from, named for the editor's placeholders.
        // A key follows the same one with or without a row (firmware D-F27).
        const source = holdTermSetting(target, features.customKeyShortcuts) === SETTING.TAPPING_TERM ? "tappingTerm" : "tapHoldTerm";
        return [aliases[name] || name, {builtIn: builtInForView(target, features, names),
            timing: {tapHoldTerm: timing.hold, longHoldTerm: timing.long, multiTapTerm: timing.repeat},
            timingSources: {tapHoldTerm: source, longHoldTerm: "longHoldTerm", multiTapTerm: "multiTapTerm"},
            timingAlone: timingAlone(target, features.customKeyShortcuts)}];
    }));
}

// What every model of a build starts from, built once and frozen: the
// catalogue's entries as the picker reads them, `offered` included, their
// labels, aliases and short labels, what each keycode the interface treats
// apart is, the words for stored values as a host with no OS of its own
// reads them, and what no profile changes. A model
// shares these objects wherever its profile lays nothing over them, so the
// panel loop posts them once (session/panel-loop.js); `at` is where each
// keycode's entry is, the first by that keycode.
/** @type {{catalog: import("../../contracts/panel.js").PanelCatalog, at: ReadonlyMap<number, number>} | undefined} */
let built;
function catalogBase() {
    if (built) return built;
    const {aliases, entries, labels} = catalogViews();
    const qmkKeycodes = entries.map((entry) => frozen(publishedEntry({...entry, aliases: frozen([...entry.aliases]), searchTerms: frozen(entry.searchTerms)})));
    /** @type {import("../../contracts/panel.js").PanelCatalog} */
    const catalog = {
        vocabulary: frozen({...VOCABULARY, ...hostKeyVocabulary(0)}),
        leds: frozen({keys: frozen([...KEY_LEDS]), trackball: TRACKBALL_LED}),
        qmkKeycodes: frozen(qmkKeycodes),
        qmkKeyLabels: frozen(labels),
        qmkKeycodeAliases: frozen(aliases),
        qmkKeyShortLabels: frozen(compactKeyLabels(labels)),
        // What each keycode the interface treats apart is, by the names a
        // profile on current firmware reads it under: its 128 macros and 128
        // custom keys go by the same names in every profile.
        qmkKeyKinds: frozen(keyKindsByName({...aliases, ...profileKeyNames({actionsKnown: true,
            macros: Array.from({length: MACRO_DOMAIN_V1.SLOTS}, (_, index) => ({keycode: macroName(index)}))}).aliases})),
        qmkKeycodeSource: CATALOG_SOURCE,
        // QMK's other spellings the encoder accepts (data/keycode-legacy.js),
        // so the picker reads a typed LCTL_T(KC_A) as the draft will.
        qmkSpellings: frozen({modTaps: keycodeLegacy.MOD_TAP_SHORTHANDS, wrappers: keycodeLegacy.WRAPPER_ALIASES, names: keycodeLegacy.NAMES}),
    };
    /** @type {Map<number, number>} */
    const at = new Map();
    qmkKeycodes.forEach((entry, index) => {if (!at.has(entry.keycode)) at.set(entry.keycode, index);});
    built = {catalog: frozen(catalog), at};
    return built;
}
// Frozen, so a reader that changed a shared object would fail rather than
// change every model; typed as the contract's plain shape.
/** @template T @param {T} value @returns {T} */
const frozen = (value) => /** @type {T} */ (Object.freeze(value));
/** @returns {import("../../contracts/panel.js").PanelCatalog} */
const panelCatalog = () => catalogBase().catalog;

// An entry as the model publishes it: marked when the picker never offers it
// (data/offered-keycodes.js), by the name and group it ends with.
/** @param {Omit<CatalogEntry, "offered"> & {offered?: boolean}} entry @returns {CatalogEntry} */
function publishedEntry({offered: _, ...entry}) {
    return offered({name: entry.value, group: entry.group}) ? entry : {...entry, offered: false};
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

module.exports = {editorViews, panelCatalog, profileComboReadback, profileModel};
