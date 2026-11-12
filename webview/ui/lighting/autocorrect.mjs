// @ts-check
// Replacement feedback (D-L89): the flash as text replacement changes what
// was typed, and the colour held while the leader waits (D-L92). The
// firmware's code calls the stage autocorrect feedback, as
// Ark's code calls the feature (D-L87), so its id, table and files do too.
import {el, esc} from "../../lib/dom.mjs";
import {css} from "../../lib/colour.mjs";
import {post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {isOff, isPassthrough, offWording} from "../../view/lighting.mjs";
import {replacementOwner, replacementRowOf} from "../../view/accents.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {localityOf} from "../../view/edits.mjs";
import {aboutStage, colourControl, flashSetting, lightingGroup, localityField, paintsCell, paintsSection, section, stack} from "./common.mjs";
import {accentsSection} from "./accents.mjs";
import {attachPickRows, groupedTable, pickButton, pickableRow} from "../groups.mjs";

// Which key the Locality follows, for the case picked: a flash's trigger
// key, or the Leader key for Leader waiting.
const FLASH_WHERE = "Here the trigger key is the key that ended the word (Space, Enter, a punctuation key), or the Backspace that undid the replacement; for what the Leader key sends, the key that sent it, the last character or Enter, or the Leader key when the wait sent it. For a combo, every key of it. When the keyboard cannot tell which key it was, the flash paints both halves, or every key.";
const LEADING_WHERE = "Here the trigger key is the Leader key you pressed; for a combo, every key of it. When the Leader came from no key, Leader waiting paints both halves, or every key.";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageAutocorrect(model) {
    const node = el(`<div class="tab-split reach-split"></div>`);
    const canEdit = editGate(model, "lighting").editable;

    /** @type {Partial<import("../../../contracts/edits.js").AutocorrectFeedback<import("../../../contracts/edits.js").Colour>>} */
    const feedback = model.rgb.autocorrectFeedback || {};
    const words = vocabulary(model);
    // One colour for each case the keyboard shows, in the order it stores
    // them, each named as that case (vocabulary.replacementColourOwners).
    const rows = /** @type {import("../../../contracts/edits.js").AutocorrectFeedbackColourField[]} */ (Object.keys(words.replacementColourOwners))
        .map((field) => ({id: field, label: word(words.replacementOwners, words.replacementColourOwners[field]), colour: feedback[field], locality: feedback[localityOf(field)]}));
    // The row picked, else the first; reading it never writes the state, so
    // laying the stage out unseen to measure it changes nothing.
    const picked = replacementRowOf(model, replacementOwner(model, state.replacementRow));
    const current = rows.find((row) => row.id === picked) || rows[0];
    // The cases, in the Keymap's grouped table (ui/groups.mjs), each with
    // where it paints (D-L93): a case whose colour paints nothing is
    // passthrough; one with brightness alone at zero off (D-L94).
    const list = groupedTable({scroll: "lighting-replacements", draft: model?.draft, columns: [["Case", "52%"], ["Paints", "48%"]],
        groups: [{id: "flashes", ...words.lightingLists.replacements, ...lightingGroup("autocorrect:flashes"), rows: rows.map((row) => {
            const lit = !isPassthrough(row.colour) && !isOff(row.colour);
            const on = row.id === current?.id;
            return pickableRow(row.id, on, [
                pickButton(`lighting-replacements:${row.id}`, on, `<span class="mk-swatch lead ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.colour)}` : ""}"></span>${esc(row.label)}`),
                `<span class="muted">${esc(paintsCell(row.colour, row.locality))}</span>`,
            ], {data: {row: row.id}});
        })}]});
    attachPickRows(list, (id) => { state.replacementRow = id; render(); });
    const main = el(`<div class="tab-grid two stage-detail"></div>`);
    const colour = section(current?.label || "Colour");
    // When the picked case shows, under its name: a flash, or Leader
    // waiting, held while the leader waits (D-L92).
    const owner = current ? words.replacementColourOwners[current.id] : "";
    if (owner && words.replacementWhen[owner]) colour.append(el(`<p class="note" data-replacement-when>${esc(words.replacementWhen[owner])}</p>`));
    colour.append(colourControl(model, {
        colour: current?.colour, canEdit, title: current?.label || "",
        ...offWording(model, "autocorrect"),
        onChange: (next) => { if (current) post(edits.autocorrectFeedback(model.rgb.autocorrectFeedback, current.id, next)); },
    }));
    // Where the picked case paints, its own (D-L93), with which key that is
    // here under it.
    const where = section("Where it paints");
    if (current) where.append(stack(localityField(model, {f: `lighting:autocorrect:${current.id}:locality`, value: current.locality, canEdit,
        tip: current.id === "leadingColor" ? "Where Leader waiting paints. The trigger key choices follow the Leader key you pressed."
            : "Where this case's flash paints. The trigger key choices follow the key that ended the word, the Backspace that undid the replacement, or the key that ended what you typed after the Leader key (the Leader key when the wait sent it).",
        hint: current.id === "leadingColor" ? LEADING_WHERE : FLASH_WHERE,
        onChange: (locality) => post(edits.autocorrectFeedbackLocality(feedback, current.id, locality))})));
    // How long a flash lasts is one setting for every case.
    const policy = paintsSection(model, "autocorrect", "How long it flashes");
    policy.append(stack(flashSetting(model, "replacementFeedback")));
    // Where it paints and how long it flashes share the column beside the
    // colour, so the tab is no taller for having both.
    const side = el(`<div class="stack stage-side"></div>`);
    side.append(where, policy);
    main.append(colour, side, aboutStage("As text replacement changes what you typed, the keyboard flashes once, in the colour of what it did and in the area chosen for that case: an input replaced with text, one replaced by a macro, or a replacement undone with Backspace. While the leader waits for what you type after the Leader key, the keyboard holds the Leader waiting colour instead, from the Leader key until it sends or gives up. What the Leader key sends flashes as a replacement does, in the text or macro colour, taking Leader waiting's place: that is how you see it went; when it sends nothing, Leader waiting just goes. Both paint over every other stage; a word left as you typed it never flashes. The board shows the case picked in the list. Where a case follows a key, Space stands in for the key that ended the word, Backspace for the one that undid it and the Leader key for Leader waiting, ringed on the board."));
    const accents = accentsSection(model, "autocorrect");
    if (accents) main.append(accents);
    node.append(list, main);
    return node;
}
