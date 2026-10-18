// @ts-check
// The board's hover card: everything a key reaches, without clicking and
// without leaving the layer you are reading.

// Selector assertions refer to elements created by this module's authored markup.
import {el, esc} from "../lib/dom.mjs";
import {behaviourFor, canonicalKeycode, keyMeaning, keyName, visibleKeycode} from "../view/keyface.mjs";
import {comboBehaviours, comboInputIsKey, combosAt, combosShownAt} from "../view/combo-reach.mjs";
import {customKeyHeadline, customKeyOf, customKeyShortcutOnly} from "../view/custom-key.mjs";
import {macroKeycodes, pointingSlotFor} from "../view/reach.mjs";
import {keyHandling} from "../view/participation.mjs";
import {resolvedPositions} from "../view/layer-resolution.mjs";
import {pdColourRow} from "../view/lighting.mjs";
import {getModel, heldLayers, layerName, positionAt} from "../store.mjs";
import {keySummary, timingWords} from "../view/key-summary.mjs";
import {partHtml} from "./keys/summary.mjs";
import {comboBadge, comboOutputMarked, comboTint, keycodeMark, keyNameMarked, macroSteps, mark, marked, sends} from "./marks.mjs";
import {vocabulary, word} from "../view/vocabulary.mjs";
import {KIND} from "../view/pointing-config.mjs";
import {coldHover, hoverClosed, hoverShown, hoverWait} from "../view/hover-timing.mjs";

const tip = el(`<div class="tip" hidden></div>`);
const card = el(`<div class="hovercard" hidden></div>`);
// The behaviours the key's combos run, each in its own card beside the key's.
const side = el(`<div class="hovercard-side" hidden></div>`);
let timer = 0;
// The first card waits; then cards swap at once while the board is warm
// (view/hover-timing.mjs).
let clock = coldHover();

// A key's card, for the pointer over it or the keyboard focus on it.
/** @param {Element} key */
function showKey(key) {
    clearTimeout(timer);
    tip.hidden = true;
    const open = () => {
        if (!key.isConnected) return;
        const rect = key.getBoundingClientRect();
        // A key the layer has no position for has nothing to show. On a board
        // that shows light (Lighting), the card says what paints the LED.
        const light = Boolean(key.closest('[data-hover="light"]'));
        card.innerHTML = light ? lightCard(Number(/** @type {HTMLElement} */ (key).dataset.key)) : keyCard(Number(/** @type {HTMLElement} */ (key).dataset.key));
        if (!card.innerHTML) { hideHover(); return; }
        place(card, rect, 14, true);
        side.innerHTML = light ? "" : behaviourCards(Number(/** @type {HTMLElement} */ (key).dataset.key)); placeSide(rect);
        clock = hoverShown(clock);
    };
    const wait = hoverWait(clock, performance.now());
    if (wait) timer = setTimeout(open, wait);
    else open();
}

function closeCard() {
    if (!card.hidden) clock = hoverClosed(clock, performance.now());
    card.hidden = true; side.hidden = true;
}

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
            showKey(key);
            return;
        }
        closeCard();
        if (hinted) {
            const rect = hinted.getBoundingClientRect();
            timer = setTimeout(() => { tip.textContent = hinted.dataset.tip ?? ""; place(tip, rect, 8); }, 260);
            return;
        }
        tip.hidden = true;
    }, true);
    // The keyboard reads a key the same way: its card opens on focus.
    root.addEventListener("focusin", (event) => {
        const key = event.target instanceof Element && event.target.matches(":focus-visible") ? event.target.closest("[data-key]") : null;
        if (key) showKey(key);
    });
    root.addEventListener("focusout", (event) => {
        if (event.target instanceof Element && event.target.closest("[data-key]")) hideHover();
    });
    root.addEventListener("mouseleave", hideHover, true);
    addEventListener("scroll", hideHover, true);
}

// Escape, a redraw, a scroll or leaving the board closes the card.
export function hideHover() { clearTimeout(timer); tip.hidden = true; closeCard(); }

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


// The key's card (decisions §2 hover card): its name, one sentence of what it
// does, its Tap / Hold / Long hold with transparency resolved, one timing line
// naming where each value comes from, the costs a person feels when they are
// true, its macro and trackball mode, and up to three combos. Keycodes only
// with Show keycodes; no footer.
/** @param {number} index */
function keyCard(index) {
    const model = getModel();
    const stack = model?.layers || [];
    const layer = stack[state()] || stack[0];
    const position = positionAt(layer, index);
    if (!position) return "";
    const held = heldLayers();
    const answer = resolvedPositions(stack, state(), held).find((entry) => entry.position.layoutIndex === index);
    const through = answer?.fellThrough ? answer : null;
    const summary = keySummary(model, position, {stack, at: state(), held});
    const warn = summary.danger || (summary.inert ? "Not in this firmware: this key does nothing." : "");
    const head = `<div class="hc-head"><div class="hc-title"><span class="t">${keyNameMarked(model, keyName(position), keyMeaning(position))}</span>
        ${warn ? `<span class="hc-warn" aria-label="Warning">⚠</span>` : ""}</div>
        ${keycodeMark("hover", visibleKeycode(model, position.keycode), keyName(position), "hc-code")}
        ${sentence(model, position, summary)}${headline(model, keyMeaning(position))}
        ${warn ? `<div class="hc-sub hc-foot hc-warn">${esc(warn)}</div>` : ""}</div>`;
    if (summary.kind === "transparent") {
        if (!through) return `${head}<div class="hc-sect"><div class="hc-sub hc-quiet">Transparent: nothing answers below it.</div></div>`;
        const below = through.position;
        const belowSummary = keySummary(model, below, {stack, at: stack.indexOf(through.layer), held});
        return `${head}<div class="hc-through"><div class="hc-sect">
            <div class="hc-h">Transparent → ${keyNameMarked(model, keyName(below), keyMeaning(below))} from ${marked(model, {kind: "layer", layer: through.layer.index}, layerName(through.layer))}</div>
            ${keycodeMark("hover", visibleKeycode(model, below.keycode), keyName(below), "hc-stored")}${sentence(model, below, belowSummary)}${headline(model, keyMeaning(below))}</div>
            ${reachSections(model, through.layer, below, index, belowSummary, combosShownAt(model, stack, state(), held, index)).join("")}</div>`;
    }
    return `${head}${reachSections(model, layer, position, index, summary).join("")}`;
}

// A layer key's sentence: "Hold ■ Number: on while held".
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/panel.js").Position} position @param {ReturnType<typeof keySummary>} summary */
const sentence = (model, position, summary) => summary.kind === "layer" && summary.effect
    ? `<div class="hc-sub hc-foot">${keyNameMarked(model, keyName(position), keyMeaning(position))}: ${esc(summary.effect)}.</div>` : "";

// One card per behaviour the key's combos run, as the key that behaviour
// belongs to would show it, naming the combos that run it. Three at most;
// shown beside the picked key's card only (a click), never on a sweep.
/** @param {number} index */
function behaviourCards(index) {
    const model = getModel();
    const stack = model?.layers || [];
    const layer = stack[state()] || stack[0];
    if (!positionAt(layer, index) || index !== selectedIndex()) return "";
    const runs = comboBehaviours(model, combosAt(model, stack, layer?.index ?? 0, index), layer?.index ?? 0);
    const tint = comboTint(model);
    const cards = runs.slice(0, SIDE_CARDS).map((run) => {
        const target = /** @type {import("../../contracts/panel.js").Position} */ ({keycode: run.output, semantic: run.keycode, layoutIndex: -1});
        const summary = keySummary(model, target, {stack, at: state(), held: heldLayers()});
        return `<div class="hovercard hc-side"${tint ? ` style="--combo:${tint}"` : ""}><div class="hc-head"><div class="hc-eyebrow">Combo behaviour</div><div class="hc-title"><span class="t">${keyNameMarked(model, run.shown, run.keycode)}</span>
            <span class="hc-badges">${run.badges.map((badge) => comboBadge(model, badge)).join("")}</span></div>
            ${keycodeMark("hover", visibleKeycode(model, run.output), run.shown, "hc-code")}${headline(model, run.keycode)}
            <div class="hc-sub hc-foot">Runs when ${esc(run.badges.join(" or "))} fires.</div></div>${reachSections(model, layer, target, -1, summary, []).join("")}</div>`;
    });
    if (runs.length > SIDE_CARDS) cards.push(`<div class="hc-more">+${runs.length - SIDE_CARDS} more behaviour${runs.length - SIDE_CARDS === 1 ? "" : "s"} run by this key's combos</div>`);
    return cards.join("");
}
const SIDE_CARDS = 3;
const COMBO_ROWS = 3;

// What one stored key does and reaches: its tap / hold block, its macro, its
// trackball mode and the combos on its layer at this position — or, for a key
// seen through a preview, the combos the board badges it with there.
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/panel.js").Layer} layer @param {import("../../contracts/panel.js").Position} position @param {number} index @param {ReturnType<typeof keySummary>} summary @param {import("../../contracts/panel.js").ComboView[]} [combos] */
function reachSections(model, layer, position, index, summary,
    combos = combosAt(model, model?.layers || [], layer?.index ?? 0, index)) {
    const behaviour = behaviourFor(model, keyMeaning(position));
    const macros = macroKeycodes(keyMeaning(position));
    const slot = pointingSlotFor(model, keyMeaning(position));
    const sections = [];
    const custom = customOf(model, keyMeaning(position));
    // Any behaviour row the keyboard runs here hands the key to its own key
    // engine; without one, QMK handles the key (firmware D-F02). Said until
    // the firmware's single tap-hold engine lands (feature bit 31).
    const handling = "row" in position
        ? keyHandling(model, layer?.index ?? 0, /** @type {{row: number, column: number}} */ (/** @type {unknown} */ (position)), behaviour)
        : {by: behaviour ? "keyboard" : "qmk", reasons: []};
    const byKeyboard = handling.by === "keyboard";
    if (summary.parts.length) {
        const rows = summary.parts.map((part) => `<div class="hc-act"><span class="hc-stage">${esc(part.lead)}</span><span>${partHtml(model, part, {lead: false})}</span></div>`).join("");
        const timing = timingWords(summary.timing);
        const decides = summary.timing.length ? `decided by ${byKeyboard ? "the keyboard" : "QMK"}` : "";
        const off = behaviour && !byKeyboard ? `Off here (${handling.reasons.join("; ")}): ${custom ? esc(customKeyShortcutOnly(custom))
            : `sends ${keyNameMarked(model, keyName(position), keyMeaning(position))} directly`}.` : "";
        sections.push(`<div class="hc-sect">${rows}
            ${timing || decides ? `<div class="hc-sub hc-foot">${esc([timing, decides].filter(Boolean).join(" · "))}</div>` : ""}
            ${summary.costs.map((line) => `<div class="hc-sub hc-quiet">${esc(line)}</div>`).join("")}
            ${off ? `<div class="hc-sub hc-quiet">${off}</div>` : ""}</div>`);
    }
    if (macros.length) {
        const slots = model?.viaMacros || [];
        sections.push(`<div class="hc-sect"><div class="hc-h">Macro</div>${macros.map((keycode) => {
            const macro = slots.find((row) => row.keycode === keycode);
            const number = keycode.split("_").at(-1);
            if (!macro) return `<div class="hc-sub">M${esc(number)} · not reported by the keyboard</div>`;
            if (!macro.payload) return `<div class="hc-sub">${esc(macro.name || `Macro ${number}`)} · empty</div>`;
            return macroSteps(model, macro.payload);
        }).join("")}</div>`);
    }
    if (slot) {
        const row = pdColourRow(model, slot.id);
        sections.push(`<div class="hc-sect"><div class="hc-h">Trackball mode</div>
            <div class="hc-flow">${mark(model, {kind: "pointing", slot: slot.id})}
            <span>${esc(slot.displayName || `Mode ${slot.id}`)}</span>
            <span class="hc-life">${slot.kind === KIND.SCROLLING ? "scrolling" : slot.kind ? "directional" : "empty slot"}</span></div>
            <div class="hc-sub hc-foot">${slot.kind
                ? `Its colour paints ${esc(localityText(row?.locality))} while the mode runs, not this key.`
                : "This slot is empty, so the key does nothing until it is configured."}</div></div>`);
    }
    if (combos.length) {
        // A combo by what it sends and the keys that press it, this key
        // marked among them; at most three, then how many more.
        const running = new Set(comboBehaviours(model, combos, layer?.index ?? 0).flatMap((run) => run.badges));
        const shownCombos = combos.slice(0, COMBO_ROWS);
        sections.push(`<div class="hc-sect"><div class="hc-h">Combos</div>${shownCombos.map((combo) => {
            const inputs = combo.inputs || [];
            const shown = combo.outputDisplay || combo.output;
            const stored = visibleKeycode(model, combo.output);
            const sent = sends(model, combo.output) || `<span class="hc-name">${comboOutputMarked(model, combo)}</span>${keycodeMark("hover", stored, shown, "hc-stored")}`;
            return `<div class="hc-combo"><span class="hc-life">${esc(combo.badge || "")}</span>
            <span class="hc-sends"><span class="hc-life">→</span>${sent}${running.has(combo.badge) ? `<span class="hc-life hc-runs">runs its behaviour${index === selectedIndex() ? "" : " · click the key to see it"}</span>`
                : customOf(model, combo.output) ? `<span class="hc-life hc-runs">${esc(customKeyShortcutOnly(customOf(model, combo.output)))}</span>` : ""}</span>
            <span class="hc-keys">${inputs.map((input, at) => `<span class="hc-key${comboInputIsKey(combo, at, position) ? " here" : ""}">${keyNameMarked(model, combo.inputDisplays?.[at] ?? input, input)}</span>`).join('<span class="hc-life">+</span>')}</span></div>`;
        }).join("")}${combos.length > COMBO_ROWS ? `<div class="hc-sub hc-foot hc-quiet">+${combos.length - COMBO_ROWS} more on the Combos tab</div>` : ""}</div>`);
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
// Where a colour paints, in the vocabulary's words, read inside a sentence.
/** @param {string | undefined} locality */
const localityText = (locality) => locality ? word(vocabulary(getModel()).localities, locality).toLowerCase() : "where it lights";

// Lighting's card, about the light rather than the key (ui/lighting/light-card.mjs).
/** @type {(index: number) => string} */
let lightCard = () => "";
/** @param {(index: number) => string} fn */
export const bindLightCard = (fn) => { lightCard = fn; };

// The card is drawn for whichever layer the screen is showing; the picked
// key's card also shows the behaviours its combos run.
let layerIndex = () => 0;
let selectedIndex = () => -1;
/** @param {() => number} fn @param {() => number} [selected] */
export const bindLayerIndex = (fn, selected) => { layerIndex = fn; if (selected) selectedIndex = selected; };
const state = () => layerIndex();
