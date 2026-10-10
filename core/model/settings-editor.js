"use strict";

const {layerOfRef} = require("../schema/actions");
const {effectiveTimings} = require("./gesture-timing");
const {encodeKeyBehaviorDomain} = require("../schema/key-behavior-domain-v1");
const {validateSnapshot, decodedOf} = require("./portable-profile");
const {decodeProfileBlob, encodeProfileBlob} = require("../schema/profile-blob-v1");
const {SETTING, SETTINGS, encodeSettings, validSetting} = require("../schema/settings-domain-v1");
const {hostSettings, UNICODE_ENABLED} = require("../schema/host-settings");
const {supportsUnicodeMacros} = require("../schema/macro-payload");
const {dpiChoices} = require("./pointer-dpi");
const {hostKeyLabel} = require("./key-names");
const {layerName, VOCABULARY} = require("./vocabulary");
const fail = message => Object.assign(new Error(message), {code: "INVALID_SETTINGS_EDIT"});
const number = (macro, id, label, hint = "0–65535 ms", extra = {}) => ({macro, id, label, hint, kind: "number", validate: "nonnegative-int", ...extra});
const toggle = (macro, id, label, hint) => ({macro, id, label, hint, kind: "toggle"});
const layer = (macro, id, label) => ({macro, id, label, kind: "layer", validate: "layer"});
const byte = (macro, id, shift, label, hint) => number(macro, id, label, hint || "0–255", {shift, max: 255, validate: "uint8"});
// A duration the keyboard stores in milliseconds but that only means anything
// as a share of another one, `of`: it is edited as a whole percentage of that
// one, and keeps its share when that one changes (see `rescaleShares`).
const share = (macro, id, of, label, hint) => ({macro, id, of, label, hint, kind: "share", max: 99, validate: "percent"});

// These are editor definitions, not configuration defaults. Every value below
// is supplied by the complete device snapshot; absent readback stays absent.
//
// `area` is the rail screen a section is edited on, and the review area it is
// listed under; a section without one is a Settings section. Everything the
// trackball does to the pointer — its speed, sniping, auto-mouse — is Mouse.
//
// `governs` names what a setting is about when that thing has a colour of its
// own elsewhere — a behaviour tier, a tap-count branch, a pointing slot, a
// layer — so every surface that shows the setting can mark it the same way.
const sections = [
    {id: "keyTiming", label: "Tap & Hold Timing", fields: [
        number("tappingTerm", 0, "Dual-role tap / hold threshold", "How long LT(), MT(), TT(), OSL() and OSM() keys wait before a press counts as a hold (QMK's tapping term). LT() behaviours with an empty Tap / hold threshold use it too; other behaviours use the Behaviour tap / hold threshold."),
        number("tapHoldTerm", 1, "Behaviour tap / hold threshold", "Used when a behaviour leaves its Tap / hold threshold empty.", {governs: {kind: "tier", tier: "hold"}}),
        number("longerHoldTerm", 2, "Long hold threshold", "Used when a behaviour leaves its Long hold threshold empty.", {governs: {kind: "tier", tier: "long"}}),
        number("multiTapTerm", 3, "Repeated taps", "Maximum gap between repeated taps when a behaviour has no override.", {governs: {kind: "branch", count: 2}}),
    ]},
    {id: "normalPointerSpeed", label: "Pointer Speed", area: "Mouse", fields: [
        // Every DPI field offers the one list in pointer-dpi.js. These two are
        // held in the upstream Charybdis config, which the keyboard only
        // accepts in its own steps, so they offer the part of the list the
        // keyboard accepts. A pointing mode's own speed is set on its slot.
        number("normalDpi", 18, "Normal pointer DPI", "400–3400, in steps of 200: the steps this firmware stores.", {choices: dpiChoices({accepts: v => validSetting(18, v)})}),
        number("snipingDpi", 19, "Sniping DPI", "100–400: the steps this firmware stores. Lower DPI gives finer pointer control.", {choices: dpiChoices({accepts: v => validSetting(19, v)})}),
    ]},
    {id: "sniping", label: "Auto-sniping", area: "Mouse", fields: [
        toggle("autoSniping", 8, "Auto-sniping", "Use sniping speed while the selected layer is active."),
        layer("snipingLayer", 9, "Auto-sniping layer"),
    ]},
    {id: "autoMouse", label: "Auto-mouse", area: "Mouse", fields: [
        toggle("autoMouse", 4, "Auto-mouse", "Trackball movement automatically activates the selected layer."),
        layer("mouseLayer", 5, "Auto-mouse layer"),
        number("mouseTimeout", 6, "Timeout (ms)", "How long the layer stays active after movement. The lighting fade keeps its share of it (Lighting → Auto-mouse fade).", {min: 1}),
        number("mouseDebounce", 7, "Movement debounce (ms)", "0–255 ms", {max: 255}),
        number("mouseDelay", 25, "Delay after typing (ms)", "Wait this long after a key event before movement can activate auto-mouse."),
        number("mouseThreshold", 26, "Movement threshold", "Movement needed to activate auto-mouse. Higher values require more movement."),
    ]},
    // The keyboard stores this as the milliseconds the auto-mouse colour holds
    // before it fades, and refuses a profile where that is not shorter than
    // the timeout. Edited as a share of the timeout, it cannot be: a share is
    // at most 99%, and a new timeout carries the share with it.
    {id: "automouseFade", label: "Auto-mouse fade", area: "Lighting", stage: "auto", fields: [
        share("mouseFadeHold", 16, 6, "Hold before fading", "The share of the auto-mouse timeout the colour holds before it starts to fade, 0–99%."),
    ]},
    {id: "rgbAppearance", label: "Base Lighting", fields: [
        {...toggle("lightingEnabled", 21, "Lighting", "Enable the saved base lighting effect."), shift: 0},
        byte("hue", 22, 0, "Hue"),
        byte("saturation", 22, 8, "Saturation", "0 is white; 255 is fully saturated."),
        byte("brightness", 22, 16, "Brightness", "Saved brightness, 0–255. The keyboard applies its hardware brightness limit."),
        byte("effectSpeed", 21, 16, "Animation speed"),
        number("lightingTimeout", 17, "Idle timeout (ms)", "0 keeps lighting on. Maximum 86400000 ms (one day).", {max: 86400000}),
    ]},
    {id: "lightingFeedback", label: "Lighting Feedback", fields: [
        number("feedbackFlash", 15, "Key feedback flash interval (ms)", "Time for each on or off phase; a full blink takes twice this value.", {min: 1, validate: "positive-int"}),
    ]},
];

const optionLabels = [
    ["swapControlCaps", "Swap Left Control and Caps Lock"],
    ["capsToControl", "Use Caps Lock as Left Control"],
    ["swapLeftAltGui", "Swap left Alt and GUI"],
    ["swapRightAltGui", "Swap right Alt and GUI"],
    ["disableGui", "Disable GUI keys"],
    ["swapGraveEscape", "Swap backtick and Escape"],
    ["swapBackslashBackspace", "Swap backslash and Backspace"],
    ["nkro", "Allow more than six simultaneous keys"],
    ["swapLeftControlGui", "Swap left Control and GUI"],
    ["swapRightControlGui", "Swap right Control and GUI"],
    ["oneshot", "One-shot modifiers and layers"],
    ["swapEscapeCaps", "Swap Escape and Caps Lock"],
    ["autocorrect", "Autocorrect"],
];
// Which bits of its settings word a field owns: one flag, a shifted byte or
// nibble, or the whole word. Reading, writing and putting a field back to the
// keyboard's value all go through this.
function fieldMask(field) {
    if (field.bitMask) return field.bitMask >>> 0;
    if (field.shift === undefined) return 0xffffffff;
    return (((1 << (field.width || 8)) - 1) << field.shift) >>> 0;
}
// A stored duration as a whole percentage of the one it is a share of, and
// back. Below 100 whatever the rounding, so a share is always shorter.
const shareOf = (part, whole) => whole ? Math.min(99, Math.round(part * 100 / whole)) : 0;
const shareAt = (percent, whole) => Math.min(whole - 1, Math.round(percent * whole / 100));
const SHARES = sections.flatMap(section => section.fields).filter(field => field.kind === "share");
// When a duration changes, every share of it is rescaled to the same exact
// ratio it had, so the ordering the keyboard insists on still holds. The
// duration's own field has a minimum of 1, so there is always room below it.
function rescaleShares(values, before) {
    for (const field of SHARES) {
        const whole = values[field.of], previous = before[field.of];
        if (whole !== previous) values[field.id] = Math.min(whole - 1, Math.round(values[field.id] * whole / previous));
    }
}
function settingValue(field, values) {
    const bits = (values[field.id] & fieldMask(field)) >>> 0;
    if (field.bitMask && field.kind !== "toggle") return bits;
    if (field.bitMask) return Number(Boolean(bits));
    return field.shift === undefined ? bits : bits >>> field.shift;
}
// The saved base lighting, read out of the two words that pack it by the same
// field layout the Base Lighting section edits.
const LIGHTING_FIELDS = {enabled: {id: 21, shift: 0}, effect: {id: 21, shift: 8}, speed: {id: 21, shift: 16}, leds: {id: 21, shift: 24},
    hue: {id: 22, shift: 0}, saturation: {id: 22, shift: 8}, brightness: {id: 22, shift: 16}};
const baseLighting = values => Object.fromEntries(Object.entries(LIGHTING_FIELDS).map(([name, field]) => [name, settingValue(field, values)]));
// A field's value placed in its word, leaving every bit it does not own.
function withSetting(field, word, number) {
    const bits = field.bitMask ? (field.kind === "toggle" ? (number ? field.bitMask : 0) : number & field.bitMask) : field.shift === undefined ? number : number << field.shift;
    return ((word & ~fieldMask(field)) | (bits & fieldMask(field))) >>> 0;
}
function settingsSections(snapshot, settings, capabilities) {
    const options = snapshot.options;
    const host = hostSettings(settings.values, snapshot.hostOs?.detected);
    const result = sections.map(section => ({area: "Settings", ...section, fields: section.fields.map(field => ({...field}))}));
    const rgb = result.find(section => section.id === "rgbAppearance");
    const {effect: currentEffect, leds: currentFlags} = baseLighting(settings.values);
    const effects = options?.effects.map(effect => ({value: effect.id, label: effect.name.toLowerCase().replace(/_/g, " ").replace(/^./, c => c.toUpperCase())})) || [];
    if (!effects.some(effect => effect.value === currentEffect)) effects.push({value: currentEffect, label: `Current effect (${currentEffect})`});
    const ledNames = [[1, "Modifiers"], [2, "Underlighting"], [4, "Keys"], [8, "Indicators"]];
    const flags = [{value: 255, label: "All LEDs"}, {value: 0, label: "No LEDs"}];
    if (options) for (let mask = 1; mask < 16; mask++) if (!(mask & ~options.ledFlags)) flags.push({value: mask, label: ledNames.filter(([bit]) => mask & bit).map(([, name]) => name).join(" + ")});
    if (!flags.some(choice => choice.value === currentFlags)) flags.push({value: currentFlags, label: "Current custom LED selection"});
    rgb.fields.splice(1, 0,
        {...byte("effectMode", 21, 8, "Lighting effect"), choices: effects, readOnly: !options, hint: options ? "Effects available on this keyboard. Layer colours can override the base effect." : "Update both halves to report the available lighting effects."},
        {...byte("effectLeds", 21, 24, "Apply base effect to"), choices: flags, readOnly: !options, hint: options ? "Choose which LED classes receive the base effect. Layer colours and feedback have their own policies." : "Update both halves to report the LED classes."});
    const name = i => layerName(settings.names, i);
    const everyLayer = make => Array.from({length: SETTINGS.LAYERS}, (_, i) => make(i));
    result.push({id: "startupLayers", area: "Settings", label: "Startup Layers", expanded: false, description: "Choose the layers active when the keyboard starts. Keep at least one selected; higher layers take priority.", fields:
        everyLayer(i => ({...toggle(`startupLayer${i}`, SETTING.DEFAULT_LAYERS, name(i), `Layer ${i}`), bitMask: 2 ** i, governs: {kind: "layer", layer: i}}))});
    // Behaviours and combos each have a master switch and one per layer
    // (participation-policy.md): a key takes part only where every switch that
    // applies is on, judged by the layer its key came from. Each behaviour and
    // combo has its own switch and layers in Keys, and each key position its
    // own in the key's editor.
    result.push({id: "behaviorSettings", area: "Settings", label: "Behaviours", fields:
        [toggle("behaviorsEnabled", SETTING.BEHAVIORS_ENABLED, "Enabled", "Turn every behaviour on or off. Off, each key does what it would without one: a plain key, or its own LT() or MT()."),
            ...everyLayer(i => ({...toggle(`behaviorsOnLayer${i}`, SETTING.LAYER_BEHAVIORS, `On ${name(i)}`, "Keys that come from this layer use their behaviours."), bitMask: 2 ** i, governs: {kind: "layer", layer: i}}))]});
    // Combos get a section of their own beside their layer matching. The
    // Settings screen adds the default window and hold threshold to it, which
    // the keyboard stores with the combos rather than here.
    result.push({id: "comboSettings", area: "Settings", label: "Combos", fields:
        [toggle("combosEnabled", SETTING.COMBOS_ENABLED, "Enabled", "Turn every combo on or off. Each combo's own window and conditions are set in Keys · Combos."),
            ...everyLayer(i => ({...toggle(`combosOnLayer${i}`, SETTING.LAYER_COMBOS, `On ${name(i)}`, "Keys that come from this layer can join combos."), bitMask: 2 ** i, governs: {kind: "layer", layer: i}}))]});
    // A layer's combo reference is in its layer record, not a setting value.
    result.push({id: "comboReferences", area: "Settings", label: "Combo Layer Matching", expanded: false, description: "Choose which layer supplies the key assignments used to match combos on each layer. Select the same layer to keep its combos independent.", fields:
        everyLayer(i => ({...layer(`comboReference${i}`, undefined, `Combos on ${name(i)}`), record: "reference", layer: i, governs: {kind: "layer", layer: i}}))});
    result.push({id: "keyboardOptions", area: "Settings", label: "Key Options", expanded: false, description: options ? "Keyboard-wide remapping and typing options. These apply across all layers." : "Update both halves to report their supported key options.", fields:
        options ? optionLabels.map(([macro, label], i) => ({...toggle(macro, 24, hostKeyLabel(label, host.effective)), bitMask: options.keymapMasks[i], readOnly: !(options.supportedKeymapOptions & (1 << i)), hint: options.supportedKeymapOptions & (1 << i) ? "" : "This option is not enabled in the running firmware."})) : []});
    const label = id => VOCABULARY.hostOs.find(([value]) => value === id)?.[1] || "Unknown";
    const available = Boolean(snapshot.hostOs) || supportsUnicodeMacros(capabilities);
    const setup = ["Select a host OS manually if detection is unknown.", "Enable Unicode Hex Input in macOS and keep it active during playback.", "Install and run WinCompose with Right Alt as Compose.", "Use an input method/application accepting Ctrl+Shift+U, hex digits and Space. Some Linux applications do not support it."][host.effective];
    result.push({id: "host", area: "Settings", label: "Host", description: available
        ? `Detected: ${host.detected ? label(host.detected) : "Unknown"}. Effective: ${host.effective ? label(host.effective) : "Unknown"}. Detection is a best guess; override it if incorrect. ${setup} The keyboard cannot confirm your input setup.`
        : "Update both halves to report their host OS and support these settings.", fields: [
        {...number("hostOs", SETTING.UNICODE_HOST_MODE, "Host OS", "Auto uses the keyboard’s USB detection. This controls display names and Unicode entry; it does not swap keys.", {max: 3}), bitMask: 3, kind: "number", readOnly: !available,
            choices: VOCABULARY.hostOs.map(([value, label]) => ({value, label}))},
        {...toggle("unicodeEnabled", SETTING.UNICODE_HOST_MODE, "Unicode playback", `${setup} Enable only after configuring the host. Avoid typing during playback.`), bitMask: UNICODE_ENABLED, readOnly: !available},
    ]});
    return result;
}

function settingsEditorView(snapshot) {
    if (!snapshot?.document || snapshot.incomplete) return null;
    const {settings} = decodedOf(snapshot);
    return {identity: snapshot.fingerprint,
        brightnessMax: snapshot.limits?.brightnessMax,
        sections: settingsSections(snapshot, settings).map(section => ({...section, fields: section.fields.map(field => {
            const value = field.record ? settings.layers[field.layer][field.record] : settingValue(field, settings.values);
            if (field.kind === "share") return {...field, value: String(shareOf(value, settings.values[field.of])),
                ms: String(value), whole: String(settings.values[field.of])};
            const brightness = field.macro === "brightness";
            const max = brightness ? snapshot.limits?.brightnessMax : field.max;
            return {...field, max, readOnly: field.readOnly || (brightness && max === undefined),
                hint: brightness ? (max === undefined ? "Update both halves to report their brightness limit before editing brightness." : `0–${max}, the brightness limit reported by this keyboard.`) : field.hint,
                value: field.kind === "layer" ? `Layer ${value}` : String(value), enabled: Boolean(value)};
        })})),
        host: {...hostSettings(settings.values, snapshot.hostOs?.detected), supported: Boolean(snapshot.hostOs)},
        timing: Object.fromEntries(["tappingTerm", "tapHoldTerm", "longerHoldTerm", "multiTapTerm"].map((key, id) => [key, String(settings.values[id])]))};
}

function editSettings(snapshot, message, capabilities) {
    if (!snapshot?.document || !message.expectedFingerprint || message.expectedFingerprint !== snapshot.fingerprint) throw fail("The keyboard changed since these settings were opened. Read the keyboard and review your changes before saving again.");
    const value = validateSnapshot(snapshot.document, capabilities);
    const section = settingsSections(snapshot, value.settings, capabilities).find(section => section.id === message.sectionId);
    if (!section || !Array.isArray(message.fields) || message.fields.length !== section.fields.length) throw fail("Choose a complete settings section reported by the keyboard.");
    const seen = new Set(), before = value.settings.values.slice();
    for (const input of message.fields) {
        const field = section.fields.find(field => field.macro === input?.macro);
        if (!field || seen.has(input.macro)) throw fail("Unknown or repeated settings field.");
        seen.add(input.macro);
        let number;
        if (field.kind === "toggle") {
            if (typeof input.enabled !== "boolean") throw fail(`${field.label} must be enabled or disabled.`);
            number = Number(input.enabled);
        } else {
            const text = field.kind === "layer" ? (layer => layer < SETTINGS.LAYERS ? String(layer) : undefined)(layerOfRef(input.value)) : input.value;
            if (typeof text !== "string" || !/^\d+$/.test(text)) throw fail(`${field.label} needs a whole number${field.kind === "layer" ? " identifying a layer" : ""}.`);
            number = Number(text);
            if (field.macro === "brightness" && number !== baseLighting(value.settings.values).brightness) {
                if (snapshot.limits?.brightnessMax === undefined) throw fail("Read the keyboard's brightness limit before changing brightness. Update both halves if this field is unavailable.");
                if (number > snapshot.limits.brightnessMax) throw fail(`Brightness must be between 0 and ${snapshot.limits.brightnessMax}, the keyboard's reported limit.`);
            }
            if (number < (field.min ?? 0) || number > (field.max ?? 65535) || (field.choices && !field.choices.some(choice => (typeof choice === "object" ? choice.value : choice) === number))) throw fail(`${field.label} is outside the keyboard's supported range${field.hint ? ": " + field.hint : "."}`);
        }
        // A share that still reads as what was shown keeps its exact stored
        // milliseconds, so saving an unchanged section changes nothing.
        if (field.kind === "share") {
            const whole = value.settings.values[field.of], stored = value.settings.values[field.id];
            if (number !== shareOf(stored, whole)) value.settings.values[field.id] = shareAt(number, whole);
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
    if (!value.settings.values[23]) throw fail("Keep at least one startup layer selected.");
    if (!value.settings.values.every((number, id) => validSetting(id, number))) throw fail("A setting is outside the keyboard's supported range.");
    // A timing displayed as default follows that default, including an older
    // profile's explicit value equal to it. Adopt inheritance only for changed
    // defaults; unrelated settings edits never rewrite behaviour rows.
    let behaviorsChanged = false;
    for (const row of value.behaviors.rows) {
        const old = effectiveTimings({...row, tapHoldTerm: 0, longerHoldTerm: 0, multiTapTerm: 0}, before);
        const next = effectiveTimings({...row, tapHoldTerm: 0, longerHoldTerm: 0, multiTapTerm: 0}, value.settings.values);
        for (const [field, term] of [["tapHoldTerm", "hold"], ["longerHoldTerm", "long"], ["multiTapTerm", "repeat"]]) {
            if (old[term] !== next[term] && row[field] !== 0 && row[field] === old[term]) {
                row[field] = 0;
                behaviorsChanged = true;
            }
        }
    }
    const domains = decodeProfileBlob(value.profile).domains.map(domain => domain.id === 0x40 ? {...domain, payload: encodeSettings(value.settings)}
        : domain.id === 0x20 && behaviorsChanged ? {...domain, payload: encodeKeyBehaviorDomain(value.behaviors, value.codecOptions.behaviors)} : domain);
    const document = {...value.document, profile: encodeProfileBlob({domains}).toString("base64")};
    validateSnapshot(document, capabilities);
    return document;
}

module.exports = {settingsEditorView, editSettings, fieldMask, baseLighting};
