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
import {accentBudget, accentOwner, accentsFor, allAccents, everyOwner, groupOwner, ownerCalled, ownerMark, ownerPlace, stageShade} from "../../view/accents.mjs";
import {inheritsStageColour} from "../../view/lighting.mjs";
import {colourEditor} from "../colour-editor.mjs";
import {pickButton} from "../groups.mjs";
import {choiceField, choiceValue} from "../segmented.mjs";
import {marked} from "../marks.mjs";
import {accentsInfo} from "./help.mjs";
import {stageBar} from "./common.mjs";

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

// An accent's colour, as its swatch and words: its own, or its stage's,
// drawn in the colour the stage paints for what the tab has picked, so
// "Same as the mode" shows which colour that is.
/** @param {Model} model @param {AccentTable} target @param {Accent} row */
function colourCell(model, target, row) {
    return inheritsStageColour(row.color)
        ? `${accentSwatch(model, target, row)}<span class="muted">${esc(vocabulary(model).accents[target]?.stageColour || "")}</span>`
        : `${accentSwatch(model, target, row)}<code class="dim">${esc(hsvLabel(row.color))}</code>`;
}

// An accent's swatch: its own colour, or the colour its stage paints for its
// owner, hatched where that is passthrough.
/** @param {Model} model @param {AccentTable} target @param {Accent} row */
function accentSwatch(model, target, row) {
    const shade = inheritsStageColour(row.color) ? stageShade(model, target, row.owner, picked()) : row.color;
    return `<span class="led-swatch${shade ? "" : " swatch-off"}" style="${shade ? `background:${css(shade)}` : ""}"></span>`;
}

// Dropping the accent being edited posts nothing.
const cancelAccent = () => { state.accent = null; render(); };

// Scrolls the board into view, whole where it fits: an accent's LEDs are
// picked there, and Open shows one there.
const boardInView = () => document.querySelector(".keys-pad > .board-card")?.scrollIntoView({block: "nearest"});

/**
 * The Accents section of a stage's tab, or null for a stage without accents.
 * Its accents are grouped by who they light for, so it is plain which light
 * for the item picked alone and which for every item, wherever they are
 * changed: the item's own first, then those for a group of items (Every tap
 * branch), those for all of them, and Base's, which light over the layers
 * above it and are changed on Base.
 * @param {Model} model @param {string} stage
 */
export function accentsSection(model, stage) {
    const whose = accentOwner(model, stage, picked());
    if (!whose) return null;
    const {target, owner} = whose;
    const canEdit = editGate(model, "lighting").editable;
    const editing = editingOn(model, stage);
    const words = vocabulary(model).accents[target];
    const name = ownerCalled(model, target, owner);
    const node = el(`<section class="span accents" data-accents="${esc(target)}">
        <div class="sect-h"><h4>Accents</h4>${accentsInfo(model, target)}
        <span class="right"><button class="btn tiny" data-act="add" ${canEdit && !editing ? "" : "disabled"}>Add accent</button></span></div></section>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="add"]')).addEventListener("click", () => {
        state.accent = {stage, target, every: false, index: null, leds: [], colour: standingOut(model, stageShade(model, target, owner, picked())), stageColour: false, adding: true};
        render();
        boardInView();
    });

    const {here, beneath} = accentsFor(model, target, owner);
    const every = everyOwner(model, target), group = groupOwner(model, target, owner);
    // Whom an accent lights for: all of the table's owners, a group of them, or the one picked.
    const scopeOf = (/** @type {string} */ whose) => (every && whose === every) ? "every" : (group && whose === group && group !== owner) ? "group" : "own";
    /** @type {{id: string, scope: string, rows: Accent[]}[]} */
    const bands = [
        {id: "own", scope: name ? "" : words.every.toLowerCase(), rows: here.filter((row) => scopeOf(row.owner) === "own")},
        ...(words.group && group && group !== owner ? [{id: "group", scope: words.group.words.toLowerCase(), rows: here.filter((row) => scopeOf(row.owner) === "group")}] : []),
        ...(every ? [{id: "every", scope: words.every.toLowerCase(), rows: here.filter((row) => scopeOf(row.owner) === "every")}] : []),
    ];
    const list = el(`<div class="accent-list"></div>`);
    const any = here.length || beneath.length || editing;
    for (const band of bands) {
        const editedHere = editing && editing.index !== null && band.rows.some((row) => row.index === editing.index);
        if (!band.rows.length && band.id !== "own") continue;
        // A band names whom its accents light for, the item picked by its mark (D-L31).
        if (any) list.append(el(`<div class="accent-band" data-band="${esc(band.id)}">For ${band.scope ? esc(band.scope) : marked(model, ownerMark(model, target, owner), name)}</div>`));
        if (any && !band.rows.length && !(editing && editing.index === null)) list.append(el(`<p class="note accent-none">None yet.</p>`));
        for (const row of band.rows) {
            list.append(editedHere && editing?.index === row.index ? accentEditor(model, editing, owner)
                : accentRow(model, stage, target, row, {editable: canEdit && !editing, scope: band.id === "own" ? "" : band.scope}));
        }
        if (band.id === "own" && editing && editing.index === null) list.append(accentEditor(model, editing, owner));
    }
    if (beneath.length) {
        const base = model.layers?.[0];
        list.append(el(`<div class="accent-band" data-band="beneath">From ${marked(model, ownerMark(model, target, beneath[0].owner), ownerCalled(model, target, beneath[0].owner))}</div>`));
        for (const row of beneath) list.append(accentRow(model, stage, target, row, {
            go: {label: `Go to ${ownerCalled(model, target, row.owner)}`, then: () => { showLayer(base?.index ?? 0); render(); }}}));
    }
    if (!any) list.append(el(`<p class="note">No accents yet. Add one, then click or drag across keys on the board to pick its LEDs.</p>`));
    node.append(list);
    const budget = budgetNote(model);
    if (budget) node.append(budget);
    return node;
}

// How many accents and LED sets the keyboard holds, and how many are used:
// the whole keyboard's count, said so. What an LED set is, is on the
// Accents info mark.
/** @param {Model} model */
function budgetNote(model) {
    const budget = accentBudget(model);
    if (!budget.length) return null;
    return el(`<p class="note accent-budget">On the keyboard: ${budget.map((count) => `${esc(count.label)} ${esc(count.used)} of ${esc(count.limit)}`).join(" · ")}</p>`);
}

// One accent: its LEDs, its colour, and Change and Remove, which say whom
// they change it for when it lights for more than the item picked (`scope`);
// one edited elsewhere (Base's on a layer above) offers a way there instead.
/** @param {Model} model @param {string} stage @param {AccentTable} target @param {Accent} row @param {{editable?: boolean, scope?: string, go?: {label: string, then: () => void}}} options */
function accentRow(model, stage, target, row, {editable = false, scope, go}) {
    const key = `${target}:${row.index}`;
    const node = el(`<div class="accent-row${go ? " from" : ""}" data-accent="${esc(key)}">
        ${pickButton(`accent:${key}`, isShown(key), `<span class="accent-leds mono">${esc(row.leds)}</span>`)}
        <span class="accent-colour">${colourCell(model, target, row)}</span>
        <span class="right row gap-8">${go
            ? `<button class="btn tiny ghost" data-act="go">${esc(go.label)}</button>`
            : `<button class="btn tiny ghost" data-act="change" ${editable ? "" : "disabled"}${scope ? ` data-tip="Changes it for ${esc(scope)}."` : ""}>Change</button>
               <button class="btn tiny ghost destructive" data-act="remove" ${editable ? "" : "disabled"}${scope ? ` data-tip="Removes it for ${esc(scope)}."` : ""}>Remove</button>`}</span></div>`);
    showsOnBoard(model, node, key, row.ledIndices);
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="go"]'))?.addEventListener("click", () => go?.then());
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="change"]'))?.addEventListener("click", () => {
        const stageColour = inheritsStageColour(row.color);
        const [h, s, v] = hsv(row.color);
        state.accent = {stage, target, every: row.owner === everyOwner(model, target), group: row.owner === groupOwner(model, target, row.owner), index: row.index, leds: [...row.ledIndices],
            colour: stageColour ? standingOut(model, stageShade(model, target, row.owner, picked())) : {h, s, v}, stageColour, adding: true};
        render();
        boardInView();
    });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="remove"]'))?.addEventListener("click", () => post(edits.deleteAccent(target, row.index)));
    return node;
}

// Keeping the accent being edited posts it, its owner as the editor has
// it; cancelling drops it. Nothing posts before.
/** @param {Model} model @param {Editing} editing */
function keepAccent(model, editing) {
    const accent = {target: editing.target, owner: editingOwner(model, editing), leds: editing.leds, colour: editing.stageColour ? {h: 0, s: 0, v: 0} : editing.colour};
    post(editing.index === null ? edits.addAccent(accent) : edits.updateAccent(editing.index, accent));
    state.accent = null;
    render();
}

// Keep, Cancel and Clear LEDs, for the row under the board while its LEDs
// are picked (lighting.mjs), so an accent is finished where it is picked;
// the editor in the list ends with Keep and Cancel too.
/** @param {Model} model @param {string} stage */
export function accentActions(model, stage) {
    const editing = editingOn(model, stage);
    if (!editing) return null;
    const count = editing.leds.length;
    const node = el(`<span class="right"><button class="btn tiny ghost" data-act="clear-leds" ${count ? "" : "disabled"}>Clear LEDs</button>
        <button class="btn tiny ghost" data-act="cancel-accent">Cancel</button>
        <button class="btn tiny primary" data-act="keep-accent" ${count ? "" : "disabled"}>${esc(editWords(model.draft).keep("accent"))}</button></span>`);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="clear-leds"]')).addEventListener("click", () => { editing.leds = []; render(); });
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="cancel-accent"]')).addEventListener("click", cancelAccent);
    /** @type {HTMLButtonElement} */ (node.querySelector('[data-act="keep-accent"]')).addEventListener("click", () => keepAccent(model, editing));
    return node;
}

// The accent being added or changed: whose it is (the tab's owner, `mine`,
// the group it is in, or all of them) and its colour, its own or its
// stage's, laid out as the stage's own colour and where it paints are, so
// its colour editor is the same width. Its LEDs are picked on the board.
/** @param {Model} model @param {Editing} editing @param {string} mine */
function accentEditor(model, editing, mine) {
    const {target} = editing;
    const words = vocabulary(model).accents[target];
    const fields = vocabulary(model).accentFields;
    const every = everyOwner(model, target);
    const count = editing.leds.length;
    const node = el(`<div class="accent-editor">
        <div class="row gap-8"><b>${editing.index === null ? "New accent" : "Change accent"}</b>
            <span class="muted">${count ? `${esc(count)} LED${count === 1 ? "" : "s"} picked on the board` : "Click or drag across keys on the board to pick LEDs"}</span></div>
        <div class="accent-cols"><div class="accent-colour-col"></div><div class="stack gap-12 accent-choices"></div></div></div>`);
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
    const colourCol = /** @type {HTMLElement} */ (node.querySelector(".accent-colour-col"));
    if (editing.stageColour) colourCol.append(el(`<p class="note">These LEDs take the colour their stage paints.</p>`));
    else colourCol.append(colourEditor({identity: "lighting:accent:colour", colour: editing.colour, title: "Accent colour", maximumBrightness: model.rgb.maximumBrightness,
        onChange: (next) => { editing.colour = {h: Number(next.h), s: Number(next.s), v: Number(next.v)}; render(); }}));
    const actions = el(`<div class="row gap-8"><button class="btn primary" data-act="keep" ${count ? "" : "disabled"}>${esc(editWords(model.draft).keep("accent"))}</button>
        <button class="btn ghost" data-act="cancel">Cancel</button></div>`);
    node.append(actions);
    /** @type {HTMLButtonElement} */ (actions.querySelector('[data-act="cancel"]')).addEventListener("click", cancelAccent);
    /** @type {HTMLButtonElement} */ (actions.querySelector('[data-act="keep"]')).addEventListener("click", () => keepAccent(model, editing));
    return node;
}

/**
 * All accents: every one, by the stage that paints it and its owner. They
 * are changed on their stage's tab, which Open shows; clicking an owner's
 * keeps its accents' LEDs glowing on the board.
 * @param {Model} model
 */
export function accentsOverview(model) {
    const node = el(`<div class="stage" data-stage="accents"></div>`);
    const budget = budgetNote(model);
    node.append(stageBar(model, "accents", {note: "Every accent, by the stage that paints it.", end: budget}));
    const box = el(`<div class="stack gap-16 accents-overview"></div>`);
    node.append(box);
    const stages = allAccents(model);
    if (!stages.length) box.append(el(`<p class="note">No accents yet. Add one on Layer colours, Pointing modes, Combo feedback, Behaviour feedback or Replacement feedback.</p>`));
    for (const {stage, target, owners} of stages) {
        const label = vocabulary(model).stages.find((entry) => entry.id === stage)?.label || stage;
        const section = el(`<section><div class="sect-h"><h4>${esc(label)}</h4></div><div class="accent-list"></div></section>`);
        const list = /** @type {HTMLElement} */ (section.querySelector(".accent-list"));
        for (const {owner, rows} of owners) {
            const key = `${target}:${owner}`;
            const called = ownerCalled(model, target, owner) || label;
            const line = el(`<div class="accent-row" data-owner="${esc(key)}">
                ${pickButton(`accent-owner:${key}`, isShown(key), `<b>${marked(model, ownerMark(model, target, owner), called)}</b>`)}
                <span class="accent-colours">${rows.map((row) => `<span class="accent-colour">${accentSwatch(model, target, row)}<span class="accent-leds mono">${esc(row.leds)}</span></span>`).join("")}</span>
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
                // It lands with its first accent's LEDs glowing, the board in view.
                state.accentShown = rows.length ? {stage, key: `${target}:${rows[0].index}`} : null;
                render();
                boardInView();
            });
            list.append(line);
        }
        box.append(section);
    }
    return node;
}
