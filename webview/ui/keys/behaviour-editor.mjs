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
import {editWords} from "../../view/edit-mode.mjs";
import {cellEditor, cellEditorOf, pickCellAction} from "./cell-editor.mjs";
import {sectionPath} from "../../view/settings-layout.mjs";
import {pickBehaviourKey, retargetPrompt} from "./retarget.mjs";
import {saveBehaviour} from "./save-behaviour.mjs";

const {TIER_FIELDS, TIERS} = edits;

// How a tier runs, as the vocabulary words it.
/** @param {import("../../../contracts/edits.js").Tier} kind @param {string | undefined} style */
const styleLabel = (kind, style) => styleWord(getModel(), kind, style || "");

// An empty timing field falls back to the keyboard's own default, which it
// reports and Behaviour settings → Tap & hold timing edits — so each field's
// tip names both, the path and the threshold, in their owners' words. The
// field itself shows the value it follows, greyed.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {EditorBehavior} behaviour @param {import("../../../contracts/edits.js").TimingTerm} term */
function timingFallbackNote(model, behaviour, term) {
    const value = behaviour.timingDefaults[term], where = sectionPath(model, "keyTiming");
    return String(value ?? "").trim() !== "" ? `Empty, it follows ${where} (${value} ms).` : `Empty, it follows ${where}.`;
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

// Drawn with its head (the key's name, Change key… and Remove behaviour) on
// the Behaviours tab; the Custom keys screen titles its card with the key and
// carries the actions itself, so it asks for the editor without one.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {boolean} canEdit */
export const behaviourActions = (model, canEdit) => `<button class="btn tiny ghost" data-act="rekey" ${canEdit ? "" : "disabled"}
        data-tip="Pick the key this behaviour listens to. Everything it does moves with it.">Change key…</button>
    <button class="btn tiny ghost destructive" data-act="remove" ${canEdit ? "" : "disabled"}
        data-tip="${esc(editWords(model?.draft).removeBehaviour)}. Its keys then send their plain keycode.">Remove behaviour</button>`;

/** @param {EditorBehavior} behaviour @param {{head?: boolean}} [options] */
export function behaviourEditor(behaviour, {head = true} = {}) {
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
    // The timings are one row above the grid, each its name then its field:
    // the window between taps, then the two thresholds. The grid's head is
    // then the tier names alone, one over each column.
    /** @param {import("../../../contracts/edits.js").TimingTerm} name */
    const timingControl = (name) => {
        const field = behaviourTimingField(behaviour, name);
        const placeholder = field.fallback === "" ? "default unavailable" : field.placeholder;
        return `<label class="field inline bterm-field" data-term-field="${esc(name)}" data-tip="${esc(`${thresholdTips[name]} ${timingFallbackNote(model, behaviour, name)}`)}"><span>${esc(sentence(thresholdNames[name]))}</span>
            <span class="affix unit"><input class="input mono num" style="--digits: ${esc(Math.max(5, placeholder.length))}" data-f="behaviour:${esc(behaviour.keycode)}:timing:${esc(name)}" data-term="${esc(name)}" data-stored="${esc(field.stored)}" inputmode="numeric" value="${esc(field.value)}"
                placeholder="${esc(placeholder)}" ${canEdit && !timingIdle ? "" : "disabled"}><i>ms</i></span></label>`;
    };

    // An action as the grid names it: a layer, pointing mode or macro as that
    // thing, anything else by its name with its layer marked.
    /** @param {string} label @param {string} action */
    const actionNamed = (label, action) => sends(model, action) || keyNameMarked(model, label, action);

    // A dashed cell: what the keyboard does here though nothing is set (core
    // publishes it, core/model/empty-cells.js). Each says why on hover.
    /** @param {string} id @param {boolean} open @param {{tip: string, name: string, line: string[]}} shown */
    const dashedCell = (id, open, {tip, name, line}) => `<button class="bcell inherited ${open ? "on" : ""}" data-cell="${esc(id)}" data-tip="${esc(tip)}">
                <span class="bk named">${name}</span>
                <span class="bl">${esc(line.filter(Boolean).join(" · "))}</span></button>`;
    const words = vocabulary(model);
    const single = branchName(model, 1);
    // What the standard key is called in the grid (firmware's word, D-F64).
    const STANDARD = "standard key";
    /** @param {import("../../view/keyface-types.js").InheritedBranch} branch */
    const times = (branch) => branch.times ? ` ×${branch.times}` : "";
    /** @param {import("../../view/keyface-types.js").InheritedBranch} branch */
    const named = (branch) => actionNamed(cellLabel(model, branch), branch.action);
    // How a standard hold runs: from the press, or as its style holds.
    /** @param {import("../../view/keyface-types.js").InheritedBranch} hold */
    const holdHow = (hold) => [hold.fromPress ? words.holdFromPress : styleLabel("hold", hold.style), hold.armsOnRelease ? "arms on release" : ""];
    /** @param {import("../../../contracts/edits.js").Tier} kind */
    const releasedAfter = (kind) => `released after ${kind === "hold" ? thresholdNames.tapHoldTerm : thresholdNames.longHoldTerm}`;
    const nothingSet = behaviour.steps.length ? `Only the ${single} is set` : "Nothing is set";

    // The standard key's own tap or hold.
    /** @param {import("../../view/keyface-types.js").InheritedBranch} inherited @param {import("../../../contracts/edits.js").Tier} kind @param {number} tapCount */
    const inheritedShown = (inherited, kind, tapCount) => {
        if (inherited.locks) return {name: named(inherited), line: [STANDARD, "locks its layers"],
            tip: `A Tap-toggle key tapped quickly ${tapCount + 1} times locks its layers. Set an action here to give the key a behaviour of its own.`};
        const line = kind === "tap" ? [inherited.separate ? "each press" : inherited.below ? "key below" : STANDARD, `${styleLabel(kind, inherited.style)}${times(inherited)}`]
            : [STANDARD, ...holdHow(inherited)];
        const tip = inherited.separate
            ? `${nothingSet}, so the key never waits for another tap: each of the ${inherited.times} presses is a ${single} of its own, sent as you let go. Set an action here to give the key a tap count of its own.`
            : inherited.below
                ? `The ${single} is Transparent, so the key below is this key's tap: once for each of the ${inherited.times} presses. Set an action here to replace it.`
                : inherited.times
                    ? `What this key does on its own: its tap, once for each of the ${inherited.times} presses. Set an action here to replace it.`
                    : `What this key does on its own${inherited.armsOnRelease ? ": its layers are on while it is held, and let go after the " + thresholdNames.tapHoldTerm + " it arms them" : ""}. Set an action here to replace it.`;
        return {name: named(inherited), line, tip};
    };
    // What an empty Hold or Long hold does because of the other tiers.
    /** @param {import("../../view/keyface-types.js").HoldTierImplied} implied @param {import("../../../contracts/edits.js").Tier} kind */
    const holdTierShown = (implied, kind) => {
        if (implied.meaning === "continues") {
            // Past Long hold the Hold carries on; one that fired at its own
            // threshold has nothing left to do.
            const {hold} = implied;
            const nothing = hold.style === "TAP_AT_HOLD_THRESHOLD";
            return {name: nothing ? esc("Nothing more") : named(hold), line: [tierName(model, "hold"), word(words.holdWithoutLongHold, hold.style)],
                tip: `No Long hold is set, so nothing takes over at the ${thresholdNames.longHoldTerm}: the Hold carries on. Set an action here to add a Long hold.`};
        }
        const {tap} = implied;
        if (implied.meaning === "tapsBeforeLong") return {name: named(tap), line: [`released before ${thresholdNames.longHoldTerm}`, `${styleLabel("tap", tap.style)}${times(tap)}`],
            tip: `No Hold is set: let go after the ${thresholdNames.tapHoldTerm} but before the ${thresholdNames.longHoldTerm} and the key sends its tap. Set an action here to add a Hold.`};
        return {name: named(tap), line: [releasedAfter(kind), `${styleLabel("tap", tap.style)}${times(tap)}`],
            tip: `No Hold or Long hold is set: however long the key is held, letting go sends its tap. Set an action here to add a ${tierName(model, kind)}.`};
    };
    /** @param {import("../../view/keyface-types.js").ImpliedBranch} implied @param {import("../../../contracts/edits.js").Tier} kind */
    const impliedShown = (implied, kind) => {
        if (implied.meaning === "afterTaps") {
            // Nothing set on this tap count: the standard key, pressed that
            // many times with the last held.
            const {tap, hold} = implied;
            const before = tap ? `${tap.times === 1 ? "the press before this one sends" : `the ${tap.times} presses before this one each send`} ${tap.below ? "the key below" : "its tap"}, then ` : "";
            return {name: named(hold), line: [tap ? `after ${tap.times} ${tap.times === 1 ? "tap" : "taps"}` : STANDARD, ...holdHow(hold)],
                tip: `Nothing is set on this tap count, so the key does what it does on its own: ${before}this one, held, does what the key does held. Set an action here to give this tap count a ${tierName(model, kind)}.`};
        }
        if (implied.meaning === "asSingle") {
            // A key that counts no taps: each press is a Single tap of its own,
            // so a later press held does what a held Single tap does.
            const tip = `${nothingSet}, so the key never waits for another tap: this press is a ${single} of its own, and held it does what a held ${single} does. Set an action here to give the key a tap count of its own.`;
            const {as} = implied;
            if ("branch" in as) return {name: named(as.branch), line: [`as ${single}`, tierName(model, as.kind), ...(as.branch.fromPress || as.branch.armsOnRelease ? holdHow(as.branch) : [styleLabel(as.kind, as.branch.style)])], tip};
            const shown = holdTierShown(as, kind);
            return {...shown, line: [`as ${single}`, ...shown.line], tip};
        }
        return holdTierShown(implied, kind);
    };

    /** @param {import("../../../contracts/panel.js").BehaviorView["steps"][number]} step @param {import("../../../contracts/edits.js").Tier} kind */
    const cellFor = (step, kind) => {
        const branch = step[TIER_FIELDS[kind]];
        const id = `${step.tapCount}-${kind}`;
        const open = openCell(behaviour) === id;
        const inherited = branch ? null : inheritedBranch(behaviour, step, kind);
        if (inherited) return dashedCell(id, open, inheritedShown(inherited, kind, step.tapCount));
        const implied = branch ? null : impliedBranch(behaviour, step, kind);
        if (implied) return dashedCell(id, open, impliedShown(implied, kind));
        if (!branch) return `<button class="bcell empty ${open ? "on" : ""}" data-cell="${esc(id)}"><span class="plus">+</span></button>`;
        // The grid reads by name; the keycode is on hover and in the editor.
        const label = cellLabel(model, branch);
        const named = Boolean(sends(model, branch.action)) || label !== branch.action;
        return `<button class="bcell ${open ? "on" : ""}" data-cell="${esc(id)}"${named ? ` data-tip="${esc(branch.action)}"` : ""}>
            <span class="bk ${named ? "named" : ""}">${actionNamed(label, branch.action)}</span>
            <span class="bl">${esc([sendsKind(model, branch.action), styleLabel(kind, branch.style)].filter(Boolean).join(" · "))}</span></button>`;
    };

    const notes = storageNotes(behaviour).map((note) => `<p class="note">${esc(note)}</p>`).join("");
    const node = el(`<div>
        ${head ? `<div class="beh-head">
            <div>
                <div class="row beh-title"><h3>${actionMarked(model, behaviour.keycode)}</h3>
                    ${keyIdentity(model, behaviour.keycode).label === behaviour.keycode ? "" : `<code class="dim">${esc(behaviour.keycode)}</code>`}</div>
                ${notes}
            </div>
            ${behaviour.stored ? `<div class="right row beh-actions">${behaviourActions(model, canEdit)}</div>` : ""}
        </div>` : notes ? `<div class="beh-notes">${notes}</div>` : ""}
        <div class="beh-intro">
            <label class="sw" data-tip="Treat this key as part of using the trackball, so pressing it keeps the pointer layer on instead of letting auto-mouse turn it off.">
                <input type="checkbox" data-f="behaviour:${esc(behaviour.keycode)}:anchor" data-anchor ${behaviour.keepsAutoMouseAnchored ? "checked" : ""} ${canEdit ? "" : "disabled"}>
                <span class="track"></span><span class="txt">${esc(vocabulary(model).behaviourFields.anchor)}</span></label>
        </div>
        ${behaviourTimingChecks(model, behaviour.keycode).map(check => `<p class="note beh-note" role="status"><strong>Timing ${esc(checkLevelWord(model, check.level).toLowerCase())}.</strong> ${esc(check.detail)} ${esc(check.fix)}</p>`).join("")}
        <div class="beh-timings">${["multiTapTerm", "tapHoldTerm", "longHoldTerm"].map((term) => timingControl(/** @type {import("../../../contracts/edits.js").TimingTerm} */ (term))).join("")}</div>
        <div class="bgrid">
            <span></span>
            ${TIERS.map((kind) => `<div class="btier" data-tip="${esc(vocabulary(model).tierTips[kind] || "")}">${tierDot(model, kind)}${esc(tierName(model, kind))}</div>`).join("")}
            ${steps.map((step) => `
                <div class="bhead">${branchBadge(model, step.tapCount + 1)}
                    <span>${esc(branchName(model, step.tapCount + 1))}</span></div>
                ${TIERS.map((kind) => cellFor(step, kind)).join("")}`).join("")}
        </div>
        <div id="cellEditor"></div>
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
