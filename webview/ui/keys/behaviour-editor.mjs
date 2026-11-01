// @ts-check
/**
 * @typedef {NonNullable<ReturnType<typeof import("../../view/behavior-editor.mjs").behaviourEditorRow>>} EditorBehavior
 */
// The open behaviour: its title and actions, its timings, and tap count ×
// tier drawn as the grid it is, with the cell editor under it.

import {el, esc} from "../../lib/dom.mjs";
import {behaviourGridSteps, cellLabel, impliedBranch, inheritedBranch} from "../../view/keyface.mjs";
import {keyIdentity} from "../../view/key-identity.mjs";
import {getModel, layers, post, render, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {definitionControls} from "../participation.mjs";
import * as edits from "../../view/edits.mjs";
import {behaviourTimingChecks, checkLevelWord} from "../../view/checks.mjs";
import {behaviourChangesNothing, behaviourHasTiming, behaviourTimingEdit, behaviourTimingField} from "../../view/behavior-editor.mjs";
import {actionMarked, branchBadge, keyNameMarked, sends, sendsKind, tierDot} from "../marks.mjs";
import {branchName, sentence, styleWord, tierName, vocabulary, word, layerCalled} from "../../view/vocabulary.mjs";
import {cellEditor, cellEditorOf, pickCellAction} from "./cell-editor.mjs";
import {sectionPath} from "../../view/settings-layout.mjs";
import {pickBehaviourKey, retargetPrompt} from "./retarget.mjs";
import {saveBehaviour} from "./save-behaviour.mjs";

const {TIER_FIELDS, TIERS} = edits;
// The timings in the order the grid draws them: the window between taps, then
// each hold tier's threshold.
/** @type {readonly import("../../../contracts/edits.js").TimingTerm[]} */
const TIMING_ORDER = ["multiTapTerm", "tapHoldTerm", "longHoldTerm"];

// How a tier runs, as the vocabulary words it.
/** @param {import("../../../contracts/edits.js").Tier} kind @param {string | undefined} style */
const styleLabel = (kind, style) => styleWord(getModel(), kind, style || "");

// An empty timing field falls back to the keyboard's own default, which it
// reports and Behaviour settings → Tap & hold timing edits — so the note
// names both, the path and the thresholds in their owners' words.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {EditorBehavior} behaviour */
function timingDefaultsNote(model, behaviour) {
    const defaults = behaviour.timingDefaults, names = vocabulary(model).thresholdNames, where = sectionPath(model, "keyTiming");
    const values = TIMING_ORDER.map((term) => [names[term], defaults[term]])
        .filter(([, value]) => String(value ?? "").trim() !== "")
        .map(([name, value]) => `${name} ${value} ms`);
    return values.length
        ? `Empty fields follow ${where}: ${values.join(", ")}.`
        : `Empty fields follow ${where}.`;
}

// The cell open in this behaviour's grid: one opened in another behaviour's
// editor, on this screen or another, stays closed here.
/** @param {EditorBehavior} behaviour */
const openCell = (behaviour) => state.cellRow === behaviour.keycode ? state.cell : null;

// What the head says about a behaviour that is not stored yet, or that changes
// nothing (firmware D-F27 "Rows without steps"). On a plain key a timing does
// nothing until the behaviour has a branch, so its fields wait for one.
/** @param {EditorBehavior} behaviour */
function storageNotes(behaviour) {
    const timingIdle = !behaviour.steps.length && behaviour.timingAlone === false;
    if (!behaviour.stored) return [timingIdle
        ? "Using the key’s defaults until you set an action or Keeps the pointer layer on. A timing alone does nothing here."
        : "Using the key’s defaults until you set an action, a timing or Keeps the pointer layer on."];
    if (behaviourChangesNothing(behaviour)) return [`This behaviour changes nothing: ${behaviourHasTiming(behaviour)
        ? "on this key a timing does nothing without a branch" : "it has no branches or timing of its own"}, so the key runs as if it had none. Set a grid action, or remove it.`];
    return timingIdle ? ["On this key a timing does nothing until the behaviour has a branch."] : [];
}

// A cell by its id in the grid ("1-hold"): its tap count's step and its tier,
// or null for none.
/** @param {import("../../../contracts/panel.js").BehaviorView["steps"]} steps @param {string | null} cell */
function cellAt(steps, cell) {
    if (!cell) return null;
    const [tapCount, tier] = cell.split("-");
    const step = steps.find((row) => String(row.tapCount) === tapCount);
    return step ? {step, kind: /** @type {import("../../../contracts/edits.js").Tier} */ (tier)} : null;
}

/** @param {EditorBehavior} behaviour */
export function behaviourEditor(behaviour) {
    const model = getModel();
    const steps = behaviourGridSteps(behaviour, model?.behaviorEditing?.maxTapStepsPerBehavior);
    const canEdit = editGate(model, "behaviours").editable;
    // Timing waits for a branch on a plain key; the switches wait for anything
    // they could turn on or off.
    const timingIdle = !behaviour.steps.length && behaviour.timingAlone === false;
    const switchesIdle = behaviourChangesNothing(behaviour);
    // Each timing is named, and what it means said on hover, in the
    // vocabulary's words.
    const {thresholdNames, thresholdTips} = vocabulary(model);
    /** @param {import("../../../contracts/edits.js").TimingTerm} name */
    const timingControl = (name) => {
        const field = behaviourTimingField(behaviour, name);
        const placeholder = field.fallback === "" ? "default unavailable" : field.placeholder;
        return `<label class="field bterm-field" data-tip="${esc(thresholdTips[name])}"><span>${esc(sentence(thresholdNames[name]))}</span>
            <span class="affix unit"><input class="input mono num" style="--digits: ${esc(Math.max(5, placeholder.length))}" data-f="behaviour:${esc(behaviour.keycode)}:timing:${esc(name)}" data-term="${esc(name)}" data-stored="${esc(field.stored)}" inputmode="numeric" value="${esc(field.value)}"
                placeholder="${esc(placeholder)}" ${canEdit && !timingIdle ? "" : "disabled"}><i>ms</i></span></label>`;
    };

    // An action as the grid names it: a layer, pointing mode or macro as that
    // thing, anything else by its name with its layer marked.
    /** @param {string} label @param {string} action */
    const actionNamed = (label, action) => sends(model, action) || keyNameMarked(model, label, action);

    /** @param {import("../../../contracts/panel.js").BehaviorView["steps"][number]} step @param {import("../../../contracts/edits.js").Tier} kind */
    const cellFor = (step, kind) => {
        const branch = step[TIER_FIELDS[kind]];
        const id = `${step.tapCount}-${kind}`;
        const open = openCell(behaviour) === id;
        const inherited = inheritedBranch(behaviour, step, kind);
        if (!branch && inherited) {
            const label = cellLabel(model, inherited);
            const times = inherited.times ? ` ×${inherited.times}` : "";
            const tip = inherited.first
                ? `The first tap, once for each of the ${inherited.times} presses. Set an action here to replace it.`
                : inherited.times
                    ? `What this key does on its own: its tap, once for each of the ${inherited.times} presses. Set an action here to replace it.`
                    : "What this key does on its own. Set an action here to replace it.";
            return `<button class="bcell inherited ${open ? "on" : ""}" data-cell="${esc(id)}" data-tip="${esc(tip)}">
                <span class="bk named">${actionNamed(label, inherited.action)}</span>
                <span class="bl">${esc([inherited.first ? "first tap" : "built in", `${styleLabel(kind, inherited.style)}${times}`].join(" · "))}</span></button>`;
        }
        const implied = branch ? null : impliedBranch(behaviour, step, kind);
        if (implied?.meaning === "continues") {
            // Past Long hold the Hold carries on; one that fired at its own
            // threshold has nothing left to do.
            const {hold} = implied;
            const label = hold.style === "TAP_AT_HOLD_THRESHOLD" ? "Nothing more" : cellLabel(model, hold);
            return `<button class="bcell inherited ${open ? "on" : ""}" data-cell="${esc(id)}"
                data-tip="No Long hold is set, so nothing takes over at the Long hold threshold: the Hold carries on. Set an action here to add a Long hold.">
                <span class="bk named">${hold.style === "TAP_AT_HOLD_THRESHOLD" ? esc(label) : actionNamed(label, hold.action)}</span>
                <span class="bl">${esc([tierName(model, "hold"), word(vocabulary(model).holdWithoutLongHold, hold.style)].join(" · "))}</span></button>`;
        }
        if (implied?.meaning === "tapsBeforeLong") {
            const {tap} = implied;
            const times = tap.times ? ` ×${tap.times}` : "";
            return `<button class="bcell inherited ${open ? "on" : ""}" data-cell="${esc(id)}"
                data-tip="No Hold is set: let go after the Tap / hold threshold but before the Long hold threshold and the key sends its tap. Set an action here to add a Hold.">
                <span class="bk named">${actionNamed(cellLabel(model, tap), tap.action)}</span>
                <span class="bl">${esc(["released before Long hold threshold", `${styleLabel("tap", tap.style)}${times}`].join(" · "))}</span></button>`;
        }
        if (!branch) return `<button class="bcell empty ${open ? "on" : ""}" data-cell="${esc(id)}"><span class="plus">+</span></button>`;
        // The grid reads by name; the keycode is on hover and in the editor.
        const label = cellLabel(model, branch);
        const named = Boolean(sends(model, branch.action)) || label !== branch.action;
        return `<button class="bcell ${open ? "on" : ""}" data-cell="${esc(id)}"${named ? ` data-tip="${esc(branch.action)}"` : ""}>
            <span class="bk ${named ? "named" : ""}">${actionNamed(label, branch.action)}</span>
            <span class="bl">${esc([sendsKind(model, branch.action), styleLabel(kind, branch.style)].filter(Boolean).join(" · "))}</span></button>`;
    };

    const dashed = steps.some((step) => TIERS.some((kind) => !step[TIER_FIELDS[kind]]
        && (inheritedBranch(behaviour, step, kind) || impliedBranch(behaviour, step, kind))));
    const node = el(`<div>
        <div class="beh-head">
            <div>
                <div class="row beh-title"><h3>${actionMarked(model, behaviour.keycode)}</h3>
                    ${keyIdentity(model, behaviour.keycode).label === behaviour.keycode ? "" : `<code class="dim">${esc(behaviour.keycode)}</code>`}</div>
                <p class="note">${esc(timingDefaultsNote(model, behaviour))}</p>
                ${storageNotes(behaviour).map((note) => `<p class="note">${esc(note)}</p>`).join("")}
            </div>
            ${behaviour.stored ? `<div class="right row beh-actions">
                <button class="btn tiny ghost" data-act="rekey" ${canEdit ? "" : "disabled"}
                    data-tip="Pick the key this behaviour listens to. Everything it does moves with it.">Change key…</button>
                <button class="btn tiny ghost" data-act="remove" ${canEdit ? "" : "disabled"}
                    data-tip="Remove this behaviour from the draft. Its keys then send their plain keycode.">Remove behaviour</button>
            </div>` : ""}
        </div>
        <div class="beh-intro">
            <label class="sw" data-tip="Treat this key as part of using the trackball, so pressing it keeps the pointer layer on instead of letting auto-mouse turn it off.">
                <input type="checkbox" data-f="behaviour:${esc(behaviour.keycode)}:anchor" data-anchor ${behaviour.keepsAutoMouseAnchored ? "checked" : ""} ${canEdit ? "" : "disabled"}>
                <span class="track"></span><span class="txt">Keeps the pointer layer on</span></label>
        </div>
        ${behaviourTimingChecks(model, behaviour.keycode).map(check => `<p class="note beh-note" role="status"><strong>Timing ${esc(checkLevelWord(model, check.level).toLowerCase())}.</strong> ${esc(check.detail)} ${esc(check.fix)}</p>`).join("")}
        <div class="bgrid">
            <span></span>
            ${TIERS.map((kind) => `<div class="btier">${tierDot(model, kind)}${esc(tierName(model, kind))}</div>`).join("")}
            ${timingControl("multiTapTerm")}
            <p class="bterm">On release, before the Tap / hold threshold</p>
            ${timingControl("tapHoldTerm")}
            ${timingControl("longHoldTerm")}
            ${steps.map((step) => `
                <div class="bhead">${branchBadge(model, step.tapCount + 1)}
                    <span>${esc(branchName(model, step.tapCount + 1))}</span></div>
                ${TIERS.map((kind) => cellFor(step, kind)).join("")}`).join("")}
        </div>
        <div id="cellEditor"></div>
        <p class="note beh-foot">Each cell is one action and how it runs. Empty cells are not stored.${dashed ? " A dashed cell is what the key does with nothing set; an action there replaces it." : ""}</p>
    </div>`);

    // A click opens a cell's editor, or closes it again. A double-click opens
    // it with the keycode picker already open, as a double-click on the board
    // opens a key's: the second click of the pair leaves the cell open for it.
    /** @param {string | null} cell */
    const showCell = (cell) => {
        state.cell = cell;
        state.cellRow = behaviour.keycode;
        state.cellHow = null;
        render();
    };
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-cell]")).forEach((button) => {
        const cell = button.dataset.cell || "";
        button.addEventListener("click", (event) => {
            if (event.detail <= 1) showCell(openCell(behaviour) === cell ? null : cell);
        });
        button.addEventListener("dblclick", () => {
            showCell(cell);
            const editor = cellEditorOf(behaviour.keycode, cell), at = cellAt(steps, cell);
            if (canEdit && editor && at) pickCellAction(editor, behaviour, at.step, at.kind, model?.profileIdentity);
        });
    });
    const open = cellAt(steps, openCell(behaviour));
    if (open) /** @type {HTMLElement} */ (node.querySelector("#cellEditor")).appendChild(cellEditor(behaviour, open.step, open.kind));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="rekey"]'))?.addEventListener("click", () => pickBehaviourKey(behaviour));
    if (state.retarget?.from === behaviour.keycode) node.append(retargetPrompt(behaviour));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="remove"]'))?.addEventListener("click", () =>
        post(edits.deleteBehaviour(behaviour.keycode, model?.profileIdentity)));
    const commit = () => saveBehaviour(node, behaviour, model?.profileIdentity);
    /** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("[data-term]")).forEach((input) => input.addEventListener("change", () => {
        const term = /** @type {import("../../../contracts/edits.js").TimingTerm} */ (input.dataset.term);
        input.dataset.stored = behaviourTimingEdit(input.value, behaviourTimingField(behaviour, term));
        commit();
        input.value = behaviourTimingField({...behaviour, [term]: input.dataset.stored}, term).value;
    }));
    /** @type {HTMLInputElement | null} */ (node.querySelector("[data-anchor]"))?.addEventListener("change", commit);
    // Whether the behaviour runs, and where, leads; the pointer-layer switch
    // sits at the end of the row.
    /** @type {HTMLElement} */ (node.querySelector(".beh-intro")).prepend(definitionControls(layers().map(layer => ({...layer, label: layerCalled(layer)})), behaviour, canEdit && !switchesIdle, (/** @type {{enabled: boolean, allowedLayers: number}} */ permissions) => {
        const message = edits.saveBehaviour(behaviour, permissions, model?.profileIdentity);
        if (message) post(message);
    }, `behaviour:${behaviour.keycode}:definition`, "behaviour"));
    return node;
}
