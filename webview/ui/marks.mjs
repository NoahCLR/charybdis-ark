// @ts-check
// One mark per thing that has a colour of its own, drawn the same everywhere.
//
// A behaviour tier is the dot the keyboard flashes when it resolves, a tap
// count is its branch badge, a layer is its layer colour, a pointing mode is
// the light its slot paints, a combo is its badge in the combo colour, a
// lighting stage is its on/off dot. The grid, the hover card, Settings and the
// draft review all draw these from here, so a colour means one thing on every
// surface — and a stage that is off draws its marks off.

import {css, isOff} from "../lib/colour.mjs";
import {esc} from "../lib/dom.mjs";
import {actionLabel, layerOfKeycode, visibleKeycode} from "../view/keyface.mjs";
import {macroChips} from "../view/macro.mjs";
import {sequenceFace} from "../view/macro-sequence.mjs";
import {namedAction} from "../view/reach.mjs";
import {feedbackColours, pdColourRow, stageEnabled} from "../view/lighting.mjs";
import {layerSwatch} from "./layerbar.mjs";
import {keycodeAside} from "../view/show-keycodes.mjs";
import {state} from "../store.mjs";

// A key's QMK keycode as the muted suffix beside its words, where Show
// keycodes allows it at this place (view/show-keycodes.mjs); empty otherwise.
/** @param {import("../view/show-keycodes.mjs").KeycodePlace} place @param {string | null | undefined} keycode @param {string} [words] @param {string} [className] */
export function keycodeMark(place, keycode, words, className = "dim") {
    const code = keycodeAside(state, place, keycode, words);
    return code ? `<code class="${esc(className)} kc-aside">${esc(code)}</code>` : "";
}

// A branch's badge as the grid heads its column: from 2× on, tinted with the
// tap-branch colour the keyboard shows while that branch is pending. The
// colour is the badge's border and fill; its count stays in the text colour,
// so a dark colour such as a deep blue still reads.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {number} count @param {string} [className] */
export function branchBadge(model, count, className = "") {
    const colour = feedbackColours(model).branches[count - 2];
    const lit = count > 1 && stageEnabled(model, "key") && colour && !isOff(colour);
    return `<span class="bn${lit ? " lit" : ""}${className ? ` ${esc(className)}` : ""}"${lit ? ` style="--tint:${css(colour)}"` : ""}>${count}×</span>`;
}

/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} kind */
export function tierDot(model, kind) {
    const colour = feedbackColours(model)[/** @type {import("../../contracts/edits.js").Tier} */ (kind)];
    const lit = stageEnabled(model, "key") && !isOff(colour);
    return `<i class="fbdot${lit ? "" : " off"}"${lit ? ` style="background:${css(colour)}"` : ""}></i>`;
}

// The colour the keyboard flashes when a combo fires, as a CSS colour, or ""
// when that stage or colour is off — so whatever wears it looks off too.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model */
export function comboTint(model) {
    const colour = model?.rgb?.comboFeedback?.color;
    return stageEnabled(model, "combo") && colour && !isOff(colour) ? css(colour) : "";
}

/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} [badge] */
export function comboBadge(model, badge = "C") {
    const colour = model?.rgb?.comboFeedback?.color;
    const lit = stageEnabled(model, "combo") && colour && !isOff(colour);
    return `<i class="mk-badge" style="${lit ? `border-color:${css(colour)}` : ""}">${esc(badge)}</i>`;
}

// A pointing slot's light, as the keyboard would show it: a stage that is off
// looks off. Every surface that shows a pointing mode draws it from here.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {{id: number}} slot */
export function slotLight(model, slot) {
    const row = pdColourRow(model, slot.id);
    const lit = Boolean(row && !isOff(row.color) && stageEnabled(model, "pd"));
    return {row, lit, swatch: (klass = "") => `<span class="pd-swatch ${klass} ${lit ? "" : "swatch-off"}"
        ${lit && row ? `style="background:${css(row.color)}"` : ""}></span>`};
}

// An action that names a pointing mode or a macro, as that thing: a pointing
// mode's light, the name, and its tags (hold or toggle, empty). Empty for a
// plain keycode, so the caller draws the keycode as it is. `sendsKind` is the
// word the line describing the branch leads with, so the kind is said, not
// only inferred from a swatch.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} action */
export function sends(model, action) {
    const named = namedAction(model, action);
    if (!named) return "";
    return `<span class="sends">${named.kind === "pointing" ? slotLight(model, named.slot).swatch("mk-swatch") : ""}`
        + `<span class="sends-name">${esc(named.name)}</span>${named.tags.map((tag) => `<span class="sends-tag">${tag}</span>`).join("")}</span>`;
}
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} action */
export const sendsKind = (model, action) => namedAction(model, action)?.word || "";

// A mark as the host describes it: {kind: "tier", tier, branch?} · {kind:
// "branch", count} · {kind: "layer", layer} · {kind: "pointing", slot} ·
// {kind: "combo", badge?} · {kind: "stage", on}. Anything else draws nothing.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/model.js").ReviewMark | null | undefined} value */
export function mark(model, value) {
    switch (value?.kind) {
        case "tier": return `${value.branch ? branchBadge(model, value.branch) : ""}${tierDot(model, value.tier)}`;
        case "branch": return branchBadge(model, value.count);
        case "layer": return layerSwatch(model, {index: value.layer}, "mk-swatch").html;
        case "pointing": return slotLight(model, {id: value.slot}).swatch("mk-swatch");
        case "combo": return comboBadge(model, value.badge);
        case "stage": return `<i class="stagedot ${value.on ? "on" : ""}"></i>`;
        default: return "";
    }
}

// A key's name with the layer it acts on marked where the name says it:
// "F / ■ Navigation", "Hold ■ Navigation", "■ Numbers + Shift". The host names
// the layer (qmkKeyLayers) and puts its name at one end of the key's name
// (core/model/key-names.js); one that does not is left as it is.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} text @param {string} keycode */
export function keyNameMarked(model, text, keycode) {
    return layerNameMarked(model, layerOfKeycode(model, keycode), text);
}

// An action by its words with its layer marked, as every surface names one:
// "Hold ■ Numbers", "Lock ■ Symbol". The plain words when it acts on no layer.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} keycode @param {string} [text] */
export const actionMarked = (model, keycode, text = actionLabel(model, keycode)) => keyNameMarked(model, text, keycode);

// What a combo sends and the keys that press it, named the same way.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/panel.js").ComboView} combo */
export const comboOutputMarked = (model, combo) =>
    keyNameMarked(model, combo.outputDisplay || combo.output, visibleKeycode(model, combo.output) || combo.output);
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/panel.js").ComboView} combo */
export const comboInputsMarked = (model, combo) =>
    (combo.inputs || []).map((input, at) => keyNameMarked(model, combo.inputDisplays?.[at] ?? input, input)).join(" + ");

// A label starting or ending in a layer's name, with that layer's mark before
// the name. Empty-handed (no layer, or a label that does not carry its name)
// it is the label as it is.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {number | null | undefined} at @param {string} text */
export function layerNameMarked(model, at, text) {
    const layer = at === null || at === undefined ? null : model?.layers?.[at];
    const name = layer ? layer.displayName || layer.name : "";
    const label = String(text ?? "");
    if (!layer || !name) return esc(label);
    const shown = marked(model, {kind: "layer", layer: layer.index}, name);
    if (label.endsWith(name)) return `${esc(label.slice(0, -name.length))}${shown}`;
    if (label.startsWith(name)) return `${shown}${esc(label.slice(name.length))}`;
    return esc(label);
}

// A label with its mark in front, as a label reads everywhere. Where marked
// and unmarked labels share a column, `slot` gives every one of them the same
// mark slot, so their words start at one edge and the dots line up.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/model.js").ReviewMark | null | undefined} value @param {string} text @param {{slot?: boolean}} [options] */
export const marked = (model, value, text, {slot = false} = {}) => {
    const shown = mark(model, value);
    if (slot) return `<span class="mk"><span class="mk-slot">${shown}</span><span>${esc(text)}</span></span>`;
    return shown ? `<span class="mk">${shown}<span>${esc(text)}</span></span>` : esc(text);
};

// A macro step's mark: ↓ held, ↑ let go, a dot tapped, a quote typed and a
// clock waited. The macro editor's tiles and every chip of steps share it.
/** @param {string} kind */
export const stepMark = (kind) => kind === "press" ? "↓" : kind === "release" ? "↑" : kind === "tap" ? '<i class="macro-tap-dot"></i>'
    : kind === "text" ? "“" : '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/></svg>';

// The word under an editor tile, and what a screen reader says before a chip,
// since the mark that tells press from release is not read out.
/** @param {string} kind @param {boolean} [chord] */
export const stepWord = (kind, chord = false) => kind === "delay" ? "wait" : kind === "tap" && chord ? "chord" : kind;

const THEN = '<span class="step-chip-then" aria-hidden="true">→</span>';

// A macro's steps as chips, each a small editor tile: its mark, then the
// short name the tile shows (typed text in quotes), joined by the editor's
// arrows. The full name is the chip's tip in Keys → Macros; the hover card
// cannot be hovered, so it reads the short names alone.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} payload */
export function macroSteps(model, payload) {
    const {chips, more} = macroChips(payload, (step) => sequenceFace(model, step));
    const said = (/** @type {typeof chips[number]} */ chip) => `<span class="step-chip-said">${esc(stepWord(chip.kind, chip.chord))} </span>`;
    // Typed text reads as a string: its quotes stand in for the mark, and stay
    // in view when the chip is too narrow for the text.
    return `<div class="step-chips">${chips.map((chip) => `<span class="step-chip ${esc(chip.kind)}" data-tip="${esc(chip.full)}">${said(chip)}${chip.kind === "text"
        ? `<span aria-hidden="true">“</span><span class="step-chip-label">${esc(chip.label)}</span><span aria-hidden="true">”</span>`
        : `<span class="step-chip-mark" aria-hidden="true">${stepMark(chip.kind)}</span><span class="step-chip-label">${esc(chip.label)}</span>`}${chip.kind === "delay"
        ? '<span class="step-chip-unit">ms</span>' : ""}</span>`).join(THEN)}${more ? `${THEN}<span class="step-chips-more">+${more} more</span>` : ""}</div>`;
}
