// @ts-check
import {choiceField} from "../segmented.mjs";
import {settingOptions} from "../../view/choices.mjs";
import {el, esc} from "../../lib/dom.mjs";
import {post} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {lightingOff} from "../../view/lighting.mjs";
import * as edits from "../../view/edits.mjs";
import {sectionsIn} from "../../view/settings-layout.mjs";
import {colourControl, section, stack} from "./common.mjs";

// The background effect is QMK's own RGB Matrix effect: drawn first, under
// every stage, on the LED classes it is given; a layer with no colour shows
// it. The keyboard keeps it with its settings, so it saves as one settings
// section, posted whole whichever control changed.
/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageBase(model) {
    const node = el(`<div class="tab-grid three"></div>`);
    const gate = editGate(model, "settings");
    const effect = sectionsIn(model, "Lighting").find((entry) => entry.id === "rgbAppearance");
    if (!effect) {
        node.append(el(`<p class="note span">${esc(gate.why || "Choose Read keyboard to read the background effect.")}</p>`));
        return node;
    }
    const editable = gate.editable;
    /** @param {string} macro */
    const field = (macro) => effect.fields.find((entry) => entry.macro === macro);
    /** @param {Record<string, string | undefined>} values */
    const submit = (values) => post(edits.settingsSection(effect, (entry) => values[entry.macro], model.settingsEditing?.identity));

    const hue = field("hue"), saturation = field("saturation"), brightness = field("brightness");
    const colour = section("Colour");
    if (hue && saturation && brightness) {
        // Brightness waits for the keyboard's limit; hue and saturation do not.
        colour.append(colourControl(model, {
            colour: {h: hue.value, s: saturation.value, v: brightness.value}, canEdit: editable, title: "Background colour",
            offNote: "Hue, saturation and brightness are all 0, so the background effect is dark.",
            onChange: (next) => submit({hue: String(next.h), saturation: String(next.s), brightness: brightness.readOnly ? undefined : String(next.v)}),
        }));
        colour.append(el(`<p class="note">${esc(brightness.readOnly ? brightness.hint || "" : "Solid colour shows it as it is; most animated effects build on it.")}</p>`));
    }

    const how = section("Effect");
    /** @param {import("../../../contracts/panel.js").PresentedField | undefined} entry */
    const choice = (entry) => {
        if (!entry) return el(`<span></span>`);
        const control = el(`<div data-tip="${esc([entry.tooltip, entry.hint].filter(Boolean).join(" "))}">${choiceField({label: entry.label, f: `setting:${entry.macro}`,
            choices: settingOptions(entry), current: String(entry.value), disabled: !(editable && !entry.readOnly), attributes: {"data-macro": entry.macro}})}
            ${entry.hint ? `<span class="hint">${esc(entry.hint)}</span>` : ""}</div>`);
        control.addEventListener("change", (event) => submit({[entry.macro]: /** @type {HTMLInputElement | HTMLSelectElement} */ (event.target).value}));
        return control;
    };
    const speed = field("effectSpeed");
    const speedControl = speed ? el(`<label class="field" data-tip="${esc([speed.tooltip, speed.hint].filter(Boolean).join(" "))}"><span>${esc(speed.label)}</span>
        <input class="input mono num" inputmode="numeric" data-macro="${esc(speed.macro)}" data-f="setting:${esc(speed.macro)}" value="${esc(speed.value)}" ${editable && !speed.readOnly ? "" : "disabled"}>
        <span class="hint">${esc(speed.hint || "")}. Effects without animation ignore it.</span></label>`) : el(`<span></span>`);
    speedControl.querySelector("input")?.addEventListener("change", (event) => {
        const written = /** @type {HTMLInputElement} */ (event.target).value.trim();
        if (written && written !== speed?.value) submit({effectSpeed: written});
    });
    how.append(stack(choice(field("effectMode")), choice(field("effectLeds")), speedControl));

    const under = section("Under every stage");
    under.append(el(`<p class="note">QMK's own effect, drawn first. Every stage paints over it.</p>`));
    if (lightingOff(model)) under.append(el(`<div class="callout">All lighting is off, so nothing is lit. Its switch is at the top of this screen.</div>`));
    node.append(colour, how, under);
    return node;
}
