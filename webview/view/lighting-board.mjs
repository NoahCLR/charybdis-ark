// @ts-check
// What the Lighting board shows for the stage a person is on, and the line
// under it that says so. On Pointing modes it shows the picked mode running;
// on Combo feedback, a combo held that fires in this view (combo-held.mjs):
// one whose output holds layers turns them on, and one whose output runs a
// pointing mode runs it, from the combo's keys, its combo feedback painting
// beneath (firmware RGB domain, Drawing). An empty slot never runs. On
// Behaviour feedback it shows the picked case from a key whose behaviour has
// it (D-L93). On Replacement feedback it shows the picked case's flash, from
// the key that stands in for the one that ended the word or undid it
// (D-L89), or Leader waiting held, from the key that stands in for the Leader
// key (D-L92). Each case paints by its own locality (D-L93).

import {comboHeld, viewWhileHeld} from "./combo-held.mjs";
import {feedbackCase, feedbackOwner, replacementOwner, replacementRowOf} from "./accents.mjs";
import {localityOf, tapBranchOf} from "./edits.mjs";
import {followsTrigger} from "./geometry.mjs";
import {keyIdentity} from "./key-identity.mjs";
import {keyMeaning} from "./keyface.mjs";
import {behaviourRuns} from "./participation.mjs";
import {pdColourRow, pdTrigger, colourPaints, replacementTrigger, stageEnabled} from "./lighting.mjs";
import {layerAt, layersOnTop, localityInText, phrasesJoined, phrasesListed, slotCalled, vocabulary, word} from "./vocabulary.mjs";

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
 * Whether a key's behaviour shows a case, as the keyboard draws behaviour
 * feedback (firmware RGB domain, Drawing; D-L93):
 *   - only while the behaviour runs on that layer (`behaviourRuns`);
 *   - a tap branch where a step sets anything at its tap count, the last
 *     branch at its count or any deeper one (tap counts are 0-based, so
 *     branch n, tap count n + 2, is the step at n + 1);
 *   - hold or long hold where a step sets that tier to an action that is no
 *     layer or pointing key, whose own stage shows it;
 *   - tap committed where a step has a tap and no hold, or, with the
 *     tap-commit policy on, a tap at a double tap or more that is no layer or
 *     pointing key (the pulse).
 * @param {LayerView} view @param {import("../../contracts/panel.js").Layer} layer @param {import("../../contracts/panel.js").Position} position @param {string} row
 */
function showsCase(view, layer, position, row) {
    const model = view.model, behaviour = keyIdentity(model, keyMeaning(position)).behaviour;
    if (!behaviour || !behaviourRuns(model, layer.index, position, behaviour).runs) return false;
    /** @param {import("../../contracts/edits.js").BehaviorBranch | undefined} branch */
    const ownStage = (branch) => { const id = keyIdentity(model, branch?.action || ""); return id.layer !== undefined || Boolean(id.pointing); };
    const steps = behaviour.steps || [];
    const branch = tapBranchOf(row);
    if (branch !== null) {
        const last = (model?.rgb?.keyBehaviorFeedback?.tapBranches?.length || 0) - 1;
        return steps.some((step) => (step.tap || step.hold || step.longHold) && (branch === last ? step.tapCount >= branch + 1 : step.tapCount === branch + 1));
    }
    if (row === "holdActiveColor") return steps.some((step) => step.hold && !ownStage(step.hold));
    if (row === "longHoldActiveColor") return steps.some((step) => step.longHold && !ownStage(step.longHold));
    const pulses = model?.rgb?.keyBehaviorFeedback?.tapCommitMode === "KEY_FEEDBACK_TAP_COMMIT_NON_BASE_TAPS";
    return steps.some((step) => step.tap && (!step.hold || (pulses && step.tapCount >= 1 && !ownStage(step.tap))));
}

/**
 * The key that stands in for one showing a Behaviour feedback case: the
 * first on the viewed layer, then on the others, whose behaviour shows it,
 * as its position (its place, and its keycode, which names it).
 * @param {LayerView} view @param {string} row
 */
function behaviourTrigger(view, row) {
    const stack = view.model?.layers || [];
    for (const layer of [view.layer, ...stack.filter((each) => each !== view.layer)]) {
        if (!layer) continue;
        const found = (layer.positions || []).find((position) => showsCase(view, layer, position, row));
        if (found) return found;
    }
    return undefined;
}

/**
 * The case Behaviour feedback's board shows: the picked case's, in its
 * colour and its own locality (D-L93), from a key whose behaviour has it.
 * Null while the stage is off. With no such key the keyboard never shows the
 * case, since it shows only on keys that produce it (firmware RGB domain,
 * Drawing), so `active` is null and the caption says why.
 * @param {LayerView} view @param {string | undefined} row
 */
function behaviourCase(view, row) {
    const model = view.model;
    if (!model?.rgb?.keyBehaviorFeedback || !stageEnabled(model, "key")) return null;
    const owner = feedbackOwner(model, row);
    const picked = row && feedbackCase(model, row) ? row : "tapCommittedColor";
    const shown = feedbackCase(model, picked);
    if (!shown) return null;
    const key = behaviourTrigger(view, picked);
    const standIn = key?.layoutIndex;
    return {owner, standIn, keycode: key ? keyMeaning(key) : undefined, active: standIn === undefined ? null : {owner, color: shown.color, locality: shown.locality || "", triggerIndex: standIn}};
}

/**
 * The case Replacement feedback's board shows: the picked case's, in its
 * colour and its own locality (D-L93), from the key standing in for the one that
 * caused it: Space, Backspace for an undo, and the Leader key for Leader
 * waiting (firmware D-F72). Null while the stage is off; a case that is off
 * still shows, since its accents in a colour of their own still light.
 * @param {LayerView} view @param {string | undefined} row
 */
function replacementCase(view, row) {
    const model = view.model, feedback = model?.rgb?.autocorrectFeedback;
    if (!feedback || !stageEnabled(model, "autocorrect")) return null;
    const owner = replacementOwner(model, row), field = replacementRowOf(model, owner);
    const undo = field === "undoColor", leading = field === "leadingColor";
    const trigger = replacementTrigger(model, view.layer, leading ? "QK_LEADER" : undo ? "KC_BACKSPACE" : "KC_SPACE");
    return {undo, leading, standIn: trigger?.layoutIndex, active: {owner, color: feedback[field], locality: feedback[localityOf(field)] || "", triggerIndex: trigger?.layoutIndex}};
}

/**
 * The board for `stage`:
 *   shown     the view it draws: the one picked, with a held combo's layers on
 *   held      the combo held (comboHeld), null off Combo feedback
 *   pdActive  the pointing mode running, null when none
 *   comboActive the held combo's feedback, null when it paints none
 *   behaviourActive the behaviour feedback case showing, null off Behaviour feedback or while its stage is off
 *   replacementActive the replacement case showing, null off Replacement feedback or while its stage is off
 *   standIn   the key that case follows, ringed on the board: set while its locality follows a key and a key stands in
 *   caption   what the board shows, in words (a Phrase: its layers by their marks on screen)
 * @param {LayerView} view
 * @param {{stage: string, pointingSlot: number, comboPreview: {id: number, keys: number[]} | null, feedbackRow?: string, replacementRow?: string}} picked
 */
export function lightingBoard(view, {stage, pointingSlot, comboPreview, feedbackRow, replacementRow}) {
    const model = view.model;
    const held = stage === "combo" && stageEnabled(model, "combo") ? comboHeld(view, comboPreview) : null;
    const shown = viewWhileHeld(view, held);
    const pdActive = stage === "pd" ? modeRunning(model, pointingSlot, pdTrigger(model, view.layer, pointingSlot)?.layoutIndex)
        : held && held.pointing !== null ? modeRunning(model, held.pointing, held.held) : null;
    const comboActive = held?.active ?? null;
    const showing = stage === "autocorrect" ? replacementCase(view, replacementRow) : null;
    const behaviour = stage === "key" ? behaviourCase(view, feedbackRow) : null;
    const followsKey = Boolean(showing) && followsTrigger(showing?.active.locality);
    const behaviourFollows = Boolean(behaviour?.active) && followsTrigger(behaviour?.active?.locality);
    /** @param {string | undefined} locality */
    const area = (locality) => localityInText(model, locality);
    // Where an owner's colour paints, or that it is passthrough and paints
    // nothing (D-L94, firmware D-F74).
    /** @param {{color: import("../../contracts/edits.js").Colour, locality: string}} owner */
    const painting = (owner) => colourPaints(owner.color) ? `painting ${area(owner.locality)}` : "passthrough, so it paints nothing";
    // The base alone sits right on the background effect; a list of layers
    // ends before it with a comma.
    /** @type {Phrase[]} */
    const parts = [[...layersOnTop(shown), `${shown.layer === shown.stack[0] ? "" : ","} over the background effect`]];
    if (stage === "pd" && pdActive) parts.push([`${slotCalled(model, pointingSlot)} held, ${painting(pdActive)}`]);
    if (held) {
        const badge = held.combo.badge || "C";
        const mode = held.pointing !== null ? slotCalled(model, held.pointing) : "";
        parts.push(held.holds.length ? [`${badge} held, holding `, ...phrasesListed(held.holds.map((at) => [{layer: layerAt(model, at)}])), ", whose own light shows the hold"]
            : comboActive && pdActive ? [`${badge} held, ${painting(comboActive)} beneath ${mode}, which it runs`]
            : comboActive ? [`${badge} held, ${painting(comboActive)}`]
            : [`${badge} held`]);
        if (held.choice) parts.push(["click a ringed key to hold it from that key"]);
    } else if (stage === "combo" && stageEnabled(model, "combo")) parts.push(["no combo fires in this view"]);
    if (behaviour) {
        const {active} = behaviour, called = word(vocabulary(model).feedbackOwners, behaviour.owner);
        // Which key shows it is the keyboard's to know as it happens; the
        // board says it took one, or that no key has it.
        if (!active) parts.push([`no key has ${called}, so the keyboard never shows it`]);
        else {
            parts.push([`${called} showing, ${painting(active)}`]);
            // The key standing in is named, as Space is for a replacement.
            const name = behaviour.keycode ? keyIdentity(model, behaviour.keycode).label : "";
            if (behaviourFollows) parts.push([name ? `${name} stands in for the key that shows it` : "a key with it stands in for the key that shows it"]);
        }
    }
    if (showing) {
        // A flash flashes; Leader waiting holds.
        const {active, leading} = showing;
        const called = word(vocabulary(model).replacementOwners, active.owner);
        const [shows, lights] = leading ? ["held", "light"] : ["flashing", "flash"];
        parts.push([colourPaints(active.color) ? `${called} ${shows}, painting ${area(active.locality)}` : `${called} is passthrough, so it does not ${lights}`]);
        // Which key the case follows is the keyboard's to know as it happens;
        // the board says which key it took, or that it had none.
        const key = leading ? "Leader" : showing.undo ? "Backspace" : "Space";
        if (followsKey) parts.push([showing.standIn === undefined ? `no ${key} key to stand in, so it paints as when the keyboard cannot tell the key`
            : leading ? "Leader stands in for the key that began it" : showing.undo ? "Backspace stands in for the key that undid it" : "Space stands in for the key that ended the word"]);
    }
    return {shown, held, pdActive, comboActive, behaviourActive: behaviour?.active ?? null, replacementActive: showing?.active ?? null,
        standIn: followsKey ? showing?.standIn : behaviourFollows ? behaviour?.standIn : undefined, caption: phrasesJoined(parts, " · ")};
}
