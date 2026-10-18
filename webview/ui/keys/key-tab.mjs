// @ts-check
// The Key tab: the selected position on this layer, the same position across
// the stack, what the key reaches, and its participation.

import {css, isOff} from "../../lib/colour.mjs";
import {DISCLOSURE, el, esc} from "../../lib/dom.mjs";
import {LED_INDEX} from "../../view/geometry.mjs";
import {behaviourFor, canonicalKeycode, keyFace, keyMeaning, keyName, visibleKeycode} from "../../view/keyface.mjs";
import {combosAt} from "../../view/combo-reach.mjs";
import {pointingSlotFor} from "../../view/reach.mjs";
import {resolvedPositions} from "../../view/layer-resolution.mjs";
import {layerColourRow, stageEnabled} from "../../view/lighting.mjs";
import {currentLayer, getModel, heldLayers, layerName, layers, openComboBuilder, positionAt, post, previewing, render, selectedPosition, showLayer, state, writable} from "../../store.mjs";
import {participationAt} from "../../view/participation.mjs";
import * as edits from "../../view/edits.mjs";
import {canHaveBehaviour} from "../../view/behavior-editor.mjs";
import {actionMarked, comboBadge, comboOutputMarked, keyNameMarked} from "../marks.mjs";
import {customKeyBypassText, customKeyOf} from "../../view/custom-key.mjs";
import {unavailable} from "../shell.mjs";
import {behaviourKey, selectBehaviourKey} from "./behaviour-selection.mjs";
import {pickKeycodeFor} from "./key-edits.mjs";

/** @param {HTMLElement} body */
export function tabKey(body) {
    const model = getModel();
    const layer = currentLayer();
    const position = selectedPosition();
    const followed = behaviourKey(position?.layoutIndex);
    const behaviour = behaviourFor(model, followed.keycode);
    const behaviourOpen = canHaveBehaviour(model, followed.keycode);
    const combos = position ? combosAt(model, layers(), state.layer, position.layoutIndex) : [];
    const slot = pointingSlotFor(model, keyMeaning(position));

    const node = el(`<div class="tab-grid three">
        <section>
            <div class="sect-h"><h4>This position on ${esc(layerName(layer))}</h4></div>
            <div class="field"><span>Keycode</span>
                <div class="input-row"><input class="input mono" id="keycodeField" data-f="key:${layer.index}:${position?.layoutIndex}:keycode" value="${esc(keyMeaning(position))}" ${writable() ? "" : "disabled"}>
                <button class="btn" data-act="pick" ${writable() ? "" : "disabled"}>Pick…</button></div></div>
            <div class="key-details">
                <dl class="kv"><dt>Does</dt><dd>${position ? keyNameMarked(model, keyName(position), keyMeaning(position)) : "—"}</dd></dl>
                <details class="key-more" ${state.keyDetailsOpen ? "open" : ""}><summary class="note">${DISCLOSURE}Where it is stored</summary>
                <dl class="kv">
                    <dt>Stored as</dt><dd>${esc(position ? visibleKeycode(model, position.keycode) : "—")}</dd>
                    <dt>Matrix</dt><dd>row ${position?.row ?? "—"} · col ${position?.column ?? "—"}</dd>
                    <dt>Layout index</dt><dd>${position?.layoutIndex ?? "—"}</dd>
                    <dt>LED index</dt><dd>${LED_INDEX[position?.layoutIndex] ?? "—"}</dd>
                </dl></details>
            </div>
            ${answeredBelow(layer, position)}
            ${writable() ? "" : `<div class="unavailable key-unavailable">${esc(unavailable(model))}</div>`}
        </section>
        <section>
            <div class="sect-h"><h4>This key on every layer</h4></div>
            <div class="stacklist">${stackRows(model, layer, position)}</div>
            <p class="note stack-note">The highest layer you hold wins. A transparent key takes what the next layer down that you hold does; ${esc(layerName(layers()[0]))} is always on.</p>
        </section>
        <section>
            <div class="sect-h"><h4>What this key reaches</h4></div>
            <div class="stack key-reaches">
                <button class="reach ${behaviour ? "" : "empty"}" data-goto="behaviours" ${behaviourOpen ? "" : "disabled"}>
                    <span class="rl">Behaviour</span>
                    <span class="rv">${behaviour ? `${actionMarked(model, behaviour.keycode)} · ${behaviour.steps.length} branch${behaviour.steps.length === 1 ? "" : "es"}` : behaviourOpen ? "Using the key’s defaults" : "Unavailable for transparent keys and KC_NO"}${behaviourOpen && followed.from ? ` · from ${esc(layerName(followed.from))}` : ""}</span>
                    <span class="ra">${behaviour ? "Edit" : "Open"}</span></button>
                <button class="reach ${combos.length ? "" : "empty"}" data-goto="combos">
                    <span class="rl">Combos</span>
                    <span class="rv">${combos.length ? combos.map((combo) => `${comboBadge(model, combo.badge)} → ${comboOutputMarked(model, combo)}`).join(" · ") : "not part of a combo"}</span>
                    <span class="ra">${combos.length ? "Edit" : "New"}</span></button>
                ${slot ? `<button class="reach" data-goto="pointing"><span class="rl">Pointing</span>
                    <span class="rv">${esc(slot.displayName || `Slot ${slot.id}`)}</span><span class="ra">Edit</span></button>` : ""}
            </div>
        </section>
    </div>`);
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="pick"]'))?.addEventListener("click", () => pickKeycodeFor(position.layoutIndex));
    /** @type {HTMLInputElement | null} */ (node.querySelector("#keycodeField"))?.addEventListener("change", (event) => {
        const written = /** @type {HTMLInputElement} */ (event.target).value.trim();
        if (!written || written === keyMeaning(position)) return;
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
        if (state.tab === "combos" && !combos.length) openComboBuilder(null, edits.comboDefaultTermValue(getModel()));
        render();
    }));
    const answer = position && resolvedPositions(layers(), state.layer, heldLayers()).find(entry => entry.position.layoutIndex === position.layoutIndex);
    if (answer && model?.participation) {
        const source = answer.layer, key = answer.position;
        const behavior = behaviourFor(model, keyMeaning(key));
        const bp = /** @type {NonNullable<ReturnType<typeof participationAt>>} */ (participationAt(model, source.index, /** @type {import("../../../contracts/panel.js").Position & {row: number, column: number}} */ (key), behavior));
        const cp = /** @type {NonNullable<ReturnType<typeof participationAt>>} */ (participationAt(model, source.index, /** @type {import("../../../contracts/panel.js").Position & {row: number, column: number}} */ (key), undefined, "combo"));
        const inherited = source.index !== layer.index;
        const controls = el(`<div class="stack key-participation">
            <div class="sect-h"><h4>Behaviour and combos on ${esc(layerName(source))}</h4></div>
            ${inherited ? `<p class="note">This transparent key inherits its permissions from ${esc(layerName(source))}.</p><button class="btn tiny" data-source-layer>Open source placement</button>` : `
            <label class="sw"><input type="checkbox" data-f="key:${source.index}:${key.layoutIndex}:behaviour" data-use-behavior ${bp.placementOn ? "checked" : ""} ${writable() ? "" : "disabled"}><span class="track"></span><span class="txt">Use behaviour</span></label>
            <label class="sw"><input type="checkbox" data-f="key:${source.index}:${key.layoutIndex}:combos" data-join-combos ${cp.placementOn ? "checked" : ""} ${writable() ? "" : "disabled"}><span class="track"></span><span class="txt">Join combos</span></label>`}
            <p class="note">Behaviour: ${esc(bp.reasons.length ? bp.reasons.join("; ") : behavior ? "runs here" : "this key has none")}. Combos: ${esc(cp.reasons.length ? cp.reasons.join("; ") : "this key can take part; each combo has its own switches too")}.</p>
            ${customKeyBypassText(customKeyOf(model, canonicalKeycode(model, keyMeaning(key)))) ? `<p class="note">${esc(customKeyBypassText(customKeyOf(model, canonicalKeycode(model, keyMeaning(key)))))}</p>` : ""}
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
        const face = keyFace(there);
        return {other, there, face, through: face.kind === "transparent" && other.index !== layer.index};
    });
    /** @param {typeof rows[number]} entry */
    const row = ({other, there, face, through}) => {
        const colour = layerColourRow(model, other.index);
        const lit = stageEnabled(model, "layers") && colour && !isOff(colour.color);
        return `<button class="stackrow ${other.index === layer.index ? "on" : ""}${through ? " through" : ""}" data-golayer="${layers().indexOf(other)}">
            <span class="swatch-lg ${lit ? "" : "swatch-off"}"${lit ? ` style="background:${css(colour.color)}"` : ""}></span>
            <span class="nm">${esc(layerName(other))}</span>
            <span class="val ${face.kind === "transparent" ? "dim" : ""}">${face.kind === "transparent" ? "falls through" : esc(face.main || "nothing")}</span>
            <code class="dim">${face.kind === "transparent" ? "" : esc(visibleKeycode(model, there?.keycode || ""))}</code></button>`;
    };
    let html = "", run = /** @type {typeof rows} */ ([]);
    const flush = () => {
        if (run.length >= 3 && !state.stackOpen) html += `<button class="stackrow folded" data-stack-open data-tip="Show each of these layers">
            <span class="swatch-lg swatch-off"></span><span class="nm">${run.length} layers</span>
            <span class="val dim">fall through · ${esc(layerName(run[0].other))} to ${esc(layerName(run[run.length - 1].other))}</span><code class="dim"></code></button>`;
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
/** @param {import("../../../contracts/panel.js").Layer} layer @param {import("../../../contracts/panel.js").Position | undefined} position */
function answeredBelow(layer, position) {
    if (!previewing() || !position) return "";
    const answer = resolvedPositions(layers(), state.layer, heldLayers())
        .find((entry) => entry.position.layoutIndex === position.layoutIndex);
    if (!answer?.fellThrough) return "";
    return `<p class="note answered-below">In this preview <b>${esc(layerName(answer.layer))}</b> answers here
        with ${keyNameMarked(getModel(), keyName(answer.position), keyMeaning(answer.position))}, through a transparent key. A keycode set here
        is stored on ${esc(layerName(layer))} and wins over it.</p>`;
}
