// @ts-check
import {choiceField} from "../segmented.mjs";
import {el, esc} from "../../lib/dom.mjs";
import {css, isOff} from "../../lib/colour.mjs";
import {post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {offWording, stageEnabled} from "../../view/lighting.mjs";
import {branchName, vocabulary, word} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {aboutStage, colourControl, flashSetting, lightingGroup, paintsSection, section, stack} from "./common.mjs";
import {accentsSection} from "./accents.mjs";
import {attachPickRows, groupedTable, pickButton, pickableRow} from "../groups.mjs";

// The tiers' colour fields, in the order the behaviour grid's columns are;
// each is named as the behaviour state it flashes for
// (vocabulary.feedbackColourOwners).
/** @type {import("../../../contracts/edits.js").FeedbackColourField[]} */
const TIER_FIELDS = ["tapCommittedColor", "holdActiveColor", "longHoldActiveColor"];

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageKey(model) {
    const node = el(`<div></div>`);
    const canEdit = editGate(model, "lighting").editable;

    /** @type {Partial<import("../../../contracts/edits.js").KeyFeedback<import("../../../contracts/edits.js").Colour>>} */
    const feedback = model.rgb.keyBehaviorFeedback || {};
    /** @typedef {{id: import("../../../contracts/edits.js").FeedbackRow, label: string, colour: import("../../../contracts/edits.js").Colour | undefined}} Row */
    // The colours fall in two groups, as the behaviour grid's columns and
    // rows do: a tier's colour flashes as it fires, a tap branch's while a
    // run of taps waits on its count.
    const words = vocabulary(model);
    /** @type {{id: string, title: string, tip: string, rows: Row[]}[]} */
    const groups = [
        {id: "tiers", ...words.lightingLists.tiers,
            rows: TIER_FIELDS.map((field) => ({id: field, label: word(words.feedbackOwners, words.feedbackColourOwners[field]), colour: feedback[field]}))},
        {id: "branches", ...words.lightingLists.tapBranches,
            rows: (feedback.tapBranchColors || []).map((colour, index) => ({id: /** @type {const} */ (`branch:${index}`), label: branchName(model, index + 2), colour}))},
    ].filter((group) => group.rows.length);
    const rows = groups.flatMap((group) => group.rows);
    // The row picked, else the first; reading it never writes the state, so
    // laying the stage out unseen to measure it changes nothing.
    const current = rows.find((row) => row.id === state.feedbackRow) || rows[0];
    // The colours, in the Keymap's grouped table (ui/groups.mjs), under a
    // band per group that folds as the Keymap's do.
    node.className = "tab-split reach-split";
    const list = groupedTable({scroll: "lighting-feedback", draft: model?.draft, columns: [["Feedback colour", "72%"], ["", "28%"]],
        groups: groups.map((group) => ({...group, ...lightingGroup(`key:${group.id}`), rows: group.rows.map((row) => {
            const lit = !isOff(row.colour);
            const on = row.id === current?.id;
            return pickableRow(row.id, on, [
                pickButton(`lighting-feedback:${row.id}`, on, `<span class="mk-swatch lead ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.colour)}` : ""}"></span>${esc(row.label)}`),
                lit ? "" : `<span class="muted">off</span>`,
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
    const policy = paintsSection(model, "key", "When and where");
    const commit = el(choiceField({label: vocabulary(model).lightingFields.tapBranchCommit, f: "lighting:key:tap-commit", choices: vocabulary(model).tapCommit,
        current: feedback.tapCommitMode, disabled: !canEdit}));
    commit.addEventListener("change", (event) =>
        post(edits.keyFeedback(model.rgb.keyBehaviorFeedback, null, null, {tapCommitMode: /** @type {HTMLInputElement} */ (event.target).value})));
    const locality = el(`<label class="field"><span>${esc(vocabulary(model).lightingFields.locality)}</span><select data-f="lighting:key:locality" class="input" ${canEdit ? "" : "disabled"}>
        ${vocabulary(model).localities.map(([id, text]) => `<option value="${esc(id)}" ${feedback.locality === id ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`);
    /** @type {HTMLSelectElement} */ (locality.querySelector("select")).addEventListener("change", (event) =>
        post(edits.keyFeedback(model.rgb.keyBehaviorFeedback, null, null, {locality: /** @type {HTMLSelectElement} */ (event.target).value})));
    policy.append(stack(commit, locality, flashSetting(model, "lightingFeedback")));
    main.append(colour, policy, aboutStage(`While a key's behaviour fires, the key flashes the colour of what fired, in the area chosen above. The board's behaviour dots and the behaviour grid's branch numbers wear these colours${stageEnabled(model, "key") ? "" : ", hollow while the stage is off"}.`));
    const accents = accentsSection(model, "key");
    if (accents) main.append(accents);
    node.append(list, main);
    return node;
}
