// @ts-check
import {choiceField} from "../segmented.mjs";
import {settingOptions} from "../../view/choices.mjs";
import {el, esc} from "../../lib/dom.mjs";
import {post} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import * as edits from "../../view/edits.mjs";
import {sectionsIn} from "../../view/settings-layout.mjs";
import {colourControl, section, stack, stageSurface} from "./common.mjs";
import {sectionInfo} from "./help.mjs";

// The background effect is QMK's own RGB Matrix effect: drawn first, under
// every stage, on the LED classes it is given; a passthrough layer shows
// it. The keyboard keeps it with its settings, so it saves as one settings
// section, posted whole whichever control changed. It lays out as every
// stage does: its effect where a list would be, its colour, and which LEDs
// it lights where the others say where they paint.
/** @param {import("../../../contracts/panel.js").PublishedModel} model */
export function stageBase(model) {
    const gate = editGate(model, "settings");
    const effect = sectionsIn(model, "Lighting").find((entry) => entry.id === "rgbAppearance");
    if (!effect) {
        return stageSurface(model, {id: "base", first: el(`<section><p class="note">${esc(gate.why || "Choose Read keyboard to read the background effect.")}</p></section>`),
            colour: el(`<section></section>`), side: el(`<section></section>`)});
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
        if (brightness.readOnly && brightness.hint) colour.append(el(`<p class="note">${esc(brightness.hint)}</p>`));
    }

    // What the choices mean is on the section's info mark (help.mjs) alone,
    // so no tip repeats it; why one cannot be chosen yet stays under it.
    /** @param {import("../../../contracts/panel.js").PresentedField | undefined} entry */
    const choice = (entry) => {
        if (!entry) return el(`<span></span>`);
        const control = el(`<div>${choiceField({label: entry.label, f: `setting:${entry.macro}`,
            choices: settingOptions(entry), current: String(entry.value), disabled: !(editable && !entry.readOnly), attributes: {"data-macro": entry.macro}})}
            ${entry.readOnly && entry.hint ? `<span class="hint">${esc(entry.hint)}</span>` : ""}</div>`);
        control.addEventListener("change", (event) => submit({[entry.macro]: /** @type {HTMLInputElement | HTMLSelectElement} */ (event.target).value}));
        return control;
    };
    const speed = field("effectSpeed");
    const speedControl = speed ? el(`<label class="field"><span>${esc(speed.label)}</span>
        <input class="input mono num" inputmode="numeric" data-macro="${esc(speed.macro)}" data-f="setting:${esc(speed.macro)}" value="${esc(speed.value)}" ${editable && !speed.readOnly ? "" : "disabled"}>
        <span class="hint">${esc(speed.hint || "")}</span></label>`) : el(`<span></span>`);
    speedControl.querySelector("input")?.addEventListener("change", (event) => {
        const written = /** @type {HTMLInputElement} */ (event.target).value.trim();
        if (written && written !== speed?.value) submit({effectSpeed: written});
    });
    const how = section("Effect", sectionInfo(model, "base:effect"));
    how.append(stack(choice(field("effectMode")), speedControl));
    const leds = section("Where it paints", sectionInfo(model, "base:leds"));
    leds.append(stack(choice(field("effectLeds"))));
    return stageSurface(model, {id: "base", first: how, colour, side: leds, note: "Drawn first, under every other stage."});
}
