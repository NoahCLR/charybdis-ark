// @ts-check
/**
 * @typedef {NonNullable<ReturnType<typeof import("../../view/behavior-editor.mjs").behaviourEditorRow>>} EditorBehavior
 */
// The open behaviour: its title and actions, its timings, and tap count ×
// tier drawn as the grid it is, with the cell editor under it.

import {el, esc} from "../../lib/dom.mjs";
import {actionLabel, behaviourGridSteps, cellLabel, impliedBranch, inheritedBranch} from "../../view/keyface.mjs";
import {getModel, layerName, layers, post, render, state, canEdit as canEditArea} from "../../store.mjs";
import {definitionControls} from "../participation.mjs";
import * as edits from "../../view/edits.mjs";
import {behaviourTimingChecks} from "../../view/checks.mjs";
import {behaviourTimingEdit, behaviourTimingField} from "../../view/behavior-editor.mjs";
import {branchBadge, sends, sendsKind, tierDot} from "../marks.mjs";
import {branchName, helperWord, tierName, vocabulary, word} from "../../view/vocabulary.mjs";
import {cellEditor} from "./cell-editor.mjs";
import {pickBehaviourKey, retargetPrompt} from "./retarget.mjs";
import {saveBehaviour} from "./save-behaviour.mjs";

const {TIER_FIELDS} = edits;

// How a tier runs, as the vocabulary words it.
/** @param {import("../../../contracts/edits.js").Tier} kind @param {string | undefined} helper */
const helperLabel = (kind, helper) => helperWord(getModel(), kind, helper || "");

// An empty timing field falls back to the keyboard's own default, which it
// reports and Settings · Tap & Hold Timing edits — so the note names both.
/** @param {EditorBehavior} behaviour */
function timingDefaultsNote(behaviour) {
    const defaults = behaviour.timingDefaults;
    const values = [["multi tap window", defaults.multiTapTerm], ["tap / hold threshold", defaults.tapHoldTerm], ["long hold threshold", defaults.longerHoldTerm]]
        .filter(([, value]) => String(value ?? "").trim() !== "")
        .map(([name, value]) => `${name} ${value} ms`);
    return values.length
        ? `Keyboard defaults from Settings · Tap & Hold Timing: ${values.join(", ")}. Clear an override to follow its default.`
        : "Clear a timing override to follow the keyboard default from Settings · Tap & Hold Timing.";
}

/** @param {EditorBehavior} behaviour */
export function behaviourEditor(behaviour) {
    const model = getModel();
    const steps = behaviourGridSteps(behaviour, model?.behaviorEditing?.maxTapStepsPerBehavior);
    const canEdit = canEditArea("behaviours");
    /** @param {"tapHoldTerm" | "longerHoldTerm" | "multiTapTerm"} name @param {string} label */
    const timingControl = (name, label) => {
        const field = behaviourTimingField(behaviour, name);
        return `<label class="field bterm-field"><span>${esc(label)} · ms</span>
            <input class="input mono" data-f="behaviour:${esc(behaviour.keycode)}:timing:${name}" data-term="${name}" data-stored="${esc(field.stored)}" value="${esc(field.value)}"
                placeholder="${esc(field.fallback === "" ? "default unavailable" : field.placeholder)}" ${canEdit ? "" : "disabled"}></label>`;
    };

    /** @param {import("../../../contracts/panel.js").BehaviorView["steps"][number]} step @param {import("../../../contracts/edits.js").Tier} kind */
    const cellFor = (step, kind) => {
        const branch = step[TIER_FIELDS[kind]];
        const id = `${step.tapCount}-${kind}`;
        const open = state.cell === id;
        const inherited = inheritedBranch(behaviour, step, kind);
        if (!branch && inherited) {
            const label = cellLabel(model, inherited);
            const times = inherited.times ? ` ×${inherited.times}` : "";
            const tip = inherited.times
                ? `What this key does on its own: its tap, once for each of the ${inherited.times} presses. Set an action here to replace it.`
                : "What this key does on its own. Set an action here to replace it.";
            return `<button class="bcell inherited ${open ? "on" : ""}" data-cell="${id}" data-tip="${esc(tip)}">
                <span class="bk named">${esc(label)}</span>
                <span class="bl">${esc(["built in", `${helperLabel(kind, inherited.helper)}${times}`].join(" · "))}</span></button>`;
        }
        const implied = branch ? null : impliedBranch(behaviour, step, kind);
        if (implied?.meaning === "continues") {
            // Past Long hold the Hold carries on; one that fired at its own
            // threshold has nothing left to do.
            const {hold} = implied;
            const label = hold.helper === "TAP_AT_HOLD_THRESHOLD" ? "Nothing more" : cellLabel(model, hold);
            return `<button class="bcell inherited ${open ? "on" : ""}" data-cell="${id}"
                data-tip="No Long hold is set, so nothing takes over at the Long hold threshold: the Hold carries on. Set an action here to add a Long hold.">
                <span class="bk named">${esc(label)}</span>
                <span class="bl">${esc([tierName(model, "hold"), word(vocabulary(model).holdWithoutLongHold, hold.helper)].join(" · "))}</span></button>`;
        }
        if (implied?.meaning === "tapsBeforeLong") {
            const {tap} = implied;
            const times = tap.times ? ` ×${tap.times}` : "";
            return `<button class="bcell inherited ${open ? "on" : ""}" data-cell="${id}"
                data-tip="No Hold is set: let go after the Tap / hold threshold but before the Long hold threshold and the key sends its tap. Set an action here to add a Hold.">
                <span class="bk named">${esc(cellLabel(model, tap))}</span>
                <span class="bl">${esc(["released before Long hold threshold", `${helperLabel("tap", tap.helper)}${times}`].join(" · "))}</span></button>`;
        }
        if (!branch) return `<button class="bcell empty ${open ? "on" : ""}" data-cell="${id}"><span class="plus">+</span></button>`;
        // The grid reads by name; the keycode is on hover and in the editor.
        const label = cellLabel(model, branch);
        const named = Boolean(sends(model, branch.action)) || label !== branch.action;
        return `<button class="bcell ${open ? "on" : ""}" data-cell="${id}"${named ? ` data-tip="${esc(branch.action)}"` : ""}>
            <span class="bk ${named ? "named" : ""}">${sends(model, branch.action) || esc(label)}</span>
            <span class="bl">${esc([sendsKind(model, branch.action), helperLabel(kind, branch.helper)].filter(Boolean).join(" · "))}</span></button>`;
    };

    const dashed = steps.some((step) => /** @type {import("../../../contracts/edits.js").Tier[]} */ (["tap", "hold", "long"]).some((kind) => !step[TIER_FIELDS[kind]]
        && (inheritedBranch(behaviour, step, kind) || impliedBranch(behaviour, step, kind))));
    const node = el(`<div>
        <div class="beh-head">
            <div>
                <div class="row beh-title"><h3>${esc(actionLabel(model, behaviour.keycode))}</h3>
                    ${actionLabel(model, behaviour.keycode) === behaviour.keycode ? "" : `<code class="dim">${esc(behaviour.keycode)}</code>`}</div>
                <p class="note">${esc(timingDefaultsNote(behaviour))}</p>
                ${behaviour.stored ? "" : `<p class="note">Using the key’s defaults. A behaviour is added to the draft when you change a timing, switch or grid action.</p>`}
            </div>
            ${behaviour.stored ? `<div class="right row beh-actions">
                <button class="btn ghost" data-act="rekey" ${canEdit ? "" : "disabled"}
                    data-tip="Pick the key this behaviour listens to. Everything it does moves with it.">Change key…</button>
                <button class="btn ghost" data-act="remove" ${canEdit ? "" : "disabled"}
                    data-tip="Remove this behaviour from the draft. Its keys then send their plain keycode.">Remove behaviour</button>
            </div>` : ""}
        </div>
        <div class="beh-intro">
            <p class="note">Multi tap window is the time allowed from releasing the key to pressing it again. The Tap / hold threshold separates a tap from a hold. Double hold means press, release, then press and keep holding.</p>
            <label class="sw" data-tip="Treat this row as a mouse gesture, so pressing it keeps the pointer layer up instead of letting auto-mouse reset.">
                <input type="checkbox" data-f="behaviour:${esc(behaviour.keycode)}:anchor" data-anchor ${behaviour.keepsAutoMouseAnchored ? "checked" : ""} ${canEdit ? "" : "disabled"}>
                <span class="track"></span><span class="txt">Keeps auto-mouse anchored</span></label>
        </div>
        ${behaviourTimingChecks(model, behaviour.keycode).map(check => `<p class="note beh-note" role="status"><strong>${check.level === "notice" ? "Timing advice." : "Timing warning."}</strong> ${esc(check.detail)} ${esc(check.fix)}</p>`).join("")}
        <div class="bgrid">
            <span></span>
            ${/** @type {import("../../../contracts/edits.js").Tier[]} */ (["tap", "hold", "long"]).map((kind) => `<div class="btier">${tierDot(model, kind, behaviour.keycode)}${tierName(model, kind)}</div>`).join("")}
            ${timingControl("multiTapTerm", "Multi tap window")}
            <p class="bterm">On release, before the Tap / hold threshold</p>
            ${timingControl("tapHoldTerm", "Tap / hold threshold")}
            ${timingControl("longerHoldTerm", `${tierName(model, "long")} threshold`)}
            ${steps.map((step) => `
                <div class="bhead">${branchBadge(model, step.tapCount + 1, "", behaviour.keycode)}
                    <span>${esc(branchName(model, step.tapCount + 1))}</span></div>
                ${/** @type {import("../../../contracts/edits.js").Tier[]} */ (["tap", "hold", "long"]).map((kind) => cellFor(step, kind)).join("")}`).join("")}
        </div>
        <div id="cellEditor"></div>
        <p class="note beh-foot">Every cell is one action: what it sends, and how it runs once its threshold passes. Empty cells are dropped when the profile is applied.${dashed ? " A dashed cell is what the keyboard does there with nothing set: the key's own action, or the other hold tier carrying on. It is not stored, and setting an action there replaces it." : ""}</p>
    </div>`);

    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-cell]")).forEach((button) => button.addEventListener("click", () => {
        state.cell = state.cell === button.dataset.cell ? null : button.dataset.cell || null;
        state.cellHow = null;
        render();
    }));
    if (state.cell) {
        const [tapCount, tier] = state.cell.split("-");
        const kind = /** @type {import("../../../contracts/edits.js").Tier} */ (tier);
        const step = steps.find((row) => String(row.tapCount) === tapCount);
        if (step) /** @type {HTMLElement} */ (node.querySelector("#cellEditor")).appendChild(cellEditor(behaviour, step, kind));
    }
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="rekey"]'))?.addEventListener("click", () => pickBehaviourKey(behaviour));
    if (state.retarget?.from === behaviour.keycode) node.append(retargetPrompt(behaviour));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="remove"]'))?.addEventListener("click", () =>
        post(edits.deleteBehaviour(behaviour.keycode, model?.profileIdentity)));
    const commit = () => saveBehaviour(node, behaviour);
    /** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("[data-term]")).forEach((input) => input.addEventListener("change", () => {
        const term = /** @type {"tapHoldTerm" | "longerHoldTerm" | "multiTapTerm"} */ (input.dataset.term);
        input.dataset.stored = behaviourTimingEdit(input.value, behaviourTimingField(behaviour, term));
        commit();
        input.value = behaviourTimingField({...behaviour, [term]: input.dataset.stored}, term).value;
    }));
    /** @type {HTMLInputElement | null} */ (node.querySelector("[data-anchor]"))?.addEventListener("change", commit);
    /** @type {HTMLElement} */ (node.querySelector(".beh-intro")).appendChild(definitionControls(layers().map(layer => ({...layer, label: layerName(layer)})), behaviour, canEdit, (/** @type {{enabled: boolean, allowedLayers: number}} */ permissions) => {
        const message = edits.saveBehaviour(behaviour, permissions, model?.profileIdentity);
        if (message) post(message);
    }, `behaviour:${behaviour.keycode}:definition`));
    return node;
}
