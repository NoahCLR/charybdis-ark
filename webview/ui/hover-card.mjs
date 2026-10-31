// @ts-check
// The board's hover card: everything a key reaches, without clicking and
// without leaving the layer you are reading. webview/ui/hover.mjs places it;
// what it reaches, and what its behaviour row says, is
// webview/view/key-reach.mjs's.

// Selector assertions refer to elements created by this module's authored markup.
import {esc} from "../lib/dom.mjs";
import {actionNaming, keyMeaning, keyName, visibleKeycode} from "../view/keyface.mjs";
import {comboBehaviours, comboInputIsKey} from "../view/combo-reach.mjs";
import {customKeyHeadline, customKeyOf, customKeyShortcutOnly, shortcutLayerList, shortcutLayerTag, shortcutLayerUnder, shortcutWhen} from "../view/custom-key.mjs";
import {behaviourThresholds, styleDetail} from "../view/behavior-editor.mjs";
import {keyReach, keyReachAt} from "../view/key-reach.mjs";
import {stageEnabled} from "../view/lighting.mjs";
import {currentView, getModel, positionAt} from "../store.mjs";
import {branchBadge, comboBadge, comboOutputMarked, comboTint, keyNameMarked, layerTagged, macroSteps, marked, sends, sendsKind, tierDot} from "./marks.mjs";
import {sentence, styleWord, tierName, vocabulary, layerCalled, macroNamed} from "../view/vocabulary.mjs";
import {modifierKey} from "../view/shortcuts.mjs";

// The card for the key at layout `index` on the layer the screen shows, "" for
// a key the layer has no position for.
/** @param {number} index */
export function hoverCard(index) {
    const model = getModel();
    const view = currentView();
    const reach = keyReachAt(view, index);
    if (!reach) return "";
    const {position} = reach;
    const own = reachSections(reach.own, position);
    return `<div class="hc-head"><div class="hc-title"><span class="t">${keyNameMarked(model, keyName(position, model), keyMeaning(position))}</span>
        <span class="hc-pill">index ${esc(index)}</span></div>
        <code class="hc-code">${esc(visibleKeycode(model, position.keycode))}</code>${headline(model, keyMeaning(position))}</div>${own.join("")}${seenThrough(view, reach)}`;
}

// One card per behaviour the key's combos run, as the key that behaviour
// belongs to would show it, naming the combos that run it. Three at most.
/** @param {number} index */
export function behaviourCards(index) {
    const model = getModel();
    const view = currentView().alone;
    const layer = view.layer;
    if (!layer || !positionAt(layer, index)) return "";
    const runs = comboBehaviours(model, view.combos.badgesAt(index), layer.index);
    const tint = comboTint(model);
    const cards = runs.slice(0, SIDE_CARDS).map((run) => {
        const target = /** @type {import("../../contracts/panel.js").Position} */ ({keycode: run.output, semantic: run.keycode, layoutIndex: -1});
        return `<div class="hovercard hc-side"${tint ? ` style="--combo:${tint}"` : ""}><div class="hc-head"><div class="hc-eyebrow">Combo behaviour</div><div class="hc-title"><span class="t">${keyNameMarked(model, run.shown, run.keycode)}</span>
            <span class="hc-badges">${run.badges.map((badge) => comboBadge(model, badge)).join("")}</span></div>
            <code class="hc-code">${esc(visibleKeycode(model, run.output))}</code>${headline(model, run.keycode)}
            <div class="hc-sub hc-foot">Runs when ${esc(run.badges.join(" or "))} fires.</div></div>${reachSections(keyReach(view, layer, target, -1, []), target, {foot: false}).join("")}</div>`;
    });
    if (runs.length > SIDE_CARDS) cards.push(`<div class="hc-more">+${runs.length - SIDE_CARDS} more behaviour${runs.length - SIDE_CARDS === 1 ? "" : "s"} run by this key's combos</div>`);
    return cards.join("");
}
const SIDE_CARDS = 3;

// A key transparent on the viewed layer is answered by the highest layer below
// that is on: the default layer, or a layer previewed under this one. The card
// reads the viewed layer's own key first, then what the answering key does, as
// the keyboard would run it — the same answer the board draws.
/** @param {import("../view/keyface-types.js").LayerView} view @param {NonNullable<ReturnType<typeof keyReachAt>>} reach */
function seenThrough(view, {answer, through}) {
    const model = getModel();
    if (!answer || !through) return "";
    const from = answer.layer, position = answer.position;
    const sections = reachSections(through, position);
    return `<div class="hc-through"><div class="hc-sect">
            <div class="hc-h">Falls through to ${marked(model, {kind: "layer", layer: from.index}, layerCalled(from))}</div>
            <div class="hc-flow"><span class="hc-name">${keyNameMarked(model, keyName(position, model), keyMeaning(position))}</span>
            <code class="hc-stored">${esc(visibleKeycode(model, position.keycode))}</code></div>${headline(model, keyMeaning(position))}
            ${view.previewing ? "" : `<div class="hc-sub hc-foot">With no layer previewed. ${modifierKey()}-click a layer tab to see what answers while it is held.</div>`}</div>
        ${sections.join("")}</div>`;
}

// What one stored key, `position`, reaches, as webview/view/key-reach.mjs
// keyReach decides it: its behaviour, macros, pointing mode and combos. Empty
// when it reaches none of them.
/** @param {ReturnType<typeof keyReach>} reach @param {import("../../contracts/panel.js").Position} position @param {{foot?: boolean}} [options] */
function reachSections(reach, position, {foot = true} = {}) {
    const model = getModel();
    const {behaviour, role, use, inertNote, lead, branches: showBranches, custom} = reach;
    const lit = stageEnabled(model, "key");
    const sections = [];
    if (reach.shortcut) sections.push(shortcutSection(model, reach.shortcut));
    if (lead?.kind === "tapHold" && role) {
        const layerHold = lead.holdAction ? sends(model, lead.holdAction) : "";
        const hold = layerHold || `<span class="hc-name">${"layer" in role.hold
            ? marked(model, {kind: "layer", layer: role.hold.layer}, role.hold.name) : esc(role.hold.modifier)}</span>`;
        sections.push(`<div class="hc-sect"><div class="hc-h">Tap / hold</div>
            <div class="hc-sub">tap / hold ${esc(threshold(lead.term))}</div>
            <div class="hc-act"><span class="hc-stage">Tap</span><span><span class="hc-name">${esc(role.tap)}</span></span></div>
            <div class="hc-act"><span class="hc-stage">Hold</span><span>${hold}</span></div>
            ${lead.note ? `<div class="hc-sub hc-foot hc-quiet">${esc(lead.note)}</div>` : ""}</div>`);
    } else if (lead?.kind === "off") {
        // A behaviour a switch keeps off is not there for this key: no
        // branches, no timing, no dots, only what the key sends instead.
        sections.push(`<div class="hc-sect hc-off"><div class="hc-h">Key behaviour not used</div>
            <div class="hc-sub">${esc(sentence(use.reasons.join("; ")))}.</div>
            <div class="hc-sub hc-foot hc-quiet">${custom ? esc(sentence(customKeyShortcutOnly(custom))) : `Sends ${keyNameMarked(model, keyName(position, model), keyMeaning(position))} directly`}.</div></div>`);
    } else if (lead?.kind === "inert") {
        sections.push(`<div class="hc-sect"><div class="hc-sub hc-quiet">${esc(inertNote)}</div></div>`);
    }
    if (behaviour && showBranches) {
        const terms = behaviourThresholds(model, behaviour);
        const branches = (behaviour.steps || []).map((step) => {
            /** @type {[import("../../contracts/edits.js").Tier, string, import("../../contracts/panel.js").Branch | undefined][]} */
            const tiers = [["tap", tierName(model, "tap"), step.tap], ["hold", tierName(model, "hold"), step.hold], ["long", tierName(model, "long"), step.longHold]];
            const rows = tiers
                .map(([kind, name, branch]) => branch ? `<div class="hc-act"><span class="hc-stage">${tierDot(model, kind)}${esc(name)}</span>
                    <span>${sends(model, branch.action) || named(model, branch.action)}
                    ${under(described(sendsKind(model, branch.action) || customKeyShortcutOnly(customKeyOf(model, branch.action)), kind === "tap" ? "" : helperAt(kind, branch, terms)))}</span></div>` : "").join("");
            return `<div class="hc-branch">${branchBadge(model, step.tapCount + 1, "hc-n")}<div>${rows}</div></div>`;
        }).join("");
        const count = behaviour.steps.length;
        sections.push(`<div class="hc-sect"><div class="hc-h">Key behaviour</div>
            <div class="hc-sub">${[count ? `${count} branch${count === 1 ? "" : "es"}` : "No branches yet",
                ...terms.used.map((name) => `${vocabulary(model).thresholds[name]} ${threshold(terms[name])}`),
                ...(behaviour.keepsAutoMouseAnchored ? ["keeps auto-mouse anchored"] : [])].map(esc).join(" · ")}</div>
            ${branches}
            ${count && foot ? `<div class="hc-sub hc-foot">${lit
                ? "Each dot is the colour this key flashes when that tier resolves."
                : "Key feedback is off, so no tier flashes on the keyboard."}</div>` : ""}</div>`);
    }
    if (reach.macros.length) {
        sections.push(`<div class="hc-sect"><div class="hc-h">Macro</div>${reach.macros.map(({keycode, slot}) => {
            if (!slot) return `<div class="hc-sub">${esc(keycode)} · not reported by the keyboard</div>`;
            if (!slot.payload) return `<div class="hc-sub">${esc(macroNamed(slot, keycode))} · empty</div>`;
            return macroSteps(model, slot.payload);
        }).join("")}</div>`);
    }
    if (reach.pointing) {
        const {kind, paints} = reach.pointing;
        sections.push(`<div class="hc-sect"><div class="hc-h">Pointing mode</div>
            <div class="hc-flow">${sends(model, keyMeaning(position))}
            ${kind ? `<span class="hc-life">${esc(kind)}</span>` : ""}</div>
            <div class="hc-sub hc-foot">${kind
                ? `Its colour paints ${esc(paints)} while the mode runs.`
                : "This slot is empty, so the key does nothing until it is configured. The keyboard keeps the keycode either way."}</div></div>`);
    }
    if (reach.combos.length) {
        // What a combo sends leads; the keys that press it follow, with this
        // key marked among them.
        sections.push(`<div class="hc-sect"><div class="hc-h">Combos · ${reach.combos.length}</div>${reach.combos.map(({combo, use, runs, sendsInstead}) => {
            const inputs = combo.inputs || [];
            const shown = combo.outputDisplay || combo.output;
            const stored = visibleKeycode(model, combo.output);
            // Named as a branch action is, with the layer it reaches marked.
            const sent = sends(model, combo.output) || `<span class="hc-name">${comboOutputMarked(model, combo)}</span>${stored && stored !== shown ? `<code class="hc-stored">${esc(stored)}</code>` : ""}`;
            return `<div class="hc-combo${use.fires ? "" : " hc-off"}">${comboBadge(getModel(), combo.badge || "C")}
            <span class="hc-sends"><span class="hc-life">→</span>${sent}<span class="hc-life hc-count">${inputs.length} key${inputs.length === 1 ? "" : "s"}</span>${runs ? `<span class="hc-life hc-runs">runs its behaviour</span>`
                : sendsInstead ? `<span class="hc-life hc-runs">${esc(sendsInstead)}</span>` : ""}</span>
            <span class="hc-keys">${inputs.map((input, at) => `<span class="hc-key${comboInputIsKey(combo, at, position) ? " here" : ""}">${keyNameMarked(model, combo.inputDisplays?.[at] ?? input, input)}</span>`).join('<span class="hc-life">+</span>')}</span>
            ${use.fires ? "" : `<span class="hc-sub hc-quiet">Not used: ${esc(use.reasons.join("; "))}.</span>`}</div>`;
        }).join("")}</div>`);
    }
    return sections;
}

// A custom key's shortcut as the behaviour rows draw what they send: its
// keys, then each layer it turns on, by mark and name, tagged with how it
// turns them on (firmware D-F26).
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {import("../../contracts/panel.js").CustomKey} custom */
function shortcutSection(model, custom) {
    const keys = custom.shortcutKeys || [];
    const layers = shortcutLayerList(custom);
    const rows = [];
    if (keys.length) rows.push(`<div class="hc-act"><span class="hc-stage">Sends</span>
        <span class="hc-keys">${keys.map((part) => `<span class="hc-key">${esc(part)}</span>`).join('<span class="hc-life">+</span>')}</span></div>`);
    if (layers.length) rows.push(`<div class="hc-act"><span class="hc-stage">Layers</span>
        <span class="hc-layers">${layers.map((at) => layerTagged(model, at, layerCalled(model?.layers?.[at]), [shortcutLayerTag(model, custom)])).join("")}
        ${under(shortcutLayerUnder(custom))}</span></div>`);
    return `<div class="hc-sect"><div class="hc-h">Shortcut</div><div class="hc-sub">${esc(shortcutWhen(custom))}</div>${rows.join("")}</div>`;
}

// What the custom key a keycode is sends, in the card's header (firmware
// D-F26).
/** @param {import("../../contracts/panel.js").PublishedModel | null} model @param {string} keycode */
const headline = (model, keycode) => {
    const headline = customKeyHeadline(customKeyOf(model, keycode));
    return headline ? `<div class="hc-sub hc-foot${headline.quiet ? " hc-quiet" : ""}">${esc(headline.text)}</div>` : "";
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
/** @param {import("../../contracts/edits.js").Tier} kind @param {string | undefined} style */
const styleText = (kind, style) => styleWord(getModel(), kind, style ?? "");
// How a hold tier runs, with the threshold it waits for or the rate it repeats at.
/** @param {import("../../contracts/edits.js").Tier} kind @param {import("../../contracts/panel.js").Branch} branch @param {ReturnType<typeof behaviourThresholds>} terms */
const helperAt = (kind, branch, terms) => {
    const detail = styleDetail(kind, branch, terms);
    return detail ? `${styleText(kind, branch.style)} (${detail})` : styleText(kind, branch.style);
};
// A threshold as the keyboard runs it: its own time or the keyboard's default.
/** @param {{ms: string}} term */
const threshold = (term) => term.ms === "" ? "keyboard default" : `${term.ms} ms`;
/** @param {string} what @param {string} how */
const described = (what, how) => [what, how].filter(Boolean).join(" · ");
