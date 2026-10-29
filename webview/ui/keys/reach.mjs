// @ts-check
/**
 * @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model
 */
// What this layer reaches: the keys the board rings for the picked row, and
// the "Reached by" words every reach table shares.

import {esc} from "../../lib/dom.mjs";
import {actionLabel, keyMeaning, keyName} from "../../view/keyface.mjs";
import {customKeyNamesOf, macroNamesOf, placementsOf, reachInView, reachText} from "../../view/reach.mjs";
import {behaviourRouteKeys} from "../../view/behaviour-reach.mjs";
import {pointingReachInView, pointingSlotFor} from "../../view/pointing-reach.mjs";
import {customKeyOf, shortcutLayerList, shortcutLayerTag} from "../../view/custom-key.mjs";
import {resolvedPositions} from "../../view/layer-resolution.mjs";
import {getModel, heldLayers, layers, render, state} from "../../store.mjs";
import {pickedReachKeys, placementChips, placementOpening, setReachGroupOpen} from "../../view/reach-groups.mjs";
import {layerSwatch} from "../layerbar.mjs";
import {actionMarked, comboBadge, comboInputsMarked, keyNameMarked, layerTagged, marked} from "../marks.mjs";
import {tierName, layerCalled} from "../../view/vocabulary.mjs";
import {behaviourRoute} from "./behaviour-selection.mjs";

// The keys the board rings: the ones that reach whatever row is picked in the
// open tab. A behaviour is found on the keys carrying it; anything a branch
// sends is found on the same keys, which is the whole point of saying so.
/** @param {Model} model */
export function reachHighlight(model) {
    if (state.tab === "behaviours") return behaviourRouteKeys(model, layers(), state.layer, state.behaviourRow || "", behaviourRoute(), heldLayers());
    return pickedReachKeys(model, layers(), state.layer, heldLayers(), state.tab, state.reachRow[/** @type {keyof typeof state.reachRow} */ (state.tab)]);
}

// The layers a macro or custom key is placed on, each a chip in its layer
// colour naming how it is reached there, "" where it is placed nowhere; a
// click shows that layer in its Keymap tab (showPlacements).
/** @param {Model} model @param {"macros" | "customKeys"} tab @param {string} keycode */
export const placementChipsMarkup = (model, tab, keycode) => placementChips(placementsOf(model, layers(), tab, keycode)).map(({layer, at, how}) => {
    const swatch = layerSwatch(model, layer);
    return `<button class="layer-chip link" data-goto-layer="${esc(at)}"
            data-tip="${esc(swatch.tip)} · reached by ${esc(how)} · show on the board">${swatch.html}
            <span>${esc(layerCalled(layer))}</span><span class="idx">${esc(how)}</span></button>`;
}).join("");

// Each placement chip in `node` opens Keymap on its layer, in the tab for
// what is placed, on the row of the route that reaches it there, its first
// key picked.
/** @param {ParentNode} node @param {"macros" | "customKeys"} tab @param {string} keycode */
export const showPlacements = (node, tab, keycode) => /** @type {NodeListOf<HTMLElement>} */ (node.querySelectorAll("[data-goto-layer]"))
    .forEach((button) => button.addEventListener("click", () => openPlacement(tab, keycode, Number(button.dataset.gotoLayer))));
/** @param {"macros" | "customKeys"} tab @param {string} keycode @param {number} at */
function openPlacement(tab, keycode, at) {
    const opening = placementOpening(placementsOf(getModel(), layers(), tab, keycode), keycode, at);
    if (!opening) return;
    Object.assign(state, {screen: "keys", tab, layer: opening.layer, placement: null});
    if (opening.selected !== undefined) state.selected = opening.selected;
    state.reachRow[tab] = opening.row;
    state.reachGroups = setReachGroupOpen(state.reachGroups, opening.group, true);
    render();
}

/** @param {Model} model */
export const macroView = (model) => reachInView(model, layers(), state.layer, heldLayers(), macroNamesOf(model));
/** @param {Model} model */
export const customKeyView = (model) => reachInView(model, layers(), state.layer, heldLayers(), customKeyNamesOf(model));
/** @param {Model} model */
export const pointingView = (model) => pointingReachInView(model, layers(), state.layer, heldLayers());

// Where a reach came from, in the words of the thing that reaches it. A
// transparent key can be answered by more than one layer, so each is named —
// the default layer always answers, any other only while it is held too.
/** @param {{layer: import("../../../contracts/panel.js").Layer | null, whileHeld?: boolean}} entry */
export const sourceLabel = (entry) =>
    esc(layerCalled(entry.layer)) + (entry.whileHeld ? " when held" : "");

// The keys are named as the board names them; a combo's row already names
// its inputs, so it says only where they come from (reachText).
// A key whose own behaviour also reaches the row says which of its cells
// does, after its name (`branches`), rather than naming the key twice.
/** @param {(ReturnType<typeof resolvedPositions>[number] & {reference?: boolean})[]} keys @param {{names?: boolean, branches?: (keycode: string) => string}} [options] */
export const keysReach = (keys, {names = true, branches} = {}) => {
    const model = getModel();
    const named = names ? [...new Set(keys.map((entry) => keyNameMarked(model, keyName(entry.position, model), keyMeaning(entry.position))
        + (branches?.(keyMeaning(entry.position)) || "")))] : [];
    const sources = [...new Set(keys.filter((entry) => entry.fellThrough).map(sourceLabel))];
    const matched = [...new Set(keys.filter((entry) => entry.reference).map((entry) => esc(layerCalled(entry.layer))))];
    return reachText({named, sources, matched}, {names});
};
// A behaviour that only answers through a transparent key still fires its
// branches, so it belongs here — named with the layer that holds it, because
// that is the part this layer does not store.
// A branch names the behaviour it comes from, the cell that fires (key, then
// cell, as a key's own behaviour reads), and what it sends — but only when that
// differs from what the row is already titled with. A macro row is
// its own macro, so repeating it would be noise; a pointing mode is a slot, and
// which of its two keycodes a branch sends is the whole point.
// A key named in a reach reads as it does in the table's first column: its
// name, with the keycode beside it when the two differ.
/** @param {Model} model @param {string} keycode */
const namedKey = (model, keycode) => {
    const label = actionLabel(model, keycode);
    return label === String(keycode) ? esc(label) : `${actionMarked(model, keycode, label)} <code class="dim">${esc(keycode)}</code>`;
};
// The cells a branch sits in, as Review and the grid head them: the branch's
// badge, the tier's dot and the tier's name, "2× ● hold". Any of them sends it, so
// several read "1× ● long hold or 2× ● hold".
/** @param {Model} model @param {import("../../view/keyface-types.js").BranchCell[]} cells */
const cellsMarked = (model, cells) => cells
    .map((cell) => marked(model, {kind: "tier", ...cell}, tierName(model, cell.tier).toLowerCase())).join(" or ");
/** @param {Model} model @param {ReturnType<typeof reachInView>[number]} entry @param {{action: string}} route @param {boolean} showSends */
const sendsOf = (model, entry, route, showSends) => showSends && route.action && String(entry.name) !== String(route.action)
    ? `sends ${namedKey(model, route.action)}` : "";
/** @param {Model} model @param {ReturnType<typeof reachInView>[number]} entry */
const branchReach = (model, entry, showSends = true) => entry.behaviours.map((row) => {
    const sent = sendsOf(model, entry, row, showSends);
    return `from ${namedKey(model, row.keycode)} · ${cellsMarked(model, row.cells)}${sent ? ` ${sent}` : ""}`
        + (row.layer ? ` · on ${sourceLabel(row)}` : "");
}).join(", ");

// A combo is named by its badge and the keys chorded to fire it; one that
// fires a behaviour says so, since its branch is what sends the thing, and one
// that needs a transparent key names the layer answering for it.
/** @param {Model} model @param {ReturnType<typeof reachInView>[number]} entry */
export const comboReach = (model, entry, showSends = true) => entry.combos.map(({combo, via, action, keys, cells}) => {
    const sources = [...new Set(keys.filter((key) => key.fellThrough).map(sourceLabel))];
    const sent = sendsOf(model, entry, {action}, showSends);
    return `${comboBadge(model, combo.badge)} ${comboInputsMarked(model, combo)}`
        + (via ? ` · through ${namedKey(model, via)} · ${cellsMarked(model, cells)}${sent ? ` ${sent}` : ""}` : sent ? ` · ${sent}` : "")
        + (sources.length ? ` · on ${sources.join(", ")}` : "");
}).join(", ");

// Every way this layer reaches one thing, not only the way it was grouped by.
// A macro can sit on a key here *and* be fired from a behaviour's branch; the
// board rings both sets of keys, so the row has to name both or the two
// disagree about the same entry. A behaviour on one of those keys is that
// key's: "Dragscroll hold · 2× ● hold sends Dragscroll lock", the cell after
// the key, which is not named a second time. A cell sending what the key
// already sends adds nothing to it and is left out.
/** @param {Model} model @param {ReturnType<typeof reachInView>[number]} entry */
export const reachLabel = (model, entry, showSends = true) => {
    const onKeys = new Set((entry.keys || []).map((key) => keyMeaning(key.position)));
    const own = (entry.behaviours || []).filter((row) => onKeys.has(row.keycode));
    const apart = (entry.behaviours || []).filter((row) => !onKeys.has(row.keycode));
    /** @param {string} keycode */
    const branches = (keycode) => own.filter((row) => row.keycode === keycode).flatMap((row) => {
        const sent = sendsOf(model, entry, row, showSends);
        return sent ? [` · ${cellsMarked(model, row.cells)} ${sent}`] : [];
    }).join("");
    return [
        entry.keys?.length ? keysReach(entry.keys, {branches}) : "",
        apart.length ? branchReach(model, {...entry, behaviours: apart}, showSends) : "",
        entry.combos?.length ? comboReach(model, entry, showSends) : "",
    ].filter(Boolean).join(" · ");
};

// A pointing mode's Reached by, a line per route (the Pointing modes tab,
// whose rows often have several). Each route reads as on every reach tab: a
// key as the board names it, with its mark and tag ("▦ Navigation `HOLD`"),
// a behaviour's cell and a combo with what they send. A route that starts the
// mode by turning on a layer in its link (entry.startVia, view/pointing-reach.mjs)
// always says what it sends, since that is how it reaches the mode: a key by
// startsThrough, a cell or combo by its keycode ("sends ▦ Navigation `HOLD`").
// One sending the mode's own keycodes says what it sends only when the row has
// both (`showSends`). A cell of a key's own behaviour that does what the key
// already does adds nothing and is left out. A layer starting the mode itself
// is the last line: "turning on ▦ Navigation".
/** @param {Model} model @param {ReturnType<typeof reachInView>[number]} entry @param {boolean} showSends */
export function pointingReachLines(model, entry, showSends) {
    const keys = entry.keys || [], rows = entry.behaviours || [], combos = entry.combos || [];
    const onKeys = new Set(keys.map((key) => keyMeaning(key.position)));
    /** @param {string} keycode */
    const startsOf = (keycode) => entry.startVia?.[keycode] ?? 0;
    /** @param {string} action */
    const says = (action) => showSends || startsOf(action) !== 0;
    /** @param {string} keycode */
    const branches = (keycode) => {
        const self = startsOf(keycode);
        return (self ? startsThrough(model, keycode, self) : "") + rows.filter((row) => row.keycode === keycode && !(self && startsOf(row.action) === self)).flatMap((row) => {
            const sent = sendsOf(model, entry, row, says(row.action));
            return sent ? [` · ${cellsMarked(model, row.cells)} ${sent}`] : [];
        }).join("");
    };
    return [...new Set([
        ...keys.map((key) => keysReach([key], {branches})),
        ...rows.filter((row) => !onKeys.has(row.keycode)).map((row) => branchReach(model, {...entry, behaviours: [row]}, says(row.action))),
        ...combos.map((route) => comboReach(model, {...entry, combos: [route]}, says(route.action))),
        entry.starts?.length ? `turning on ${layersNamed(model, entry.starts)}` : "",
    ].filter(Boolean))];
}

// What a key that starts a mode does on the way, after its name, for the
// layers of `mask` that start it: a custom key sends its shortcut layers,
// tagged with their kind as its hover card tags them; a pointing-mode key
// turns on the layers of its link. A layer key's own name says its layer.
/** @param {Model} model @param {string} keycode @param {number} mask */
function startsThrough(model, keycode, mask) {
    const custom = customKeyOf(model, keycode);
    if (custom) return ` · sends ${shortcutLayerList(custom).filter((at) => mask & 2 ** at).map((at) =>
        layerTagged(model, at, layerCalled(layersOfMask(2 ** at)[0] || null), [shortcutLayerTag(model, custom)], {inline: true})).join(", ")}`;
    if (pointingSlotFor(model, keycode)) return ` · turns on ${layersNamed(model, layersOfMask(mask))}`;
    return "";
}

// The layers of a mask, bit n layer n, in the tab order.
/** @param {number} mask */
export const layersOfMask = (mask) => layers().filter((layer) => mask & 2 ** layer.index);

// Layers by their marks, as the Pointing modes tab names a link's layers.
/** @param {Model} model @param {import("../../../contracts/panel.js").Layer[]} list */
export const layersNamed = (model, list) =>
    list.map((layer) => marked(model, {kind: "layer", layer: layer.index}, layerCalled(layer))).join(", ");
