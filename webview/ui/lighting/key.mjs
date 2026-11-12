// @ts-check
import {choiceField} from "../segmented.mjs";
import {el, esc} from "../../lib/dom.mjs";
import {css} from "../../lib/colour.mjs";
import {post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {isOff, isPassthrough, offWording, stageEnabled} from "../../view/lighting.mjs";
import {branchName, vocabulary, word} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {localityOf} from "../../view/edits.mjs";
import {aboutStage, colourControl, flashSetting, lightingGroup, localityField, paintsCell, paintsSection, section, stack} from "./common.mjs";
import {accentsSection} from "./accents.mjs";
import {attachPickRows, groupedTable, pickButton, pickableRow} from "../groups.mjs";

// The tiers' colour fields, in the order the behaviour grid's columns are;
// each is named as the case it flashes for (vocabulary.feedbackColourOwners).
/** @type {import("../../../contracts/edits.js").FeedbackColourField[]} */
const TIER_FIELDS = ["tapCommittedColor", "holdActiveColor", "longHoldActiveColor"];

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageKey(model) {
    const node = el(`<div></div>`);
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
    node.className = "tab-split reach-split";
    const list = groupedTable({scroll: "lighting-feedback", draft: model?.draft, columns: [["Case", "52%"], ["Paints", "48%"]],
        groups: groups.map((group) => ({...group, ...lightingGroup(`key:${group.id}`), rows: group.rows.map((row) => {
            const lit = !isPassthrough(row.colour) && !isOff(row.colour);
            const on = row.id === current?.id;
            return pickableRow(row.id, on, [
                pickButton(`lighting-feedback:${row.id}`, on, `<span class="mk-swatch lead ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.colour)}` : ""}"></span>${esc(row.label)}`),
                `<span class="muted">${esc(paintsCell(row.colour, row.locality))}</span>`,
            ], {data: {row: row.id}});
        })}))});
    attachPickRows(list, (id) => { state.feedbackRow = /** @type {typeof state.feedbackRow} */ (id); render(); });
    const main = el(`<div class="tab-grid two stage-detail"></div>`);
    const colour = section(current?.label || "Feedback");
    colour.append(colourControl(model, {
        colour: current?.colour, canEdit, title: current?.label || "",
        ...offWording(model, "key"),
        onChange: (next) => { if (current) post(edits.keyFeedback(model.rgb.keyBehaviorFeedback, current.id, next)); },
    }));
    // Where the picked case paints, its own (D-L93), as a pointing slot's.
    const where = section("Where it paints");
    if (current) where.append(stack(localityField(model, {f: `lighting:key:${current.id}:locality`, value: current.locality, canEdit,
        tip: "Where this case paints while a key shows it. The trigger key choices follow the key showing it, all of a combo's keys for a combo.",
        onChange: (locality) => post(edits.keyFeedbackLocality(feedback, current.id, locality))})));
    // When the stage flashes is one setting for every case.
    const policy = paintsSection(model, "key", "When it flashes");
    const commit = el(choiceField({label: words.lightingFields.tapBranchCommit, f: "lighting:key:tap-commit", choices: words.tapCommit,
        current: feedback.tapCommitMode, disabled: !canEdit}));
    commit.addEventListener("change", (event) =>
        post(edits.keyFeedback(model.rgb.keyBehaviorFeedback, null, null, {tapCommitMode: /** @type {HTMLInputElement} */ (event.target).value})));
    policy.append(stack(commit, flashSetting(model, "lightingFeedback")));
    // Where it paints and when it flashes share the column beside the
    // colour, so the tab is no taller for having both.
    const side = el(`<div class="stack stage-side"></div>`);
    side.append(where, policy);
    main.append(colour, side, aboutStage(`While a key's behaviour fires, the key flashes the colour of what fired, each case in the area chosen for it. The board shows the case picked in the list, from a key whose behaviour has it, ringed. The board's behaviour dots and the behaviour grid's branch numbers wear these colours${stageEnabled(model, "key") ? "" : ", hollow while the stage is off"}.`));
    const accents = accentsSection(model, "key");
    if (accents) main.append(accents);
    node.append(list, main);
    return node;
}
