// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {css} from "../lib/colour.mjs";
import {getModel, post, render, canEdit} from "../store.mjs";
import {lightingRule} from "../view/edits.mjs";
import {rulePaintColour} from "../view/lighting.mjs";
import {topbar, unavailable} from "./shell.mjs";
import {colourEditor} from "./colour-editor.mjs";
import {lightingMemoryCard} from "./lighting-memory.mjs";
/** @type {string | null} */
let selected = null;
/** @type {{index: number, identity: string} | null} */
let dragged = null;

export function screenLighting() {
    const model = getModel(), lighting = model?.rgb?.lighting;
    const main = el(`<div class="main">${topbar("Lighting", "Rules paint from top to bottom. The first rule that paints a key wins.")}</div>`);
    if (!model || !lighting) {
        main.append(el(`<div class="content"><div class="pad"><div class="screen-stub"><h3>No lighting read</h3><p class="note">${esc(unavailable(model) || "Read the keyboard to load its lighting rules.")}</p></div></div></div>`)); return main;
    }
    const pad = el(`<div class="pad lighting-pad"></div>`), content = el(`<div class="content"></div>`);
    const memory = lightingMemoryCard(model); if (memory) pad.append(memory);
    const editableLighting = canEdit("lighting"), rules = lighting.rules;
    if (!rules.some(r => r.key === selected)) selected = rules[0]?.key ?? null;
    const fade = lighting.program.extensions.find(e => e.kind === 1);
    const split = el(`<div class="lighting-workbench"><div class="card lighting-rule-list"><div class="card-h"><h3>Lighting rules</h3><span class="right note">${rules.length} rule${rules.length === 1 ? "" : "s"}</span></div><div class="rule-list-body"></div></div><div class="card lighting-rule-editor"></div></div>`);
    const list = /** @type {HTMLElement} */ (split.querySelector(".rule-list-body"));
    if (!rules.length) list.append(el(`<div class="card-b"><p class="note">No rules paint over the keyboard's base effect.</p></div>`));
    let band = "";
    for (const rule of rules) {
        if (rule.band !== band) {band = rule.band;list.append(el(`<div class="lighting-band">${esc(lighting.bands[band] || "Other rules")}</div>`));}
        const colour = rulePaintColour(model, rule.index), editable = editableLighting && !rule.readOnly;
        const row = el(`<article class="lighting-rule ${selected === rule.key ? "selected" : ""} ${rule.enabled ? "" : "rule-disabled"}" data-rule-key="${esc(rule.key)}" data-rule-index="${rule.index}" ${editable ? 'draggable="true"' : ""}>
            <div class="rule-position"><span class="note">${rule.index + 1}</span><button class="btn tiny ghost" data-up aria-label="Move rule ${rule.index + 1} up" ${editable && rule.index > 0 ? "" : "disabled"}>↑</button><button class="btn tiny ghost" data-down aria-label="Move rule ${rule.index + 1} down" ${editable && rule.index < rules.length - 1 ? "" : "disabled"}>↓</button></div>
            <button class="rule-description" data-select aria-label="Edit rule ${rule.index + 1}"><strong>${esc(rule.when)}</strong><span class="note">${esc(rule.where)} · ${esc(rule.how)}</span>${rule.readOnly ? '<span class="note">Needs a newer Ark · read-only</span>' : ""}</button>
            ${colour ? `<span class="rule-colour" style="background:${css(colour)}" data-tip="This rule's paint colour"></span>` : '<span class="rule-colour empty"></span>'}
            <label class="sw"><input data-f="lighting:${esc(rule.key)}:enabled" type="checkbox" ${rule.enabled ? "checked" : ""} ${editable ? "" : "disabled"} aria-label="Enable rule ${rule.index + 1}"><span class="track"></span><span class="txt">${rule.enabled ? "On" : "Off"}</span></label>
        </article>`);
        const send = (/** @type {import('../../contracts/edits.js').EditPayloads['editLightingRule']['action']} */ action, /** @type {Pick<import('../../contracts/edits.js').EditPayloads['editLightingRule'], 'to' | 'colour'>} */ fields = {}) => post(lightingRule(rule.index, rule.identity, action, fields));
        row.querySelector("[data-select]")?.addEventListener("click", () => {selected = rule.key;render();});
        row.querySelector("input")?.addEventListener("change", () => send("toggle"));
        row.querySelector("[data-up]")?.addEventListener("click", () => send("move", {to: rule.index - 1}));
        row.querySelector("[data-down]")?.addEventListener("click", () => send("move", {to: rule.index + 1}));
        row.addEventListener("dragstart", event => {dragged = {index: rule.index, identity: rule.identity};event.dataTransfer?.setData("text/plain", rule.key);});
        row.addEventListener("dragover", event => {if (dragged) {event.preventDefault();row.classList.add("drop-target");}});
        row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
        row.addEventListener("drop", event => {event.preventDefault();if (dragged && dragged.index !== rule.index) post(lightingRule(dragged.index, dragged.identity, "move", {to: rule.index}));dragged = null;row.classList.remove("drop-target");});
        row.addEventListener("dragend", () => {dragged = null;});
        list.append(row);
    }
    const editor = /** @type {HTMLElement} */ (split.querySelector(".lighting-rule-editor")), rule = rules.find(r => r.key === selected);
    if (rule) {
        editor.append(el(`<div class="card-h"><h3>Rule ${rule.index + 1}</h3>${!rule.readOnly ? `<button class="btn tiny ghost right" data-delete ${editableLighting ? "" : "disabled"}>Delete</button>` : ""}</div>`));
        const body = el(`<div class="card-b stack gap-12"><div><strong>${esc(rule.when)}</strong><p class="note">${esc(rule.where)} · ${esc(rule.how)}</p></div></div>`);
        if (rule.readOnly) body.append(el(`<div class="callout">This rule uses lighting this Ark cannot edit. It stays unchanged when you Apply or export a backup.</div>`));
        else if (rule.canColour) {
            body.append(colourEditor({identity: `lighting:${rule.key}:paint`, colour: rulePaintColour(model, rule.index), title: "Paint colour", canEdit: editableLighting, zeroMeansClear: false, offNote: `Current paint: ${rule.how.toLowerCase()}. Choose a colour to replace it.`,
                maximumBrightness: model.rgb.maximumBrightness, offTip: "Paint black. Lower rules stay covered where this rule paints.",
                onChange: colour => post(lightingRule(rule.index, rule.identity, "colour", {colour: {h: Number(colour.h), s: Number(colour.s), v: Number(colour.v)}}))}));
            if (!rule.colour) body.append(el(`<p class="note">Choosing a colour replaces this rule's current paint. Its condition and lighting area stay the same.</p>`));
        } else body.append(el(`<p class="note">This keyboard does not offer a plain colour paint.</p>`));
        if (fade?.params[0]) body.append(el(`<p class="note">Auto-mouse fade uses the bottom ${fade.params[3]} rule${fade.params[3] === 1 ? "" : "s"}. Moving a rule across that boundary changes what fades.</p>`));
        editor.querySelector("[data-delete]")?.addEventListener("click", () => post(lightingRule(rule.index, rule.identity, "delete")));
        editor.append(body);
    } else editor.append(el(`<div class="card-b"><p class="note">Select a rule to change its paint colour.</p></div>`));
    pad.append(split);content.append(pad);main.append(content);return main;
}
