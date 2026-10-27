// @ts-check
// What this firmware was built with, as the Keyboard screen states it beside
// the memory those numbers bound.
// Pure: it reads the published model and returns words.

/** @typedef {import("../../contracts/panel.js").PublishedModel} Model */

const BUILD = "Needs a firmware build to change.";

// What this firmware was built with, read-only: each fact the keyboard
// reports (model.firmware) or that the screens already show, and that QMK's
// tap-hold options apply to no key.
/** @param {Model | null | undefined} model @returns {{label: string, value: string, hint: string}[]} */
export function firmwareFacts(model) {
    const firmware = model?.firmware;
    /** @type {{label: string, value: string, hint: string}[]} */
    const facts = [];
    /** @param {string} label @param {number | null | undefined} value @param {string} words @param {string} hint */
    const add = (label, value, words, hint) => { if (Number.isInteger(value)) facts.push({label, value: `${value} ${words}`, hint: `${hint} ${BUILD}`}); };
    add("Layers", firmware?.layers ?? (model?.layers?.length || null), "layers", "Every layer the keymap has, used or empty.");
    add("Tap counts", firmware?.tapCounts ?? model?.behaviorEditing?.maxTapStepsPerBehavior, "per behaviour", "How many taps a behaviour can tell apart; more quick taps each send the first tap.");
    add("Macros", firmware?.macros ?? (model?.macros?.length || null), "macros", "Macro slots in the shared profile storage.");
    add("Custom keys", firmware?.customKeys, "custom keys", "Custom key slots.");
    add("Pointing modes", model?.pdModes?.length || null, "modes", "Pointing slots.");
    add("Combos", firmware?.combos, "combos", "The most combos the profile can hold.");
    add("LEDs", firmware?.leds, "LEDs", "Lights on both halves together.");
    const brightness = model?.rgb?.maximumBrightness;
    if (Number.isInteger(brightness)) facts.push({label: "Brightness ceiling", value: `${brightness}`, hint: `Brightness goes no higher than this, whatever is saved. ${BUILD}`});
    if (Number.isInteger(firmware?.repeatHz)) facts.push({label: "Repeat ceiling", value: `${firmware?.repeatHz} Hz`, hint: `The fastest a held behaviour repeats. ${BUILD}`});
    const dpi = (model?.configDefaults || []).find((section) => section.id === "normalPointerSpeed");
    for (const field of dpi?.fields || []) {
        const steps = (field.choices || []).map((choice) => typeof choice === "object" ? choice.value : choice);
        if (steps.length) facts.push({label: `${field.label.replace(/ \(.*\)$/, "")} speed steps`, value: `${steps[0]}–${steps[steps.length - 1]} DPI, ${steps.length} steps`,
            hint: `The DPI steps the Charybdis accepts for this speed; a trackball mode's own speed is not limited to them. ${BUILD}`});
    }
    // Current firmware decides every key's tap or hold itself (firmware D-F27,
    // Profile Wire feature bit 31, which Ark requires).
    facts.push({label: "QMK tap-hold options", value: "Not used",
        hint: `The keyboard decides every key's tap or hold itself, so QMK's permissive hold, hold on other key press and quick tap apply to no key. ${BUILD}`});
    return facts;
}
