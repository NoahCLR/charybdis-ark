// @ts-check
// Lighting: the same shape as Keys. The board is the constant, with the layer
// tabs on it, and each stage owns a full-width surface in the workbench, whose
// tabs are the stages in the order the firmware paints them. Lighting owns all
// light: the master switch, All lighting, sits in the topbar.

// Selector assertions refer to elements created by this module's authored markup.
import {css, isOff} from "../lib/colour.mjs";
import {el, esc} from "../lib/dom.mjs";
import {TRACKBALL_LED} from "../view/geometry.mjs";
import {allLightingOn, baseAnimated, baseShownColour, baseEffectName, baseSection, feedbackColours, layerColourRow, pdColourRow, pdTrigger, stageEnabled, stageIdle, stageInEffect} from "../view/lighting.mjs";
import {slotCalled, stageOrder} from "../view/vocabulary.mjs";
import {currentLayer, getModel, layerName, layers, post, render, state, heldLayers, canEdit as canEditArea, positionAt, writable} from "../store.mjs";
import {keyMeaning, keyName} from "../view/keyface.mjs";
import {keyNameMarked} from "./marks.mjs";
import {board} from "./board.mjs";
import {attachBoardToggle, keepInView, layerBar} from "./layerbar.mjs";
import {attachLayersControl} from "./layers.mjs";
import {topbar, unavailable} from "./shell.mjs";
import {bindLightCard} from "./hover.mjs";
import {draftDot, draftMarks} from "../view/review.mjs";
import {localityLabel} from "./lighting/common.mjs";
import {allLightingEdit, stageBody} from "./lighting/stage-body.mjs";
import {colourPickedKeys} from "./lighting/layers.mjs";
import {lightCard} from "./lighting/light-card.mjs";

bindLightCard(lightCard);

export function screenLighting() {
    const model = getModel();
    if (!model?.rgb?.stages) {
        return el(`<div class="main">${topbar("Lighting", "Nothing read yet.")}
            <div class="content"><div class="pad"><div class="screen-stub"><h3>No lighting read</h3>
            <p class="note">${esc(unavailable(model) || "Choose Read keyboard to load this keyboard's lighting.")}</p></div></div></div></div>`);
    }
    const onGroups = state.stage === "groups";
    const layer = currentLayer();
    const master = allLightingOn(model);
    const settings = baseSection(model);
    const main = el(`<div class="main">${topbar(
        "Lighting",
        "What the keyboard lights and when, stage by stage. The board shows your draft.",
        master === null ? "" : `<label class="sw" data-tip="QMK's RGB Matrix switch. Off, every LED stays dark: the base effect, layer colours and all feedback.">
            <input type="checkbox" data-f="lighting:all" ${master ? "checked" : ""} ${settings && canEditArea("settings") ? "" : "disabled"}><span class="track"></span>
            <span class="txt">All lighting</span></label>`
    )}</div>`);
    /** @type {HTMLInputElement | null} */ (main.querySelector('[data-f="lighting:all"]'))?.addEventListener("change", (event) => {
        if (settings) post(allLightingEdit(model, settings, /** @type {HTMLInputElement} */ (event.target).checked));
    });

    const content = el(`<div class="content"><div class="pad keys-pad${state.hideBoard ? " board-hidden" : ""}"></div></div>`);
    const pad = /** @type {HTMLElement} */ (content.firstElementChild);
    // The board, what it is showing and the layer tabs under them are one
    // card, as on Keys; on LED groups the board is the LED selector instead.
    const card = el(`<div class="board-card"></div>`);
    const previewRow = state.stage === "pd" && state.pdPreview && stageEnabled(model, "pd")
        ? pdColourRow(model, state.pdSlot) : null;
    // A trigger-local mode previews from the first key that starts it.
    const trigger = previewRow ? pdTrigger(model, layer, state.pdSlot) : null;
    const preview = previewRow ? {mode: previewRow.pointingMode, color: previewRow.color, locality: previewRow.locality, triggerIndex: trigger?.layoutIndex} : null;
    const onLayers = state.stage === "layers";
    if (!onLayers && state.colourPicks.length) state.colourPicks = [];
    const node = board(model, layer, {
        mode: onGroups ? "leds" : "light",
        faces: !onGroups,
        // Behaviour dots belong to Key feedback, combo badges to Combos: on
        // every other stage the board shows legends and light only.
        dots: state.stage === "key",
        badges: state.stage === "combo",
        held: onGroups ? [] : heldLayers(),
        picks: onGroups ? state.ledPicks : state.colourPicks,
        trackball: state.trackball,
        pdActive: preview,
        onKey: onGroups ? (index) => {
            state.ledPicks = state.ledPicks.includes(index)
                ? state.ledPicks.filter((value) => value !== index) : [...state.ledPicks, index];
            render();
        } : onLayers ? (index) => {
            // Picking keys on Layers gathers them to colour on the layer shown.
            state.colourPicks = state.colourPicks.includes(index)
                ? state.colourPicks.filter((value) => value !== index) : [...state.colourPicks, index];
            render();
        } : undefined,
        onTrackball: onGroups ? () => { state.trackball = !state.trackball; render(); } : undefined,
    });
    if (!onGroups) node.dataset.hover = "light";
    card.appendChild(node);
    card.appendChild(boardFoot(model, layer, {onGroups, preview, trigger}));
    // The same strip as Keys, Layers… included: a layer is renamed and
    // reordered wherever its tabs are.
    const bar = layerBar();
    attachLayersControl(bar);
    card.append(bar);
    pad.appendChild(card);

    const marks = draftMarks(model?.draft?.changes);
    // The stage tabs are the paint order, each in the colour it paints now,
    // a stage that is off drawn off. LED groups is no stage; every stage can
    // draw on them.
    const stages = stageOrder(model);
    /** @param {{id: string, label: string}} stage */
    const stageTab = (stage) => {
        const on = stageInEffect(model, stage.id) && master !== false, colour = stageColour(model, stage.id), lit = on && colour && !isOff(colour);
        const idle = master === false ? "All lighting is off" : stageIdle(model, stage.id);
        return `<button role="tab" class="${on ? "" : "off"}" data-ltab="${stage.id}" aria-selected="${state.stage === stage.id}"
            data-tip="${esc(stage.label)}${on ? "" : ` · ${esc(idle || "this stage is off")}`}">
            <i class="swatch ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(colour)}` : ""}"></i>
            <span class="tab-label" data-text="${esc(stage.label)}">${esc(stage.label)}</span>${marks.lighting.has(stage.id) ? draftDot() : ""}</button>`;
    };
    const bench = el(`<div class="card bench">
        <div class="bench-tabs"><div class="bench-tablist" role="tablist" aria-label="Lighting stages, in paint order">
            ${stages.map(stageTab).join("")}
            <span class="tab-sep" aria-hidden="true"></span>
            <button role="tab" data-ltab="groups" aria-selected="${onGroups}"><span class="tab-label" data-text="LED groups">LED groups</span>${marks.lighting.has("groups") ? draftDot() : ""}</button></div>
        </div>
        <div class="bench-body" id="benchBody"></div>
    </div>`);
    /** @type {NodeListOf<HTMLElement>} */ (bench.querySelectorAll("[data-ltab]")).forEach((button) => button.addEventListener("click", () => {
        state.stage = /** @type {string} */ (button.dataset.ltab);
        render();
    }));
    stageBody(/** @type {HTMLElement} */ (bench.querySelector("#benchBody")));
    keepInView(/** @type {HTMLElement} */ (bench.querySelector(".bench-tablist")));
    attachBoardToggle(/** @type {HTMLElement} */ (bench.querySelector(".bench-tabs")));
    pad.appendChild(bench);

    main.appendChild(content);
    return main;
}

// Under the board: what it is showing, in words, and on Layers the keys
// picked to colour.
/** @param {import("../../contracts/panel.js").PublishedModel} model @param {import("../../contracts/panel.js").Layer | undefined} layer @param {{onGroups: boolean, preview: {locality: string} | null, trigger: {layoutIndex: number, layer: number} | null}} options */
function boardFoot(model, layer, {onGroups, preview, trigger}) {
    if (onGroups) {
        const foot = el(`<div class="board-foot"><b>LED selector</b>
            <span class="board-foot-text">click physical LEDs to build a group · ${state.ledPicks.length} selected${state.trackball ? " + trackball" : ""}</span>
            <span class="right">
            <button class="btn text" data-act="clearleds">Clear selection</button>
            <button class="btn compact toggle" aria-pressed="${state.trackball}" data-act="trackball"
                data-tip="Add or remove the trackball LED, index ${TRACKBALL_LED}, from this selection.">Trackball LED</button></span></div>`);
        /** @type {HTMLButtonElement} */ (foot.querySelector('[data-act="clearleds"]')).addEventListener("click", () => { state.ledPicks = []; render(); });
        /** @type {HTMLButtonElement} */ (foot.querySelector('[data-act="trackball"]')).addEventListener("click", () => { state.trackball = !state.trackball; render(); });
        return foot;
    }
    if (state.stage === "layers" && state.colourPicks.length) {
        const count = state.colourPicks.length;
        const foot = el(`<div class="board-foot picks-foot"><b>${count} key${count === 1 ? "" : "s"}</b>
            <span class="board-foot-text">picked on the board</span>
            <span class="right">
            <button class="btn compact" data-act="colour-picks" ${writable() ? "" : "disabled"}>Colour them on ${esc(layerName(layer))}…</button>
            <button class="btn text" data-act="clear-picks">Clear</button></span></div>`);
        /** @type {HTMLButtonElement} */ (foot.querySelector('[data-act="colour-picks"]')).addEventListener("click", () => colourPickedKeys(model, layer));
        /** @type {HTMLButtonElement} */ (foot.querySelector('[data-act="clear-picks"]')).addEventListener("click", () => { state.colourPicks = []; render(); });
        return foot;
    }
    const held = heldLayers().filter((at) => at > 0);
    const master = allLightingOn(model);
    const what = master === false ? "All lighting is off, so every LED is dark."
        : `${layerName(layer)}${held.length ? ` with ${held.reverse().map((at) => layerName(layers()[at])).join(", ")} on` : ""} over the base effect${baseAnimated(model) ? ` (${baseEffectName(model) || "animated"}, animated)` : ""}`;
    let detail = "";
    if (preview && master !== false) {
        const where = localityLabel(preview.locality).toLowerCase();
        const local = preview.locality === "RGB_KEY_HALF" || preview.locality === "RGB_KEYS_ONLY";
        const on = trigger ? layers().find((row) => row.index === trigger.layer) : undefined;
        const from = trigger ? positionAt(on, trigger.layoutIndex) : undefined;
        detail = ` · ${esc(slotCalled(model, state.pdSlot))} held, painting ${esc(where)}${!local ? ""
            : from ? `, started from ${keyNameMarked(model, keyName(from), keyMeaning(from))} on ${esc(layerName(on))}`
            : ", with no key placed: the keyboard paints everywhere"}`;
    }
    return el(`<div class="board-foot"><b>Preview</b><span class="board-foot-text">${esc(what)}${detail}</span>
        ${state.stage === "layers" && master !== false ? `<span class="right note">Click keys to colour them on this layer</span>` : ""}</div>`);
}

// The colour a stage paints now, for its tab: the layer shown, the pointing
// mode picked, the hold colour for key feedback.
/** @param {import("../../contracts/panel.js").PublishedModel} model @param {string} id */
function stageColour(model, id) {
    return /** @type {Record<string, () => import("../../contracts/edits.js").Colour | null | undefined>} */ ({
        base: () => baseShownColour(model),
        layers: () => layerColourRow(model, currentLayer()?.index)?.color,
        auto: () => model.rgb.automouseFade?.mode === "FOLLOW_REAL_DESTINATION" ? null : model.rgb.automouseFade?.end_color,
        pd: () => pdColourRow(model, state.pdSlot)?.color,
        combo: () => model.rgb.comboFeedback?.color,
        key: () => feedbackColours(model).hold,
    })[id]?.();
}
