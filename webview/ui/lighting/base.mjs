// @ts-check
// The base effect: QMK's RGB Matrix effect under every other stage. The
// keyboard stores it with its global settings, so each control here posts the
// whole Base effect settings section with one field changed — the values are
// the settings' own (brightness on the keyboard's 0–200 scale, never VIA's
// 255-scaled reading, B19).

// Selector assertions refer to elements created by this module's authored markup.
import {el, esc} from "../../lib/dom.mjs";
import {post, canEdit as canEditArea} from "../../store.mjs";
import {baseAnimated, baseEffectName, baseSection} from "../../view/lighting.mjs";
import * as edits from "../../view/edits.mjs";
import {unavailable} from "../shell.mjs";
import {durationControl} from "../duration.mjs";
import {colourControl, section, stack} from "./common.mjs";

/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageBase(model) {
    const settings = baseSection(model);
    if (!settings) {
        const base = model.rgb.baseEffect || {};
        return el(`<div class="callout">${esc(unavailable(model) || (base.state === "read"
            ? `This keyboard reports ${base.effectName || "its effect"}, but not the settings that edit it. Read the keyboard to edit the base effect.`
            : "Read the keyboard to edit the base effect."))}</div>`);
    }
    const canEdit = canEditArea("settings");
    /** @param {string} macro */
    const field = (macro) => settings.fields.find((entry) => entry.macro === macro);
    /** @param {Record<string, string | boolean | undefined>} changes */
    const save = (changes) => post(edits.settingsSection(settings, (entry) => changes[entry.macro], model.settingsEditing?.identity));
    /** @param {import("../../../contracts/panel.js").PresentedField | undefined} entry */
    const editable = (entry) => Boolean(entry) && canEdit && !entry?.readOnly;

    const node = el(`<div class="tab-grid two stage-detail"></div>`);
    const hue = field("hue"), saturation = field("saturation"), brightness = field("brightness");
    const colour = section("Colour");
    const animated = baseAnimated(model);
    if (hue && saturation && brightness) {
        colour.append(colourControl(model, {
            colour: {h: hue.value, s: saturation.value, v: brightness.value},
            canEdit: editable(hue) && editable(saturation) && editable(brightness),
            title: baseEffectName(model) || "Base effect",
            maximumBrightness: Number(brightness.max ?? model.rgb.maximumBrightness),
            black: "The base effect paints its LEDs dark.",
            onChange: (next) => save({hue: String(next.h), saturation: String(next.s), brightness: String(next.v)}),
        }));
        if (animated) colour.append(el(`<p class="note">This effect animates; many effects start from this colour and brightness. The board draws it as a soft glow.</p>`));
    }

    const effect = section("Effect");
    const controls = [];
    const mode = field("effectMode");
    if (mode) {
        const select = el(`<label class="field"><span>Effect</span><select class="input" data-f="lighting:base:effect" ${editable(mode) ? "" : "disabled"} data-tip="${esc(mode.hint || "")}">
            ${(mode.choices || []).map((choice) => typeof choice === "object" ? `<option value="${esc(choice.value)}" ${String(choice.value) === String(mode.value) ? "selected" : ""}>${esc(choice.label)}</option>` : "").join("")}</select></label>`);
        /** @type {HTMLSelectElement} */ (select.querySelector("select")).addEventListener("change", (event) => save({effectMode: /** @type {HTMLSelectElement} */ (event.target).value}));
        controls.push(select);
    }
    const speed = field("effectSpeed");
    // Speed matters only to an effect that moves.
    if (speed && animated) {
        const input = el(`<label class="field"><span>Speed</span><input class="input mono" type="number" min="0" max="255" step="1" data-f="lighting:base:speed" value="${esc(speed.value)}" ${editable(speed) ? "" : "disabled"}
            data-tip="0–255. ${esc(speed.tooltip || "")}"></label>`);
        /** @type {HTMLInputElement} */ (input.querySelector("input")).addEventListener("change", (event) => save({effectSpeed: /** @type {HTMLInputElement} */ (event.target).value}));
        controls.push(input);
    }
    const leds = field("effectLeds");
    if (leds) {
        const select = el(`<label class="field"><span>Lights</span><select class="input" data-f="lighting:base:leds" ${editable(leds) ? "" : "disabled"} data-tip="${esc(leds.hint || "")}">
            ${(leds.choices || []).map((choice) => typeof choice === "object" ? `<option value="${esc(choice.value)}" ${String(choice.value) === String(leds.value) ? "selected" : ""}>${esc(choice.label)}</option>` : "").join("")}</select></label>`);
        /** @type {HTMLSelectElement} */ (select.querySelector("select")).addEventListener("change", (event) => save({effectLeds: /** @type {HTMLSelectElement} */ (event.target).value}));
        controls.push(select);
    }
    const timeout = field("lightingTimeout");
    if (timeout) {
        const box = el(`<div class="field"><span>${esc(timeout.label)}</span></div>`);
        const duration = durationControl(timeout, editable(timeout), () => {
            const ms = duration.read();
            if (ms === null) { duration.reportValidity(); return; }
            save({lightingTimeout: ms});
        });
        box.append(duration.node, el(`<span class="note">${esc(timeout.hint || "")}</span>`));
        controls.push(box);
    }
    effect.append(stack(...controls));
    const limit = brightness?.max ?? model.rgb.maximumBrightness;
    if (brightness) effect.append(el(`<p class="note" data-base-brightness>${limit === undefined
        ? `Brightness ${esc(brightness.value)}. ${esc(brightness.hint || "")}`
        : `Brightness ${esc(brightness.value)} of ${esc(limit)}, the keyboard's limit.`} Layer colours and feedback have their own brightness.</p>`));
    if (!canEdit && !model?.draft?.busy) effect.append(el(`<div class="unavailable">${esc(unavailable(model) || "The base effect cannot be edited right now.")}</div>`));
    node.append(colour, effect);
    return node;
}
