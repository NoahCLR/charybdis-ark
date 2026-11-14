// @ts-check
import {choiceField} from "../segmented.mjs";
import {el, esc} from "../../lib/dom.mjs";
import {css} from "../../lib/colour.mjs";
import {post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {isOff, isPassthrough, offWording, swatchOf} from "../../view/lighting.mjs";
import {branchName, vocabulary, word} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {localityOf} from "../../view/edits.mjs";
import {colourControl, flashSetting, itemHead, lightingGroup, localityField, localityWhole, paintsCell, pickedMarked, section, stack, stageSurface} from "./common.mjs";
import {localityInfo, sectionInfo} from "./help.mjs";
import {accentsSection} from "./accents.mjs";
import {attachPickRows, groupedTable, pickButton, pickableRow} from "../groups.mjs";

// The tiers' colour fields, in the order the behaviour grid's columns are;
// each is named as the case it flashes for (vocabulary.feedbackColourOwners).
/** @type {import("../../../contracts/edits.js").FeedbackColourField[]} */
const TIER_FIELDS = ["tapCommittedColor", "holdActiveColor", "longHoldActiveColor"];

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageKey(model) {
    const canEdit = editGate(model, "lighting").editable;

    /** @type {Partial<import("../../../contracts/edits.js").KeyFeedback<import("../../../contracts/edits.js").Colour>>} */
    const feedback = model.rgb.keyBehaviorFeedback || {};
    /** @typedef {{id: import("../../../contracts/edits.js").FeedbackRow, label: string, colour: import("../../../contracts/edits.js").Colour | undefined, locality: string | undefined}} Row */
    // The cases fall in two groups, as the behaviour grid's columns and rows
    // do: a tier's flashes as it fires, a tap branch's while a run of taps
    // waits on its count. Each case has its own colour and locality (D-L93).
    const words = vocabulary(model);
    /** @type {{id: string, title: string, tip: string, rows: Row[]}[]} */
    const groups = [
        {id: "tiers", ...words.lightingLists.tiers,
            rows: TIER_FIELDS.map((field) => ({id: field, label: word(words.feedbackOwners, words.feedbackColourOwners[field]), colour: feedback[field], locality: feedback[localityOf(field)]}))},
        {id: "branches", ...words.lightingLists.tapBranches,
            rows: (feedback.tapBranches || []).map((branch, index) => ({id: /** @type {const} */ (`branch:${index}`), label: branchName(model, index + 2), colour: branch.color, locality: branch.locality}))},
    ].filter((group) => group.rows.length);
    const rows = groups.flatMap((group) => group.rows);
    // The row picked, else the first; reading it never writes the state, so
    // laying the stage out unseen to measure it changes nothing.
    const current = rows.find((row) => row.id === state.feedbackRow) || rows[0];
    // The cases, in the Keymap's grouped table (ui/groups.mjs), under a band
    // per group that folds as the Keymap's do; beside each, where it paints,
    // passthrough or off (D-L94).
    const list = groupedTable({scroll: "lighting-feedback", draft: model?.draft, columns: [["Case", "52%"], ["Paints", "48%"]],
        groups: groups.map((group) => ({...group, ...lightingGroup(`key:${group.id}`), rows: group.rows.map((row) => {
            const lit = !isPassthrough(row.colour) && !isOff(row.colour);
            const on = row.id === current?.id;
            return pickableRow(row.id, on, [
                pickButton(`lighting-feedback:${row.id}`, on, `<span class="mk-swatch lead ${swatchOf(row.colour)}" style="${lit ? `background:${css(row.colour)}` : ""}"></span>${esc(row.label)}`),
                `<span class="muted">${esc(paintsCell(row.colour, row.locality))}</span>`,
            ], {data: {row: row.id}});
        })}))});
    attachPickRows(list, (id) => { state.feedbackRow = /** @type {typeof state.feedbackRow} */ (id); render(); });
    // The case picked heads its pane by when it shows, and how (steady,
    // blinking, or one flash), as a replacement case is headed; where it
    // paints is its Locality's and the list's.
    const owner = current ? words.feedbackColourOwners[current.id] : "";
    const flashesOnce = current?.id === "tapCommittedColor" && feedback.tapCommitMode === "KEY_FEEDBACK_TAP_COMMIT_NON_BASE_TAPS";
    const head = current ? itemHead(pickedMarked(model, "key", current.label), `${words.feedbackWhen[owner] || ""}${flashesOnce ? `; ${words.tapCommittedFlash}` : ""}`, {when: true}) : null;
    const colour = section(words.lightingFields.colour);
    colour.append(colourControl(model, {
        colour: current?.colour, canEdit, title: current?.label || "",
        ...offWording(model, "key"),
        onChange: (next) => { if (current) post(edits.keyFeedback(model.rgb.keyBehaviorFeedback, current.id, next)); },
    }));
    // Where the picked case paints, its own (D-L93), as a pointing slot's.
    const where = section("Where it paints", localityInfo(model, "key"));
    if (current) where.append(stack(localityField(model, {f: `lighting:key:${current.id}:locality`, value: current.locality, canEdit,
        onChange: (locality) => post(edits.keyFeedbackLocality(feedback, current.id, locality))})));
    // Whether a double tap or more also flashes Tap committed (the tap-commit
    // policy) is Tap committed's alone, though the keyboard stores it with the
    // stage, so it sits on that case's pane under where it paints.
    let side = where;
    if (current?.id === "tapCommittedColor") {
        const when = section("When it flashes", sectionInfo(model, "key:commit"));
        const commit = el(choiceField({label: words.lightingFields.doubleTapFlash, f: "lighting:key:tap-commit", choices: words.tapCommit,
            current: feedback.tapCommitMode, disabled: !canEdit}));
        commit.addEventListener("change", (event) =>
            post(edits.keyFeedback(model.rgb.keyBehaviorFeedback, null, null, {tapCommitMode: /** @type {HTMLInputElement} */ (event.target).value})));
        when.append(stack(commit));
        side = el(`<div class="stage-side"></div>`);
        side.append(where, when);
    }
    // How fast it blinks is one setting for every case, on the stage bar.
    // Only Hold active and Long hold active blink, so its dot blinks in Long
    // hold active's colour while that is picked, else in Hold active's.
    const blinking = current?.id === "longHoldActiveColor" ? feedback.longHoldActiveColor : feedback.holdActiveColor;
    const blink = blinking && !isPassthrough(blinking) && !isOff(blinking) ? css(blinking) : "";
    return stageSurface(model, {id: "key", first: list, head, colour, side, accents: accentsSection(model, "key"),
        shared: [flashSetting(model, "lightingFeedback", {blink})]});
}
