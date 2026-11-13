// @ts-check
// Replacement feedback (D-L89): the flash as text replacement changes what
// was typed, and the colour held while the leader waits (D-L92). The
// firmware's code calls the stage autocorrect feedback, as
// Ark's code calls the feature (D-L87), so its id, table and files do too.
import {el, esc} from "../../lib/dom.mjs";
import {css} from "../../lib/colour.mjs";
import {post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {isOff, isPassthrough, offWording, swatchOf} from "../../view/lighting.mjs";
import {replacementOwner, replacementRowOf} from "../../view/accents.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {localityOf} from "../../view/edits.mjs";
import {colourControl, flashSetting, itemHead, lightingGroup, localityField, paintsCell, pickedMarked, section, stack, stageSurface} from "./common.mjs";
import {localityInfo} from "./help.mjs";
import {screenOfSection} from "../../view/settings-layout.mjs";
import {accentsSection} from "./accents.mjs";
import {attachPickRows, groupedTable, pickButton, pickableRow} from "../groups.mjs";

// Which key the Locality follows for the case picked, in one line under
// it: a flash's trigger key, or the Leader key for Leader waiting. The rest
// is on the Locality info mark (help.mjs).
const FLASH_WHERE = "Trigger key: the key that ended the word, or the Backspace that undid it.";
const LEADING_WHERE = "Trigger key: the Leader key you pressed.";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageAutocorrect(model) {
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
                pickButton(`lighting-replacements:${row.id}`, on, `<span class="mk-swatch lead ${lit ? "" : swatchOf(row.colour)}" style="${lit ? `background:${css(row.colour)}` : ""}"></span>${esc(row.label)}`),
                `<span class="muted">${esc(paintsCell(row.colour, row.locality))}</span>`,
            ], {data: {row: row.id}});
        })}]});
    attachPickRows(list, (id) => { state.replacementRow = id; render(); });
    // When the picked case shows, in one line under its name: a flash, or
    // Leader waiting, held while the leader waits (D-L92).
    const owner = current ? words.replacementColourOwners[current.id] : "";
    const head = current ? itemHead(pickedMarked(model, "autocorrect", current.label), words.replacementWhen[owner] || "") : null;
    head?.querySelector(".note")?.setAttribute("data-replacement-when", "");
    const colour = section(words.lightingFields.colour);
    colour.append(colourControl(model, {
        colour: current?.colour, canEdit, title: current?.label || "",
        ...offWording(model, "autocorrect"),
        onChange: (next) => { if (current) post(edits.autocorrectFeedback(model.rgb.autocorrectFeedback, current.id, next)); },
    }));
    // Where the picked case paints, its own (D-L93), with which key that is
    // here under it.
    const where = section("Where it paints", localityInfo("autocorrect"));
    if (current) where.append(stack(localityField(model, {f: `lighting:autocorrect:${current.id}:locality`, value: current.locality, canEdit,
        hint: current.id === "leadingColor" ? LEADING_WHERE : FLASH_WHERE,
        onChange: (locality) => post(edits.autocorrectFeedbackLocality(feedback, current.id, locality))})));
    // How long a flash lasts is one setting for every case, on the stage
    // bar; Leader waiting holds as long as the leader waits instead, which
    // is set on Host settings, a link away.
    const leader = el(`<button class="btn tiny link" data-act="leader-waits" data-tip="Leader waiting is no flash: it holds as long as the leader waits.">Leader waits →</button>`);
    leader.addEventListener("click", () => { state.screen = screenOfSection("autocorrect") || "host"; state.reveal = '.setrow:has([data-macro="leaderTimeout"])'; render(); });
    return stageSurface(model, {id: "autocorrect", first: list, head, colour, side: where, accents: accentsSection(model, "autocorrect"),
        shared: [flashSetting(model, "replacementFeedback"), el(`<span class="stage-bar-aside">Leader waiting lasts as long as</span>`), leader]});
}
