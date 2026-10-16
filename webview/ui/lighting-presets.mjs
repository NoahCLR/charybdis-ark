// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {getModel, render, canEdit, post} from "../store.mjs";
import {lightingPreset} from "../view/edits.mjs";
import {lightingSituation} from "../view/lighting-rules.mjs";
import {replayLighting} from "../view/lighting-understanding.mjs";
import {lightingBoard} from "./lighting-board.mjs";
import {lightingSelect} from "./lighting-fields.mjs";
/** @type {string | null} */ let selected = null;
let previewIdentity = "", confirmed = false, layer = 0;
export function lightingPresetsCard() {
    const model = getModel(), lighting = model?.rgb.lighting, node = el('<section class="card" aria-label="Lighting presets"><div class="card-h"><h3>Starting presets</h3></div><div class="card-b stack gap-12"></div></section>'), body = /** @type {HTMLElement} */ (node.querySelector(".card-b"));
    if (!model || !lighting) return node;
    const identity = JSON.stringify([model.draft?.id, model.draft?.revision, lighting.expectedLighting, lighting.presets]);
    const descriptions = {standard: "The keyboard's exact compiled lighting, including its original feedback and fade.", minimal: "Factory layer looks only. No behaviour, combo, mode or preview feedback; no fade or tap-commit extensions.", teaching: "Layer looks with passive hints: direct layer-action keys use their target's colour; configured combo inputs use copied combo colours. Lower combo numbers win overlaps, above layer keys."};
    body.append(el('<p class="note">Preview an editable starting rule set, then keep it as one draft change. It replaces all lighting; keys, behaviours, combos and other settings stay as they are. Undo restores the previous lighting. Review and Export use the same draft.</p>'));
    for (const preset of lighting.presets ?? []) {
        const row = el(`<div class="preset-choice"><div class="row"><strong>${esc(preset.name[0].toUpperCase() + preset.name.slice(1))}</strong><button class="btn tiny right" data-preview-preset="${esc(preset.name)}" ${preset.reason ? "disabled" : ""}>Preview ${esc(preset.name)}</button></div><p class="note">${esc(descriptions[preset.name])}${preset.reason ? ` ${esc(preset.reason)}` : ""}</p></div>`);
        row.querySelector("button")?.addEventListener("click", () => {selected = preset.name;previewIdentity = identity;confirmed = false;render();});body.append(row);
    }
    if (!lighting.presets) body.append(el('<p class="note">A complete keyboard read is needed to offer verified starting presets.</p>'));
    const candidate = lighting.presets?.find(p => p.name === selected);
    if (!candidate?.program) return node;
    const stale = previewIdentity !== identity;
    body.append(el(`<p class="${stale ? "callout" : "note"}" data-preset-summary>${stale ? "The draft changed. Preview this preset again before keeping it." : `Replace ${lighting.program.rules.length} rules with ${candidate.program.rules.length}; saved lighting ${candidate.program.byteLength} bytes. This changes only the draft.`}</p>`));
    if (candidate.name === "teaching") body.append(el('<p class="callout">Teaching copies current combo colours. Later identity edits do not update these copied colours; recreate the preset to refresh.</p>'));
    body.append(lightingSelect("preset:layer", "Preview layer · local", model.layers.map(l => [l.index, l.displayName || l.name]), layer, true, n => {layer = n;render();}));
    try {body.append(lightingBoard(replayLighting(candidate.program, [{situation: {...lightingSituation(model, [{kind: 1, params: [layer], keys: []}]), time: 0}}], model.behaviorEditing.maxTapStepsPerBehavior).frame, "preset"));}
    catch (e) {body.append(el(`<p class="callout">Preview incomplete: ${esc(/** @type {Error} */ (e).message)}</p>`));}
    if (candidate.replacesUnknown) {
        const warning = el(`<div class="callout"><p>This intentionally replaces lighting bytes Ark cannot interpret. Export a backup first. The current bytes remain in Undo history; replacement will remove them from the new lighting.</p><label class="sw"><input type="checkbox" data-f="preset:replace-unknown" ${confirmed ? "checked" : ""}><span class="track"></span><span class="txt">Replace the unknown lighting too</span></label></div>`);
        warning.querySelector("input")?.addEventListener("change", e => {confirmed = /** @type {HTMLInputElement} */ (e.target).checked;render();});body.append(warning);
    }
    const save = el(`<button class="btn primary" data-keep-preset ${canEdit("lighting") && !stale && (!candidate.replacesUnknown || confirmed) && lighting.expectedLighting ? "" : "disabled"}>Keep ${esc(candidate.name)} in draft</button>`);
    save.addEventListener("click", () => post(lightingPreset({preset: candidate.name, expectedLighting: lighting.expectedLighting ?? "", replaceUnknown: confirmed}, model.draft?.revision)));body.append(save);
    return node;
}
