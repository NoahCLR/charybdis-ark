// @ts-check
// What Lighting explains, behind info marks (ui/info-mark.mjs): what each
// stage does, on its stage bar; what a section's choices mean, on its
// heading; how accents work, on theirs; and the board's shortcuts, on its
// corner. What is needed every time stays on screen beside its control (a
// range, a live value, the one line saying when a case shows); what is read
// once is here. The facts are the guide's (docs/guide/lighting.md), in its
// words.

import {infoMark} from "../info-mark.mjs";
import {modifierKey} from "../../view/shortcuts.mjs";
import {accentBudget} from "../../view/accents.mjs";
import {listed, vocabulary, word} from "../../view/vocabulary.mjs";
import {sectionPath, sectionsIn} from "../../view/settings-layout.mjs";

/** @typedef {import("../info-mark.mjs").InfoRow} InfoRow */
/** @typedef {import("../../../contracts/panel.js").PublishedModel} Model */

/** @param {string} term @param {string} says @returns {InfoRow} */
const row = (term, says) => ({term, says});

// A setting's label, as its Settings section publishes it, without its unit.
/** @param {Model} model @param {string} area @param {string} macro */
const settingLabel = (model, area, macro) => {
    const field = sectionsIn(model, area).flatMap((section) => section.fields).find((entry) => entry.macro === macro);
    return field ? field.label.replace(/\s*\([^)]*\)$/, "") : "";
};

// The five places a colour may paint, in the vocabulary's words and said
// the same on every tab that has a Locality (D-L93), then which key is the
// trigger key there.
/** @param {Model} model @param {string} stage */
export function localityInfo(model, stage) {
    const places = vocabulary(model).localities;
    /** @param {string} id */
    const place = (id) => word(places, id);
    /** @type {Readonly<Record<string, InfoRow[]>>} */
    const trigger = {
        pd: [row("Trigger key", "The key that started the mode. With none known, the last two choices paint every key.")],
        combo: [row("Trigger key", "The keys of the combo held.")],
        key: [row("Trigger key", "The key showing the case, or every key of a combo."),
            row("Several at once", "A narrower place paints over a wider one; where they share one, the newest key decides.")],
        autocorrect: [row("Trigger key", "The key that ended the word (Space, Enter, a punctuation key), or the Backspace that undid it. For what the Leader key sends, the key that sent it, or the Leader key when the wait sent it."),
            row(word(vocabulary(model).replacementOwners, "AUTOCORRECT_FEEDBACK_GROUP_LEADING"), "The Leader key you pressed."),
            row("No key known", "The last two choices paint every key.")],
    };
    return infoMark({id: `lighting-info-locality-${stage}`, label: "What each place means", heading: "Where it paints", lead: "Where this colour paints while it shows.", rows: [
        row(place("RGB_BOTH_HALVES"), "Every LED on both halves, the trackball's included."),
        row(`${place("RGB_LEFT_HALF")}, ${place("RGB_RIGHT_HALF")}`, "Every LED on that half, whichever key it came from."),
        row(place("RGB_KEY_HALF"), "The whole half the trigger key is on, that key included; both halves when a combo's keys span them."),
        row(place("RGB_KEYS_ONLY"), "Just the trigger key, or every key of a combo."),
        ...(trigger[stage] || [])]});
}

// What each stage does, on its stage bar: the one place it is said. Every
// word naming a stored value, a case or a setting is the vocabulary's or its
// Settings section's.
/** @param {Model} model @param {string} id */
export function stageInfo(model, id) {
    const words = vocabulary(model);
    const label = id === "accents" ? "All accents" : words.stages.find((stage) => stage.id === id)?.label || "this stage";
    /** @param {string} heading @param {string} lead @param {InfoRow[]} rows */
    const mark = (heading, lead, rows) => infoMark({id: `lighting-info-stage-${id}`, label: id === "accents" ? "About all accents" : `How ${label.toLowerCase()} paints`, heading, lead, rows});
    const passthrough = words.colourOff.layers?.offWord || "", off = words.colourChoice.off;
    /** @param {string} owner */
    const flash = (owner) => word(words.feedbackOwners, owner);
    /** @param {string} owner */
    const replacement = (owner) => word(words.replacementOwners, owner);
    const flashLength = settingLabel(model, "Lighting", "replacementFlash"), interval = settingLabel(model, "Lighting", "feedbackFlash");
    switch (id) {
        case "base": return mark("How the background effect paints", "QMK's own effect, drawn first, under every other stage. Each stage paints over it, and a passthrough layer shows it.", [
            row(words.lightingFields.colour, "Solid colour shows it as it is; most animated effects build on it."),
            row(off, "It has no Stage on switch. All lighting, beside the title, darkens it with every stage."),
            row("Accents", "None. Layer colours and the feedback stages have them.")]);
        case "layers": return mark("How layer colours paint", "Each layer that is on paints its colour over the background effect, lowest first, so a higher layer covers a lower one where both paint.", [
            row("Each layer", "Its colour, which LEDs it lights and its accents are its own. Pick it in the list."),
            row(passthrough, "Paints nothing: the layers on under it, or the background effect, show through."),
            row(off, "Its LEDs go dark, covering what is beneath."),
            row("Empty layers", "Folded at the list's end. A layer with a colour is not empty."),
            row("Board", "The layer picked, with the layers previewed under it.")]);
        case "auto": return mark("How the auto-mouse fade paints", "When auto-mouse turns the pointer layer off, its light holds, then fades over the rest of the auto-mouse timeout, in place of the layer colours.", [
            row(words.lightingFields.endColour, `Taken as it is: ${off} stores HSV(0, 0, 0), and the fade ends with the LEDs off. It is never passthrough.`),
            row("Auto-mouse off", "The fade never runs. A pointer layer turned on by hand shows its own layer colour. These settings take effect once auto-mouse is back on."),
            row("Board", "Where the fade lands, not the animation.")]);
        case "pd": return mark("How pointing modes paint", "While a mode runs, its colour paints over the layer's, where its Locality says.", [
            row("Each mode", "Its colour, where it paints and its accents are its own. Pick it in the list."),
            row("Linked layers", "A mode linked to layers paints beneath the lowest of them that is on instead: their colours show over it, and higher layers cover both."),
            row(passthrough, "The mode paints nothing while it runs; its accents in a colour of their own still light."),
            row("Swapped slots", "Swapping two slots on Pointing modes takes each mode's colour and accents with it."),
            row("Board", "The mode picked, running, as it paints with no linked layer on.")]);
        case "combo": return mark("How combo feedback paints", "While a combo's inputs are held, its keys wear this colour, where the Locality says. One colour, place and set of accents serves every combo, and the combo badges take their outline from it.", [
            row(words.lightingLists.comboFeedback.title, "The combos on this view that light this colour."),
            row(words.lightingLists.holdLayer.title, words.lightingLists.holdLayer.tip),
            row("Pointing mode", "A combo that runs a pointing mode paints beneath it; the mode covers it where both paint."),
            row("Board", "The combo picked in the list, held: its keys ringed as on the Keymap, the keys holding it ringed solid. Click another ringed key to hold it from there.")]);
        case "key": {
            const tiers = ["KEY_FEEDBACK_GROUP_TAP_COMMITTED", "KEY_FEEDBACK_GROUP_HOLD_ACTIVE", "KEY_FEEDBACK_GROUP_LONG_HOLD_ACTIVE"].map(flash);
            const [first, deepest] = [flash("KEY_FEEDBACK_GROUP_TAP_COUNT_2"), flash("KEY_FEEDBACK_GROUP_TAP_COUNT_5")];
            const [never, more] = [word(words.tapCommit, "KEY_FEEDBACK_TAP_COMMIT_OFF"), word(words.tapCommit, "KEY_FEEDBACK_TAP_COMMIT_NON_BASE_TAPS")];
            return mark("How behaviour feedback paints", "While a key's behaviour fires, the key flashes the colour of what fired. Each case has its own colour, place and accents; when it flashes and how fast is one setting for every case.", [
                row(words.lightingLists.tiers.title, `${listed(tiers)} flash as that tier fires.`),
                row(words.lightingLists.tapBranches.title, `${first} to ${deepest}, each flashed while a run of taps waits on that count. A deeper run takes ${deepest}'s.`),
                row(words.lightingFields.tapBranchCommit, `${more} flashes as a double tap or more fires, unless it sends a layer or pointing key, whose own stage shows it. ${never} doesn't flash for taps.`),
                row(interval, "How long each on or off phase lasts; a full blink takes twice this."),
                row("No key has it", "The keyboard never shows that case, and the board shows nothing for it."),
                row("Marks", "The board's behaviour dots and the behaviour grid's branch numbers wear these colours."),
                row("Board", "The case picked, from the first key whose behaviour has it, ringed when its Locality follows the key.")]);
        }
        case "autocorrect": {
            const leading = replacement("AUTOCORRECT_FEEDBACK_GROUP_LEADING");
            return mark("How replacement feedback paints", "One flash as text replacement changes what you typed, in the colour of what it did, and a colour held while the leader waits. Each case has its own colour, place and accents, and it paints over every other stage.", [
                row(replacement("AUTOCORRECT_FEEDBACK_GROUP_TEXT"), "Flashes as an input is replaced with text, and as the Leader key sends text."),
                row(replacement("AUTOCORRECT_FEEDBACK_GROUP_MACRO"), "Flashes as an input is erased for its macro, before the macro plays, and as the Leader key plays a macro."),
                row(replacement("AUTOCORRECT_FEEDBACK_GROUP_UNDO"), "Flashes as Backspace, straight after a replacement, puts the word back."),
                row(leading, "Held from the Leader key until the leader sends or gives up. A send's text or macro flash takes its place; when nothing is sent it just goes."),
                row(flashLength, `How long one flash lasts, from when the replacement starts to be typed. One for every case but ${leading}, which holds as long as the leader waits (${settingLabel(model, "Settings", "leaderTimeout")}, on ${sectionPath(model, "autocorrect")}).`),
                row("One at a time", "An undo straight after a replacement takes its flash's place. A word left as you typed it never flashes."),
                row("Board", `The case picked. Space stands in for the key that ends a word, Backspace for an undo and the Leader key for ${leading}, ringed when the Locality follows the key.`)]);
        }
        case "accents": return mark("All accents", "Every accent, by the stage that paints it. An accent is changed on its stage's tab: Open goes there with its LEDs glowing.", [
            row("Click a line", "Keeps its LEDs glowing on the board; click it again to let go.")]);
        default: return "";
    }
}

// What a section's choices mean, on its heading, each choice by the
// vocabulary's word for it and each setting by its Settings section's label.
/** @param {Model} model @param {string} id the stage, then the section */
export function sectionInfo(model, id) {
    const words = vocabulary(model);
    /** @param {string} label @param {string} heading @param {string} lead @param {InfoRow[]} rows */
    const mark = (label, heading, lead, rows) => infoMark({id: `lighting-info-${id.replace(":", "-")}`, label, heading, lead, rows});
    /** @param {string} macro */
    const setting = (macro) => settingLabel(model, "Lighting", macro);
    switch (id) {
        case "base:effect": return mark("About the effect", "The background effect", "", [
            row(setting("effectMode"), "The effects this keyboard has. Every stage paints over it."),
            row(setting("effectSpeed"), "How fast an animated effect moves. Effects without animation ignore it.")]);
        case "base:leds": return mark("About which LEDs it lights", "Which LEDs it lights", "", [
            row(setting("effectLeds"), "All, none, modifiers, keys, or modifiers and keys. The other stages paint any LED, whichever this leaves dark.")]);
        case "layers:mode": return mark(`About ${words.lightingFields.paintMode.toLowerCase()}`, words.lightingFields.paintMode, "", [
            row(word(words.paintModes, "KEYS_MAPPED_ON_THIS_LAYER_ONLY"), "Leaves the layer's transparent and empty keys unpainted, so what is beneath shows there."),
            row(word(words.paintModes, "ALL_KEYS"), "Paints every LED, the trackball's included."),
            row("Transparent keys", "Keep their ▽ on the board either way.")]);
        case "auto:fade": return mark("About the fade modes", "Where the fade lands", "Where the light fades to once auto-mouse turns the pointer layer off.", [
            row(word(words.fadeModes, "FOLLOW_REAL_DESTINATION"), "What the board would show without the pointer layer. Uses no end colour."),
            row(word(words.fadeModes, "END_COLOR_WHERE_BASE_EFFECT_WOULD_SHOW"), "The layers beneath where they paint, and the end colour where the background effect would show."),
            row(word(words.fadeModes, "END_COLOR_ON_ALL_KEYS"), "The end colour on every LED.")]);
        case "auto:timing": {
            const hold = setting("mouseFadeHold");
            return mark("About the timing", hold, "", [
                row(hold, "How much of the auto-mouse timeout the colour holds before it fades."),
                row("Timeout", `Set on ${sectionPath(model, "autoMouse")}. Changing it keeps this share.`)]);
        }
        default: return "";
    }
}

// How accents work, on the Accents heading of each stage that has them.
/** @param {Model} model @param {import("../../../contracts/model.js").AccentTable} target */
export function accentsInfo(model, target) {
    const words = vocabulary(model).accents[target];
    const budget = accentBudget(model);
    const sets = budget.find((count) => count.id === "lightingGroups");
    const accents = budget.find((count) => count.id !== "lightingGroups");
    /** @type {InfoRow[]} */
    const rows = [
        row("Lights for", target === "combo" ? "Every combo: the same LEDs whichever combo is held." : `The one picked, or all of them (${words.every})${words.group ? `. On a tap branch, also ${words.group.words}` : ""}.`),
        row("Colour", `Its own, or the stage's (${words.stageColour}). One that takes a passthrough colour stays dark with it.`),
        row("Order", target === "keyBehavior" || target === "autocorrect"
            ? `A later accent repaints an earlier one where they share LEDs. Those for ${words.every.toLowerCase()} paint first, so one for the case picked wins an LED they share.`
            : "A later accent repaints an earlier one where they share LEDs."),
        ...(target === "layer" ? [row("Base", "Base's accents stay lit over the layers above it. Go to Base changes them.")] : []),
        row("Picking", "Add accent, then click keys on the board or drag across them. The number on each key is its LED."),
        ...(sets ? [row("LED sets", `${sets.what} The keyboard holds ${accents ? `${accents.limit} accents and ` : ""}${sets.limit} sets.`)] : []),
    ];
    return infoMark({id: `lighting-info-accents-${target}`, label: "How accents work", heading: "How accents work", rows});
}

// The Lighting board's shortcuts, on its top-right corner as on the Keymap's
// (keys/board-card.mjs), with those that work on the tab shown.
/** @param {{picking: boolean, ringed: boolean}} options */
export function boardShortcuts({picking, ringed}) {
    /** @type {InfoRow[]} */
    const rows = [row(`${modifierKey()}-click a layer`, "Preview it on with the others."),
        ...(ringed ? [row("Click a ringed key", "Hold the combo from that key.")] : []),
        ...(picking ? [row("Click, or drag", "Pick the accent's LEDs, or take them back.")] : []),
        row("LED numbers", "Each key's LED, by which accents name the LEDs they light.")];
    return infoMark({id: "lighting-board-shortcuts", label: "Shortcuts", heading: "Shortcuts", named: "Board shortcuts", corner: true, rows});
}
