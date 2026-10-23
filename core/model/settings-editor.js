// @ts-check
"use strict";

const {layerOfRef} = require("../schema/actions");
const {PROFILE_DOMAIN_IDS, replaceDomain} = require("../schema/profile-domains");
const {effectiveTimings} = require("./gesture-timing");
const {encodeKeyBehaviorDomain} = require("../schema/key-behavior-domain-v1");
const {validateSnapshot, decodedOf} = require("./portable-profile");
const {SETTING, SETTING_FIELD, SETTING_FIELDS, SETTINGS, encodeSettings, validSetting} = require("../schema/settings-domain-v1");
const {hostSettings, followHostOs, UNICODE_ENABLED, LAYOUT_SHIFT, MACOS_ISO} = require("../schema/host-settings");
const {hostLayouts} = require("../data/host-layouts");
const {dpiChoices} = require("./pointer-dpi");
const {hostKeyLabel} = require("./key-names");
const {layerName, VOCABULARY} = require("./vocabulary");
/** @param {string} message */
const fail = message => Object.assign(new Error(message), {code: "INVALID_SETTINGS_EDIT"});
/** @param {string} macro @param {number} id @param {string} label @param {string} [hint] @param {Partial<import("../../contracts/model.js").StoredSettingField>} [extra] @returns {import("../../contracts/model.js").StoredSettingField} */
function number(macro, id, label, hint, extra = {}) {
    const rule = SETTING_FIELDS[id];
    const unit = "unit" in extra ? extra.unit : "ms";
    const range = rule.min !== undefined && rule.max !== undefined
        ? `${rule.min}–${rule.max}${unit ? " " + unit : ""}${rule.step && rule.step > 1 ? ", in steps of " + rule.step : ""}` : "";
    return {macro, id, label, hint: hint ?? range, min: rule.min, max: rule.max, unit, kind: "number", validate: "nonnegative-int", ...extra};
}
/** @param {string} macro @param {number} id @param {string} label @param {string} [hint] @returns {import("../../contracts/model.js").StoredSettingField} */
const toggle = (macro, id, label, hint) => ({macro, id, label, hint, kind: "toggle"});
/** @overload @param {string} macro @param {number} id @param {string} label @param {string} [hint] @returns {import("../../contracts/model.js").StoredSettingField} */
/** @overload @param {string} macro @param {undefined} id @param {string} label @param {string} [hint] @returns {Omit<import("../../contracts/model.js").LayerSettingField, 'record' | 'layer'>} */
/** @param {string} macro @param {number | undefined} id @param {string} label @param {string} [hint] @returns {import("../../contracts/model.js").SettingFieldBase & {id: number | undefined, kind: 'layer', validate: string}} */
function layer(macro, id, label, hint) {return {macro, id, label, hint, kind: "layer", validate: "layer"};}
/** @param {string} macro @param {number} id @param {number} shift @param {string} label @param {string} [hint] */
const byte = (macro, id, shift, label, hint) => number(macro, id, label, hint || "0–255", {shift, max: 255, unit: undefined, validate: "uint8"});
// A duration the keyboard stores in milliseconds but that only means anything
// as a share of another one, `of`: it is edited as a whole percentage of that
// one, and keeps its share when that one changes (see `rescaleShares`).
/** @param {string} macro @param {number} id @param {number} of @param {string} label @param {string} hint @returns {import("../../contracts/model.js").ShareSettingField} */
const share = (macro, id, of, label, hint) => ({macro, id, of, label, hint, kind: "share", max: 99, validate: "percent"});

// Combo timing is stored in its own domain, but presented with global policy.
/** @type {readonly import("../../contracts/model.js").ComboTimingField[]} */
const COMBO_TIMING = Object.freeze([
    {id: "default", label: "Default combo window", hint: "How close together a combo's keys must be pressed, for every combo without its own window. New combos start on it, and the combos that follow it change with it."},
    {id: "hold", label: "Combo hold threshold", hint: "How long a combo that must be held, or is tap only, waits to tell a hold from a tap: this, or its combo window if that is longer. Other combos ignore it. 0 adds no wait beyond the window."},
]);

// These are editor definitions, not configuration defaults. Every value below
// is supplied by the complete device snapshot; absent readback stays absent.
// Each names the stored value it edits from the schema's table of them
// (settings-domain-v1.js), which also holds what the keyboard accepts; the
// words, kinds and grouping are this module's.
//
// `area` is the rail screen a section is edited on, and the review area it is
// listed under; a section without one is a Settings section. Everything the
// trackball does to the pointer — its speed, sniping, auto-mouse — is Mouse.
//
// `governs` names what a setting is about when that thing has a colour of its
// own elsewhere — a behaviour tier, a tap-count branch, a pointing slot, a
// layer — so every surface that shows the setting can mark it the same way.
//
// The defaults behaviours inherit, which the editor view also publishes as
// `timing`.
/** @type {Omit<import("../../contracts/model.js").SettingsSection, "fields"> & {fields: import("../../contracts/model.js").StoredSettingField[]}} */
const keyTiming = {id: "keyTiming", label: "Tap & hold timing", fields: [
    // Said in words first; the QMK names are in its hover help.
    number("tappingTerm", SETTING.TAPPING_TERM, "Dual-role tap / hold threshold", "How long a key that types on tap and holds a layer or modifier waits before a press counts as a hold, with or without a behaviour, unless its behaviour sets its own.",
        {tooltip: "QMK's tapping term, used by LT(), MT(), OSM(), TT() and OSL() keys, and by their behaviours with an empty Tap / hold threshold."}),
    number("tapHoldTerm", SETTING.TAP_HOLD_TERM, "Behaviour tap / hold threshold", "Used when a behaviour on any other key leaves its Tap / hold threshold empty.", {governs: {kind: "tier", tier: "hold"}}),
    number("longHoldTerm", SETTING.LONG_HOLD_TERM, "Long hold threshold", "Used when a behaviour leaves its Long hold threshold empty.", {governs: {kind: "tier", tier: "long"}}),
    number("multiTapTerm", SETTING.MULTI_TAP_TERM, "Multi tap window", "How long after releasing a key the next press still counts as another tap. Used when a behaviour leaves its Multi tap window empty.", {governs: {kind: "branch", count: 2}}),
]};
/** @type {import("../../contracts/model.js").SettingsSection[]} */
const sections = [
    keyTiming,
    {id: "normalPointerSpeed", label: "Pointer speed", area: "Mouse", fields: [
        // Every DPI field offers the one list in pointer-dpi.js. These two are
        // held in the upstream Charybdis config, which the keyboard only
        // accepts in its own steps, so they offer the part of the list the
        // keyboard accepts. A pointing mode's own speed is set on its slot.
        number("normalDpi", SETTING.DEFAULT_DPI, "Normal pointer DPI", undefined, {tooltip: "Trackball sensitivity for ordinary pointer movement. Higher DPI moves the cursor farther for the same ball movement.", unit: undefined, choices: dpiChoices({accepts: v => validSetting(SETTING.DEFAULT_DPI, v)})}),
        number("snipingDpi", SETTING.SNIPING_DPI, "Sniping DPI", undefined, {tooltip: "Trackball sensitivity while sniping is active, including auto-sniping. Lower DPI gives finer cursor control.", unit: undefined, choices: dpiChoices({accepts: v => validSetting(SETTING.SNIPING_DPI, v)})}),
    ]},
    {id: "sniping", label: "Auto-sniping", area: "Mouse", fields: [
        toggle("autoSniping", SETTING.AUTO_SNIPING_ENABLED, "Auto-sniping", "Use sniping speed while the selected layer is active."),
        layer("snipingLayer", SETTING.AUTO_SNIPING_LAYER, "Auto-sniping layer", "Use sniping DPI while this layer is active and Auto-sniping is on."),
    ]},
    {id: "autoMouse", label: "Auto-mouse", area: "Mouse", fields: [
        toggle("autoMouse", SETTING.AUTO_MOUSE_ENABLED, "Auto-mouse", "Trackball movement automatically activates the selected layer."),
        layer("pointerLayer", SETTING.AUTO_MOUSE_LAYER, "Pointer layer", "The layer that moving the trackball turns on when Auto-mouse is on."),
        number("mouseTimeout", SETTING.AUTO_MOUSE_TIMEOUT, "Timeout (ms)", "How long the layer stays active after movement. The lighting fade keeps its share of it (Lighting → Auto-mouse fade).", {min: 1}),
        number("mouseDebounce", SETTING.AUTO_MOUSE_DEBOUNCE, "Movement debounce (ms)", undefined, {tooltip: "Minimum time between trackball events that update auto-mouse. Higher values ignore closely spaced movement events."}),
        number("mouseDelay", SETTING.AUTO_MOUSE_DELAY, "Delay after typing (ms)", "Wait this long after a key event before movement can activate auto-mouse."),
        number("mouseThreshold", SETTING.AUTO_MOUSE_THRESHOLD, "Movement threshold", "Movement needed to activate auto-mouse. Higher values require more movement.", {unit: undefined}),
    ]},
    // The keyboard stores this as the milliseconds the auto-mouse colour holds
    // before it fades, and refuses a profile where that is not shorter than
    // the timeout. Edited as a share of the timeout, it cannot be: a share is
    // at most 99%, and a new timeout carries the share with it.
    {id: "automouseFade", label: "Auto-mouse fade", area: "Lighting", stage: "auto", fields: [
        share("mouseFadeHold", SETTING.AUTO_MOUSE_DEAD_TIME, SETTING.AUTO_MOUSE_TIMEOUT, "Hold before fading", "The share of the auto-mouse timeout the colour holds before it starts to fade, 0–99%."),
    ]},
    // QMK's master switch and idle timeout darken every LED, so Ark's stages
    // too (QMK skips its indicator hooks while the matrix is off): they are
    // the Lighting screen's own, above every stage.
    {id: "lightingPower", label: "All lighting", area: "Lighting", search: "rgb matrix enable on off idle timeout", fields: [
        {...toggle("lightingEnabled", SETTING.RGB_MODE, "All lighting", "Off, every LED stays dark: the background effect, layer colours and feedback."), tooltip: "QMK's RGB Matrix enable switch.", shift: 0},
        number("lightingTimeout", SETTING.RGB_TIMEOUT, "Idle timeout", "Time without activity before lighting turns off. 0 keeps lighting on. Maximum 24 hours.", {presentation: "duration"}),
    ]},
    // QMK's own RGB Matrix effect, which every stage paints over: its effect
    // and LED classes are added from what the keyboard reports. Its LED
    // classes limit the effect alone; the stages paint any LED.
    {id: "rgbAppearance", label: "Background effect", area: "Lighting", stage: "base", search: "base lighting base effect rgb matrix mode hsv", fields: [
        {...byte("hue", SETTING.RGB_COLOR, 0, "Hue"), tooltip: "The colour of the background effect, around the colour wheel."},
        byte("saturation", SETTING.RGB_COLOR, 8, "Saturation", "0 is white; 255 is fully saturated."),
        {...byte("brightness", SETTING.RGB_COLOR, 16, "Brightness", "Saved brightness, 0–255. The keyboard applies its hardware brightness limit."), tooltip: "Brightness of the background effect. Layer colours and feedback have their own brightness."},
        {...byte("effectSpeed", SETTING.RGB_MODE, 16, "Animation speed"), tooltip: "Speed of the background effect's animation. Effects without animation ignore this setting."},
    ]},
    {id: "lightingFeedback", label: "Key feedback flash", area: "Lighting", stage: "key", search: "lighting feedback blink", fields: [
        number("feedbackFlash", SETTING.FEEDBACK_PERIOD, "Flash interval (ms)", "Time for each on or off phase; a full blink takes twice this value.", {min: SETTING_FIELD.FEEDBACK_PERIOD.min, validate: "positive-int"}),
    ]},
];

// In the keyboard's bit order: an option's place here is its bit. `part` is
// what it changes, the heading it is listed under: modifier keys, other
// keys, or how typing works.
/** @type {[string, string, string, "Modifiers" | "Keys" | "Typing"][]} */
const optionLabels = [
    ["swapControlCaps", "Swap left Control and Caps Lock", "Exchange the actions of left Control and Caps Lock across all layers.", "Modifiers"],
    ["capsToControl", "Use Caps Lock as left Control", "Make Caps Lock send left Control instead; left Control keeps its own action.", "Modifiers"],
    ["swapLeftAltGui", "Swap left Alt and GUI", "Exchange the left Alt and GUI modifier actions across all layers.", "Modifiers"],
    ["swapRightAltGui", "Swap right Alt and GUI", "Exchange the right Alt and GUI modifier actions across all layers.", "Modifiers"],
    ["disableGui", "Disable GUI keys", "Prevent either GUI modifier from being sent. Other modifiers still work.", "Modifiers"],
    ["swapGraveEscape", "Swap backtick and Escape", "Exchange the backtick and Escape key actions across all layers.", "Keys"],
    ["swapBackslashBackspace", "Swap backslash and Backspace", "Exchange the backslash and Backspace key actions across all layers.", "Keys"],
    ["nkro", "Allow more than six simultaneous keys", "Use N-key rollover so the keyboard can report more than six ordinary keys held at once.", "Typing"],
    ["swapLeftControlGui", "Swap left Control and GUI", "Exchange the left Control and GUI modifier actions across all layers.", "Modifiers"],
    ["swapRightControlGui", "Swap right Control and GUI", "Exchange the right Control and GUI modifier actions across all layers.", "Modifiers"],
    ["oneshot", "One-shot modifiers and layers", "Allow one-shot modifier and layer keys to affect the next key after they are released.", "Typing"],
    ["swapEscapeCaps", "Swap Escape and Caps Lock", "Exchange the Escape and Caps Lock key actions across all layers.", "Keys"],
    ["autocorrect", "Autocorrect", "Enable the running firmware's autocorrection of recognized typing mistakes.", "Typing"],
];
// Which bits of its settings word a field owns: one flag, a shifted byte or
// nibble, or the whole word. Reading, writing and putting a field back to the
// keyboard's value all go through this.
/** @param {import("../../contracts/model.js").SettingBits} field */
function fieldMask(field) {
    if (field.bitMask) return field.bitMask >>> 0;
    if (field.shift === undefined) return 0xffffffff;
    return (((1 << (field.width || 8)) - 1) << field.shift) >>> 0;
}
// A stored duration as a whole percentage of the one it is a share of, and
// back. Below 100 whatever the rounding, so a share is always shorter.
/** @param {number} part @param {number} whole */
const shareOf = (part, whole) => whole ? Math.min(99, Math.round(part * 100 / whole)) : 0;
/** @param {number} percent @param {number} whole */
const shareAt = (percent, whole) => Math.min(whole - 1, Math.round(percent * whole / 100));
const SHARES = sections.flatMap(section => section.fields).filter(field => field.kind === "share");
// When a duration changes, every share of it is rescaled to the same exact
// ratio it had, so the ordering the keyboard insists on still holds. The
// duration's own field has a minimum of 1, so there is always room below it.
/** @param {number[]} values @param {readonly number[]} before */
function rescaleShares(values, before) {
    for (const field of SHARES) {
        const whole = values[field.of], previous = before[field.of];
        if (whole !== previous) values[field.id] = Math.min(whole - 1, Math.round(values[field.id] * whole / previous));
    }
}
/** @param {import("../../contracts/model.js").SettingBits & {id: number}} field @param {readonly number[]} values */
function settingValue(field, values) {
    const bits = (values[field.id] & fieldMask(field)) >>> 0;
    if (field.bitMask && field.kind !== "toggle") return bits;
    if (field.bitMask) return Number(Boolean(bits));
    return field.shift === undefined ? bits : bits >>> field.shift;
}
// The saved base lighting, read out of the two words that pack it by the same
// field layout the Background effect and All lighting sections edit.
const {RGB_MODE, RGB_COLOR} = SETTING;
const LIGHTING_FIELDS = {enabled: {id: RGB_MODE, shift: 0}, effect: {id: RGB_MODE, shift: 8}, speed: {id: RGB_MODE, shift: 16}, leds: {id: RGB_MODE, shift: 24},
    hue: {id: RGB_COLOR, shift: 0}, saturation: {id: RGB_COLOR, shift: 8}, brightness: {id: RGB_COLOR, shift: 16}};
/** @param {readonly number[]} values */
const baseLighting = values => Object.fromEntries(Object.entries(LIGHTING_FIELDS).map(([name, field]) => [name, settingValue(field, values)]));
// A field's value placed in its word, leaving every bit it does not own.
/** @param {import("../../contracts/model.js").SettingBits} field @param {number} word @param {number} number */
function withSetting(field, word, number) {
    const bits = field.bitMask ? (field.kind === "toggle" ? (number ? field.bitMask : 0) : number & field.bitMask) : field.shift === undefined ? number : number << field.shift;
    return ((word & ~fieldMask(field)) | (bits & fieldMask(field))) >>> 0;
}
/** @param {import("./types.js").SnapshotFacts} snapshot @param {import("../schema/types.js").SettingsDomain} settings */
function settingsSections(snapshot, settings) {
    const options = snapshot.options;
    const host = hostSettings(settings.values, snapshot.hostOs?.detected);
    /** @type {import("../../contracts/model.js").SettingsSection[]} */
    const result = sections.map(section => ({area: "Settings", ...section, fields: section.fields.map(field => ({...field}))}));
    const rgb = /** @type {import("../../contracts/model.js").SettingsSection} */ (result.find(section => section.id === "rgbAppearance"));
    const {effect: currentEffect, leds: currentFlags} = baseLighting(settings.values);
    // QMK names effects in American English; the app spells colour one way.
    const effects = options?.effects.map(effect => ({value: effect.id, label: effect.name.toLowerCase().replace(/_/g, " ").replace(/\bcolor\b/g, "colour").replace(/^./, c => c.toUpperCase())})) || [];
    if (!effects.some(effect => effect.value === currentEffect)) effects.push({value: currentEffect, label: `Current effect (${currentEffect})`});
    /** @type {[number, string][]} */
    const ledNames = [[1, "Modifiers"], [2, "Underlighting"], [4, "Keys"], [8, "Indicators"]];
    const flags = [{value: 255, label: "All LEDs"}, {value: 0, label: "No LEDs"}];
    if (options) for (let mask = 1; mask < 16; mask++) if (!(mask & ~options.ledFlags)) flags.push({value: mask, label: ledNames.filter(([bit]) => mask & bit).map(([, name]) => name).join(" + ")});
    if (!flags.some(choice => choice.value === currentFlags)) flags.push({value: currentFlags, label: "Current custom LED selection"});
    rgb.fields.splice(0, 0,
        {...byte("effectMode", SETTING.RGB_MODE, 8, "Effect"), choices: effects, readOnly: !options, hint: options ? "Effects available on this keyboard. Layer colours paint over it." : "Read the keyboard to see the lighting effects it has."},
        {...byte("effectLeds", SETTING.RGB_MODE, 24, "LEDs"), choices: flags, readOnly: !options, hint: options ? "Which LED classes the background effect lights. Layer colours and feedback can paint any LED." : "Read the keyboard to see its LED classes."});
    /** @param {number} i */
    const name = i => layerName(settings.names, i);
    /** @template T @param {(i: number) => T} make */
    const everyLayer = make => Array.from({length: SETTINGS.LAYERS}, (_, i) => make(i));
    // Each section's one-per-layer switches are one setting to a person: the
    // interface draws them as one row of layers, worded by `layerGroup`.
    result.push({id: "startupLayers", area: "Settings", label: "Default layers", search: "startup layers always on default_layer_state",
        layerGroup: {label: "Default layers", hint: "Always on underneath every other layer. Normally only Base. QMK calls these default layers."}, fields:
        everyLayer(i => ({...toggle(`startupLayer${i}`, SETTING.DEFAULT_LAYERS, name(i), `Layer ${i}`), tooltip: "Make this layer a default layer: always on underneath every other layer. Keep at least one on; a higher default layer covers a lower one.", bitMask: 2 ** i, keyboardKeys: true, governs: {kind: /** @type {const} */ ("layer"), layer: i}}))});
    // Behaviours and combos each have a master switch and one per layer
    // (participation-policy.md): a key takes part only where every switch that
    // applies is on, judged by the layer its key came from. Each behaviour and
    // combo has its own switch and layers in Keys, and each key position its
    // own in the key's editor.
    result.push({id: "behaviorSettings", area: "Settings", label: "Behaviours",
        layerGroup: {label: "On these layers", hint: "A key uses its behaviour only when the layer it comes from is on here. Off, it does what it would without one."}, fields:
        [toggle("behaviorsEnabled", SETTING.BEHAVIORS_ENABLED, "Enabled", "Turn every behaviour on or off. Off, each key does what it would without one: a plain key, or its own LT() or MT()."),
            ...everyLayer(i => ({...toggle(`behaviorsOnLayer${i}`, SETTING.LAYER_BEHAVIORS, `On ${name(i)}`, "Keys that come from this layer use their behaviours."), bitMask: 2 ** i, governs: {kind: /** @type {const} */ ("layer"), layer: i}}))]});
    // Combos get a section of their own beside their layer matching. The
    // Interface adds the default window and hold threshold to it, which
    // the keyboard stores with the combos rather than here.
    result.push({id: "comboSettings", comboTiming: COMBO_TIMING, area: "Settings", label: "Combos",
        layerGroup: {label: "On these layers", hint: "A key can be part of a combo only when the layer it comes from is on here."}, fields:
        [{...toggle("combosEnabled", SETTING.COMBOS_ENABLED, "Enabled", "Turn every combo on or off. Each combo's own window and conditions are set in Keys · Combos."), keyboardKeys: true},
            {macro: "comboOutputBehaviors", header: "comboOutputBehaviors", kind: "toggle", label: "Combo outputs use behaviours",
                hint: "Off, combos still fire but use their normal output action. A key pressed on its own still uses its behaviour where its participation allows. A bypassed custom key sends its shortcut, or nothing if it has none."},
            ...everyLayer(i => ({...toggle(`combosOnLayer${i}`, SETTING.LAYER_COMBOS, `On ${name(i)}`, "Keys that come from this layer can join combos."), bitMask: 2 ** i, governs: {kind: /** @type {const} */ ("layer"), layer: i}}))]});
    // A layer's combo reference is in its layer record, not a setting value.
    result.push({id: "comboReferences", area: "Settings", label: "Combo layer matching", search: "combo reference", description: "Choose which layer supplies the key assignments used to match combos on each layer. Select the same layer to keep its combos independent.", fields:
        everyLayer(i => ({...layer(`comboReference${i}`, undefined, `Combos on ${name(i)}`, "The layer whose key assignments are used to match combos on this layer. Choose the same layer to keep its combos independent."), record: /** @type {const} */ ("reference"), layer: i, governs: {kind: /** @type {const} */ ("layer"), layer: i}}))});
    result.push({id: "keyboardOptions", area: "Settings", label: "Key swaps & typing", search: "key options magic keymap options keyboard options", description: options ? "Keyboard-wide swaps and typing options. These apply across all layers." : "Read the keyboard to see the key options it supports.", fields:
        options ? optionLabels.map(([macro, label, hint, part], i) => ({...toggle(macro, SETTING.KEYMAP_OPTIONS, hostKeyLabel(label, host.effective)), tooltip: hostKeyLabel(hint, host.effective), part, bitMask: options.keymapMasks[i], keyboardKeys: true, readOnly: !(options.supportedKeymapOptions & (1 << i)), notBuilt: !(options.supportedKeymapOptions & (1 << i)), hint: options.supportedKeymapOptions & (1 << i) ? "" : "Not in this firmware (does nothing)."})) : []});
    /** @param {number} id */
    const label = id => VOCABULARY.hostOs.find(([value]) => value === id)?.[1] || "Unknown";
    const macos = host.effective === 1;
    const setup = ["Choose the operating system yourself if detection is unknown.",
        "For emoji and other characters your layout cannot type, choose the Unicode Hex Input layout and make it your active input source.",
        "Install and run WinCompose with Right Alt as Compose.", "Use an input method/application accepting Ctrl+Shift+U, hex digits and Space. Some Linux applications do not support it."][host.effective];
    // The effective OS's layouts first, then US; with no known OS, all of them.
    const osName = [null, "macos", "windows", "linux"][host.effective];
    const offered = hostLayouts().filter(layout => !osName || layout.os === "any" || layout.os === osName || layout.id === host.layout);
    /** @param {number} id */
    const layoutWord = id => VOCABULARY.hostLayouts.find(([value]) => value === id)?.[1];
    result.push({id: "host", area: "Settings", label: "Your computer", search: "host os unicode UNICODE_HOST_MODE",
        ...(host.effective === 2 && host.unicodeEnabled
            ? {githubLink: {label: "WinCompose on GitHub", url: "https://github.com/samhocevar/wincompose"}} : {}),
        // Auto can follow detection onto another OS than the layout's; a
        // operating system chosen here carries the layout along (followHostOs).
        ...(!host.layoutFits
            ? {warning: `${layoutWord(host.layout)} is not a ${label(host.effective)} layout, so macros may type the wrong characters on ${label(host.effective)}. Choose a ${label(host.effective)} layout, or set Operating system to the one your computer runs.`}
            : macos && host.unicodeMode
            ? {warning: "While Unicode Hex Input is active on your Mac, Option-based symbols and shortcuts may stop working, including Option+Left/Right for word navigation. This affects ordinary typing and key-step shortcuts too. Ark does not switch your Mac's input source; switch back to your usual source when you need those keys, and match the layout here before playing macros."} : {}),
        description: `Detected: ${host.detected ? label(host.detected) : "Unknown"}. Effective: ${host.effective ? label(host.effective) : "Unknown"}. Detection is a best guess; override it if incorrect. ${setup} The keyboard cannot confirm your input setup.`, fields: [
        {...number("hostOs", SETTING.UNICODE_HOST_MODE, "Operating system", "Auto uses the keyboard’s USB detection. This controls display names, the layouts offered and Unicode entry; it does not swap keys.", {max: 3, unit: undefined}), bitMask: 3, kind: "number",
            choices: VOCABULARY.hostOs.map(([value, label]) => ({value, label}))},
        {...byte("hostLayout", SETTING.UNICODE_HOST_MODE, LAYOUT_SHIFT, "Keyboard layout"), kind: "number",
            hint: "The layout your computer types with. Macros type through it, accents included; pick the one that is active on the computer.",
            choices: offered.map(layout => ({value: layout.id, label: layoutWord(layout.id)}))},
        ...(macos || host.macosIso ? [{...toggle("macosIso", SETTING.UNICODE_HOST_MODE, "ISO keyboard on macOS", "Turn on if macOS set this keyboard up as ISO (Keyboard Setup Assistant). macOS then swaps the keys left of 1 and left of Z, so macros must too."), bitMask: MACOS_ISO}] : []),
        // On macOS, Unicode entry is the Unicode Hex Input layout, not a switch.
        ...(macos && !host.unicodeEnabled ? [] : [{...toggle("unicodeEnabled", SETTING.UNICODE_HOST_MODE, "Unicode playback", macos
            ? "On macOS, choose the Unicode Hex Input layout instead; this switch only applies with US."
            : `${setup} Turn on only after setting up your computer. Avoid typing during playback.`), bitMask: UNICODE_ENABLED}]),
    ]});
    return result;
}

// Capabilities decide which Host fields can be edited; Review and revert read
// values without them.
/** @param {import("./types.js").ProfileSnapshot | null | undefined} snapshot */
function settingsEditorView(snapshot) {
    if (!snapshot?.document || snapshot.incomplete) return null;
    const {settings} = decodedOf(snapshot);
    return {identity: snapshot.fingerprint,
        brightnessMax: snapshot.limits?.brightnessMax,
        sections: settingsSections(snapshot, settings).map(section => ({...section, fields: section.fields.map(field => {
            const value = field.header ? Number(settings[field.header] !== false) : field.record ? settings.layers[field.layer][field.record] : settingValue(field, settings.values);
            if (field.kind === "share") return {...field, value: String(shareOf(value, settings.values[field.of])),
                ms: String(value), whole: String(settings.values[field.of])};
            const brightness = field.macro === "brightness";
            const max = brightness ? snapshot.limits?.brightnessMax : field.max;
            return {...field, max, readOnly: field.readOnly || (brightness && max === undefined),
                hint: brightness ? (max === undefined ? "Read the keyboard to learn its brightness limit before editing brightness." : `0–${max}, the brightness limit reported by this keyboard.`) : field.hint,
                value: field.kind === "layer" ? `Layer ${value}` : String(value), enabled: Boolean(value)};
        })})),
        host: hostSettings(settings.values, snapshot.hostOs?.detected),
        timing: Object.fromEntries(keyTiming.fields.map(field => [field.macro, String(settings.values[field.id])]))};
}

/** @param {import("./types.js").CompleteSnapshot} snapshot @param {import("../../contracts/edits.js").EditOf<"updateConfigDefaults">} message @param {import("./types.js").ProfileDestination} [capabilities] */
function editSettings(snapshot, message, capabilities) {
    if (!snapshot?.document || !message.expectedFingerprint || message.expectedFingerprint !== snapshot.fingerprint) throw fail("The keyboard changed since these settings were opened. Read the keyboard and review your changes before saving again.");
    const value = validateSnapshot(snapshot.document, capabilities);
    const section = settingsSections(snapshot, value.settings).find(section => section.id === message.sectionId);
    if (!section || !Array.isArray(message.fields) || message.fields.length !== section.fields.length) throw fail("Choose a complete settings section reported by the keyboard.");
    const seen = new Set(), before = value.settings.values.slice();
    for (const input of message.fields) {
        const field = section.fields.find(field => field.macro === input?.macro);
        if (!field || seen.has(input.macro)) throw fail("Unknown or repeated settings field.");
        seen.add(input.macro);
        /** @type {number} */
        let number;
        if (field.kind === "toggle") {
            if (typeof input.enabled !== "boolean") throw fail(`${field.label} must be enabled or disabled.`);
            number = Number(input.enabled);
        } else {
            const text = field.kind === "layer" ? (layer => layer !== undefined && layer < SETTINGS.LAYERS ? String(layer) : undefined)(layerOfRef(input.value)) : input.value;
            if (typeof text !== "string" || !/^\d+$/.test(text)) throw fail(`${field.label} needs a whole number${field.kind === "layer" ? " identifying a layer" : ""}.`);
            number = Number(text);
            if (field.macro === "brightness" && number !== baseLighting(value.settings.values).brightness) {
                if (snapshot.limits?.brightnessMax === undefined) throw fail("Read the keyboard's brightness limit before changing brightness.");
                if (number > snapshot.limits.brightnessMax) throw fail(`Brightness must be between 0 and ${snapshot.limits.brightnessMax}, the keyboard's reported limit.`);
            }
            if ((field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max) || (field.choices && !field.choices.some(choice => (typeof choice === "object" ? choice.value : choice) === number))) throw fail(`${field.label} is outside the keyboard's supported range${field.hint ? ": " + field.hint : "."}`);
        }
        // A share that still reads as what was shown keeps its exact stored
        // milliseconds, so saving an unchanged section changes nothing.
        if (field.kind === "share") {
            const whole = value.settings.values[field.of], stored = value.settings.values[field.id];
            if (number !== shareOf(stored, whole)) value.settings.values[field.id] = shareAt(number, whole);
            continue;
        }
        if (field.header) {
            const previous = Number(value.settings[field.header] !== false);
            if (field.readOnly && number !== previous) throw fail(`${field.label} cannot be changed with this firmware. ${field.hint || ""}`);
            value.settings[field.header] = Boolean(number);
            continue;
        }
        if (field.record) {
            value.settings.layers[field.layer] = {...value.settings.layers[field.layer], [field.record]: number};
            continue;
        }
        const previous = settingValue(field, value.settings.values);
        if (field.readOnly && number !== previous) throw fail(`${field.label} cannot be changed with this firmware. ${field.hint || ""}`);
        if (field.macro === "effectMode" && number !== previous && !snapshot.options?.effects.some(effect => effect.id === number)) throw fail("Choose an effect reported by this keyboard.");
        value.settings.values[field.id] = withSetting(field, value.settings.values[field.id], number);
    }
    rescaleShares(value.settings.values, before);
    if (section.id === "host") followHostOs(value.settings.values, before, snapshot.hostOs?.detected);
    if (!value.settings.values[SETTING.DEFAULT_LAYERS]) throw fail("Keep at least one default layer on.");
    if (!value.settings.values.every((number, id) => validSetting(id, number))) throw fail("A setting is outside the keyboard's supported range.");
    // A timing displayed as default follows that default, including an older
    // profile's explicit value equal to it. Adopt inheritance only for changed
    // defaults; unrelated settings edits never rewrite behaviour rows.
    let behaviorsChanged = false;
    for (const row of value.behaviors.rows) {
        const old = effectiveTimings({...row, tapHoldTerm: 0, longHoldTerm: 0, multiTapTerm: 0}, before);
        const next = effectiveTimings({...row, tapHoldTerm: 0, longHoldTerm: 0, multiTapTerm: 0}, value.settings.values);
        for (const [field, term] of /** @type {const} */ ([["tapHoldTerm", "hold"], ["longHoldTerm", "long"], ["multiTapTerm", "repeat"]])) {
            if (old[term] !== next[term] && row[field] !== 0 && row[field] === old[term]) {
                row[field] = 0;
                behaviorsChanged = true;
            }
        }
    }
    let profile = replaceDomain(value.profile, PROFILE_DOMAIN_IDS.SETTINGS, () => encodeSettings(value.settings));
    if (behaviorsChanged) profile = replaceDomain(profile, PROFILE_DOMAIN_IDS.KEY_BEHAVIORS, () => encodeKeyBehaviorDomain(value.behaviors, value.codecOptions.behaviors));
    const document = {...value.document, profile: profile.toString("base64")};
    validateSnapshot(document, capabilities);
    return document;
}

module.exports = {settingsEditorView, editSettings, fieldMask, baseLighting};
