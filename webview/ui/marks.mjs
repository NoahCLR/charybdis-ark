// @ts-check
// One mark per thing that has a colour of its own, drawn the same everywhere.
//
// A behaviour tier is the dot the keyboard flashes when it resolves, a tap
// count is its branch badge, a layer is the board's icon in its layer colour,
// a pointing mode is the Pointing modes icon in the light its slot paints, a
// combo is its badge in the combo colour, a lighting stage is its on/off dot.
// The grid, the hover card, Settings and the draft review all draw these from
// here, so a colour means one thing on every surface — and a stage that is off
// draws its marks off. Where the colour itself is shown, or every item is a
// layer (the layer bar, a list of layer chips), a screen shows the colour's
// swatch instead (layerSwatch, slotLight), which is not a mark.

import {css, isOff} from "../lib/colour.mjs";
import {esc} from "../lib/dom.mjs";
import {actionLabel, layerOfKeycode, visibleKeycode} from "../view/keyface.mjs";
import {macroChips} from "../view/macro.mjs";
import {sequenceFace} from "../view/macro-sequence.mjs";
import {namedAction, slotKeycodeNames} from "../view/reach.mjs";
import {feedbackColours, pdColourRow, stageEnabled} from "../view/lighting.mjs";
import {SCREENS} from "../view/screens.mjs";
import {boardOutlineMarkup} from "../view/geometry.mjs";
import {layerSwatch} from "./layerbar.mjs";

// A branch's badge as the grid heads its column: from 2× on, tinted with the
// tap-branch colour the keyboard shows while that branch is pending. The
// colour is the badge's border and fill; its count stays in the text colour,
// so a dark colour such as a deep blue still reads.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {number} count @param {string} [className] */
export function branchBadge(model, count, className = "") {
    const colour = feedbackColours(model).branches[count - 2];
    const lit = count > 1 && stageEnabled(model, "key") && colour && !isOff(colour);
    return `<span class="bn${lit ? " lit" : ""}${className ? ` ${esc(className)}` : ""}"${lit ? ` style="--tint:${css(colour)}"` : ""}>${esc(count)}×</span>`;
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
    return {row, lit, colour: lit && row ? css(row.color) : null, swatch: (klass = "") => `<span class="pd-swatch ${esc(klass)} ${lit ? "" : "swatch-off"}"
        ${lit && row ? `style="background:${css(row.color)}"` : ""}></span>`};
}

// What kind of thing a named action is, as an icon in the thing's own
// colour: one mark says both what it is and its colour. A layer is the board
// itself, every key and the trackball as the rail draws Ark's mark
// (boardOutlineMarkup, view/geometry.mjs); a pointing mode is the Pointing
// modes screen's icon. With no colour, because its stage or colour is off,
// the icon looks off. A macro has none.
const LAYER_ICON = boardOutlineMarkup("board-icon");
/** @param {string} kind @param {string | null} colour */
function kindIcon(kind, colour) {
    const look = colour ? ` style="color:${colour}"` : "";
    const off = colour ? "" : " off";
    if (kind === "layer") return `<span class="kind-icon layer${off}"${look} aria-hidden="true">${LAYER_ICON}</span>`;
    if (kind === "pointing") return `<span class="kind-icon pointing${off}"${look} aria-hidden="true">${SCREENS.pointing.icon}</span>`;
    return "";
}

// A layer's icon with no colour, for a line that stands for several layers at
// once (the layer stack's folded run), so it lines up with the marks around it.
export const layerIconOff = () => kindIcon("layer", null);

// An action that names a layer, a pointing mode or a macro, as that thing: its
// kind's icon in its colour (the layer's colour, the light a pointing slot
// paints), the name, and its tags (what it does to the layer, hold or toggle,
// empty). Empty for a plain keycode, so the caller draws the keycode as it
// is. `sendsKind` is the word the line describing the branch leads with, so
// the kind is said, not only inferred from an icon. `inline` draws it in the
// words around it, as a name reads in a sentence, a table or the review.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} action @param {{inline?: boolean}} [options] */
export function sends(model, action, {inline = false} = {}) {
    const named = namedAction(model, action);
    if (!named) return "";
    const marker = named.kind === "layer" ? {kind: "layer", layer: named.layer}
        : named.kind === "pointing" ? {kind: "pointing", slot: named.slot.id} : null;
    return `<span class="sends${inline ? " inline" : ""}">${mark(model, /** @type {import("../../contracts/model.js").ReviewMark | null} */ (marker))}${tagged(named.name, named.tags)}</span>`;
}
// A name and the tags that qualify it, as `sends` draws them after the mark.
/** @param {string} name @param {string[]} tags */
const tagged = (name, tags) => `<span class="sends-name">${esc(name)}</span>${tags.map((tag) => `<span class="sends-tag">${esc(tag)}</span>`).join("")}`;
// The same, inline and without a mark, for a list where every item is one kind
// and a swatch beside it stands in for the mark (D-L31): "Zoom `HOLD`".
/** @param {string} name @param {string[]} tags */
export const namedWithTags = (name, tags) => `<span class="sends inline">${tagged(name, tags)}</span>`;
// A pointing slot by name, then each keycode that reaches it after its hold or
// lock tag: "Dragscroll `HOLD` PD_SLOT_0 `LOCK` PD_SLOT_0_LOCK".
/** @param {string} name @param {[string, string][]} keycodes */
export const slotNamedWithKeycodes = (name, keycodes) => `<span class="sends inline"><span class="sends-name">${esc(name)}</span>${keycodes
    .map(([how, code]) => `<span class="sends-tag">${esc(how)}</span><code class="dim">${esc(code)}</code>`).join("")}</span>`;
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} action */
export const sendsKind = (model, action) => namedAction(model, action)?.word || "";

// A mark as the core describes it: {kind: "tier", tier, branch?} · {kind:
// "branch", count} · {kind: "layer", layer} · {kind: "pointing", slot} ·
// {kind: "combo", badge?} · {kind: "stage", on}. Anything else draws nothing;
// a set of layers marks each name instead (valueMarked).
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/model.js").ReviewMark | null | undefined} value */
export function mark(model, value) {
    switch (value?.kind) {
        case "tier": return `${value.branch ? branchBadge(model, value.branch) : ""}${tierDot(model, value.tier)}`;
        case "branch": return branchBadge(model, value.count);
        case "layer": return kindIcon("layer", layerSwatch(model, {index: value.layer}).colour);
        case "pointing": return kindIcon("pointing", slotLight(model, {id: value.slot}).colour);
        case "combo": return comboBadge(model, value.badge);
        case "stage": return `<i class="stagedot ${value.on ? "on" : ""}"></i>`;
        default: return "";
    }
}

// A key's name as every surface draws it. An action on a layer or a pointing
// mode, named in the core's own words for it ("Hold Navigation", "Zoom ·
// hold"), reads as that thing, as the grid draws it (sends): its mark, its
// name and what the action does as a tag, never the action's word as text.
// Any other name has the layer it acts on marked where the name says it:
// "F / ▦ Navigation". The core names the layer (qmkKeyLayers) and puts its
// name at one end of the key's name (core/model/key-names.js); one that does
// not is left as it is.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} text @param {string} keycode */
export function keyNameMarked(model, text, keycode) {
    return namedInline(model, keycode, text) || layerNameMarked(model, layerOfKeycode(model, keycode), text);
}

// A layer or pointing-mode action, drawn as that thing when `text` is the
// core's name for it; empty for anything else, or a name the core did not give.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} keycode @param {string} text */
function namedInline(model, keycode, text) {
    const kind = namedAction(model, keycode)?.kind;
    return (kind === "layer" || kind === "pointing") && String(text ?? "") === actionLabel(model, keycode) ? sends(model, keycode, {inline: true}) : "";
}

// A value that names a layer or a pointing mode by its words alone, as the
// review compares them: an action on it ("Hold Navigation", "Zoom · lock")
// reads as that action does on every other surface, its mark, name and tag.
// The action is the one acting on that layer or slot that the core names
// this way; with none (a layer-tap, a name from before a rename) the label
// keeps the layer's mark before the layer's name, or is "" for the caller.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/model.js").ReviewMark | null | undefined} marker @param {string} text */
export function valueMarked(model, marker, text) {
    // A set of layers reads as its names, each after its layer's mark.
    if (marker?.kind === "layers") return marker.layers.map((entry) => entry.name).join(", ") === String(text)
        ? marker.layers.map((entry) => marked(model, {kind: "layer", layer: entry.layer}, entry.name)).join(", ") : "";
    const slot = marker?.kind === "pointing" ? model?.pdModes?.find((entry) => entry.id === marker.slot) : undefined;
    const keycodes = marker?.kind === "layer" ? Object.entries(model?.qmkKeyLayers || {}).flatMap(([keycode, layer]) => layer === marker.layer ? [keycode] : [])
        : slot ? slotKeycodeNames(slot) : [];
    for (const keycode of keycodes) {
        const named = namedInline(model, keycode, text);
        if (named) return named;
    }
    if (marker?.kind !== "layer") return "";
    const inline = layerNameMarked(model, marker.layer, text);
    return inline === esc(text) ? "" : inline;
}

// An action by its words with its layer marked, as every surface names one:
// "Hold ▦ Numbers", "Lock ▦ Symbol". The plain words when it acts on no layer.
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
        ? '<span class="step-chip-unit">ms</span>' : ""}</span>`).join(THEN)}${more ? `${THEN}<span class="step-chips-more">+${esc(more)} more</span>` : ""}</div>`;
}
