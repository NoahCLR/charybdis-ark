// @ts-check
// The Key tab: the picked key as the inspector (decisions R2, R14, §5 Keys).
// Its title; one "Does" line; the Key row with its keycode, Change key… and
// Add a hold…; what it reaches (its behaviour, its combos, a trackball mode);
// where it runs them, only when that would change something; the same place
// on every layer; and where it is stored.

import {css, isOff} from "../../lib/colour.mjs";
import {DISCLOSURE, el, esc} from "../../lib/dom.mjs";
import {LED_INDEX} from "../../view/geometry.mjs";
import {actionsWords, behaviourFor, canonicalKeycode, keyFace, keyMeaning, keyName, visibleKeycode} from "../../view/keyface.mjs";
import {combosAt} from "../../view/combo-reach.mjs";
import {pointingSlotFor} from "../../view/reach.mjs";
import {resolvedPositions} from "../../view/layer-resolution.mjs";
import {layerColourRow, stageEnabled} from "../../view/lighting.mjs";
import {keySummary, timingWords} from "../../view/key-summary.mjs";
import {currentLayer, getModel, heldLayers, layerName, layers, openComboBuilder, positionAt, post, render, selectedPosition, showLayer, state, writable} from "../../store.mjs";
import {participationAt} from "../../view/participation.mjs";
import * as edits from "../../view/edits.mjs";
import {canHaveBehaviour} from "../../view/behavior-editor.mjs";
import {draftDot, draftMarks} from "../../view/review.mjs";
import {comboIdentityMarked, keycodeMark, keyNameMarked, slotLight} from "../marks.mjs";
import {customKeyBypassText, customKeyOf} from "../../view/custom-key.mjs";
import {unavailable} from "../shell.mjs";
import {behaviourKey, selectBehaviourKey} from "./behaviour-selection.mjs";
import {pickKeycodeFor} from "./key-edits.mjs";
import {doesHtml} from "./summary.mjs";
import {keyProblem} from "../../view/keycode-expression.mjs";

const COMBO_ROWS = 3;

/** @param {HTMLElement} body */
export function tabKey(body) {
    const model = getModel();
    const layer = currentLayer();
    const position = selectedPosition();
    if (!position) { body.replaceChildren(el(`<p class="note">This layer has no keys.</p>`)); return; }
    const face = keyFace(position);
    const followed = behaviourKey(position.layoutIndex);
    const behaviour = behaviourFor(model, followed.keycode);
    const behaviourOpen = canHaveBehaviour(model, followed.keycode);
    const combos = combosAt(model, layers(), state.layer, position.layoutIndex);
    const slot = pointingSlotFor(model, keyMeaning(position));
    const summary = keySummary(model, position, {at: state.layer, held: heldLayers()});
    const canWrite = writable();
    const drafted = draftMarks(model?.draft?.changes).keys.get(layer.index)?.has(position.layoutIndex);
    const answer = resolvedPositions(layers(), state.layer, heldLayers()).find((entry) => entry.position.layoutIndex === position.layoutIndex);
    // A transparent key is answered by the highest layer under it that is on.
    const below = face.kind === "transparent" ? answer?.fellThrough ? answer : resolvedPositions(layers(), state.layer, [0]).find((entry) => entry.position.layoutIndex === position.layoutIndex) : null;

    const does = face.kind === "transparent"
        ? `Transparent → ${below && below.layer !== layer ? `${keyNameMarked(model, keyName(below.position), keyMeaning(below.position))} <span class="dim">from</span> ${esc(layerName(below.layer))}
            <button class="btn text compact" data-show-layer="${layers().indexOf(below.layer)}">Show on ${esc(layerName(below.layer))}</button>` : "nothing answers below"}`
        : doesHtml(model, position, summary);
    const timing = timingWords(summary.timing);

    const comboRows = combos.slice(0, COMBO_ROWS).map((combo) => `<button class="key-row-link" data-combo="${combo.id}">
            <span>${comboIdentityMarked(model, combo)}</span><span class="dim">${esc(combo.badge)}</span></button>`).join("");
    const node = el(`<div class="tab-grid two key-tab">
        <section class="key-main">
            <div class="key-title"><h3>${keyNameMarked(model, keyName(position), keyMeaning(position))}</h3>${drafted ? draftDot() : ""}
                ${summary.danger ? `<span class="key-warn" data-tip="${esc(summary.danger)}">⚠</span>` : ""}
                <span class="dim key-where">on ${esc(layerName(layer))}</span></div>
            <dl class="kv key-does"><dt>Does</dt><dd>${does}${timing ? `<div class="note">${esc(timing)}</div>` : ""}
                ${summary.inert ? `<div class="note key-inert">Not in this firmware: this key does nothing.</div>` : ""}
                ${summary.danger ? `<div class="note key-inert">⚠ ${esc(summary.danger)}</div>` : ""}</dd></dl>
            <div class="field key-row"><span>Key</span>
                <div class="input-row"><input class="input mono" id="keycodeField" data-f="key:${layer.index}:${position.layoutIndex}:keycode" value="${esc(keyMeaning(position))}"
                    aria-label="Keycode" data-tip="The key as QMK names it. Type another keycode and press Enter." ${canWrite ? "" : "disabled"}>
                <button class="btn" data-act="pick" ${canWrite ? "" : "disabled"}>Change key…</button>
                <button class="btn" data-act="hold" ${canWrite && face.kind !== "transparent" ? "" : "disabled"}
                    data-tip="Choose what holding this key does, keeping its tap">Add a hold…</button></div>
                <p class="note key-field-error" role="status" hidden></p></div>
            <div class="key-reach-rows">
                ${behaviourOpen ? `<div class="key-line"><span class="eyebrow">Behaviour</span>
                    <span>${behaviour ? esc(actionsWords(behaviour)) : "Taps and holds as the key does by itself"}${followed.from ? ` <span class="dim">· from ${esc(layerName(followed.from))}</span>` : ""}</span>
                    <button class="btn text compact" data-goto="behaviours">${behaviour ? "Edit →" : "Add →"}</button></div>` : ""}
                <div class="key-line key-combos"><span class="eyebrow">Combos</span>
                    ${combos.length ? `<span class="key-combo-list">${comboRows}${combos.length > COMBO_ROWS ? `<span class="dim">+${combos.length - COMBO_ROWS} more</span>` : ""}</span>
                        <button class="btn text compact" data-goto="combos">Combos →</button>`
                        : `<span class="dim">Not part of a combo</span><button class="btn text compact" data-goto="combos">New combo…</button>`}</div>
                ${slot ? `<div class="key-line"><span class="eyebrow">Trackball mode</span>
                    <span>${slotLight(model, slot).swatch("mk-swatch")} ${esc(slot.displayName || `Mode ${slot.id}`)}</span>
                    <button class="btn text compact" data-goto="pointing">Edit →</button></div>` : ""}
            </div>
            <div class="key-participation-slot"></div>
            <details class="key-more" ${state.keyDetailsOpen ? "open" : ""}><summary class="note">${DISCLOSURE}Where it is stored</summary>
                <dl class="kv">
                    <dt>Stored as</dt><dd><code>${esc(visibleKeycode(model, position.keycode))}</code></dd>
                    <dt>Matrix</dt><dd>row ${position.row ?? "—"} · col ${position.column ?? "—"}</dd>
                    <dt>Layout index</dt><dd>${position.layoutIndex ?? "—"}</dd>
                    <dt>LED index</dt><dd>${LED_INDEX[position.layoutIndex] ?? "—"}</dd>
                </dl></details>
            ${canWrite ? "" : `<div class="unavailable key-unavailable">${esc(unavailable(model))}</div>`}
        </section>
        <section>
            <div class="sect-h"><h4>This key on every layer</h4></div>
            <div class="stacklist">${stackRows(model, layer, position)}</div>
            <p class="note stack-note">The highest layer that is on wins; ▽ falls through to the next one on. Default layers (normally ${esc(layerName(layers()[0]))}) are always on.</p>
        </section>
    </div>`);

    // The Key row: a typed keycode is staged on Enter or when the field is
    // left; one the draft cannot store stays in the field with the reason.
    const field = /** @type {HTMLInputElement | null} */ (node.querySelector("#keycodeField"));
    const fieldError = /** @type {HTMLElement} */ (node.querySelector(".key-field-error"));
    field?.addEventListener("change", () => {
        const written = field.value.trim();
        const problem = written && written !== keyMeaning(position) ? keyProblem(model, written) : "";
        fieldError.hidden = !problem;
        fieldError.textContent = problem;
        field.setAttribute("aria-invalid", String(Boolean(problem)));
        if (!written || written === keyMeaning(position) || problem) return;
        post(edits.setKey(layer.name, position.layoutIndex, written));
    });
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="pick"]'))?.addEventListener("click", () => pickKeycodeFor(position.layoutIndex));
    /** @type {HTMLButtonElement | null} */ (node.querySelector('[data-act="hold"]'))?.addEventListener("click", () => pickKeycodeFor(position.layoutIndex, {hold: true}));
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-golayer], [data-show-layer]")).forEach((button) => button.addEventListener("click", () => {
        showLayer(Number(button.dataset.golayer ?? button.dataset.showLayer));
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
    /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-combo]")).forEach((button) => button.addEventListener("click", () => {
        const combo = combos.find((entry) => String(entry.id) === button.dataset.combo);
        state.tab = "combos";
        if (combo && writable()) openComboBuilder(combo);
        render();
    }));
    const participation = participationControls(model, layer, answer, face);
    if (participation) /** @type {HTMLElement} */ (node.querySelector(".key-participation-slot")).replaceWith(participation);
    body.replaceChildren(node);
}

// "Runs its behaviour here" and "Can start combos here", for the layer the
// key answers from, only when they would change something: the key has a
// behaviour, or is an input of a combo. Otherwise one quiet line; nothing for
// Transparent and Nothing, which run neither.
/** @param {import("../../../contracts/panel.js").PublishedModel | null} model @param {import("../../../contracts/panel.js").Layer} layer @param {ReturnType<typeof resolvedPositions>[number] | undefined} answer @param {ReturnType<typeof keyFace>} face */
function participationControls(model, layer, answer, face) {
    if (!answer || !model?.participation || face.kind === "transparent" || face.kind === "disabled") return null;
    const source = answer.layer, key = answer.position;
    if (source.index !== layer.index) return null;
    const behavior = behaviourFor(model, keyMeaning(key));
    const inCombos = combosAt(model, layers(), layers().indexOf(source), key.layoutIndex).length > 0;
    const located = /** @type {import("../../../contracts/panel.js").Position & {row: number, column: number}} */ (key);
    const bp = participationAt(model, source.index, located, behavior);
    const cp = participationAt(model, source.index, located, undefined, "combo");
    if (!bp || !cp) return null;
    // A switch already off still shows, so it can be turned back on.
    const showBehaviour = Boolean(behavior) || !bp.placementOn, showCombos = inCombos || !cp.placementOn;
    if (!showBehaviour && !showCombos) {
        return el(`<p class="note key-participation">No behaviour or combo uses this key here.</p>`);
    }
    const bypass = customKeyBypassText(customKeyOf(model, canonicalKeycode(model, keyMeaning(key))));
    const why = [
        showBehaviour && bp.reasons.length ? `Behaviour: ${bp.reasons.join("; ")}.` : "",
        showCombos && cp.reasons.length ? `Combos: ${cp.reasons.join("; ")}.` : "",
    ].filter(Boolean).join(" ");
    const node = el(`<div class="stack key-participation">
        <div class="eyebrow">On ${esc(layerName(source))}</div>
        <label class="sw" ${showBehaviour ? "" : "hidden"}><input type="checkbox" data-f="key:${source.index}:${key.layoutIndex}:behaviour" data-use-behavior ${bp.placementOn ? "checked" : ""} ${writable() ? "" : "disabled"}><span class="track"></span><span class="txt">Runs its behaviour here</span></label>
        <label class="sw" ${showCombos ? "" : "hidden"}><input type="checkbox" data-f="key:${source.index}:${key.layoutIndex}:combos" data-join-combos ${cp.placementOn ? "checked" : ""} ${writable() ? "" : "disabled"}><span class="track"></span><span class="txt">Can start combos here</span></label>
        ${why ? `<p class="note">${esc(why)}</p>` : ""}
        ${bypass && showBehaviour ? `<p class="note">${esc(bypass)}</p>` : ""}
    </div>`);
    /** @type {NodeListOf<HTMLInputElement>} */ (node.querySelectorAll("input")).forEach((input) => input.addEventListener("change", () => post(edits.placementPolicy(source.index, key.layoutIndex,
        /** @type {HTMLInputElement} */ (node.querySelector("[data-use-behavior]")).checked, /** @type {HTMLInputElement} */ (node.querySelector("[data-join-combos]")).checked))));
    return node;
}

// The selected position on every layer, highest first, each with its verb
// ("Hold ■ Number") and a Show that goes to that layer. Three or more
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
        return `<button class="stackrow ${other.index === layer.index ? "on" : ""}${through ? " through" : ""}" data-golayer="${layers().indexOf(other)}" data-tip="Show ${esc(layerName(other))}">
            <span class="swatch-lg ${lit ? "" : "swatch-off"}"${lit ? ` style="background:${css(colour.color)}"` : ""}></span>
            <span class="nm">${esc(layerName(other))}</span>
            <span class="val ${face.kind === "transparent" ? "dim" : ""}">${face.kind === "transparent" ? "Transparent" : keyNameMarked(model, keyName(there), keyMeaning(there))}
                ${keycodeMark("stackRow", face.kind === "transparent" ? "" : visibleKeycode(model, there?.keycode || ""), keyName(there))}</span>
            <span class="stack-show">${other.index === layer.index ? "" : "Show →"}</span></button>`;
    };
    let html = "", run = /** @type {typeof rows} */ ([]);
    const flush = () => {
        if (run.length >= 3 && !state.stackOpen) html += `<button class="stackrow folded" data-stack-open data-tip="Show each of these layers">
            <span class="swatch-lg swatch-off"></span><span class="nm">${run.length} layers</span>
            <span class="val dim">Transparent · ${esc(layerName(run[0].other))} to ${esc(layerName(run[run.length - 1].other))}</span><span class="stack-show"></span></button>`;
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
        html += `<button class="stackrow folded" data-stack-open><span></span><span class="nm dim">Fold transparent layers</span><span></span><span></span></button>`;
    return html;
}
