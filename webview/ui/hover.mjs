// @ts-check
// The board's hover card: everything a key reaches, without clicking and
// without leaving the layer you are reading.

// Selector assertions refer to elements created by this module's authored markup.
import {el, esc} from "../lib/dom.mjs";
import {actionNaming, behaviourFor, canonicalKeycode, dualRole, keyMeaning, keyName, visibleKeycode} from "../view/keyface.mjs";
import {comboBehaviours, comboInputIsKey, combosAt, combosShownAt} from "../view/combo-reach.mjs";
import {customKeyHeadline, customKeyOf, customKeyShortcutOnly} from "../view/custom-key.mjs";
import {macroKeycodes, pointingSlotFor} from "../view/reach.mjs";
import {behaviourEditorRow, behaviourHasTiming, behaviourThresholds, helperDetail} from "../view/behavior-editor.mjs";
import {behaviourRuns} from "../view/participation.mjs";
import {resolvedPositions} from "../view/layer-resolution.mjs";
import {pdColourRow, stageEnabled} from "../view/lighting.mjs";
import {getModel, heldLayers, layerName, positionAt} from "../store.mjs";
import {branchBadge, comboBadge, comboOutputMarked, comboTint, keyNameMarked, macroSteps, mark, marked, sends, sendsKind, tierDot} from "./marks.mjs";
import {helperWord, tierName, vocabulary, word} from "../view/vocabulary.mjs";
import {KIND} from "../view/pointing-config.mjs";

const tip = el(`<div class="tip" hidden></div>`);
const card = el(`<div class="hovercard" hidden></div>`);
// The behaviours the key's combos run, each in its own card beside the key's.
const side = el(`<div class="hovercard-side" hidden></div>`);
let timer = 0;

/** @param {HTMLElement} root */
export function mountHover(root) {
    document.body.append(tip, card, side);
    root.addEventListener("mouseover", (event) => {
        const key = /** @type {SVGElement | null} */ (/** @type {Element} */ (event.target).closest("[data-key]"));
        const hinted = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest("[data-tip]"));
        clearTimeout(timer);
        // A key being dragged to a swap is not a key being read.
        if (/** @type {HTMLElement | null} */ (document.querySelector(".kc.dragging"))) { hideHover(); return; }
        if (key) {
            const rect = key.getBoundingClientRect();
            timer = setTimeout(() => {
                // A key the layer has no position for has nothing to show.
                card.innerHTML = keyCard(Number(key.dataset.key));
                if (!card.innerHTML) { hideHover(); return; }
                place(card, rect, 14, true);
                side.innerHTML = behaviourCards(Number(key.dataset.key)); placeSide(rect);
            }, 140);
            tip.hidden = true;
            return;
        }
        card.hidden = true; side.hidden = true;
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

export function hideHover() { clearTimeout(timer); tip.hidden = true; card.hidden = true; side.hidden = true; }

// Beside the key's card, on its far side from the key, or across the key when
// there is no room there.
/** @param {DOMRect} keyRect */
function placeSide(keyRect) {
    side.hidden = !side.innerHTML;
    if (side.hidden) return;
    const main = card.getBoundingClientRect(), box = side.getBoundingClientRect();
    const right = main.left >= keyRect.right;
    let left = right ? main.right + 10 : main.left - 10 - box.width;
    if (left < 10 || left + box.width > innerWidth - 10) left = right ? keyRect.left - 14 - box.width : keyRect.right + 14;
    side.style.left = `${Math.max(10, Math.min(left, innerWidth - box.width - 10))}px`;
    side.style.top = `${Math.max(10, Math.min(main.top, innerHeight - box.height - 10))}px`;
}

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
    return `<div class="hc-head"><div class="hc-title"><span class="t">${keyNameMarked(model, keyName(position), keyMeaning(position))}</span>
        <span class="hc-pill">index ${index}</span></div>
        <code class="hc-code">${esc(visibleKeycode(model, position.keycode))}</code>${headline(model, keyMeaning(position))}</div>${own.join("")}${seenThrough(model, stack, index)}`;
}

// One card per behaviour the key's combos run, as the key that behaviour
// belongs to would show it, naming the combos that run it. Three at most.
/** @param {number} index */
function behaviourCards(index) {
    const model = getModel();
    const stack = model?.layers || [];
    const layer = stack[state()] || stack[0];
    if (!positionAt(layer, index)) return "";
    const runs = comboBehaviours(model, combosAt(model, stack, layer?.index ?? 0, index), layer?.index ?? 0);
    const tint = comboTint(model);
    const cards = runs.slice(0, SIDE_CARDS).map((run) => {
        const target = /** @type {import("../../contracts/panel.js").Position} */ ({keycode: run.output, semantic: run.keycode, layoutIndex: -1});
        return `<div class="hovercard hc-side"${tint ? ` style="--combo:${tint}"` : ""}><div class="hc-head"><div class="hc-eyebrow">Combo behaviour</div><div class="hc-title"><span class="t">${keyNameMarked(model, run.shown, run.keycode)}</span>
            <span class="hc-badges">${run.badges.map((badge) => comboBadge(model, badge)).join("")}</span></div>
            <code class="hc-code">${esc(visibleKeycode(model, run.output))}</code>${headline(model, run.keycode)}
            <div class="hc-sub hc-foot">Runs when ${esc(run.badges.join(" or "))} fires.</div></div>${reachSections(model, layer, target, -1, [], {foot: false}).join("")}</div>`;
    });
    if (runs.length > SIDE_CARDS) cards.push(`<div class="hc-more">+${runs.length - SIDE_CARDS} more behaviour${runs.length - SIDE_CARDS === 1 ? "" : "s"} run by this key's combos</div>`);
    return cards.join("");
}
const SIDE_CARDS = 3;

// A key transparent on the viewed layer is answered by the highest layer below
// that is on: the default layer, or a layer previewed under this one. The card
// reads the viewed layer's own key first, then what the answering key does, as
// the keyboard would run it — the same answer the board draws.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/panel.js").Layer[]} stack @param {number} index */
function seenThrough(model, stack, index) {
    const held = heldLayers();
    const answer = resolvedPositions(stack, state(), held).find((entry) => entry.position.layoutIndex === index);
    if (!answer?.fellThrough) return "";
    const from = answer.layer, position = answer.position;
    const sections = reachSections(model, from, position, index, combosShownAt(model, stack, state(), held, index));
    return `<div class="hc-through"><div class="hc-sect">
            <div class="hc-h">Falls through to ${marked(model, {kind: "layer", layer: from.index}, layerName(from))}</div>
            <div class="hc-flow"><span class="hc-name">${keyNameMarked(model, keyName(position), keyMeaning(position))}</span>
            <code class="hc-stored">${esc(visibleKeycode(model, position.keycode))}</code></div>${headline(model, keyMeaning(position))}
            ${held.length ? "" : `<div class="hc-sub hc-foot">With no layer previewed. ⌘-click a layer tab to see what answers while it is held.</div>`}</div>
        ${sections.join("")}</div>`;
}

// What one stored key reaches: its behaviour, macros, pointing mode and the
// combos on its layer at this position — or, for a key seen through a preview,
// the combos the board badges it with there. Empty when it reaches none of them.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/panel.js").Layer} layer @param {import("../../contracts/panel.js").Position} position @param {number} index @param {import("../../contracts/panel.js").ComboView[]} [combos] @param {{foot?: boolean}} [options] */
function reachSections(model, layer, position, index,
    combos = combosAt(model, model?.layers || [], layer?.index ?? 0, index), {foot = true} = {}) {
    const behaviour = behaviourFor(model, keyMeaning(position));
    const macros = macroKeycodes(keyMeaning(position));
    const slot = pointingSlotFor(model, keyMeaning(position));
    const lit = stageEnabled(model, "key");
    const sections = [];
    const custom = customOf(model, keyMeaning(position));
    const role = dualRole(model, position);
    // A row that changes nothing says so, and why, in place of its details
    // (firmware D-F27 "Rows without steps"; the host judges it).
    const inert = Boolean(behaviour?.changesNothing);
    const inertNote = behaviour && inert ? `Its behaviour changes nothing: ${behaviourHasTiming(behaviour)
        ? "on this key a timing does nothing without a branch" : "it has no branches or timing of its own"}, so the key runs as if it had none.` : "";
    const branchless = Boolean(behaviour) && !behaviour?.steps?.length;
    // The keyboard decides every key's tap or hold, with or without a row
    // (firmware D-F27), so the card says only whether this key's row runs
    // here, and why not.
    const use = "row" in position
        ? behaviourRuns(model, layer?.index ?? 0, /** @type {{row: number, column: number}} */ (/** @type {unknown} */ (position)), behaviour)
        : {runs: Boolean(behaviour), reasons: []};
    const runs = use.runs;
    if (role) {
        // A row that does not run is ignored, its own threshold with it: the
        // key waits its default, the dual-role threshold.
        const fallback = behaviourEditorRow(model, keyMeaning(position))?.timingDefaults?.tapHoldTerm ?? model?.behaviorTimingDefaults?.tappingTerm;
        const term = runs && behaviour ? behaviourThresholds(model, behaviour).tapHoldTerm : {ms: fallback === undefined ? "" : String(fallback)};
        const hold = "layer" in role.hold
            ? marked(model, {kind: "layer", layer: role.hold.layer}, role.hold.name)
            : esc(role.hold.modifier);
        const note = inertNote || (behaviour && !runs ? `Its behaviour row is not used here (${use.reasons.join("; ")}), so the key keeps this tap and hold.` : "");
        sections.push(`<div class="hc-sect"><div class="hc-h">Tap / hold</div>
            <div class="hc-sub">tap / hold ${esc(threshold(term))}</div>
            <div class="hc-act"><span class="hc-stage">Tap</span><span><span class="hc-name">${esc(role.tap)}</span></span></div>
            <div class="hc-act"><span class="hc-stage">Hold</span><span><span class="hc-name">${hold}</span></span></div>
            ${note ? `<div class="hc-sub hc-foot hc-quiet">${esc(note)}</div>` : ""}</div>`);
    } else if (inert) {
        sections.push(`<div class="hc-sect"><div class="hc-sub hc-quiet">${esc(inertNote)}</div></div>`);
    }
    if (behaviour && !(role && branchless) && !(inert && !role)) {
        const terms = behaviourThresholds(model, behaviour);
        const branches = (behaviour.steps || []).map((step) => {
            /** @type {[import("../../contracts/edits.js").Tier, string, import("../../contracts/panel.js").Branch | undefined][]} */
            const tiers = [["tap", tierName(model, "tap"), step.tap], ["hold", tierName(model, "hold"), step.hold], ["long", tierName(model, "long"), step.longHold]];
            const rows = tiers
                .map(([kind, name, branch]) => branch ? `<div class="hc-act"><span class="hc-stage">${tierDot(model, kind)}${esc(name)}</span>
                    <span>${sends(model, branch.action) || named(model, branch.action)}
                    ${under(described(sendsKind(model, branch.action) || customKeyShortcutOnly(customOf(model, branch.action)), kind === "tap" ? "" : helperAt(kind, branch, terms)))}</span></div>` : "").join("");
            return `<div class="hc-branch">${branchBadge(model, step.tapCount + 1, "hc-n")}<div>${rows}</div></div>`;
        }).join("");
        const count = behaviour.steps.length;
        sections.push(`<div class="hc-sect"><div class="hc-h">Key behaviour</div>
            <div class="hc-sub">${[count ? `${count} branch${count === 1 ? "" : "es"}` : "No branches yet",
                ...terms.used.map((name) => `${TERM_WORDS[name]} ${threshold(terms[name])}`),
                ...(behaviour.keepsAutoMouseAnchored ? ["keeps auto-mouse anchored"] : [])].map(esc).join(" · ")}</div>
            ${!role && !runs ? `<div class="hc-sub hc-quiet">${esc(`Not used here (${use.reasons.join("; ")}): `)}${custom
                ? esc(customKeyShortcutOnly(custom)) : `sends ${keyNameMarked(model, keyName(position), keyMeaning(position))} directly`}.</div>` : ""}
            ${branches}
            ${count && foot ? `<div class="hc-sub hc-foot">${lit
                ? "Each dot is the colour this key flashes when that tier resolves."
                : "Key feedback is off, so no tier flashes on the keyboard."}</div>` : ""}</div>`);
    }
    if (macros.length) {
        const slots = model?.viaMacros || [];
        sections.push(`<div class="hc-sect"><div class="hc-h">Macro</div>${macros.map((keycode) => {
            const macro = slots.find((row) => row.keycode === keycode);
            if (!macro) return `<div class="hc-sub">${esc(keycode)} · not reported by the keyboard</div>`;
            if (!macro.payload) return `<div class="hc-sub">${esc(macro.name || keycode)} · empty</div>`;
            return macroSteps(model, macro.payload);
        }).join("")}</div>`);
    }
    if (slot) {
        const row = pdColourRow(model, slot.id);
        sections.push(`<div class="hc-sect"><div class="hc-h">Pointing mode</div>
            <div class="hc-flow">${mark(model, {kind: "pointing", slot: slot.id})}
            <span>${esc(slot.displayName || `Slot ${slot.id}`)}</span>
            <span class="hc-life">${slot.kind === KIND.SCROLLING ? "scrolling" : slot.kind ? "directional" : "empty slot"}</span></div>
            <div class="hc-sub hc-foot">${slot.kind
                ? `Its colour paints ${esc(localityText(row?.locality))} while the mode runs.`
                : "This slot is empty, so the key does nothing until it is configured. The keyboard keeps the keycode either way."}</div></div>`);
    }
    if (combos.length) {
        // What a combo sends leads; the keys that press it follow, with this
        // key marked among them.
        const running = new Set(comboBehaviours(model, combos, layer?.index ?? 0).flatMap((run) => run.badges));
        sections.push(`<div class="hc-sect"><div class="hc-h">Combos · ${combos.length}</div>${combos.map((combo) => {
            const inputs = combo.inputs || [];
            const shown = combo.outputDisplay || combo.output;
            const stored = visibleKeycode(model, combo.output);
            // Named as a branch action is, with the layer it reaches marked.
            const sent = sends(model, combo.output) || `<span class="hc-name">${comboOutputMarked(model, combo)}</span>${stored && stored !== shown ? `<code class="hc-stored">${esc(stored)}</code>` : ""}`;
            return `<div class="hc-combo">${comboBadge(getModel(), combo.badge || "C")}
            <span class="hc-sends"><span class="hc-life">→</span>${sent}<span class="hc-life hc-count">${inputs.length} key${inputs.length === 1 ? "" : "s"}</span>${running.has(combo.badge) ? `<span class="hc-life hc-runs">runs its behaviour</span>`
                : customOf(model, combo.output) ? `<span class="hc-life hc-runs">${esc(customKeyShortcutOnly(customOf(model, combo.output)))}</span>` : ""}</span>
            <span class="hc-keys">${inputs.map((input, at) => `<span class="hc-key${comboInputIsKey(combo, at, position) ? " here" : ""}">${keyNameMarked(model, combo.inputDisplays?.[at] ?? input, input)}</span>`).join('<span class="hc-life">+</span>')}</span></div>`;
        }).join("")}</div>`);
    }
    return sections;
}

// The custom key a keycode is, under any of its names or the bare hex a
// combo stores, and what it sends, in the card's header (firmware D-F26).
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} keycode */
const customOf = (model, keycode) => customKeyOf(model, canonicalKeycode(model, keycode)) ?? customKeyOf(model, visibleKeycode(model, keycode));
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} keycode */
const headline = (model, keycode) => {
    const text = customKeyHeadline(customOf(model, keycode));
    return text ? `<div class="hc-sub hc-foot${text === "No shortcut" ? " hc-quiet" : ""}">${esc(text)}</div>` : "";
};
// A branch action as everything else in the card names one: its words, with
// the layer it reaches marked, then the keycode it stores where that adds.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} action */
const named = (model, action) => {
    const {words, stored} = actionNaming(model, action);
    return `<span class="hc-name">${keyNameMarked(model, words, action)}</span>${stored ? ` <code class="hc-stored">${esc(stored)}</code>` : ""}`;
};
/** @param {string} text */
const under = (text) => text ? `<span class="hc-life hc-under">${esc(text)}</span>` : "";
/** @param {import("../../contracts/edits.js").Tier} kind @param {string | undefined} helper */
const helperText = (kind, helper) => helperWord(getModel(), kind, helper ?? "");
// How a hold tier runs, with the threshold it waits for or the rate it repeats at.
/** @param {import("../../contracts/edits.js").Tier} kind @param {import("../../contracts/panel.js").Branch} branch @param {ReturnType<typeof behaviourThresholds>} terms */
const helperAt = (kind, branch, terms) => {
    const detail = helperDetail(kind, branch, terms);
    return detail ? `${helperText(kind, branch.helper)} (${detail})` : helperText(kind, branch.helper);
};
// The Behaviours editor's own words for each threshold.
const TERM_WORDS = {tapHoldTerm: "tap / hold", longerHoldTerm: "long hold", multiTapTerm: "multi tap window"};
// A threshold as the keyboard runs it: its own time or the keyboard's default.
/** @param {{ms: string}} term */
const threshold = (term) => term.ms === "" ? "keyboard default" : `${term.ms} ms`;
/** @param {string} what @param {string} how */
const described = (what, how) => [what, how].filter(Boolean).join(" · ");


// Where a colour paints, in the vocabulary's words, read inside a sentence.
/** @param {string | undefined} locality */
const localityText = (locality) => locality ? word(vocabulary(getModel()).localities, locality).toLowerCase() : "its locality";

// The card is drawn for whichever layer the screen is showing.
let layerIndex = () => 0;
/** @param {() => number} fn */
export const bindLayerIndex = (fn) => { layerIndex = fn; };
const state = () => layerIndex();
