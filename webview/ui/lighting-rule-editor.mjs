// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {getModel, post, render, canEdit} from "../store.mjs";
import {vocabulary} from "../view/vocabulary.mjs";
import {defaultLightingParams, normaliseLightingRule} from "../view/lighting-rules.mjs";
import {lightingRule} from "../view/edits.mjs";
import {lightingSelect, lightingParams} from "./lighting-fields.mjs";
/** @type {Map<string, {identity: string; value: import('../../contracts/lighting.js').LightingRule}>} */ const forms = new Map();
/** @param {import('../../contracts/lighting.js').LightingView['rules'][number]} saved */
export function lightingRuleConfiguration(saved) {
    const model = getModel(), lighting = model?.rgb.lighting;
    if (!model || !lighting || saved.readOnly) return el('<div></div>');
    let form = forms.get(saved.key);
    if (!form || form.identity !== saved.identity) {form = {identity: saved.identity, value: structuredClone(lighting.program.rules[saved.index])};forms.set(saved.key, form);}
    const f = form, words = vocabulary(model).lighting, editable = canEdit("lighting");
    const node = el('<div class="lighting-configuration stack gap-12"><h4>When</h4></div>');
    const update = () => {f.value = normaliseLightingRule(model, f.value);render();};
    const conditions = f.value.parts.filter(p => p.slot < 2), first = conditions[0], event = first?.slot === 0 && lighting.descriptors.facts[first.kind]?.construction === "event";
    conditions.forEach((part, index) => {
        const row = el(`<div class="lighting-condition stack gap-8"><div class="row"><span class="tag">${index ? "And" : event ? "When it happens" : "While"}</span><button class="btn tiny ghost right" data-remove ${editable ? "" : "disabled"}>Remove condition</button></div></div>`);
        const options = lighting.supportedFacts.filter(id => lighting.descriptors.facts[id] && (lighting.descriptors.facts[id].construction !== "event" || !index && lighting.supportedTimings.includes(3))).map(/** @returns {[number, string]} */ id => [id, words.facts[id]]);
        row.append(lightingSelect(`lighting:${saved.key}:condition:${index}:kind`, "Condition", options, part.kind, editable, kind => {part.kind = kind;part.params = defaultLightingParams(model, "facts", kind);if (lighting.descriptors.facts[kind].construction === "event") part.slot = 0;update();}));
        row.append(lightingParams(model, `lighting:${saved.key}:condition:${index}:parameter`, "facts", part, editable, params => {part.params = params;update();}));
        if (lighting.descriptors.facts[part.kind]?.construction !== "event") {
            const negated = el(`<label class="sw"><input type="checkbox" data-f="lighting:${esc(saved.key)}:condition:${index}:not" ${part.slot === 1 ? "checked" : ""} ${editable ? "" : "disabled"}><span class="track"></span><span class="txt">Not true</span></label>`);
            negated.querySelector("input")?.addEventListener("change", e => {part.slot = /** @type {HTMLInputElement} */ (e.target).checked ? 1 : 0;update();});row.append(negated);
        }
        row.querySelector("[data-remove]")?.addEventListener("click", () => {f.value.parts.splice(f.value.parts.indexOf(part), 1);update();});node.append(row);
    });
    const add = el(`<button class="btn" data-add-condition ${editable && conditions.length < 4 && lighting.supportedFacts.some(id => lighting.descriptors.facts[id]?.construction === "state") ? "" : "disabled"}>${conditions.length ? "Add a filter" : "Add a condition"}</button>`);
    add.addEventListener("click", () => {const kind = lighting.supportedFacts.find(id => lighting.descriptors.facts[id]?.construction === "state");if (kind === undefined) return;f.value.parts.splice(conditions.length, 0, {slot: 0, kind, params: defaultLightingParams(model, "facts", kind)});update();});node.append(add);
    if (!conditions.length) node.append(el('<p class="note">Always. Add a condition to choose when this rule paints.</p>'));
    for (const [slot, registry, title, supported] of /** @type {[number, string, string, number[]][]} */ ([[2, "targets", "Where", lighting.supportedTargets], [3, "paints", "Paint", lighting.supportedPaints], [4, "paints", "Background", lighting.supportedPaints]])) {
        const part = f.value.parts.find(p => p.slot === slot), list = supported.filter(id => lighting.descriptors[registry][id] && lighting.descriptors[registry][id].parameters.every(type => type !== "map" || lighting.program.maps.length > 0) && lighting.descriptors[registry][id].parameters.every(type => type !== "set" || lighting.program.keySets.length > 0) && lighting.descriptors[registry][id].parameters.every(type => type !== "colour" || lighting.program.palette.length > 0));
        const options = list.map(/** @returns {[number, string]} */ id => [id, registry === "targets" ? words.targets[id] : words.paints[id]]);
        if (slot === 4) options.unshift([-1, "Let lower rules show"]);
        node.append(lightingSelect(`lighting:${saved.key}:slot:${slot}:kind`, title, options, part?.kind ?? -1, editable, kind => {
            f.value.parts = f.value.parts.filter(p => p.slot !== slot);if (kind >= 0) f.value.parts.push({slot, kind, params: defaultLightingParams(model, registry, kind)});update();
        }));
        if (part) node.append(lightingParams(model, `lighting:${saved.key}:slot:${slot}:parameter`, registry, part, editable, params => {part.params = params;update();}));
    }
    const brightness = el(`<label class="field"><span>Brightness · 0–255</span><input class="input" type="number" min="0" max="255" value="${f.value.brightness}" data-f="lighting:${esc(saved.key)}:brightness" ${editable ? "" : "disabled"}></label>`);
    brightness.querySelector("input")?.addEventListener("change", e => {f.value.brightness = Number(/** @type {HTMLInputElement} */ (e.target).value);});node.append(brightness);
    node.append(el('<h4>Timing</h4>'));
    for (const kind of lighting.supportedTimings.filter(id => lighting.descriptors.timings[id] && (id !== 2 || !event) && (id !== 3 || event))) {
        const part = f.value.parts.find(p => p.slot === 5 && p.kind === kind), value = part ? part.params[0] | part.params[1] << 8 : 0;
        const field = el(`<label class="field"><span>${esc(words.timings[kind])} · ms${kind === 3 ? " (required)" : " · 0 turns it off"}</span><input class="input" type="number" min="${kind === 3 ? 1 : 0}" max="65535" value="${value}" data-f="lighting:${esc(saved.key)}:timing:${kind}" ${editable ? "" : "disabled"}></label>`);
        field.querySelector("input")?.addEventListener("change", e => {
            const n = Number(/** @type {HTMLInputElement} */ (e.target).value);
            f.value.parts = f.value.parts.filter(p => !(p.slot === 5 && p.kind === kind));
            if (n > 0 && Number.isInteger(n) && n <= 65535) f.value.parts.push({slot: 5, kind, params: [n & 255, n >> 8]});
            update();
        });node.append(field);
    }
    node.append(el(`<p class="note">${event ? "Filters are checked when the event happens. Show after runs inside the flash window; it never extends it." : "Show after needs a continuous match. Linger keeps the last matching keys only if the rule was already showing."}</p>`));
    if (!lighting.supportedTimings.length) node.append(el('<p class="note">This keyboard does not report timing controls.</p>'));
    const save = el(`<button class="btn primary" data-save-rule ${editable ? "" : "disabled"}>Save rule</button>`);
    save.addEventListener("click", () => {if ([...node.querySelectorAll("input")].every(input => input.reportValidity())) post(lightingRule(saved.index, saved.identity, "configure", {rule: normaliseLightingRule(model, f.value)}));});node.append(save);return node;
}
