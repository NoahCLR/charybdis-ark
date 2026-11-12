// @ts-check
// Accents on Lighting (D-L77): LEDs that light in a colour of their own
// while a layer is on, a pointing mode runs, a combo's inputs are held, a
// key shows a behaviour state or the keyboard flashes for a replacement. Each stage's tab lists the accents of the owner
// it has picked and changes them where they stand; the board picks an
// accent's LEDs, numbered by index. All accents lists every one. Ark keeps the
// groups the keyboard stores them in, so none is ever shown.

import {el, esc} from "../../lib/dom.mjs";
import {css, hsv, label as hsvLabel} from "../../lib/colour.mjs";
import {post, render, showLayer, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {editWords} from "../../view/edit-mode.mjs";
import * as edits from "../../view/edits.mjs";
import {vocabulary} from "../../view/vocabulary.mjs";
import {accentBudget, accentOwner, accentsFor, accentsWhen, allAccents, everyOwner, groupOwner, ownerCalled, ownerMark, ownerPlace, stageShade} from "../../view/accents.mjs";
import {inheritsStageColour} from "../../view/lighting.mjs";
import {colourEditor} from "../colour-editor.mjs";
import {pickButton} from "../groups.mjs";
import {choiceField, choiceValue} from "../segmented.mjs";
import {marked, phraseMarked} from "../marks.mjs";

/** @typedef {import("../../../contracts/panel.js").PublishedModel} Model */
/** @typedef {import("../../../contracts/panel.js").Accent} Accent */
/** @typedef {import("../../../contracts/model.js").AccentTable} AccentTable */
/** @typedef {NonNullable<import("../../state.js").PanelState["accent"]>} Editing */

// What the stage's tab has picked, as view/accents.mjs reads it.
const picked = () => ({layer: state.layer, pointingSlot: state.pointingSlot, feedbackRow: state.feedbackRow, replacementRow: state.replacementRow});

// The accent being edited on this stage, while it is one the tab lists for
// what it has picked: a new one, or one of those it edits. One being changed
// that the picked layer, mode or state does not list (another layer's, after
// the tab moved on) is not being edited there, so the board stops picking for
// it and Add is offered again.
/** @param {Model} model @param {string} stage @returns {Editing | null} */
export function editingOn(model, stage) {
    const editing = state.accent && state.accent.stage === stage ? state.accent : null;
    if (!editing || editing.index === null) return editing;
    const whose = accentOwner(model, stage, picked());
    return whose && accentsFor(model, whose.target, whose.owner).here.some((row) => row.index === editing.index) ? editing : null;
}

// Whose the accent being edited is: the owner that is all of them, the group
// the picked owner is in, or the layer, mode or state the tab has picked now,
// so a new accent follows the tab as it moves on before it is kept.
/** @param {Model} model @param {Editing} editing */
function editingOwner(model, editing) {
    if (editing.every) return everyOwner(model, editing.target) || "";
    const mine = accentOwner(model, editing.stage, picked())?.owner || "";
    return editing.group ? groupOwner(model, editing.target, mine) || mine : mine;
}

// What the board shows of the accent being edited: the LEDs picked and the
// colour it would light them, the stage's when it takes the stage's.
/** @param {Model} model @param {string} stage */
export function accentPicks(model, stage) {
    const editing = editingOn(model, stage);
    if (!editing) return null;
    return {leds: new Set(editing.leds), colour: editing.stageColour ? stageShade(model, editing.target, editingOwner(model, editing), picked()) : editing.colour};
}

// A press on an LED picks it or takes it back, and a drag goes on doing
// whichever the press did (`adding`), so one stroke picks a row or clears one.
/** @param {Model} model @param {string} stage @param {number} led @param {boolean} starting */
export function pickLed(model, stage, led, starting) {
    const editing = editingOn(model, stage);
    if (!editing) return;
    const has = editing.leds.includes(led);
    if (starting) editing.adding = !has;
    if (editing.adding && !has) editing.leds = [...editing.leds, led];
    else if (!editing.adding && has) editing.leds = editing.leds.filter((value) => value !== led);
    else return;
    render();
}

// The LEDs of an accent glow on the board (`root`'s) while it is pointed at
// or, once clicked, while it is shown.
/** @param {ParentNode} root @param {readonly number[]} leds */
const glow = (root, leds) => root.querySelectorAll("[data-led]").forEach((group) =>
    group.classList.toggle("led-hover", leds.includes(Number(/** @type {HTMLElement} */ (group).dataset.led))));
/** @param {readonly number[]} leds */
const pointAt = (leds) => document.querySelectorAll(".board").forEach((board) => glow(board, leds));

// An accent clicked in a list stays shown, its LEDs glowing on the board
// while the list is scrolled away from it, until it is clicked again or
// another is; pointing at one shows it instead for as long. On a stage's tab
// it is an accent, by its place in its table; on All accents an owner's, by
// its name. While an accent is added or changed, the board shows that one.
/** @param {Model} model @returns {number[]} */
export function shownLeds(model) {
    const shown = state.accentShown;
    if (!shown || shown.stage !== state.stage || editingOn(model, state.stage)) return [];
    if (shown.stage === "accents") {
        return allAccents(model).flatMap(({target, owners}) => owners.filter(({owner}) => `${target}:${owner}` === shown.key))
            .flatMap(({rows}) => rows.flatMap((row) => row.ledIndices));
    }
    const whose = accentOwner(model, shown.stage, picked());
    if (!whose) return [];
    const {here, beneath} = accentsFor(model, whose.target, whose.owner);
    return [...here, ...beneath].find((row) => `${whose.target}:${row.index}` === shown.key)?.ledIndices || [];
}
/** @param {Model} model @param {ParentNode} board */
export const glowShown = (model, board) => glow(board, shownLeds(model));

// Whether `key` is the one shown on this stage, and a click showing it or
// letting it go.
/** @param {string} key */
const isShown = (key) => state.accentShown?.stage === state.stage && state.accentShown.key === key;
/** @param {string} key */
const toggleShown = (key) => { state.accentShown = isShown(key) ? null : {stage: state.stage, key}; render(); };

// A row shows its accent by a click anywhere on it, or by Enter or Space on
// the button naming it (pickButton); its other buttons are their own.
/** @param {Model} model @param {HTMLElement} node @param {string} key @param {readonly number[]} leds */
function showsOnBoard(model, node, key, leds) {
    if (isShown(key)) node.dataset.picked = "true";
    node.addEventListener("click", (event) => {
        if (/** @type {Element} */ (event.target).closest("button:not(.row-pick)")) return;
        toggleShown(key);
    });
    node.addEventListener("mouseenter", () => pointAt(leds));
    node.addEventListener("mouseleave", () => pointAt(shownLeds(model)));
}

// A new accent starts in a colour that stands out from its stage's.
/** @param {Model} model @param {import("../../../contracts/edits.js").Colour | null} shade */
const standingOut = (model, shade) => {
    const [h] = hsv(shade);
    return {h: (h + 128) % 256, s: 255, v: Math.min(200, Number(model.rgb.maximumBrightness) || 200)};
};

// An accent's colour, as its swatch and words: its own, or its stage's.
/** @param {Model} model @param {AccentTable} target @param {Accent} row */
function colourCell(model, target, row) {
    if (inheritsStageColour(row.color)) {
        return `<span class="led-swatch swatch-off"></span><span class="muted">${esc(vocabulary(model).accents[target]?.stageColour || "")}</span>`;
    }
    return `<span class="led-swatch" style="background:${css(row.color)}"></span><code class="dim">${esc(hsvLabel(row.color))}</code>`;
}

/**
 * The Accents section of a stage's tab, or null for a stage without accents.
 * @param {Model} model @param {string} stage
 */
export function accentsSection(model, stage) {
    const whose = accentOwner(model, stage, picked());
    if (!whose) return null;
    const {target, owner} = whose;
    const canEdit = editGate(model, "lighting").editable;
    const editing = editingOn(model, stage);
    const name = ownerCalled(model, target, owner);
    const node = el(`<section class="span accents" data-accents="${esc(target)}">
        <div class="sect-h"><h4>${name ? `Accents · ${marked(model, ownerMark(model, target, owner), name)}` : "Accents"}</h4>
        <span class="right"><button class="btn tiny" data-act="add" ${canEdit && !editing ? "" : "disabled"}>Add accent</button></span></div>
        <p class="note">${phraseMarked(model, accentsWhen(model, target, owner))}</p></section>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="add"]')).addEventListener("click", () => {
        state.accent = {stage, target, every: false, index: null, leds: [], colour: standingOut(model, stageShade(model, target, owner, picked())), stageColour: false, adding: true};
        render();
    });

    // Accents for every layer, mode or state are edited wherever they light,
    // tagged as such; Base's, which light over the layers above it, on Base.
    const {here, beneath} = accentsFor(model, target, owner);
    const every = everyOwner(model, target), group = groupOwner(model, target, owner);
    const list = el(`<div class="accent-list"></div>`);
    for (const row of here) {
        const tag = every && row.owner === every ? vocabulary(model).accents[target].every
            : group && row.owner === group && group !== owner ? vocabulary(model).accents[target].group?.words : undefined;
        list.append(editing?.index === row.index ? accentEditor(model, editing, owner) : accentRow(model, stage, target, row, {editable: canEdit && !editing, tag}));
    }
    if (editing && editing.index === null) list.append(accentEditor(model, editing, owner));
    const base = model.layers?.[0];
    for (const row of beneath) list.append(accentRow(model, stage, target, row, {tag: `From ${ownerCalled(model, target, row.owner)}`,
        go: {label: `Go to ${ownerCalled(model, target, row.owner)}`, then: () => { showLayer(base?.index ?? 0); render(); }}}));
    if (!list.childElementCount) list.append(el(`<p class="note">No accents yet. Add one, then click or drag across keys on the board to pick its LEDs.</p>`));
    node.append(list);
    const budget = budgetNote(model);
    if (budget) node.append(budget);
    return node;
}

// How many accents and LED sets the keyboard holds, and how many are used,
// with what an LED set is, in the Memory card's words.
/** @param {Model} model */
function budgetNote(model) {
    const budget = accentBudget(model);
    if (!budget.length) return null;
    const sets = budget.find((count) => count.id === "lightingGroups");
    return el(`<p class="note accent-budget">${budget.map((count) => `${esc(count.label)}: ${esc(count.used)} of ${esc(count.limit)}`).join(" · ")}.
        ${esc(sets?.what || "")}</p>`);
}

// One accent: its LEDs, its colour, a tag when it lights for every layer,
// mode or state, and Change and Remove; one edited elsewhere (Base's on a
// layer above) says where, with a way there instead.
/** @param {Model} model @param {string} stage @param {AccentTable} target @param {Accent} row @param {{editable?: boolean, tag?: string, go?: {label: string, then: () => void}}} options */
function accentRow(model, stage, target, row, {editable = false, tag, go}) {
    const key = `${target}:${row.index}`;
    const node = el(`<div class="accent-row${go ? " from" : ""}" data-accent="${esc(key)}">
        ${pickButton(`accent:${key}`, isShown(key), `<span class="accent-leds mono">${esc(row.leds)}</span>`)}
        <span class="accent-colour">${colourCell(model, target, row)}</span>
        ${tag ? `<span class="tag">${esc(tag)}</span>` : ""}
        <span class="right row gap-8">${go
            ? `<button class="btn tiny ghost" data-act="go">${esc(go.label)}</button>`
            : `<button class="btn tiny ghost" data-act="change" ${editable ? "" : "disabled"}>Change</button>
               <button class="btn tiny ghost destructive" data-act="remove" ${editable ? "" : "disabled"}>Remove</button>`}</span></div>`);
    showsOnBoard(model, node, key, row.ledIndices);
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="go"]'))?.addEventListener("click", () => go?.then());
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="change"]'))?.addEventListener("click", () => {
        const stageColour = inheritsStageColour(row.color);
        const [h, s, v] = hsv(row.color);
        state.accent = {stage, target, every: row.owner === everyOwner(model, target), group: row.owner === groupOwner(model, target, row.owner), index: row.index, leds: [...row.ledIndices],
            colour: stageColour ? standingOut(model, stageShade(model, target, row.owner, picked())) : {h, s, v}, stageColour, adding: true};
        render();
    });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="remove"]'))?.addEventListener("click", () => post(edits.deleteAccent(target, row.index)));
    return node;
}

// The accent being added or changed: the LEDs picked on the board, whose it
// is (the tab's owner, `mine`, the group it is in, or all of them), and its
// colour, its own or its stage's. Nothing posts until it is kept.
/** @param {Model} model @param {Editing} editing @param {string} mine */
function accentEditor(model, editing, mine) {
    const {target} = editing;
    const words = vocabulary(model).accents[target];
    const fields = vocabulary(model).accentFields;
    const every = everyOwner(model, target);
    const count = editing.leds.length;
    const node = el(`<div class="accent-editor">
        <div class="row gap-8"><b>${editing.index === null ? "New accent" : "Change accent"}</b>
            <span class="muted">${count ? `${esc(count)} LED${count === 1 ? "" : "s"} picked` : "Click or drag across keys on the board to pick LEDs"}</span>
            <span class="right"><button class="btn tiny ghost" data-act="clear" ${count ? "" : "disabled"}>Clear LEDs</button></span></div>
        <div class="row gap-16 accent-choices"></div></div>`);
    const choices = /** @type {HTMLElement} */ (node.querySelector(".accent-choices"));
    const colourFrom = el(choiceField({label: vocabulary(model).lightingFields.colour, f: "lighting:accent:colour-from", current: editing.stageColour ? "stage" : "own",
        choices: [["own", fields.ownColour], ["stage", words.stageColour]]}));
    colourFrom.addEventListener("change", () => { editing.stageColour = choiceValue(colourFrom) === "stage"; render(); });
    choices.append(colourFrom);
    const group = groupOwner(model, target, mine);
    if (every) {
        const whose = el(choiceField({label: fields.lightsFor, f: "lighting:accent:owner", current: editing.every ? "every" : editing.group && group ? "group" : "mine",
            choices: [["mine", ownerCalled(model, target, mine)], ...(group ? [/** @type {[string, string]} */ (["group", words.group?.words || ""])] : []), ["every", words.every]]}));
        whose.addEventListener("change", () => { const value = choiceValue(whose); editing.every = value === "every"; editing.group = value === "group"; render(); });
        choices.append(whose);
    }
    if (editing.stageColour) node.append(el(`<p class="note">These LEDs take the colour their stage paints.</p>`));
    else node.append(colourEditor({identity: "lighting:accent:colour", colour: editing.colour, title: "Accent colour", maximumBrightness: model.rgb.maximumBrightness,
        onChange: (next) => { editing.colour = {h: Number(next.h), s: Number(next.s), v: Number(next.v)}; render(); }}));
    const actions = el(`<div class="row gap-8"><button class="btn primary" data-act="keep" ${count ? "" : "disabled"}>${esc(editWords(model.draft).keep("accent"))}</button>
        <button class="btn ghost" data-act="cancel">Cancel</button></div>`);
    node.append(actions);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="clear"]')).addEventListener("click", () => { editing.leds = []; render(); });
    /** @type {HTMLButtonElement} */ (actions.querySelector('[data-act="cancel"]')).addEventListener("click", () => { state.accent = null; render(); });
    /** @type {HTMLButtonElement} */ (actions.querySelector('[data-act="keep"]')).addEventListener("click", () => {
        const accent = {target, owner: editingOwner(model, editing), leds: editing.leds, colour: editing.stageColour ? {h: 0, s: 0, v: 0} : editing.colour};
        post(editing.index === null ? edits.addAccent(accent) : edits.updateAccent(editing.index, accent));
        state.accent = null;
        render();
    });
    return node;
}

/**
 * All accents: every one, by the stage that paints it and its owner. They
 * are changed on their stage's tab, which Open shows; clicking an owner's
 * keeps its accents' LEDs glowing on the board.
 * @param {Model} model
 */
export function accentsOverview(model) {
    const node = el(`<div class="stack gap-16 accents-overview">
        <p class="note">Every accent, by the stage that paints it. An accent is changed on its stage's tab.</p></div>`);
    const stages = allAccents(model);
    if (!stages.length) node.append(el(`<p class="note">No accents yet. Add one on Layer colours, Pointing modes, Combo feedback, Behaviour feedback or Replacement feedback.</p>`));
    for (const {stage, target, owners} of stages) {
        const label = vocabulary(model).stages.find((entry) => entry.id === stage)?.label || stage;
        const box = el(`<section><div class="sect-h"><h4>${esc(label)}</h4></div><div class="accent-list"></div></section>`);
        const list = /** @type {HTMLElement} */ (box.querySelector(".accent-list"));
        for (const {owner, rows} of owners) {
            const key = `${target}:${owner}`;
            const called = ownerCalled(model, target, owner) || label;
            const line = el(`<div class="accent-row" data-owner="${esc(key)}">
                ${pickButton(`accent-owner:${key}`, isShown(key), `<b>${marked(model, ownerMark(model, target, owner), called)}</b>`)}
                <span class="accent-colours">${rows.map((row) => `<span class="accent-colour">${inheritsStageColour(row.color)
                    ? `<span class="led-swatch swatch-off"></span>` : `<span class="led-swatch" style="background:${css(row.color)}"></span>`}<span class="accent-leds mono">${esc(row.leds)}</span></span>`).join("")}</span>
                <span class="right"><button class="btn tiny ghost" data-act="open">Open</button></span></div>`);
            showsOnBoard(model, line, key, rows.flatMap((row) => row.ledIndices));
            /** @type {HTMLButtonElement} */ (line.querySelector('[data-act="open"]')).addEventListener("click", () => {
                // An accent for every layer, mode or state lights on each,
                // so it opens on the one already picked.
                const place = ownerPlace(model, target, owner);
                state.stage = stage;
                if (place.layer !== undefined) showLayer(place.layer);
                if (place.slot !== undefined) state.pointingSlot = place.slot;
                if (place.feedbackRow !== undefined) state.feedbackRow = /** @type {typeof state.feedbackRow} */ (place.feedbackRow);
                if (place.replacementRow !== undefined) state.replacementRow = place.replacementRow;
                render();
            });
            list.append(line);
        }
        node.append(box);
    }
    const budget = budgetNote(model);
    if (budget) node.append(budget);
    return node;
}
