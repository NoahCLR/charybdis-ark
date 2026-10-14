// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {css, idealText} from "../lib/colour.mjs";
import {getModel, currentLayer, layers, post, render, canEdit} from "../store.mjs";
import {paintLighting} from "../view/edits.mjs";
import {identityValue, paintedCells, mapPaintColour, rulePaintColour} from "../view/lighting.mjs";
import {vocabulary} from "../view/vocabulary.mjs";
import {copyLayerCells, selectPaintKeys, mirrorMap} from "../view/painting.mjs";
import {LED_INDEX} from "../view/geometry.mjs";
import {board} from "./board.mjs";
import {colourEditor} from "./colour-editor.mjs";
/** @type {{index?: number; key?: string; draftId?: string; subject?: import('../../contracts/lighting.js').LightingSubject; title: string} | null} */
let context = null;
/** @type {number | import('../../contracts/lighting.js').PaintColour} */
let brush = 128;
/** @type {number[]} */ let selection = [];
let tool = "brush", query = "mapped", copyLayer = 0;
export const painterOpen = () => Boolean(context);
/** @param {NonNullable<typeof context>} next */
export function openPainter(next) {const model = getModel();const first = (next.subject ? identityValue(model, next.subject).colour : rulePaintColour(model, next.index ?? -1)) || model?.rgb?.lighting?.program.palette[0];brush = first ? {...first} : 128;context = {...next, draftId: getModel()?.draft?.id, key: next.index === undefined ? undefined : getModel()?.rgb?.lighting?.rules[next.index]?.key};pendingSubject = null;selection = [];tool = "brush";render();}
export function closePainter() {context = null;render();}
export function lightingPainter() {
    const model = getModel(), lighting = model?.rgb?.lighting, layer = currentLayer();
    if (!context || !lighting || !model) return el(`<div></div>`);
    if (typeof brush !== "number") brush = {...brush, v: Math.min(brush.v, model.rgb.maximumBrightness ?? 255)};
    if (!lighting.supportedPaints.includes(2) && typeof brush !== "number") brush = lighting.supportedPaints.includes(3) ? 131 : lighting.supportedPaints.includes(1) ? 129 : 128;
    const ctx = context;
    if (ctx.key) {
        const match = lighting.rules.find(r => r.key === ctx.key);ctx.index = match?.index;
    }
    const rule = ctx.index === undefined ? undefined : lighting.rules[ctx.index];
    const cells = paintedCells(model, ctx.index), editable = canEdit("lighting") && lighting.supportedPaints.includes(4) && !rule?.readOnly && (Boolean(rule) || Boolean(ctx.subject));
    /** @param {Partial<import('../../contracts/edits.js').EditPayloads['paintLightingMap']>} fields */
    const send = fields => {
        if (!editable) return;
        post(paintLighting({...ctx.index === undefined ? {subject: ctx.subject} : {index: ctx.index, expectedRule: rule?.identity}, ...fields}));
        if (ctx.index === undefined) {
            // New rules are placed by the host; follow their condition when its
            // published model arrives, rather than assuming a local index.
            pendingSubject = ctx.subject ?? null;
        }
    };
    const node = el(`<section class="card painter" aria-label="Lighting painter">
        <div class="card-h"><div><h3>${esc(ctx.title)}</h3><span class="note">Paint a look · every stroke goes into your draft</span></div><button class="btn ghost right" data-close>Back to lighting</button></div>
        <div class="card-b stack gap-12"><div class="row painter-toolbar" role="toolbar" aria-label="Painting tools">
            <button class="btn ${tool === "brush" ? "primary" : ""}" data-tool="brush">Brush</button><button class="btn ${tool === "select" ? "primary" : ""}" data-tool="select">Select</button>
            <button class="btn" data-fill ${editable ? "" : "disabled"}>Fill ${selection.length ? "selection" : "board"}</button><button class="btn ghost" data-clear-selection>${selection.length === 58 ? "Clear selection" : "Select all"}</button>
            <span class="note">${selection.length ? `${selection.length} selected` : "Click or drag across keys"}</span></div>
            <div class="row painter-options"><label class="field"><span>Select keys that…</span><select class="input" data-f="painter:query" data-query>${[["mapped", "Are mapped"], ["transparent", "Let the layer below through"], ["unused", "Do nothing"], ["letters", "Type letters"], ["numbers", "Type numbers"], ["modifiers", "Hold modifiers"], ["symbols", "Type symbols"], ["navigation", "Navigate"], ["media", "Control media"], ["mouse", "Control the mouse"], ["behaviours", "Have a behaviour"], ["combos", "Belong to a combo"], ["layers", "Switch layers"], ["pointing", "Start pointing modes"], ["macros", "Play macros"]].map(([id, name]) => `<option value="${id}" ${query === id ? "selected" : ""}>${name}</option>`).join("")}</select></label><button class="btn" data-select-query>Select keys</button>
            <label class="field"><span>Copy painted layer</span><select class="input" data-f="painter:copy-layer" data-copy-layer>${layers().map(l => `<option value="${l.index}" ${copyLayer === l.index ? "selected" : ""}>${esc(l.displayName || l.name)}</option>`).join("")}</select></label><button class="btn" data-copy ${editable ? "" : "disabled"}>Copy</button></div>
            <div class="painter-workspace"><div class="painter-canvas"><div data-board></div><div class="row"><button class="btn" data-mirror="left" ${editable ? "" : "disabled"}>Mirror left → right</button><button class="btn" data-mirror="right" ${editable ? "" : "disabled"}>Mirror right → left</button></div><p class="note">Clear lets lower rules show. Off paints black. Mirror pairs matching physical keys; the two unmatched thumbs and trackball keep their paint.</p><div class="row"><button class="btn tiny ghost" data-extra="56">Trackball</button><button class="btn tiny ghost" data-extra="57">Unassigned LED</button></div></div><aside class="painter-palette stack gap-12"><div><h4>Brush paint</h4><div class="row" data-paints></div></div><div data-colour></div><div><h4>Saved colours</h4><div class="palette-grid" data-palette></div><p class="note">${lighting.program.palette.length} of ${lighting.paletteCapacity} colours · identical colours are reused</p></div></aside></div>
        </div></section>`);
    const targetKind = rule ? lighting.program.rules[rule.index]?.parts.find(p => p.slot === 2)?.kind : 0;
    const area = el(`<label class="field painter-area"><span>Lighting area</span><select class="input" data-f="painter:target" ${editable ? "" : "disabled"}>${[0, 1, 2, 4, 5, ...(ctx.subject?.kind === 1 || targetKind === 6 ? [6] : []), 7].filter(kind => lighting.supportedTargets.includes(kind)).map(kind => `<option value="${kind}" ${targetKind === kind ? "selected" : ""}>${esc(vocabulary(model).lighting.targets[kind])}</option>`).join("")}${targetKind === 3 ? '<option value="3" selected>Saved key set</option>' : ""}</select></label>`);
    area.querySelector("select")?.addEventListener("change", e => send({target: Number(/** @type {HTMLSelectElement} */ (e.target).value)}));
    node.querySelector(".painter-options")?.append(area);
    node.querySelector("[data-close]")?.addEventListener("click", closePainter);
    for (const button of node.querySelectorAll("[data-tool]")) button.addEventListener("click", () => {tool = /** @type {HTMLElement} */ (button).dataset.tool ?? "brush";render();});
    node.querySelector("[data-fill]")?.addEventListener("click", () => send({leds: selection.length ? selection : Array.from({length: 58}, (_, i) => i), paint: brush}));
    node.querySelector("[data-clear-selection]")?.addEventListener("click", () => {selection = selection.length === 58 ? [] : Array.from({length: 58}, (_, i) => i);render();});
    node.querySelector("[data-query]")?.addEventListener("change", e => {query = /** @type {HTMLSelectElement} */ (e.target).value;});
    node.querySelector("[data-select-query]")?.addEventListener("click", () => {selection = selectPaintKeys(layer, query, model);tool = "select";render();});
    node.querySelector("[data-copy-layer]")?.addEventListener("change", e => {copyLayer = Number(/** @type {HTMLSelectElement} */ (e.target).value);});
    node.querySelector("[data-copy]")?.addEventListener("click", () => send({cells: copyLayerCells(model, copyLayer)}));
    for (const button of node.querySelectorAll("[data-mirror]")) button.addEventListener("click", () => send({cells: mirrorMap(cells, /** @type {'left' | 'right'} */ (/** @type {HTMLElement} */ (button).dataset.mirror))}));
    const paints = node.querySelector("[data-paints]");
    for (const [kind, name] of [[0, "Clear"], [1, "Off"], [3, "Identity"], [8, "Outcome"]]) if (lighting.supportedPaints.includes(Number(kind)) && (kind !== 8 || ctx.subject?.kind === 4 || rule && lighting.program.rules[rule.index]?.parts.some(p => p.slot === 0 && p.kind === 8))) {
        const b = el(`<button class="btn tiny ${brush === 128 + Number(kind) ? "primary" : ""}">${esc(name)}</button>`);b.addEventListener("click", () => {brush = 128 + Number(kind);render();});paints?.append(b);
    }
    if (lighting.supportedPaints.includes(2)) node.querySelector("[data-colour]")?.append(colourEditor({identity: "painter:brush", title: "Colour", offNote: typeof brush === "number" ? "Choose a saved colour, or give the brush a colour." : undefined, colour: typeof brush === "number" ? null : brush, zeroMeansClear: false, maximumBrightness: model.rgb.maximumBrightness, canEdit: editable,
        onChange: colour => {brush = {h: Number(colour.h), s: Number(colour.s), v: Number(colour.v)};render();}}));
    for (const [index, colour] of lighting.program.palette.entries()) {
        const b = el(`<button class="palette-colour" style="background:${css(colour)}" aria-label="Saved colour ${index + 1}" ${lighting.supportedPaints.includes(2) ? "" : "disabled"} data-tip="HSV ${colour.h}, ${colour.s}, ${colour.v}"></button>`);
        b.addEventListener("click", () => {if (lighting.supportedPaints.includes(2)) {brush = {...colour};render();}});node.querySelector("[data-palette]")?.append(b);
    }
    const activate = (/** @type {number} */ led) => {
        if (tool === "select") {selection = selection.includes(led) ? selection.filter(n => n !== led) : [...selection, led];render();}
        else send({leds: [led], paint: brush});
    };
    const picked = selection.map(led => Number(Object.keys(LED_INDEX).find(key => LED_INDEX[Number(key)] === led))).filter(Number.isFinite);
    const picture = board(model, layer, {faces: false, picking: true, onTrackball: () => activate(56), picks: picked, reach: picked, trackball: true});
    for (const glow of picture.querySelectorAll(".kc-glow")) glow.remove();
    const ball = picture.querySelector("[data-trackball]");ball?.classList.remove("glass", "sel");
    const condition = ctx.index === undefined ? undefined : lighting.program.rules[ctx.index]?.parts.find(p => p.slot === 0);
    const subject = ctx.subject ?? (condition ? {kind: condition.kind <= 2 ? 1 : condition.kind === 3 ? 2 : condition.kind === 4 || condition.kind === 7 ? 3 : 4, id: condition.kind === 4 || condition.kind === 5 ? 255 : condition.params[0] === 255 ? layer?.index ?? 0 : condition.params[0]} : null);
    const identity = subject ? identityValue(model, subject).colour : null;
    const situation = el(`<p class="note painter-situation">${esc(rule?.when || (ctx.subject?.kind === 1 ? `${ctx.title} is active` : ctx.subject?.kind === 2 ? `${ctx.title} is active` : ctx.subject?.kind === 3 ? `${ctx.title} is held` : `${ctx.title} shows feedback`))} · showing keys from ${esc(layer?.displayName || layer?.name || "the current layer")}</p>`);
    node.querySelector(".painter-toolbar")?.after(situation);
    for (const group of picture.querySelectorAll("[data-key]")) {
        const led = LED_INDEX[Number(/** @type {HTMLElement} */ (group).dataset.key)], colour = mapPaintColour(model, cells[led], identity);
        group.querySelector(".kc-rect")?.setAttribute("style", colour ? `fill:${css(colour)};stroke:var(--light-outline)` : "fill:var(--surface-2);stroke:var(--line);stroke-dasharray:4 3");
        if (colour) for (const text of group.querySelectorAll("text")) text.setAttribute("style", `fill:${idealText(colour)}`);
    }
    // Commit one host edit per stroke, including every crossed key.
    let drawing = false;const stroke = new Set();
    const hit = (/** @type {number} */ led) => {stroke.add(led);picture.querySelector(`[data-key="${Object.keys(LED_INDEX).find(key => LED_INDEX[Number(key)] === led)}"]`)?.classList.add("sel");};
    for (const group of picture.querySelectorAll("[data-key]")) group.addEventListener("keydown", e => {
        const event = /** @type {KeyboardEvent} */ (e);if (!editable || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();const led = LED_INDEX[Number(group.getAttribute("data-key"))];
        activate(led);
    });
    picture.addEventListener("pointerdown", e => {
        if (e.button !== 0 || !editable) return;
        const key = /** @type {Element} */ (e.target).closest("[data-key]");if (!key) return;
        e.preventDefault();drawing = true;stroke.clear();hit(LED_INDEX[Number(key.getAttribute("data-key"))]);
    });
    picture.addEventListener("pointermove", e => {if (!drawing) return;const key = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-key]");if (key && picture.contains(key)) hit(LED_INDEX[Number(key.getAttribute("data-key"))]);});
    const finish = () => {
        if (!drawing) return;drawing = false;
        window.removeEventListener("pointerup", finish);window.removeEventListener("pointercancel", cancel);
        if (tool === "select") {for (const led of stroke) selection = selection.includes(led) ? selection.filter(n => n !== led) : [...selection, led];render();}
        else send({leds: [...stroke], paint: brush});
    };
    const cancel = () => {drawing = false;window.removeEventListener("pointerup", finish);window.removeEventListener("pointercancel", cancel);render();};
    picture.addEventListener("pointerdown", () => {if (drawing) {window.addEventListener("pointerup", finish);window.addEventListener("pointercancel", cancel);}});
    for (const b of node.querySelectorAll("[data-extra]")) b.addEventListener("click", () => activate(Number(/** @type {HTMLElement} */ (b).dataset.extra)));
    const ballColour = mapPaintColour(model, cells[56], identity);
    ball?.querySelector("circle")?.setAttribute("style", ballColour ? `fill:${css(ballColour)}` : "fill:var(--surface-2);stroke:var(--line-2);stroke-dasharray:4 3");

    for (const text of picture.querySelectorAll(".kc-label, .kc-sub")) if (!text.closest("[data-key]")?.querySelector(".kc-rect")?.getAttribute("style")?.includes("rgb")) text.setAttribute("style", "fill:var(--text)");
    node.querySelector("[data-board]")?.append(picture);
    return node;
}
/** @type {import('../../contracts/lighting.js').LightingSubject | null} */ let pendingSubject = null;
export function followPaintedRule() {
    if (context && context.draftId !== getModel()?.draft?.id) {context = null;pendingSubject = null;}
    if (!pendingSubject || !context) return;
    const fact = pendingSubject.kind === 1 ? 1 : pendingSubject.kind === 2 ? 3 : pendingSubject.kind === 3 ? 7 : 8;
    const rules = getModel()?.rgb?.lighting?.program.rules ?? [];
    const index = rules.findIndex(r => r.parts.some(p => p.slot === 0 && p.kind === fact && p.params[0] === pendingSubject?.id) && r.parts.some(p => p.slot === 3 && p.kind === 4));
    if (index >= 0) {context.index = index;context.key = getModel()?.rgb?.lighting?.rules[index]?.key;pendingSubject = null;}
}
