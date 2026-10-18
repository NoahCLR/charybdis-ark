// @ts-check
import {el, esc} from "../../lib/dom.mjs";
import {render, state} from "../../store.mjs";
import {css} from "../../lib/colour.mjs";
import {section} from "./common.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageBase(model) {
    const node = el(`<div></div>`);

    // The base effect is a VIA read, and the keyboard stores it with the
    // rest of its global policy — so it is edited there, not in the profile.
    const base = model.rgb.baseEffect || {};
    node.className = "tab-grid three";
    // Edited in Settings, so it shows as a swatch here rather than as a
    // picker that cannot be moved.
    const colour = section("Colour");
    colour.append(base.previewColor
        ? el(`<div class="row colour-head"><span class="swatch-lg" style="background:${css(base.previewColor)}"></span>
            <div><div class="colour-title">Base effect</div><div class="note">${esc(base.effectName || "")}</div></div></div>`)
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
    where.append(el(`<p class="note">The keyboard keeps its base effect with its other settings, so its effect, colour and speed are changed in Settings. This board paints whatever they are set to.</p>`), jump);
    node.append(colour, facts, where);
    return node;
}
