// @ts-check
// Lighting: the same shape as Keys. The board is the constant, with the layer
// tabs on it, and each stage owns a full-width surface in the workbench, whose
// tabs are the stages in the order the firmware paints them.

// Selector assertions refer to elements created by this module's authored markup.
import {css, isOff} from "../lib/colour.mjs";
import {el, esc} from "../lib/dom.mjs";
import {TRACKBALL_LED} from "../view/geometry.mjs";
import {baseColour, feedbackColours, layerColourRow, lightingOff, pdColourRow, pdTrigger, stageEnabled, stageIdle, stageInEffect} from "../view/lighting.mjs";
import {slotCalled, stageOrder} from "../view/vocabulary.mjs";
import {canEdit as canEditArea, currentLayer, getModel, layerName, layers, post, render, state, writable, heldLayers} from "../store.mjs";
import * as edits from "../view/edits.mjs";
import {board} from "./board.mjs";
import {keepInView, layerBar} from "./layerbar.mjs";
import {attachLayersControl} from "./layers.mjs";
import {topbar, unavailable} from "./frame.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {localityLabel} from "./lighting/common.mjs";
import {stageBody} from "./lighting/stage-body.mjs";
import {durationControl} from "./duration.mjs";
import {sectionsIn} from "./settings.mjs";

/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} id */
const stageBit = (model, id) => (model?.rgb?.stages || []).find((stage) => stage.id === id)?.bit;

export function screenLighting() {
    const model = getModel();
    if (!model?.rgb?.stages) {
        return el(`<div class="main">${topbar("Lighting", "Nothing read yet.")}
            <div class="content"><div class="pad"><div class="screen-stub"><h3>No lighting read</h3>
            <p class="note">${esc(unavailable(model) || "Choose Read keyboard to load this keyboard's lighting.")}</p></div></div></div></div>`);
    }
    const onGroups = state.stage === "groups";
    const layer = currentLayer();
    const main = el(`<div class="main">${topbar(
        "Lighting",
        "What the keyboard lights, and when. Each stage paints over the one before it, and the board shows the result of your draft."
    )}</div>`);
    const power = powerControls(model);
    if (power) main.querySelector(".topbar-actions")?.prepend(power);

    const content = el(`<div class="content"><div class="pad keys-pad"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    // The board, what it is showing and the layer tabs under them are one
    // card, as on Keys; on LED groups the board is the LED selector instead.
    const card = el(`<div class="board-card"></div>`);
    const preview = state.stage === "pd" && state.pdPreview && stageEnabled(model, "pd")
        ? pdColourRow(model, state.pdSlot) : null;
    card.appendChild(board(model, layer, {
        mode: onGroups ? "leds" : "light",
        faces: !onGroups,
        held: onGroups ? [] : heldLayers(),
        picks: state.ledPicks,
        trackball: state.trackball,
        pdActive: preview ? {mode: preview.pointingMode, color: preview.color, locality: preview.locality, triggerIndex: pdTrigger(model, layer, state.pdSlot)?.layoutIndex} : null,
        onKey: onGroups ? (index) => {
            state.ledPicks = state.ledPicks.includes(index)
                ? state.ledPicks.filter((value) => value !== index) : [...state.ledPicks, index];
            render();
        } : undefined,
        onTrackball: onGroups ? () => { state.trackball = !state.trackball; render(); } : undefined,
    }));
    card.appendChild(el(`<div class="board-foot">
        <b>${onGroups ? "LED selector" : "Preview"}</b>
        <span class="board-foot-text">${onGroups
            ? `click physical LEDs to build a group · ${state.ledPicks.length} selected${state.trackball ? " + trackball" : ""}`
            : `${esc(layerName(layer))}${heldLayers().some((at) => at > 0) && !onGroups
                ? ` with ${esc(heldLayers().filter((at) => at > 0).reverse().map((at) => layerName(layers()[at])).join(", "))} on`
                : ""} over the background effect${preview
                ? ` · ${esc(slotName(model, state.pdSlot))} held, painting ${esc(localityLabel(preview.locality).toLowerCase())}`
                : ""}`}</span>
        ${onGroups ? `<span class="right">
            <button class="btn tiny ghost" data-act="clearleds">Clear selection</button>
            <button class="btn tiny ${state.trackball ? "primary" : "ghost"}" data-act="trackball"
                data-tip="Add or remove the trackball LED, index ${TRACKBALL_LED}, from this selection.">Trackball LED</button></span>`
            : ""}
    </div>`));
    /** @type {HTMLButtonElement | null} */ (card.querySelector('[data-act="clearleds"]'))?.addEventListener("click", () => { state.ledPicks = []; render(); });
    /** @type {HTMLButtonElement | null} */ (card.querySelector('[data-act="trackball"]'))?.addEventListener("click", () => { state.trackball = !state.trackball; render(); });
    // The same strip as Keys, Rename & Reorder included: a layer is renamed
    // and reordered wherever its tabs are.
    const bar = layerBar();
    attachLayersControl(bar);
    card.append(bar);
    pad.appendChild(card);

    const marks = draftMarks(model?.draft?.changes);
    // The stage tabs are the paint order: numbered as the firmware paints
    // them, each in the colour it paints now, a stage that is off drawn off.
    // LED groups is no stage; every stage can draw on them.
    const stages = stageOrder(model);
    /** @param {{id: string, label: string}} stage @param {number} index */
    const stageTab = (stage, index) => {
        const on = stageInEffect(model, stage.id), colour = stageColour(model, stage.id), lit = on && colour && !isOff(colour);
        const idle = stageIdle(model, stage.id);
        return `<button role="tab" class="${on ? "" : "off"}" data-ltab="${esc(stage.id)}" aria-selected="${state.stage === stage.id}"
            data-tip="Painted ${esc(index + 1)} of ${stages.length}${on ? "" : ` · ${esc(lightingOff(model) ? "All lighting is off, so nothing paints" : idle || "this stage is off")}`}">
            <span class="n">${esc(index + 1)}</span><i class="swatch ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(colour)}` : ""}"></i>
            <span class="tab-label">${esc(stage.label)}</span>${marks.lighting.has(stage.id) ? draftDot() : ""}</button>`;
    };
    const bench = el(`<div class="card bench">
        <div class="bench-tabs"><div class="bench-tablist" role="tablist" aria-label="Lighting stages, in paint order">
            ${stages.map(stageTab).join(`<span class="tab-step" aria-hidden="true">›</span>`)}
            <span class="tab-sep" aria-hidden="true"></span>
            <button role="tab" data-ltab="groups" aria-selected="${onGroups}"><span class="tab-label">LED groups</span>${marks.lighting.has("groups") ? draftDot() : ""}</button></div>
            <span class="bench-right" id="benchRight"></span>
        </div>
        <div class="bench-body" id="benchBody"></div>
    </div>`);
    /** @type {NodeListOf<HTMLElement>} */ (bench.querySelectorAll("[data-ltab]")).forEach((button) => button.addEventListener("click", () => {
        state.stage = /** @type {string} */ (button.dataset.ltab);
        render();
    }));
    const right = /** @type {HTMLElement} */ (bench.querySelector("#benchRight"));
    const bit = stageBit(model, state.stage);
    if (bit !== undefined) right.appendChild(stageSwitch(model, state.stage, bit));
    stageBody(/** @type {HTMLElement} */ (bench.querySelector("#benchBody")));
    keepInView(/** @type {HTMLElement} */ (bench.querySelector(".bench-tablist")));
    pad.appendChild(bench);

    main.appendChild(content);
    return main;
}

const slotName = slotCalled;

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
    const editable = canEditArea("settings");
    const node = el(`<div class="settings-group lighting-power" data-section="${esc(section.id)}">
        <label class="sw" data-tip="${esc([toggle.hint, toggle.tooltip].filter(Boolean).join(" "))}"><input type="checkbox" data-macro="${esc(toggle.macro)}" data-f="setting:${esc(toggle.macro)}" ${toggle.enabled ? "checked" : ""} ${editable && !toggle.readOnly ? "" : "disabled"}>
            <span class="track"></span><span class="txt">${esc(toggle.label)}${draftMarks(model?.draft?.changes).settings.has(section.id) ? draftDot() : ""}</span></label>
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

/** @param {import("../../contracts/panel.js").PublishedModel} model @param {string} id @param {number} bit */
function stageSwitch(model, id, bit) {
    const on = stageEnabled(model, id);
    const node = el(`<label class="sw" data-tip="Turn this whole stage off without losing the colours it stores.">
        <input data-f="lighting:${esc(id)}:enabled" type="checkbox" ${on ? "checked" : ""} ${writable() ? "" : "disabled"}><span class="track"></span>
        <span class="txt">${on ? "Stage on" : "Stage off"}</span></label>`);
    /** @type {HTMLInputElement} */ (node.querySelector("input")).addEventListener("change", (event) => {
        const mask = model.rgb.stageEnableMask ?? 0;
        post(edits.rgbStages(mask, bit, /** @type {HTMLInputElement} */ (event.target).checked));
    });
    return node;
}

// The colour a stage paints now, for its tab: the layer shown, the pointing
// mode picked, the hold colour for key feedback.
/** @param {import("../../contracts/panel.js").PublishedModel} model @param {string} id */
function stageColour(model, id) {
    return /** @type {Record<string, () => import("../../contracts/edits.js").Colour | null | undefined>} */ ({
        base: () => baseColour(model),
        layers: () => layerColourRow(model, currentLayer()?.index)?.color,
        auto: () => model.rgb.automouseFade?.end_color,
        pd: () => pdColourRow(model, state.pdSlot)?.color,
        combo: () => model.rgb.comboFeedback?.color,
        key: () => feedbackColours(model).hold,
    })[id]?.();
}
