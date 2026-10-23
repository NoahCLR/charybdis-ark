// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {css, isOff} from "../../lib/colour.mjs";
import {canEdit as canEditArea, post, render, state, writable} from "../../store.mjs";
import {offWording, stageEnabled} from "../../view/lighting.mjs";
import {branchName, vocabulary, word} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {colourControl, section, stack} from "./common.mjs";
import {groupRowsTable} from "./led-rows.mjs";
import {sectionsIn} from "../settings.mjs";

// How fast feedback blinks. The keyboard stores it with its settings, so it
// saves as a settings section of one field.
/** @param {import("../../../contracts/panel.js").PublishedModel} model */
function flashInterval(model) {
    const flash = sectionsIn(model, "Lighting").find((entry) => entry.id === "lightingFeedback");
    const field = flash?.fields[0];
    if (!flash || !field) return el(`<span></span>`);
    const editable = canEditArea("settings") && !field.readOnly;
    const label = field.unit ? field.label.replace(new RegExp(`\\s*\\(${field.unit}\\)$`), "") : field.label;
    const node = el(`<label class="field" data-tip="${esc([field.tooltip, field.hint].filter(Boolean).join(" "))}"><span>${esc(label)}</span>
        <span class="affix unit"><input class="input mono" inputmode="numeric" data-macro="${esc(field.macro)}" data-f="setting:${esc(field.macro)}" value="${esc(field.value)}" ${editable ? "" : "disabled"}>${field.unit ? `<i>${esc(field.unit)}</i>` : ""}</span>
        <span class="hint">${esc(field.hint || "")}</span></label>`);
    /** @type {HTMLInputElement} */ (node.querySelector("input")).addEventListener("change", (event) => {
        const written = /** @type {HTMLInputElement} */ (event.target).value.trim();
        if (!written) { /** @type {HTMLInputElement} */ (event.target).value = field.value; return; }
        if (written !== field.value) post(edits.settingsSection(flash, () => written, model.settingsEditing?.identity));
    });
    return node;
}

// The key-feedback colour rows, named as their feedback owners are.
/** @type {{id: import("../../../contracts/edits.js").FeedbackColourField, owner: string}[]} */
const SEMANTIC_ROWS = [
    {id: "tapCommittedColor", owner: "KEY_FEEDBACK_GROUP_TAP_COMMITTED"},
    {id: "holdActiveColor", owner: "KEY_FEEDBACK_GROUP_HOLD_ACTIVE"},
    {id: "longHoldActiveColor", owner: "KEY_FEEDBACK_GROUP_LONG_HOLD_ACTIVE"},
];

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageKey(model) {
    const node = el(`<div></div>`);
    const canEdit = writable();

    /** @type {Partial<import("../../../contracts/edits.js").KeyFeedback<import("../../../contracts/edits.js").Colour>>} */
    const feedback = model.rgb.keyBehaviorFeedback || {};
    /** @type {{id: import("../../../contracts/edits.js").FeedbackRow, label: string, colour: import("../../../contracts/edits.js").Colour | undefined}[]} */
    const rows = [
        ...SEMANTIC_ROWS.map((row) => ({...row, label: word(vocabulary(model).feedbackOwners, row.owner), colour: feedback[row.id]})),
        ...(feedback.tapBranchColors || []).map((colour, index) => ({id: /** @type {const} */ (`branch:${index}`), label: branchName(model, index + 2), colour})),
    ];
    if (!rows.some((row) => row.id === state.feedbackRow)) state.feedbackRow = rows[0]?.id;
    const current = rows.find((row) => row.id === state.feedbackRow) || rows[0];
    node.className = "tab-split";
    const list = el(`<aside class="rowlist"><div class="rowlist-h">Feedback colours</div></aside>`);
    rows.forEach((row) => {
        const lit = !isOff(row.colour);
        const item = el(`<button class="rowitem ${row.id === current?.id ? "on" : ""}" data-row="${esc(row.id)}">
            <span class="t"><span class="mk-swatch lead ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.colour)}` : ""}"></span>${esc(row.label)}</span>
            ${lit ? "" : `<span class="m">off</span>`}</button>`);
        item.addEventListener("click", () => { state.feedbackRow = row.id; render(); });
        list.append(item);
    });
    const main = el(`<div class="tab-grid two stage-detail"></div>`);
    const colour = section(current?.label || "Feedback");
    colour.append(colourControl(model, {
        colour: current?.colour, canEdit, title: current?.label || "",
        ...offWording("key"),
        onChange: (next) => { if (current) post(edits.keyFeedback(model.rgb.keyBehaviorFeedback, current.id, next)); },
    }));
    const policy = section("When and where");
    const commit = el(`<label class="field"><span>Tap commit</span><select data-f="lighting:key:tap-commit" class="input" ${canEdit ? "" : "disabled"}>
        ${vocabulary(model).tapCommit.map(([id, text]) => `<option value="${id}" ${feedback.tapCommitMode === id ? "selected" : ""}>${text}</option>`).join("")}</select></label>`);
    /** @type {HTMLSelectElement} */ (commit.querySelector("select")).addEventListener("change", (event) =>
        post(edits.keyFeedback(model.rgb.keyBehaviorFeedback, null, null, {tapCommitMode: /** @type {HTMLSelectElement} */ (event.target).value})));
    const locality = el(`<label class="field"><span>Locality</span><select data-f="lighting:key:locality" class="input" ${canEdit ? "" : "disabled"}>
        ${vocabulary(model).localities.map(([id, text]) => `<option value="${id}" ${feedback.locality === id ? "selected" : ""}>${text}</option>`).join("")}</select></label>`);
    /** @type {HTMLSelectElement} */ (locality.querySelector("select")).addEventListener("change", (event) =>
        post(edits.keyFeedback(model.rgb.keyBehaviorFeedback, null, null, {locality: /** @type {HTMLSelectElement} */ (event.target).value})));
    policy.append(stack(commit, locality, flashInterval(model)));
    const onBoard = section("On the board");
    onBoard.className = "span";
    /** @param {import("../../../contracts/edits.js").Colour | undefined} colour */
    const dot = (colour) => {
        const lit = stageEnabled(model, "key") && !isOff(colour);
        return `<i class="fbdot${lit ? "" : " off"}"${lit ? ` style="background:${css(colour)}"` : ""}></i>`;
    };
    // The chips name each colour as the list does.
    onBoard.append(el(`<div class="row gap-12 stage-chips">
        ${rows.map((row) => `<span class="chip">${dot(row.colour)} ${esc(row.label)}</span>`).join("")}</div>`));
    onBoard.append(el(`<p class="note">These are the colours a key wears on the board: a behaviour's tap, hold and long-hold dots, and the branch numbers in the behaviour grid.${stageEnabled(model, "key") ? "" : " The stage is off, so every one of them is drawn hollow."}</p>`));
    onBoard.append(groupRowsTable(model.rgb.keyBehaviorFeedbackLedGroups, "keyBehavior"));
    main.append(colour, policy, onBoard);
    node.append(list, main);
    return node;
}
