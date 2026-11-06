// @ts-check
// What the Lighting board shows for the stage a person is on, and the line
// under it that says so. On Pointing modes it shows the picked mode running;
// on Combo feedback, a combo held that fires in this view (combo-held.mjs):
// one whose output holds layers turns them on, and one whose output runs a
// pointing mode runs it, from the combo's keys, its combo feedback painting
// beneath (firmware RGB domain, Drawing). An empty slot never runs.

import {comboHeld, viewWhileHeld} from "./combo-held.mjs";
import {pdColourRow, pdTrigger, stageEnabled} from "./lighting.mjs";
import {layerCalled, layerCalledAt, listed, slotCalled, vocabulary, word} from "./vocabulary.mjs";

/** @typedef {import("./keyface-types.js").LayerView} LayerView */
/** @typedef {import("./types.js").LightOptions} LightOptions */

/** @param {LayerView["model"]} model @param {number} slot */
const runs = (model, slot) => Boolean((model?.pdModes || []).find((row) => row.id === slot)?.kind) && stageEnabled(model, "pd");

/** @param {LayerView["model"]} model @param {number} slot @param {number | readonly number[] | undefined} trigger @returns {LightOptions["pdActive"]} */
function modeRunning(model, slot, trigger) {
    const row = runs(model, slot) ? pdColourRow(model, slot) : null;
    return row ? {mode: row.pointingMode, color: row.color, locality: row.locality, triggerIndex: trigger} : null;
}

/**
 * The board for `stage`:
 *   shown     the view it draws: the one picked, with a held combo's layers on
 *   held      the combo held (comboHeld), null off Combo feedback
 *   pdActive  the pointing mode running, null when none
 *   comboActive the held combo's feedback, null when it paints none
 *   caption   what the board shows, in words
 * @param {LayerView} view
 * @param {{stage: string, pointingSlot: number, comboPreview: {id: number, keys: number[]} | null}} picked
 */
export function lightingBoard(view, {stage, pointingSlot, comboPreview}) {
    const model = view.model;
    const held = stage === "combo" && stageEnabled(model, "combo") ? comboHeld(view, comboPreview) : null;
    const shown = viewWhileHeld(view, held);
    const pdActive = stage === "pd" ? modeRunning(model, pointingSlot, pdTrigger(model, view.layer, pointingSlot)?.layoutIndex)
        : held && held.pointing !== null ? modeRunning(model, held.pointing, held.held) : null;
    const comboActive = held?.active ?? null;
    /** @param {string | undefined} locality */
    const area = (locality) => word(vocabulary(model).localities, locality).toLowerCase();
    const on = shown.held.filter((at) => at > 0).reverse().map((at) => layerCalled(shown.stack[at]));
    const parts = [`${layerCalled(shown.layer)}${on.length ? ` with ${listed(on)} on` : ""} over the background effect`];
    if (stage === "pd" && pdActive) parts.push(`${slotCalled(model, pointingSlot)} held, painting ${area(pdActive.locality)}`);
    if (held) {
        const badge = held.combo.badge || "C";
        const mode = held.pointing !== null ? slotCalled(model, held.pointing) : "";
        parts.push(held.holds.length ? `${badge} held, holding ${listed(held.holds.map((at) => layerCalledAt(model, at)))}, whose own light shows the hold`
            : comboActive && pdActive ? `${badge} held, painting ${area(comboActive.locality)} beneath ${mode}, which it runs`
            : comboActive ? `${badge} held, painting ${area(comboActive.locality)}`
            : `${badge} held`);
        if (held.choice) parts.push("click a ringed key to hold it from that key");
    } else if (stage === "combo" && stageEnabled(model, "combo")) parts.push("no combo fires in this view");
    return {shown, held, pdActive, comboActive, caption: parts.join(" · ")};
}
