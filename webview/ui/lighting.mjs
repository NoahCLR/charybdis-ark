// @ts-check
// Lighting: the same shape as Keys. The board is the constant, with the layer
// tabs on it, and each stage owns a full-width surface in the workbench, whose
// tabs are the stages in the order the firmware paints them.

// Selector assertions refer to elements created by this module's authored markup.
import {css} from "../lib/colour.mjs";
import {el, esc} from "../lib/dom.mjs";
import {baseColour, isOff, isPassthrough, layerColourRow, lightingOff, pdColourRow, stageIdle, stageInEffect} from "../view/lighting.mjs";
import {said, stageOrder} from "../view/vocabulary.mjs";
import {currentLayer, currentView, getModel, post, render, state} from "../store.mjs";
import {editGate} from "../view/edit-gate.mjs";
import * as edits from "../view/edits.mjs";
import {board} from "./board.mjs";
import {keepInView, layerBar} from "./layerbar.mjs";
import {linkTabPanel, rovingTabs} from "../lib/tabs.mjs";
import {attachLayersControl} from "./layers.mjs";
import {topbar} from "./frame.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {stageBody} from "./lighting/stage-body.mjs";
import {accentActions, accentPicks, editingOn, glowShown, pickLed} from "./lighting/accents.mjs";
import {boardShortcuts} from "./lighting/help.mjs";
import {attachInfoMarks} from "./info-mark.mjs";
import {holdComboFrom} from "../view/combo-held.mjs";
import {lightingBoard} from "../view/lighting-board.mjs";
import {feedbackCase, replacementOwner, replacementRowOf} from "../view/accents.mjs";
import {durationControl} from "./duration.mjs";
import {phraseMarked} from "./marks.mjs";
import {sectionsIn} from "../view/settings-layout.mjs";

export function screenLighting() {
    const model = getModel();
    if (!model?.rgb?.stages) {
        return el(`<div class="main">${topbar("Lighting", "Nothing read yet.")}
            <div class="content"><div class="pad"><div class="screen-stub"><h3>No lighting read</h3>
            <p class="note">${esc(editGate(model, "lighting").why || "Choose Read keyboard to read this keyboard's lighting.")}</p></div></div></div></div>`);
    }
    const view = currentView();
    const main = el(`<div class="main">${topbar(
        "Lighting",
        "What the keyboard lights, and when."
    )}</div>`);
    const power = powerControls(model);
    if (power) main.querySelector(".topbar-actions")?.prepend(power);

    const content = el(`<div class="content"><div class="pad keys-pad"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    // The board, what it is showing and the layer tabs under them are one
    // card, as on Keys. Nothing on it is frosted: a key falling through
    // shows the light the keyboard does, solid. Each key carries its LED's
    // index (D-L77); while an accent is added or changed, a press or a drag
    // picks its LEDs and the board shows them in its colour.
    const card = el(`<div class="board-card"></div>`);
    // On Pointing modes the board shows the picked mode running, and on
    // Combo feedback a combo held that fires in this view, its keys ringed
    // as the Keymap rings them; a ringed key holds its input. On Behaviour
    // feedback and Replacement feedback it shows the picked case, the key
    // standing in for the one that shows it ringed solid
    // (view/lighting-board.mjs).
    const shows = lightingBoard(view, {stage: state.stage, pointingSlot: state.pointingSlot, comboPreview: state.comboPreview, feedbackRow: state.feedbackRow, replacementRow: state.replacementRow});
    const held = shows.held;
    const editing = editingOn(model, state.stage);
    const stage = state.stage;
    const drawn = card.appendChild(board(shows.shown, {
        ledIndex: true,
        glass: false,
        card: false,
        accent: accentPicks(model, stage),
        pdActive: shows.pdActive,
        comboActive: shows.comboActive,
        behaviourActive: shows.behaviourActive,
        replacementActive: shows.replacementActive,
        reach: held && !editing ? held.ring : [],
        holding: editing ? [] : held ? held.held : shows.standIn === undefined ? [] : [shows.standIn],
        onKey: held && !editing ? (index) => {
            const next = holdComboFrom(view, state.comboPreview, index);
            if (next) { state.comboPreview = next; render(); }
        } : undefined,
        onLed: editing ? (led, starting) => pickLed(model, stage, led, starting) : undefined,
    }));
    if (editing) drawn.classList.add("picking-leds");
    // The accent clicked in a list keeps its LEDs glowing, however far the
    // list is scrolled.
    glowShown(model, drawn);
    // The caption lies over the board's bottom-left corner, which the drawing
    // leaves empty, and wraps there, so the card stays as tall as the
    // Keymap's and the caption is read whole; while LEDs are picked, the
    // instructions take a row under the board instead, so none of them is cut.
    const foot = el(`<div class="board-foot">
        <b>${editing ? "Picking LEDs" : "Preview"}</b>
        <span class="board-foot-text"${editing ? ` data-tip="${esc(said(shows.caption))}"` : ""}>${editing
            ? `Click or drag across keys to pick the accent's LEDs, or take them back · ${esc(editing.leds.length)} picked`
            : phraseMarked(model, shows.caption)}</span>
    </div>`);
    if (editing) {
        // An accent is finished where its LEDs are picked.
        const actions = accentActions(model, stage);
        if (actions) foot.append(actions);
        card.appendChild(foot);
    } else drawn.appendChild(foot);
    // The board's shortcuts, on its top-right corner as on the Keymap's.
    const shortcuts = el(boardShortcuts({picking: Boolean(editing), ringed: Boolean(held?.choice && !editing)}));
    attachInfoMarks(shortcuts);
    drawn.appendChild(shortcuts);
    // The same strip as Keys, Rename & Reorder included: a layer is renamed
    // and reordered wherever its tabs are.
    const bar = layerBar();
    attachLayersControl(bar);
    card.append(bar);
    linkTabPanel(/** @type {HTMLElement | null} */ (bar.querySelector(".layer-tabs")), drawn);
    pad.appendChild(card);

    const marks = draftMarks(model?.draft?.changes);
    // The stage tabs are the paint order: numbered as the firmware paints
    // them, each in the colour it paints now, a stage that is off drawn off.
    // All accents is no stage: it lists every stage's accents.
    const stages = stageOrder(model);
    // A tab's swatch is the colour the stage paints for what it has picked:
    // hollow while the stage paints nothing, hatched for a passthrough
    // colour, dark and struck through for one that is off. Its label is the
    // stage's name, or its short word where the window is narrow (its stage
    // bar says the name whole); the numbers give the paint order.
    /** @param {{id: string, label: string, short?: string}} stage @param {number} index */
    const stageTab = (stage, index) => {
        const on = stageInEffect(model, stage.id), colour = stageColour(model, stage.id), lit = on && colour && !isPassthrough(colour) && !isOff(colour);
        const idle = stageIdle(model, stage.id);
        const mark = lit ? "" : !on || !colour ? "swatch-off" : isPassthrough(colour) ? "swatch-pass" : "swatch-dark";
        return `<button role="tab" id="stage-tab-${esc(stage.id)}" class="${on ? "" : "off"}" data-ltab="${esc(stage.id)}" aria-selected="${state.stage === stage.id}" aria-label="${esc(stage.label)}"
            data-tip="${esc(stage.label)} · painted ${esc(index + 1)} of ${stages.length}${on ? "" : ` · ${esc(lightingOff(model) ? "All lighting is off, so nothing paints" : idle || "this stage is off")}`}">
            <span class="n">${esc(index + 1)}</span><i class="swatch ${mark}" style="${lit ? `background:${css(colour)}` : ""}"></i>
            <span class="tab-label"><span class="long">${esc(stage.label)}</span><span class="short" aria-hidden="true">${esc(stage.short || stage.label)}</span></span>${marks.lighting.has(stage.id) ? draftDot(model?.draft) : ""}</button>`;
    };
    const bench = el(`<div class="card bench workbench lighting-bench">
        <div class="bench-tabs"><div class="bench-tablist" role="tablist" aria-label="Lighting stages, in paint order">
            ${stages.map(stageTab).join("")}
            <span class="tab-sep" aria-hidden="true"></span>
            <button role="tab" id="stage-tab-accents" data-ltab="accents" aria-selected="${state.stage === "accents"}"><span class="tab-label">All accents</span>${marks.lighting.has("accents") ? draftDot(model?.draft) : ""}</button></div>
            <span class="bench-right" id="benchRight"></span>
        </div>
        <div class="bench-body" id="benchBody"></div>
    </div>`);
    /** @type {NodeListOf<HTMLElement>} */ (bench.querySelectorAll("[data-ltab]")).forEach((button) => button.addEventListener("click", () => {
        state.stage = /** @type {string} */ (button.dataset.ltab);
        render();
    }));
    stageBody(/** @type {HTMLElement} */ (bench.querySelector("#benchBody")));
    keepInView(/** @type {HTMLElement} */ (bench.querySelector(".bench-tablist")));
    rovingTabs(/** @type {HTMLElement} */ (bench.querySelector(".bench-tablist")), /** @type {HTMLElement} */ (bench.querySelector("#benchBody")));
    pad.appendChild(bench);

    main.appendChild(content);
    return main;
}

// All lighting and its idle timeout darken every LED, every stage with them,
// so they sit above the stages rather than in one. The keyboard keeps them
// with its settings, so they save as one settings section.
/** @param {import("../../contracts/panel.js").PublishedModel} model */
function powerControls(model) {
    const section = sectionsIn(model, "Lighting").find((entry) => entry.id === "lightingPower");
    if (!section) return null;
    const toggle = section.fields.find((field) => field.macro === "lightingEnabled");
    const timeout = section.fields.find((field) => field.macro === "lightingTimeout");
    if (!toggle || !timeout) return null;
    const editable = editGate(model, "settings").editable;
    const node = el(`<div class="settings-group lighting-power" data-section="${esc(section.id)}">
        <label class="sw" data-tip="${esc([toggle.hint, toggle.tooltip].filter(Boolean).join(" "))}"><input type="checkbox" data-macro="${esc(toggle.macro)}" data-f="setting:${esc(toggle.macro)}" ${toggle.enabled ? "checked" : ""} ${editable && !toggle.readOnly ? "" : "disabled"}>
            <span class="track"></span><span class="txt">${esc(toggle.label)}${draftMarks(model?.draft?.changes).settings.has(section.id) ? draftDot(model?.draft) : ""}</span></label>
        <span class="lighting-timeout" data-tip="${esc(timeout.hint || "")}"><span class="muted">${esc(timeout.label)}</span></span></div>`);
    const submit = () => {
        if (duration.read() === null) { duration.reportValidity(); return; }
        post(edits.settingsSection(section, (field) => field.macro === toggle.macro
            ? /** @type {HTMLInputElement} */ (node.querySelector(`[data-macro="${toggle.macro}"]`)).checked
            : field.macro === timeout.macro ? duration.read() ?? undefined : undefined, model.settingsEditing?.identity));
    };
    const duration = durationControl(timeout, editable && !timeout.readOnly, submit);
    /** @type {HTMLElement} */ (node.querySelector(".lighting-timeout")).append(duration.node);
    /** @type {HTMLInputElement} */ (node.querySelector("input[type=checkbox]")).addEventListener("change", submit);
    return node;
}

// The colour a stage paints now, for its tab: the layer shown, the pointing
// mode picked, the case picked on behaviour feedback and on replacement
// feedback.
/** @param {import("../../contracts/panel.js").PublishedModel} model @param {string} id */
function stageColour(model, id) {
    return /** @type {Record<string, () => import("../../contracts/edits.js").Colour | null | undefined>} */ ({
        base: () => baseColour(model),
        layers: () => layerColourRow(model, currentLayer()?.index)?.color,
        auto: () => model.rgb.automouseFade?.end_color,
        pd: () => pdColourRow(model, state.pointingSlot)?.color,
        combo: () => model.rgb.comboFeedback?.color,
        key: () => feedbackCase(model, state.feedbackRow)?.color ?? feedbackCase(model, "tapCommittedColor")?.color,
        autocorrect: () => model.rgb.autocorrectFeedback?.[replacementRowOf(model, replacementOwner(model, state.replacementRow))],
    })[id]?.();
}
