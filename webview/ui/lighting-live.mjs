// @ts-check
import {el, esc} from "../lib/dom.mjs";
import {getModel, post, state} from "../store.mjs";
import {lightingControl, lightingSurface, tryLightingFrame} from "../view/controls.mjs";
import {liveConditions, sampledSituation} from "../view/lighting-live.mjs";
import {factSubjects} from "../view/lighting-facts.mjs";
import {lightingParameterChoices} from "../view/lighting-rules.mjs";
import {LightingSimulator} from "../view/lighting-simulator.mjs";
import {painterOpen} from "./lighting-painter.mjs";
import {lightingSelect} from "./lighting-fields.mjs";
import {render} from "../store.mjs";
let present = false, selectedLed = 0, conditionsOpen = false;
export function reconcileLightingSurface() {
    const visible = state.screen === "lighting" && !painterOpen() && !state.overlay && !state.picker && document.visibilityState === "visible" && document.hasFocus() && Boolean(getModel()?.lightingLive?.support.available);
    if (visible !== present) {present = visible;post(lightingSurface(visible));}
}
for (const name of ["visibilitychange", "focus", "blur", "pagehide"]) (name === "visibilitychange" ? document : window).addEventListener(name, () => {
    if (name === "pagehide") {if (present) {present = false;post(lightingSurface(false));}} else reconcileLightingSurface();
});
/** @param {{reason: string; bytes: number[] | null}} local */
export function lightingLiveCard(local) {
    const model = getModel(), view = model?.lightingLive, cap = view?.support.capability;
    const preview = view?.preview, enabled = Boolean(view?.support.available), trying = preview && ["uploading", "live", "stopping"].includes(preview.state);
    const node = el(`<section class="card lighting-live" aria-label="Live lighting"><div class="card-h"><h3>On the keyboard</h3><span class="right note">${esc(view?.state || "unavailable")}</span></div><div class="card-b stack gap-12"><div class="row"><button class="btn" data-live-start ${enabled && cap?.facts ? "" : "disabled"}>${view?.active ? "Pause Live" : "Start Live"}</button><span class="note">Read current facts</span></div><p class="note" data-live-state>${esc(enabled ? view?.reason : model?.demo.active ? "The demo has no keyboard. Live and temporary frames need a connected keyboard with support." : view?.support.reason || "This firmware does not offer Live lighting.")}</p><div class="live-sample"></div><div class="row"><button class="btn" data-try-frame ${enabled && cap?.frame && cap.ledCount === 58 && cap.leftCount === 29 && local.bytes && !trying ? "" : "disabled"}>Try on keyboard</button><button class="btn" data-stop-frame ${trying ? "" : "disabled"}>Stop</button></div><p class="note" data-preview-state>${esc(preview?.reason || "Temporary light is never saved.")}</p><p class="note">Try sends the shown local situation as a complete temporary look. It does not save or Apply anything. Leaving Lighting or hiding this window stops it. Screen colours may differ from the LEDs. Changing the local situation does not update this temporary look; Stop, then Try again.</p>${local.reason ? `<p class="note" data-frame-unavailable>${esc(local.reason)}</p>` : ""}</div></section>`);
    node.querySelector("[data-live-start]")?.addEventListener("click", () => post(lightingControl(getModel()?.lightingLive?.active ? "pauseLightingLive" : "startLightingLive")));
    node.querySelector("[data-try-frame]")?.addEventListener("click", () => {if (local.bytes) post(tryLightingFrame(local.bytes));});
    node.querySelector("[data-stop-frame]")?.addEventListener("click", () => post(lightingControl("stopLightingFrame")));
    if (preview?.status) {
        const flags = preview.status.flags;
        node.querySelector("[data-preview-state]")?.append(document.createTextNode(flags & 2 ? " Diagnostics currently suppress this look." : flags & 4 ? " Keyboard lighting is disabled or set to None; Try does not enable it." : flags & 16 ? " The keyboard's sleep timeout currently suppresses this look." : ""));
    }
    if (model && view?.sample) {
        const sample = view.sample, holder = /** @type {HTMLElement} */ (node.querySelector(".live-sample"));
        const changed = Boolean(model.draft?.dirty), current = view.active && view.state === "current";
        holder.append(el(`<div class="stack gap-8"><p class="note">${current ? "Sample" : "Stale sample"} ${sample.id} · USB half main sample · read began ${view.ageMs ?? 0} ms ago · captured at keyboard time ${sample.captured} ms · lighting generation ${sample.generation}</p><p class="note">${changed ? "Your draft differs from the active profile. Conditions below evaluate your draft against sampled facts; they do not describe the keyboard's saved rules." : "Sample matched the active profile read by Ark at capture."} ${trying ? "A temporary frame overrides ordinary output; rule matches do not explain that frame." : ""}</p><p class="note">Current facts are samples, not an event history, retained flash or linger trace, or a physical LED reading. Unseen transitions and timed output remain indeterminate.</p></div>`));
        try {
            const situation = sampledSituation(model, sample), lighting = model.rgb.lighting;
            if (lighting) {
                const candidates = lighting.program.rules.flatMap(r => r.parts.filter(p => p.slot < 2));
                for (const [kind, values] of /** @type {[number, number[]][]} */ ([[1, situation.layers ?? []], [14, situation.pressedKeys ?? []]])) for (const value of values) candidates.push({slot: 0, kind, params: [value]});
                if (situation.macroPlaying !== undefined) candidates.push({slot: 0, kind: 13, params: [situation.macroPlaying]});
                const chips = new Map();
                for (const part of candidates) {
                    if (!sample.slices[part.kind] || !factSubjects(part.kind, part.params, situation, model.behaviorEditing.maxTapStepsPerBehavior).length) continue;
                    const descriptor = lighting.descriptors.facts[part.kind], params = part.params.map((v, i) => lightingParameterChoices(model, descriptor?.parameters[i] ?? "", descriptor?.thing)[0] && lightingParameterChoices(model, descriptor?.parameters[i] ?? "", descriptor?.thing).find(([n]) => n === v)?.[1] || String(v));
                    chips.set(`${part.kind}:${part.params}`, `${model.vocabulary.lighting.facts[part.kind]}${params.length ? ` · ${params.join(" · ")}` : ""}`);
                }
                holder.append(el(`<div class="stack gap-8"><div class="row live-fact-chips">${[...chips.values()].slice(0, 64).map(text => `<span class="tag">${esc(text)}</span>`).join("") || '<span class="note">No listed condition currently matches.</span>'}</div><details class="live-conditions" ${conditionsOpen ? "open" : ""}><summary>Sampled rule conditions</summary>${liveConditions(model, sample).map(row => `<p class="note" data-live-rule="${row.index}">Rule ${row.index + 1} · ${esc(row.state)} · ${esc(lighting.rules[row.index]?.when)}</p>`).join("")}</details></div>`));
                const knownUntimed = !changed && !lighting.unknownRules && lighting.program.extensions.length === 0 && lighting.program.rules.every(r => r.known !== false && !r.parts.some(p => p.slot === 5 || p.slot < 2 && !sample.slices[p.kind]));
                if (knownUntimed && current && !trying) {
                    holder.append(lightingSelect("live:inspector:led", "Inspect current conditions at LED", Array.from({length: 58}, (_, n) => [n, `LED ${n}`]), selectedLed, true, n => {selectedLed = n;render();}));
                    const simulator = new LightingSimulator(lighting.program, model.behaviorEditing.maxTapStepsPerBehavior);simulator.render(situation);
                    const explanation = simulator.explain(situation, selectedLed);
                    holder.append(el(`<p class="note" data-live-explanation>Rule evaluation of this current sample at LED ${selectedLed}: ${explanation.rules.map(r => `Rule ${r.index + 1} ${r.status}`).map(esc).join("; ")}. This evaluates conditions with the local Inspector walk; it does not measure the LED.</p>`));
                } else holder.append(el('<p class="note" data-live-indeterminate>LED contribution is indeterminate: timing, missing facts, a changed draft, stale data or temporary output prevents an evidence-backed colour explanation.</p>'));
            }
        } catch (e) {holder.append(el(`<p class="callout">Sample explanation unavailable: ${esc(/** @type {Error} */ (e).message)}</p>`));}
    }
    const details = node.querySelector(".live-conditions");
    details?.addEventListener("toggle", () => {if (details.isConnected) conditionsOpen = /** @type {HTMLDetailsElement} */ (details).open;});
    return node;
}

/** Update volatile status through the same card renderer, retaining the three
 * action nodes so a sample arriving between pointer-down and click cannot
 * detach the control. Local editors/timeline are kept by the normal render path.
 * @param {Element} scope @param {{reason: string; bytes: number[] | null}} local */
export function refreshLightingLiveCard(scope, local) {
    const previous = scope.querySelector(".lighting-live");if (!previous) return;
    const next = lightingLiveCard(local);
    for (const selector of ["[data-live-start]", "[data-try-frame]", "[data-stop-frame]"]) {
        const before = /** @type {HTMLButtonElement} */ (previous.querySelector(selector)), after = /** @type {HTMLButtonElement} */ (next.querySelector(selector));
        before.textContent = after.textContent;before.disabled = after.disabled;after.replaceWith(before);
    }
    previous.replaceWith(next);
}
