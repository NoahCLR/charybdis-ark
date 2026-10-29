// @ts-check
// The Key tab: the selected position on this layer, the same position across
// the stack, what the key reaches, and its participation.

import {DISCLOSURE, el, esc} from "../../lib/dom.mjs";
import {keyLed} from "../../view/lighting.mjs";
import {sentence, slotNamed, vocabulary, layerCalled} from "../../view/vocabulary.mjs";
import {keyFace, keyMeaning, keyName, visibleKeycode} from "../../view/keyface.mjs";
import {keyIdentity} from "../../view/key-identity.mjs";
import {keyReachAt} from "../../view/key-reach.mjs";
import {currentLayer, currentView, getModel, layers, openComboBuilder, positionAt, post, render, selectedPosition, showLayer, state} from "../../store.mjs";
import {editGate} from "../../view/edit-gate.mjs";
import {participationAt, thisKeyOnThisLayer} from "../../view/participation.mjs";
import * as edits from "../../view/edits.mjs";
import {canHaveBehaviour} from "../../view/behavior-editor.mjs";
import {keyProblem} from "../../view/keycode-expression.mjs";
import {actionMarked, comboBadge, comboOutputMarked, keyNameMarked, layerIconOff, mark, marked} from "../marks.mjs";
import {customKeyBypassText, customKeyOf} from "../../view/custom-key.mjs";
import {behaviourKey, selectBehaviourKey} from "./behaviour-selection.mjs";
import {pickKeycodeFor} from "./key-edits.mjs";

/** @param {HTMLElement} body */
export function tabKey(body) {
    const model = getModel();
    const gate = editGate(model, "keys");
    const view = currentView();
    const layer = currentLayer();
    const position = selectedPosition();
    const followed = behaviourKey(position?.layoutIndex);
    const behaviourOpen = canHaveBehaviour(model, followed.keycode);
    // What reaches this key (view/key-reach.mjs). The combos and pointing
    // mode listed are the layer's own key's, with nothing held; the behaviour
    // follows the key the keyboard answers with here, judged on the layer
    // that supplies it (firmware's participation policy).
    const reach = position ? keyReachAt(view, position.layoutIndex) : null;
    const answer = reach?.answer;
    const {behaviour, use: behaviourUse} = reach?.pressed ?? {behaviour: undefined, use: {runs: false, reasons: []}};
    const combos = reach?.own.combos ?? [];
    const slot = reach?.own.pointing?.slot;
    /** @param {string[]} reasons */
    const notUsed = (reasons) => ` · <span class="dim">not used: ${esc(reasons.join("; "))}</span>`;

    const node = el(`<div class="tab-grid three">
        <section>
            <div class="sect-h"><h4>${esc(sentence(thisKeyOnThisLayer(model, layerCalled(layer))))}</h4></div>
            <div class="field"><span>Keycode</span>
                <div class="input-row"><input class="input mono" id="keycodeField" data-f="key:${esc(layer.index)}:${esc(position?.layoutIndex)}:keycode" value="${esc(keyMeaning(position))}" ${gate.editable ? "" : "disabled"}>
                <button class="btn" data-act="pick" ${gate.editable ? "" : "disabled"}>Pick…</button></div></div>
            <div class="key-details">
                <dl class="kv"><dt>Does</dt><dd>${position ? keyNameMarked(model, keyName(position, model), keyMeaning(position)) : "—"}</dd></dl>
                <details class="key-more" ${state.keyDetailsOpen ? "open" : ""}><summary class="note">${DISCLOSURE}Where it is stored</summary>
                <dl class="kv">
                    <dt>Stored as</dt><dd>${esc(position ? visibleKeycode(model, position.keycode) : "—")}</dd>
                    <dt>Matrix</dt><dd>row ${esc(position?.row ?? "—")} · col ${esc(position?.column ?? "—")}</dd>
                    <dt>Layout index</dt><dd>${esc(position?.layoutIndex ?? "—")}</dd>
                    <dt>LED index</dt><dd>${esc(keyLed(model, position?.layoutIndex) ?? "—")}</dd>
                </dl></details>
            </div>
            ${answeredBelow(view, position)}
            ${gate.editable || !gate.why ? "" : `<div class="unavailable key-unavailable">${esc(gate.why)}</div>`}
        </section>
        <section>
            <div class="sect-h"><h4>This key on every layer</h4></div>
            <div class="stacklist">${stackRows(model, layer, position)}</div>
            <p class="note stack-note">The highest layer you hold wins. A transparent key takes what the next layer down that you hold does; ${esc(layerCalled(layers()[0]))} is always on.</p>
        </section>
        <section>
            <div class="sect-h"><h4>What this key reaches</h4></div>
            <div class="stack key-reaches">
                <button class="reach ${behaviour ? "" : "empty"}" data-goto="behaviours" ${behaviourOpen ? "" : "disabled"}>
                    <span class="rl">Behaviour</span>
                    <span class="rv">${behaviour ? `${actionMarked(model, behaviour.keycode)} · ${behaviour.steps.length} branch${behaviour.steps.length === 1 ? "" : "es"}` : behaviourOpen ? "Using the key’s defaults" : "Unavailable for transparent keys and KC_NO"}${behaviourOpen && followed.from ? ` · from ${esc(layerCalled(followed.from))}` : ""}${behaviour && !behaviourUse.runs ? notUsed(behaviourUse.reasons) : ""}</span>
                    <span class="ra">${behaviour ? "Edit" : "Open"}</span></button>
                <button class="reach ${combos.length ? "" : "empty"}" data-goto="combos">
                    <span class="rl">Combos</span>
                    <span class="rv">${combos.length ? combos.map(({combo, use}) => `${comboBadge(model, combo.badge)} → ${comboOutputMarked(model, combo)}${use.fires ? "" : notUsed(use.reasons)}`).join(" · ") : "not part of a combo"}</span>
                    <span class="ra">${combos.length ? "Edit" : "New"}</span></button>
                ${slot ? `<button class="reach" data-goto="pointing"><span class="rl">Pointing</span>
                    <span class="rv">${marked(model, {kind: "pointing", slot: slot.id}, slotNamed(slot))}</span><span class="ra">Edit</span></button>` : ""}
            </div>
        </section>
    </div>`);
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="pick"]'))?.addEventListener("click", () => pickKeycodeFor(position.layoutIndex));
    /** @type {HTMLInputElement | null} */ (node.querySelector("#keycodeField"))?.addEventListener("change", (event) => {
        const field = /** @type {HTMLInputElement} */ (event.target);
        const written = field.value.trim();
        const note = /** @type {HTMLElement | null} */ (node.querySelector(".keycode-problem"));
        if (!written || written === keyMeaning(position)) { note?.remove(); field.removeAttribute("aria-invalid"); return; }
        // A key the draft would refuse stays in the field with the reason
        // under it, and posts nothing; the rail is not where you are typing.
        const problem = keyProblem(getModel(), written);
        if (problem) {
            field.setAttribute("aria-invalid", "true");
            if (note) note.textContent = problem;
            else field.closest(".field")?.append(el(`<p class="note keycode-problem" role="status">${esc(problem)}</p>`));
            return;
        }
        note?.remove(); field.removeAttribute("aria-invalid");
        post(edits.setKey(layer.name, position.layoutIndex, written));
    });
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-golayer]")).forEach((button) => button.addEventListener("click", () => {
        showLayer(Number(button.dataset.golayer));
        render();
    }));
    /** @type {HTMLElement | null} */ (node.querySelector("[data-stack-open]"))?.addEventListener("click", () => { state.stackOpen = !state.stackOpen; render(); });
    /** @type {HTMLDetailsElement | null} */ (node.querySelector(".key-more"))?.addEventListener("toggle", (event) => {
        state.keyDetailsOpen = /** @type {HTMLDetailsElement} */ (event.target).open;
    });
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-goto]")).forEach((button) => button.addEventListener("click", () => {
        state.tab = button.dataset.goto || "key";
        if (state.tab === "behaviours") selectBehaviourKey(followed.keycode);
        if (state.tab === "combos" && !combos.length) openComboBuilder(null, edits.comboDefaultWindowValue(getModel()));
        render();
    }));
    if (answer && model?.participation) {
        const source = answer.layer, key = answer.position;
        const bp = /** @type {NonNullable<ReturnType<typeof participationAt>>} */ (participationAt(model, source.index, key, behaviour));
        const cp = /** @type {NonNullable<ReturnType<typeof participationAt>>} */ (participationAt(model, source.index, key, undefined, "combo"));
        const inherited = source.index !== layer.index;
        // These switches are one key's on one layer; say so, and where the
        // wider ones are, or they read as the layer's.
        const controls = el(`<div class="stack key-participation">
            <div class="sect-h"><h4>Behaviour and combos for ${esc(inherited ? `${vocabulary(model).participationPlaces.keyOn} ${layerCalled(source)}` : thisKeyOnThisLayer(model, layerCalled(source)))}</h4></div>
            ${inherited ? `<p class="note">This key is transparent on this layer (${esc(layerCalled(layer))}), so its switches on ${esc(layerCalled(source))} decide.</p><button class="btn tiny" data-source-layer>Open this key on ${esc(layerCalled(source))}</button>` : `
            <label class="sw"><input type="checkbox" data-f="key:${esc(source.index)}:${esc(key.layoutIndex)}:behaviour" data-use-behavior ${bp.placementOn ? "checked" : ""} ${gate.editable ? "" : "disabled"}><span class="track"></span><span class="txt">Use behaviour</span></label>
            <label class="sw"><input type="checkbox" data-f="key:${esc(source.index)}:${esc(key.layoutIndex)}:combos" data-join-combos ${cp.placementOn ? "checked" : ""} ${gate.editable ? "" : "disabled"}><span class="track"></span><span class="txt">Join combos</span></label>`}
            ${inherited ? "" : `<p class="note">They switch only ${esc(thisKeyOnThisLayer(model, layerCalled(source)))}. To switch a behaviour or combo off on every key, use its own Use this behaviour or Use this combo; for a whole layer, Settings.</p>`}
            <p class="note">Behaviour: ${esc(bp.reasons.length ? bp.reasons.join("; ") : behaviour ? "runs here" : "this key has none")}. Combos: ${esc(cp.reasons.length ? cp.reasons.join("; ") : "this key can take part; each combo has its own switches too")}.</p>
            ${customKeyBypassText(customKeyOf(model, keyIdentity(model, keyMeaning(key)).canonical)) ? `<p class="note">${esc(customKeyBypassText(customKeyOf(model, keyIdentity(model, keyMeaning(key)).canonical)))}</p>` : ""}
        </div>`);
        /** @type {HTMLElement | null} */ (controls.querySelector("[data-source-layer]"))?.addEventListener("click", () => {showLayer(layers().indexOf(source)); render();});
        /** @type {NodeListOf<HTMLInputElement>} */ (controls.querySelectorAll("input")).forEach(input => input.addEventListener("change", () => post(edits.placementPolicy(source.index, key.layoutIndex,
            /** @type {HTMLInputElement} */ (controls.querySelector("[data-use-behavior]")).checked, /** @type {HTMLInputElement} */ (controls.querySelector("[data-join-combos]")).checked))));
        /** @type {HTMLElement} */ (node.querySelector("section")).appendChild(controls);
    }
    body.replaceChildren(node);
}

// The selected position on every layer, highest first. Three or more
// transparent layers in a row fold into one line, since each only says the
// key falls through; the picked layer always shows, and a click unfolds them.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {import("../../../contracts/panel.js").Layer} layer @param {import("../../../contracts/panel.js").Position | undefined} position */
function stackRows(model, layer, position) {
    const rows = [...layers()].reverse().map((other) => {
        const there = positionAt(other, position?.layoutIndex);
        const face = keyFace(there, model);
        return {other, there, face, through: face.kind === "transparent" && other.index !== layer.index};
    });
    /** @param {typeof rows[number]} entry */
    const row = ({other, there, face, through}) => {
        return `<button class="stackrow ${other.index === layer.index ? "on" : ""}${through ? " through" : ""}" data-golayer="${layers().indexOf(other)}">
            <span class="mk-slot">${mark(model, {kind: "layer", layer: other.index})}</span>
            <span class="nm">${esc(layerCalled(other))}</span>
            <span class="val ${face.kind === "transparent" ? "dim" : ""}">${face.kind === "transparent" ? "falls through" : face.main ? keyNameMarked(model, face.main, keyMeaning(there)) : "nothing"}</span>
            <code class="dim">${face.kind === "transparent" ? "" : esc(visibleKeycode(model, there?.keycode || ""))}</code></button>`;
    };
    let html = "", run = /** @type {typeof rows} */ ([]);
    const flush = () => {
        if (run.length >= 3 && !state.stackOpen) html += `<button class="stackrow folded" data-stack-open data-tip="Show each of these layers">
            <span class="mk-slot">${layerIconOff()}</span><span class="nm">${run.length} layers</span>
            <span class="val dim">fall through · ${esc(layerCalled(run[0].other))} to ${esc(layerCalled(run[run.length - 1].other))}</span><code class="dim"></code></button>`;
        else html += run.map(row).join("");
        run = [];
    };
    for (const entry of rows) {
        if (entry.through) { run.push(entry); continue; }
        flush();
        html += row(entry);
    }
    flush();
    if (state.stackOpen && rows.filter((entry) => entry.through).length >= 3)
        html += `<button class="stackrow folded" data-stack-open><span></span><span class="nm dim">Fold transparent layers</span><span></span><code></code></button>`;
    return html;
}

// In a layer preview, the selected key may be answered by a layer below: say
// so, and that what is set here is stored on this layer and wins over it.
/** @param {import("../../view/keyface-types.js").LayerView} view @param {import("../../../contracts/panel.js").Position | undefined} position */
function answeredBelow({previewing, answerAt, layer}, position) {
    if (!previewing || !position) return "";
    const answer = answerAt(position.layoutIndex);
    if (!answer?.fellThrough) return "";
    return `<p class="note answered-below">In this preview <b>${esc(layerCalled(answer.layer))}</b> answers here
        with ${keyNameMarked(getModel(), keyName(answer.position, getModel()), keyMeaning(answer.position))}, through a transparent key. A keycode set here
        is stored on ${esc(layerCalled(layer))} and wins over it.</p>`;
}
