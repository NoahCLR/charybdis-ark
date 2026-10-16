// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {getModel, render} from "../store.mjs";
import {vocabulary} from "../view/vocabulary.mjs";
import {defaultLightingParams, lightingSituation, lightingOwnerLabel} from "../view/lighting-rules.mjs";
import {lightingBoard} from "./lighting-board.mjs";
import {lightingInspector, inspectLightingLed} from "./lighting-inspector.mjs";
import {replayLighting} from "../view/lighting-understanding.mjs";
import {completeLocalFrame} from "../view/lighting-live.mjs";
import {LightingSimulator} from "../view/lighting-simulator.mjs";
import {lightingSelect, lightingParams} from "./lighting-fields.mjs";

/** @type {{id: number; kind: number; params: number[]; keys: number[]}[]} */ let chips = [];
let nextChip = 1, time = 0, advance = 100, eventFact = 19, eventThing = 0, eventBranch = 1, eventOwners = "0";
/** @type {LightingSimulator | null} */ let simulator = null;
/** @type {import("../view/lighting-simulator-types.js").Situation | null} */ let externalSituation = null;
let signature = "", error = "", controlsOpen = false;
/** @type {(number[] | null)[]} */ let frame = Array(58).fill(null);
/** @param {string} text */
const keysFrom = text => text.trim() ? text.split(",").map(v => Number(v.trim())).filter(k => Number.isInteger(k) && k >= 0 && k < 60) : [];
/** @param {string} identity @param {string} title @param {number[]} owners @param {(keys: number[]) => void} change */
function ownerFields(identity, title, owners, change) {
    const node = el(`<div class="stack gap-8"><label class="field"><span>${esc(title)} · matrix 0–59, separated by commas</span><input class="input" value="${esc(owners.join(","))}" data-f="${esc(identity)}"></label><p class="note" data-owner-associations>${esc(owners.map(lightingOwnerLabel).join("; ") || "No matrix owners selected.")}</p></div>`);
    node.querySelector("input")?.addEventListener("change", e => {change(keysFrom(/** @type {HTMLInputElement} */ (e.target).value));render();});
    node.append(lightingSelect(`${identity}:choose`, "Choose one matrix owner · replaces the list", [[255, "Choose a matrix key"], ...Array.from({length: 60}, (_, n) => /** @type {[number, string]} */ ([n, lightingOwnerLabel(n)]))], owners.length === 1 ? owners[0] : 255, true, n => {if (n !== 255) {change([n]);render();}}));
    return node;
}
/** @param {import('../../contracts/panel.js').PublishedModel} model */
const situationSignature = model => JSON.stringify([model.draft?.id, model.rgb.lighting?.program, model.rgb.lighting?.keymap, model.rgb.lighting?.queryCombos, model.rgb.baseEffect.previewColor]);
/** @type {import('../view/lighting-simulator-types.js').Observation[]} */ let history = [];
/** @param {import('../view/lighting-simulator-types.js').Observation[]} observations */
export function loadLightingHistory(observations) {
    const model = getModel(), lighting = model?.rgb.lighting;if (!model || !lighting) return;
    signature = situationSignature(model);history = structuredClone(observations);externalSituation = structuredClone(history.at(-1)?.situation ?? null);
    try {const result = replayLighting(lighting.program, history, model.behaviorEditing.maxTapStepsPerBehavior);simulator = result.simulator;frame = result.frame;time = history.at(-1)?.situation.time ?? 0;error = "";} catch (e) {error = /** @type {Error} */ (e).message;}
}
/** @param {(index: number) => void} edit */
export function lightingSituationCard(edit) {
    const model = getModel(), lighting = model?.rgb.lighting;
    if (!model || !lighting) return el('<div></div>');
    const words = vocabulary(model).lighting, currentSignature = situationSignature(model);
    if (currentSignature !== signature) {signature = currentSignature;simulator = new LightingSimulator(lighting.program, model.behaviorEditing.maxTapStepsPerBehavior);time = 0;externalSituation = null;history = [{situation: {...lightingSituation(model, chips), time}}];try {frame = simulator.render(history[0].situation);error = "";} catch (e) {frame = Array(58).fill(null);error = /** @type {Error} */ (e).message;}}
    const draw = (/** @type {import('../view/lighting-simulator-types.js').Event | null} */ event = null) => {
        try {const situation = {...(externalSituation ?? lightingSituation(model, chips)), time};history.push({situation: structuredClone(situation), event});const result = replayLighting(lighting.program, history, model.behaviorEditing.maxTapStepsPerBehavior);simulator = result.simulator;frame = result.frame;error = "";} catch (e) {error = /** @type {Error} */ (e).message;}
        render();
    };
    const node = el(`<section class="card lighting-situation" aria-label="Lighting situation"><div class="card-h"><h3>Try a situation</h3><span class="right note">${time} ms · simulated</span></div><div class="card-b stack gap-12"><p class="note">Choose states, show the situation, then step time or fire an event. This stays on screen and does not change the draft or send light to the keyboard.</p><div class="lighting-chips"></div></div></section>`), body = /** @type {HTMLElement} */ (node.querySelector(".card-b")), holder = /** @type {HTMLElement} */ (node.querySelector(".lighting-chips"));
    chips.forEach(chip => {
        const part = {slot: 0, kind: chip.kind, params: chip.params};
        const row = el(`<div class="lighting-condition stack gap-8"><div class="row"><span class="tag">${esc(words.facts[chip.kind])}</span><button class="btn tiny ghost right" data-remove>Remove state</button></div></div>`);
        row.append(lightingParams(model, `situation:${chip.id}:parameter`, "facts", part, true, params => {chip.params = params;render();}, true));
        if ([3, 4, 5, 7, 8, 9, 10, 11, 12].includes(chip.kind)) {
            row.append(ownerFields(`situation:${chip.id}:owners`, "Simulated owners", chip.keys, keys => {chip.keys = keys;}));
        }
        row.querySelector("[data-remove]")?.addEventListener("click", () => {chips = chips.filter(c => c.id !== chip.id);render();});holder.append(row);
    });
    const stateKinds = lighting.supportedFacts.filter(id => lighting.descriptors.facts[id]?.construction === "state");
    let addKind = stateKinds[0] ?? 1;
    body.append(lightingSelect("situation:add-kind", "Add a state", stateKinds.map(id => [id, words.facts[id]]), addKind, stateKinds.length > 0, n => {addKind = n;}));
    const add = el('<button class="btn" data-add-state>Add state</button>');
    add.addEventListener("click", () => {chips.push({id: nextChip++, kind: addKind, params: defaultLightingParams(model, "facts", addKind).map((v, i) => v === 255 ? lighting.descriptors.facts[addKind].parameters[i] === "tapSelector" ? 1 : 0 : v), keys: [0]});render();});body.append(add);
    const actions = el(`<div class="row"><button class="btn primary" data-show-situation>Show situation</button><button class="btn" data-reset>Restart time</button></div>`);
    actions.querySelector("[data-show-situation]")?.addEventListener("click", () => {externalSituation = null;draw();});
    actions.querySelector("[data-reset]")?.addEventListener("click", () => {simulator = new LightingSimulator(lighting.program, model.behaviorEditing.maxTapStepsPerBehavior);time = 0;history = [];draw();});body.append(actions);
    const step = el(`<div class="row"><label class="field"><span>Step time · ms</span><input class="input" type="number" min="0" max="65535" value="${advance}" data-f="situation:advance"></label><button class="btn" data-advance>Advance time</button></div>`);
    step.querySelector("input")?.addEventListener("change", e => {advance = Math.max(0, Math.min(65535, Number(/** @type {HTMLInputElement} */ (e.target).value) || 0));});step.querySelector("[data-advance]")?.addEventListener("click", () => {time += advance;draw();});body.append(step);
    const events = lighting.supportedFacts.filter(id => lighting.descriptors.facts[id]?.construction === "event");
    if (events.length) {
        if (!events.includes(eventFact)) eventFact = events[0];
        body.append(lightingSelect("situation:event:kind", "Event", events.map(id => [id, words.facts[id]]), eventFact, true, n => {eventFact = n;eventThing = 0;render();}));
        const trigger = {slot: 0, kind: eventFact, params: eventFact === 25 ? [eventThing, eventBranch] : [eventThing]};
        body.append(lightingParams(model, "situation:event:parameter", "facts", trigger, true, p => {eventThing = p[0];eventBranch = p[1] ?? 1;}, true));
        body.append(ownerFields("situation:event:owners", "Event owners", keysFrom(eventOwners), keys => {eventOwners = keys.join(",");}));
        const fire = el('<button class="btn" data-fire-event>Fire event</button>');
        fire.addEventListener("click", () => {if (eventThing === 255 || eventBranch === 255) {error = "Choose one thing and branch for this occurrence.";render();return;}draw({kind: eventFact - 19, thing: eventThing, branch: eventBranch, owners: keysFrom(eventOwners), slot: eventFact === 27 ? 1 : 0});});body.append(fire);
    }
    const controls = el(`<details class="situation-controls" ${controlsOpen ? "open" : ""}><summary>Choose states, events and timing</summary><div class="stack gap-12"></div></details>`);
    controls.addEventListener("toggle", () => {if (controls.isConnected) controlsOpen = /** @type {HTMLDetailsElement} */ (controls).open;});
    const fields = controls.querySelector("div");
    for (const child of [...body.children]) fields?.append(child);
    body.append(controls);
    if (!error) body.append(lightingBoard(frame, "sim", inspectLightingLed));
    else body.append(el(`<p class="callout">No complete board result: ${esc(error)}. Unknown lighting is not treated as clear.</p>`));
    body.append(el(`<p class="note">${model.rgb.baseEffect.previewColor ? "The known solid base colour is supplied beneath dim and tint; clear cells are marked as base-effect space." : "No base-effect colour sample is available. Black is the illustrative input beneath dim and tint; an animated or unread effect makes that part of the look incomplete."}</p>`));
    body.append(lightingInspector(model, history, edit));
    body.append(el(`<div><p class="note">Numbers name fixed LEDs; a dash in the result means the base effect shows. The pinned firmware associates LED 55 with matrix key 56, and has no LED association for matrix key 59. Painting fixed LED 55 is still available in the painter.</p><p class="note">This is a local timeline. Each half renders locally; uncertain split freshness may shorten or hide a flash or linger, and never starts a fresh window. The firmware's timer model is not a hardware drift measurement. Idle matches the sleep condition; the keyboard's global sleep can still force black.</p>${error ? `<p class="callout">${esc(error)}</p>` : ""}</div>`));
    return node;
}

export function shownLightingFrame() {return error ? {reason: `No complete local look: ${error}`, bytes: null} : completeLocalFrame(frame, getModel());}
