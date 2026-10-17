// @ts-check
// The board's hover card: everything a key reaches, without clicking and
// without leaving the layer you are reading.

// Selector assertions refer to elements created by this module's authored markup.
import {el, esc} from "../lib/dom.mjs";
import {actionLabel, behaviourFor, behaviourTiers, canonicalKeycode, keyMeaning, keyName, visibleKeycode} from "../view/keyface.mjs";
import {customKeyOf, customKeyShortcutLine} from "../view/custom-key.mjs";
import {combosAt, combosShownAt} from "../view/combo-reach.mjs";
import {macroKeycodes, pointingSlotFor} from "../view/reach.mjs";
import {resolvedPositions} from "../view/layer-resolution.mjs";
import {pdColourRow, stageEnabled} from "../view/lighting.mjs";
import {getModel, heldLayers, layerName, positionAt} from "../store.mjs";
import {branchBadge, comboBadge, keyNameMarked, mark, marked, sends, sendsKind, tierDot} from "./marks.mjs";
import {helperWord, tierName, vocabulary, word} from "../view/vocabulary.mjs";
import {KIND} from "../view/pointing-config.mjs";

const tip = el(`<div class="tip" hidden></div>`);
const card = el(`<div class="hovercard" hidden></div>`);
let timer = 0;

/** @param {HTMLElement} root */
export function mountHover(root) {
    document.body.append(tip, card);
    root.addEventListener("mouseover", (event) => {
        const key = /** @type {SVGElement | null} */ (/** @type {Element} */ (event.target).closest("[data-key]"));
        const hinted = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-tip]"));
        clearTimeout(timer);
        // A key being dragged to a swap is not a key being read.
        if (/** @type {HTMLElement | null} */ (document.querySelector(".kc.dragging"))) { hideHover(); return; }
        if (key) {
            const rect = key.getBoundingClientRect();
            timer = setTimeout(() => { card.innerHTML = keyCard(Number(key.dataset.key)); place(card, rect, 14, true); }, 140);
            tip.hidden = true;
            return;
        }
        card.hidden = true;
        if (hinted) {
            const rect = hinted.getBoundingClientRect();
            timer = setTimeout(() => { tip.textContent = hinted.dataset.tip ?? ""; place(tip, rect, 8); }, 260);
            return;
        }
        tip.hidden = true;
    }, true);
    root.addEventListener("mouseleave", hideHover, true);
    addEventListener("scroll", hideHover, true);
}

export function hideHover() { clearTimeout(timer); tip.hidden = true; card.hidden = true; }

/** @param {HTMLElement} node @param {DOMRect} rect @param {number} [gap] @param {boolean} [beside] */
function place(node, rect, gap = 10, beside = false) {
    node.hidden = false;
    const box = node.getBoundingClientRect();
    let left, top;
    if (beside) {
        const right = rect.right + gap;
        left = right + box.width < innerWidth - 10 ? right : rect.left - gap - box.width;
        top = rect.top + rect.height / 2 - box.height / 2;
    } else {
        left = rect.left + rect.width / 2 - box.width / 2;
        top = rect.top - box.height - gap;
        if (top < 10) top = rect.bottom + gap;
    }
    node.style.left = `${Math.max(10, Math.min(left, innerWidth - box.width - 10))}px`;
    node.style.top = `${Math.max(10, Math.min(top, innerHeight - box.height - 10))}px`;
}


/** @param {number} index */
function keyCard(index) {
    const model = getModel();
    const stack = model?.layers || [];
    const layer = stack[state()] || stack[0];
    const position = positionAt(layer, index);
    if (!position) return "";
    const own = reachSections(model, layer, position, index);
    if (!own.length) own.push(`<div class="hc-sect"><div class="hc-empty">No key behaviour, macro, combo or pointing mode on this key.</div></div>`);
    return `<div class="hc-head"><div class="hc-title"><span class="t">${keyNameMarked(model, keyName(position), keyMeaning(position))}</span>
        <span class="hc-pill">index ${index}</span></div>
        <code class="hc-code">${esc(visibleKeycode(model, position.keycode))}</code></div>${own.join("")}${seenThrough(model, stack, index)}`;
}

// In a layer preview, a key transparent on the viewed layer is answered by the
// highest layer below that is on. The card still reads the viewed layer's own
// key first, then what the answering key does, as the keyboard would run it.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/panel.js").Layer[]} stack @param {number} index */
function seenThrough(model, stack, index) {
    const held = heldLayers();
    if (!held.length) return "";
    const answer = resolvedPositions(stack, state(), held).find((entry) => entry.position.layoutIndex === index);
    if (!answer?.fellThrough) return "";
    const from = answer.layer, position = answer.position;
    const sections = reachSections(model, from, position, index, combosShownAt(model, stack, state(), held, index));
    return `<div class="hc-through"><div class="hc-sect">
            <div class="hc-h">Seen through from ${marked(model, {kind: "layer", layer: from.index}, layerName(from))}</div>
            <div class="hc-title"><span class="t">${keyNameMarked(model, keyName(position), keyMeaning(position))}</span></div>
            <code class="hc-code">${esc(visibleKeycode(model, position.keycode))}</code></div>
        ${sections.length ? sections.join("") : `<div class="hc-sect"><div class="hc-empty">No key behaviour, macro, combo or pointing mode on that key.</div></div>`}</div>`;
}

// What one stored key reaches: its behaviour, macros, pointing mode and the
// combos on its layer at this position — or, for a key seen through a preview,
// the combos the board badges it with there. Empty when it reaches none of them.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/panel.js").Layer} layer @param {import("../../contracts/panel.js").Position} position @param {number} index @param {import("../../contracts/panel.js").ComboView[]} [combos] */
function reachSections(model, layer, position, index,
    combos = combosAt(model, model?.layers || [], layer?.index ?? 0, index)) {
    const behaviour = behaviourFor(model, keyMeaning(position));
    const macros = macroKeycodes(keyMeaning(position));
    const slot = pointingSlotFor(model, keyMeaning(position));
    const lit = stageEnabled(model, "key");
    const sections = [];
    const custom = customKeyOf(model, canonicalKeycode(model, keyMeaning(position)));
    if (custom) {
        sections.push(`<div class="hc-sect"><div class="hc-h">Custom key shortcut</div>
            <div class="hc-sub">${esc(customKeyShortcutLine(custom))}</div></div>`);
    }
    if (behaviour) {
        const branches = (behaviour.steps || []).map((step) => {
            /** @type {[import("../../contracts/edits.js").Tier, string, import("../../contracts/panel.js").Branch | undefined][]} */
            const tiers = [["tap", tierName(model, "tap"), step.tap], ["hold", tierName(model, "hold"), step.hold], ["long", tierName(model, "long"), step.longHold]];
            const rows = tiers
                .map(([kind, name, branch]) => branch ? `<div class="hc-act"><span class="hc-stage">${tierDot(model, kind)}${esc(name)}</span>
                    <span>${sends(model, branch.action) || `<span class="hc-target">${esc(branch.action)}</span>`}
                    <span class="hc-life${sendsKind(model, branch.action) ? " hc-under" : ""}">${esc(described(sendsKind(model, branch.action), helperText(kind, branch.helper)))}</span></span></div>` : "").join("");
            return `<div class="hc-branch">${branchBadge(model, step.tapCount + 1, "hc-n")}<div>${rows}</div></div>`;
        }).join("");
        sections.push(`<div class="hc-sect"><div class="hc-h">Key behaviour</div>
            <div class="hc-sub">${keyNameMarked(model, actionLabel(model, behaviour.keycode), behaviour.keycode)} · ${behaviour.steps.length} branch${behaviour.steps.length === 1 ? "" : "es"} · tap/hold ${timing(behaviour.tapHoldTerm)}${behaviour.keepsAutoMouseAnchored ? " · keeps auto-mouse anchored" : ""}</div>
            ${branches}
            <div class="hc-sub hc-foot">${lit
                ? "The dot beside each tier is the colour the keyboard flashes on this key when that tier resolves."
                : "Key feedback is switched off, so none of these flash on the keyboard."}</div></div>`);
    }
    if (macros.length) {
        const slots = model?.viaMacros || [];
        sections.push(`<div class="hc-sect"><div class="hc-h">Macro payload</div>${macros.map((keycode) => {
            const macro = slots.find((row) => row.keycode === keycode);
            return `<div class="hc-sub">${esc(keycode)}${macro ? "" : " · not reported"}</div>`
                + (macro?.payload ? `<div class="hc-step"><span class="k">payload</span><span class="v">${esc(macro.payload.slice(0, 64))}</span></div>` : "");
        }).join("")}</div>`);
    }
    if (slot) {
        const row = pdColourRow(model, slot.id);
        sections.push(`<div class="hc-sect"><div class="hc-h">Pointing mode</div>
            <div class="hc-flow">${mark(model, {kind: "pointing", slot: slot.id})}
            <span>${esc(slot.displayName || `Slot ${slot.id}`)}</span>
            <span class="hc-life">${slot.kind === KIND.SCROLLING ? "scrolling" : slot.kind ? "directional" : "empty slot"}</span></div>
            <div class="hc-sub hc-foot">${slot.kind
                ? `Its colour paints ${esc(localityText(row?.locality))} while the mode runs — not this key.`
                : "This slot is empty, so the key does nothing until it is configured. The keyboard keeps the keycode either way."}</div></div>`);
    }
    if (combos.length) {
        sections.push(`<div class="hc-sect"><div class="hc-h">Combos</div>${combos.map((combo) => `
            <div class="hc-flow">${comboBadge(getModel(), combo.badge || "C")}
            ${(combo.inputs || []).map((input, at) => `<span class="hc-chip">${keyNameMarked(model, combo.inputDisplays?.[at] ?? input, input)}</span>`).join('<span class="hc-life">+</span>')}
            <span class="hc-life">→</span><span class="hc-chip out">${esc(combo.outputDisplay || combo.output)}</span></div>`).join("")}</div>`);
    }
    return sections;
}

/** @param {import("../../contracts/edits.js").Tier} kind @param {string | undefined} helper */
const helperText = (kind, helper) => helperWord(getModel(), kind, helper ?? "");
/** @param {string} what @param {string} how */
const described = (what, how) => [what, how].filter(Boolean).join(" · ");

/** @param {import("../../contracts/edits.js").Scalar | undefined} value */
const timing = (value) => Number(value) ? `${value} ms` : "keyboard default";

// Where a colour paints, in the vocabulary's words, read inside a sentence.
/** @param {string | undefined} locality */
const localityText = (locality) => locality ? word(vocabulary(getModel()).localities, locality).toLowerCase() : "its locality";

// The card is drawn for whichever layer the screen is showing.
let layerIndex = () => 0;
/** @param {() => number} fn */
export const bindLayerIndex = (fn) => { layerIndex = fn; };
const state = () => layerIndex();
