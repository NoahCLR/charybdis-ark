// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {render} from "../store.mjs";
import {KEY_LEDS, frameText} from "../view/lighting-simulator.mjs";
import {replayLighting} from "../view/lighting-understanding.mjs";
import {lightingOwnerLabel} from "../view/lighting-rules.mjs";
import {lightingSelect} from "./lighting-fields.mjs";
let selectedLed = 0, selectedKey = 255, clearRule = -1;
/** @param {number} led */
export function inspectLightingLed(led) {selectedLed = led;selectedKey = 255;render();}
/** @param {import('../../contracts/panel.js').PublishedModel} model @param {import('../view/lighting-simulator-types.js').Observation[]} history @param {(index: number) => void} edit */
export function lightingInspector(model, history, edit) {
    const lighting = model.rgb.lighting, node = el('<section class="card lighting-inspector" aria-label="Lighting Inspector"><div class="card-h"><h3>Inspector</h3></div><div class="card-b stack gap-12"></div></section>'), body = /** @type {HTMLElement} */ (node.querySelector(".card-b"));
    if (!lighting) return node;
    body.append(lightingSelect("inspector:led", "Fixed LED", Array.from({length: 58}, (_, n) => [n, `LED ${n}${n === 56 ? " · trackball" : n === 57 ? " · extra" : ""}`]), selectedLed, true, n => {selectedLed = n;selectedKey = 255;render();}));
    const shownLayer = Math.max(0, ...history.at(-1)?.situation.layers ?? []);
    /** @param {number} matrix */
    const keyLabel = matrix => {const p = model.layers[shownLayer]?.positions.find(p => p.row !== undefined && p.column !== undefined && p.row * 6 + p.column === matrix);return p ? model.qmkKeyLabels[p.semantic ?? p.keycode] || p.display || p.keycode : "";};
    body.append(lightingSelect("inspector:key", "Associated matrix key", [[255, "Choose a key"], ...Array.from({length: 60}, (_, n) => /** @type {[number, string]} */ ([n, `${lightingOwnerLabel(n)}${keyLabel(n) ? ` · ${keyLabel(n)}` : ""}`]))], selectedKey, true, n => {selectedKey = n;if (KEY_LEDS[n] !== undefined) selectedLed = /** @type {number} */ (KEY_LEDS[n]);render();}));
    if (selectedKey !== 255 && KEY_LEDS[selectedKey] === undefined) {body.append(el(`<p class="callout">${esc(lightingOwnerLabel(selectedKey))}. No LED result can be attributed to this key. Choose a fixed LED to inspect its stored paint.</p>`));return node;}
    const situation = history.at(-1)?.situation;
    if (!situation) {body.append(el('<p class="note">Show a situation first.</p>'));return node;}
    try {
        const {simulator} = replayLighting(lighting.program, history, model.behaviorEditing.maxTapStepsPerBehavior), explanation = simulator.explain(situation, selectedLed);
        const colours = frameText(explanation.frame);
        body.append(el(`<p class="note">LED ${selectedLed}: ${esc(colours[selectedLed] === "-" ? "base effect shows" : `#${colours[selectedLed]}`)} · ${situation.time ?? 0} ms · local simulation. Off paints black; clear lets lower rules show. Dim, tint and fade can combine several contributions.</p>`));
        if (clearRule >= lighting.rules.length) clearRule = -1;
        body.append(lightingSelect("inspector:clear-rule", "What if an entire rule were clear?", [[-1, "Keep every rule"], ...lighting.rules.map(r => /** @type {[number, string]} */ ([r.index, `Rule ${r.index + 1} · ${r.when}`]))], clearRule, true, n => {clearRule = n;render();}));
        if (clearRule >= 0) {
            const alternative = replayLighting(lighting.program, history, model.behaviorEditing.maxTapStepsPerBehavior, clearRule), text = frameText(alternative.frame)[selectedLed];
            body.append(el(`<p class="callout" data-counterfactual>With all of rule ${clearRule + 1} clear, including its background: ${esc(text === "-" ? "base effect shows" : `#${text}`)}. Replayed the same situation and event history. The draft is unchanged.</p>`));
        }
        for (const row of explanation.rules) {
            const stored = lighting.rules[row.index], line = el(`<div class="inspector-rule" data-inspector-rule="${row.index}"><div class="row"><strong>Rule ${row.index + 1} · ${esc(row.status)}</strong><button class="btn tiny ghost right">Open rule</button></div><p class="note">${esc(stored?.when)} · ${esc(stored?.where)} · ${esc(row.subject)}</p>${row.visits.map(v => `<p class="note">${esc(model.vocabulary.lighting.things[v.subject.kind] || "Board")} ${v.subject.thing === 255 ? "" : v.subject.thing} · ${esc(v.source)}${v.readsBelow ? " reads light below" : ""}${v.scene ? ` · ${esc(v.scene)}` : ""}${v.weight !== undefined && v.weight !== 255 ? ` · ${Math.round(v.weight / 255 * 100)}% of blend` : ""} · ${v.colour ? `RGB ${esc(v.colour.join(", "))}` : "clear"}${v.subject.keys.length ? ` · owners matrix ${esc(v.subject.keys.join(", "))}` : ""}</p>`).join("")}</div>`);
            line.querySelector("button")?.addEventListener("click", () => edit(row.index));body.append(line);
        }
    } catch (e) {body.append(el(`<p class="callout">Explanation incomplete and read-only: ${esc(/** @type {Error} */ (e).message)} Unknown lighting is preserved; it is not assumed clear.</p>`));}
    return node;
}
