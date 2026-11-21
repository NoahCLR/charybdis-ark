// @ts-check
// Step 2 of a mode: what the ball does as it moves. A directional mode draws
// each direction it reads as a key placed where the ball sends it, around the
// ball; a click opens the picker and × clears it. Its options stand in a
// column beside the compass: which directions it reads, a row of shapes;
// what a direction with no key does, radio buttons; and whether it sends
// once per movement, a switch.
// A scrolling mode groups its fields as which way, speed and feel.
import {el, esc} from "../../lib/dom.mjs";
import {AXIS, DIAGONALS, DIRECTIONS, axisReads, scrollAxesOf, tapPlaceWord} from "../../view/pointing-config.mjs";
import {keyDisplayName} from "../../view/keyvalues.mjs";
import {keycodeName} from "../../view/key-identity.mjs";
import {render} from "../../store.mjs";
import {openPicker} from "../picker.mjs";
import {ARROWS, SCROLL_LEAD, scrollLabel, tipFor, words} from "./common.mjs";
import {word} from "../../view/vocabulary.mjs";
import {storedChoices} from "../../view/choices.mjs";

/** @typedef {ReturnType<typeof import("./form-controls.mjs").formControls>} FormControls */
/** @typedef {import("../../../contracts/panel.js").PublishedModel} Model */
/** @typedef {import("../surface-types.js").PresentedSlot} PresentedSlot */

/** @param {Model} model @param {PresentedSlot} slot @param {boolean} scrolling @param {FormControls} controls @param {() => void} stage */
export function movement(model, slot, scrolling, controls, stage) {
    return scrolling ? scrollingFields(model, slot, controls) : directions(model, slot, controls, stage);
}

/** @param {Model} model @param {PresentedSlot} slot @param {FormControls} controls @param {() => void} stage */
function directions(model, slot, {form, disabled}, stage) {
    const reads = axisReads(slot.axis);
    const eight = slot.axis === AXIS.EIGHT;
    const shape = eight ? "eight" : reads.length === 4 ? "four" : reads.includes("up") ? "vertical" : "horizontal";
    const node = el(`<div class="pd-directions">
        <div class="pd-direction-options"></div>
        <div class="pd-compass ${shape}" role="group" aria-label="What each direction sends">
            <div class="pd-ball" aria-hidden="true"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="30"/><circle cx="40" cy="40" r="4"/></svg></div></div></div>`);
    const compass = /** @type {HTMLElement} */ (node.querySelector(".pd-compass"));
    /** @type {[("directions" | "diagonals"), string][]} */
    const places = [...DIRECTIONS.filter((name) => reads.includes(name)).map((name) => /** @type {["directions", string]} */ (["directions", name])),
        ...(eight ? DIAGONALS.map((name) => /** @type {["diagonals", string]} */ (["diagonals", name])) : [])];
    for (const [group, name] of places) {
        compass.append(directionKey(model, slot, group, name, {form, disabled, stage}));
    }
    // The ball stays where it is whichever directions are read: a straight
    // direction one axis leaves out keeps its place as an unseen, inert arm
    // drawn as its key would be, so every row keeps its height.
    for (const name of DIRECTIONS.filter((direction) => !reads.includes(direction))) {
        const ghost = arm(model, slot, "directions", name, disabled);
        ghost.classList.add("pd-arm-ghost");
        ghost.setAttribute("aria-hidden", "true");
        ghost.inert = true;
        compass.append(ghost);
    }
    // What each choice does is the step's info mark (editor.mjs).
    /** @type {HTMLElement} */ (node.querySelector(".pd-direction-options")).append(shapes(model, slot, form, disabled),
        emptyDirection(model, slot, form, disabled),
        sendsOnce(model, slot, form, disabled));
    return node;
}

// Each axis policy drawn as the directions it reads, on a 24-unit square:
// all eight (a star, which arrowheads would blur at this size), the four
// straight ones, up and down, left and right.
/** @type {Readonly<Record<number, string>>} */
const SHAPES = {
    [AXIS.EIGHT]: `<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>`,
    [AXIS.DOMINANT]: `<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>`,
    [AXIS.VERTICAL]: `<path d="M12 3v18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3"/>`,
    [AXIS.HORIZONTAL]: `<path d="M3 12h18"/><path d="M6 9l-3 3 3 3M18 9l3 3-3 3"/>`,
};

// Which directions the mode reads, as a radio group of shapes in the
// vocabulary's order, named to a screen reader, with the picked one's name
// beside them; the others are named by their tips, the picked one needing
// none (D-L96). A stored value that is none of them shows as one more
// option in words, "as stored" (storedChoices). What reading means is the
// step's info mark (editor.mjs).
/** @param {Model} model @param {PresentedSlot} slot @param {FormControls["form"]} form @param {string} disabled */
function shapes(model, slot, form, disabled) {
    const P = words(model);
    const f = `pointing:${slot.id}:axis`;
    const current = slot.axis ?? AXIS.DOMINANT, choices = storedChoices(P.axes, current);
    const node = el(`<div class="field pd-shapes"><span>${esc(P.fieldLabels.axis)}</span><div class="pd-shape-row">
        <div class="seg pd-shape-seg" role="radiogroup" aria-label="${esc(P.fieldLabels.axis)}">${choices.map(([value, name]) => `<label data-axis="${esc(value)}">
            <input type="radio" name="${esc(f)}" value="${esc(value)}" data-f="${esc(f)}:${esc(value)}" aria-label="${esc(name)}" ${value === current ? "checked" : ""} ${esc(disabled)}>
            <span>${SHAPES[value] ? `<svg viewBox="0 0 24 24" aria-hidden="true">${SHAPES[value]}</svg>` : esc(name)}</span></label>`).join("")}</div>
        <span class="pd-shape-name" aria-hidden="true">${choices.map(([value, name]) => `<span data-axis="${esc(value)}">${esc(name)}</span>`).join("")}</span></div></div>`);
    const picked = () => /** @type {HTMLInputElement | null} */ (node.querySelector("input:checked"));
    form.axis = () => Number(picked()?.value ?? current);
    // Every name is drawn, the picked one shown, so the column keeps the
    // widest one's width and the compass beside it never moves. The name
    // and the tips follow a pick at once; the compass redraws once it is
    // staged.
    const show = () => {
        const value = picked()?.value;
        for (const name of /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll(".pd-shape-name > span"))) name.toggleAttribute("data-off", name.dataset.axis !== value);
        for (const label of /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll(".pd-shape-seg > label"))) {
            if (label.dataset.axis === value) label.removeAttribute("data-tip");
            else label.dataset.tip = word(choices, Number(label.dataset.axis));
        }
    };
    show();
    node.addEventListener("change", show);
    return node;
}

// What a direction with no key does, as radio buttons, each named in full,
// holding the stored value even when it is none of them (storedChoices).
// What each does is the step's info mark (editor.mjs).
/** @param {Model} model @param {PresentedSlot} slot @param {FormControls["form"]} form @param {string} disabled */
function emptyDirection(model, slot, form, disabled) {
    const P = words(model), label = P.fieldLabels.emptyDirection, f = `pointing:${slot.id}:emptyDirection`;
    const current = slot.emptyDirection ?? 0, choices = storedChoices(P.emptyDirection, current);
    const node = el(`<div class="field"><span>${esc(label)}</span><div class="pd-radios" role="radiogroup" aria-label="${esc(label)}">
        ${choices.map(([value, name]) => `<label><input type="radio" name="${esc(f)}" value="${esc(value)}" data-f="${esc(f)}:${esc(value)}" ${value === current ? "checked" : ""} ${esc(disabled)}><span>${esc(name)}</span></label>`).join("")}</div></div>`);
    form.emptyDirection = () => Number(/** @type {HTMLInputElement | null} */ (node.querySelector("input:checked"))?.value ?? current);
    return node;
}

// How often the mode sends, as a switch: on sends once per movement, off
// with every step (the record's directionOutput, 1 and 0), so a mode that
// sends every step, as every one did before, shows it off. What each means
// is the step's info mark (editor.mjs).
/** @param {Model} model @param {PresentedSlot} slot @param {FormControls["form"]} form @param {string} disabled */
function sendsOnce(model, slot, form, disabled) {
    const node = el(`<div class="field"><div class="pd-switches"><label class="sw"><input type="checkbox" data-f="pointing:${esc(slot.id)}:directionOutput"
        ${slot.directionOutput === 1 ? "checked" : ""} ${esc(disabled)}><span class="track"></span><span class="txt">${esc(words(model).sendsOnce)}</span></label></div></div>`);
    form.directionOutput = () => /** @type {HTMLInputElement} */ (node.querySelector("input")).checked ? 1 : 0;
    return node;
}

// One direction's key. Its form reader is the keycode name it holds: the
// stored one until the picker or × changes it.
/** @param {Model} model @param {PresentedSlot} slot @param {"directions" | "diagonals"} group @param {string} name @param {{form: FormControls["form"], disabled: string, stage: () => void}} controls */
function directionKey(model, slot, group, name, {form, disabled, stage}) {
    const key = directionField(group, name);
    let held = keycodeName(model, Number(slot[group]?.[name]?.keycode ?? 0));
    form[key] = () => held;
    const label = tapPlaceWord(model, group, name);
    const node = arm(model, slot, group, name, disabled);
    /** @type {HTMLButtonElement} */ (node.querySelector("[data-direction-key]")).addEventListener("click", () => {
        // Only what the keyboard sends from a pointing mode is offered
        // (model.pdModeEditing.tapKeys); a key is checked when it is staged.
        openPicker({
            title: label, context: `${slot.name} · slot ${slot.id}`,
            seed: held ? [held] : [],
            allowedKeys: model.pdModeEditing?.tapKeys?.plain ?? null,
            modifiable: model.pdModeEditing?.tapKeys?.modified ?? null,
            onPick: (expression) => { held = expression; stage(); render(); },
        });
    });
    /** @type {HTMLButtonElement | null} */ (node.querySelector("[data-clear]"))?.addEventListener("click", () => { held = ""; stage(); });
    return node;
}

// A direction's form field, by where the record keeps it.
/** @param {"directions" | "diagonals"} group @param {string} name */
const directionField = (group, name) => `${group === "diagonals" ? "diag" : "dir"}:${name}`;

// A direction's arm as the slot holds it: where it points, its key and × to
// clear it. directionKey makes it work.
/** @param {Model} model @param {PresentedSlot} slot @param {"directions" | "diagonals"} group @param {string} name @param {string} disabled */
function arm(model, slot, group, name, disabled) {
    const code = Number(slot[group]?.[name]?.keycode ?? 0);
    const key = directionField(group, name);
    const held = keycodeName(model, code);
    const label = tapPlaceWord(model, group, name);
    const shown = code ? keyDisplayName(model, code) : "";
    return el(`<div class="pd-arm ${esc(name)}" data-direction="${esc(name)}">
        <span class="pd-arm-dir" aria-hidden="true">${ARROWS[name]} ${esc(label)}</span>
        <span class="pd-keywrap"><button type="button" class="pd-key ${shown ? "" : "unset"}" data-direction-key="${esc(key)}" ${esc(disabled)}
            aria-label="${esc(`${label}: ${shown || "no key"}`)}" data-tip="${esc(shown ? `${label} sends ${shown}${held && held !== shown ? `, stored as ${held}` : ""}. Click to change it.` : `Pick a key for ${label}. Mouse buttons 1–8 and macros are in the picker too.`)}">${shown ? esc(shown) : "+ Key"}</button>
        ${shown ? `<button type="button" class="pd-key-clear" data-clear="${esc(key)}" aria-label="${esc(`Clear ${label}`)}" ${esc(disabled)}>×</button>` : ""}</span></div>`);
}

// The scroll fields the step shows itself; Advanced shows the rest of the
// record. A field drawn twice registers its reader twice, and the second
// input silently wins, so the two never overlap (common.mjs SCROLL_LEAD).
/** @param {Model} model @param {PresentedSlot} slot @param {FormControls} controls */
function scrollingFields(model, slot, {field, choice, form, disabled, modifiers}) {
    // Four columns, so every field heads a column: which way and reverse
    // over two each, then Speed's two fields and Feel's two under their
    // names.
    const node = el(`<div class="pd-scrolling stack">
        <div class="pd-cols" data-group="which"></div>
        <div class="pd-cols" data-group="fields">
            <div class="sect-h pd-sub span2"><h5>Speed</h5></div><div class="sect-h pd-sub span2"><h5>Feel</h5></div>
        </div></div>`);
    const group = (/** @type {string} */ name) => /** @type {HTMLElement} */ (node.querySelector(`[data-group="${name}"]`));
    // What the choice means is the step's info mark (editor.mjs).
    const which = choice(words(model).fieldLabels.scrollAxes, words(model).scrollAxes, scrollAxesOf(slot), "scrollAxes");
    const invert = reverse(model, slot, form, disabled);
    which.classList.add("span2"); invert.classList.add("span2");
    group("which").append(which, invert);
    // The fields this step draws are SCROLL_LEAD's, the divisors as Speed
    // and the rest as Feel; Advanced draws the others.
    for (const [key, unit] of SCROLL_LEAD) {
        group("fields").append(field(scrollLabel(model, key, unit), slot.scroll?.[key], `scroll:${key}`, {unit, tip: tipFor(model, key)}));
    }
    const held = modifiers(words(model).heldModifiers, slot.heldModifiers, "heldModifiers");
    held.setAttribute("data-tip", tipFor(model, "heldModifiers"));
    node.append(held);
    return node;
}

// Reverse scrolling is one switch per axis, named as the vocabulary names
// each bit alone (the same words Review reads): the record keeps it as two bits,
// horizontal (1) and vertical (2), which the vocabulary names together.
/** @param {Model} model @param {PresentedSlot} slot @param {FormControls["form"]} form @param {string} disabled */
function reverse(model, slot, form, disabled) {
    const invert = Number(slot.scroll?.invert ?? 0);
    const P = words(model);
    /** @param {number} bit */
    const axis = (bit) => `<label class="sw"><input type="checkbox" data-f="pointing:${esc(slot.id)}:invert:${bit}" data-bit="${bit}" ${invert & bit ? "checked" : ""} ${esc(disabled)}><span class="track"></span><span class="txt">${esc(word(P.invert, bit))}</span></label>`;
    const node = el(`<div class="field" data-tip="${esc(tipFor(model, "invert"))}"><span>${esc(words(model).fieldLabels.invert)}</span><div class="pd-switches">${axis(1)}${axis(2)}</div></div>`);
    form.invert = () => [...node.querySelectorAll("input:checked")].reduce((mask, input) => mask | Number(/** @type {HTMLInputElement} */ (input).dataset.bit), 0);
    return node;
}
