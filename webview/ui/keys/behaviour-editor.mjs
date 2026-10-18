// @ts-check
/**
 * @typedef {NonNullable<ReturnType<typeof import("../../view/behavior-editor.mjs").behaviourEditorRow>>} EditorBehavior
 * @typedef {import("../../../contracts/edits.js").Tier} Tier
 */
// The open behaviour: a head (its name; On · Layers ▾ · More ▾), one timing
// strip, and tap count × tier drawn as the grid it is, with the open cell's
// editor in a popover anchored to it.

import {el, esc} from "../../lib/dom.mjs";
import {actionLabel, behaviourGridLayout, cellLabel, impliedBranch, inheritedBranch} from "../../view/keyface.mjs";
import {getModel, layerName, layers, post, render, state, canEdit as canEditArea, setPreference} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";
import {behaviourTimingChecks} from "../../view/checks.mjs";
import {behaviourCosts, behaviourTimingEdit, behaviourTimingField, layersSummary, timingMarks, timingPlaceholder} from "../../view/behavior-editor.mjs";
import {actionMarked, branchBadge, keyNameMarked, sends, sendsKind, tierDot, keycodeMark} from "../marks.mjs";
import {branchName, helperWord, tierName, vocabulary} from "../../view/vocabulary.mjs";
import {cellEditor, placeCellEditor} from "./cell-editor.mjs";
import {pickBehaviourKey, retargetPrompt} from "./retarget.mjs";
import {saveBehaviour} from "./save-behaviour.mjs";

const {TIER_FIELDS} = edits;
/** @type {Tier[]} */
const TIERS = ["tap", "hold", "long"];

// How a tier runs, in short words; a repeating hold says its rate.
/** @param {Tier} kind @param {{helper?: string, repeatHz?: import("../../../contracts/edits.js").Scalar}} branch */
const howWords = (kind, branch) => branch.helper === "REPEAT_WHILE_HELD" && Number(branch.repeatHz) > 0
    ? `repeats ${Number(branch.repeatHz)}/s` : helperWord(getModel(), kind, branch.helper || "");

// The cell open in this behaviour's grid: one opened in another behaviour's
// editor, on this screen or another, stays closed here.
/** @param {EditorBehavior} behaviour */
export const openCell = (behaviour) => state.cellRow === behaviour.keycode ? state.cell : null;

// What each timing means is said where it is set, on hover.
const TIMING = /** @type {const} */ ([
    ["multiTapTerm", "Taps within", "The time allowed from releasing the key to pressing it again for another tap. A Double tap Hold is press, release, then press and keep holding."],
    ["tapHoldTerm", "Hold after", "How long a press must last to count as a hold rather than a tap."],
    ["longerHoldTerm", "Long hold after", "How long a press must last to count as a long hold."],
]);

/** @param {EditorBehavior} behaviour */
export function behaviourEditor(behaviour) {
    const model = getModel();
    const canEdit = canEditArea("behaviours");
    const layout = behaviourGridLayout(behaviour, model?.behaviorEditing?.maxTapStepsPerBehavior, state.allTapCounts);
    const fields = Object.fromEntries(TIMING.map(([name]) => [name, behaviourTimingField(behaviour, name)]));
    /** @param {"tapHoldTerm" | "longerHoldTerm" | "multiTapTerm"} name */
    const ms = (name) => fields[name].followsDefault ? fields[name].fallback : fields[name].stored;
    const terms = {hold: ms("tapHoldTerm"), long: ms("longerHoldTerm"), repeat: ms("multiTapTerm")};
    const marks = timingMarks(model, behaviourTimingChecks(model, behaviour.keycode), terms);
    const id = `behaviour:${behaviour.keycode}`;

    /** @param {"tapHoldTerm" | "longerHoldTerm" | "multiTapTerm"} name @param {string} label @param {string} tip */
    const timingControl = (name, label, tip) => {
        const field = fields[name];
        const placeholder = timingPlaceholder(model, behaviour, name);
        const warned = marks.find((mark) => mark.term === name);
        return `<label class="bterm-field" data-tip="${esc(tip)}"><span>${esc(label)}</span>
            <input class="input mono ${warned ? "warn" : ""}" data-f="${esc(id)}:timing:${name}" data-term="${name}" data-stored="${esc(field.stored)}" inputmode="numeric"
                value="${esc(field.value)}" placeholder="${esc(placeholder)}" size="${Math.max(6, placeholder.length)}" ${canEdit ? "" : "disabled"}></label>`;
    };

    /** @param {import("../../../contracts/panel.js").BehaviorView["steps"][number]} step @param {Tier} kind */
    const cellFor = (step, kind) => {
        const branch = step[TIER_FIELDS[kind]];
        const cell = `${step.tapCount}-${kind}`;
        const open = openCell(behaviour) === cell;
        const warned = marks.find((mark) => mark.cell === cell);
        const classes = (/** @type {string} */ more) => `bcell ${more} ${open ? "on" : ""} ${warned ? "warn" : ""}`;
        const warnTip = warned ? ` ${warned.line}` : "";
        const inherited = inheritedBranch(behaviour, step, kind);
        if (!branch && inherited) {
            const times = inherited.times ? ` ×${inherited.times}` : "";
            const how = inherited.fromPress ? vocabulary(model).holdFromPress || "held from the press" : howWords(kind, inherited);
            const tip = inherited.times
                ? `What this key does on its own: its tap, once for each of the ${inherited.times} presses. Set an action here to replace it.`
                : "What this key does on its own. Set an action here to replace it.";
            return `<button class="${classes("inherited")}" data-cell="${cell}" data-tip="${esc(tip + warnTip)}">
                <span class="bk named">${keyNameMarked(model, cellLabel(model, inherited), inherited.action)}</span>
                <span class="bl">${esc(`built in · ${how}${times}`)}</span></button>`;
        }
        const implied = branch ? null : impliedBranch(behaviour, step, kind);
        if (implied?.meaning === "continues") {
            // Past Long hold the Hold carries on; one that fired at its own
            // threshold has nothing left to do.
            const {hold} = implied;
            const done = hold.helper === "TAP_AT_HOLD_THRESHOLD";
            return `<button class="${classes("inherited")}" data-cell="${cell}"
                data-tip="${esc(`No Long hold is set, so nothing takes over at the Long hold threshold: the Hold carries on. Set an action here to add a Long hold.${warnTip}`)}">
                <span class="bk named">${done ? "Nothing more" : keyNameMarked(model, cellLabel(model, hold), hold.action)}</span>
                <span class="bl">${esc(done ? "Hold already sent" : "Hold carries on")}</span></button>`;
        }
        if (implied?.meaning === "tapsBeforeLong") {
            const {tap} = implied;
            const times = tap.times ? ` ×${tap.times}` : "";
            return `<button class="${classes("inherited")}" data-cell="${cell}"
                data-tip="${esc(`No Hold is set: let go after Hold after and before Long hold after and the key sends its tap. Set an action here to add a Hold.${warnTip}`)}">
                <span class="bk named">${keyNameMarked(model, cellLabel(model, tap), tap.action)}</span>
                <span class="bl">${esc(`tap if released before Long hold${times}`)}</span></button>`;
        }
        if (!branch) return `<button class="${classes("empty")}" data-cell="${cell}" aria-label="${esc(`Set ${branchName(model, step.tapCount + 1)} ${tierName(model, kind)}`)}"${warned ? ` data-tip="${esc(warned.line)}"` : ""}><span class="plus">+</span></button>`;
        // The grid reads by name; the keycode follows with Show keycodes.
        const label = cellLabel(model, branch);
        const named = Boolean(sends(model, branch.action)) || label !== branch.action;
        const code = named ? keycodeMark("behaviourCell", branch.action, label) : "";
        return `<button class="${classes("")}" data-cell="${cell}"${warned ? ` data-tip="${esc(warned.line)}"` : ""}>
            <span class="bk ${named ? "named" : ""}">${sends(model, branch.action) || keyNameMarked(model, label, branch.action)}</span>
            <span class="bl">${esc([sendsKind(model, branch.action), kind === "tap" ? "" : howWords(kind, branch)].filter(Boolean).join(" · "))}${code ? ` ${code}` : ""}</span></button>`;
    };

    const firstHold = layout.rows[0] ? layout.rows[0].step.hold || inheritedBranch(behaviour, layout.rows[0].step, "hold") : null;
    const costs = behaviourCosts(behaviour, layout.depth, terms, firstHold);
    const costRow = costs.single || costs.hold ? `<span></span>
        <p class="bcost" data-cost="single">${esc(costs.single)}</p>
        <p class="bcost span2" data-cost="hold">${esc(costs.hold)}</p>` : "";
    const rowLabel = (/** @type {ReturnType<typeof behaviourGridLayout>["rows"][number]} */ row) => {
        const count = row.step.tapCount + 1;
        if (row.like !== null) return `<div class="bhead past" data-tip="${esc(`The keyboard cycles back after ${layout.depth} taps, so ${count} taps answer as ${branchName(model, row.like + 1)}. Set an action here to make it its own.`)}">
            ${branchBadge(model, count)}<span>↻ like ${row.like + 1}×</span></div>`;
        // The label column is narrow: "Double tap" reads "2× Double".
        const short = branchName(model, count).replace(/ tap$/, "");
        if (row.add) return `<div class="bhead add" data-tip="${esc(`Set an action in this row to add ${branchName(model, count)}.`)}"><span>+ ${esc(short)}</span></div>`;
        return `<div class="bhead" data-tip="${esc(branchName(model, count))}">${branchBadge(model, count)}<span>${esc(short)}</span></div>`;
    };

    const allowed = behaviour.allowedLayers ?? 0xffff;
    const named = layers().map((layer) => ({index: layer.index, label: layerName(layer)}));
    const menu = state.behaviourMenu;
    const node = el(`<div class="beh-editor">
        <div class="beh-head">
            <div class="row beh-title"><h3>${actionMarked(model, behaviour.keycode)}</h3>
                ${keycodeMark("behaviourTitle", behaviour.keycode, actionLabel(model, behaviour.keycode))}</div>
            <div class="row beh-actions">
                <label class="sw" data-tip="Off, this behaviour keeps its actions and timing but does nothing until it is on again.">
                    <input type="checkbox" data-f="${esc(id)}:definition:enabled" data-definition-enabled ${behaviour.enabled !== false ? "checked" : ""} ${canEdit ? "" : "disabled"}>
                    <span class="track"></span><span class="txt">On</span></label>
                <div class="beh-pop-wrap">
                    <button class="btn compact" data-menu="layers" aria-haspopup="true" aria-expanded="${menu === "layers"}"
                        data-tip="The layers a key can come from for this behaviour to run. It runs only where Settings and the key's own switch allow it too.">Layers: ${esc(layersSummary(named, allowed))} ▾</button>
                    <div class="beh-pop" data-pop="layers" role="group" aria-label="Layers it runs on" ${menu === "layers" ? "" : "hidden"}>
                        <div class="eyebrow">Runs on</div>
                        <div class="layer-grid">${named.map((layer) => `<label class="sw"><input type="checkbox" data-f="${esc(id)}:definition:allowed-layer:${layer.index}" data-allowed-layer="${layer.index}" ${allowed & 2 ** layer.index ? "checked" : ""} ${canEdit ? "" : "disabled"}>
                            <span class="track"></span><span class="txt">${esc(layer.label)}</span></label>`).join("")}</div>
                        <p class="note">Settings and the key's own switch can stop it too.</p>
                    </div>
                </div>
                <div class="beh-pop-wrap">
                    <button class="btn compact" data-menu="more" aria-haspopup="true" aria-expanded="${menu === "more"}">More ▾</button>
                    <div class="beh-pop menu" data-pop="more" role="group" aria-label="More for this behaviour" ${menu === "more" ? "" : "hidden"}>
                        <label class="sw" data-tip="Treat this key as part of using the mouse, so pressing it keeps the mouse layer on instead of turning it off.">
                            <input type="checkbox" data-f="${esc(id)}:anchor" data-anchor ${behaviour.keepsAutoMouseAnchored ? "checked" : ""} ${canEdit ? "" : "disabled"}>
                            <span class="track"></span><span class="txt">Keeps the mouse layer on</span></label>
                        ${behaviour.stored ? `<button class="btn text" data-act="rekey" ${canEdit ? "" : "disabled"}
                            data-tip="Choose the key this behaviour listens to. Everything it does moves with it.">Move to another key…</button>` : ""}
                        ${behaviour.stored ? `<button class="btn text destructive" data-act="remove" ${canEdit ? "" : "disabled"}
                            data-tip="Remove this behaviour from the draft. Its keys then do what they do on their own.">Remove behaviour</button>` : ""}
                    </div>
                </div>
            </div>
        </div>
        <div class="beh-timing">
            ${TIMING.map(([name, label, tip]) => timingControl(name, label, tip)).join(`<span class="sep">·</span>`)}<span class="unit">ms</span>
        </div>
        <div class="bgrid">
            <span></span>
            ${TIERS.map((kind) => `<div class="btier">${tierDot(model, kind)}${esc(tierName(model, kind))}</div>`).join("")}
            ${layout.rows.map((row, at) => `${rowLabel(row)}${TIERS.map((kind) => cellFor(row.step, kind)).join("")}${at === 0 ? costRow : ""}`).join("")}
        </div>
        <div class="row bfoot">
            ${layout.cycle ? `<p class="bcycle" data-cycle data-tip="The keyboard counts taps round: past the deepest tap count set, the next tap starts again at a single tap.">↻ ${layout.cycle.taps} taps → like 1× again</p>` : ""}
            <button class="btn compact toggle" data-act="all-taps" aria-pressed="${state.allTapCounts}"
                data-tip="Show every tap count the keyboard allows, not only those in use and the next.">Show all tap counts</button>
        </div>
        ${marks.length ? `<ul class="bwarnings">${marks.map((mark) => `<li class="${mark.level}">${esc(mark.line)}</li>`).join("")}</ul>` : ""}
    </div>`);

    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-cell]")).forEach((button) => button.addEventListener("click", () => {
        state.cell = openCell(behaviour) === button.dataset.cell ? null : button.dataset.cell || null;
        state.cellRow = behaviour.keycode;
        state.cellHow = null;
        state.behaviourMenu = null;
        render();
    }));
    // A click in the editor outside the open cell and its popover closes it.
    node.addEventListener("pointerdown", (event) => {
        const target = /** @type {Element} */ (event.target);
        if (!openCell(behaviour) || target.closest(".cell-pop, [data-cell]")) return;
        state.cell = null;
        state.cellHow = null;
        render();
    });
    const cell = openCell(behaviour);
    if (cell) {
        const [tapCount, tier] = cell.split("-");
        // A cell in a row the grid no longer shows has nothing to anchor to.
        const row = layout.rows.find((entry) => String(entry.step.tapCount) === tapCount);
        if (row) {
            const pop = cellEditor(behaviour, row.step, /** @type {Tier} */ (tier));
            node.append(pop);
            placeCellEditor(node, pop, cell);
        }
    }
    /** @type {NodeListOf<HTMLButtonElement>} */ (node.querySelectorAll("[data-menu]")).forEach((button) => button.addEventListener("click", () => {
        const which = /** @type {"layers" | "more"} */ (button.dataset.menu);
        state.behaviourMenu = menu === which ? null : which;
        render();
    }));
    // An open popover is scrolled into the window, the page moving under the board.
    const shown = /** @type {HTMLElement | null} */ (node.querySelector(".beh-pop:not([hidden])"));
    if (shown) requestAnimationFrame(() => { if (shown.isConnected && shown.getBoundingClientRect().bottom > innerHeight - 64) shown.scrollIntoView({block: "nearest"}); });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="all-taps"]'))?.addEventListener("click", () => {
        setPreference("allTapCounts", !state.allTapCounts);
        render();
    });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="rekey"]'))?.addEventListener("click", () => { state.behaviourMenu = null; pickBehaviourKey(behaviour); });
    if (state.retarget?.from === behaviour.keycode) node.append(retargetPrompt(behaviour));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="remove"]'))?.addEventListener("click", () => {
        state.behaviourMenu = null;
        post(edits.deleteBehaviour(behaviour.keycode, model?.profileIdentity));
    });
    const commit = () => saveBehaviour(node, behaviour);
    /** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("[data-term]")).forEach((input) => input.addEventListener("change", () => {
        const term = /** @type {"tapHoldTerm" | "longerHoldTerm" | "multiTapTerm"} */ (input.dataset.term);
        input.dataset.stored = behaviourTimingEdit(input.value, behaviourTimingField(behaviour, term));
        commit();
        input.value = behaviourTimingField({...behaviour, [term]: input.dataset.stored}, term).value;
    }));
    /** @type {HTMLInputElement | null} */ (node.querySelector("[data-anchor]"))?.addEventListener("change", commit);
    // Whether it runs, and on which layers, post together.
    const permissions = () => ({
        enabled: /** @type {HTMLInputElement} */ (node.querySelector("[data-definition-enabled]")).checked,
        allowedLayers: [.../** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("[data-allowed-layer]"))]
            .reduce((mask, field) => mask + (field.checked ? 2 ** Number(field.dataset.allowedLayer) : 0), 0),
    });
    /** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("[data-definition-enabled], [data-allowed-layer]")).forEach((input) => input.addEventListener("change", () => {
        const message = edits.saveBehaviour(behaviour, permissions(), model?.profileIdentity);
        if (message) post(message);
    }));
    return node;
}

// The head's popovers and the open cell close on Esc, and a popover on a
// press outside it. Esc leaves anything above them (the picker, a sheet) to
// close first.
if (typeof addEventListener === "function") {
    addEventListener("pointerdown", (event) => {
        if (!state.behaviourMenu || (event.target instanceof Element && event.target.closest(".beh-pop-wrap"))) return;
        state.behaviourMenu = null;
        render();
    }, true);
    addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || state.picker || state.overlay || state.retarget) return;
        if (state.behaviourMenu) state.behaviourMenu = null;
        else if (state.cell && (state.screen === "keys" || state.screen === "customKeys")) { state.cell = null; state.cellHow = null; }
        else return;
        event.stopImmediatePropagation();
        render();
    }, true);
}
