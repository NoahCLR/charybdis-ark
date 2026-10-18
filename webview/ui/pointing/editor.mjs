// @ts-check
// One trackball mode, in the order a person sets it up: what it is called and
// how it moves, how far the ball turns per step and at what speed, what each
// direction sends, which layer it keeps while it runs, where it is reached
// and how it lights, then Advanced for the tuning met once a year.
import {el, esc} from "../../lib/dom.mjs";
import {NAME_MAX_BYTES, NAME_TIP} from "../../view/names.mjs";
import {KIND, dpiOptions, readConfig, readsHorizontal, readsVertical, scrollAxesOf, scrollStarter, settleButtons, settleTaps, startingRecord, SCROLL_AXES} from "../../view/pointing-config.mjs";
import {modeProblems, normalDpi, runningDpi, snipingDpi} from "../../view/trackball.mjs";
import {post, render, state} from "../../store.mjs";
import * as edits from "../../view/edits.mjs";
import {slotLight} from "../marks.mjs";
import {bindingName, words} from "./common.mjs";
import {keycodeAside} from "../../view/show-keycodes.mjs";
import {formControls} from "./form-controls.mjs";
import {movement} from "./movement.mjs";
import {slotReach} from "./reach.mjs";
import {advancedControls} from "./advanced.mjs";
import {stepRow} from "./step.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {boolean} canEdit @param {import("../surface-types.js").PresentedSlot[]} slots */
export function editor(model, slot, canEdit, slots) {
    // The kind being edited, which is the stored one until the Movement select
    // changes it. The form has to be rebuilt on that change: each section
    // registers the readers for its own fields, so a directional record cannot
    // be read out of a scrolling form.
    const kind = state.pdKind?.slot === slot.id ? state.pdKind.kind : slot.kind;
    // startingRecord spreads the supplied slot, retaining its presentation fields.
    if (kind !== slot.kind) slot = /** @type {import("../surface-types.js").PresentedSlot} */ (startingRecord(slot, kind, scrollStarter(slots)));
    const scrolling = kind === KIND.SCROLLING;
    const light = slotLight(model, slot);
    const wrap = el(`<div class="pd-editor stack"></div>`);
    let stageCurrent = () => {};
    const {form, disabled, field, select, shortcut, modifiers} = formControls(model, slot, canEdit, () => stageCurrent());
    const normal = normalDpi(model), dpi = runningDpi(slot, normal);
    // ── identity ──────────────────────────────────────────────────────────
    const empties = slots.some((candidate) => !candidate.kind);
    const head = el(`<div class="card">
        <div class="card-h">
            ${light.swatch("lg")}
            <h3>${esc(slot.displayName || `Mode ${slot.id}`)}</h3><span class="tag">P${slot.id}${(code => code ? ` · ${esc(code)}` : "")(keycodeAside(state, "behaviourTitle", bindingName(slot)))}</span>
            <span class="right">
                ${empties ? `<button class="btn text" data-act="duplicate" ${disabled}
                    data-tip="Copy this mode, its colour too, into the first empty slot.">Duplicate</button>` : ""}
                <button class="btn text destructive" data-act="clear" ${disabled}
                    data-tip="Empty this slot. Keys bound to it stay on the board and do nothing until it is configured again.">Clear slot</button>
            </span></div>
        <div class="card-b stack pd-identity-b"><div class="pd-identity"></div><div class="pd-steps"></div>
            <div data-problem-for="*"><span class="note pd-problem" data-problem role="alert" hidden></span></div></div></div>`);
    const identity = /** @type {HTMLElement} */ (head.querySelector(".pd-identity"));
    const name = el(`<label class="field"><span>Name</span>
        <input data-f="pointing:${slot.id}:name" class="input" value="${esc(slot.name)}" maxlength="${NAME_MAX_BYTES}" data-tip="${esc(NAME_TIP)}" ${disabled}></label>`);
    form.name = () => /** @type {HTMLInputElement} */ (name.querySelector("input")).value.trim();
    identity.append(name);
    identity.append(select("Movement", words(model).kinds.filter(([value]) => value), kind, "kind",
        // Switching movement only redraws the form for the other kind: its
        // fields start empty, so staging now would post an invalid record.
        // The slot is staged once a field of the new form is changed.
        {onChange: (event) => { event.stopPropagation(); state.pdKind = {slot: slot.id, kind: Number(/** @type {HTMLSelectElement} */ (event.target).value)}; render(); }}));

    // ── step distance and sensitivity ─────────────────────────────────────
    const steps = /** @type {HTMLElement} */ (head.querySelector(".pd-steps"));
    const sniping = snipingDpi(model);
    const stepControls = {form, disabled};
    if (scrolling) {
        const axes = scrollAxesOf(slot);
        const tip = "How far the ball turns for each wheel step it sends. The keyboard stores it as sensor counts at this mode's speed.";
        /** @type {[string, string, boolean][]} */
        const scrolled = [["Sideways · per wheel step", "scroll:divisorH", axes !== SCROLL_AXES.VERTICAL], ["Up and down · per wheel step", "scroll:divisorV", axes !== SCROLL_AXES.HORIZONTAL]];
        for (const [label, key, shown] of scrolled) {
            if (shown) steps.append(stepRow(slot.id, {label, key, counts: slot.scroll?.[key.slice(7)], dpi, directional: false, sniping, tip}, stepControls));
        }
    } else {
        const both = readsHorizontal(slot.axis) && readsVertical(slot.axis);
        const once = slot.directionOutput === 1;
        const tip = once ? "How far the ball turns before the shortcut is sent." : "How far the ball turns for each shortcut it sends.";
        if (readsHorizontal(slot.axis)) steps.append(stepRow(slot.id, {label: both ? "Sideways step" : "Step distance", key: "thresholdX", counts: slot.thresholdX, dpi, directional: true, sniping, tip}, stepControls));
        if (readsVertical(slot.axis)) steps.append(stepRow(slot.id, {label: both ? "Up and down step" : "Step distance", key: "thresholdY", counts: slot.thresholdY, dpi, directional: true, sniping, tip}, stepControls));
    }
    steps.append(select("Sensitivity", dpiOptions(model.pdModeEditing?.dpiChoices, slot.dpi, normal), slot.dpi ?? 0, "dpi",
        {tip: `How fast the sensor counts while this mode runs, in DPI, up to the sensor's 12000. Normal follows the pointer's ball speed.${scrolling ? " Scrolling ignores sniping." : " While sniping is on, directional modes run at the sniping speed instead."}`}));
    wrap.append(head);

    const controls = {form, disabled, field, select, shortcut, modifiers};
    wrap.append(movement(model, slot, scrolling, controls), whileRuns(model, slot, select), slotReach(model, slot, canEdit), advancedControls(model, slot, scrolling, controls));

    stageCurrent = () => {
        const buttons = settleButtons(slot, readConfig(slot, form));
        const {config, pending} = settleTaps(slot, buttons.config);
        // A record the keyboard would refuse is not posted: the field that
        // breaks a rule says which rule, and keeps what was typed.
        if (showProblems(wrap, modeProblems(config), scrolling)) return;
        const holding = Object.keys(buttons.pending).length > 0 || Object.keys(pending).length > 0;
        const held = Boolean(state.pdButtons || state.pdTaps);
        state.pdButtons = Object.keys(buttons.pending).length ? {slot: slot.id, rows: buttons.pending} : null;
        state.pdTaps = Object.keys(pending).length ? {slot: slot.id, rows: pending} : null;
        post(edits.pdMode(slot.id, config, model.profileIdentity));
        // A new kind draws its own field, even when nothing new was stored.
        if (holding || held) render();
    };
    wrap.addEventListener("change", (event) => {
        if (!/** @type {Element} */ (event.target).matches("input, select")) return;
        stageCurrent();
    });

    /** @type {HTMLButtonElement} */ (head.querySelector('[data-act="clear"]')).addEventListener("click", () => {
        state.pdKind = null;
        state.pdButtons = null;
        state.pdTaps = null;
        post(edits.clearPdMode(slot.id, model.profileIdentity));
    });
    /** @type {HTMLButtonElement | null} */ (head.querySelector('[data-act="duplicate"]'))?.addEventListener("click", () => {
        const target = slots.find((candidate) => !candidate.kind);
        if (!target) return;
        state.pdSlot = target.id;
        post(edits.duplicatePdMode(target.id, slot.id, model.profileIdentity));
    });
    return wrap;
}

// Which layer the keyboard keeps while this mode runs, held or locked: the
// firmware switches it when the mode starts and holds it until the mode ends.
/** @param {import("../../../contracts/panel.js").PublishedModel} model @param {import("../surface-types.js").PresentedSlot} slot @param {ReturnType<typeof formControls>["select"]} select */
function whileRuns(model, slot, select) {
    const card = el(`<div class="card"><div class="card-h"><h3>While this mode runs</h3></div><div class="card-b pd-while"></div></div>`);
    /** @type {HTMLElement} */ (card.querySelector(".card-b")).append(select("While this mode runs", words(model).pointerLayer, slot.pointerLayer, "pointerLayer", {
        hint: slot.pointerLayer === 1
            ? "The mouse layer turns off as soon as the mode starts, so keys type from the layer under it until the mode ends."
            : "The mouse layer stays on while the mode runs, so its mouse buttons stay under your fingers.",
        tip: "Held or locked, the mode decides the mouse layer from the moment it starts until it ends.",
    }));
    /** @type {HTMLElement} */ (card.querySelector("label.field > span")).classList.add("sr");
    return card;
}

// Write each refusal under its field, clear the rest; true when any field
// breaks a rule. A scroll field's form key carries its "scroll:" prefix.
/** @param {HTMLElement} wrap @param {Record<string, string>} problems @param {boolean} scrolling */
function showProblems(wrap, problems, scrolling) {
    for (const node of wrap.querySelectorAll("[data-problem]")) {
        /** @type {HTMLElement} */ (node).hidden = true;
        node.textContent = "";
    }
    for (const input of wrap.querySelectorAll('[aria-invalid="true"]')) input.removeAttribute("aria-invalid");
    const entries = Object.entries(problems);
    for (const [key, message] of entries) {
        const formKey = scrolling ? `scroll:${key}` : key;
        const owner = wrap.querySelector(`[data-problem-for="${formKey}"]`) || wrap.querySelector('[data-problem-for="*"]');
        const slot = /** @type {HTMLElement | null} */ (owner?.querySelector("[data-problem]") ?? null);
        if (!owner || !slot) continue;
        // A field folded away under Advanced is opened, so its reason shows.
        const fold = owner.closest("details");
        if (fold && !fold.open) fold.open = true;
        slot.textContent = slot.textContent ? `${slot.textContent} ${message}` : message;
        slot.hidden = false;
        for (const input of owner.querySelectorAll("input")) input.setAttribute("aria-invalid", "true");
    }
    return entries.length > 0;
}
