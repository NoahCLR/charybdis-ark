// @ts-check
// The Key tab: the selected position on this layer, the same position across
// the stack, what the key reaches, and its participation.

import {css, isOff} from "../../lib/colour.mjs";
import {el, esc} from "../../lib/dom.mjs";
import {LED_INDEX} from "../../view/geometry.mjs";
import {actionLabel, behaviourFor, canonicalKeycode, combosAt, keyFace, keyMeaning, keyName, pointingSlotFor, resolvedPositions, visibleKeycode} from "../../view/keyface.mjs";
import {layerColourRow, stageEnabled} from "../../view/lighting.mjs";
import {currentLayer, getModel, heldLayers, layerName, layers, openComboBuilder, positionAt, post, previewing, render, selectedPosition, showLayer, state, writable} from "../../store.mjs";
import {participationAt} from "../../view/participation.mjs";
import * as edits from "../../view/edits.mjs";
import {canHaveBehaviour} from "../../view/behavior-editor.mjs";
import {comboBadge} from "../marks.mjs";
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
                <div class="input-row"><input class="input mono" id="keycodeField" value="${esc(keyMeaning(position))}" ${writable() ? "" : "disabled"}>
                <button class="btn" data-act="pick" ${writable() ? "" : "disabled"}>Pick…</button></div></div>
            <dl class="kv key-details">
                <dt>Resolves to</dt><dd>${esc(position ? keyName(position) : "—")}</dd>
                <dt>Stored</dt><dd>${esc(position ? visibleKeycode(model, position.keycode) : "—")}</dd>
                <dt>Matrix</dt><dd>row ${position?.row ?? "—"} · col ${position?.column ?? "—"}</dd>
                <dt>Layout index</dt><dd>${position?.layoutIndex ?? "—"}</dd>
                <dt>LED index</dt><dd>${LED_INDEX[position?.layoutIndex] ?? "—"}</dd>
            </dl>
            ${answeredBelow(layer, position)}
            ${writable() ? "" : `<div class="unavailable key-unavailable">${esc(unavailable(model))}</div>`}
        </section>
        <section>
            <div class="sect-h"><h4>This position across the stack</h4></div>
            <div class="stacklist">${[...layers()].reverse().map((other) => {
                const there = positionAt(other, position?.layoutIndex);
                const otherFace = keyFace(there);
                const through = otherFace.kind === "transparent";
                const row = layerColourRow(model, other.index);
                const lit = stageEnabled(model, "layers") && row && !isOff(row.color);
                return `<button class="stackrow ${other.index === layer.index ? "on" : ""}" data-golayer="${layers().indexOf(other)}">
                    <span class="swatch-lg ${lit ? "" : "swatch-off"}"${lit ? ` style="background:${css(row.color)}"` : ""}></span>
                    <span class="nm">${esc(layerName(other))}</span>
                    <span class="val ${through ? "dim" : ""}">${through ? "falls through" : esc(otherFace.main || "nothing")}</span>
                    <code class="dim">${esc(visibleKeycode(model, there?.keycode || ""))}</code></button>`;
            }).join("")}</div>
            <p class="note stack-note">Higher layers win, and only among the layers held at the time. A transparent key is answered by the highest layer below that is also held — ${esc(layerName(layers()[0]))} always is, so a layer in between answers only when you hold it too.</p>
        </section>
        <section>
            <div class="sect-h"><h4>What this key reaches</h4></div>
            <div class="stack key-reaches">
                <button class="reach ${behaviour ? "" : "empty"}" data-goto="behaviours" ${behaviourOpen ? "" : "disabled"}>
                    <span class="rl">Behaviour</span>
                    <span class="rv">${behaviour ? `${esc(actionLabel(model, behaviour.keycode))} · ${behaviour.steps.length} branch${behaviour.steps.length === 1 ? "" : "es"}` : behaviourOpen ? "Using the key’s defaults" : "Unavailable for transparent keys and KC_NO"}${behaviourOpen && followed.from ? ` · from ${esc(layerName(followed.from))}` : ""}</span>
                    <span class="ra">${behaviour ? "Edit" : "Open"}</span></button>
                <button class="reach ${combos.length ? "" : "empty"}" data-goto="combos">
                    <span class="rl">Combos</span>
                    <span class="rv">${combos.length ? combos.map((combo) => `${comboBadge(model, combo.badge)} → ${esc(combo.outputDisplay || combo.output)}`).join(" · ") : "not part of a combo"}</span>
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
            <h4>Participation · ${esc(layerName(source))}</h4>
            ${inherited ? `<p class="note">This transparent key inherits its permissions from ${esc(layerName(source))}.</p><button class="btn tiny" data-source-layer>Open source placement</button>` : `
            <label class="sw"><input type="checkbox" data-use-behavior ${bp.placementOn ? "checked" : ""} ${writable() ? "" : "disabled"}><span class="track"></span><span class="txt">Use behaviour</span></label>
            <label class="sw"><input type="checkbox" data-join-combos ${cp.placementOn ? "checked" : ""} ${writable() ? "" : "disabled"}><span class="track"></span><span class="txt">Join combos</span></label>`}
            <p class="note">Behaviour: ${esc(bp.reasons.length ? bp.reasons.join("; ") : behavior ? "all permissions allow it" : "no shared definition")}. Combos: ${esc(cp.reasons.length ? cp.reasons.join("; ") : "placement is eligible; each combo also has its own permissions")}.</p>
            ${/^CUSTOM_KEY_\d+$/.test(canonicalKeycode(model, keyMeaning(key))) ? `<p class="note">A custom key has no normal output when its behaviour is bypassed or disabled. Map a plain keycode on a gaming layer that needs direct output.</p>` : ""}
        </div>`);
        /** @type {HTMLElement | null} */ (controls.querySelector("[data-source-layer]"))?.addEventListener("click", () => {showLayer(layers().indexOf(source)); render();});
        /** @type {NodeListOf<HTMLInputElement>} */ (controls.querySelectorAll("input")).forEach(input => input.addEventListener("change", () => post(edits.placementPolicy(source.index, key.layoutIndex,
            /** @type {HTMLInputElement} */ (controls.querySelector("[data-use-behavior]")).checked, /** @type {HTMLInputElement} */ (controls.querySelector("[data-join-combos]")).checked))));
        /** @type {HTMLElement} */ (node.querySelector("section")).appendChild(controls);
    }
    body.replaceChildren(node);
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
        with ${esc(keyName(answer.position))}, through a transparent key. A keycode set here
        is stored on ${esc(layerName(layer))} and wins over it.</p>`;
}
