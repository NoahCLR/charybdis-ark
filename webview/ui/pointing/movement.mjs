// @ts-check
// Step 2 of a mode: what the ball does as it moves. A directional mode draws
// each direction it reads as a key placed where the ball sends it, around the
// ball; a click opens the picker and × clears it. A scrolling mode groups its
// fields as which way, speed and feel.
import {el, esc} from "../../lib/dom.mjs";
import {AXIS, DIAGONALS, DIRECTIONS, axisReads, scrollAxesOf, tapPlaceWord} from "../../view/pointing-config.mjs";
import {keyDisplayName, pointingMacro} from "../../view/keyvalues.mjs";
import {keycodeName} from "../../view/key-identity.mjs";
import {render} from "../../store.mjs";
import {openPicker} from "../picker.mjs";
import {ARROWS, SCROLL_LEAD, scrollLabel, tipFor, words} from "./common.mjs";
import {word} from "../../view/vocabulary.mjs";

/** @typedef {ReturnType<typeof import("./form-controls.mjs").formControls>} FormControls */
/** @typedef {import("../../../contracts/panel.js").PublishedModel} Model */
/** @typedef {import("../surface-types.js").PresentedSlot} PresentedSlot */

/** @param {Model} model @param {PresentedSlot} slot @param {boolean} scrolling @param {FormControls} controls @param {() => void} stage */
export function movement(model, slot, scrolling, controls, stage) {
    return scrolling ? scrollingFields(model, slot, controls) : directions(model, slot, controls, stage);
}

/** @param {Model} model @param {PresentedSlot} slot @param {FormControls} controls @param {() => void} stage */
function directions(model, slot, {choice, form, disabled}, stage) {
    const reads = axisReads(slot.axis);
    const eight = slot.axis === AXIS.EIGHT;
    const shape = eight ? "eight" : reads.length === 4 ? "four" : reads.includes("up") ? "vertical" : "horizontal";
    const node = el(`<div class="pd-directions">
        <div class="pd-direction-reads"></div>
        <div class="pd-compass ${shape}" role="group" aria-label="What each direction sends">
            <div class="pd-ball" aria-hidden="true"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="30"/><circle cx="40" cy="40" r="4"/></svg></div></div>
        <div class="pd-direction-fields"></div></div>`);
    const compass = /** @type {HTMLElement} */ (node.querySelector(".pd-compass"));
    /** @type {[("directions" | "diagonals"), string][]} */
    const places = [...DIRECTIONS.filter((name) => reads.includes(name)).map((name) => /** @type {["directions", string]} */ (["directions", name])),
        ...(eight ? DIAGONALS.map((name) => /** @type {["diagonals", string]} */ (["diagonals", name])) : [])];
    for (const [group, name] of places) {
        compass.append(directionKey(model, slot, group, name, {form, disabled, stage}));
    }
    /** @type {HTMLElement} */ (node.querySelector(".pd-direction-reads")).append(choice(words(model).fieldLabels.axis, words(model).axes, slot.axis, "axis",
        {tip: tipFor(model, "axis")}));
    const fields = /** @type {HTMLElement} */ (node.querySelector(".pd-direction-fields"));
    // What each choice does is the step's info mark (editor.mjs).
    fields.append(choice(words(model).fieldLabels.emptyDirection, words(model).emptyDirection, slot.emptyDirection ?? 0, "emptyDirection"));
    fields.append(choice(words(model).fieldLabels.directionOutput, words(model).directionOutput, slot.directionOutput ?? 0, "directionOutput"));
    return node;
}

// One direction's key. Its form reader is the keycode name it holds: the
// stored one until the picker or × changes it.
/** @param {Model} model @param {PresentedSlot} slot @param {"directions" | "diagonals"} group @param {string} name @param {{form: FormControls["form"], disabled: string, stage: () => void}} controls */
function directionKey(model, slot, group, name, {form, disabled, stage}) {
    const code = Number(slot[group]?.[name]?.keycode ?? 0);
    const key = `${group === "diagonals" ? "diag" : "dir"}:${name}`;
    let held = keycodeName(model, code);
    form[key] = () => held;
    const label = tapPlaceWord(model, group, name);
    const shown = code ? keyDisplayName(model, code) : "";
    const macro = pointingMacro(model, code);
    const notes = macro ? [
        macro.empty ? "Empty macro: does nothing yet" : "",
        slot.directionOutput === 0 ? "Busy triggers are dropped · try Once per movement" : "",
    ].filter(Boolean) : [];
    const node = el(`<div class="pd-arm ${esc(name)}" data-direction="${esc(name)}">
        <span class="pd-arm-dir" aria-hidden="true">${ARROWS[name]} ${esc(label)}</span>
        <span class="pd-keywrap"><button type="button" class="pd-key ${shown ? "" : "unset"}" data-direction-key="${esc(key)}" ${esc(disabled)}
            aria-label="${esc(`${label}: ${shown || "no key"}`)}" data-tip="${esc(shown ? `${label} sends ${shown}${held && held !== shown ? `, stored as ${held}` : ""}. Click to change it.` : `Pick a key for ${label}. Mouse buttons 1–8 and macros are in the picker too.`)}">${shown ? esc(shown) : "+ Key"}</button>
        ${shown ? `<button type="button" class="pd-key-clear" data-clear="${esc(key)}" aria-label="${esc(`Clear ${label}`)}" ${esc(disabled)}>×</button>` : ""}</span>
        ${notes.map((note) => `<span class="note">${esc(note)}</span>`).join("")}</div>`);
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
    const which = choice(words(model).fieldLabels.scrollAxes, words(model).scrollAxes, scrollAxesOf(slot), "scrollAxes", {tip: tipFor(model, "scrollAxes")});
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
