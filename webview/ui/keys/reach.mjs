// @ts-check
/**
 * @typedef {import("../../../contracts/panel.js").PublishedModel | null} Model
 */
// What this layer reaches: the keys the board rings for the picked row, the
// tab counts, and the "Reached by" words every reach table shares.

import {esc} from "../../lib/dom.mjs";
import {actionLabel, keyMeaning, keyName} from "../../view/keyface.mjs";
import {behaviourRouteKeys, customKeyKeycodes, macroKeycodes, macroReach, pointingReach, pointingSlotFor, reachInView, reachKeys, reachText} from "../../view/reach.mjs";
import {customKeyReach} from "../../view/custom-key.mjs";
import {comboGroups, combosInView} from "../../view/combo-reach.mjs";
import {resolvedPositions} from "../../view/layer-resolution.mjs";
import {getModel, heldLayers, layerName, layers, state} from "../../store.mjs";
import {reachEntries} from "../../view/reach-groups.mjs";
import {actionMarked, comboBadge, comboInputsMarked, keyNameMarked, marked} from "../marks.mjs";
import {tierName} from "../../view/vocabulary.mjs";
import {behaviourRoute} from "./behaviour-selection.mjs";

// The keys the board rings: the ones that reach whatever row is picked in the
// open tab. A behaviour is found on the keys carrying it; anything a branch
// sends is found on the same keys, which is the whole point of saying so.
/** @param {Model} model */
export function reachHighlight(model) {
    const stack = layers(), at = state.layer;
    /** @param {Partial<ReturnType<typeof macroReach>> & {inView?: ReturnType<typeof reachInView>}} groups @param {string} picked */
    const found = (groups, picked) => {
        const [group, ...rest] = String(picked).split(":");
        const name = rest.join(":");
        return reachEntries(groups, group).find((entry) => String(entry.name) === name);
    };
    if (state.tab === "behaviours") return behaviourRouteKeys(model, stack, at, state.behaviourRow || "", behaviourRoute(), heldLayers());
    const picked = state.reachRow[/** @type {keyof typeof state.reachRow} */ (state.tab)];
    if (!picked) return [];
    if (state.tab === "combos") {
        if (picked.startsWith("view:")) {
            const entry = combosInView(model, stack, at, heldLayers()).find((row) => picked === `view:${row.combo.id}`);
            return entry?.keys.map((key) => key.position.layoutIndex) || [];
        }
        const groups = comboGroups(model, stack, at);
        const entry = [groups.onKeys, groups.throughKeys, groups.elsewhere].flat()
            .find((row) => picked.endsWith(`:${row.combo.id}`));
        return reachKeys(stack, at, entry);
    }
    if (state.tab === "macros") return reachKeys(stack, at, found(picked.startsWith("view:") ? {inView: macroView(model)} : macroReach(model, stack, at), picked),
        picked.startsWith("view:") ? heldLayers() : null);
    if (state.tab === "customKeys") return reachKeys(stack, at, found(picked.startsWith("view:") ? {inView: customKeyView(model)} : customKeyReach(model, stack, at), picked),
        picked.startsWith("view:") ? heldLayers() : null);
    if (state.tab === "pointing") return reachKeys(stack, at, found(picked.startsWith("view:") ? {inView: pointingView(model)} : pointingReach(model, stack, at), picked),
        picked.startsWith("view:") ? heldLayers() : null);
    return [];
}

// A tab's number counts what the selected layer stores, not the selected key
// position or actions reached only through transparent keys on lower layers.
/** @param {ReturnType<typeof macroReach>} reach */
export const storedCount = (reach) =>
    new Set([...reach.onKeys, ...reach.fromBranches, ...reach.fromCombos].map((entry) => entry.name)).size;
/** @param {Model} model */
export const macroView = (model) => reachInView(model, layers(), state.layer, heldLayers(), macroKeycodes);
/** @param {Model} model */
export const customKeyView = (model) => reachInView(model, layers(), state.layer, heldLayers(), customKeyKeycodes);
/** @param {Model} model */
export const pointingView = (model) => reachInView(model, layers(), state.layer, heldLayers(),
    (/** @type {string | undefined} */ keycode) => { const slot = pointingSlotFor(model, keycode); return slot ? [String(slot.id)] : []; });

// Where a reach came from, in the words of the thing that reaches it. A
// transparent key can be answered by more than one layer, so each is named —
// the default layer always answers, any other only while it is held too.
/** @param {{layer: import("../../../contracts/panel.js").Layer | null, whileHeld?: boolean}} entry */
export const sourceLabel = (entry) =>
    esc(layerName(entry.layer)) + (entry.whileHeld ? " when held" : "");

// The keys are named as the board names them; a combo's row already names
// its inputs, so it says only where they come from (reachText).
// A key whose own behaviour also reaches the row says which of its cells
// does, after its name (`branches`), rather than naming the key twice.
/** @param {(ReturnType<typeof resolvedPositions>[number] & {reference?: boolean})[]} keys @param {{names?: boolean, branches?: (keycode: string) => string}} [options] */
export const keysReach = (keys, {names = true, branches} = {}) => {
    const model = getModel();
    const named = names ? [...new Set(keys.map((entry) => keyNameMarked(model, keyName(entry.position), keyMeaning(entry.position))
        + (branches?.(keyMeaning(entry.position)) || "")))] : [];
    const sources = [...new Set(keys.filter((entry) => entry.fellThrough).map(sourceLabel))];
    const matched = [...new Set(keys.filter((entry) => entry.reference).map((entry) => esc(layerName(entry.layer))))];
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
export const branchReach = (model, entry, showSends = true) => entry.behaviours.map((row) => {
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
