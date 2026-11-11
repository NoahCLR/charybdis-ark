// @ts-check
// What the Lighting board shows for the stage a person is on, and the line
// under it that says so. On Pointing modes it shows the picked mode running;
// on Combo feedback, a combo held that fires in this view (combo-held.mjs):
// one whose output holds layers turns them on, and one whose output runs a
// pointing mode runs it, from the combo's keys, its combo feedback painting
// beneath (firmware RGB domain, Drawing). An empty slot never runs. On
// Replacement feedback it shows the picked case's flash, from the key that
// stands in for the one that ended the word or undid it (D-L89).

import {comboHeld, viewWhileHeld} from "./combo-held.mjs";
import {replacementOwner, replacementRowOf} from "./accents.mjs";
import {followsTrigger} from "./geometry.mjs";
import {pdColourRow, pdTrigger, replacementPaints, replacementTrigger, stageEnabled} from "./lighting.mjs";
import {layerAt, layersOnTop, phrasesJoined, phrasesListed, slotCalled, vocabulary, word} from "./vocabulary.mjs";

/** @typedef {import("./keyface-types.js").LayerView} LayerView */
/** @typedef {import("./types.js").LightOptions} LightOptions */
/** @typedef {import("./vocabulary.mjs").Phrase} Phrase */

/** @param {LayerView["model"]} model @param {number} slot */
const runs = (model, slot) => Boolean((model?.pdModes || []).find((row) => row.id === slot)?.kind) && stageEnabled(model, "pd");

/** @param {LayerView["model"]} model @param {number} slot @param {number | readonly number[] | undefined} trigger @returns {LightOptions["pdActive"]} */
function modeRunning(model, slot, trigger) {
    const row = runs(model, slot) ? pdColourRow(model, slot) : null;
    return row ? {mode: row.pointingMode, color: row.color, locality: row.locality, triggerIndex: trigger} : null;
}

/**
 * The flash Replacement feedback's board shows: the picked case's, in its
 * colour and the stage's locality, from the key standing in for the one that
 * caused it. Null while the stage is off; a case that is off still shows,
 * since its accents in a colour of their own still light.
 * @param {LayerView} view @param {string | undefined} row
 */
function replacementFlash(view, row) {
    const model = view.model, feedback = model?.rgb?.autocorrectFeedback;
    if (!feedback || !stageEnabled(model, "autocorrect")) return null;
    const owner = replacementOwner(model, row), field = replacementRowOf(model, owner);
    const undo = field === "undoColor";
    const trigger = replacementTrigger(model, view.layer, undo);
    return {undo, standIn: trigger?.layoutIndex, active: {owner, color: feedback[field], locality: feedback.locality || "", triggerIndex: trigger?.layoutIndex}};
}

/**
 * The board for `stage`:
 *   shown     the view it draws: the one picked, with a held combo's layers on
 *   held      the combo held (comboHeld), null off Combo feedback
 *   pdActive  the pointing mode running, null when none
 *   comboActive the held combo's feedback, null when it paints none
 *   replacementActive the replacement flash showing, null off Replacement feedback or while its stage is off
 *   standIn   the key that flash follows, ringed on the board: set while its locality follows a key and a key stands in
 *   caption   what the board shows, in words (a Phrase: its layers by their marks on screen)
 * @param {LayerView} view
 * @param {{stage: string, pointingSlot: number, comboPreview: {id: number, keys: number[]} | null, replacementRow?: string}} picked
 */
export function lightingBoard(view, {stage, pointingSlot, comboPreview, replacementRow}) {
    const model = view.model;
    const held = stage === "combo" && stageEnabled(model, "combo") ? comboHeld(view, comboPreview) : null;
    const shown = viewWhileHeld(view, held);
    const pdActive = stage === "pd" ? modeRunning(model, pointingSlot, pdTrigger(model, view.layer, pointingSlot)?.layoutIndex)
        : held && held.pointing !== null ? modeRunning(model, held.pointing, held.held) : null;
    const comboActive = held?.active ?? null;
    const flash = stage === "autocorrect" ? replacementFlash(view, replacementRow) : null;
    const followsKey = Boolean(flash) && followsTrigger(flash?.active.locality);
    /** @param {string | undefined} locality */
    const area = (locality) => word(vocabulary(model).localities, locality).toLowerCase();
    // The base alone sits right on the background effect; a list of layers
    // ends before it with a comma.
    /** @type {Phrase[]} */
    const parts = [[...layersOnTop(shown), `${shown.layer === shown.stack[0] ? "" : ","} over the background effect`]];
    if (stage === "pd" && pdActive) parts.push([`${slotCalled(model, pointingSlot)} held, painting ${area(pdActive.locality)}`]);
    if (held) {
        const badge = held.combo.badge || "C";
        const mode = held.pointing !== null ? slotCalled(model, held.pointing) : "";
        parts.push(held.holds.length ? [`${badge} held, holding `, ...phrasesListed(held.holds.map((at) => [{layer: layerAt(model, at)}])), ", whose own light shows the hold"]
            : comboActive && pdActive ? [`${badge} held, painting ${area(comboActive.locality)} beneath ${mode}, which it runs`]
            : comboActive ? [`${badge} held, painting ${area(comboActive.locality)}`]
            : [`${badge} held`]);
        if (held.choice) parts.push(["click a ringed key to hold it from that key"]);
    } else if (stage === "combo" && stageEnabled(model, "combo")) parts.push(["no combo fires in this view"]);
    if (flash) {
        const called = word(vocabulary(model).replacementOwners, flash.active.owner);
        parts.push([replacementPaints(flash.active.color) ? `${called} flashing, painting ${area(flash.active.locality)}` : `${called} is off, so it does not flash`]);
        // Which key the flash follows is the keyboard's to know as a word
        // ends; the board says which key it took, or that it had none.
        const key = flash.undo ? "Backspace" : "Space";
        if (followsKey) parts.push([flash.standIn === undefined ? `no ${key} key to stand in, so it paints as when the keyboard cannot tell the key`
            : flash.undo ? "Backspace stands in for the key that undid it" : "Space stands in for the key that ended the word"]);
    }
    return {shown, held, pdActive, comboActive, replacementActive: flash?.active ?? null, standIn: followsKey ? flash?.standIn : undefined, caption: phrasesJoined(parts, " · ")};
}
