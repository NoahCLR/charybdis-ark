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
import {vocabulary} from "../../view/vocabulary.mjs";

/** @typedef {import("../info-mark.mjs").InfoRow} InfoRow */
/** @typedef {import("../../../contracts/panel.js").PublishedModel} Model */

/** @param {string} term @param {string} says @returns {InfoRow} */
const row = (term, says) => ({term, says});

// The five places a colour may paint, said the same on every tab that has a
// Locality (D-L93), then which key is the trigger key there.
const LOCALITY_ROWS = [
    row("All LEDs", "Every LED on both halves, the trackball's included."),
    row("Left half, Right half", "Every LED on that half, whichever key it came from."),
    row("The half holding the trigger key", "The whole half the trigger key is on, that key included; both halves when a combo's keys span them."),
    row("Only the trigger key", "Just the trigger key, or every key of a combo."),
];
/** @type {Readonly<Record<string, InfoRow[]>>} */
const TRIGGER_ROWS = {
    pd: [row("Trigger key", "The key that started the mode. With none known, the last two choices paint every key.")],
    combo: [row("Trigger key", "The keys of the combo held.")],
    key: [row("Trigger key", "The key showing the case, or every key of a combo."),
        row("Several at once", "A narrower place paints over a wider one; where they share one, the newest key decides.")],
    autocorrect: [row("Trigger key", "The key that ended the word (Space, Enter, a punctuation key), or the Backspace that undid it. For what the Leader key sends, the key that sent it, or the Leader key when the wait sent it."),
        row("Leader waiting", "The Leader key you pressed."),
        row("No key known", "The last two choices paint every key.")],
};

/** @param {string} stage */
export const localityInfo = (stage) => infoMark({id: `lighting-info-locality-${stage}`, label: "What each place means", heading: "Where it paints",
    lead: "Where this colour paints while it shows.", rows: [...LOCALITY_ROWS, ...(TRIGGER_ROWS[stage] || [])]});

// What each stage does, on its stage bar: the one place it is said.
/** @param {Model} model @param {string} id */
export function stageInfo(model, id) {
    const label = id === "accents" ? "All accents" : vocabulary(model).stages.find((stage) => stage.id === id)?.label || "this stage";
    /** @param {string} heading @param {string} lead @param {InfoRow[]} rows */
    const mark = (heading, lead, rows) => infoMark({id: `lighting-info-stage-${id}`, label: id === "accents" ? "About all accents" : `How ${label.toLowerCase()} paints`, heading, lead, rows});
    switch (id) {
        case "base": return mark("How the background effect paints", "QMK's own effect, drawn first, under every other stage. Each stage paints over it, and a passthrough layer shows it.", [
            row("Colour", "Solid colour shows it as it is; most animated effects build on it."),
            row("Off", "It has no Stage on switch. All lighting, beside the title, darkens it with every stage."),
            row("Accents", "None. Layer colours and the feedback stages have them.")]);
        case "layers": return mark("How layer colours paint", "Each layer that is on paints its colour over the background effect, lowest first, so a higher layer covers a lower one where both paint.", [
            row("Each layer", "Its colour, which LEDs it lights and its accents are its own. Pick it in the list."),
            row("Passthrough", "Paints nothing: the layers on under it, or the background effect, show through."),
            row("Off", "Its LEDs go dark, covering what is beneath."),
            row("Empty layers", "Folded at the list's end. A layer with a colour is not empty."),
            row("Board", "The layer picked, with the layers previewed under it.")]);
        case "auto": return mark("How the auto-mouse fade paints", "When auto-mouse turns the pointer layer off, its light holds, then fades over the rest of the auto-mouse timeout, in place of the layer colours.", [
            row("End colour", "Taken as it is: Off stores HSV(0, 0, 0), and the fade ends with the LEDs off. It is never passthrough."),
            row("Auto-mouse off", "The fade never runs. A pointer layer turned on by hand shows its own layer colour. These settings take effect once auto-mouse is back on."),
            row("Board", "Where the fade lands, not the animation.")]);
        case "pd": return mark("How pointing modes paint", "While a mode runs, its colour paints over the layer's, where its Locality says.", [
            row("Each mode", "Its colour, where it paints and its accents are its own. Pick it in the list."),
            row("Linked layers", "A mode linked to layers paints beneath the lowest of them that is on instead: their colours show over it, and higher layers cover both."),
            row("Passthrough", "The mode paints nothing while it runs; its accents in a colour of their own still light."),
            row("Swapped slots", "Swapping two slots on Pointing modes takes each mode's colour and accents with it."),
            row("Board", "The mode picked, running, as it paints with no linked layer on.")]);
        case "combo": return mark("How combo feedback paints", "While a combo's inputs are held, its keys wear this colour, where the Locality says. One colour, place and set of accents serves every combo, and the combo badges take their outline from it.", [
            row("Combo feedback", "The combos on this view that light this colour."),
            row("Hold a layer", "Combos whose output holds a layer. They light no combo feedback: the board turns the layer on, and its own light shows the hold."),
            row("Pointing mode", "A combo that runs a pointing mode paints beneath it; the mode covers it where both paint."),
            row("Board", "The combo picked in the list, held: its keys ringed as on the Keymap, the keys holding it ringed solid. Click another ringed key to hold it from there.")]);
        case "key": return mark("How behaviour feedback paints", "While a key's behaviour fires, the key flashes the colour of what fired. Each case has its own colour, place and accents; when it flashes and how fast is one setting for every case.", [
            row("Tiers", "Tap committed, Hold active and Long hold active flash as that tier fires."),
            row("Tap branches", "Double tap to Quintuple tap, each flashed while a run of taps waits on that count. A deeper run takes Quintuple tap's."),
            row("Tap branch commit", "Double taps and more flashes as a double tap or more fires, unless it sends a layer or pointing key, whose own stage shows it. Off doesn't flash for taps."),
            row("Flash interval", "How long each on or off phase lasts; a full blink takes twice this."),
            row("No key has it", "The keyboard never shows that case, and the board shows nothing for it."),
            row("Marks", "The board's behaviour dots and the behaviour grid's branch numbers wear these colours."),
            row("Board", "The case picked, from the first key whose behaviour has it, ringed when its Locality follows the key.")]);
        case "autocorrect": return mark("How replacement feedback paints", "One flash as text replacement changes what you typed, in the colour of what it did, and a colour held while the leader waits. Each case has its own colour, place and accents, and it paints over every other stage.", [
            row("Replaced with text", "Flashes as an input is replaced with text, and as the Leader key sends text."),
            row("Replaced by a macro", "Flashes as an input is erased for its macro, before the macro plays, and as the Leader key plays a macro."),
            row("Replacement undone", "Flashes as Backspace, straight after a replacement, puts the word back."),
            row("Leader waiting", "Held from the Leader key until the leader sends or gives up. A send's text or macro flash takes its place; when nothing is sent it just goes."),
            row("Flash length", "How long one flash lasts, from when the replacement starts to be typed. One for every case but Leader waiting, which holds as long as the leader waits (Leader waits, on Host settings)."),
            row("One at a time", "An undo straight after a replacement takes its flash's place. A word left as you typed it never flashes."),
            row("Board", "The case picked. Space stands in for the key that ends a word, Backspace for an undo and the Leader key for Leader waiting, ringed when the Locality follows the key.")]);
        case "accents": return mark("All accents", "Every accent, by the stage that paints it. An accent is changed on its stage's tab: Open goes there with its LEDs glowing.", [
            row("Click a line", "Keeps its LEDs glowing on the board; click it again to let go.")]);
        default: return "";
    }
}

// What a section's choices mean, on its heading.
/** @param {string} id the stage, then the section */
export function sectionInfo(id) {
    /** @param {string} label @param {string} heading @param {string} lead @param {InfoRow[]} rows */
    const mark = (label, heading, lead, rows) => infoMark({id: `lighting-info-${id.replace(":", "-")}`, label, heading, lead, rows});
    switch (id) {
        case "base:effect": return mark("About the effect", "The background effect", "", [
            row("Effect", "The effects this keyboard has. Every stage paints over it."),
            row("Animation speed", "How fast an animated effect moves. Effects without animation ignore it.")]);
        case "base:leds": return mark("About which LEDs it lights", "Which LEDs it lights", "", [
            row("LEDs", "All, none, modifiers, keys, or modifiers and keys. The other stages paint any LED, whichever this leaves dark.")]);
        case "layers:mode": return mark("About which LEDs light up", "Which LEDs light up", "", [
            row("Keys mapped on this layer only", "Leaves the layer's transparent and empty keys unpainted, so what is beneath shows there."),
            row("All LEDs", "Paints every LED, the trackball's included."),
            row("Transparent keys", "Keep their ▽ on the board either way.")]);
        case "auto:fade": return mark("About the fade modes", "Where the fade lands", "Where the light fades to once auto-mouse turns the pointer layer off.", [
            row("Follow the real destination", "What the board would show without the pointer layer. Uses no end colour."),
            row("End colour where the background effect would show", "The layers beneath where they paint, and the end colour where the background effect would show."),
            row("End colour on all LEDs", "The end colour on every LED.")]);
        case "auto:timing": return mark("About the timing", "Hold before fading", "", [
            row("Hold before fading", "How much of the auto-mouse timeout the colour holds before it fades."),
            row("Timeout", "Set on Pointer settings, under Auto-mouse. Changing it keeps this share.")]);
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
