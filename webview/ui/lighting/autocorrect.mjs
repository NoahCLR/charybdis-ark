// @ts-check
// Replacement feedback (D-L89): the flash as text replacement changes what
// was typed. The firmware's code calls the stage autocorrect feedback, as
// Ark's code calls the feature (D-L87), so its id, table and files do too.
import {el, esc} from "../../lib/dom.mjs";
import {css, isOff} from "../../lib/colour.mjs";
import {post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {offWording, replacementPaints} from "../../view/lighting.mjs";
import {replacementOwner, replacementRowOf} from "../../view/accents.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {aboutStage, colourControl, flashSetting, lightingGroup, paintsSection, section, stack} from "./common.mjs";
import {accentsSection} from "./accents.mjs";
import {attachPickRows, groupedTable, pickButton, pickableRow} from "../groups.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageAutocorrect(model) {
    const node = el(`<div class="tab-split reach-split"></div>`);
    const canEdit = editGate(model, "lighting").editable;

    /** @type {Partial<import("../../../contracts/edits.js").AutocorrectFeedback<import("../../../contracts/edits.js").Colour>>} */
    const feedback = model.rgb.autocorrectFeedback || {};
    const words = vocabulary(model);
    // One colour for each case the keyboard flashes for, in the order it
    // stores them, each named as that case (vocabulary.replacementColourOwners).
    const rows = /** @type {import("../../../contracts/edits.js").AutocorrectFeedbackColourField[]} */ (Object.keys(words.replacementColourOwners))
        .map((field) => ({id: field, label: word(words.replacementOwners, words.replacementColourOwners[field]), colour: feedback[field]}));
    // The row picked, else the first; reading it never writes the state, so
    // laying the stage out unseen to measure it changes nothing.
    const picked = replacementRowOf(model, replacementOwner(model, state.replacementRow));
    const current = rows.find((row) => row.id === picked) || rows[0];
    // The cases, in the Keymap's grouped table (ui/groups.mjs). A case whose
    // colour paints nothing is off; one with brightness alone at zero
    // flashes black.
    const list = groupedTable({scroll: "lighting-replacements", draft: model?.draft, columns: [["Flash colour", "72%"], ["", "28%"]],
        groups: [{id: "flashes", ...words.lightingLists.replacements, ...lightingGroup("autocorrect:flashes"), rows: rows.map((row) => {
            const flashes = replacementPaints(row.colour), lit = flashes && !isOff(row.colour);
            const on = row.id === current?.id;
            return pickableRow(row.id, on, [
                pickButton(`lighting-replacements:${row.id}`, on, `<span class="mk-swatch lead ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.colour)}` : ""}"></span>${esc(row.label)}`),
                lit ? "" : `<span class="muted">${flashes ? "black" : "off"}</span>`,
            ], {data: {row: row.id}});
        })}]});
    attachPickRows(list, (id) => { state.replacementRow = id; render(); });
    const main = el(`<div class="tab-grid two stage-detail"></div>`);
    const colour = section(current?.label || "Flash");
    colour.append(colourControl(model, {
        colour: current?.colour, canEdit, title: current?.label || "", off: !replacementPaints(current?.colour),
        ...offWording(model, "autocorrect"),
        onChange: (next) => { if (current) post(edits.autocorrectFeedback(model.rgb.autocorrectFeedback, current.id, next)); },
    }));
    const policy = paintsSection(model, "autocorrect", "When and where");
    const locality = el(`<label class="field"><span>${esc(words.lightingFields.locality)}</span>
        <select data-f="lighting:autocorrect:locality" class="input" ${canEdit ? "" : "disabled"}
            data-tip="Where the flash paints. The trigger key choices follow the key that ended the word, or the Backspace that undid the replacement.">
        ${words.localities.map(([id, text]) => `<option value="${esc(id)}" ${feedback.locality === id ? "selected" : ""}>${esc(text)}</option>`).join("")}</select>
        <span class="hint">Here the trigger key is the key that ended the word (Space, Enter, a punctuation key), or the Backspace that undid the replacement; for a combo, every key of it. When the keyboard cannot tell which key it was, the flash paints both halves, or every key.</span></label>`);
    /** @type {HTMLSelectElement} */ (locality.querySelector("select")).addEventListener("change", (event) =>
        post(edits.autocorrectFeedback(model.rgb.autocorrectFeedback, null, undefined, {locality: /** @type {HTMLSelectElement} */ (event.target).value})));
    // Where it paints, with which key that is here under it, then how long
    // a flash lasts, as Behaviour feedback lists its locality and its flash.
    policy.append(stack(locality, flashSetting(model, "replacementFeedback")));
    main.append(colour, policy, aboutStage("As text replacement changes what you typed, the keyboard flashes once, in the colour of what it did and in the area chosen above: an input replaced with text, one replaced by a macro, or a replacement undone with Backspace. The flash begins as the replacement starts to be typed and paints over every other stage; a word left as you typed it never flashes. The board shows the flash picked in the list. Where it follows a key, Space stands in for the key that ended the word and Backspace for the one that undid it, ringed on the board."));
    const accents = accentsSection(model, "autocorrect");
    if (accents) main.append(accents);
    node.append(list, main);
    return node;
}
