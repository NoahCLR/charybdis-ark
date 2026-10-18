// @ts-check
// Selector assertions refer to elements created by this module's authored markup.
import {el, esc} from "../../lib/dom.mjs";
import {getModel, post, state, writable, canEdit as canEditArea} from "../../store.mjs";
import {allLightingOn, baseSection, stageEnabled} from "../../view/lighting.mjs";
import {stageOrder} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {stageBase} from "./base.mjs";
import {stageLayers} from "./layers.mjs";
import {stageAuto} from "./auto.mjs";
import {stagePointing} from "./pd.mjs";
import {stageCombo} from "./combo.mjs";
import {stageKey} from "./key.mjs";
import {stageGroups} from "./groups.mjs";

// The bench chooses one surface; each stage owns its controls and listeners.
/** @type {Readonly<Record<string, (model: import("../../../contracts/panel.js").PublishedModel) => HTMLElement>>} */
const STAGES = Object.freeze({base: stageBase, layers: stageLayers, auto: stageAuto, pd: stagePointing, combo: stageCombo, key: stageKey, groups: stageGroups});

// What each stage's switch keeps on, in the words of its header.
/** @type {Readonly<Record<string, string>>} */
const ABOUT = Object.freeze({
    base: "The QMK effect under every other stage.",
    layers: "Each layer's colour while it is on, highest layer last.",
    auto: "The mouse layer's colour fading out as the layer times out.",
    pd: "A trackball mode's colour while the mode runs.",
    combo: "A steady colour while a combo's keys are held.",
    key: "Flashes while a key waits on more taps, holds, or sends a multi-tap.",
    groups: "Saved sets of LEDs that rows in every stage can colour.",
});

/** @param {HTMLElement} body */
export function stageBody(body) {
    const model = getModel();
    if (!model) return;
    const surface = Object.hasOwn(STAGES, state.stage) ? STAGES[state.stage] : undefined;
    const nodes = [];
    if (allLightingOn(model) === false && state.stage !== "groups") nodes.push(allLightingOff(model));
    nodes.push(stageHead(model, state.stage));
    nodes.push(surface?.(model) ?? el(`<div></div>`));
    body.replaceChildren(...nodes);
}

// One callout on every stage while the master switch is off: the keyboard
// runs no stage at all then, so nothing below would light.
/** @param {import("../../../contracts/panel.js").PublishedModel} model */
function allLightingOff(model) {
    const node = el(`<div class="callout row gap-8 lighting-off" data-all-off>
        <span>All lighting is off. Layer colours and feedback are dark too.</span>
        <button class="btn text" data-act="lighting-on">Turn on</button></div>`);
    const section = baseSection(model);
    const button = /** @type {HTMLButtonElement} */ (node.querySelector("button"));
    if (!section || !canEditArea("settings")) button.disabled = true;
    button.addEventListener("click", () => { if (section) post(allLightingEdit(model, section, true)); });
    return node;
}

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../../../contracts/panel.js").PresentedSection} section @param {boolean} on */
export const allLightingEdit = (model, section, on) =>
    edits.settingsSection(section, (field) => field.macro === "lightingEnabled" ? on : undefined, model.settingsEditing?.identity);

// The stage's header: its name, what it paints, and its own switch — "Show
// this stage" — where the stage has a bit in the keyboard's stage mask. The
// base effect has none; its switch is All lighting in the topbar.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {string} id */
function stageHead(model, id) {
    const stage = id === "groups" ? {id, label: "LED groups", bit: undefined} : stageOrder(model).find((entry) => entry.id === id);
    const bit = (model.rgb.stages || []).find((entry) => entry.id === id)?.bit ?? stage?.bit;
    const on = stageEnabled(model, id);
    const node = el(`<div class="stage-head">
        <div><h3>${esc(stage?.label || "")}</h3><p class="note">${esc(ABOUT[id] || "")}</p></div>
        ${bit !== undefined ? `<label class="sw" data-tip="Off, this stage paints nothing; the colours it stores are kept.">
            <input data-f="lighting:${esc(id)}:enabled" type="checkbox" ${on ? "checked" : ""} ${writable() ? "" : "disabled"}><span class="track"></span>
            <span class="txt">Show this stage</span></label>` : ""}</div>`);
    /** @type {HTMLInputElement | null} */ (node.querySelector("input"))?.addEventListener("change", (event) => {
        post(edits.rgbStages(model.rgb.stageEnableMask ?? 0, /** @type {number} */ (bit), /** @type {HTMLInputElement} */ (event.target).checked));
    });
    return node;
}
