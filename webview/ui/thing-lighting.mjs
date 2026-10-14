// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {getModel, post, render, state, canEdit} from "../store.mjs";
import {identityValue} from "../view/lighting.mjs";
import {subjectRules, canPaintSubject} from "../view/painting.mjs";
import {lightingIdentity} from "../view/edits.mjs";
import {vocabulary} from "../view/vocabulary.mjs";
import {colourEditor} from "./colour-editor.mjs";
import {openPainter} from "./lighting-painter.mjs";
/** @typedef {import('../../contracts/lighting.js').LightingSubject} Subject */
/** @type {Set<string>} */ const open = new Set();
/** @type {Map<string, number>} */ const colourSlot = new Map();
/** @param {HTMLElement} editor @param {Subject} subject @param {string} title */
export function withLightingTab(editor, subject, title) {
    const key = `${subject.kind}:${subject.id}`, selected = open.has(key);
    const node = el(`<div class="thing-editor"><div class="thing-tabs" role="tablist" aria-label="${esc(title)} editor"><button class="btn ${selected ? "" : "primary"}" role="tab" aria-selected="${!selected}" data-settings>Settings</button><button class="btn ${selected ? "primary" : ""}" role="tab" aria-selected="${selected}" data-lighting>Lighting</button></div></div>`);
    node.querySelector("[data-settings]")?.addEventListener("click", () => {open.delete(key);render();});
    node.querySelector("[data-lighting]")?.addEventListener("click", () => {open.add(key);render();});
    node.append(selected ? thingLighting(subject, title) : editor);return node;
}
/** @param {Subject} subject @param {string} title */
export function thingLighting(subject, title) {
    const model = getModel(), lighting = model?.rgb?.lighting, editable = canEdit("lighting") && (subject.kind < 3 || canPaintSubject(model, subject)), supported = lighting?.supportedThings.includes(subject.kind);
    const node = el(`<section class="card thing-lighting" aria-label="${esc(title)} lighting"><div class="card-h"><h3>${esc(title)} · Lighting</h3><button class="btn right" data-customise ${editable && canPaintSubject(model, subject) ? "" : "disabled"}>Customise</button></div><div class="card-b stack gap-12"></div></section>`);
    const body = /** @type {HTMLElement} */ (node.querySelector(".card-b"));
    if (!lighting || !supported || subject.id < 0) {body.append(el(`<p class="note">${subject.id < 0 ? "Keep this thing in the draft to give it its own lighting." : "This keyboard does not yet offer an identity or lighting condition for this kind of thing."}</p>`));return node;}
    const identity = identityValue(model, subject), rules = subjectRules(model, subject);
    const words = vocabulary(model).lighting;
    body.append(el(`<p class="note">Its colour is shared by rules that show its identity. ${identity.inherited ? "Following the board defaults." : "Customised for this thing."}</p>`));
    const columns = el(`<div class="thing-lighting-layout"><div class="identity-colours stack gap-12"></div><div class="identity-rules stack gap-12"></div></div>`);
    const colours = /** @type {HTMLElement} */ (columns.querySelector(".identity-colours")), explanation = /** @type {HTMLElement} */ (columns.querySelector(".identity-rules"));body.append(columns);
    const fields = subject.kind === 4 ? ["Hold", "Long hold", "Tap", ...Array.from({length: model?.behaviorEditing.maxTapStepsPerBehavior ? model.behaviorEditing.maxTapStepsPerBehavior - 1 : 4}, (_, i) => `${i + 2} taps`)] : ["Identity colour"];
    const owner = `${subject.kind}:${subject.id}`, activeSlot = colourSlot.get(owner) ?? 1;
    if (fields.length > 1) {
        const choose = el(`<label class="field"><span>Feedback colour</span><select class="input" data-f="identity:${owner}:slot">${fields.map((label, i) => `<option value="${i + 1}" ${activeSlot === i + 1 ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>`);
        choose.querySelector("select")?.addEventListener("change", e => {colourSlot.set(owner, Number(/** @type {HTMLSelectElement} */ (e.target).value));render();});colours.append(choose);
    }
    fields.forEach((label, index) => {
        if (fields.length > 1 && index + 1 !== activeSlot) return;
        const slot = index + 1, value = identityValue(model, subject, slot);
        const card = el(`<div class="identity-slot"><div class="row"><span class="note">${value.inherited ? "Board default" : "Custom colour"}</span><button class="btn tiny ghost right" data-inherit ${editable && !value.inherited ? "" : "disabled"}>Use board default</button><button class="btn tiny ghost" data-clear ${editable ? "" : "disabled"}>Let light through</button></div></div>`);
        card.append(colourEditor({identity: `identity:${subject.kind}:${subject.id}:${slot}`, title: label, colour: value.colour, canEdit: editable, zeroMeansClear: false, maximumBrightness: model?.rgb.maximumBrightness,
            offNote: "No identity colour is set. Rules below show through.", onChange: colour => post(lightingIdentity({...subject, slot, field: "colour", colour: {h: Number(colour.h), s: Number(colour.s), v: Number(colour.v)}}))}));
        card.querySelector("[data-inherit]")?.addEventListener("click", () => post(lightingIdentity({...subject, slot, field: "colour", colour: "inherit"})));
        card.querySelector("[data-clear]")?.addEventListener("click", () => post(lightingIdentity({...subject, slot, field: "colour", colour: "clear"})));
        colours.append(card);
    });
    if (subject.kind === 4 && lighting.supportedPaints.includes(8) && canPaintSubject(model, subject)) {
        const outcome = lighting.program.rules.some(r => r.parts.some(p => p.slot === 0 && p.kind === 8 && p.params[0] === subject.id && p.params[1] === 12) && r.parts.some(p => p.slot === 3 && p.kind === 8));
        const toggle = el(`<div><label class="sw"><input type="checkbox" data-f="identity:${subject.kind}:${subject.id}:outcome" ${outcome ? "checked" : ""} ${editable ? "" : "disabled"}><span class="track"></span><span class="txt">Colour by outcome</span></label><p class="note">Hold and long hold use the colour of the layer or pointing mode they enter. Other actions keep this behaviour's identity.</p></div>`);
        toggle.querySelector("input")?.addEventListener("change", e => post(lightingIdentity({...subject, field: "outcome", outcome: /** @type {HTMLInputElement} */ (e.target).checked})));colours.append(toggle);
    }
    const place = el(`<label class="field"><span>Where it lights up</span><select class="input" data-f="identity:${subject.kind}:${subject.id}:place" ${editable ? "" : "disabled"}><option value="254" ${identity.placeInherited ? "selected" : ""}>Board default · ${esc(words.targets[identity.place ?? 0])}</option>${[0, 1, 2, 4, 5, ...(subject.kind === 1 ? [6] : [])].filter(id => lighting.supportedTargets.includes(id)).map(id => `<option value="${id}" ${!identity.placeInherited && identity.place === id ? "selected" : ""}>${esc(words.targets[id])}</option>`).join("")}</select></label>`);
    place.querySelector("select")?.addEventListener("change", e => post(lightingIdentity({...subject, field: "place", place: Number(/** @type {HTMLSelectElement} */ (e.target).value)})));explanation.append(place);
    explanation.append(el(`<div><h4>What decides its lighting</h4><p class="note">Rules higher in Lighting win wherever they paint. ${subject.kind === 1 ? "Its mapped keys follow remaps live." : subject.kind === 2 ? "Its keys are those that started the mode." : subject.kind === 3 ? "Its keys are the combo inputs." : "Feedback follows the key showing this behaviour."}</p><div class="thing-lighting-rules">${rules.length ? rules.map(r => `<div class="thing-lighting-rule"><strong>${esc(r.when)}</strong>${r.inherited ? `<span class="tag">from Every ${subject.kind === 1 ? "layer" : subject.kind === 2 ? "mode" : subject.kind === 3 ? "combo" : "behaviour"}</span>` : ""}<p class="note">${esc(r.where)} · ${esc(r.how)}${r.enabled ? "" : " · turned off"}${r.readOnly ? " · read-only" : ""}</p></div>`).join("") : '<p class="note">No rule currently shows this thing.</p>'}</div></div>`));
    node.querySelector("[data-customise]")?.addEventListener("click", () => {
        const specific = rules.find(r => !r.inherited && !r.readOnly && lighting.program.rules[r.index].parts.some(p => p.slot === 3 && p.kind === 4));
        state.screen = "lighting";openPainter({title, subject, ...(specific ? {index: specific.index} : {})});
    });return node;
}
