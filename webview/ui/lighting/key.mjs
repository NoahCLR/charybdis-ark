// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {css, isOff} from "../../lib/colour.mjs";
import {post, render, state, writable, canEdit as canEditArea} from "../../store.mjs";
import {blackConsequence, feedbackColours, lightingSection, stageEnabled} from "../../view/lighting.mjs";
import {unavailable} from "../shell.mjs";
import {vocabulary, word} from "../../view/vocabulary.mjs";
import * as edits from "../../view/edits.mjs";
import {colourControl, localityLabel, section, stack} from "./common.mjs";
import {groupRowsTable} from "./led-rows.mjs";

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
    // In the order a gesture shows them: waiting on more taps, holding, a
    // long hold, then the flash once a multi-tap is sent.
    const semantic = SEMANTIC_ROWS.map((row) => ({...row, label: word(vocabulary(model).feedbackOwners, row.owner), colour: feedback[row.id]}));
    const rows = [
        ...(feedback.tapBranchColors || []).map((colour, index) => ({id: /** @type {const} */ (`branch:${index}`), label: `Waiting on ${index + 2}×`, colour})),
        semantic[1], semantic[2], semantic[0],
    ];
    if (!rows.some((row) => row.id === state.feedbackRow)) state.feedbackRow = rows[0]?.id;
    const current = rows.find((row) => row.id === state.feedbackRow) || rows[0];
    node.className = "tab-split";
    const list = el(`<aside class="rowlist compact"><div class="rowlist-h">Feedback colours</div></aside>`);
    rows.forEach((row) => {
        const lit = !isOff(row.colour);
        const item = el(`<button class="rowitem ${row.id === current?.id ? "on" : ""}" data-row="${esc(row.id)}">
            <span class="t"><span class="mk-swatch lead ${lit ? "" : "swatch-off"}" style="${lit ? `background:${css(row.colour)}` : ""}"></span>${esc(row.label)}</span>
            ${lit ? "" : `<span class="m">black</span>`}</button>`);
        item.addEventListener("click", () => { state.feedbackRow = row.id; render(); });
        list.append(item);
    });
    const main = el(`<div class="tab-grid two stage-detail"></div>`);
    const colour = section(current?.label || "Feedback");
    colour.append(colourControl(model, {
        colour: current?.colour, canEdit, title: current?.label || "",
        black: blackConsequence(`While ${(current?.label || "this state").replace(/^./, (c) => c.toLowerCase())} shows`, feedback.locality ? localityLabel(feedback.locality) : ""),
        onChange: (next) => { if (current) post(edits.keyFeedback(model.rgb.keyBehaviorFeedback, current.id, next)); },
    }));
    const policy = section("When and where");
    // A stored on/off value: a switch. A single tap never flashes.
    const [off, on] = vocabulary(model).tapCommit.map(([id]) => id);
    const commit = el(`<label class="sw" data-tip="After a double tap or more is sent, the key flashes the Multi-tap sent colour. A single tap never flashes.">
        <input data-f="lighting:key:tap-commit" type="checkbox" ${feedback.tapCommitMode === on ? "checked" : ""} ${canEdit ? "" : "disabled"}><span class="track"></span>
        <span class="txt">Flash after a double tap or more</span></label>`);
    /** @type {HTMLInputElement} */ (commit.querySelector("input")).addEventListener("change", (event) =>
        post(edits.keyFeedback(model.rgb.keyBehaviorFeedback, null, null, {tapCommitMode: /** @type {HTMLInputElement} */ (event.target).checked ? on : off})));
    const locality = el(`<label class="field"><span>Where it lights</span><select data-f="lighting:key:locality" class="input" ${canEdit ? "" : "disabled"}>
        ${vocabulary(model).localities.map(([id, text]) => `<option value="${id}" ${feedback.locality === id ? "selected" : ""}>${text}</option>`).join("")}</select></label>`);
    /** @type {HTMLSelectElement} */ (locality.querySelector("select")).addEventListener("change", (event) =>
        post(edits.keyFeedback(model.rgb.keyBehaviorFeedback, null, null, {locality: /** @type {HTMLSelectElement} */ (event.target).value})));
    policy.append(stack(commit, locality, flashSpeed(model)));
    const onBoard = section("On the board");
    onBoard.className = "span";
    const colours = feedbackColours(model);
    /** @param {import("../../../contracts/edits.js").Colour} colour */
    const dot = (colour) => {
        const lit = stageEnabled(model, "key") && !isOff(colour);
        return `<i class="fbdot${lit ? "" : " off"}"${lit ? ` style="background:${css(colour)}"` : ""}></i>`;
    };
    onBoard.append(el(`<div class="row gap-12 stage-chips">
        ${(colours.branches || []).map((colour, index) => `<span class="chip">${dot(colour)} waiting on ${index + 2}×</span>`).join("")}
        <span class="chip">${dot(colours.hold)} holding</span>
        <span class="chip">${dot(colours.long)} long hold</span>
        <span class="chip">${dot(colours.tap)} multi-tap sent</span></div>`));
    onBoard.append(el(`<p class="note">These are the colours a key wears on the board: a behaviour's tap, hold and long-hold dots, and the tap-count badges in the behaviour grid.${stageEnabled(model, "key") ? "" : " The stage is off, so every one of them is drawn hollow."}</p>`));
    onBoard.append(groupRowsTable(model.rgb.keyBehaviorFeedbackLedGroups, "keyBehavior"));
    main.append(colour, policy, onBoard);
    node.append(list, main);
    return node;
}

// The flash speed: the half-period of every feedback flash. The keyboard
// stores it with its timing settings, so it saves as that section.
/** @param {import("../../../contracts/panel.js").PublishedModel} model */
function flashSpeed(model) {
    const settings = lightingSection(model, "lightingFeedback");
    const field = settings?.fields[0];
    if (!settings || !field) return el(`<p class="note">${esc(unavailable(model) || "Read the keyboard to edit the flash speed.")}</p>`);
    const editable = canEditArea("settings") && !field.readOnly;
    const node = el(`<label class="field"><span>${esc(field.label)}</span><span class="affix unit"><input class="input mono" data-f="lighting:key:flash" inputmode="numeric"
        value="${esc(field.value)}" ${editable ? "" : "disabled"} data-tip="${esc(`${field.hint || ""} ${field.tooltip || ""}`)}"><i>ms</i></span>
        <span class="note">${esc(field.hint || "")}</span></label>`);
    const input = /** @type {HTMLInputElement} */ (node.querySelector("input"));
    input.addEventListener("change", () => {
        const written = input.value.trim();
        if (!/^\d+$/.test(written)) { input.value = String(field.value); return; }
        post(edits.settingsSection(settings, (entry) => entry.macro === field.macro ? written : undefined, model.settingsEditing?.identity));
    });
    return node;
}
