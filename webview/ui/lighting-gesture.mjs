// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {getModel, render, state} from "../store.mjs";
import {lightingGesture, gestureHistory} from "../view/lighting-gesture.mjs";
import {replayLighting} from "../view/lighting-understanding.mjs";
import {lightingSelect} from "./lighting-fields.mjs";
import {lightingBoard} from "./lighting-board.mjs";
import {loadLightingHistory} from "./lighting-situation.mjs";
/** @type {Map<string, {presses: number; at: number; owner: number; layer: number; path: "hold" | "tap"}>} */ const choices = new Map();
let selectedRow = "";
/** @param {string} [keycode] */
export function lightingGestureCard(keycode) {
    const model = getModel(), lighting = model?.rgb.lighting, node = el('<section class="card lighting-gesture" aria-label="Gesture timeline"><div class="card-h"><h3>Gesture timeline</h3></div><div class="card-b stack gap-12"></div></section>'), body = /** @type {HTMLElement} */ (node.querySelector(".card-b"));
    if (!model || !lighting) return node;
    const rows = model.keyBehaviors;
    if (!keycode) {
        if (!rows.some(r => r.keycode === selectedRow)) selectedRow = rows[0]?.keycode ?? "";
        body.append(lightingSelect("gesture:behaviour", "Behaviour", rows.map((r, i) => [i, model.qmkKeyLabels[r.keycode] || r.keycode]), rows.findIndex(r => r.keycode === selectedRow), rows.length > 0, n => {selectedRow = rows[n].keycode;render();}));keycode = selectedRow;
    }
    if (!keycode) {body.append(el('<p class="note">No configured behaviours. Add one in Keys to illustrate its authored lighting.</p>'));return node;}
    const native = rows.find(r => r.keycode === keycode)?.code ?? model.qmkKeycodes.find(k => k.key === keycode || k.value === keycode)?.keycode;
    const placementLayers = model.layers.filter(l => Object.values(lighting.keymap?.[l.index] ?? {}).some(k => k.code === native)).map(l => l.index);
    const initialLayer = placementLayers.includes(state.layer) ? state.layer : placementLayers[0] ?? state.layer;
    const key = `gesture:${keycode}`, selected = choices.get(key) ?? {presses: 1, at: 0, owner: -1, layer: initialLayer, path: /** @type {const} */ ("hold")};choices.set(key, selected);
    body.append(lightingSelect(`${key}:layer`, "Native source layer", model.layers.map(l => [l.index, l.displayName || l.name]), selected.layer, true, n => {selected.layer = n;selected.owner = -1;selected.at = 0;render();}));
    const code = native ?? model.qmkKeycodes.find(k => k.key === keycode || k.value === keycode)?.keycode;
    const owners = Object.entries(lighting.keymap?.[selected.layer] ?? {}).filter(([, v]) => v.code === code).map(([k]) => Number(k));
    if (!owners.includes(selected.owner)) selected.owner = owners[0] ?? -1;
    body.append(lightingSelect(`${key}:owner`, "Physical origin · matrix key", owners.map(k => [k, `Matrix ${k}`]), selected.owner, owners.length > 0, n => {selected.owner = n;selected.at = 0;render();}));
    body.append(lightingSelect(`${key}:path`, "Gesture path", [[0, "Hold this press"], [1, "Quick tap and settle"]], selected.path === "hold" ? 0 : 1, true, n => {selected.path = n === 0 ? "hold" : "tap";selected.at = 0;render();}));
    const depth = Math.max(1, ...rows.find(r => r.keycode === keycode)?.steps.filter(s => s.tap || s.hold || s.longHold).map(s => s.tapCount + 1) ?? []);
    selected.presses = (selected.presses - 1) % depth + 1;
    body.append(lightingSelect(`${key}:branch`, "Tap-count branch", Array.from({length: depth}, (_, n) => [n + 1, `Branch ${n + 1}`]), selected.presses, true, n => {selected.presses = n;selected.at = 0;render();}));
    const next = el('<button class="btn" data-next-branch>Next tap / branch</button>');next.addEventListener("click", () => {selected.presses = selected.presses % depth + 1;selected.at = 0;render();});body.append(next);
    const timeline = lightingGesture(model, keycode, selected.layer, selected.owner, selected.presses, selected.path);
    body.append(el(`<p class="note">${timeline.notes.map(esc).join(" ")}</p>`));
    if (!timeline.steps.length) return node;
    selected.at = Math.min(selected.at, timeline.steps.length - 1);
    body.append(lightingSelect(`${key}:step`, "Gesture moment", timeline.steps.map((s, n) => [n, `${s.observation.situation.time} ms · ${s.label}`]), selected.at, true, n => {selected.at = n;render();}));
    const step = timeline.steps[selected.at], history = gestureHistory(timeline.steps.slice(0, selected.at + 1), timeline.flash);
    body.append(el(`<div><p class="note" data-gesture-moment>${esc(step.label)} · ${step.observation.situation.time} ms. ${esc(step.detail)}</p><p class="note">${timeline.terms ? `Hold ${timeline.terms.hold} ms · Long hold ${timeline.terms.long} ms · Multi-tap ${timeline.terms.multi} ms. Thresholds start again at the current press.` : ""}</p></div>`));
    try {body.append(lightingBoard(replayLighting(lighting.program, history, model.behaviorEditing.maxTapStepsPerBehavior).frame, "gesture"));}
    catch (e) {body.append(el(`<p class="callout">Preview incomplete: ${esc(/** @type {Error} */ (e).message)}</p>`));}
    const inspect = el('<button class="btn" data-inspect-gesture>Inspect this moment</button>');inspect.addEventListener("click", () => {loadLightingHistory(history);state.screen = "lighting";render();requestAnimationFrame(() => document.querySelector(".lighting-inspector")?.scrollIntoView({block: "start"}));});body.append(inspect);
    return node;
}
