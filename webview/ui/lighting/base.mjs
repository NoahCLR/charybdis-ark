// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {render, state} from "../../store.mjs";
import {colourControl, section} from "./common.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageBase(model) {
    const node = el(`<div></div>`);

    // The base effect is a VIA read, and the keyboard stores it with the
    // rest of its global policy — so it is edited there, not in the profile.
    const base = model.rgb.baseEffect || {};
    node.className = "tab-grid three";
    const colour = section("Colour");
    colour.append(base.previewColor
        ? colourControl(model, {colour: base.previewColor, title: "Base effect", canEdit: false})
        : el(`<div class="callout">${esc(base.enabled === false ? "The base effect is switched off." : "This effect animates, so it has no single colour to show.")}</div>`));
    const facts = section("What the keyboard reports");
    facts.append(el(`<dl class="kv wide">
        <dt>Effect</dt><dd>${esc(base.effectName || "—")}</dd>
        <dt>Hue</dt><dd>${esc(base.hue ?? "—")}</dd>
        <dt>Saturation</dt><dd>${esc(base.saturation ?? "—")}</dd>
        <dt>Brightness</dt><dd>${esc(base.brightness ?? "—")}${base.brightnessPercent !== undefined ? ` · ${base.brightnessPercent}%` : ""}</dd>
        <dt>Speed</dt><dd>${esc(base.speed ?? "—")}</dd></dl>`));
    const where = section("Where it is edited");
    const jump = el(`<button class="btn self-start">Open Settings → Base lighting</button>`);
    jump.addEventListener("click", () => { state.screen = "settings"; render(); });
    where.append(el(`<p class="note">The base effect is not part of the profile: the keyboard keeps it with its global policy, and both halves report it. Editing it there keeps one value in one place; this board paints whatever it says.</p>`), jump);
    node.append(colour, facts, where);
    return node;
}
